#!/usr/bin/env node
/**
 * Give a generated answer the capital its sentence should start with.
 *
 * Found by reading gate H2 rather than by any gate: all four answers of
 * `bn-355-style-pronouns-t7` open lower-case, and across Latin **64 generated
 * answers do, in exactly four topics** — the signature of one generation run
 * that lost the capital rather than of anything about the sentences. Every one
 * is a whole sentence otherwise.
 *
 * Cosmetic where the elision gaps `repair-elision.mjs` closed were not: a
 * student writes a capital, the reference shows none, and they grade
 * themselves. But it is inconsistent with the other 99% of the bank and with
 * `asPrompt`, which capitalises every prompt on purpose so that a fragment is
 * visible as one.
 *
 * **Generated answers only, and only where the script has a case to get
 * wrong.** A *quoted* answer is real classical text taken mid-sentence out of a
 * grammar — 1,366 of Latin's 1,430 lower-case openings are exactly that, and
 * capitalising them would be correcting Cicero to fit a house style. Greek is
 * left alone by the same rule from the other side: 96% of its answers open
 * lower-case because that is the convention of the language's own editions.
 *
 * Dry run by default, like `prune-tests.mjs`. `--apply` writes.
 *
 *   node --import tsx scripts/repair-sentence-case.mjs --pack languages/latin
 *   node --import tsx scripts/repair-sentence-case.mjs --pack languages/latin --apply
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO, args, packDir } from "./lib/pack.mjs";
import { QUOTED_ID } from "./lib/quoted.mjs";

const { has } = args();
const apply = has("--apply");
const dir = packDir();
const testsDir = join(dir, "content", "tests");

/** A first letter that is lower-case *and* has an upper-case to become. */
const opensLower = (text) => {
  const first = String(text ?? "").trim()[0];
  return first !== undefined && first.toLowerCase() === first && first.toUpperCase() !== first;
};

const capitalise = (text) => {
  const trimmed = text.trim();
  return trimmed[0].toUpperCase() + trimmed.slice(1);
};

/**
 * Two passes, and the order is the whole of the safety.
 *
 * The first draft counted while it wrote and then refused — which is to say it
 * refused Greek *after* rewriting all 485 of its files, and the refusal printed
 * over a working tree that had already been changed. The damage was real: Greek
 * capitalises proper nouns and paragraph openings and nothing else, so 96% of
 * its answers open lower-case correctly, and `toUpperCase()` on a vowel with an
 * iota subscript turns `ᾳ` into `ΑΙ` — two characters where there was one. The
 * pack's E2 went from 1,264 unattested tokens to 1,323 and failed.
 *
 * So: survey the whole pack, decide, and only then write.
 */
const found = [];
let generated = 0;
const files = readdirSync(testsDir).filter((n) => n.endsWith(".json"));

for (const name of files) {
  const data = JSON.parse(readFileSync(join(testsDir, name), "utf8"));
  for (const test of (Array.isArray(data) ? data : data.tests) ?? []) {
    if (QUOTED_ID.test(String(test.id ?? ""))) continue;
    for (const [i, q] of (test.questions ?? []).entries()) {
      generated += 1;
      if (opensLower(q.answer)) found.push({ name, test: test.id, i, answer: q.answer });
    }
  }
}

const byTopic = new Map();
for (const f of found) {
  const topic = String(f.test).replace(/-t\d+$/, "");
  byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
}

console.log(`Sentence case — ${relative(REPO, dir)}`);

/*
 * Refuse a pack where opening lower-case is the convention rather than a slip.
 *
 * Told apart by proportion, which is how the two were told apart when this was
 * found: 0.9% of Latin's generated answers against 96% of Greek's. A fifth is
 * nowhere near either, so nothing has to be declared in the profile and a third
 * language inherits the right answer by measuring.
 */
const share = generated === 0 ? 0 : (found.length / generated) * 100;
if (share > 20) {
  console.log(
    `  ${found.length} of ${generated} generated answers open lower-case ` +
      `(${share.toFixed(1)}%).\n` +
      `  That is a convention, not a fault — this script is for the odd run that\n` +
      `  lost a capital, and at this share it would be rewriting how the language\n` +
      `  is printed. Nothing written.`,
  );
  process.exit(0);
}

console.log(`  ${found.length} generated answers open lower-case, across ${byTopic.size} topics`);
for (const [topic, n] of [...byTopic].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${topic}  ${n}`);
}
for (const f of found.slice(0, 3)) {
  console.log(`\n    ${f.test}#${f.i + 1}\n      was: ${f.answer}\n      now: ${capitalise(f.answer)}`);
}

if (!apply) {
  console.log(found.length ? `\nNothing written. Pass --apply to write.` : "\nNothing to do.");
  process.exit(0);
}

const touch = new Set(found.map((f) => f.name));
for (const name of touch) {
  const path = join(testsDir, name);
  const data = JSON.parse(readFileSync(path, "utf8"));
  for (const test of (Array.isArray(data) ? data : data.tests) ?? []) {
    if (QUOTED_ID.test(String(test.id ?? ""))) continue;
    for (const q of test.questions ?? []) {
      if (opensLower(q.answer)) q.answer = capitalise(q.answer);
    }
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
console.log(`\nWritten to ${touch.size} files.`);
