#!/usr/bin/env node
/**
 * Close the elisions in quoted questions that already ship.
 *
 * `quote-tests.mjs` closes them now, but it closes them *as it deals a pool*,
 * and a pool cannot be re-dealt incrementally — the composer seeds its keys from
 * everything on disk, so re-running it to fix a mark would re-deal every quoted
 * question in the pack and move sentences between topics for no reason. This
 * rewrites the text in place instead, which is the same thing a pack's
 * `citations.mjs` does to `lemmas.json.gz`: the content is still generated, by a
 * script, from a rule nobody typed by hand.
 *
 * It changes `answer` and `prompt` and nothing else. No question moves topic, no
 * test gains or loses a question, and `answerKey` keeps meaning what it says —
 * so C4 cannot move and the deal is untouched.
 *
 * Dry run by default, like `prune-tests.mjs`. `--apply` writes.
 *
 *   node --import tsx scripts/repair-elision.mjs --pack languages/ancient-greek
 *   node --import tsx scripts/repair-elision.mjs --pack languages/ancient-greek --apply
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO, packDir } from "./lib/pack.mjs";
import { closeElision, hasElision } from "./lib/quotes.mjs";
import { QUOTED_ID } from "./lib/quoted.mjs";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const dir = packDir(argv);
const testsDir = join(dir, "content", "tests");

let files = 0;
let touched = 0;
let answers = 0;
let prompts = 0;
let both = 0;
const examples = [];

for (const name of readdirSync(testsDir).filter((n) => n.endsWith(".json"))) {
  const path = join(testsDir, name);
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  const tests = Array.isArray(data) ? data : data.tests;
  let changed = false;
  files += 1;

  for (const test of tests ?? []) {
    // Quoted questions only. A generated answer has no book behind it and no
    // elision to close; if one ever carried the mark that is a generator fault
    // and must not be repaired quietly here.
    if (!QUOTED_ID.test(String(test.id ?? ""))) continue;
    for (const q of test.questions ?? []) {
      const inAnswer = hasElision(q.answer);
      const inPrompt = hasElision(q.prompt);
      if (!inAnswer && !inPrompt) continue;
      if (inAnswer && inPrompt) both += 1;
      if (inAnswer) answers += 1;
      if (inPrompt) prompts += 1;
      if (examples.length < 5) {
        examples.push({ test: test.id, was: q.answer, now: closeElision(q.answer) });
      }
      if (inAnswer) q.answer = closeElision(q.answer);
      if (inPrompt) q.prompt = closeElision(q.prompt);
      changed = true;
    }
  }

  if (changed) {
    touched += 1;
    // Two spaces and a trailing newline, matching what `quote-tests.mjs` writes,
    // so a repaired file and a freshly dealt one are the same file.
    if (apply) writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  }
}

console.log(`Elision repair — ${relative(REPO, dir)}`);
console.log(`  ${files} test files read, ${touched} carry the mark`);
console.log(`  ${answers} answers closed, ${prompts} prompts closed (${both} carried both)`);
if (examples.length) {
  console.log("\n  For example:");
  for (const e of examples) {
    console.log(`    ${e.test}`);
    console.log(`      was: ${e.was}`);
    console.log(`      now: ${e.now}`);
  }
}
console.log(
  apply
    ? `\nWritten. Re-run validate-pack: the answers changed, so attestation is` +
        ` measured again — the mark itself was never an attested token.`
    : `\nNothing written. Pass --apply to write.`,
);
