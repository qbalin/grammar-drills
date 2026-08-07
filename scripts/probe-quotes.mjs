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
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFold } from "@lang-tutor/core";
import { loadGrammar, loadProfile, packDir } from "./lib/pack.mjs";
import { targetFor } from "./lib/target.mjs";
import { openReference } from "./lib/reference.mjs";
import { makeClassifier } from "./lib/attestation.mjs";
import { macronize } from "./lib/macronize.mjs";
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
/*
 * `--macronize` moves the macron question from the funnel to the measurement:
 * unmarked sentences are kept, and then counted by how much of the marking the
 * dictionary can put back. That is the number that decides whether the 799 the
 * original cut left is the real pool or an artefact of not having tried.
 */
const restoring = argv.includes("--macronize");
const checking = argv.includes("--attestation");
const policy = {
  era: at("--era") ?? "classical",
  verse: argv.includes("--verse"),
  minWords: Number(at("--min-words") ?? 4),
  maxWords: Number(at("--max-words") ?? 30),
  marks: restoring ? "any" : "require",
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

// --- P1: how much of the marking is recoverable? -----------------------------

if (restoring) {
  const ref = openReference(dir, profile, argv);
  if (ref.source !== "dictionary") {
    console.error(
      "\n--macronize needs the dictionary backend: the pack's own forms.txt.gz\n" +
        "is keyed by fold output and has thrown the marks away. Pass --ref.",
    );
    process.exit(2);
  }
  const fold = compileFold(profile.fold);

  const buckets = { alreadyMarked: 0, clean: 0, one: 0, two: 0, more: 0 };
  let restoredTokens = 0;
  let unknownTokens = 0;
  for (const q of kept) {
    const result = macronize(q.text, { ref, fold });
    q.macronizedText = result.text;
    q.ambiguous = result.ambiguous;
    restoredTokens += result.restored;
    unknownTokens += result.unknown;
    if (result.wasMarked) buckets.alreadyMarked++;
    else if (result.ambiguous.length === 0) buckets.clean++;
    else if (result.ambiguous.length === 1) buckets.one++;
    else if (result.ambiguous.length === 2) buckets.two++;
    else buckets.more++;
  }

  const usableWithoutReading = buckets.alreadyMarked + buckets.clean;
  console.log(`\n  macron recovery, against ${ref.label}`);
  console.log(`    ${String(buckets.alreadyMarked).padStart(5)}  arrived marked`);
  console.log(`    ${String(buckets.clean).padStart(5)}  fully restored, nothing ambiguous`);
  console.log(`    ${String(buckets.one).padStart(5)}  one ambiguous word`);
  console.log(`    ${String(buckets.two).padStart(5)}  two ambiguous words`);
  console.log(`    ${String(buckets.more).padStart(5)}  three or more`);
  console.log(
    `\n    ${usableWithoutReading} need nobody to read them; ` +
      `${buckets.one + buckets.two} more need a closed choice on 1-2 words.`,
  );
  console.log(
    `    ${restoredTokens} tokens marked by lookup, ${unknownTokens} the dictionary never heard of.`,
  );
  ref.close();
}

// --- P2: what would this pool cost the attestation gates? --------------------

if (checking) {
  // Deliberately the pack's own committed content, and deliberately not `--ref`:
  // this is the reference E1/E2 judge by, and the question is what the gates
  // would say, not what a dictionary on this machine would.
  const own = openReference(dir, profile, []);
  // Through `pathToFileURL`, as `coverage-report.mjs` and `gen-tests.mjs` do: a
  // bare relative path is not an import specifier, and getting this wrong loses
  // the function-word allowlist and the proper-noun exemption silently — which
  // reads as the pool being far dirtier than it is.
  const configPath = join(dir, "gen", "config.mjs");
  const config = existsSync(configPath)
    ? (await import(pathToFileURL(configPath).href)).default
    : {};
  const { classify } = makeClassifier({ profile, config, ref: own });
  const limit = profile.attestation?.maxMissesPerQuestion ?? 0;

  const perQuote = [];
  const missForms = new Map();
  for (const q of kept) {
    const text = q.macronizedText ?? q.text;
    const tokens = text.split(/\s+/).filter(Boolean);
    const misses = new Set();
    for (const token of tokens) {
      const verdict = classify(token, tokens[0]);
      if (verdict.verdict === "unverified") misses.add(verdict.form);
    }
    perQuote.push(misses.size);
    for (const form of misses) missForms.set(form, (missForms.get(form) ?? 0) + 1);
  }

  const within = perQuote.filter((n) => n <= limit).length;
  const clean = perQuote.filter((n) => n === 0).length;
  const cost = perQuote.reduce((n, m) => n + m, 0);
  const costWithin = perQuote.filter((n) => n <= limit).reduce((n, m) => n + m, 0);
  console.log(`\n  attestation fit, against ${own.label}`);
  console.log(`    ${String(clean).padStart(5)}  carry no unattested form at all`);
  console.log(
    `    ${String(within).padStart(5)}  fit inside maxMissesPerQuestion=${limit} (E1)`,
  );
  console.log(
    `    ${String(kept.length - within).padStart(5)}  exceed it and cannot ship without a raise`,
  );
  console.log(
    `\n    the whole pool would cost E2 ${cost} tokens; the E1-clean part costs ${costWithin}.`,
  );
  console.log(
    `    the budget is ${profile.attestation?.maxUnattestedForms ?? 0}, and the pack is already at it.`,
  );
  console.log(`    ${missForms.size} distinct forms account for that; the commonest are:`);
  for (const [form, n] of [...missForms].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`      ${String(n).padStart(4)}  ${form}`);
  }

  /*
   * The two filters are not independent, and their intersection is the only
   * number that decides anything: a quote has to be both markable and clean to
   * ship without either putting unmarked Latin on screen or moving a budget.
   *
   * The row worth reading is the first one. Quotes that cost E2 nothing need no
   * raise at all, which is a better outcome than a defensible raise.
   */
  if (restoring) {
    const rows = kept.map((q, i) => ({
      misses: perQuote[i],
      ambiguous: q.ambiguous?.length ?? 0,
    }));
    const count = (f) => rows.filter(f).length;
    console.log(`\n  the intersection — what could ship, and at what price`);
    console.log(
      `    ${String(count((r) => r.misses === 0 && r.ambiguous === 0)).padStart(5)}  ` +
        `marked and attestation-clean: costs E1 and E2 nothing`,
    );
    console.log(
      `    ${String(count((r) => r.misses === 0 && r.ambiguous > 0 && r.ambiguous <= 2)).padStart(5)}  ` +
        `attestation-clean, 1-2 words needing a closed choice`,
    );
    console.log(
      `    ${String(count((r) => r.misses > 0 && r.misses <= limit && r.ambiguous === 0)).padStart(5)}  ` +
        `marked, but would cost E2 a raise`,
    );
    console.log(
      `    ${String(count((r) => r.misses > limit || r.ambiguous > 2)).padStart(5)}  ` +
        `out of reach either way`,
    );
  }
  own.close();
}

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
