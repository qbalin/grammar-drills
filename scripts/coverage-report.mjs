#!/usr/bin/env node
/**
 * Does this pack's question set actually cover its grammar?
 *
 * "Exhaustively" is a claim, and claims about coverage are the easiest kind to
 * believe wrongly: 4,000 questions sounds like plenty right up until you notice
 * that one family got three of them. Worse, the generator resumes by asking
 * whether a topic *has* a file, so a topic that yielded three tests against a
 * target of twelve is skipped by every later run — permanently thin, and
 * invisible unless someone counts.
 *
 * So this counts. Every threshold lives in the pack's `profile.coverage`,
 * calibrated against a syllabus known to work.
 *
 *   node --import tsx scripts/coverage-report.mjs [--pack languages/latin]
 *                                                 [--ref /path/to/ref] [--json]
 *
 * C5 and C7 ask the reference whether the generated Latin is real and whether
 * it uses the vocabulary it was told to. Both are answered from the pack's own
 * content unless `--ref` points at the full reference databases.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFold, questionId, words } from "@lang-tutor/core";
import {
  gate,
  loadGrammar,
  loadProfile,
  loadTests,
  packDir,
  report,
  teachable,
} from "./lib/pack.mjs";
import { tally } from "./lib/quoted.mjs";
import { openReference } from "./lib/reference.mjs";
import { targetFor } from "./lib/target.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const grammar = loadGrammar(dir);
const tests = loadTests(dir);
const fold = compileFold(profile.fold);
const limits = profile.coverage;
const gates = [];

/*
 * The generator's own config, because two of these gates are about what the
 * generator was told to do and cannot be judged against a guess at it.
 *
 * C7 asks whether the frequency band the prompts draw vocabulary from is
 * actually being exercised, which is only a question about the band the pack
 * declares. This used to read a hardcoded 400-6000 with no part-of-speech
 * filter — the same numbers Latin happens to use, so Latin never noticed.
 * Greek draws 400-4500 nouns, verbs and adjectives, and was being marked
 * against 5,601 lemmas including 2,300 it was never asked to use.
 *
 * A pack without a gen/config.mjs has generated nothing yet, so the defaults
 * are as good an answer as exists.
 */
const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};
const band = { min: 400, max: 6000, pos: [], ...(config.band ?? {}) };

/*
 * The syllabus. Every gate below is about the questions, so every gate below
 * counts the topics questions are written for — not the reading pages the pack
 * also ships. Asking C2 to find six tests for the dactylic hexameter would say
 * nothing about the pack and would make C1's 100% unreachable by construction.
 */
const taught = teachable(grammar);

const perTopic = taught.map((t) => ({
  topic: t,
  ...tally(tests[t.id] ?? []),
  target: targetFor(t, profile),
}));

// --- C0: every test set belongs to a topic that exists -----------------------

/*
 * The other direction of C1, and the one that hides.
 *
 * Test files are named after their topic, so renaming a topic — which a change
 * to the grammar parser's titles does — orphans the file that was written under
 * the old name. Nothing else notices: the tests are still counted, the totals
 * still go up, the topic they claim is simply not in the syllabus, and the
 * questions are shipped where no student can reach them. Greek's
 * `sm-228-second-declension-o-stems` survived a parser change, a build, a
 * commit and a green CI run that way.
 *
 * This is a defect rather than a shortfall, so it is not scaled or thresholded:
 * either delete the file or regenerate it under the topic's current id.
 */
const known = new Set(grammar.map((t) => t.id));
const orphans = Object.keys(tests).filter((id) => !known.has(id));
/*
 * And the third case, which is neither of the other two: a test set naming a
 * topic that exists and is marked `readingOnly`. Not a stale filename — a
 * generator that ignored the flag and wrote translation exercises for prosody.
 * Reported apart from the orphans because the remedy is different: an orphan is
 * regenerated under the current id, and this one should not exist at all.
 */
const readingIds = new Set(
  grammar.filter((t) => t.readingOnly).map((t) => t.id),
);
const unteachable = Object.keys(tests).filter((id) => readingIds.has(id));
gates.push(
  gate("C0", orphans.length === 0 && unteachable.length === 0,
    orphans.length
      ? `${orphans.length} test set(s) name no topic in the syllabus — delete or regenerate: ${orphans.join(", ")}`
      : unteachable.length
        ? `${unteachable.length} test set(s) name a reading-only topic, which the book ` +
          `sets no exercise on — delete them: ${unteachable.slice(0, 5).join(", ")}`
        : `all ${Object.keys(tests).length} test sets name a topic that exists`),
);

// --- C1: every teachable topic has questions at all --------------------------

const none = perTopic.filter((r) => r.tests === 0);
const covered = ((perTopic.length - none.length) / perTopic.length) * 100;
gates.push(
  gate("C1", covered >= limits.topicsWithTestsPct,
    none.length
      ? `${none.length} topics have no tests at all: ${none.slice(0, 5).map((r) => r.topic.id).join(", ")}`
      : `all ${perTopic.length} topics have tests`),
);

// --- C2: none is thin, and none is short of its own target -------------------

const thin = perTopic.filter(
  (r) => r.tests > 0 &&
    (r.tests < limits.minTestsPerTopic || r.questions < limits.minQuestionsPerTopic),
);
gates.push(
  gate("C2", thin.length === 0,
    thin.length
      ? `${thin.length} topics under ${limits.minTestsPerTopic} tests / ${limits.minQuestionsPerTopic} questions: ` +
        thin.slice(0, 5).map((r) => `${r.topic.id} (${r.tests}t/${r.questions}q)`).join(", ")
      : `every topic has at least ${limits.minTestsPerTopic} tests and ${limits.minQuestionsPerTopic} questions`),
);

// Short of target is a warning, not a failure: the target scales with topic
// size and is an aspiration, where C2 is the floor. `gen-tests --fill` takes
// this list as its work queue — not `--only-thin`, which is the narrower flag
// for topics under the floor, and which selects nothing at all once C2 is
// green. Pointing at it here sent a session to a run that reported "nothing to
// do" over the eighty topics this very note had just listed.
const short = perTopic.filter((r) => r.tests < r.target);
if (short.length) {
  const worst = [...short].sort((a, b) => (b.target - b.tests) - (a.target - a.tests)).slice(0, 8);
  console.log(
    `note: ${short.length} of ${perTopic.length} topics are below their size-scaled target ` +
      `(top up with: node --import tsx scripts/gen-tests.mjs --fill)\n` +
      worst.map((r) => `      ${r.topic.id.padEnd(46)} ${r.tests}/${r.target} tests`).join("\n"),
  );
}

// --- C3: no family was quietly starved ---------------------------------------

const byFamily = new Map();
for (const r of perTopic) {
  const f = byFamily.get(r.topic.family) ?? { topics: 0, questions: 0 };
  f.topics++;
  f.questions += r.questions;
  byFamily.set(r.topic.family, f);
}
const packMean =
  perTopic.reduce((n, r) => n + r.questions, 0) / Math.max(1, perTopic.length);
const skewed = [...byFamily].filter(([, f]) => {
  const mean = f.questions / Math.max(1, f.topics);
  return mean < packMean * 0.5 || mean > packMean * 2;
});
gates.push(
  gate("C3", skewed.length === 0,
    skewed.length
      ? `families off the pack mean of ${packMean.toFixed(1)} q/topic: ` +
        skewed.map(([id, f]) => `${id} ${(f.questions / f.topics).toFixed(1)}`).join(", ")
      : `every family within 0.5×–2× the pack mean (${packMean.toFixed(1)} questions/topic)`),
);

// --- C4: the generator did not repeat itself ---------------------------------

const allQuestions = Object.values(tests).flatMap((list) =>
  list.flatMap((t) => t.questions),
);
const seen = new Set();
let duplicates = 0;
for (const q of allQuestions) {
  const key = q.prompt.toLowerCase().replace(/[^\p{Letter}\s]/gu, "").trim();
  if (seen.has(key)) duplicates++;
  else seen.add(key);
}
const dupPct = (duplicates / Math.max(1, allQuestions.length)) * 100;
gates.push(
  gate("C4", dupPct <= limits.maxDuplicatePromptPct,
    `${duplicates} duplicate prompts of ${allQuestions.length} (${dupPct.toFixed(2)}%, allowed ${limits.maxDuplicatePromptPct}%)`),
);

// --- C8: the question key is a key -------------------------------------------
//
// `questionId` hashes prompt and answer. It is not what progress is filed under
// — a further grammar's topics reach the primary's as topics, so the two books
// share a bank and progress stays where it is — but it becomes the only
// available key the moment a pack generates questions against a second
// grammar's own topics, and a key is worth measuring before it is depended on.
// Two *identical* questions hashing alike is the intended reading and
// is not counted here — the pack keeps those under 1% at C4 for its own
// reasons, and a student who has answered a sentence has answered it. What this
// looks for is the other thing: two questions that ask different things and
// collide anyway, which would silently merge two students' answers into one
// card. At this bank size the 64-bit id makes it vanishingly unlikely, which is
// exactly why it must be measured rather than assumed.

const byId = new Map();
const collisions = [];
for (const q of allQuestions) {
  const id = questionId(q.prompt, q.answer);
  const first = byId.get(id);
  if (first === undefined) byId.set(id, q);
  else if (first.prompt !== q.prompt || first.answer !== q.answer) {
    collisions.push(`${id}: "${first.prompt}" vs "${q.prompt}"`);
  }
}
gates.push(
  gate("C8", collisions.length === 0,
    collisions.length
      ? `${collisions.length} question ids collide: ${collisions.slice(0, 2).join(" · ")}`
      : `${byId.size} distinct ids over ${allQuestions.length} questions, no collision`),
);

// --- C5 / C7: what the reference can say --------------------------------------

const ref = openReference(dir, profile, argv);

let total = 0;
let resolved = 0;
for (const q of allQuestions) {
  for (const w of words(q.answer)) {
    total++;
    if (ref.attests(fold(w))) resolved++;
  }
}
const pct = (resolved / Math.max(1, total)) * 100;
gates.push(
  gate("C5", pct >= limits.minDictResolvedPct,
    `${pct.toFixed(1)}% of ${total} answer tokens attested (want ≥${limits.minDictResolvedPct}%)`),
);

const bandLemmas = ref.band(band).map((r) => r.lemma_norm);
// A form of a band lemma counts: the sentences inflect, so the bare lemma is
// usually not what appears.
const used = new Set();
for (const q of allQuestions) {
  for (const w of words(q.answer)) {
    const lemma = ref.lemmaOf(fold(w));
    if (lemma) used.add(lemma);
  }
}
const inBand = bandLemmas.filter((l) => used.has(l)).length;
const pctBand = (inBand / Math.max(1, bandLemmas.length)) * 100;
gates.push(
  gate("C7", pctBand >= limits.minBandUtilisationPct,
    `${inBand} of ${bandLemmas.length} band lemmas used (${pctBand.toFixed(1)}%, ` +
    `want ≥${limits.minBandUtilisationPct}%; band ${band.min}-${band.max}` +
    `${band.pos.length ? ` ${band.pos.join("/")}` : ""})`),
);

ref.close();

// --- C6: what the generator threw away ---------------------------------------

const statsPath = join(dir, "content", "gen-stats.json");
if (existsSync(statsPath)) {
  const runs = JSON.parse(readFileSync(statsPath, "utf8"));
  const raw = runs.reduce((n, r) => n + (r.rawQuestions ?? 0), 0);
  const kept = runs.reduce((n, r) => n + (r.keptQuestions ?? 0), 0);
  const pct = raw ? (kept / raw) * 100 : 100;
  gates.push(
    gate("C6", pct >= limits.minKeptRatioPct,
      `kept ${kept} of ${raw} generated items (${pct.toFixed(1)}%, want ≥${limits.minKeptRatioPct}%)`),
  );
} else {
  // Not a failure for a pack whose content predates the stats file, but it is
  // worth saying: without it the rejection rate is unmeasured.
  gates.push(gate("C6", true, "skipped — no content/gen-stats.json from a generation run yet"));
}

// --- the table ---------------------------------------------------------------

if (!argv.includes("--json")) {
  console.log("\nper family:");
  const readingPerFamily = new Map();
  for (const t of grammar) {
    if (!t.readingOnly) continue;
    readingPerFamily.set(t.family, (readingPerFamily.get(t.family) ?? 0) + 1);
  }
  for (const f of profile.families) {
    const s = byFamily.get(f.id) ?? { topics: 0, questions: 0 };
    const t = perTopic.filter((r) => r.topic.family === f.id);
    const tests_ = t.reduce((n, r) => n + r.tests, 0);
    const onlyRead = readingPerFamily.get(f.id) ?? 0;
    // A family the book sets no exercise anywhere in — Bennett's prosody — has
    // no row of figures to give. Printing zeroes reads as a starved family
    // rather than one with nothing to starve, which is the same mistake C3
    // would make if it counted these.
    if (s.topics === 0 && onlyRead > 0) {
      console.log(`  ${f.label.padEnd(30)} ${String(onlyRead).padStart(3)} topics, reading only`);
      continue;
    }
    console.log(
      `  ${f.label.padEnd(30)} ${String(s.topics).padStart(3)} topics  ` +
        `${String(tests_).padStart(4)} tests  ${String(s.questions).padStart(5)} questions  ` +
        `${(s.questions / Math.max(1, s.topics)).toFixed(1)} q/topic` +
        (onlyRead ? `  (+${onlyRead} reading)` : ""),
    );
  }
}

// --- how much of this is quoted rather than generated ------------------------

/*
 * Reported, never gated.
 *
 * A share that starts near zero is not a threshold anybody can set honestly, and
 * the repo's habit is to measure a thing before it enforces it — `probe-quotes`
 * counted what attested quotations would be worth before a line of the pipeline
 * that depends on the answer was written. This is the same move for the pipeline
 * that came out of it.
 *
 * The last line is the one to act on. It is the work queue: the topics no book
 * has managed to illustrate yet, and therefore the only honest answer to whether
 * another source is worth parsing.
 */
if (!argv.includes("--json")) {
  const quotedQuestions = perTopic.reduce((n, r) => n + r.quotedQuestions, 0);
  if (!quotedQuestions) {
    console.log(
      "\nquoted questions: none yet — every sentence in this pack was generated.",
    );
  } else {
    const sourced = perTopic.reduce((n, r) => n + r.sourced, 0);
    const standsAlone = perTopic.filter(
      (r) => r.quotedTests >= limits.minTestsPerTopic &&
        r.quotedQuestions >= limits.minQuestionsPerTopic,
    );
    const untouched = perTopic.filter((r) => r.quotedQuestions === 0);
    const pctQuoted = (quotedQuestions / allQuestions.length) * 100;
    const pctSourced = (sourced / quotedQuestions) * 100;
    console.log(
      `\nquoted questions   ${quotedQuestions} of ${allQuestions.length} ` +
        `(${pctQuoted.toFixed(1)}%)   carrying a source: ${sourced} ` +
        `(${pctSourced.toFixed(0)}%)\n` +
        `  topics that would clear ${limits.minTestsPerTopic}t/` +
        `${limits.minQuestionsPerTopic}q on quoted questions alone: ` +
        `${standsAlone.length} of ${perTopic.length}\n` +
        `  topics with no quoted question at all: ${untouched.length}`,
    );
  }
}

const ok = report(
  `Question coverage — ${profile.id} (${allQuestions.length} questions over ${perTopic.length} topics)`,
  gates,
  { json: argv.includes("--json") },
);

/*
 * Which of these gates are about how MUCH has been written, as opposed to
 * whether what is written is sound.
 *
 * `--allow-incomplete` sets aside the first kind so a pack can be published
 * while its questions are still being generated, and that distinction has to
 * live here, with the gates. Swallowing this script's exit code from outside
 * would set aside the second kind too, which is the whole thing worth keeping:
 * an orphaned test set, a duplicated prompt, an answer whose words are not in
 * the dictionary, a generator fighting its validator — none of those get better
 * by writing more questions, and none of them are excused by a draft.
 */
const ABOUT_QUANTITY = new Set(["C1", "C2", "C3", "C7"]);
if (!ok && argv.includes("--allow-incomplete")) {
  const real = gates.filter((g) => !g.ok && !ABOUT_QUANTITY.has(g.id));
  if (!real.length) {
    console.log(
      "\n--allow-incomplete: the failures above are all about how much has been " +
        "written, not about whether it is right. Reported, not enforced.",
    );
    process.exit(0);
  }
  console.log(
    `\n--allow-incomplete does not cover ${real.map((g) => g.id).join(", ")} — ` +
      "those are defects in the questions that exist, not a shortfall in how many.",
  );
}
process.exit(ok ? 0 : 1);
