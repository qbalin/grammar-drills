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
 * written as the two files a pack ships — `content/lemmas.json.gz`, the
 * distinct entries, and `content/forms.txt.gz`, the sorted index over them.
 * See `scripts/lib/lemma-map.mjs`; the map itself is never serialized.
 *
 * The citation here is the plain headword. Turning it into what a dictionary
 * actually prints — principal parts, adjective terminations, an article — is
 * per-language and belongs to the pack's own `citations.mjs`, which is run
 * after this and rewrites them in place.
 *
 *   node --import tsx scripts/build-lemmas.mjs [--pack languages/latin]
 *        [--ref /path/to/ref] [--max-rank 7000] [--verify] [--out path]
 *        [--merge] [--drop-artifacts] [--no-tail]
 *
 * Two halves come out of it. The **ranked** half is the frequency list joined
 * against the dictionary: the words a corpus actually uses, each with its rank,
 * its full gloss, and the gates' attention. The **tail** is every other lemma
 * the dictionary holds — unranked, briefly glossed, and there for one reason:
 * so a student who looks a word up gets an answer. Latin's frequency list is
 * seven works long, and a word those seven authors never wrote used to come
 * back "not in the dictionary" however plainly the dictionary had it.
 *
 * `--no-tail` builds the ranked half alone, which is what every pack shipped
 * before the tail existed.
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
import { statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { compileFold } from "@lang-tutor/core";
import { genderOf, glossOf, tagValue } from "./lib/lemma-fields.mjs";
import { splitLemmaMap } from "./lib/lemma-map.mjs";
import { loadLemmaIndex, loadProfile, packDir } from "./lib/pack.mjs";
import { openReference, requireDictionary } from "./lib/reference.mjs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const dir = packDir(argv);
const profile = loadProfile(dir);
const fold = compileFold(profile.fold);
// This is one of the two things the pack's own content cannot answer for: it is
// what *builds* that content, out of glosses, genders and inflection tables
// that only the dictionary holds.
let ref;
try {
  ref = requireDictionary(openReference(dir, profile, argv), profile);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const VERIFY = argv.includes("--verify");
const MERGE = argv.includes("--merge");
const DROP_ARTIFACTS = argv.includes("--drop-artifacts");
const TAIL = !argv.includes("--no-tail");
const MAX_RANK = Number(opt("--max-rank", 7000));
const OUT = opt("--out", join(dir, "content", "lemmas.json.gz"));
const OUT_FORMS = opt("--out-forms", join(dir, "content", "forms.txt.gz"));

/** Analyser notation rather than a word anyone could type. */
const ARTIFACT = /[-+]/;

/** What the line-oriented form index cannot hold. */
const UNREPRESENTABLE = /[\t\r\n]/;

/**
 * How much of a definition a word we do not teach is worth.
 *
 * `SENSE_LIMIT` is six, which is right for a band word the student will meet
 * again and read carefully. The tail is 130,000 words they will meet once, to
 * confirm what one of them means — and six senses each is 2 MB of phone. Two
 * senses answer the question that was asked.
 */
const TAIL_SENSE_LIMIT = 2;
const TAIL_GLOSS_CHARS = 140;

// Ranked lemmas are the spine: the map exists to answer "what is this word",
// and a word nobody writes is not worth the bytes on a phone.
const ranked = ref.ranked(MAX_RANK);

const map = Object.create(null);
let lemmas = 0;
let missing = 0;
let tail = 0;

for (const row of ranked) {
  const entries = ref.entriesFor(row.lemma_norm ?? fold(row.lemma), row.pos);
  if (!entries.length) {
    missing++;
    continue;
  }
  lemmas++;
  for (const entry of entries) {
    // Read once and used twice: the forms are where the map's keys come from,
    // and the headword row among them is where the gender is written.
    const rows = ref.formsFor(entry.id);
    const record = {
      lemma: entry.word,
      // Plain headword; the pack's citations.mjs makes it a real citation.
      citation: entry.word,
      gloss: glossOf(entry.data),
      pos: entry.pos,
      rank: row.rank,
    };
    const gender = genderOf(entry.data, rows);
    if (gender) record.gender = gender;
    const declension = tagValue(entry.data, "declension-");
    if (declension) record.declension = declension;

    // The headword itself is a form: a lemma with no inflection table still
    // has to be findable by the word the student typed.
    const forms = new Set([entry.word, ...rows.map((f) => f.form)]);
    for (const form of forms) {
      const key = fold(form);
      if (!key) continue;
      if (DROP_ARTIFACTS && ARTIFACT.test(key)) continue;
      (map[key] ??= []).push(record);
    }
  }
}

// --- the tail ----------------------------------------------------------------

/**
 * Everything else the dictionary knows.
 *
 * The ranked list above is a corpus's vocabulary, not a language's: Latin's is
 * seven works, so a student who writes `reste` gets told the ablative of
 * `restis` is not a word, because Caesar and Cicero and Ovid between them never
 * needed a rope. That is the wrong answer, and the right one was sitting in
 * `dictionary.db` the whole time.
 *
 * These records carry no `rank`, which is the point twice over. It is true —
 * nothing counted them — and it keeps them behind every ranked reading in the
 * sort below, so the crib still defaults to the word a student is likely to
 * have meant. It is also what `packReference.attests` now tests, so shipping
 * the tail does not quietly loosen the gates that ask whether a generated
 * sentence is made of real words.
 */
if (TAIL) {
  const covered = new Set();
  for (const key of Object.keys(map)) {
    for (const record of map[key]) covered.add(`${record.lemma}|${record.pos}`);
  }
  for (const entry of ref.lemmaEntries()) {
    if (covered.has(`${entry.word}|${entry.pos}`)) continue;
    const gloss = glossOf(entry.data, TAIL_SENSE_LIMIT);
    // A headword with nothing to say about itself is a row, not a definition:
    // it would cost bytes to tell the student the word exists and no more.
    if (!gloss) continue;
    const rows = ref.formsFor(entry.id);
    const record = {
      lemma: entry.word,
      citation: entry.word,
      gloss: gloss.length > TAIL_GLOSS_CHARS ? gloss.slice(0, TAIL_GLOSS_CHARS) : gloss,
      pos: entry.pos,
    };
    const gender = genderOf(entry.data, rows);
    if (gender) record.gender = gender;
    const declension = tagValue(entry.data, "declension-");
    if (declension) record.declension = declension;

    const forms = new Set([entry.word, ...rows.map((f) => f.form)]);
    for (const form of forms) {
      const key = fold(form);
      if (!key) continue;
      // Artifacts are analyser notation whatever the flag says here: the tail
      // is the long half of the dictionary, and nobody types `ἐν-ξέω`.
      if (ARTIFACT.test(key)) continue;
      // The index is line-oriented, so a key holding a tab or a newline cannot
      // be written at all. Vanishingly rare, and worth dropping rather than
      // failing the build over — the ranked half is still checked strictly.
      if (UNREPRESENTABLE.test(key)) continue;
      (map[key] ??= []).push(record);
    }
    tail++;
  }
}

const built = Object.keys(map).length;

// A key this build did not produce, but the shipped map has, is a word the
// student can look up today. Dropping it to gain others is still a regression
// on the word in front of them, so a merge keeps it. Where both have the key,
// this build wins: its records carry whatever the reference says now.
let kept = 0;
if (MERGE && !VERIFY) {
  const shipped = loadLemmaIndex(dir);
  for (const key of shipped.forms()) {
    if (key in map) continue;
    if (DROP_ARTIFACTS && ARTIFACT.test(key)) continue;
    map[key] = shipped.lookup(key);
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
    (TAIL ? `plus ${tail} unranked from the rest of the dictionary ` : "") +
    `-> ${built} folded form keys` +
    (MERGE && !VERIFY ? `, plus ${kept} kept from the shipped map -> ${keys.length}` : ""),
);

if (VERIFY) {
  const shippedKeys = new Set(loadLemmaIndex(dir).forms());
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

ref.close();

// Written split, never as the map: see scripts/lib/lemma-map.mjs. Serializing
// `map` itself would be ~300 MB of JSON for the same dictionary, and nothing
// downstream could parse it.
const { entries, lines } = splitLemmaMap(map);
writeFileSync(OUT, gzipSync(Buffer.from(JSON.stringify(entries), "utf8"), { level: 9 }));
writeFileSync(OUT_FORMS, gzipSync(Buffer.from(lines.join("\n"), "utf8"), { level: 9 }));
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(
  `wrote ${OUT} (${entries.length} entries, ${mb(statSync(OUT).size)} gz)\n` +
    `wrote ${OUT_FORMS} (${lines.length} forms, ${mb(statSync(OUT_FORMS).size)} gz)`,
);
console.log(
  `Next: run the pack's citations.mjs to turn headwords into real citations, ` +
    `then bump profile.citationsVersion.`,
);
