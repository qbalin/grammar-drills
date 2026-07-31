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
 *        [--merge] [--drop-artifacts]
 *
 * `--verify` builds the map and compares it against the one already shipped
 * without writing anything. Use it on a pack whose map predates this script:
 * a high key overlap says the builder agrees with however the original was
 * made, which is the only evidence available that it is doing the right thing.
 *
 * `--merge` keeps the shipped map's keys that this build does not produce,
 * rather than replacing the file outright. That matters on a pack whose map
 * predates the script: rebuilding Greek gains 24,780 keys and loses 6,854, and
 * the loss is a real regression for the student even though the gain is bigger.
 * A rebuild is the right default for a new pack; a merge is the right thing for
 * a pack that already shipped.
 *
 * `--drop-artifacts` skips form keys carrying a hyphen or a plus. Morpheus
 * writes double-compounds as `ἐν-ξέω` and `προ+εξαναλωμενου`, which are
 * analyser notation rather than words: nobody types them, so they are bytes
 * that can never be looked up. Off by default, because only some references
 * have them.
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
const MERGE = argv.includes("--merge");
const DROP_ARTIFACTS = argv.includes("--drop-artifacts");
const MAX_RANK = Number(opt("--max-rank", 7000));
const OUT = opt("--out", join(dir, "content", "lemmas.json.gz"));

/** Analyser notation rather than a word anyone could type. */
const ARTIFACT = /[-+]/;

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
      if (DROP_ARTIFACTS && ARTIFACT.test(key)) continue;
      (map[key] ??= []).push(record);
    }
  }
}

const built = Object.keys(map).length;

// A key this build did not produce, but the shipped map has, is a word the
// student can look up today. Dropping it to gain others is still a regression
// on the word in front of them, so a merge keeps it. Where both have the key,
// this build wins: its records carry whatever the reference says now.
let kept = 0;
if (MERGE && !VERIFY) {
  const shipped = loadLemmas(dir);
  for (const key of Object.keys(shipped)) {
    if (key in map) continue;
    if (DROP_ARTIFACTS && ARTIFACT.test(key)) continue;
    map[key] = shipped[key];
    kept++;
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
    `-> ${built} folded form keys` +
    (MERGE && !VERIFY ? `, plus ${kept} kept from the shipped map -> ${keys.length}` : ""),
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
