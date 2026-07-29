#!/usr/bin/env node
/**
 * Build a pack's `content/lemmas.json.gz` from the reference databases.
 *
 * This did not exist. Latin's dictionary map was an artifact nobody could
 * rebuild — not in this repo and not in the reference project — which meant a
 * second language had no way to produce the one file the vocabulary crib and
 * the whole web dictionary are made of. That is the gap this closes.
 *
 * What it makes: folded inflected form -> ranked lemma candidates.
 *
 *   { "manibus": [ { lemma, citation, gloss, pos, gender?, declension?, rank } ] }
 *
 * The citation here is the plain headword. Turning it into what a dictionary
 * actually prints — principal parts, adjective terminations, an article — is
 * per-language and belongs to the pack's own `citations.mjs`, which is run
 * after this and rewrites them in place.
 *
 *   node --import tsx scripts/build-lemmas.mjs [--pack languages/latin]
 *        [--ref /path/to/ref] [--max-rank 7000] [--verify] [--out path]
 *
 * `--verify` builds the map and compares it against the one already shipped
 * without writing anything. Use it on a pack whose map predates this script:
 * a high key overlap says the builder agrees with however the original was
 * made, which is the only evidence available that it is doing the right thing.
 */
import { existsSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { compileFold } from "@lang-tutor/core";
import { loadLemmas, loadProfile, packDir, refDir } from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const dir = packDir(argv);
const profile = loadProfile(dir);
const fold = compileFold(profile.fold);
const ref = refDir(profile, argv);
const VERIFY = argv.includes("--verify");
const MAX_RANK = Number(opt("--max-rank", 7000));
const OUT = opt("--out", join(dir, "content", "lemmas.json.gz"));

for (const db of ["dictionary.db", "frequencies.db"]) {
  if (!existsSync(join(ref, db))) {
    console.error(
      `No ${db} at ${ref}.\nSet --ref or LANG_REF; see ADDING_A_LANGUAGE.md for the schema these must have.`,
    );
    process.exit(1);
  }
}

const dict = new DatabaseSync(join(ref, "dictionary.db"), { readOnly: true });
const freq = new DatabaseSync(join(ref, "frequencies.db"), { readOnly: true });

// Ranked lemmas are the spine: the map exists to answer "what is this word",
// and a word nobody writes is not worth the bytes on a phone.
const ranked = freq
  .prepare("select lemma, lemma_norm, pos, rank from frequency where rank <= ? order by rank")
  .all(MAX_RANK);

const entriesFor = dict.prepare(
  "select id, word, pos, data from entries where word_norm = ? and pos = ?",
);
const formsFor = dict.prepare("select form from forms where entry_id = ?");

/**
 * The first few senses, joined. A whole Wiktionary entry is far too much to put
 * under a word in a crib, and the first senses are the ones a reader wants.
 */
function glossOf(data) {
  try {
    const senses = JSON.parse(data).senses ?? [];
    return senses
      .map((s) => s.gloss)
      .filter(Boolean)
      .slice(0, 3)
      .join("; ");
  } catch {
    return "";
  }
}

function tagValue(data, prefix) {
  try {
    for (const sense of JSON.parse(data).senses ?? []) {
      for (const tag of sense.tags ?? []) {
        if (tag.startsWith(prefix)) return tag.slice(prefix.length);
      }
    }
  } catch {
    /* a malformed entry simply has no tags */
  }
  return undefined;
}

const GENDERS = ["masculine", "feminine", "neuter", "common"];
function genderOf(data) {
  try {
    for (const sense of JSON.parse(data).senses ?? []) {
      for (const tag of sense.tags ?? []) if (GENDERS.includes(tag)) return tag;
    }
  } catch {
    /* as above */
  }
  return undefined;
}

const map = Object.create(null);
let lemmas = 0;
let missing = 0;

for (const row of ranked) {
  const entries = entriesFor.all(row.lemma_norm ?? fold(row.lemma), row.pos ?? "");
  if (!entries.length) {
    missing++;
    continue;
  }
  lemmas++;
  for (const entry of entries) {
    const record = {
      lemma: entry.word,
      // Plain headword; the pack's citations.mjs makes it a real citation.
      citation: entry.word,
      gloss: glossOf(entry.data),
      pos: entry.pos,
      rank: row.rank,
    };
    const gender = genderOf(entry.data);
    if (gender) record.gender = gender;
    const declension = tagValue(entry.data, "declension-");
    if (declension) record.declension = declension;

    // The headword itself is a form: a lemma with no inflection table still
    // has to be findable by the word the student typed.
    const forms = new Set([entry.word, ...formsFor.all(entry.id).map((f) => f.form)]);
    for (const form of forms) {
      const key = fold(form);
      if (!key) continue;
      (map[key] ??= []).push(record);
    }
  }
}

// Most frequent first: the crib offers candidates[0] as the default reading,
// and ambiguity is resolved by frequency unless the prompt says otherwise.
for (const key of Object.keys(map)) {
  map[key].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
}

const keys = Object.keys(map);
console.log(
  `${lemmas} lemmas of the top ${MAX_RANK} resolved (${missing} absent from the dictionary) ` +
    `-> ${keys.length} folded form keys`,
);

if (VERIFY) {
  const shipped = loadLemmas(dir);
  const shippedKeys = new Set(Object.keys(shipped));
  const builtKeys = new Set(keys);
  const reproduced = [...shippedKeys].filter((k) => builtKeys.has(k)).length;
  const extra = [...builtKeys].filter((k) => !shippedKeys.has(k)).length;
  const pct = (reproduced / shippedKeys.size) * 100;
  console.log(
    `verify: reproduces ${reproduced} of ${shippedKeys.size} shipped keys (${pct.toFixed(2)}%), ` +
      `plus ${extra} the shipped map does not have`,
  );
  const missed = [...shippedKeys].filter((k) => !builtKeys.has(k)).slice(0, 10);
  if (missed.length) console.log(`  not reproduced, e.g.: ${missed.join(", ")}`);
  console.log("--verify: nothing written.");
  process.exit(pct >= 99 ? 0 : 1);
}

writeFileSync(OUT, gzipSync(Buffer.from(JSON.stringify(map), "utf8"), { level: 9 }));
console.log(`wrote ${OUT}`);
console.log(
  `Next: run the pack's citations.mjs to turn headwords into real citations, ` +
    `then bump profile.citationsVersion.`,
);
