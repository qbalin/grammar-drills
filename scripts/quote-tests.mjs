/**
 * Tests whose answer is a sentence somebody wrote.
 *
 * Every other question in both packs was invented by a model. This builds the
 * ones that were not: a quoted sentence becomes the reference answer, its
 * translation becomes the prompt, and the locus it came from is carried on the
 * question as `source` so the student is told whose Greek or Latin they are
 * being asked to reach for.
 *
 *   node --import tsx scripts/quote-tests.mjs --pack languages/ancient-greek --from grammar
 *   node --import tsx scripts/quote-tests.mjs --pack languages/latin --from quotes
 *   ... --plan    print the funnel and write nothing
 *
 * Two sources, because the two packs are not alike. Smyth cites an attested
 * sentence for most of what he teaches and the TEI keeps the three parts apart,
 * so `--from grammar` reads examples the parser already filed under the topic
 * they illustrate. Bennett cites nobody at all, so Latin's have to be recovered
 * from the dictionary dump and matched to topics first — `--from quotes` reads
 * what `build-quote-pool.mjs` leaves behind.
 *
 * What this will not do is move a gate. A quote is kept only if it costs the
 * attestation budget nothing: both packs sit at their `maxUnattestedForms`
 * exactly, and a raise bought by a feature rather than by the content that
 * needs it is the difference `CLAUDE.md` calls a budget and an excuse. The
 * funnel below reports what that costs in coverage rather than hiding it.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFold, words } from "@lang-tutor/core";
import { loadGrammar, loadProfile, packDir } from "./lib/pack.mjs";
import { openReference } from "./lib/reference.mjs";
import { makeClassifier } from "./lib/attestation.mjs";

const argv = process.argv.slice(2);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dir = packDir(argv);
const profile = loadProfile(dir);
const grammar = loadGrammar(dir);
const planning = argv.includes("--plan");
const from = at("--from") ?? "grammar";
const keepVerse = argv.includes("--verse");

const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};

const sourcesPath = join(dir, "gen", "sources.mjs");
const expandRef = existsSync(sourcesPath)
  ? (await import(pathToFileURL(sourcesPath).href)).expandRef
  : null;

const QUESTIONS = config.questionsPerTest ?? 4;
const MIN_QUESTIONS = config.minQuestionsPerTest ?? 3;
const MIN_WORDS = Number(at("--min-words") ?? 4);
const MAX_WORDS = Number(at("--max-words") ?? 22);

/*
 * The reference is the pack's own committed content, and deliberately not
 * `--ref`: E1 and E2 judge by this, so a quote that looks clean against a
 * dictionary on this machine and dirty against what ships is not clean.
 */
const ref = openReference(dir, profile, []);
const { classify } = makeClassifier({ profile, config, ref });
const fold = compileFold(profile.fold);

// --- what makes a quote unusable -------------------------------------------

const funnel = {
  tooShort: 0,
  tooLong: 0,
  noSource: 0,
  verse: 0,
  garbled: 0,
  unattested: 0,
  duplicate: 0,
  thinTopic: 0,
};

/**
 * Combining marks sitting on a letter that cannot carry them.
 *
 * `δ̀ς` — a grave accent on a delta — is not Greek; it is what an OCR'd
 * accent lands on when the extraction slips a character. Rare, and worth its
 * own cut rather than a general unattested count, because the failure is in the
 * text rather than in the dictionary and no amount of budget would fix it.
 */
const VOWELS = /[aeiouyāēīōūȳαεηιουω]/i;
function garbled(text) {
  for (const ch of text.normalize("NFD").matchAll(/(.)([̀-ͯ͂ͅ]+)/gu)) {
    if (!VOWELS.test(ch[1])) return true;
  }
  return false;
}

/**
 * Smyth's marks of vowel quantity, taken back off.
 *
 * He writes `ἁμάξᾱς` to teach that the alpha is long; no Greek text writes it
 * and only 10 of the pack's 4,302 sampled generated answers carry one. Keeping
 * them would make the authentic answers the odd ones out on screen, which is
 * the exact defect the Latin half of this work is trying to avoid in the other
 * direction. Attestation is indifferent either way — the fold strips them.
 *
 * Only for scripts whose orthography does not use the marks: Latin's macrons
 * are the pack's own convention and must survive.
 */
const QUANTITY = /[̄̆]/g;
function unmarkQuantity(text) {
  return text.normalize("NFD").replace(QUANTITY, "").normalize("NFC");
}

/** A prompt reduced to what makes it the same question asked twice — gen-tests' key. */
function promptKey(prompt) {
  return String(prompt).toLowerCase().replace(/[^\p{Letter}\s]/gu, "").trim();
}

/**
 * A gloss turned into a prompt.
 *
 * Smyth glosses in lower case and without a stop — "consider individually and
 * all together" — because his gloss sits inside a sentence of his own. The
 * pack's other 25,893 prompts are sentences, so this makes it one. Nothing is
 * translated or reworded: an English prompt that says something other than the
 * Greek beside it is the one failure attestation cannot catch.
 */
function asPrompt(gloss) {
  const text = String(gloss).trim().replace(/\s+/g, " ").replace(/[,;:]$/, "");
  if (!text) return "";
  const opened = text[0].toUpperCase() + text.slice(1);
  return /[.!?]$/.test(opened) ? opened : `${opened}.`;
}

/** Distinct forms of an answer that nothing attests, under the pack's own rules. */
function missesIn(answer) {
  const tokens = words(answer);
  const first = tokens[0] ?? "";
  const missed = new Set();
  for (const token of tokens) {
    const { verdict, form } = classify(token, first);
    if (verdict !== "ok") missed.add(fold(form));
  }
  return missed;
}

// --- where the candidates come from ----------------------------------------

/**
 * Greek: the parser filed Smyth's examples under the topic they illustrate, so
 * the matching is the book's own and nothing has to guess at it.
 */
function fromGrammar() {
  const out = [];
  for (const topic of grammar) {
    for (const example of topic.examples ?? []) {
      out.push({
        topicId: topic.id,
        answer: unmarkQuantity(example.text),
        prompt: asPrompt(example.gloss),
        ref: example.ref,
      });
    }
  }
  return out;
}

/**
 * Latin: a pool built out of the dictionary dump, already matched to topics and
 * already macronized. Written by `build-quote-pool.mjs`, committed, and read
 * here so that this half of the pipeline needs no dump of its own.
 */
function fromQuotes() {
  const path = join(dir, "content", "quotes.jsonl.gz");
  if (!existsSync(path)) {
    console.error(
      `No quote pool at ${path}.\n` +
        "Build one with scripts/build-quote-pool.mjs (it needs the dictionary dump).",
    );
    process.exit(2);
  }
  const out = [];
  for (const line of gunzipSync(readFileSync(path)).toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    const quote = JSON.parse(line);
    for (const topicId of quote.topics ?? []) {
      out.push({
        topicId,
        answer: quote.text,
        prompt: asPrompt(quote.prompt ?? quote.english),
        source: quote.source,
        ref: null,
      });
    }
  }
  return out;
}

// --- the funnel -------------------------------------------------------------

const topicIds = new Set(grammar.map((t) => t.id));
const candidates = (from === "quotes" ? fromQuotes() : fromGrammar()).filter((c) =>
  topicIds.has(c.topicId),
);

/*
 * Every prompt the pack already ships, so a quote cannot reintroduce one.
 *
 * C4 is pack-wide and glosses become prompts verbatim, so this has to see the
 * existing 25,893 as well as the batch being built — Smyth reuses a favourite
 * sentence across topics as readily as within one.
 */
const seenPrompts = new Set();
const testsDir = join(dir, "content", "tests");
for (const file of existsSync(testsDir) ? readdirSync(testsDir) : []) {
  if (!file.endsWith(".json")) continue;
  for (const test of JSON.parse(readFileSync(join(testsDir, file), "utf8"))) {
    for (const q of test.questions ?? []) seenPrompts.add(promptKey(q.prompt));
  }
}

const byTopic = new Map();
const unattestedForms = new Map();

for (const candidate of candidates) {
  const { answer, prompt } = candidate;
  if (!prompt || !answer) {
    funnel.noSource++;
    continue;
  }

  const source = candidate.source ?? (expandRef ? expandRef(candidate.ref) : null);
  if (!source || !source.author || !source.work) {
    funnel.noSource++;
    continue;
  }
  if (source.verse && !keepVerse) {
    funnel.verse++;
    continue;
  }

  const n = words(answer).length;
  if (n < MIN_WORDS) {
    funnel.tooShort++;
    continue;
  }
  if (n > MAX_WORDS) {
    funnel.tooLong++;
    continue;
  }
  if (garbled(answer)) {
    funnel.garbled++;
    continue;
  }

  const missed = missesIn(answer);
  if (missed.size > 0) {
    funnel.unattested++;
    for (const form of missed) {
      unattestedForms.set(form, (unattestedForms.get(form) ?? 0) + 1);
    }
    continue;
  }

  const key = promptKey(prompt);
  if (seenPrompts.has(key)) {
    funnel.duplicate++;
    continue;
  }
  seenPrompts.add(key);

  const { verse, ...shipped } = source;
  if (!byTopic.has(candidate.topicId)) byTopic.set(candidate.topicId, []);
  byTopic.get(candidate.topicId).push({
    prompt,
    answer,
    kind: config.kind ?? profile.questions.defaultKind,
    vocab: words(answer),
    source: shipped,
  });
}

// --- compose ----------------------------------------------------------------

/*
 * A topic with fewer than `minQuestionsPerTest` accepted quotes gets nothing.
 * Padding a short test with generated sentences would put a credited answer
 * beside an uncredited one inside a single round, which reads as if the whole
 * round were quoted.
 */
const written = [];
let questionsWritten = 0;
for (const [topicId, questions] of [...byTopic].sort()) {
  if (questions.length < MIN_QUESTIONS) {
    funnel.thinTopic += questions.length;
    byTopic.delete(topicId);
    continue;
  }
  const path = join(testsDir, `${topicId}.json`);
  const existing = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : [];

  const tests = [];
  for (let i = 0; i < questions.length; i += QUESTIONS) {
    const slice = questions.slice(i, i + QUESTIONS);
    if (slice.length < MIN_QUESTIONS) break;
    tests.push({
      id: `${topicId}-q${tests.length + 1}`,
      sectionId: topicId,
      questions: slice,
    });
    questionsWritten += slice.length;
  }
  if (!tests.length) continue;

  written.push({ topicId, tests: tests.length, questions: tests.length * QUESTIONS });
  if (!planning) {
    // Appended, never overwritten — the same rule `gen-tests.mjs` follows, and
    // the reason the ids are `-q<n>` rather than `-t<n>`: a quoted test and a
    // generated one must not be able to collide.
    writeFileSync(path, `${JSON.stringify([...existing, ...tests], null, 1)}\n`);
  }
}

// --- report -----------------------------------------------------------------

console.log(`\n${profile.id} — quoted questions, from ${from}\n`);
console.log(`  ${String(candidates.length).padStart(6)}  candidates`);
for (const [key, n] of Object.entries(funnel)) {
  if (n) console.log(`  ${String(-n).padStart(6)}  ${key}`);
}
console.log(`\n  ${String(questionsWritten).padStart(6)}  questions kept`);
console.log(`  ${String(written.length).padStart(6)}  topics of ${grammar.length} covered`);
console.log(
  `  ${String(written.reduce((n, w) => n + w.tests, 0)).padStart(6)}  tests ` +
    `${planning ? "would be" : ""} written\n`,
);

if (funnel.unattested) {
  console.log(
    `  the ${funnel.unattested} dropped for attestation are what a raise would buy back.`,
  );
  console.log("  the forms behind them, commonest first:");
  for (const [form, n] of [...unattestedForms].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${String(n).padStart(4)}  ${form}`);
  }
  console.log("");
}

const stats = {
  measuredAt: at("--stamp") ?? null,
  from,
  candidates: candidates.length,
  rejected: funnel,
  questions: questionsWritten,
  topicsCovered: written.length,
  topicsTotal: grammar.length,
  tests: written.reduce((n, w) => n + w.tests, 0),
  perTopic: Object.fromEntries(written.map((w) => [w.topicId, w.questions])),
};

if (!planning) {
  /*
   * Its own file, and not `gen-stats.json`, on purpose. Gate C6 reads that one
   * as a generator's invention rate against `minKeptRatioPct`, and this funnel
   * measures how much of a fixed corpus happens to fit a syllabus. Averaging
   * the two would make C6 mean nothing.
   */
  writeFileSync(
    join(dir, "content", "quote-stats.json"),
    `${JSON.stringify(stats, null, 1)}\n`,
  );
  console.log(`  wrote content/quote-stats.json`);
}

ref.close();
