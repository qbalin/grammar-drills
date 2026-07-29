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
 * C5 and C7 need the reference databases; without them both are skipped and
 * said to be skipped, rather than quietly passing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { compileFold, words } from "@latin-tutor/core";
import {
  gate,
  loadGrammar,
  loadProfile,
  loadTests,
  packDir,
  refDir,
  report,
} from "./lib/pack.mjs";
import { targetFor } from "./lib/target.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const grammar = loadGrammar(dir);
const tests = loadTests(dir);
const fold = compileFold(profile.fold);
const limits = profile.coverage;
const gates = [];

const perTopic = grammar.map((t) => {
  const list = tests[t.id] ?? [];
  const questions = list.reduce((n, x) => n + x.questions.length, 0);
  return { topic: t, tests: list.length, questions, target: targetFor(t, profile) };
});

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
// size and is an aspiration, where C2 is the floor. `gen-tests --only-thin`
// takes this list as its work queue.
const short = perTopic.filter((r) => r.tests < r.target);
if (short.length) {
  const worst = [...short].sort((a, b) => (b.target - b.tests) - (a.target - a.tests)).slice(0, 8);
  console.log(
    `note: ${short.length} of ${perTopic.length} topics are below their size-scaled target ` +
      `(top up with: node --import tsx scripts/gen-tests.mjs --only-thin)\n` +
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

// --- C5 / C7: what the reference databases can say ---------------------------

const ref = refDir(profile, argv);
const dictPath = join(ref, "dictionary.db");
const freqPath = join(ref, "frequencies.db");

if (existsSync(dictPath)) {
  const db = new DatabaseSync(dictPath, { readOnly: true });
  const attested = db.prepare("select 1 from forms where form_norm = ? limit 1");
  let total = 0;
  let resolved = 0;
  for (const q of allQuestions) {
    for (const w of words(q.answer)) {
      total++;
      if (attested.get(fold(w))) resolved++;
    }
  }
  const pct = (resolved / Math.max(1, total)) * 100;
  gates.push(
    gate("C5", pct >= limits.minDictResolvedPct,
      `${pct.toFixed(1)}% of ${total} answer tokens attested (want ≥${limits.minDictResolvedPct}%)`),
  );

  if (existsSync(freqPath)) {
    const freq = new DatabaseSync(freqPath, { readOnly: true });
    const band = freq
      .prepare("select lemma from frequency where rank between ? and ?")
      .all(400, 6000)
      .map((r) => fold(r.lemma));
    // A form of a band lemma counts: the sentences inflect, so the bare lemma
    // is usually not what appears.
    const lemmaOf = db.prepare(
      "select e.word_norm w from forms f join entries e on e.id = f.entry_id where f.form_norm = ? limit 1",
    );
    const used = new Set();
    for (const q of allQuestions) {
      for (const w of words(q.answer)) {
        const hit = lemmaOf.get(fold(w));
        if (hit) used.add(hit.w);
      }
    }
    const inBand = band.filter((l) => used.has(l)).length;
    const pctBand = (inBand / Math.max(1, band.length)) * 100;
    gates.push(
      gate("C7", pctBand >= limits.minBandUtilisationPct,
        `${inBand} of ${band.length} band lemmas used (${pctBand.toFixed(1)}%, want ≥${limits.minBandUtilisationPct}%)`),
    );
  }
} else {
  gates.push(gate("C5", true, `skipped — no dictionary.db at ${ref}`));
  gates.push(gate("C7", true, `skipped — no dictionary.db at ${ref}`));
}

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
  for (const f of profile.families) {
    const s = byFamily.get(f.id) ?? { topics: 0, questions: 0 };
    const t = perTopic.filter((r) => r.topic.family === f.id);
    const tests_ = t.reduce((n, r) => n + r.tests, 0);
    console.log(
      `  ${f.label.padEnd(30)} ${String(s.topics).padStart(3)} topics  ` +
        `${String(tests_).padStart(4)} tests  ${String(s.questions).padStart(5)} questions  ` +
        `${(s.questions / Math.max(1, s.topics)).toFixed(1)} q/topic`,
    );
  }
}

const ok = report(
  `Question coverage — ${profile.id} (${allQuestions.length} questions over ${perTopic.length} topics)`,
  gates,
  { json: argv.includes("--json") },
);
process.exit(ok ? 0 : 1);
