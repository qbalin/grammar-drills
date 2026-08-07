#!/usr/bin/env node
/**
 * Which shipped questions contain a form the pack cannot attest?
 *
 * Gate C5 already asks a version of this and answers 99.3%, against a floor of
 * 90 — which is true, passes, and names nothing. Three hundred unattested Latin
 * tokens sit inside that headroom, and the way anyone finds one is by meeting it
 * in a correction: the app replays `Question.answer` beside what the student
 * wrote, so an invented form is shown to them as the right answer.
 *
 * A percentage cannot be acted on. This names the question.
 *
 *   node --import tsx scripts/attestation-report.mjs [--pack languages/latin]
 *        [--ref /path/to/reference] [--json] [--list N] [--forms N]
 *
 * Every miss is bucketed, because they call for different repairs and lumping
 * them together is how the interesting ones hide:
 *
 *   index-gap   the full dictionary has this form and the pack's shipped
 *               content does not. Nothing is wrong with the question — the
 *               index is thin, and it is the same index the app uses to gloss
 *               a word for a student. Repair is `build-lemmas.mjs`.
 *   hard-miss   no reference the repo has can confirm it. These are the
 *               candidates for regeneration, and the only ones the gates count.
 *
 * The buckets need both backends to tell apart, so with `--ref` this opens the
 * dictionary *and* the pack's own content and reports the difference. Without
 * it there is one backend and everything unconfirmed is a hard miss — which is
 * the strict reading, and deliberately the one CI gets: `dictionary.db` is
 * uncommitted, so the pack's own content is the only thing a fresh checkout can
 * answer from, and a gate that passes only on the maintainer's laptop is not a
 * gate.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { words } from "@lang-tutor/core";
import { gate, loadProfile, loadTests, packDir, report } from "./lib/pack.mjs";
import { makeClassifier } from "./lib/attestation.mjs";
import { dictionaryDir, openReference } from "./lib/reference.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const tests = loadTests(dir);
const JSON_OUT = argv.includes("--json");
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : def;
};
const LIST = opt("--list", 25);
const FORMS = opt("--forms", 30);

/*
 * The generator's own config, because the allowlist and the proper-noun rule
 * are the pack's answer to "what counts as a miss" and judging shipped content
 * against a guess at them is how this report would come to disagree with the
 * generator that wrote the content. A pack with no gen/config has generated
 * nothing, and an empty allowlist is the truthful answer for it.
 */
const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};

/*
 * The gate's reference is always the pack's own committed content — the one
 * every checkout has. `--ref` adds the dictionary as a second opinion used only
 * to split the misses into "the index is thin" and "nobody has this word"; it
 * never softens the verdict, because a pack cannot ship a database it does not
 * commit.
 */
const strict = openReference(dir, profile, []);
const wide = dictionaryDir(profile, argv) ? openReference(dir, profile, argv) : null;
const check = makeClassifier({ profile, config, ref: strict });
const checkWide = wide ? makeClassifier({ profile, config, ref: wide }) : null;

const limits = { maxMissesPerQuestion: 0, maxUnattestedForms: 0, ...(profile.attestation ?? {}) };

const buckets = { "index-gap": 0, "hard-miss": 0 };
const exempt = { "function-word": 0, "enclitic": 0, "proper-noun": 0 };
const hardForms = new Map();
const gapForms = new Map();
/** Every question carrying at least one hard miss, worst first. */
const flagged = [];
let questions = 0;
let tokens = 0;
let worst = 0;

for (const [topic, list] of Object.entries(tests)) {
  for (const test of list) {
    test.questions.forEach((question, index) => {
      questions++;
      const first = words(question.answer)[0] ?? "";
      const misses = [];
      for (const raw of words(question.answer)) {
        tokens++;
        const { verdict, reason, form } = check.classify(raw, first);
        if (verdict === "ok") {
          if (reason in exempt) exempt[reason]++;
          continue;
        }
        // Confirmed by the dictionary but not by what the pack ships: the
        // question is fine and the index is short of it.
        if (checkWide && checkWide.classify(raw, first).verdict === "ok") {
          buckets["index-gap"]++;
          gapForms.set(form, (gapForms.get(form) ?? 0) + 1);
          continue;
        }
        buckets["hard-miss"]++;
        hardForms.set(form, (hardForms.get(form) ?? 0) + 1);
        misses.push(form);
      }
      if (!misses.length) return;
      /*
       * Counted distinct, because the question being asked is how much of this
       * sentence cannot be checked — not how many times it says so. Greek's
       * one three-miss question is the asyndeton example, which repeats
       * προέδωκε three times because repeating it is the figure the topic
       * teaches; charging it three misses would fail the sentence for being a
       * good example of itself. `vocab` always meant distinct forms, so this is
       * also what the generator's own count has always been.
       */
      const distinct = [...new Set(misses.map(check.fold))].length;
      worst = Math.max(worst, distinct);
      flagged.push({
        topic, testId: test.id, question: index, answer: question.answer,
        forms: misses, distinct,
      });
    });
  }
}

flagged.sort((a, b) => b.distinct - a.distinct || a.testId.localeCompare(b.testId));
const byCount = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

// --- what it found ------------------------------------------------------------

if (!JSON_OUT) {
  console.log(
    `\nAttestation — ${profile.id}\n` +
    `  ${questions.toLocaleString()} questions, ${tokens.toLocaleString()} answer tokens, ` +
    `against ${strict.label}${wide ? ` (splitting misses with ${wide.label})` : ""}`,
  );
  console.log(
    `\n  exempt: ${exempt["function-word"]} function words, ${exempt.enclitic} through an enclitic, ` +
    `${exempt["proper-noun"]} proper nouns`,
  );
  if (wide) {
    console.log(
      `  index-gap: ${buckets["index-gap"]} tokens (${gapForms.size} distinct) — ` +
      `in ${wide.label}, absent from what the pack ships`,
    );
  }
  console.log(`  hard-miss: ${buckets["hard-miss"]} tokens (${hardForms.size} distinct) in ${flagged.length} questions`);

  if (hardForms.size) {
    console.log(`\n  most frequent unattested forms:`);
    for (const [form, n] of byCount(hardForms).slice(0, FORMS)) {
      console.log(`    ${String(n).padStart(4)}  ${form}`);
    }
  }
  if (wide && gapForms.size) {
    console.log(`\n  worst index gaps (grow the shipped index, do not touch the questions):`);
    for (const [form, n] of byCount(gapForms).slice(0, FORMS)) {
      console.log(`    ${String(n).padStart(4)}  ${form}`);
    }
  }
  if (flagged.length) {
    console.log(`\n  questions carrying an unattested form (${Math.min(LIST, flagged.length)} of ${flagged.length}):`);
    for (const row of flagged.slice(0, LIST)) {
      console.log(`    ${row.testId} #${row.question}  ${row.forms.join(" ")}`);
      console.log(`      ${row.answer}`);
    }
  }
}

// --- the gates ----------------------------------------------------------------

/*
 * E1 is the rule and E2 is the ratchet. E1 alone would let a pack accumulate
 * one bad form per question forever; E2 alone would let a single sentence be
 * arbitrarily wrong so long as the total held. Neither number is ever raised —
 * a pack is admitted at what it measures and each cleanup lowers it, which is
 * what makes the budget mean something. A profile with no `attestation` block
 * gets 0/0: a pack that has generated nothing has nothing to excuse, and a
 * language added later inherits the strict rule by saying nothing.
 */
const gates = [
  gate("E1", worst <= limits.maxMissesPerQuestion,
    `worst question carries ${worst} unattested form${worst === 1 ? "" : "s"} ` +
    `(allowed ${limits.maxMissesPerQuestion}; ${flagged.length} questions affected)`),
  gate("E2", buckets["hard-miss"] <= limits.maxUnattestedForms,
    `${buckets["hard-miss"]} unattested tokens, ${hardForms.size} distinct ` +
    `(budget ${limits.maxUnattestedForms})`),
];

const ok = report(`Attestation — ${profile.id}`, gates, { json: JSON_OUT });
if (JSON_OUT) {
  console.log(JSON.stringify({
    pack: profile.id,
    reference: strict.label,
    split: wide?.label ?? null,
    questions,
    tokens,
    exempt,
    buckets,
    limits,
    worst,
    hardForms: Object.fromEntries(byCount(hardForms)),
    gapForms: Object.fromEntries(byCount(gapForms)),
    flagged,
  }, null, 2));
}

strict.close();
wide?.close();
process.exit(ok ? 0 : 1);
