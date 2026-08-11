#!/usr/bin/env node
/**
 * Which topic of one grammar teaches what a topic of another one teaches.
 *
 *   node --import tsx scripts/build-crosswalk.mjs --pack languages/latin
 *     --plan     print the coverage and write nothing
 *
 * Writes `content/grammars/crosswalk.json`. Nothing at runtime reads it yet;
 * `coverage-report.mjs` does, to answer how much of a further grammar could be
 * taught out of the questions the pack already has.
 *
 * --- what this is made of, and what it is not ---------------------------------
 *
 * Not a new judgement. The mapping already exists, filed section by section, in
 * `grammar/<id>-topics.tsv` — a model was asked once per section of the foreign
 * book which topic of the primary one it teaches, and the answer was written
 * down in a table with both books' own words beside it so it could be read back.
 * This joins that table to the foreign grammar's *topics*, which the section
 * numbers reach through the parser's own `assigned` manifest.
 *
 * So the chain is
 *
 *     bn topic  <-  <id>-topics.tsv  <-  ln section  ->  assigned  ->  ln topic
 *
 * and every link in it is either a model answer somebody can read or a fact the
 * parser recorded. What this file must never do is guess at the join: a topic
 * pair invented here would look exactly like one that was checked.
 *
 * --- why it is a many-to-many and has to stay one -----------------------------
 *
 * Two grammars of one language agree on the language and on nothing else. Where
 * Bennett has one topic on the dative, Lane has the complementary dative and the
 * predicative dative apart, and the arrow points both ways at once: one Bennett
 * topic to two of Lane's, and Lane's `Agreement: of the noun` back to two of
 * Bennett's. Collapsing either direction to a single id would be tidier and
 * would be a lie about the books.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  grammarsOf,
  loadGrammar,
  loadGrammarCoverage,
  loadProfile,
  packDir,
} from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const planning = argv.includes("--plan");

const [primary, ...secondaries] = grammarsOf(profile);
if (!secondaries.length) {
  console.log(`${profile.id} ships one grammar; there is nothing to cross-walk.`);
  process.exit(0);
}

const primaryTopics = loadGrammar(dir, primary);
const primaryIds = new Set(primaryTopics.map((t) => t.id));

/** `<id>-topics.tsv`: foreign section -> one or more primary topic ids. */
function readMap(id) {
  const path = join(dir, "grammar", `${id}-topics.tsv`);
  if (!existsSync(path)) return null;
  const rows = readFileSync(path, "utf8").split("\n").slice(1);
  const out = new Map();
  for (const row of rows) {
    if (!row.trim()) continue;
    const [section, topics] = row.split("\t");
    if (!section?.trim()) continue;
    out.set(
      Number(section),
      (topics ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    );
  }
  return out;
}

const crosswalk = {};
for (const book of secondaries) {
  const topics = loadGrammar(dir, book);
  const manifest = loadGrammarCoverage(dir, book);
  const mapped = readMap(book.id);
  if (!manifest || !mapped) {
    console.error(
      `${book.id}: needs both content/${book.coverage} and grammar/${book.id}-topics.tsv`,
    );
    process.exit(2);
  }

  // section number -> this book's topic id, straight off the parser's account.
  const assigned = manifest.assigned;

  const toPrimary = new Map();   // this book's topic -> primary topics
  const fromPrimary = new Map(); // primary topic -> this book's topics
  const strayTopics = new Set(); // named by the table, absent from the syllabus
  let rowsOutsideRange = 0;

  for (const [section, primaryTopicIds] of mapped) {
    const own = assigned[String(section)];
    if (!own) {
      // The table covers a section the syllabus dropped — prosody, word
      // formation — or one this parser never reached. Counted, not guessed at.
      rowsOutsideRange++;
      continue;
    }
    for (const id of primaryTopicIds) {
      if (!primaryIds.has(id)) {
        strayTopics.add(id);
        continue;
      }
      if (!toPrimary.has(own)) toPrimary.set(own, new Set());
      toPrimary.get(own).add(id);
      if (!fromPrimary.has(id)) fromPrimary.set(id, new Set());
      fromPrimary.get(id).add(own);
    }
  }

  const sorted = (m) =>
    Object.fromEntries([...m].sort().map(([k, v]) => [k, [...v].sort()]));
  crosswalk[book.id] = {
    toPrimary: sorted(toPrimary),
    fromPrimary: sorted(fromPrimary),
  };

  const reached = topics.filter((t) => toPrimary.has(t.id));
  const pct = (n, of) => `${((n / of) * 100).toFixed(0)}%`;
  console.log(
    `${book.label}: ${reached.length}/${topics.length} topics reach a ` +
      `${primary.label} topic (${pct(reached.length, topics.length)}); ` +
      `${fromPrimary.size}/${primaryTopics.length} the other way`,
  );
  if (rowsOutsideRange) {
    console.log(`  ${rowsOutsideRange} table rows name a section this syllabus does not carry`);
  }
  if (strayTopics.size) {
    console.log(
      `  ${strayTopics.size} rows name a ${primary.label} topic that no longer exists: ` +
        `${[...strayTopics].slice(0, 3).join(", ")}`,
    );
  }

  // Where the gap is, by the foreign book's own families — which is the list a
  // model run would be pointed at, so it is printed rather than described.
  const gap = new Map();
  for (const t of topics) {
    if (toPrimary.has(t.id)) continue;
    gap.set(t.family, (gap.get(t.family) ?? 0) + 1);
  }
  if (gap.size) {
    const byFamily = [...gap].sort((a, b) => b[1] - a[1]);
    console.log(
      `  unreached, by ${book.label}'s families: ` +
        byFamily.map(([f, n]) => `${f} ${n}`).join(" · "),
    );
  }
}

if (planning) process.exit(0);
const out = join(dir, "content", "grammars", "crosswalk.json");
writeFileSync(out, `${JSON.stringify(crosswalk, null, 1)}\n`);
console.log(`-> ${out}`);
