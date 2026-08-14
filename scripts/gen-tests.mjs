// Offline exercise generator (never runs at runtime, needs no API key).
//
// Drives Claude via the authenticated `claude -p` CLI to write L1→L2
// translation tests per grammar topic, checks every L2 form against the
// reference dictionary.db, and freezes the result to
// languages/<pack>/content/tests/<id>.json.
//
// The language-specific half — the prompt, the function-word allowlist, the
// frequency band, how many tests a topic wants — lives in the pack's
// gen/config.mjs. Nothing about Latin is in this file.
//
// dictionary.db is incomplete, so a miss is not treated as proof of a bad
// form: a sentence may carry up to --allow-unverified distinct unmatched words
// — defaulting to the pack's own profile.attestation.maxMissesPerQuestion, the
// same bar the attestation gate holds shipped content to, and 0 for a pack that
// declares none — and every one is listed in a report at the end of the run.
//
//   node --import tsx scripts/gen-tests.mjs [--pack languages/latin]
//        [--fill] [--only-thin] [--target N] [--per M] [--sleep S]
//        [--jobs N] [topicId ...]
//
// Resuming is by COUNT, not by whether a file exists. A topic that yielded
// three tests against a target of twelve used to be skipped by every later run
// — permanently thin, and invisible unless someone counted. `--fill` tops up
// each topic to its size-scaled target and appends; `--only-thin` restricts
// that to the topics actually short. Both are safe to re-run.
//
// `--jobs` writes that many topics at once (2 by default, `--jobs 1` for the
// strictly serial run). Splitting a pack across several *processes* over
// disjoint topic lists still works and always did — `gen-stats.json` is
// appended under a lock for it — and the two compose.
//
// Needs `claude -p` and nothing else: attestation and the vocabulary band come
// from the pack's own content. Point --ref/$LANG_REF at the full reference
// databases to check against those instead.
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { plainText, words } from "@lang-tutor/core";
import { makeClassifier } from "./lib/attestation.mjs";
import { loadProfile, packDir } from "./lib/pack.mjs";
import { openReference } from "./lib/reference.mjs";
import { TARGET_DEFAULTS, targetFor } from "./lib/target.mjs";

// Node's own promisified form, which keeps `.child` on the returned promise —
// what lets the caller close the subprocess's stdin before awaiting it.
const execFile = promisify(execFileCb);

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const PLAN_ONLY = args.includes("--plan");
const FILL = args.includes("--fill") || args.includes("--only-thin");
const ONLY_THIN = args.includes("--only-thin");
for (const flag of ["--fill", "--only-thin", "--plan"]) {
  const i = args.indexOf(flag);
  if (i >= 0) args.splice(i, 1);
}

const PACK = opt("--pack", packDir(process.argv.slice(2)));
const profile = loadProfile(PACK);
const config = (await import(pathToFileURL(join(PACK, "gen", "config.mjs")).href)).default;
const ref = openReference(PACK, profile, process.argv.slice(2));
const OUT = join(PACK, "content", "tests");
const STATS = join(PACK, "content", "gen-stats.json");
const MODEL = config.model;
const QUESTIONS = config.questionsPerTest;

// A flat target is what makes coverage uneven: a note on the locative and a
// treatment of conditional sentences are not the same amount of grammar.
const TARGET_OVERRIDE = args.indexOf("--target") >= 0 ? Number(opt("--target", 12)) : null;
const targetOf = (topic) => TARGET_OVERRIDE ?? targetFor(topic, profile, config);
const PER_CALL = Number(opt("--per", 6));
// The ceiling on calls per topic has to clear the pack's own biggest target,
// or the largest topics can never reach it. A flat 4 did not: the deficit
// formula below asks for `ceil(25/6) + 1 = 5` calls to write a 25-test topic
// and this clipped it to 4, which buys exactly 24 tests. Three topics in the
// last run stopped one short for that reason, and `--fill` could not rescue
// them — a re-run computes the same budget and clips it the same way, so the
// deficit of 1 was permanent and invisible. Derive it instead.
const BIGGEST_TARGET = Math.max(
  TARGET_OVERRIDE ?? 0,
  config.target?.maxTests ?? TARGET_DEFAULTS.maxTests,
);
const MAX_CALLS = Number(
  opt("--max", Math.ceil(BIGGEST_TARGET / PER_CALL) + 1),
);
const SLEEP_MS = Number(opt("--sleep", 1500)); // pace calls to respect usage limits
/*
 * How many topics are written at once.
 *
 * A topic is the unit that parallelises cleanly and the only one that does:
 * it owns its own output file, its own call budget and its own set of prompts
 * to avoid, so two of them in flight share nothing that has to be kept in
 * step. Within a topic the calls stay strictly in sequence — each one is told
 * the prompts the last one produced, and that is what stops a topic from
 * being asked to write the same sentence twice.
 *
 * Two rather than one because a call is minutes of waiting on a subprocess and
 * none of it is this program's work; two rather than eight because the ceiling
 * here is the `claude -p` usage limit, which the whole backoff ladder below
 * exists to stay under. `--jobs 1` is the strictly serial run this used to be,
 * and is what to reach for when a limit is already being felt.
 */
const JOBS = Math.max(1, Number(opt("--jobs", 2)));
/*
 * How many dictionary misses one sentence may carry before it is dropped.
 *
 * From the profile, not from gen/config, because it is the same number
 * `attestation-report.mjs`'s E1 gate holds shipped content to. Two copies would
 * let generation write what validation then refuses, or — the quieter failure —
 * let generation refuse what validation would have accepted. A pack that
 * declares nothing gets 0: a language added later has nothing to excuse yet.
 */
const ALLOW_UNVERIFIED = Number(
  opt("--allow-unverified", profile.attestation?.maxMissesPerQuestion ?? 0),
);
const onlyTopics = args;

/*
 * The rule for "is this form real" comes from `scripts/lib/attestation.mjs`,
 * not from a copy of it here. `attestation-report.mjs` asks the same question
 * of what is already on disk, and the two verdicts have to be the same verdict:
 * a checker stricter than this one condemns sentences this one was right to
 * keep, and a laxer one waves through what this would have caught. It is the
 * argument the fold below already makes, applied to the rest of the rule.
 *
 * The reference is authoritative when it answers, but neither backend is
 * complete, so a miss is not proof of a bad form — `validate` caps how many a
 * single sentence may carry rather than dropping it on sight.
 */
const { classify, fold } = makeClassifier({ profile, config, ref });
/** Every form the dictionary could not confirm, for the end-of-run report. */
const unverified = new Map();

// Sample richer vocabulary (intermediate/advanced bands) to seed variety.
// The printed headword, not the folded key: this goes into a prompt, and a
// Greek lemma stripped of its accents and breathings is no use to the model.
const richLemmas = ref.band(config.band).map((r) => r.lemma);
function vocabHint(k = 20) {
  const pick = [];
  for (let i = 0; i < k; i++) pick.push(richLemmas[Math.floor(Math.random() * richLemmas.length)]);
  return [...new Set(pick)].join(", ");
}

const RULES = config.rules;

/*
 * Awaited rather than synchronous, which is the whole of what makes `--jobs`
 * possible. `execFileSync` blocks the event loop for the length of the call,
 * so the `async` in every function below this one bought nothing: a second
 * topic could not have started even if something had asked it to.
 */
async function callClaude(prompt) {
  let out;
  try {
    const call = execFile(
      "claude",
      // `--tools ""` denies the subprocess every tool. `claude -p` is an agent,
      // not a completion: asked for a JSON object it may instead pick up Write
      // and put the file on disk itself, then answer in prose. The generator
      // sees "no JSON in result" and reports +0 tests while a full file lands
      // anyway — skipping validate(), which is where attestation, the
      // duplicate-prompt check and id assignment live. That happened to
      // sm-574 and sm-599 in the run before this flag existed. Writing
      // sentences needs no tools, so the fix is to have none to reach for.
      ["-p", prompt, "--model", MODEL, "--output-format", "json", "--tools", ""],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    // What `stdio: ["ignore", ...]` used to say, and it has to go on being
    // said: `execFile` hands the child a stdin pipe nobody ever writes to, and
    // a CLI that reads stdin when it is not a terminal would wait on it for
    // ever. Closed at once, the child sees the empty input it saw before.
    call.child.stdin?.end();
    ({ stdout: out } = await call);
  } catch (e) {
    // `claude -p` exits non-zero AND prints its JSON envelope, so a usage-limit
    // rejection lands here, not in the is_error branch below. Such a rejection
    // never reaches the API: duration_api_ms is 0 and no tokens are billed —
    // the reliable signal, since the message text itself may be absent.
    const raw = (e.stderr || e.stdout || e.message || "").toString();
    const err = new Error(raw.replace(/\s+/g, " ").slice(0, 200) || "claude -p failed");
    err.transient =
      /limit|quota|overload|rate|capacity|try again|busy|503|429/i.test(raw) ||
      (/"duration_api_ms"\s*:\s*0\b/.test(raw) && /"is_error"\s*:\s*true/.test(raw));
    throw err;
  }
  const envelope = JSON.parse(out);
  // `claude -p` reports failures in-band with exit code 0; surface the real
  // message instead of the (truncated) JSON envelope.
  if (envelope.is_error) {
    const err = new Error(String(envelope.result ?? "unknown claude -p error").slice(0, 300));
    err.transient = /limit|quota|overload|rate|capacity|try again|busy|503|429/i.test(
      String(envelope.result ?? ""),
    ) || envelope.duration_api_ms === 0;
    throw err;
  }
  let text = (envelope.result ?? "").trim();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON in result");
  return JSON.parse(text.slice(s, e + 1)).tests ?? [];
}

/** A prompt reduced to what makes it the same question asked twice. */
function promptKey(prompt) {
  return String(prompt).toLowerCase().replace(/[^\p{Letter}\s]/gu, "").trim();
}

function validate(topicId, rawTest, index, stats, seenPrompts) {
  const questions = [];
  for (const q of rawTest.questions ?? []) {
    if (!q.prompt || !q.answer) { stats.rejected.noPrompt++; continue; }
    /*
     * U+FFFD is not a form the reference happens not to hold. It is a character
     * that did not survive the trip out of `claude -p`, and the word it lands
     * in the middle of is not a word of the language at all.
     *
     * Four reached the shipped Greek pack before this check existed — `μ<FFFD>ὴ`
     * three times and `<FFFD>υπὸ` once — and none of them was caught, because a
     * single mangled token is exactly one dictionary miss and the allowance is
     * two. So the sentence sailed through validation and a student was shown a
     * replacement character as though it were the lesson. Attestation is the
     * wrong instrument here: this is not a form to be believed or doubted on a
     * budget, it is damage. Nothing legitimate carries one, so the item goes.
     */
    if (/�/.test(q.prompt) || /�/.test(q.answer)) { stats.rejected.mojibake++; continue; }
    if (seenPrompts.has(promptKey(q.prompt))) { stats.rejected.duplicate++; continue; }
    const vocab = (q.vocab ?? []).flatMap((v) => String(v).split(/\s+/)).filter(Boolean);
    if (vocab.length === 0) { stats.rejected.noVocab++; continue; }
    /*
     * Checked against the answer's own words, not against `vocab`.
     *
     * `vocab` is the model's account of what it wrote, and a model that invents
     * a form has every reason to leave it off the list — so validating the
     * account rather than the sentence let an unattested form through whenever
     * the model simply did not mention it. `words()` is the same cut of a
     * sentence the app makes when it builds the vocabulary crib, so what is
     * checked here is exactly what a student is later shown.
     *
     * `vocab` is still what gets written: `build-web-content.mjs` drops it and
     * the runtime re-derives from the answer, so it is a generation-time record
     * and not worth reshaping here.
     */
    const answerWords = words(String(q.answer));
    const firstWord = answerWords[0] ?? "";
    // A couple of dictionary misses in a sentence is normal — the reference is
    // incomplete. Many misses in one sentence is the signature of invented
    // Latin, so the item still goes.
    //
    // Distinct forms, not tokens: a sentence that repeats one unconfirmed word
    // is one thing unconfirmed, and charging it per occurrence would fail an
    // asyndeton for being an asyndeton. This is what counting `vocab` always
    // amounted to, since the model is asked for each *distinct* form.
    const missed = new Set();
    for (const w of answerWords) {
      const { verdict, form } = classify(w, firstWord);
      if (verdict === "ok") continue;
      unverified.set(form, (unverified.get(form) ?? 0) + 1);
      missed.add(fold(form));
    }
    if (missed.size > ALLOW_UNVERIFIED) { stats.rejected.tooManyMisses++; continue; }
    questions.push({ prompt: q.prompt, answer: q.answer, kind: config.kind, vocab });
  }
  // keep only well-formed tests
  if (questions.length < config.minQuestionsPerTest) { stats.rejected.shortTest++; return null; }
  return { id: `${topicId}-t${index}`, sectionId: topicId, questions: questions.slice(0, QUESTIONS) };
}

function topicPrompt(topic, n, avoid) {
  return `${RULES.replace("{{VOCAB}}", vocabHint())}

Grammar point — ${profile.grammar.refPrefix}${topic.ref} ${topic.title}:
"""
${plainText(topic.text)}
"""

Write ${n} DISTINCT tests, each with exactly ${QUESTIONS} ${profile.l1.name}→${profile.l2.name} sentences, all exercising this grammar point. Make the tests differ from one another in vocabulary and structure.${
    avoid.length ? `\nDo not reuse these earlier ${profile.l1.name} prompts:\n- ${avoid.slice(-24).join("\n- ")}` : ""
  }`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits between retries after a transient failure (usage limits, overload). */
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

async function generateTopic(topic, want, alreadyWritten = [], startIndex = 0) {
  const tests = [];
  const avoid = [...alreadyWritten];
  const stats = {
    calls: 0, rawQ: 0, keptQ: 0, retries: 0,
    rejected: { noPrompt: 0, mojibake: 0, noVocab: 0, tooManyMisses: 0, duplicate: 0, shortTest: 0 },
  };
  // A prompt already on disk for this topic must not come back a second time.
  const seenPrompts = new Set(alreadyWritten.map(promptKey));
  let c = 0;
  // Calls scale with the deficit: topping a topic up by two tests should not
  // cost the same four calls as writing it from nothing.
  const maxCalls = Math.max(2, Math.min(MAX_CALLS, Math.ceil(want / PER_CALL) + 1));
  while (c < maxCalls && tests.length < want) {
    stats.calls++;
    let raw;
    try {
      raw = await callClaude(topicPrompt(topic, Math.min(PER_CALL, want - tests.length + 1), avoid));
    } catch (e) {
      const msg = String(e.message).split("\n")[0];
      // A transient failure must not spend the topic's call budget — otherwise
      // one rate-limit window silently abandons every remaining topic.
      if (e.transient && stats.retries < BACKOFF_MS.length) {
        const wait = BACKOFF_MS[stats.retries++];
        console.error(`  transient (${msg}) — retry ${stats.retries} in ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      if (e.transient) stats.transient = true;
      console.error(`  call ${c + 1} error: ${msg}`);
      c++;
      await sleep(SLEEP_MS * 4);
      continue;
    }
    c++;
    for (const rt of raw) {
      stats.rawQ += (rt.questions ?? []).length;
      const v = validate(topic.id, rt, startIndex + tests.length + 1, stats, seenPrompts);
      if (v) {
        stats.keptQ += v.questions.length;
        tests.push(v);
        for (const q of v.questions) seenPrompts.add(promptKey(q.prompt));
        avoid.push(v.questions[0].prompt);
      }
    }
    // One line rewritten in place only makes sense while one topic is being
    // written: two jobs would each be erasing the other's progress. With more
    // than one, the per-topic line printed on completion is the whole report.
    if (JOBS === 1) {
      process.stdout.write(`  ${topic.id}: ${tests.length}/${want} tests (call ${stats.calls})\r`);
    }
    await sleep(SLEEP_MS);
  }
  return { tests, stats };
}

// ---- main -----------------------------------------------------------------
/*
 * The syllabus, not the whole book.
 *
 * A pack ships every section of its source — sounds, word formation, prosody —
 * because what a student cannot reach they can never read. Those pages are
 * marked `readingOnly` and are exactly the ones no English->Latin translation
 * can be written for, which is why they were marked. Without this filter a
 * `--fill` run would queue a hundred and eighty of them and write exercises on
 * the dactylic hexameter.
 */
const grammar = JSON.parse(
  readFileSync(`${PACK}/content/grammar.json`, "utf8"),
).filter((t) => !t.readingOnly);
mkdirSync(OUT, { recursive: true });

/** The tests already on disk for a topic, or [] if it has none. */
function existing(topicId) {
  const path = `${OUT}/${topicId}.json`;
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

/**
 * What still has to be written, and how much of it.
 *
 * Resuming by "does a file exist" is what let a topic stall at three tests
 * forever. The deficit is against the topic's own size-scaled target, so a
 * re-run converges instead of freezing the first partial result.
 */
const work = [];
for (const topic of grammar) {
  const have = existing(topic.id);
  const target = targetOf(topic);
  if (onlyTopics.length) {
    // Named explicitly: regenerate from scratch unless filling.
    if (onlyTopics.includes(topic.id)) {
      work.push({ topic, have: FILL ? have : [], want: FILL ? target - have.length : target });
    }
    continue;
  }
  if (FILL) {
    const deficit = target - have.length;
    // `--only-thin` means below the *floor*, not merely below the target: it is
    // what the coverage report points at when C2 is red, and the whole point is
    // that it selects less work than `--fill`. The trailing `|| deficit > 0`
    // this used to carry was already implied by the outer test, so the two
    // flags picked the same topics and the restriction never bit.
    if (deficit > 0 && (!ONLY_THIN || have.length < profile.coverage.minTestsPerTopic)) {
      work.push({ topic, have, want: deficit });
    }
  } else if (have.length === 0) {
    work.push({ topic, have: [], want: target });
  }
}

if (!work.length) {
  console.log("Nothing to do: every topic is at or above its target.");
  process.exit(0);
}
console.log(
  `${work.length} topics to write (${work.reduce((n, w) => n + w.want, 0)} tests):\n` +
  work.slice(0, 12).map((w) => `  ${w.topic.id.padEnd(46)} ${w.have.length} -> ${w.have.length + w.want}`).join("\n") +
  (work.length > 12 ? `\n  … and ${work.length - 12} more` : ""),
);

// `--plan` answers "what would this run do" without spending a single call,
// which is the question worth asking before starting a long generation.
if (PLAN_ONLY) {
  const tests = work.reduce((n, w) => n + w.want, 0);
  console.log(
    `\n--plan: ${work.length} topics, ${tests} tests (~${tests * QUESTIONS} questions) would be generated.`,
  );
  process.exit(0);
}

const run = {
  pack: profile.id,
  topics: 0, calls: 0, rawQuestions: 0, keptQuestions: 0,
  rejected: { noPrompt: 0, mojibake: 0, noVocab: 0, tooManyMisses: 0, duplicate: 0, shortTest: 0 },
  unverifiedForms: {},
};

let totT = 0, totQ = 0, totRaw = 0, dryRun = 0;
/*
 * The queue the jobs draw from, and the two things they share.
 *
 * `taken` is the cursor, so no topic is written twice and "how many are left"
 * stays answerable after the order stops being the book's. `stopped` is the
 * usage-limit brake: a job that sees it raised finishes the topic it is on and
 * takes no more, which is what makes stopping mean "spend nothing further"
 * rather than "abandon a topic mid-write and lose its calls".
 *
 * Nothing else needs guarding. Everything a topic touches is its own — its
 * file, its call budget, the prompts it must not repeat — and the counters
 * below are read and written between awaits, never across one, so the single
 * thread does the work a lock would.
 */
let taken = 0, stopped = false;
async function worker() {
  while (!stopped && taken < work.length) {
    const { topic, have, want } = work[taken++];
    const t0 = Date.now();
    // Prompts already written for this topic: the model is told not to repeat
    // them, and `validate` drops any that come back anyway.
    const already = have.flatMap((t) => t.questions.map((q) => q.prompt));
    const { tests, stats } = await generateTopic(topic, want, already, have.length);
    run.topics++;
    run.calls += stats.calls;
    run.rawQuestions += stats.rawQ;
    run.keptQuestions += stats.keptQ;
    for (const [k, v] of Object.entries(stats.rejected)) run.rejected[k] += v;

    // Once the backoff ladder is exhausted the usage window is longer than this
    // run can wait out. Stop rather than march through the remaining topics
    // producing nothing — a later run resumes from the files already on disk.
    //
    // Two jobs going dry in the same window both count, and should: what the
    // number is measuring is a limit that outlasts the ladder, and two topics
    // meeting it at once is better evidence of that than two meeting it in a
    // row. "Consecutive" is per queue rather than per job for the same reason
    // — the run is one run.
    if (tests.length === 0 && stats.transient) {
      // `!stopped` so the brake is announced once. The other job is already on
      // a topic when it goes on, and that topic ends dry too — without this it
      // reports the same stop a second time with a different count.
      if (++dryRun >= 2 && !stopped) {
        stopped = true;
        console.error(
          `\nStopping: ${dryRun} topics blocked by usage limits after ` +
          `${BACKOFF_MS.length} retries. ${work.length - taken} topics ` +
          `left — rerun this command when the limit resets and it will pick up where it stopped.`,
        );
      }
    } else if (tests.length > 0) {
      dryRun = 0;
    }
    // Append rather than overwrite: what is already on disk was validated the
    // same way and hand-reviewed, and throwing it away to re-earn it is waste.
    if (tests.length > 0) {
      writeFileSync(`${OUT}/${topic.id}.json`, JSON.stringify([...have, ...tests], null, 1));
    }
    const q = tests.reduce((n, t) => n + t.questions.length, 0);
    totT += tests.length; totQ += q; totRaw += stats.rawQ;
    console.log(
      // The newline is what lifts this clear of the in-place progress line;
      // with no such line to clear it is just a blank between every topic.
      `${JOBS === 1 ? "\n" : ""}${topic.id.padEnd(22)} +${String(tests.length).padStart(2)} tests / ${String(q).padStart(3)} q  ` +
      `(now ${have.length + tests.length}/${have.length + want} · kept ${stats.keptQ}/${stats.rawQ} items · ` +
      `${stats.calls} calls · ${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
  }
}

// More jobs than topics would be idle processes, not faster ones.
await Promise.all(
  Array.from({ length: Math.min(JOBS, work.length) }, () => worker()),
);

if (unverified.size) {
  const top = [...unverified.entries()].sort((a, b) => b[1] - a[1]);
  const total = top.reduce((n, [, c]) => n + c, 0);
  for (const [w, c] of top) run.unverifiedForms[w] = c;
  console.log(
    `\n${unverified.size} distinct forms (${total} uses) were accepted without a ` +
    `dictionary match; most frequent first:`,
  );
  console.log("  " + top.slice(0, 40).map(([w, c]) => `${w}(${c})`).join(" "));
}

// The rejection rate is the signal that the prompt is fighting the validator,
// and it used to exist only as console output that scrolled away. Keep it:
// `coverage-report.mjs` gate C6 reads this file.
//
// Appended under a lock, because a big pack is generated by several runs at
// once over disjoint topic lists. Read-modify-write from eight processes that
// finish within seconds of each other keeps whichever wrote last and silently
// drops the rest, and a read landing mid-write parses a truncated file and
// throws away a finished run's record at the very end of it.
appendRun(STATS, run);

function appendRun(path, record) {
  const lock = `${path}.lock`;
  for (let attempt = 0; attempt < 200; attempt++) {
    let fd;
    try {
      // wx is the atomic part: exactly one process creates the file.
      fd = openSync(lock, "wx");
    } catch {
      // Someone else is writing. Sleep without spinning — eight runs finish
      // within seconds of each other and burning a core each to wait would be
      // the slowest part of the whole thing.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      continue;
    }
    try {
      const history = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
      history.push(record);
      writeFileSync(path, JSON.stringify(history, null, 1));
      return;
    } finally {
      closeSync(fd);
      rmSync(lock, { force: true });
    }
  }
  // A stale lock from a killed run must not cost this one its record.
  console.warn(`could not take ${lock}; writing ${path} unlocked`);
  const history = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  history.push(record);
  writeFileSync(path, JSON.stringify(history, null, 1));
}

const rate = totRaw ? ((totQ / totRaw) * 100).toFixed(1) : "—";
console.log(
  `\nDone: ${run.topics} topics · ${totT} tests · ${totQ} questions · ` +
  `validation kept ${rate}% of generated items.\n` +
  `Run \`node --import tsx scripts/coverage-report.mjs --pack ${PACK}\` to check the gates.`,
);
