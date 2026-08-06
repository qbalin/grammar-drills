#!/usr/bin/env node
/**
 * Repack `content/` into the five assets the web app fetches.
 *
 * The CLI reads `content/` straight off disk, where a 43 MB JSON costs nothing.
 * A phone cannot pay that: `lemmas.json.gz` inflates to 42.9 MB, and parsing it
 * would blow both the time and the memory budget for a feature used a handful
 * of times a session. But the map is almost entirely repetition — 242,746 form
 * keys point at just 6,747 distinct lemmas, each carrying its own copy of the
 * gloss. Splitting it into a lemma table plus a form -> index index removes the
 * duplication (6.1 MB), and writing the index as sorted text rather than JSON
 * means the browser never builds a 242k-key object at all: it bisects the raw
 * string. See apps/web/src/lemma-index.ts for the reader.
 *
 *   grammar.json.gz  the 135 sections, verbatim          ~122 KB gz  eager
 *   tests.json.gz    all 135 test files, merged          ~275 KB gz  eager
 *   lemmas.json.gz   the distinct lemmas, as LemmaEntry[] ~285 KB gz  lazy
 *   forms.txt.gz     `form\tidx[,idx...]` per line, sorted ~700 KB gz  lazy
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

/** The five, in the order the version stamp hashes them. */
const ASSETS = [
  "grammar.json.gz",
  "tests.json.gz",
  "lemmas.json.gz",
  "forms.txt.gz",
  "paradigms.txt.gz",
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
// Shipped as-is: every field is read at runtime, and `text` is the whole point.

function buildGrammar() {
  const grammar = JSON.parse(
    readFileSync(join(contentDir, "grammar.json"), "utf8"),
  );
  writeGz("grammar.json.gz", JSON.stringify(grammar));
  return grammar;
}

// --- tests ------------------------------------------------------------------

/**
 * One file per section becomes one `Record<sectionId, Test[]>`, which is the
 * shape `ContentData.tests` already wants. Two fields are dropped on the way:
 * `Question.vocab` is a generation-time validation artifact the runtime never
 * reads, and `Test.sectionId` is the map key. Together they are ~40% of the
 * bytes. `Question.note` is unused by every shipped question but is part of the
 * type and costs nothing, so it survives.
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
      })),
    }));
    count += parsed.length;
  }
  writeGz("tests.json.gz", JSON.stringify(tests));
  return { sections: Object.keys(tests).length, tests: count };
}

// --- lemmas -----------------------------------------------------------------

/**
 * The index is line-oriented and tab-separated, so a form may contain anything
 * except a tab or a line break. It need not be ASCII: 35 forms are ligatures or
 * medieval abbreviation glyphs (`quæ`, `cœlum`, `ꝯ`) that `normalize()` has no
 * reason to fold away, and they look up fine — the reader bisects a decoded JS
 * string, which compares by code unit whatever the alphabet.
 */
const UNREPRESENTABLE = /[\t\r\n]/;

/**
 * Collapse `Record<form, LemmaEntry[]>` into a table of distinct entries plus a
 * sorted `form\tidx[,idx...]` index into it.
 *
 * Two invariants the reader depends on:
 *  - candidate order within a form is preserved (`lookupForm` promises
 *    most-frequent-first, and the vocab picker offers them in that order);
 *  - lines are sorted by code unit, because the bisection compares that way.
 */
function buildLemmas() {
  const map = JSON.parse(
    gunzipSync(readFileSync(join(contentDir, "lemmas.json.gz"))).toString(
      "utf8",
    ),
  );

  const entries = [];
  const indexOf = new Map(); // `lemma|pos` -> position in `entries`
  const lines = [];

  for (const form of Object.keys(map)) {
    if (form === "" || UNREPRESENTABLE.test(form)) {
      throw new Error(
        `form key ${JSON.stringify(form)} is empty or holds a tab/line break — ` +
          `the line-oriented index cannot represent it. normalize() should have ` +
          `folded it; check packages/core/src/normalize.ts.`,
      );
    }
    const ids = [];
    for (const entry of map[form]) {
      const key = `${entry.lemma}|${entry.pos}`;
      let id = indexOf.get(key);
      if (id === undefined) {
        id = entries.length;
        indexOf.set(key, id);
        entries.push(entry);
      }
      // Named once per form, however many entries collapsed onto it. The
      // dictionary has two `flumen` nouns and the repack makes them one, so
      // without this the crib offers a choice between a word and itself.
      if (!ids.includes(id)) ids.push(id);
    }
    lines.push(`${form}\t${ids.join(",")}`);
  }

  // Sort by code unit — `Array.sort()`'s default, and what the reader bisects
  // with. A locale-aware collation here would silently break lookups.
  lines.sort();

  writeGz("lemmas.json.gz", JSON.stringify(entries));
  writeGz("forms.txt.gz", lines.join("\n"));
  return { forms: lines.length, lemmas: entries.length, keys: indexOf };
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
const tests = buildTests();
const lemmas = buildLemmas();
const paradigms = buildParadigms();
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
