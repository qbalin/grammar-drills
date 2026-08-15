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
 *
 * --- the second mode -------------------------------------------------------
 *
 *   node --import tsx scripts/prune-tests.mjs --pack languages/latin --generated
 *
 * Takes out the questions a model wrote, in the topics that no longer need
 * them. This is the other half of the backfill: `quote-tests.mjs` only ever
 * appends, so a topic being taught out of Cicero still carries every sentence
 * the generator wrote for it, and nothing yet removes them.
 *
 * The rule it will not break is the coverage floor. A topic is eligible only
 * when its quoted tests alone already clear `profile.coverage.minTestsPerTopic`
 * and `minQuestionsPerTopic` — so the pack is never made thin in order to be
 * made honest, and C1/C2 stay green through every step. Topics that are close
 * but not there are printed too, with what they are short of, because that list
 * is the argument for parsing another grammar.
 *
 * Nothing about attestation is consulted here, and `--max-misses` does not
 * apply: this mode is about who wrote a sentence, not about whether its words
 * can be confirmed.
 *
 * --- the third mode --------------------------------------------------------
 *
 *   node --import tsx scripts/prune-tests.mjs --pack languages/latin --quoted
 *
 * Takes the quoted tests back out of every topic, so `quote-tests.mjs` can deal
 * the pool again from the start.
 *
 * This is not a deletion in the way the other two are: the sentences are in the
 * pools, and putting them back is one command. It exists because the composer
 * refuses to ship a sentence twice — it seeds its prompt and answer keys from
 * everything already on disk — so once a pool has been composed, the only way
 * to compose it *differently* is to compose it again from nothing. A pool that
 * has been dealt to the syntax topics cannot be re-dealt to the inflection
 * topics one sentence at a time.
 *
 * It leaves the generated tests alone, so no topic loses its floor by running
 * this: every topic was at 6 tests and 16 questions on generated work before
 * the first quotation arrived.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { words } from "@lang-tutor/core";
import { loadProfile, loadTests, packDir,
  args,
} from "./lib/pack.mjs";
import { makeClassifier } from "./lib/attestation.mjs";
import { partition } from "./lib/quoted.mjs";
import { openReference } from "./lib/reference.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const tests = loadTests(dir);
const APPLY = argv.includes("--apply");
const GENERATED = argv.includes("--generated");
const QUOTED = argv.includes("--quoted");
const { at: opt } = args(argv);
const MAX = Number(opt("--max-misses", profile.attestation?.maxMissesPerQuestion ?? 0));
const ONLY = opt("--topic", null);

if ((GENERATED || QUOTED) && argv.includes("--max-misses")) {
  console.error(
    "--generated/--quoted and --max-misses are different questions and do not combine:\n" +
      "  --max-misses  takes out questions whose words the reference cannot confirm\n" +
      "  --generated   takes out questions a model wrote, where a book has replaced them\n" +
      "  --quoted      takes out the quoted tests, so the pool can be dealt again\n" +
      "Run them one at a time.",
  );
  process.exit(2);
}
if (GENERATED && QUOTED) {
  console.error("--generated and --quoted are opposite modes; run one at a time.");
  process.exit(2);
}

const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};
const MIN_PER_TEST = config.minQuestionsPerTest ?? 3;

let dropped = 0;
let emptied = 0;
const touched = [];

const write = (topic, kept) => {
  // The generator's own formatting, so a prune and a refill leave one shape
  // in the file rather than two.
  writeFileSync(
    join(dir, "content", "tests", `${topic}.json`),
    JSON.stringify(kept, null, 1),
  );
};

if (GENERATED) {
  pruneGenerated();
} else if (QUOTED) {
  pruneQuoted();
} else {
  pruneUnattested();
}

// --- taking the quotations back, so they can be dealt again ------------------

function pruneQuoted() {
  for (const [topic, list] of Object.entries(tests)) {
    if (ONLY && topic !== ONLY) continue;
    const { quoted, generated } = partition(list);
    if (!quoted.length) continue;

    dropped += quoted.reduce((n, t) => n + t.questions.length, 0);
    touched.push({ topic, before: list.length, after: generated.length });
    console.log(
      `  ${topic.padEnd(48)} ${list.length} -> ${generated.length} tests  ` +
        `(${quoted.reduce((n, t) => n + t.questions.length, 0)} quoted questions go back to the pool)`,
    );
    if (APPLY) write(topic, generated);
  }

  console.log(
    `\n${dropped} quoted question${dropped === 1 ? "" : "s"} in ` +
      `${touched.length} topic${touched.length === 1 ? "" : "s"}, returned to the pools they came from.`,
  );
  summarize(
    "Now deal them again",
    `node --import tsx scripts/quote-tests.mjs --pack ${dir} --from quotes --allocate`,
  );
}

// --- taking out what the reference cannot confirm ----------------------------

function pruneUnattested() {
  const ref = openReference(dir, profile, argv);
  const { classify, fold } = makeClassifier({ profile, config, ref });

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
    if (APPLY) write(topic, kept);
  }

  ref.close();

  console.log(
    `\n${dropped} question${dropped === 1 ? "" : "s"} over the bar of ${MAX}, ` +
    `${emptied} test${emptied === 1 ? "" : "s"} left too short to keep, ` +
    `across ${touched.length} topic${touched.length === 1 ? "" : "s"}.`,
  );
  for (const t of touched) console.log(`  ${t.topic}: ${t.before} -> ${t.after} tests`);
  summarize(
    "Now top each topic back up",
    `node --import tsx scripts/gen-tests.mjs --pack ${dir} --fill ` +
      touched.map((t) => t.topic).join(" "),
  );
}

// --- taking out what a model wrote, where a book has replaced it -------------

function pruneGenerated() {
  const floorTests = profile.coverage.minTestsPerTopic;
  const floorQuestions = profile.coverage.minQuestionsPerTopic;
  const nearly = [];

  for (const [topic, list] of Object.entries(tests)) {
    if (ONLY && topic !== ONLY) continue;
    const { quoted, generated } = partition(list);
    if (!generated.length) continue;

    const quotedQuestions = quoted.reduce((n, t) => n + t.questions.length, 0);
    /*
     * The whole safety of this mode is one comparison. A topic keeps every
     * generated test it has until the quoted ones can carry the floor without
     * them; there is no partial credit, because a topic left at five tests is a
     * red C2 and `gen-tests --only-thin` would quietly write model sentences
     * back into it on the next run.
     */
    if (quoted.length < floorTests || quotedQuestions < floorQuestions) {
      if (quoted.length) {
        nearly.push({
          topic,
          quotedTests: quoted.length,
          quotedQuestions,
          shortTests: Math.max(0, floorTests - quoted.length),
          shortQuestions: Math.max(0, floorQuestions - quotedQuestions),
        });
      }
      continue;
    }

    dropped += generated.reduce((n, t) => n + t.questions.length, 0);
    touched.push({ topic, before: list.length, after: quoted.length });
    console.log(
      `  ${topic.padEnd(48)} ${list.length} -> ${quoted.length} tests  ` +
        `(${quotedQuestions} quoted questions stay, ` +
        `${generated.reduce((n, t) => n + t.questions.length, 0)} generated go)`,
    );
    if (APPLY) write(topic, quoted);
  }

  console.log(
    `\n${dropped} generated question${dropped === 1 ? "" : "s"} in ` +
      `${touched.length} topic${touched.length === 1 ? "" : "s"} that clear ` +
      `${floorTests} tests / ${floorQuestions} questions on quoted work alone.`,
  );

  /*
   * The topics that have quoted questions but not enough of them. This is the
   * work queue, and it is the only honest answer to "is another grammar worth
   * parsing" — the ones nearest the floor are the ones a second source would
   * actually finish.
   */
  if (nearly.length) {
    const worst = [...nearly]
      .sort((a, b) => (a.shortQuestions - b.shortQuestions) || (a.shortTests - b.shortTests))
      .slice(0, 10);
    console.log(
      `\n${nearly.length} more topic${nearly.length === 1 ? " has" : "s have"} quoted ` +
        `questions but cannot yet stand on them. Nearest first:`,
    );
    for (const t of worst) {
      console.log(
        `  ${t.topic.padEnd(48)} ${t.quotedTests}t/${t.quotedQuestions}q  ` +
          `short ${t.shortTests}t/${t.shortQuestions}q`,
      );
    }
  }

  summarize(
    "Now check the pack still stands",
    `node --import tsx scripts/validate-pack.mjs --pack ${dir}`,
  );
}

function summarize(label, next) {
  if (!touched.length) {
    console.log("Nothing to prune.");
  } else if (APPLY) {
    console.log(`\nWritten. ${label}:\n  ${next}`);
  } else {
    console.log("\nNothing written. Pass --apply to carry this out.");
  }
}
