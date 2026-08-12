/**
 * The topics a quotation illustrates that nobody has to be asked about.
 *
 *   node --import tsx scripts/inflection-topics.mjs --pack languages/latin
 *   ... --plan     print what each rule would license, and write nothing
 *
 * Every other route from a sentence to a topic is a model's answer: the dump
 * pool was filed sentence by sentence, A&G's and Lane's section by section, and
 * each of those joins is a reviewable table because an invented pair looks
 * exactly like a checked one. That is the right rule for syntax — no lookup can
 * say whether a sentence teaches the ablative of means.
 *
 * It is the wrong rule for inflection, and the cost of applying it there was
 * visible in the coverage report: of Bennett's nine noun topics, eight carried
 * no quoted question at all, because no grammarian's *syntax* section
 * illustrates the fourth declension. But "does this sentence show a
 * fourth-declension noun" is not a judgement. It is a lookup, and the pack
 * already ships what answers it — `lemmas.json.gz` names a lemma's declension
 * and conjugation, and `paradigms.txt.gz` says which cell of its table a
 * surface form fills.
 *
 * So this files a pool sentence under the inflection topics a lookup can
 * confirm, and under no others. What is language-specific lives in a table the
 * pack owns, `grammar/inflection-topics.tsv`, one row per rule:
 *
 *   bn_topic \t rule \t argument \t bn_says
 *
 * `bn_says` is the sentence of the book that licenses the rule, carried for the
 * same reason `ag-topics.tsv` carries `ag_says` — so a reader can check the
 * rule against the section rather than against this file.
 *
 * The output is `content/inflection-topics.jsonl.gz`, keyed by the sentence, and
 * `quote-tests.mjs` merges its topics into the pool records' own. It is a
 * committed artifact like every other stage, so nothing downstream needs the
 * paradigms or the dictionary to compose a test.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFold, words } from "@lang-tutor/core";
import { loadGrammar, loadLemmaIndex, loadProfile, packDir, teachable } from "./lib/pack.mjs";
import { loadParadigms } from "./lib/paradigms.mjs";
import { noPoolMessage, poolsPresent, readPool } from "./lib/pools.mjs";

const argv = process.argv.slice(2);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dir = packDir(argv);
const profile = loadProfile(dir);
// The syllabus, not the whole book. A pack ships every section of its source,
// and the pages the book sets no exercise on are read rather than taught — so
// nothing here may file a question or a quotation under one of them.
const grammar = teachable(loadGrammar(dir));
const planning = argv.includes("--plan");
const fold = compileFold(profile.fold);

const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};

/*
 * The band's ceiling, and deliberately not its floor.
 *
 * `config.band` is the vocabulary the generator writes to, and its `min` is
 * there to skip the words too common to be worth teaching. That is the wrong
 * end to borrow: `sum` is rank 1, `ego`, `quī`, `hic` and `ipse` are not far
 * behind, and they are exactly the words the pronoun and irregular-verb topics
 * are made of. So a token has to be inside the ceiling — a word a student can
 * be asked — and nothing is too common to illustrate its own paradigm.
 */
const MAX_RANK = Number(at("--max-rank") ?? config.band?.max ?? 6000);

// --- the table ---------------------------------------------------------------

const RULES = new Set([
  "noun-declension",
  "adj-declension",
  "verb-conjugation",
  "lemma-set",
  "pos",
  "tag",
  "entry-tag",
  "spread",
]);

const tablePath = join(dir, "grammar", "inflection-topics.tsv");
if (!existsSync(tablePath)) {
  console.error(
    `No inflection table at ${tablePath}.\n` +
      `A pack files quotations under its inflection topics by declaring how — ` +
      `one row per rule, columns: bn_topic, rule, argument, bn_says.`,
  );
  process.exit(2);
}

const topicIds = new Set(grammar.map((t) => t.id));
const rows = [];
const lines = readFileSync(tablePath, "utf8").split("\n");
for (const [n, line] of lines.entries()) {
  if (!line.trim() || n === 0) continue; // the header names the columns
  const [topic, rule, argument] = line.split("\t");
  // A table naming a topic the syllabus has not got is a renamed topic or a
  // stale table, and either way it is silence until it is refused.
  if (!topicIds.has(topic)) {
    console.error(`${tablePath}:${n + 1} — no topic "${topic}" in this grammar`);
    process.exit(2);
  }
  if (!RULES.has(rule)) {
    console.error(
      `${tablePath}:${n + 1} — no rule "${rule}"; the table understands ` +
        `${[...RULES].join(", ")}`,
    );
    process.exit(2);
  }
  rows.push({ topic, rule, argument: (argument ?? "").trim() });
}

// --- what a surface form can be ----------------------------------------------

const lemmas = loadLemmaIndex(dir);
const paradigms = loadParadigms(dir);
if (!paradigms.size) {
  console.error(
    `${join(dir, "content", "paradigms.txt.gz")} is missing, and without it a ` +
      `form cannot be shown to fill any cell of any table.\n` +
      `Build it with scripts/build-paradigms.mjs.`,
  );
  process.exit(2);
}

/** The cells of one lemma's own table that this surface form fills. */
const cellCache = new Map();
function cellsOf(entry, folded) {
  const key = `${entry.lemma}|${entry.pos}`;
  let byForm = cellCache.get(key);
  if (!byForm) {
    byForm = new Map();
    for (const cell of paradigms.get(key) ?? []) {
      const k = fold(cell.form);
      if (!byForm.has(k)) byForm.set(k, []);
      byForm.get(k).push(cell.tags);
    }
    cellCache.set(key, byForm);
  }
  return byForm.get(folded) ?? [];
}

const CASES = ["nominative", "genitive", "dative", "accusative", "ablative", "vocative", "locative"];
const UPRIGHT = new Set(["nominative", "vocative"]);

/**
 * A form is oblique when the table says it is something other than the shape a
 * word is quoted in. A nominative singular shows a word; it does not show a
 * declension, which is the whole of what these topics teach. Syncretism is not
 * a problem here and does not need resolving: `rēgēs` is nominative,
 * accusative and vocative plural at once, and the accusative reading is enough.
 */
function oblique(cells) {
  return cells.some((tags) => tags.some((t) => CASES.includes(t) && !UPRIGHT.has(t)));
}

function declined(cells) {
  return cells.some((tags) => tags.some((t) => CASES.includes(t)));
}

// --- the rules ---------------------------------------------------------------

/**
 * Whether one candidate lemma of a form belongs to the class a rule names.
 *
 * Read alongside `licenses` below: this answers for a single candidate, and the
 * rule is that *every* candidate has to answer yes. A folded surface with one
 * unclassifiable reading is refused rather than assumed — `dī` is both `deus`
 * and a spelling of `diī`, and a filer that ignored the reading it could not
 * classify would file it under the fifth declension and be wrong.
 */
function belongs(row, entry, folded) {
  switch (row.rule) {
    case "noun-declension":
      return entry.pos === "noun" && entry.declension === row.argument;
    case "adj-declension":
      return entry.pos === "adj" && entry.declension === row.argument;
    case "verb-conjugation":
      return entry.pos === "verb" && entry.conjugation === row.argument;
    case "lemma-set":
      return row.set.has(fold(entry.lemma));
    case "pos":
      return entry.pos === row.argument;
    case "entry-tag":
      return (entry.tags ?? []).includes(row.argument);
    case "tag":
      if (row.pos && entry.pos !== row.pos) return false;
      return cellsOf(entry, folded).some((tags) => row.tags.every((t) => tags.includes(t)));
    default:
      return false;
  }
}

/**
 * What a rule needs of the form itself, once every candidate belongs.
 *
 * Three shapes, because one test cannot fit them. A declension is shown by a
 * form standing in an oblique case, so those rules want the paradigm to confirm
 * one. A conjugation is shown by any inflected form, and "oblique" means
 * nothing of a verb. And a preposition, conjunction, interjection or adverb has
 * no paradigm and no case at all: asking those for a cell would empty the four
 * topics that are nothing but such words.
 */
function shaped(row, cells) {
  switch (row.rule) {
    case "noun-declension":
    case "adj-declension":
      return declined(cells) && oblique(cells);
    case "verb-conjugation":
      return cells.length > 0;
    default:
      return true;
  }
}

for (const row of rows) {
  if (row.rule === "lemma-set") row.set = new Set(row.argument.split(/\s+/).map(fold));
  if (row.rule === "tag") {
    /*
     * `adj:comparative` — the part of speech the tag has to sit on, and the
     * tags themselves. Not decoration: `saepius` is a comparative and so is
     * `māior`, and only one of them is what Bennett's §71 is about. Without the
     * prefix the comparison-of-adjectives topic quietly collects adverbs.
     */
    const [scope, tags] = row.argument.includes(":")
      ? row.argument.split(":")
      : [null, row.argument];
    row.pos = scope;
    row.tags = tags.split(",").map((t) => t.trim());
  }
}

/** Every rule this token licenses on its own, and the reason it does. */
function licenses(token) {
  const folded = fold(token);
  if (!folded) return [];
  const entries = lemmas.lookup(folded);
  if (!entries.length) return [];
  // A word nothing has ranked is a word out of the band by definition — the
  // tail of the dictionary ships without a rank, and on purpose.
  if (!entries.some((e) => e.rank && e.rank <= MAX_RANK)) return [];

  const out = [];
  const cells = entries.flatMap((e) => cellsOf(e, folded));
  for (const row of rows) {
    if (row.rule === "spread") continue;
    if (!entries.every((e) => belongs(row, e, folded))) continue;
    if (!shaped(row, cells)) continue;
    out.push(row);
  }
  return out;
}

// --- what each sentence shows ------------------------------------------------

const present = poolsPresent(dir);
if (!present.length) {
  console.error(noPoolMessage(dir));
  process.exit(2);
}

/** The `spread` rules, which are about a sentence rather than about a word. */
const spreads = rows.filter((r) => r.rule === "spread");

const filed = [];
const perTopic = new Map();
const sample = new Map();
let records = 0;

for (const pool of present) {
  for (const quote of readPool(pool)) {
    records++;
    const already = new Set(quote.topics ?? []);
    const topics = new Map(); // topic -> the token and rule that licensed it
    const declensions = new Set();

    for (const token of words(quote.text)) {
      for (const row of licenses(token)) {
        if (row.rule === "noun-declension") declensions.add(row.argument);
        if (already.has(row.topic) || topics.has(row.topic)) continue;
        topics.set(row.topic, { rule: row.rule, argument: row.argument, token });
      }
    }

    for (const row of spreads) {
      const [what, count] = row.argument.split(":");
      const many = what === "declension" && declensions.size >= Number(count);
      if (!many || already.has(row.topic) || topics.has(row.topic)) continue;
      topics.set(row.topic, {
        rule: row.rule,
        argument: row.argument,
        token: [...declensions].sort().join("+"),
      });
    }

    if (!topics.size) continue;
    filed.push({
      text: quote.text,
      topics: [...topics.keys()],
      why: [...topics].map(([topic, w]) => ({ topic, ...w })),
    });
    for (const [topic, w] of topics) {
      perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1);
      if (!sample.has(topic)) sample.set(topic, { token: w.token, text: quote.text });
    }
  }
}

// --- report -------------------------------------------------------------------

console.log(`\n${profile.id} — inflection topics a lookup can confirm\n`);
console.log(`  ${String(records).padStart(6)}  pool records read`);
console.log(`  ${String(filed.length).padStart(6)}  filed under at least one new topic\n`);

const listed = new Set();
for (const row of rows) {
  if (listed.has(row.topic)) continue;
  listed.add(row.topic);
  const n = perTopic.get(row.topic) ?? 0;
  const shown = sample.get(row.topic);
  console.log(`  ${String(n).padStart(5)}  ${row.topic}`);
  if (shown) console.log(`         ${shown.token} — ${shown.text.slice(0, 72)}`);
}

const barren = [...listed].filter((t) => !perTopic.has(t));
if (barren.length) {
  console.log(
    `\n  ${barren.length} topic(s) their rules could not reach — a rule that ` +
      `licenses nothing is a rule to withdraw, not to loosen:`,
  );
  for (const t of barren) console.log(`    ${t}`);
}

if (!planning) {
  const out = join(dir, "content", "inflection-topics.jsonl.gz");
  writeFileSync(out, gzipSync(`${filed.map((r) => JSON.stringify(r)).join("\n")}\n`));
  console.log(`\n  wrote content/inflection-topics.jsonl.gz (${filed.length} records)`);
} else {
  console.log(`\n  --plan: nothing written.`);
}
