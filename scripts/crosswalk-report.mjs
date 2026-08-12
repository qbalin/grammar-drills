#!/usr/bin/env node
/**
 * How much of a further grammar could be taught out of the questions the pack
 * already has?
 *
 *   node --import tsx scripts/crosswalk-report.mjs [--pack languages/latin]
 *                                                  [--json] [--gaps]
 *
 * A pack with one grammar passes trivially and prints one line.
 *
 * --- why this is its own report ----------------------------------------------
 *
 * `coverage-report.mjs` answers questions about the *questions* — how many are
 * attested, how much of the vocabulary band they reach, how many prompts repeat
 * — and those are properties of the pack, answered once, however many books it
 * files them under. What is per-book is narrower and is all here: whether the
 * crosswalk points at topics that exist, and how much of the book it reaches.
 *
 * The gates are deliberately not called C-anything. A further grammar's
 * coverage is not the pack's coverage with a different denominator: the pack
 * writes questions against one syllabus, and every other book gets what the
 * crosswalk carries. Numbering them apart keeps a reader from reading a low
 * figure here as a hole in the pack.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gate,
  grammarsOf,
  loadGrammar,
  loadProfile,
  loadTests,
  packDir,
  report,
} from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const [primary, ...secondaries] = grammarsOf(profile);

if (!secondaries.length) {
  console.log(`Crosswalk — ${profile.id}: one grammar, nothing to cross-walk.`);
  process.exit(0);
}

const path = join(dir, "content", "grammars", "crosswalk.json");
if (!existsSync(path)) {
  console.error(
    `no ${path} — run scripts/build-crosswalk.mjs, which joins the pack's\n` +
      "<id>-topics.tsv tables to each further grammar's parsed topics.",
  );
  process.exit(1);
}
const crosswalk = JSON.parse(readFileSync(path, "utf8"));
const primaryTopics = loadGrammar(dir, primary);
const primaryIds = new Set(primaryTopics.map((t) => t.id));
const tests = loadTests(dir);

const gates = [];
for (const book of secondaries) {
  const topics = loadGrammar(dir, book);
  const ids = new Set(topics.map((t) => t.id));
  const walk = crosswalk[book.id];
  const limits = book.coverage;

  if (!walk) {
    gates.push(gate(`X1 ${book.id}`, false, `crosswalk.json carries no entry for ${book.id}`));
    continue;
  }

  /*
   * X1 is C0's argument in the other book: a crosswalk naming a topic that does
   * not exist is a renamed topic or a stale table, and it is silent either way
   * — the questions are still counted, the totals still go up, and the topic
   * they claim is not in anybody's syllabus.
   */
  const strayOwn = Object.keys(walk.toPrimary).filter((id) => !ids.has(id));
  const strayPrimary = Object.keys(walk.fromPrimary).filter((id) => !primaryIds.has(id));
  gates.push(
    gate(`X1 ${book.id}`, strayOwn.length === 0 && strayPrimary.length === 0,
      strayOwn.length
        ? `${strayOwn.length} ids not in ${book.label}: ${strayOwn.slice(0, 3).join(", ")}`
        : strayPrimary.length
          ? `${strayPrimary.length} ids not in ${primary.label}: ${strayPrimary.slice(0, 3).join(", ")}`
          : `every crosswalk id names a live topic in both books`),
  );

  // What each of this book's topics would be served, gathered through the
  // crosswalk from the primary's bank.
  const served = new Map();
  for (const [sectionId, list] of Object.entries(tests)) {
    const questions = list.reduce((n, t) => n + t.questions.length, 0);
    for (const own of walk.fromPrimary[sectionId] ?? []) {
      const cur = served.get(own) ?? { tests: 0, questions: 0 };
      cur.tests += list.length;
      cur.questions += questions;
      served.set(own, cur);
    }
  }

  const reached = topics.filter((t) => served.has(t.id));
  const pct = (reached.length / topics.length) * 100;
  gates.push(
    gate(`X2 ${book.id}`, pct >= limits.topicsWithTestsPct,
      `${reached.length} of ${topics.length} topics reachable (${pct.toFixed(1)}%, ` +
        `want ≥${limits.topicsWithTestsPct}%)`),
  );

  const thin = reached.filter((t) => {
    const c = served.get(t.id);
    return c.tests < limits.minTestsPerTopic || c.questions < limits.minQuestionsPerTopic;
  });
  const sizes = reached.map((t) => served.get(t.id).questions).sort((a, b) => a - b);
  gates.push(
    gate(`X3 ${book.id}`, thin.length === 0,
      thin.length
        ? `${thin.length} reachable topics under ${limits.minTestsPerTopic} tests / ` +
          `${limits.minQuestionsPerTopic} questions: ${thin.slice(0, 3).map((t) => t.id).join(", ")}`
        : `every reachable topic clears ${limits.minTestsPerTopic} tests and ` +
          `${limits.minQuestionsPerTopic} questions (median ${sizes[sizes.length >> 1]})`),
  );

  // How much of the pack's bank is visible from this book at all. Not a gate:
  // it is the same questions either way, and the figure is here so that a drop
  // is noticed rather than so that a build fails.
  let total = 0;
  let visible = 0;
  for (const [sectionId, list] of Object.entries(tests)) {
    const n = list.reduce((acc, t) => acc + t.questions.length, 0);
    total += n;
    if ((walk.fromPrimary[sectionId] ?? []).length) visible += n;
  }
  console.log(
    `${book.label}: ${visible} of ${total} questions reachable ` +
      `(${((visible / total) * 100).toFixed(1)}%)`,
  );

  const gap = new Map();
  for (const t of topics) {
    if (served.has(t.id)) continue;
    gap.set(t.family, (gap.get(t.family) ?? 0) + 1);
  }
  if (gap.size) {
    console.log(
      `  unreached by family: ` +
        [...gap].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(" · "),
    );
  }
  if (argv.includes("--gaps")) {
    for (const t of topics) {
      if (!served.has(t.id)) console.log(`    ${t.id}  ${book.style.refPrefix}${t.ref}  ${t.title}`);
    }
  }
}

const ok = report(`Crosswalk — ${profile.id}`, gates, { json: argv.includes("--json") });
process.exit(ok ? 0 : 1);
