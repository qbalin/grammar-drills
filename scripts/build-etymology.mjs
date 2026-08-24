#!/usr/bin/env node
/**
 * Build a pack's `content/etymology.txt.gz` from a kaikki.org Wiktionary dump.
 *
 *   node --import tsx scripts/build-etymology.mjs [--pack languages/latin]
 *        [--file kaikki.jsonl.gz] [--kaikki-name "Old English"] [--out path]
 *
 * Where a word came from is the one thing a student asks about a word that this
 * app could answer and did not. The dump has it — wiktextract writes
 * `etymology_text` on every entry — and `scripts/reference/ingest_dictionary.py`
 * reads `word`, `pos`, `senses` and `forms` and drops it on the floor.
 *
 * **This does not touch the reference.** The obvious way to get the field would
 * be to add a column to `dictionary.db` and re-ingest, and that is exactly what
 * `scripts/reference/README.md` says not to do: kaikki regenerates its dumps, so
 * a re-ingest is a *different* database from the one each pack's committed
 * `content/` was generated out of. So this reads the dump directly, joins it
 * against the lemmas the pack already ships, and writes one more file beside
 * them. Nothing existing moves, and no gate, generator or attestation budget
 * reads what comes out — which is why a later dump is fine here and would not be
 * anywhere else. Where a word came from is a fact about the word; whether a form
 * is attested is a claim about *this* pack's dictionary.
 *
 * The file is line-oriented and sorted so the app can bisect it in place, the
 * same shape `paradigms.txt.gz` has and keyed the same way:
 *
 *   lemma|pos \t <text>          one line per lemma, sorted, code-unit order
 *
 * `lemma` and `pos` come straight off kaikki's `word` and `pos` on the way in
 * to `lemmas.json.gz`, so the join is exact rather than fuzzy. Newlines inside
 * a text are escaped `\n` and read back as paragraphs; tabs become spaces,
 * since a tab is what separates the key. The one thing dropped on the way
 * through is the rendered ancestor tree — see `trimTree`.
 *
 * **A pack whose dictionary is not Wiktionary-derived gets no file.** Ancient
 * Greek is built from Eulexis, which carries no etymology at all, and running
 * its kaikki dump against it would join almost nothing — so a match rate under
 * `MIN_MATCH` is an error rather than a very short file.
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { args, loadLemmaTable, loadProfile, packDir, REPO } from "./lib/pack.mjs";

/**
 * How much of the pack's dictionary the dump has to reach.
 *
 * Not a quality bar — plenty of real lemmas have no etymology written, and the
 * tail of a big pack is mostly rare words nobody has got to. It is here to
 * catch the one mistake that produces a plausible-looking file: a dump of the
 * wrong language, or of a language whose headwords are spelled another way, in
 * which case nearly every key misses and the feature quietly does nothing.
 */
const MIN_MATCH = 0.05;

/**
 * How long a joined etymology may be.
 *
 * Wiktionary's longest run to several paragraphs of cognates across a dozen
 * languages, and a homograph pair doubles that. The cap is generous enough that
 * an ordinary entry is never touched and mean enough that the file cannot be
 * run away with by a handful of essays.
 */
const MAX_TEXT = 1200;

const argv = process.argv.slice(2);
const { at: opt } = args(argv);
const dir = packDir(argv);
const profile = loadProfile(dir);
const OUT = opt("--out", join(dir, "content", "etymology.txt.gz"));
const KAIKKI_NAME = opt("--kaikki-name", profile.l2.name);

/** The dump's URL, as `scripts/reference/ingest_dictionary.py` spells it. */
function defaultUrl(name) {
  const quoted = encodeURIComponent(name);
  const compact = name.replace(/ /g, "");
  return (
    `https://kaikki.org/dictionary/${quoted}/` +
    `kaikki.org-dictionary-${compact}.jsonl.gz`
  );
}

/**
 * The dump on disk, downloading it first if it is not.
 *
 * Cached under `.cache/` rather than fetched every run: it is about a gigabyte,
 * and the only reason to want a second copy is a second language.
 */
async function dumpPath() {
  const given = opt("--file");
  if (given) return given;
  const cache = join(REPO, ".cache", "kaikki");
  const path = join(cache, `${KAIKKI_NAME.replace(/ /g, "")}.jsonl.gz`);
  if (existsSync(path)) return path;
  const url = opt("--url", defaultUrl(KAIKKI_NAME));
  mkdirSync(cache, { recursive: true });
  console.log(`downloading ${url}\n  -> ${path}`);
  const res = await fetch(url, { headers: { "User-Agent": "language-tutor/1.0" } });
  if (!res.ok || !res.body) {
    throw new Error(`could not download the dump (${res.status} ${res.statusText})`);
  }
  const { createWriteStream } = await import("node:fs");
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
  return path;
}

/**
 * The rendered `{{etymology tree}}` template, taken off the front of a text.
 *
 * A third of Latin's entries begin with one: the word "Etymology tree", then a
 * row per ancestor — `Proto-Indo-European *h₁es-`, `Proto-Italic *ezom~*som`,
 * `Old Latin esum`, `Latin sum` — and only then the prose. It is a diagram on
 * Wiktionary and a stack of orphaned fragments anywhere else, and it is three
 * quarters of what those entries weigh.
 *
 * The tree's last row is always the headword in this pack's own language, which
 * is what makes this a rule rather than a guess: find the last row starting
 * `Latin ` and drop everything through it. Two entries in 38,532 run that row
 * into the prose that follows, and there the header alone comes off — dropping
 * what cannot be identified is not on offer. Nor is dropping the lot: the last
 * paragraph is never a candidate, so a text can never be trimmed to nothing.
 */
function trimTree(text, l2) {
  const paras = text.split(/\r?\n/);
  if (paras[0]?.trim() !== "Etymology tree") return text;
  let last = 0;
  for (let i = 1; i < paras.length - 1; i += 1) {
    if (paras[i].startsWith(`${l2} `)) last = i;
  }
  return paras.slice(last + 1).join("\n");
}

/** One line of the file, from a text that may hold newlines and tabs. */
function encode(text) {
  return text.replace(/\t/g, " ").replace(/\r?\n/g, "\\n").trim();
}

const wanted = new Set(loadLemmaTable(dir).map((e) => `${e.lemma}|${e.pos}`));
console.log(`${wanted.size} lemmas shipped by ${profile.id}`);

const path = await dumpPath();
console.log(`reading ${path}`);

/** key -> the distinct etymologies the dump files under it, in dump order. */
const found = new Map();
let lines = 0;
let homographs = 0;

const source = path.endsWith(".gz")
  ? createReadStream(path).pipe(createGunzip())
  : createReadStream(path);
for await (const line of createInterface({ input: source, crlfDelay: Infinity })) {
  lines += 1;
  if (lines % 200000 === 0) {
    console.log(`  ${lines} lines, ${found.size} lemmas matched`);
  }
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const text = trimTree((e.etymology_text ?? "").trim(), profile.l2.name);
  if (!text || !e.word || !e.pos) continue;
  const key = `${e.word}|${e.pos}`;
  if (!wanted.has(key)) continue;
  const texts = found.get(key);
  if (!texts) {
    found.set(key, [text]);
    continue;
  }
  /*
   * A second, different etymology under one key.
   *
   * Wiktionary files homographs as separate entries under the same headword and
   * part of speech — *levis* "light" and *levis* "smooth" — while
   * `lemmas.json.gz` deduped by `lemma|pos`, so both land here. Keeping only the
   * first would print the wrong origin about half the time on exactly the words
   * whose origin is worth asking about, so both are kept and the sheet shows
   * them as what they are: two answers, not one.
   */
  if (texts.includes(text)) continue;
  if (texts.length === 1) homographs += 1;
  texts.push(text);
}

const rows = [...found]
  .map(([key, texts]) => [key, encode(texts.join(" · ")).slice(0, MAX_TEXT)])
  .filter(([, text]) => text !== "")
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const share = rows.length / wanted.size;
if (share < MIN_MATCH) {
  console.error(
    `only ${rows.length} of ${wanted.size} lemmas matched (${(share * 100).toFixed(1)}%).\n` +
      `That is a dump of another language, or of a dictionary that spells its\n` +
      `headwords differently — this pack's own dictionary is not Wiktionary's.\n` +
      `Nothing was written.`,
  );
  process.exit(1);
}

const text = rows.map(([key, t]) => `${key}\t${t}`).join("\n");
const gz = gzipSync(Buffer.from(text, "utf8"), { level: 9 });
writeFileSync(OUT, gz);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `\n${rows.length} of ${wanted.size} lemmas have an etymology ` +
    `(${(share * 100).toFixed(1)}%), ${homographs} of them more than one`,
);
console.log(
  `${OUT}  ${kb(Buffer.byteLength(text))} raw  ->  ${kb(gz.length)} gz`,
);
