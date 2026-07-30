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
// form: a sentence may carry up to --allow-unverified (default 2) unmatched
// words, and every one is listed in a report at the end of the run.
//
//   node --import tsx scripts/gen-tests.mjs [--pack languages/latin]
//        [--fill] [--only-thin] [--target N] [--per M] [--sleep S] [topicId ...]
//
// Resuming is by COUNT, not by whether a file exists. A topic that yielded
// three tests against a target of twelve used to be skipped by every later run
// — permanently thin, and invisible unless someone counted. `--fill` tops up
// each topic to its size-scaled target and appends; `--only-thin` restricts
// that to the topics actually short. Both are safe to re-run.
//
// Needs the reference project alongside this one for dictionary.db and
// frequencies.db; override with LANG_REF=/path/to/languages/<pack>.
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileFold, plainText } from "@lang-tutor/core";
import { loadProfile, packDir, refDir } from "./lib/pack.mjs";
import { targetFor } from "./lib/target.mjs";

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
const REF = opt("--ref", refDir(profile, process.argv.slice(2)));
const OUT = join(PACK, "content", "tests");
const STATS = join(PACK, "content", "gen-stats.json");
const MODEL = config.model;
const QUESTIONS = config.questionsPerTest;

// A flat target is what makes coverage uneven: a note on the locative and a
// treatment of conditional sentences are not the same amount of grammar.
const TARGET_OVERRIDE = args.indexOf("--target") >= 0 ? Number(opt("--target", 12)) : null;
const targetOf = (topic) => TARGET_OVERRIDE ?? targetFor(topic, profile, config);
const PER_CALL = Number(opt("--per", 6));
const MAX_CALLS = Number(opt("--max", 4));
const SLEEP_MS = Number(opt("--sleep", 1500)); // pace calls to respect usage limits
// How many dictionary misses one sentence may carry before it is dropped.
const ALLOW_UNVERIFIED = Number(opt("--allow-unverified", config.allowUnverified));
const onlyTopics = args;

const dict = new DatabaseSync(`${REF}/dictionary.db`, { readOnly: true });
const freq = new DatabaseSync(`${REF}/frequencies.db`, { readOnly: true });
const formExists = dict.prepare("select 1 from forms where form_norm = ? limit 1");
// The pack's own fold, not a copy of it: `dictionary.db.form_norm` was written
// with this fold, so a second implementation drifting from it would silently
// turn every lookup below into a miss and reject correct sentences.
const normalize = compileFold(profile.fold);

/**
 * The pack's indeclinable function words, verified absent from its
 * dictionary.db (see its gen/config.mjs for why the list has to exist).
 */
const FUNCTION_WORDS = new Set(config.functionWords.map(normalize));
/** Every form the dictionary could not confirm, for the end-of-run report. */
const unverified = new Map();

/**
 * Classify one form: "ok" (confirmed, or a known indeclinable, or a
 * mid-sentence proper noun) or "unverified".
 *
 * dictionary.db is authoritative when it answers, but it demonstrably has
 * holes — it is built around inflected forms and lacks 47 of the commonest
 * indeclinables outright — so treating a miss as proof of a bad form throws
 * away correct Latin. Misses are counted rather than fatal; `validate` caps
 * how many a single sentence may carry.
 */
function classify(raw, firstWord) {
  const w = raw.replace(/^[-]/, "").replace(/[.,;:!?"'()]/g, "").trim();
  if (!w) return "ok";
  const n = normalize(w);
  if (FUNCTION_WORDS.has(n)) return "ok";
  if (formExists.get(n)) return "ok";
  // A mid-sentence capital is a proper noun; the first word is capitalised by
  // position, so it earns no such pass. Exempting every capital would wave
  // through the first word of every answer, which is the whole failure this
  // guards against. A script with no letter case turns the rule off.
  if (
    config.properNounExemption === "mid-sentence-capital" &&
    w !== w.toLowerCase() &&
    normalize(w) !== normalize(firstWord ?? "")
  ) {
    return "ok";
  }
  unverified.set(w, (unverified.get(w) ?? 0) + 1);
  return "unverified";
}

// Sample richer vocabulary (intermediate/advanced bands) to seed variety.
const richLemmas = freq
  .prepare(
    `select lemma from frequency where rank between ? and ? and pos in (${config.band.pos.map(() => "?").join(",")}) order by rank`,
  )
  .all(config.band.min, config.band.max, ...config.band.pos)
  .map((r) => r.lemma);
function vocabHint(k = 20) {
  const pick = [];
  for (let i = 0; i < k; i++) pick.push(richLemmas[Math.floor(Math.random() * richLemmas.length)]);
  return [...new Set(pick)].join(", ");
}

const RULES = config.rules;

function callClaude(prompt) {
  let out;
  try {
    out = execFileSync(
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
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
    );
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
    if (seenPrompts.has(promptKey(q.prompt))) { stats.rejected.duplicate++; continue; }
    const vocab = (q.vocab ?? []).flatMap((v) => String(v).split(/\s+/)).filter(Boolean);
    if (vocab.length === 0) { stats.rejected.noVocab++; continue; }
    const firstWord = String(q.answer).trim().split(/\s+/)[0] ?? "";
    // A couple of dictionary misses in a sentence is normal — the reference is
    // incomplete. Many misses in one sentence is the signature of invented
    // Latin, so the item still goes.
    const misses = vocab.filter((v) => classify(v, firstWord) === "unverified").length;
    if (misses > ALLOW_UNVERIFIED) { stats.rejected.tooManyMisses++; continue; }
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
    rejected: { noPrompt: 0, noVocab: 0, tooManyMisses: 0, duplicate: 0, shortTest: 0 },
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
      raw = callClaude(topicPrompt(topic, Math.min(PER_CALL, want - tests.length + 1), avoid));
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
    process.stdout.write(`  ${topic.id}: ${tests.length}/${want} tests (call ${stats.calls})\r`);
    await sleep(SLEEP_MS);
  }
  return { tests, stats };
}

// ---- main -----------------------------------------------------------------
const grammar = JSON.parse(readFileSync(`${PACK}/content/grammar.json`, "utf8"));
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
    if (deficit > 0 && (!ONLY_THIN || have.length < profile.coverage.minTestsPerTopic || deficit > 0)) {
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
  rejected: { noPrompt: 0, noVocab: 0, tooManyMisses: 0, duplicate: 0, shortTest: 0 },
  unverifiedForms: {},
};

let totT = 0, totQ = 0, totRaw = 0, dryRun = 0;
for (const { topic, have, want } of work) {
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
  if (tests.length === 0 && stats.transient) {
    if (++dryRun >= 2) {
      console.error(
        `\nStopping: ${dryRun} consecutive topics blocked by usage limits after ` +
        `${BACKOFF_MS.length} retries. ${work.length - work.findIndex((w) => w.topic === topic) - 1} topics ` +
        `left — rerun this command when the limit resets and it will pick up where it stopped.`,
      );
      break;
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
    `\n${topic.id.padEnd(22)} +${String(tests.length).padStart(2)} tests / ${String(q).padStart(3)} q  ` +
    `(now ${have.length + tests.length}/${have.length + want} · kept ${stats.keptQ}/${stats.rawQ} items · ` +
    `${stats.calls} calls · ${((Date.now() - t0) / 1000).toFixed(0)}s)`,
  );
}

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
