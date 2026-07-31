#!/usr/bin/env node
/**
 * Rewrite the dictionary citations in the pack's `lemmas.json.gz` so nouns,
 * verbs and adjectives are cited the way a Greek dictionary cites them.
 *
 * `build-lemmas.mjs` puts the bare headword in every record's `citation`, which
 * is not what a lexicon prints and not what a student needs to decline or
 * conjugate the word:
 *
 *   λόγος     ->  ὁ λόγος, τοῦ λόγου
 *   πόλις     ->  ἡ πόλις, τῆς πόλεως
 *   δῶρον     ->  τὸ δῶρον, τοῦ δώρου
 *   λύω       ->  λύω, λύσω, ἔλυσα, λέλυκα, λέλυμαι, ἐλύθην
 *   γίγνομαι  ->  γίγνομαι, γενήσομαι, ἐγενόμην, γέγονα, ...  (deponent)
 *   σοφός     ->  σοφός, σοφή, σοφόν                          (three endings)
 *   ἄδικος    ->  ἄδικος, ἄδικον                              (two endings)
 *   πένης     ->  πένης, πένητος                              (one ending)
 *
 * The parts are not derivable from what is shipped — the form keys are folded
 * (`πολεωσ`, not `πόλεως`) — so they come from the reference `dictionary.db`,
 * whose `forms` table is tagged with a comma-joined, sorted, lowercase list
 * (`active,aorist,first,indicative,singular`). Tags are matched by membership,
 * never by whole-string equality: the same slot arrives under a dozen different
 * tag strings depending on which dialects share the form.
 *
 * Which is the interesting problem. Wiktionary's tables are pan-Hellenic, so a
 * single slot offers λόγου beside the epic λόγοιο and the Doric λόγω, and the
 * genitive of πόλις is *only* ever dialect-tagged — πόλεως, πόλεος, πόληος,
 * πόλιος and πτόλεως all carry `epic` or `ionic` or both. Undialected first,
 * then Attic, is most of the answer; where the tags genuinely cannot choose,
 * the reference project's own Attic prose (Thucydides, Plato, Xenophon, Lysias)
 * is asked which form the language actually writes. See `rank` below.
 *
 *   node --import tsx languages/ancient-greek/citations.mjs [--dry]
 *        [--pack languages/ancient-greek] [--ref /path/to/languages/ancient_greek]
 *
 * Offline tooling: nothing here runs at runtime. Follow it with
 * `node scripts/build-web-content.mjs` to repack the web app's copy, and bump
 * `citationsVersion` in the pack profile so saved vocabulary cards catch up.
 */
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFold } from "@lang-tutor/core";
import { loadLemmas, loadProfile, packDir, refDir } from "../../scripts/lib/pack.mjs";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
// This pack, unless told otherwise. `packDir` falls back to Latin when nothing
// names a pack, which is right for the shared scripts and wrong here: run
// without a flag, this rewrote Latin's map with Greek's citation rules and
// reported success. A pack-local script belongs to its own pack.
const dir = argv.includes("--pack") || argv.includes("--language")
  ? packDir(argv)
  : dirname(fileURLToPath(import.meta.url));
const profile = loadProfile(dir);
const ref = refDir(profile, argv);
const MAP = join(dir, "content", "lemmas.json.gz");

// The pack's own fold. `dictionary.db.word_norm` was written with it, so a
// separate copy here is exactly the drift this indirection exists to prevent.
const fold = compileFold(profile.fold);

// --- the reference dictionary -----------------------------------------------

if (!existsSync(join(ref, "dictionary.db"))) {
  console.error(`No dictionary.db at ${ref}.\nSet --ref or LANG_REF.`);
  process.exit(1);
}
const db = new DatabaseSync(join(ref, "dictionary.db"), { readOnly: true });
const findEntry = db.prepare(
  "select id, word from entries where word_norm = ? and pos = ?",
);
const findForms = db.prepare("select form, tags from forms where entry_id = ?");

/**
 * Every tagged form of one dictionary entry, or [] when there is no entry.
 *
 * `build-lemmas.mjs` found the entry by folded headword and part of speech, so
 * this does too — but the fold strips accents, and Greek keeps whole verbs
 * apart by accent alone: `εἰμί` "I am" and `εἶμι` "I shall go" are one key.
 * Taking the first row would conjugate the wrong verb, so the entry whose
 * headword is spelled exactly like the record's wins when there is one.
 */
function formsOf(lemma, pos) {
  const rows = findEntry.all(fold(lemma), pos);
  if (!rows.length) return [];
  const row = rows.find((r) => r.word === lemma) ?? rows[0];
  return findForms
    .all(row.id)
    .map((r) => ({ form: r.form, tags: (r.tags ?? "").split(",") }));
}

// --- choosing between forms of the same slot --------------------------------

/**
 * Dialect and register tags, i.e. the ones that say "not the Greek this pack
 * teaches". Everything else in the vocabulary is grammar (case, tense, voice…)
 * and describes the slot rather than the flavour.
 */
const DIALECTS = new Set([
  "attic", "epic", "doric", "ionic", "aeolic", "homeric", "poetic", "prose",
]);
/** The pack is Attic — Smyth's grammar, Attic prose reading. */
const OURS = new Set(["attic", "prose"]);

/** 0 undialected · 1 marked Attic · 2 marked as something else. */
function dialectTier(tags) {
  let marked = 0;
  for (const t of tags) {
    if (!DIALECTS.has(t)) continue;
    if (OURS.has(t)) return 1;
    marked = 2;
  }
  return marked;
}

/**
 * Not the pack's fold. That one strips accents and breathings, which is right
 * for looking a word up and wrong for counting one: `ὁδοῦ` "of the road" and
 * `ὀδοῦ` "of the threshold" fold together, and the first is common enough to
 * vote the second into a citation it has no business in.
 *
 * The one accent that must go is the grave, which is not a different accent but
 * an acute leaning on the next word — a dictionary writes `καλός` and a text
 * writes `καλὸς` for the same form, and counting them apart would find the
 * commonest adjective in Greek unattested.
 */
const spelling = (s) =>
  s.normalize("NFD").replace(/\u0300/g, "\u0301").normalize("NFC").toLowerCase();

/**
 * Word -> times it occurs in the reference project's Attic prose.
 *
 * Homer is Epic and Herodotus is Ionic; both are in `texts/` because the
 * frequency list is built from all of it, and both would vote for exactly the
 * forms this script exists to keep out. The rest — Thucydides, Plato, Xenophon,
 * Lysias — is half a million words of the dialect the pack teaches.
 *
 * This is evidence, not authority: it breaks ties the tags cannot, and a corpus
 * that is simply absent leaves the tag rules to decide alone.
 */
function atticIndex() {
  const counts = new Map();
  const texts = join(ref, "texts");
  if (!existsSync(texts)) return counts;
  for (const file of readdirSync(texts)) {
    if (!file.endsWith(".txt") || /^(homer|herodotus)/.test(file)) continue;
    for (const word of readFileSync(join(texts, file), "utf8").split(
      /[^\p{L}\p{Mn}]+/u,
    )) {
      if (word) counts.set(spelling(word), (counts.get(spelling(word)) ?? 0) + 1);
    }
  }
  return counts;
}
const attested = atticIndex();
const timesWritten = (form) => attested.get(spelling(form)) ?? 0;

/** How many tags mark the form as somebody else's Greek. */
const foreign = (tags) =>
  tags.filter((t) => DIALECTS.has(t) && !OURS.has(t)).length;

/** Shared leading characters, as a last resort against spelling variants. */
function shared(a, b) {
  const x = [...a];
  const y = [...b];
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i += 1;
  return i;
}

/**
 * Order the candidates for one slot, best first.
 *
 * The tags come first: an undialected form beats an Attic-marked one beats a
 * Doric one, which is what keeps the epic λόγοιο out of λόγος's citation. But a
 * form no Attic author ever wrote is worth one tier less than one they did,
 * which is what settles πόλεως (481 occurrences) against the equally-tagged
 * πόλεος (none), and πολύ against the undialected-but-unwritten πολέα. With no
 * corpus every candidate is demoted alike and the tag order stands.
 *
 * Below that, the form claimed by the fewest other dialects: `ἀγάπησα` and
 * `ἠγάπησα` are both tagged Attic, but the first is also Aeolic, Doric and
 * Ionic, and it is the unaugmented one. Then brevity, and then the spelling
 * nearest `near` — the neighbouring word the answer ought to look like, which
 * is the headword for a noun (`πᾶν` beside `πάν`, given `πᾶς`) and the previous
 * principal part for a verb (`εἴλημμαι` beside `λέλημμαι`, given `εἴληφα`).
 * Code point settles the rest, so two runs always print the same citation.
 */
function rank(near) {
  const tier = (f) => dialectTier(f.tags) + (timesWritten(f.form) > 0 ? 0 : 1);
  return (a, b) =>
    tier(a) - tier(b) ||
    timesWritten(b.form) - timesWritten(a.form) ||
    foreign(a.tags) - foreign(b.tags) ||
    [...a.form].length - [...b.form].length ||
    shared(b.form, near) - shared(a.form, near) ||
    (a.form < b.form ? -1 : a.form > b.form ? 1 : 0);
}

/** The best row carrying all of `has` and none of `not`, or undefined. */
function pick(forms, near, has, not = []) {
  const hits = forms.filter(
    (f) => has.every((t) => f.tags.includes(t)) && !not.some((t) => f.tags.includes(t)),
  );
  if (!hits.length) return undefined;
  return hits.sort(rank(near))[0];
}

/** As `pick`, but any of `alts` satisfies the last requirement. */
function pickAny(forms, near, has, alts, not = []) {
  for (const alt of alts) {
    const hit = pick(forms, near, [...has, alt], not);
    if (hit) return hit;
  }
  return undefined;
}

// --- nouns ------------------------------------------------------------------

/**
 * The article is the gender, and the gender is half of what you need to know:
 * `ὁ λόγος` and `ἡ ὁδός` decline identically and agree differently. It is on
 * the record already, lifted by `build-lemmas.mjs` from the entry's sense tags.
 */
const ARTICLE = {
  masculine: ["ὁ", "τοῦ"],
  feminine: ["ἡ", "τῆς"],
  // Grave, not acute: an oxytone leans on the word it precedes, and the article
  // never stands alone here.
  neuter: ["τὸ", "τοῦ"],
  // Nouns like ἄνθρωπος or θεός that take either article in either sense.
  common: ["ὁ, ἡ", "τοῦ"],
};

/** `ἡ πόλις, τῆς πόλεως` — nominative and genitive singular, both articled. */
function nounCitation(forms, lemma, gender) {
  const genitive = pick(forms, lemma, ["genitive", "singular"], ["plural", "dual"])?.form;
  if (!genitive) return undefined;
  const article = ARTICLE[gender];
  // A noun whose senses never named a gender gets the two forms bare rather
  // than a guessed article, which would be a claim the dictionary did not make.
  if (!article) return `${lemma}, ${genitive}`;
  return `${article[0]} ${lemma}, ${article[1]} ${genitive}`;
}

// --- verbs ------------------------------------------------------------------

/**
 * The six principal parts, in the order every Greek grammar prints them.
 *
 * Each slot names the voices that may fill it, in preference order. A deponent
 * has no active anything, so its present, future and aorist come from the
 * middle — which is also how a plain verb with a middle future is cited
 * (`ἀκούω, ἀκούσομαι`), so the fallback is per-slot rather than per-verb.
 * The aorist passive is a slot of its own and never stands in for the aorist.
 */
const PARTS = [
  ["present", ["active", "mediopassive", "middle"]],
  ["future", ["active", "middle", "mediopassive"]],
  ["aorist", ["active", "middle", "mediopassive"]],
  ["perfect", ["active"]],
  ["perfect", ["mediopassive", "middle", "passive"]],
  ["aorist", ["passive"]],
];

/**
 * `λύω, λύσω, ἔλυσα, λέλυκα, λέλυμαι, ἐλύθην`, stopping at the first slot the
 * dictionary cannot fill. Six parts with a hole in the middle would be a lie
 * about which part is missing, and most verbs are not attested in all six.
 */
function verbCitation(forms, lemma) {
  const parts = [];
  for (const [tense, voices] of PARTS) {
    const near = parts[parts.length - 1] ?? lemma;
    const hit = pickAny(forms, near, [tense, "indicative", "first", "singular"], voices);
    if (!hit) break;
    // The headword *is* the first principal part, so it is printed in place of
    // whatever the table calls the present: `φημί` also conjugates as the
    // enclitic `φημι`, and a citation opening on that names no entry. It also
    // keeps the contracted present out of the way of the identical Attic
    // future, so `καλέω, καλῶ, ἐκάλεσα` survives the check below.
    const part = parts.length ? hit.form : lemma;
    // A slot that repeats an earlier part has not been filled, it has been
    // confused with the one before it; treat it as the gap it is.
    if (parts.includes(part)) break;
    parts.push(part);
  }
  return parts.length ? parts.join(", ") : undefined;
}

// --- adjectives -------------------------------------------------------------

const NOT_GRADED = ["comparative", "superlative", "plural", "dual"];

/**
 * How an adjective is cited depends on how many endings it has:
 *
 *   three  m, f, n     σοφός, σοφή, σοφόν · μέγας, μεγάλη, μέγα
 *   two    m/f, n      ἄδικος, ἄδικον · εὐδαίμων, εὔδαιμον · ἀληθής, ἀληθές
 *   one    nom, gen    πένης, πένητος · ἅρπαξ, ἅρπαγος
 *
 * The two-ending adjectives are not a special case to detect: the dictionary
 * tags their one form `feminine,masculine,nominative,singular`, so asking for
 * the masculine and the feminine separately returns the same word, and that
 * identity *is* the two-ending pattern. One-ending adjectives have no separate
 * neuter either, and fall through to the genitive that lets you decline them.
 *
 * Returns the citation and how many endings it turned out to have, which is
 * the only thing the report can say about whether this went well.
 */
function adjectiveCitation(forms, lemma) {
  const nom = (gender, near, not = []) =>
    pick(forms, near, ["nominative", "singular", gender], [...NOT_GRADED, ...not]);

  // The headword is itself the masculine nominative singular, and it outranks
  // any other row that fills the slot. NOT_GRADED cannot be trusted to keep the
  // degrees apart: Morpheus files καλός's irregular κάλλιστος under the lemma
  // with no superlative tag at all, and it is the commoner word in the corpus,
  // so ranking by frequency cites the adjective by its own superlative.
  const masculines = forms.filter(
    (f) => ["nominative", "singular", "masculine"].every((t) => f.tags.includes(t)),
  );
  const m = masculines.some((f) => f.form === lemma)
    ? lemma
    : nom("masculine", lemma)?.form;
  if (!m) return undefined;

  // The other two endings are chosen near the masculine rather than near the
  // headword, so a paradigm is cited in one degree throughout.
  const n = nom("neuter", m)?.form;
  // A row tagged both genders is the two-ending reading of one word, so a
  // feminine that stands on its own is the evidence for the three-ending
  // paradigm and outranks it — but only if it is Greek this pack teaches, or
  // every -ος compound with a stray Doric feminine would grow a third ending.
  const own = nom("feminine", m, ["masculine"]);
  const f = (own && dialectTier(own.tags) < 2 ? own : nom("feminine", m))?.form;
  if (f && n && m !== f) return { citation: `${m}, ${f}, ${n}`, endings: 3 };
  if (n && m !== n) return { citation: `${m}, ${n}`, endings: 2 };
  const genitive = pick(forms, lemma, ["genitive", "singular"], NOT_GRADED)?.form;
  if (!genitive || genitive === m) return undefined;
  return { citation: `${m}, ${genitive}`, endings: 1 };
}

// --- rewrite ----------------------------------------------------------------

const map = loadLemmas(dir);

/**
 * `lemma|pos|gender` -> the record as first met, so each is looked up once.
 *
 * `build-lemmas.mjs` pushes one record object under every one of its forms, but
 * that sharing does not survive the round trip through JSON: the shipped map
 * parses back as 326k separate objects for 7.2k lemmas. Keying by identity
 * would dedupe nothing, so the work is keyed by the record's content and the
 * result applied to every occurrence in a second pass.
 *
 * Gender is part of the key because it is part of the answer. Wiktionary gives
 * ὁδός two entries, "road" masculine and "way" feminine, and the map carries
 * both: `ἡ ὁδός` is the one a reader wants and `ὁ ὁδός` for both would be a
 * gender error printed under the commoner word.
 */
const identity = (r) => `${r.lemma}|${r.pos}|${r.gender ?? ""}`;
const distinct = new Map();
for (const records of Object.values(map)) {
  for (const r of records) {
    if (!distinct.has(identity(r))) distinct.set(identity(r), r);
  }
}

const rewritten = new Map(); // record identity -> new citation
const stats = {
  noun: 0,
  nounBare: 0,
  verb: 0,
  parts: [0, 0, 0, 0, 0, 0, 0],
  adj: 0,
  endings: { 3: 0, 2: 0, 1: 0 },
  missed: { noun: 0, verb: 0, adj: 0 },
};

for (const [key, r] of distinct) {
  if (r.pos !== "noun" && r.pos !== "verb" && r.pos !== "adj") continue;
  const forms = formsOf(r.lemma, r.pos);
  const adj = r.pos === "adj" ? adjectiveCitation(forms, r.lemma) : undefined;
  const citation =
    r.pos === "noun"
      ? nounCitation(forms, r.lemma, r.gender)
      : r.pos === "verb"
        ? verbCitation(forms, r.lemma)
        : adj?.citation;

  if (!citation || citation === r.citation) {
    stats.missed[r.pos] += 1;
    continue;
  }
  rewritten.set(key, citation);
  if (r.pos === "noun") {
    stats.noun += 1;
    if (!ARTICLE[r.gender]) stats.nounBare += 1;
  } else if (r.pos === "verb") {
    stats.verb += 1;
    stats.parts[citation.split(", ").length] += 1;
  } else {
    stats.adj += 1;
    stats.endings[adj.endings] += 1;
  }
}

// The map repeats a record per form key (276k keys, 7.2k lemmas), so the table
// above is applied in one pass over every occurrence.
let touched = 0;
for (const records of Object.values(map)) {
  for (const r of records) {
    const citation = rewritten.get(identity(r));
    if (citation) {
      r.citation = citation;
      touched += 1;
    }
  }
}

// --- report -----------------------------------------------------------------

const count = (pos) => [...distinct.values()].filter((r) => r.pos === pos).length;
const sample = (pos, n) =>
  [...distinct.values()]
    .filter((r) => r.pos === pos && rewritten.has(identity(r)))
    .slice(0, n)
    .map((r) => rewritten.get(identity(r)));

console.log(`Reference: ${ref}`);
console.log(
  `Attic prose: ${attested.size} distinct words indexed for tie-breaking`,
);
console.log(
  `Nouns      ${stats.noun} of ${count("noun")} cited with article + genitive ` +
    `(${stats.nounBare} genderless, so no article)`,
);
console.log(
  `Verbs      ${stats.verb} of ${count("verb")} cited with principal parts ` +
    stats.parts
      .map((c, i) => (i && c ? `${i}:${c}` : null))
      .filter(Boolean)
      .join(" "),
);
console.log(
  `Adjectives ${stats.adj} of ${count("adj")} cited by termination ` +
    `(three ${stats.endings[3]}, two ${stats.endings[2]}, one ${stats.endings[1]})`,
);
console.log(
  `Unimproved ${stats.missed.noun + stats.missed.verb + stats.missed.adj} keep the headword ` +
    `(noun ${stats.missed.noun}, verb ${stats.missed.verb}, adj ${stats.missed.adj})`,
);
console.log(`  nouns  ${sample("noun", 3).join(" · ")}`);
console.log(`  verbs  ${sample("verb", 3).join(" · ")}`);
console.log(`  adjs   ${sample("adj", 3).join(" · ")}`);
console.log(`${touched} of the map's ${Object.keys(map).length} form keys updated`);

if (DRY) {
  console.log("\n--dry: nothing written");
} else {
  writeFileSync(MAP, gzipSync(Buffer.from(JSON.stringify(map), "utf8"), { level: 9 }));
  console.log(`\nWrote ${resolve(MAP)} — now run scripts/build-web-content.mjs`);
}
