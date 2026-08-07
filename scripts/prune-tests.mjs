#!/usr/bin/env node
/**
 * Take out the questions that carry an unattested form, so they can be written
 * again.
 *
 * The generator has no per-question path: naming a topic rewrites its whole
 * file, and the output is unseeded, so a plain re-run throws away fifteen good
 * tests to re-earn them. `--fill` is the way in — it tops a topic up to its
 * size-scaled target and appends — but only once the bad questions are gone.
 * This is that step.
 *
 *   node --import tsx scripts/prune-tests.mjs [--pack languages/latin]
 *        [--max-misses N] [--ref /path/to/reference] [--apply] [--topic ID]
 *
 * Then, for each topic it touched:
 *
 *   node --import tsx scripts/gen-tests.mjs --pack languages/latin --fill <topic-id>
 *
 * `--dry-run` is not a flag because it is the default: this deletes a student's
 * exercises, and the list is worth reading first. `--apply` writes.
 *
 * Read the attestation report before reaching for this. Most of what it will
 * offer to delete is correct — Latin's remaining misses are archaic gerundives
 * and `-ier` infinitives sitting in the topics that exist to teach them, and
 * Greek's are future optatives in the topics on indirect discourse. Deleting
 * those makes the gate greener and the pack worse. The forms worth pruning are
 * the ones no grammar would defend, and telling them apart is a judgement this
 * script cannot make for you — it only carries out the decision.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { words } from "@lang-tutor/core";
import { loadProfile, loadTests, packDir } from "./lib/pack.mjs";
import { makeClassifier } from "./lib/attestation.mjs";
import { openReference } from "./lib/reference.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const tests = loadTests(dir);
const APPLY = argv.includes("--apply");
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const MAX = Number(opt("--max-misses", profile.attestation?.maxMissesPerQuestion ?? 0));
const ONLY = opt("--topic", null);

const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};
const MIN_PER_TEST = config.minQuestionsPerTest ?? 3;

const ref = openReference(dir, profile, argv);
const { classify, fold } = makeClassifier({ profile, config, ref });

let dropped = 0;
let emptied = 0;
const touched = [];

for (const [topic, list] of Object.entries(tests)) {
  if (ONLY && topic !== ONLY) continue;
  const kept = [];
  let changed = false;

  for (const test of list) {
    const questions = [];
    for (const question of test.questions) {
      const answerWords = words(question.answer);
      const first = answerWords[0] ?? "";
      const missed = new Set();
      for (const word of answerWords) {
        const { verdict, form } = classify(word, first);
        if (verdict !== "ok") missed.add(fold(form));
      }
      if (missed.size <= MAX) {
        questions.push(question);
        continue;
      }
      dropped++;
      changed = true;
      console.log(`  ${test.id} #${test.questions.indexOf(question)}  ${[...missed].join(" ")}`);
      console.log(`    ${question.answer}`);
    }
    /*
     * A test that falls below the minimum goes whole. `validate` in the
     * generator would never have emitted a two-question test, so leaving one
     * behind would put a shape on disk that nothing else in the pipeline
     * produces — and `--fill` counts tests, not questions, so a shrunken test
     * still reads as one and the topic never gets topped back up.
     */
    if (!questions.length || questions.length < MIN_PER_TEST) {
      if (questions.length) emptied++;
      changed = true;
      continue;
    }
    kept.push(questions.length === test.questions.length ? test : { ...test, questions });
  }

  if (!changed) continue;
  touched.push({ topic, before: list.length, after: kept.length });
  if (APPLY) {
    // The generator's own formatting, so a prune and a refill leave one shape
    // in the file rather than two.
    writeFileSync(
      join(dir, "content", "tests", `${topic}.json`),
      JSON.stringify(kept, null, 1),
    );
  }
}

ref.close();

console.log(
  `\n${dropped} question${dropped === 1 ? "" : "s"} over the bar of ${MAX}, ` +
  `${emptied} test${emptied === 1 ? "" : "s"} left too short to keep, ` +
  `across ${touched.length} topic${touched.length === 1 ? "" : "s"}.`,
);
for (const t of touched) console.log(`  ${t.topic}: ${t.before} -> ${t.after} tests`);

if (!touched.length) {
  console.log("Nothing to prune.");
} else if (APPLY) {
  console.log(
    `\nWritten. Now top each topic back up:\n` +
    `  node --import tsx scripts/gen-tests.mjs --pack ${dir} --fill ${touched.map((t) => t.topic).join(" ")}`,
  );
} else {
  console.log("\nNothing written. Pass --apply to carry this out.");
}
