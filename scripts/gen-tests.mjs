// Offline exercise generator (never runs at runtime, needs no API key).
// Drives Claude via the authenticated `claude -p` CLI to write English→Latin
// translation tests per grammar topic, checks the Latin against the reference
// dictionary.db, and freezes the result to content/tests/<id>.json.
//
// dictionary.db is incomplete, so a miss is not treated as proof of a bad
// form: a sentence may carry up to --allow-unverified (default 2) unmatched
// words, and every one is listed in a report at the end of the run.
//
//   node scripts/gen-tests.mjs [--target N] [--per M] [--sleep S] [topicId ...]
//
// Topics that already have a file are skipped, so rerunning always resumes.
// Needs the reference project alongside this one for dictionary.db and
// frequencies.db; override with LATIN_REF=/path/to/languages/latin.
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const REF =
  process.env.LATIN_REF ??
  join(REPO, "..", "language_learning", "languages", "latin");
const PACK = `${REPO}/languages/${process.env.LANG_PACK ?? "latin"}`;
const OUT = `${PACK}/content/tests`;
const MODEL = "claude-opus-4-8";
const QUESTIONS = 4; // exactly 4 English→Latin sentences per test

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const TARGET = Number(opt("--target", 12));
const PER_CALL = Number(opt("--per", 6));
const MAX_CALLS = Number(opt("--max", 4));
const SLEEP_MS = Number(opt("--sleep", 1500)); // pace calls to respect usage limits
// How many dictionary misses one sentence may carry before it is dropped.
const ALLOW_UNVERIFIED = Number(opt("--allow-unverified", 2));
const onlyTopics = args;

const dict = new DatabaseSync(`${REF}/dictionary.db`, { readOnly: true });
const freq = new DatabaseSync(`${REF}/frequencies.db`, { readOnly: true });
const formExists = dict.prepare("select 1 from forms where form_norm = ? limit 1");
const normalize = (w) =>
  w.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/j/g, "i").replace(/v/g, "u");

/**
 * Indeclinable function words — prepositions, conjunctions, particles, adverbs.
 *
 * `dictionary.db` is a Wiktionary dump built around *inflected* forms, and it
 * simply has no `forms` row for most indeclinables: 47 of the commonest are
 * absent, `utinam`, `antequam`, `priusquam`, `quoad`, `inter` and `invicem`
 * among them. Since a test is dropped when any one of its words fails, a topic
 * defined by such a word loses everything — optative subjunctive, temporal
 * clauses and reciprocal pronouns each scored a literal 0 out of 72 before this
 * list was extended.
 *
 * Every entry below was verified absent from dictionary.db. This whitelists
 * indeclinables only; inflected forms are still checked, which is the point.
 */
const FUNCTION_WORDS = new Set(
  [
    // prepositions
    "a","ab","ad","ante","apud","circum","contra","coram","cum","de","e","ex",
    "extra","in","infra","inter","intra","ob","per","post","prae","praeter",
    "pro","prope","propter","sine","sub","super","supra","trans","ultra",
    // coordinating conjunctions and connectives
    "ac","atque","aut","autem","enim","ergo","et","etiam","igitur","itaque",
    "nam","namque","nec","neque","nisi","quia","quod","quoniam","sed","seu",
    "sive","tamen","vel","verum","-que","que","-ne",
    // subordinators
    "antequam","priusquam","postquam","dum","donec","quoad","simulac","ubi",
    "ut","uti","quin","quominus","quasi","tamquam","velut","ne","si","nedum",
    // particles and common adverbs
    "an","cur","haud","ita","iam","modo","non","num","nunc","quam","quidem",
    "quoque","saepe","semper","sic","tam","tandem","tum","tunc","unde",
    "utinam","vix","invicem","vicissim","mutuo","dumtaxat",
    // the copula, which appears constantly
    "est","sunt",
  ].map(normalize),
);
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
  // position, so it earns no such pass.
  if (/^[A-Z]/.test(w) && normalize(w) !== normalize(firstWord ?? "")) return "ok";
  unverified.set(w, (unverified.get(w) ?? 0) + 1);
  return "unverified";
}

// Sample richer vocabulary (intermediate/advanced bands) to seed variety.
const richLemmas = freq
  .prepare(
    "select lemma from frequency where rank between 400 and 6000 and pos in ('noun','verb','adj') order by rank",
  )
  .all()
  .map((r) => r.lemma);
function vocabHint(k = 20) {
  const pick = [];
  for (let i = 0; i < k; i++) pick.push(richLemmas[Math.floor(Math.random() * richLemmas.length)]);
  return [...new Set(pick)].join(", ");
}

const RULES = `You write Latin practice items for a spaced-repetition tutor. Each item is an English sentence the student translates INTO Latin; the student writes their Latin, then compares it with your reference answer and self-grades. So every item needs ONE clear, correct Latin translation.

Rules:
- EVERY question is an English→Latin translation. Never Latin→English, never fill-in-the-blank, never a parsing drill.
- Make the sentences genuinely interesting and non-trivial: use subordinate clauses, participles, ablative phrases, adjectives, and varied word order where the grammar point allows — pitch them at an intermediate/advanced learner, not a first-week beginner. Length ~6–14 words.
- Each sentence must clearly exercise the SPECIFIC grammar point below, but may combine it with other grammar the learner already knows.
- Use rich, varied classical vocabulary — do NOT keep reusing puella/rosa/nauta/servus. Draw on words like these (and others you know): {{VOCAB}}. Vary vocabulary across the whole set.
- "prompt" = the English sentence. "answer" = a correct classical Latin translation, with macrons on all long vowels.
- "vocab" = EVERY distinct inflected Latin WORD FORM in your Latin answer, exactly as written with macrons — these are checked against a dictionary, so never invent forms.
Output ONLY a JSON object, no markdown fences, no commentary:
{"tests":[{"questions":[{"prompt":"<English>","answer":"<Latin>","vocab":["..."]}]}]}`;

function callClaude(prompt) {
  let out;
  try {
    out = execFileSync(
      "claude",
      ["-p", prompt, "--model", MODEL, "--output-format", "json"],
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

function validate(topicId, rawTest, index) {
  const questions = [];
  for (const q of rawTest.questions ?? []) {
    if (!q.prompt || !q.answer) continue;
    const vocab = (q.vocab ?? []).flatMap((v) => String(v).split(/\s+/)).filter(Boolean);
    if (vocab.length === 0) continue;
    const firstWord = String(q.answer).trim().split(/\s+/)[0] ?? "";
    // A couple of dictionary misses in a sentence is normal — the reference is
    // incomplete. Many misses in one sentence is the signature of invented
    // Latin, so the item still goes.
    const misses = vocab.filter((v) => classify(v, firstWord) === "unverified").length;
    if (misses > ALLOW_UNVERIFIED) continue;
    questions.push({ prompt: q.prompt, answer: q.answer, kind: "translate-en-la", vocab });
  }
  // keep only well-formed tests of ~4 questions
  if (questions.length < 3) return null;
  return { id: `${topicId}-t${index}`, sectionId: topicId, questions: questions.slice(0, QUESTIONS) };
}

function topicPrompt(topic, n, avoid) {
  return `${RULES.replace("{{VOCAB}}", vocabHint())}

Grammar point — § ${topic.ref} ${topic.title}:
"""
${topic.text}
"""

Write ${n} DISTINCT tests, each with exactly ${QUESTIONS} English→Latin sentences, all exercising this grammar point. Make the tests differ from one another in vocabulary and structure.${
    avoid.length ? `\nDo not reuse these earlier English prompts:\n- ${avoid.slice(-24).join("\n- ")}` : ""
  }`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits between retries after a transient failure (usage limits, overload). */
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

async function generateTopic(topic) {
  const tests = [];
  const avoid = [];
  const stats = { calls: 0, rawQ: 0, keptQ: 0, retries: 0 };
  let c = 0;
  while (c < MAX_CALLS && tests.length < TARGET) {
    stats.calls++;
    let raw;
    try {
      raw = callClaude(topicPrompt(topic, Math.min(PER_CALL, TARGET - tests.length + 1), avoid));
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
      const v = validate(topic.id, rt, tests.length + 1);
      if (v) {
        stats.keptQ += v.questions.length;
        tests.push(v);
        avoid.push(v.questions[0].prompt);
      }
    }
    process.stdout.write(`  ${topic.id}: ${tests.length}/${TARGET} tests (call ${stats.calls})\r`);
    await sleep(SLEEP_MS);
  }
  return { tests, stats };
}

// ---- main -----------------------------------------------------------------
const grammar = JSON.parse(readFileSync(`${PACK}/content/grammar.json`, "utf8"));
// Explicit ids regenerate those; otherwise fill in only topics that lack a file.
const topics = onlyTopics.length
  ? grammar.filter((t) => onlyTopics.includes(t.id))
  : grammar.filter((t) => !existsSync(`${OUT}/${t.id}.json`));
mkdirSync(OUT, { recursive: true });
console.log(`generating ${topics.length} topics: ${topics.map((t) => t.id).join(", ")}`);

let totT = 0, totQ = 0, totRaw = 0, dryRun = 0;
for (const topic of topics) {
  const t0 = Date.now();
  const { tests, stats } = await generateTopic(topic);
  // Once the backoff ladder is exhausted the usage window is longer than this
  // run can wait out. Stop rather than march through the remaining topics
  // producing nothing — a later run resumes from the files already on disk.
  if (tests.length === 0 && stats.transient) {
    if (++dryRun >= 2) {
      console.error(
        `\nStopping: ${dryRun} consecutive topics blocked by usage limits after ` +
        `${BACKOFF_MS.length} retries. ${topics.length - topics.indexOf(topic) - 1} topics ` +
        `left — rerun this command when the limit resets and it will pick up where it stopped.`,
      );
      break;
    }
  } else if (tests.length > 0) {
    dryRun = 0;
  }
  if (tests.length > 0) writeFileSync(`${OUT}/${topic.id}.json`, JSON.stringify(tests, null, 1));
  const q = tests.reduce((n, t) => n + t.questions.length, 0);
  totT += tests.length; totQ += q; totRaw += stats.rawQ;
  console.log(
    `\n${topic.id.padEnd(22)} ${String(tests.length).padStart(2)} tests / ${String(q).padStart(3)} q  ` +
    `(kept ${stats.keptQ}/${stats.rawQ} items · ${stats.calls} calls · ${((Date.now() - t0) / 1000).toFixed(0)}s)`,
  );
}
if (unverified.size) {
  const top = [...unverified.entries()].sort((a, b) => b[1] - a[1]);
  const total = top.reduce((n, [, c]) => n + c, 0);
  console.log(
    `\n${unverified.size} distinct forms (${total} uses) were accepted without a ` +
    `dictionary match; most frequent first:`,
  );
  console.log("  " + top.slice(0, 40).map(([w, c]) => `${w}(${c})`).join(" "));
}
const rate = totRaw ? ((totQ / totRaw) * 100).toFixed(1) : "—";
console.log(`\nDone: ${topics.length} topics · ${totT} tests · ${totQ} questions · validation kept ${rate}% of generated items.`);
