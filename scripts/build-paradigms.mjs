#!/usr/bin/env node
/**
 * Build a pack's `content/paradigms.txt.gz` from the reference dictionary.
 *
 * The forms were always there — `build-lemmas.mjs` walks every one of them to
 * key the map, and throws away the tags that say which form it is. Keeping them
 * is what lets a student ask a word for its own declension rather than reading
 * a model exemplar in the grammar and hoping the word follows it.
 *
 *   node --import tsx scripts/build-paradigms.mjs [--pack languages/latin]
 *        [--ref /path/to/ref] [--max-rank 20000] [--out path]
 *
 * The file is line-oriented and sorted so the web can bisect it in place, the
 * same trick `forms.txt.gz` plays and for the same reason: 757,222 forms is a
 * lot of object to build in a phone just to read one word's worth.
 *
 *   <signature>|<signature>|…              line 1: the tag signatures, interned
 *   lemma|pos \t <code>:<form> \t …        then one line per word, sorted
 *
 * `<code>` is a base-36 index into line 1. There are only a few hundred
 * distinct signatures against three quarters of a million forms, so interning
 * them takes the file from 37 MB to 12 MB before it is even compressed — and
 * it is the uncompressed size that the browser has to hold.
 *
 * The separator is a tab rather than a space because 66,000 of the forms are
 * two words — `post scriptum`, every phrase the dictionary inflects — and a
 * space would take them apart. Nothing in the reference holds a tab; the check
 * below is what says so.
 *
 * How the signatures become a grid is not decided here. That is the pack's
 * `profile.paradigms`, read at render time, so the layout of a table can be
 * corrected without anyone rebuilding a 474 MB database.
 */
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { loadProfile, packDir,
  args,
} from "./lib/pack.mjs";
import { openReference, requireDictionary } from "./lib/reference.mjs";

const argv = process.argv.slice(2);
const { at: opt } = args(argv);
const dir = packDir(argv);
const profile = loadProfile(dir);
// Same contract as build-lemmas: the tagged forms are the one thing the pack's
// own content cannot answer for, because they are what built it.
let ref;
try {
  ref = requireDictionary(openReference(dir, profile, argv), profile);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const MAX_RANK = Number(opt("--max-rank", 20000));
const OUT = opt("--out", join(dir, "content", "paradigms.txt.gz"));

/**
 * Rows that are notation rather than forms, dropped exactly as the ingest drops
 * them, plus the headword row: `canonical` is the word as the entry titles it,
 * which the student is already looking at as the citation.
 */
const SKIP_TAGS = new Set([
  "table-tags",
  "inflection-template",
  "class",
  "multiword-construction",
  "romanization",
  "canonical",
]);
const SKIP_FORMS = new Set(["", "-", "—"]);

/** Interned tag signatures. Sorted, because the ingest does not sort them. */
const codeOf = new Map();
const signatures = [];
function intern(tags) {
  const key = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .sort()
    .join(",");
  let code = codeOf.get(key);
  if (code === undefined) {
    code = signatures.length;
    signatures.push(key);
    codeOf.set(key, code);
  }
  return code.toString(36);
}

const lines = [];
const seen = new Set();
let forms = 0;

/**
 * A headword or a form carrying a tab or a line break would break the file
 * silently, one word at a time. Neither has ever appeared in the reference;
 * finding out here rather than in a phone is the point.
 */
const UNREPRESENTABLE = /[\t\r\n]/;
function representable(text, what) {
  if (!UNREPRESENTABLE.test(text)) return true;
  console.error(`${what} ${JSON.stringify(text)} holds a tab or a line break.`);
  process.exit(1);
}

/**
 * The same form, said twice, once more vaguely.
 *
 * An entry's headword line is a form row too, so `rēgis` arrives tagged
 * `{genitive}` beside the `{genitive, singular}` row of the table proper, and
 * an adjective's `bona` arrives tagged `{feminine}` beside
 * `{feminine, nominative, singular}`. The vaguer of the two is the one that
 * cannot be placed in a grid, so without this every noun and adjective would
 * carry a short list of forms it already shows, under a heading that says they
 * did not fit anywhere.
 *
 * Strict subset, and only against the same spelling: two genuinely different
 * forms never collapse, and a form whose only row is a vague one — a
 * comparative, an adverb — is kept, because there it is the whole answer.
 */
function redundant(row, rows) {
  return rows.some(
    (other) =>
      other !== row &&
      other.form === row.form &&
      other.tags.length > row.tags.length &&
      row.tags.every((tag) => other.tags.includes(tag)),
  );
}

for (const row of ref.ranked(MAX_RANK)) {
  for (const entry of ref.entriesFor(row.lemma_norm, row.pos)) {
    // Keyed the way build-web-content.mjs dedupes entries, so a LemmaEntry
    // resolves its paradigm from what it already carries and needs no index.
    const key = `${entry.word}|${entry.pos}`;
    if (seen.has(key)) continue;
    seen.add(key);
    representable(key, "headword");

    const kept = [];
    for (const { form, tags } of ref.formsFor(entry.id)) {
      if (form == null || SKIP_FORMS.has(form)) continue;
      const list = (tags ?? "").split(",").filter(Boolean);
      if (list.some((t) => SKIP_TAGS.has(t))) continue;
      representable(form, "form");
      kept.push({ form, tags: list });
    }

    const cells = [];
    for (const row of kept) {
      if (redundant(row, kept)) continue;
      cells.push(`${intern(row.tags.join(","))}:${row.form}`);
      forms++;
    }
    if (cells.length) lines.push(`${key}\t${cells.join("\t")}`);
  }
}

// Code-unit order, which is what the reader bisects with. A locale-aware
// collation here would silently miss entries — see lemma-index.ts.
lines.sort();

ref.close();
const body = `${signatures.join("|")}\n${lines.join("\n")}`;
const gz = gzipSync(Buffer.from(body, "utf8"), { level: 9 });
writeFileSync(OUT, gz);
console.log(
  `${lines.length} words of the top ${MAX_RANK} · ${forms} forms · ` +
    `${signatures.length} distinct tag signatures`,
);
console.log(
  `wrote ${OUT} — ${(body.length / 1024 / 1024).toFixed(1)} MB raw, ` +
    `${(gz.length / 1024).toFixed(0)} KB gz`,
);
