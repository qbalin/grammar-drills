#!/usr/bin/env node
/**
 * Distil a pack's frequency list out of the reference databases and into the
 * repo, so the gates stop needing a 474 MB file to run.
 *
 *   node --import tsx scripts/make-reference.mjs --pack languages/latin --ref /path/to/languages/latin
 *   node --import tsx scripts/make-reference.mjs --pack languages/latin --ref ... --check
 *
 * What it writes is `reference/frequency.tsv.gz`: rank, lemma, lemma_norm, pos,
 * ordered by rank. 195 KB for Latin and 285 KB for Greek, against the 2 MB
 * SQLite file it replaces — small enough to commit, which is the whole point.
 * `count` is dropped because nothing reads it; rank is written out rather than
 * left implicit in the row order so that D3 stays a real check on this file.
 *
 * This is the only half of the reference that gets vendored. The dictionary
 * does not: `build-lemmas.mjs` and the packs' `citations.mjs` need its `data`
 * and `tags` columns and are run once per pack on a machine that has it, while
 * everything else — the gates, the reports, `gen-tests` — is answered by the
 * pack's own `content/lemmas.json.gz`. See `scripts/reference/README.md` for
 * how to build a dictionary in the first place.
 *
 * `--check` compares against the committed file and writes nothing, which is
 * how you tell that a file in the repo is still the one this script produces.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadProfile, packDir,
  args,
} from "./lib/pack.mjs";
import { FREQUENCY_FILE, referenceDir } from "./lib/reference.mjs";

const argv = process.argv.slice(2);
const { at: opt } = args(argv);
const CHECK = argv.includes("--check");
const dir = packDir(argv);
const profile = loadProfile(dir);
const ref = opt("--ref") ?? process.env.LANG_REF;

if (!ref) {
  console.error(
    "--ref is required: this reads the reference frequencies.db, which is not " +
      "in this repo.\nSee scripts/reference/README.md for how to build one.",
  );
  process.exit(1);
}

const freqPath = join(ref, "frequencies.db");
if (!existsSync(freqPath)) {
  console.error(`No frequencies.db at ${ref}.`);
  process.exit(1);
}

const db = new DatabaseSync(freqPath, { readOnly: true });
const rows = db
  .prepare("select rank, lemma, lemma_norm, pos from frequency order by rank")
  .all();
db.close();

/**
 * Tab, newline and backslash, spelled out.
 *
 * Not hypothetical: Latin's rank 19,053 is `obtendō\nFuture active participle
 * of obtineo`, a Wiktionary headword-line note that leaked into the frequency
 * table upstream. Written raw it becomes two lines, and the file then has two
 * more rows than the table it came from and one row whose fields are shifted —
 * which is exactly how D2 and D3 caught it. The junk row is faithfully junk
 * here; repairing it is the ingest's business, not this script's.
 */
const escape = (s) =>
  String(s ?? "").replace(
    /[\\\t\n\r]/g,
    (c) => ({ "\\": "\\\\", "\t": "\\t", "\n": "\\n", "\r": "\\r" })[c],
  );

// A tab-separated table rather than JSON: it is read once, whole, by a reader
// that splits on tabs, and the field names would otherwise be repeated 19,342
// times for no reader's benefit.
const tsv = rows
  .map((r) => [r.rank, r.lemma, r.lemma_norm, r.pos].map(escape).join("\t"))
  .join("\n");
const packed = gzipSync(Buffer.from(tsv, "utf8"), { level: 9 });

const out = join(referenceDir(dir), FREQUENCY_FILE);

if (CHECK) {
  if (!existsSync(out)) {
    console.error(`${out} does not exist.`);
    process.exit(1);
  }
  // Compared after decompressing: gzip output is not byte-stable across zlib
  // versions, and a different compressor on the same table is not a difference
  // anybody wants reported.
  const same = gunzipSync(readFileSync(out)).toString("utf8") === tsv;
  console.log(
    same
      ? `${out} matches ${freqPath} (${rows.length} lemmas)`
      : `${out} DIFFERS from what ${freqPath} produces`,
  );
  process.exit(same ? 0 : 1);
}

mkdirSync(referenceDir(dir), { recursive: true });
writeFileSync(out, packed);
console.log(
  `wrote ${out} — ${rows.length} lemmas ranked 1..${rows[rows.length - 1].rank}, ` +
    `${(packed.length / 1024).toFixed(0)} KB`,
);
