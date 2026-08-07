/**
 * How much of the syllabus could be taught out of attested sentences?
 *
 * This answers one question and then gets thrown away, or kept as the record of
 * why the answer was what it was. It is deliberately not part of the build: no
 * gate reads it and nothing ships from it. Run it before writing any of the
 * pipeline it is meant to justify.
 *
 *   node --import tsx scripts/probe-quotes.mjs --dump <kaikki.jsonl> [--era classical|any]
 *
 * The dump is the reference dictionary's raw source — 1.2 GB, not committed,
 * see scripts/reference/README.md. Everything else comes from the pack.
 */
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadGrammar, loadProfile, packDir } from "./lib/pack.mjs";
import { targetFor } from "./lib/target.mjs";
import {
  FUNNEL_ORDER,
  classicalAuthor,
  readQuotes,
  rejectionOf,
} from "./lib/quotes.mjs";

const argv = process.argv.slice(2);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dump = at("--dump") ?? process.env.KAIKKI_LATIN;
if (!dump) {
  console.error(
    "This needs the reference dictionary's raw dump, and nothing in the repo is one.\n" +
      "Point at it with --dump /path/to/kaikki.org-dictionary-<Language>.jsonl " +
      "or KAIKKI_LATIN=..., or fetch one with scripts/reference/ (see its README).",
  );
  process.exit(2);
}

const dir = packDir(argv);
const profile = loadProfile(dir);
const grammar = loadGrammar(dir);
const policy = {
  era: at("--era") ?? "classical",
  verse: argv.includes("--verse"),
  minWords: Number(at("--min-words") ?? 4),
  maxWords: Number(at("--max-words") ?? 30),
};

const funnel = Object.fromEntries(FUNNEL_ORDER.map((k) => [k, 0]));
const kept = [];
let total = 0;

for await (const quote of readQuotes(dump)) {
  total++;
  const why = rejectionOf(quote, policy);
  if (why) {
    funnel[why]++;
    continue;
  }
  kept.push({
    ...quote,
    author: classicalAuthor(quote.refParsed.author) ?? quote.refParsed.author,
  });
}

console.log(`\n${profile.id} — attested-quotation funnel`);
console.log(`  policy: era=${policy.era} verse=${policy.verse} ` +
  `words=${policy.minWords}-${policy.maxWords}\n`);
console.log(`  ${String(total).padStart(6)}  distinct cited examples`);
let running = total;
for (const key of FUNNEL_ORDER) {
  running -= funnel[key];
  console.log(
    `  ${String(-funnel[key]).padStart(6)}  ${key.padEnd(14)} -> ${running}`,
  );
}
console.log(`\n  ${String(kept.length).padStart(6)}  usable\n`);

const withEnglish = kept.filter((q) => q.english && !q.englishIsPlaceholder);
console.log(`  of those, ${withEnglish.length} carry a real English translation`);

const byAuthor = new Map();
for (const q of kept) byAuthor.set(q.author, (byAuthor.get(q.author) ?? 0) + 1);
const spread = [...byAuthor].sort((a, b) => b[1] - a[1]);
console.log(`  spread over ${spread.length} authors; the top five are ` +
  `${Math.round((100 * spread.slice(0, 5).reduce((n, [, c]) => n + c, 0)) / kept.length)}%:`);
for (const [author, n] of spread.slice(0, 10)) {
  console.log(`    ${String(n).padStart(4)}  ${author}`);
}

// --- what it would take to fill the syllabus ---------------------------------

const config = { questionsPerTest: 4 };
const wanted = grammar.map((topic) => ({
  id: topic.id,
  family: topic.family,
  tests: targetFor(topic, profile, config),
}));
const floorTests = profile.coverage.minTestsPerTopic;
const floorQuestions = profile.coverage.minQuestionsPerTopic;
const needAtFloor = grammar.length * floorQuestions;
const needAtTarget = wanted.reduce((n, t) => n + t.tests, 0) * config.questionsPerTest;

console.log(`\n  the syllabus is ${grammar.length} topics, and asks for`);
console.log(`    ${needAtFloor} questions to clear the floor ` +
  `(${floorTests} tests / ${floorQuestions} questions per topic)`);
console.log(`    ${needAtTarget} questions to reach every size-scaled target`);
console.log(`  the pool is ${kept.length}.`);
console.log(
  kept.length >= needAtFloor
    ? "  -> enough in aggregate; per-topic distribution decides it.\n"
    : "  -> not enough in aggregate. A second source is required.\n",
);

const out = at("--write");
if (out) {
  writeFileSync(out, gzipSync(kept.map((q) => JSON.stringify(q)).join("\n")));
  console.log(`  wrote ${kept.length} records to ${out}`);
}
