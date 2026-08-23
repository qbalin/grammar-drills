#!/usr/bin/env node
/**
 * Repack `content/` into the five assets the web app fetches.
 *
 * There is less to this than there was. The dictionary used to arrive here as
 * one denormalized `Record<form, LemmaEntry[]>` and get split into a lemma
 * table plus a sorted form index, because a phone could not parse the map. The
 * pack ships it split now — the CLI could not parse it either once the whole
 * dictionary went in — so the dictionary is copied through and this script is
 * back to being about grammar and tests. See `scripts/lib/lemma-map.mjs` for
 * the split and `@lang-tutor/core`'s `LemmaIndex` for the reader.
 *
 *   grammar.json.gz  every section, verbatim              ~148 KB gz  eager
 *   tests.json.gz    every test file, merged               ~485 KB gz  eager
 *   lemmas.json.gz   the distinct lemmas, as LemmaEntry[] ~2.1 MB gz  lazy
 *   forms.txt.gz     `form\tidx[,idx...]` per line, sorted ~3.2 MB gz  lazy
 *   paradigms.txt.gz every word's tagged forms, sorted   ~2.5 MB gz  lazier
 *
 * `paradigms.txt.gz` is copied through rather than repacked: it is already the
 * line-oriented, bisectable, interned shape a phone can read, because
 * `scripts/build-paradigms.mjs` wrote it that way. It is much the largest of
 * the five and is fetched only when a student asks a word for its table, which
 * is why it is neither precached nor loaded with the dictionary.
 *
 * Usage: node scripts/build-web-content.mjs [--pack languages/latin] [--out apps/web/public/content]
 *
 * `--pack` names a language pack directory; its `content/` is what gets
 * repacked. `--content` still points straight at a content directory.
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { splitLemmaMap } from "./lib/lemma-map.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  options: {
    pack: { type: "string" },
    content: { type: "string" },
    out: { type: "string" },
  },
});
const packDir =
  values.pack ?? join(repoRoot, "languages", process.env.LANG_PACK ?? "latin");
const contentDir = values.content ?? join(packDir, "content");
const outDir = values.out ?? join(repoRoot, "apps", "web", "public", "content");
const profile = JSON.parse(readFileSync(join(packDir, "profile.json"), "utf8"));

/**
 * What the version stamp hashes, in order — the five, plus one per further
 * grammar the pack ships. A book left out of this keeps its first bytes in
 * everyone's cache for good, which is the whole reason the stamp exists.
 */
const ASSETS = [
  "grammar.json.gz",
  ...(profile.grammars ?? []).map((g) => `grammar-${g.id}.json.gz`),
  ...(profile.grammars?.length ? ["crosswalk.json.gz"] : []),
  "tests.json.gz",
  "lemmas.json.gz",
  "forms.txt.gz",
  "paradigms.txt.gz",
  ...(profile.dictionaries ?? []).flatMap((d) => [
    `dict-${d.id}.json.gz`,
    `dict-${d.id}-forms.txt.gz`,
  ]),
];

/** gzip at the highest level — these are written once and shipped forever. */
function writeGz(name, text) {
  const gz = gzipSync(Buffer.from(text, "utf8"), { level: 9 });
  writeFileSync(join(outDir, name), gz);
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    `  ${name.padEnd(16)} ${kb(Buffer.byteLength(text)).padStart(8)} raw  ->  ${kb(gz.length).padStart(8)} gz`,
  );
}

// --- grammar ----------------------------------------------------------------
// Nearly as-is: every field but one is read at runtime, and `text` is the whole
// point.

/**
 * `examples` is dropped for the same reason `Question.vocab` is: it is an input
 * to generation, not something the app reads.
 *
 * Smyth cites an attested sentence for most of what he teaches, and the parser
 * now keeps those as data so `quote-tests.mjs` can turn them into questions.
 * Once it has, the ones that became questions are in `tests/` with their
 * `source`, and the ones that did not are a working file. Shipping all 2,768 to
 * a phone that renders none of them would put ~400 KB on the grammar bundle to
 * no end.
 */
function buildGrammar(from = "grammar.json", to = "grammar.json.gz") {
  const grammar = JSON.parse(readFileSync(join(contentDir, from), "utf8"));
  const shipped = grammar.map(({ examples, ...topic }) => topic);
  writeGz(to, JSON.stringify(shipped));
  return grammar;
}

/**
 * A pack's further grammars, one bundle apiece.
 *
 * Separate files rather than one, because the app opens one book at a time and
 * the other costs nothing until it is asked for: Lane's is 986 KB of prose, and
 * precaching a book nobody has switched to would be the whole download again for
 * a page that never draws it. The service worker precaches the primary and
 * fetches these on demand.
 */
function buildSecondaryGrammars() {
  for (const g of profile.grammars ?? []) {
    buildGrammar(g.content, `grammar-${g.id}.json.gz`);
  }
  /*
   * And the table that makes them teachable. A further grammar has no questions
   * of its own — its topics reach the primary's through this, and without it a
   * second book is 459 topics of prose with nothing behind any of them. Small
   * enough to ship beside the primary rather than on demand: it is the index,
   * not the book.
   */
  if (profile.grammars?.length) {
    const path = join(contentDir, "grammars", "crosswalk.json");
    if (!existsSync(path)) {
      console.error(
        `\n${path} is missing — run scripts/build-crosswalk.mjs.\n` +
          "Without it the further grammars ship unteachable.",
      );
      process.exit(1);
    }
    writeGz("crosswalk.json.gz", readFileSync(path, "utf8"));
  }
}

/**
 * A pack's further dictionaries, two files apiece, copied through as built.
 *
 * Flattened out of `content/dictionaries/` into `dict-<id>.*` at the top of the
 * output, the same way a further grammar's `grammars/lane.json` becomes
 * `grammar-lane.json.gz`. Two reasons, and both bite: `writeGz` does not create
 * directories, and the service worker's runtime-cache pattern matches a single
 * path segment, so a file one directory down would be fetched on every launch
 * and cached on none.
 *
 * Copied byte-for-byte rather than repacked. `build-dictionary.mjs` already
 * gzipped these at level 9 and asserted the two invariants the reader depends
 * on; re-gzipping here would only be a second chance to get them wrong.
 */
function buildDictionaries() {
  const want = new Set();
  for (const d of profile.dictionaries ?? []) {
    for (const [from, to] of [
      [d.content, `dict-${d.id}.json.gz`],
      [d.index, `dict-${d.id}-forms.txt.gz`],
    ]) {
      const path = join(contentDir, from);
      if (!existsSync(path)) {
        console.error(
          `\n${path} is missing — run the pack's parser and then ` +
            `scripts/build-dictionary.mjs --pack ${packDir}.`,
        );
        process.exit(1);
      }
      const gz = readFileSync(path);
      writeFileSync(join(outDir, to), gz);
      want.add(to);
      console.log(`  ${to.padEnd(30)} ${(gz.length / 1024).toFixed(0)} KB`);
    }
  }
  /*
   * And sweep any other pack's. `outDir` is reused between languages — the
   * deploy builds each one into the same tree in turn — so a `dict-` file this
   * pack does not declare is the last pack's, and leaving it would ship Lewis &
   * Short inside the Greek build for a student to open and find Latin in.
   */
  for (const name of readdirSync(outDir)) {
    if (name.startsWith("dict-") && !want.has(name)) {
      rmSync(join(outDir, name));
      console.log(`  ${name.padEnd(30)} removed — not this pack's`);
    }
  }
}

// --- tests ------------------------------------------------------------------

/**
 * One file per section becomes one `Record<sectionId, Test[]>`, which is the
 * shape `ContentData.tests` already wants. Two fields are dropped on the way:
 * `Question.vocab` is a generation-time validation artifact the runtime never
 * reads, and `Test.sectionId` is the map key. Together they are ~40% of the
 * bytes. `Question.note` is unused by every shipped question but is part of the
 * type and costs nothing, so it survives.
 *
 * `Question.source` survives because it is the opposite case: it is read at
 * runtime, and it is the only thing on screen that says a sentence was written
 * by somebody rather than generated. A question that lost it would be a
 * quotation with no quotation marks.
 */
function buildTests() {
  const testsDir = join(contentDir, "tests");
  const tests = {};
  let count = 0;
  for (const file of readdirSync(testsDir).sort()) {
    if (!file.endsWith(".json")) continue;
    const sectionId = basename(file, ".json");
    const parsed = JSON.parse(readFileSync(join(testsDir, file), "utf8"));
    tests[sectionId] = parsed.map((t) => ({
      id: t.id,
      questions: t.questions.map((q) => ({
        prompt: q.prompt,
        answer: q.answer,
        kind: q.kind,
        ...(q.note ? { note: q.note } : {}),
        ...(q.source ? { source: q.source } : {}),
      })),
    }));
    count += parsed.length;
  }
  writeGz("tests.json.gz", JSON.stringify(tests));
  return { sections: Object.keys(tests).length, tests: count };
}

// --- lemmas -----------------------------------------------------------------

/**
 * Copy the pack's dictionary through, splitting it first only if it is old.
 *
 * The split used to happen here: this script turned the pack's denormalized
 * `Record<form, LemmaEntry[]>` into a lemma table plus a sorted index, because
 * a phone could not afford the map. Now the pack ships split — the CLI could
 * not afford it either, once the whole dictionary went in — so for a rebuilt
 * pack there is nothing left to do but copy the two files and count them.
 *
 * A pack built before the split still ships the map, and `splitLemmaMap` is
 * still here to handle it, so a half-migrated tree builds.
 */
function buildLemmas() {
  const dictionary = JSON.parse(
    gunzipSync(readFileSync(join(contentDir, "lemmas.json.gz"))).toString(
      "utf8",
    ),
  );

  if (!Array.isArray(dictionary)) {
    const { entries, lines, keys } = splitLemmaMap(dictionary);
    writeGz("lemmas.json.gz", JSON.stringify(entries));
    writeGz("forms.txt.gz", lines.join("\n"));
    return { forms: lines.length, lemmas: entries.length, keys };
  }

  const index = gunzipSync(readFileSync(join(contentDir, "forms.txt.gz"))).toString(
    "utf8",
  );
  writeGz("lemmas.json.gz", JSON.stringify(dictionary));
  writeGz("forms.txt.gz", index);
  const keys = new Map(dictionary.map((e, i) => [`${e.lemma}|${e.pos}`, i]));
  return {
    forms: index ? index.split("\n").length : 0,
    lemmas: dictionary.length,
    keys,
  };
}

// --- paradigms ---------------------------------------------------------------

/**
 * Copied byte for byte, and absent without complaint.
 *
 * A pack that has not built its paradigms is a pack whose words show their
 * citation and no table — a feature missing, not a build broken — so this
 * reports the gap rather than failing on it.
 */
function buildParadigms() {
  const from = join(contentDir, "paradigms.txt.gz");
  const to = join(outDir, "paradigms.txt.gz");
  if (!existsSync(from)) {
    // Deleted, not merely skipped. `outDir` is reused between packs — the
    // deploy builds every language into the same tree, one after another — so
    // leaving the last pack's file behind would ship Latin's paradigms inside
    // the Greek build, where every key misses and every word looks defective.
    if (existsSync(to)) rmSync(to);
    console.log(`  paradigms.txt.gz  not built for this pack — words will show no table`);
    return null;
  }
  const gz = readFileSync(from);
  writeFileSync(to, gz);
  const text = gunzipSync(gz).toString("utf8");
  const lines = text.split("\n");
  const words = text.indexOf("\n") === -1 ? 0 : lines.length - 1;
  // The first line interns the tag signatures; every line after it is keyed
  // `lemma|pos`, which is what a `LemmaEntry` already carries.
  const keys = new Set(lines.slice(1).filter(Boolean).map((l) => l.split("\t")[0]));
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    `  ${"paradigms.txt.gz".padEnd(16)} ${kb(Buffer.byteLength(text)).padStart(8)} raw  ->  ` +
      `${kb(gz.length).padStart(8)} gz`,
  );
  return { words, keys };
}

// --- run --------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
console.log(`Repacking ${contentDir} -> ${outDir}`);
const grammar = buildGrammar();
buildSecondaryGrammars();
const tests = buildTests();
const lemmas = buildLemmas();
const paradigms = buildParadigms();
buildDictionaries();
console.log(
  `\n${grammar.length} sections · ${tests.tests} tests over ${tests.sections} topics · ` +
    `${lemmas.lemmas} lemmas over ${lemmas.forms} forms` +
    (paradigms ? ` · ${paradigms.words} words with a paradigm` : ""),
);

/*
 * A stamp the app hangs on every content URL.
 *
 * The five assets have fixed names and change with every rebuild, and three of
 * them are held by the service worker under `CacheFirst` — which, by design,
 * never asks again. Without something in the URL to move, a browser that
 * fetched `paradigms.txt.gz` once keeps that copy for good, and a content fix
 * reaches everyone except the people already using the app.
 *
 * Hashing the bytes rather than stamping the clock keeps the URL stable when
 * the content is: rebuilding the same pack twice does not invalidate anyone's
 * cache, and `vite.config.ts` reads this back to compile it in.
 */
const stamp = createHash("sha256");
for (const name of ASSETS) {
  const path = join(outDir, name);
  if (existsSync(path)) stamp.update(name).update(readFileSync(path));
}
const version = stamp.digest("hex").slice(0, 12);
writeFileSync(join(outDir, "version.txt"), version);
console.log(`content version ${version}`);

// How many of the dictionary's own entries the tables do not reach. Most are
// genuinely indeclinable — `sine`, `aut`, `enim` decline for nobody — so this
// is a number to watch rather than a gate: it is only alarming if it moves.
if (paradigms) {
  const missing = [...lemmas.keys.keys()].filter((key) => !paradigms.keys.has(key));
  const share = ((missing.length / lemmas.lemmas) * 100).toFixed(1);
  console.log(`${missing.length} of them have no paradigm (${share}%)`);
}
