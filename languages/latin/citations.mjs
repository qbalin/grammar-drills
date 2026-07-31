#!/usr/bin/env node
/**
 * Rewrite the dictionary citations in the pack's `lemmas.json.gz` so verbs and
 * adjectives are cited the way a dictionary cites them.
 *
 * The shipped map was built from the reference project's `dictionary.db` but
 * only ever took two forms per entry, which is right for nouns (`manus, manūs
 * (f)`) and wrong for everything else:
 *
 *   amō, amāre            ->  amō, amāre, amāvī, amātum
 *   ūtor, ūtī             ->  ūtor, ūtī, ūsus sum        (deponent)
 *   sum, esse             ->  sum, esse, fuī             (no supine)
 *   fortis, fortis, forte ->  fortis, forte              (two terminations)
 *   felix, fēlīx, fēlīx   ->  fēlīx, fēlīcis             (one termination)
 *   melior, melior, melius->  melior, melius             (comparative)
 *   bonus, bona, bonum    ->  unchanged
 *
 * The parts are not derivable from what is shipped — the form keys are folded
 * (`amaui`, not `amāvī`) — so they come from the reference `dictionary.db`,
 * whose `forms` table is tagged (`canonical`, `infinitive,present`,
 * `active,perfect`, `supine`, `masculine,nominative,singular`, …) and fully
 * macronized. An entry the dictionary cannot improve keeps the citation it has.
 *
 *   node --import tsx languages/latin/citations.mjs [--dry] [--ref /path/to/languages/latin]
 *
 * Offline tooling: nothing here runs at runtime. Follow it with
 * `node scripts/build-web-content.mjs` to repack the web app's copy, and bump
 * `citationsVersion` in the pack profile so saved vocabulary cards catch up.
 */
import { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFold, parseProfile } from "@lang-tutor/core";

const PACK = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(PACK));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const DRY = args.includes("--dry");
const REF =
  opt("--ref", process.env.LATIN_REF) ??
  join(REPO, "..", "language_learning", "languages", "latin");
const MAP = join(PACK, "content", "lemmas.json.gz");

// The pack's own fold. `dictionary.db.word_norm` was written with it, so a
// separate copy here is exactly the drift this indirection exists to prevent.
const profile = parseProfile(
  JSON.parse(readFileSync(join(PACK, "profile.json"), "utf8")),
);
const normalize = compileFold(profile.fold);

/**
 * Notes that arrive wearing the `canonical` tag.
 *
 * Wiktionary's headword line carries its grammatical asides in the same slot as
 * the headword itself, so `sum` reports five "canonical forms", four of which
 * are sentences ("no supine stem except in the future active participle").
 */
// Bounded by letters rather than by `\b`, because these are whole words in a
// note and also substrings of real Latin. Unanchored, `perfect` rejects
// `perfecta`; anchored with `\b` it still rejects `perfectūs`, because a macron
// is not a `\w` character and the boundary fires in the middle of the word.
// `\p{L}` with the `u` flag is the only spelling that holds for a macronized
// language.
const NOT_A_FORM =
  /(?<!\p{L})(conjugation|passive|gerund|supine|perfect|irregular)(?!\p{L})|^no /iu;
const isForm = (s) => s && !NOT_A_FORM.test(s) && s.split(/\s+/).length <= 2;

// --- the reference dictionary -----------------------------------------------

const db = new DatabaseSync(join(REF, "dictionary.db"), { readOnly: true });
const findEntry = db.prepare(
  "select id from entries where word_norm = ? and pos = ? limit 1",
);
const findForms = db.prepare("select form, tags from forms where entry_id = ?");

/** Every tagged form of one dictionary entry, or [] when there is no entry. */
function formsOf(lemma, pos) {
  const row = findEntry.get(normalize(lemma), pos);
  if (!row) return [];
  return findForms.all(row.id).map((r) => ({ form: r.form, tags: r.tags ?? "" }));
}

const tagged = (forms, tags) => forms.filter((f) => f.tags === tags).map((f) => f.form);
const hasTag = (f, tag) => f.tags.split(",").includes(tag);

/** The headword as the dictionary spells it, falling back to ours. */
function headword(forms, lemma) {
  const canonical = tagged(forms, "canonical").filter(isForm);
  const match = canonical.find((f) => normalize(f) === normalize(lemma));
  return match ?? canonical[0] ?? lemma;
}

// --- verbs ------------------------------------------------------------------

/**
 * The principal parts: `canonical, present infinitive, perfect, supine`.
 *
 * Returns undefined unless at least the perfect is there — without it the
 * result would be the two-part citation we already have. A deponent's perfect
 * is periphrastic (`ūsus sum`) and has no supine, which is exactly how it is
 * cited; `sum` stops at `fuī` for the same reason.
 */
function verbCitation(forms, lemma) {
  const infinitive = tagged(forms, "infinitive,present").filter(isForm)[0];
  const perfect = tagged(forms, "active,perfect").filter(isForm)[0];
  // 581 entries carry the supine only as the accusative of the verbal noun,
  // which is the same word (`fātum`, `lāpsum`) under a longer tag.
  const supine =
    tagged(forms, "supine").filter(isForm)[0] ??
    tagged(forms, "accusative,noun-from-verb,supine").filter(isForm)[0];
  // Without the perfect there is still the infinitive, and `pulpo, pulpāre`
  // names the conjugation where the bare headword names nothing. Only a verb
  // with neither is beyond help.
  if (!infinitive) return undefined;
  if (!perfect) return `${headword(forms, lemma)}, ${infinitive}`;
  // A deponent's perfect is already periphrastic (`ūsus sum`), and that is where
  // its citation stops: `ūtor, ūtī, ūsus sum, ūsum` is nobody's dictionary entry.
  const parts = perfect.includes(" ")
    ? [headword(forms, lemma), infinitive, perfect]
    : [headword(forms, lemma), infinitive, perfect, supine];
  return parts.filter(Boolean).join(", ");
}

// --- adjectives -------------------------------------------------------------

/** The nominative singular of one gender, comparatives and plurals excluded. */
function nominative(forms, gender) {
  const hit = forms.find(
    (f) =>
      hasTag(f, "nominative") &&
      hasTag(f, "singular") &&
      hasTag(f, gender) &&
      !hasTag(f, "comparative") &&
      !hasTag(f, "superlative") &&
      isForm(f.form),
  );
  return hit?.form;
}

/**
 * How an adjective is cited depends on how many endings it has:
 *
 *   three distinct   m, f, n      bonus, bona, bonum · ācer, ācris, ācre
 *   m = f, n differs m/f, n       fortis, forte · melior, melius
 *   all three equal  nom, gen sg  fēlīx, fēlīcis · ingēns, ingentis
 *
 * Printing three nominatives for all of them — which is what the shipped map
 * does — turns the last two into `fortis, fortis, forte` and the useless
 * `fēlīx, fēlīx, fēlīx`, which names the same form three times and never gives
 * the genitive the student actually needs to decline it.
 */
function adjectiveCitation(forms, lemma) {
  const m = nominative(forms, "masculine");
  const f = nominative(forms, "feminine");
  const n = nominative(forms, "neuter");
  if (!m || !f || !n) return undefined;
  if (m !== f) return [m, f, n].join(", ");
  if (m !== n) return [m, n].join(", ");
  const genitive = forms.find(
    (g) =>
      hasTag(g, "genitive") &&
      hasTag(g, "singular") &&
      !hasTag(g, "comparative") &&
      !hasTag(g, "superlative") &&
      isForm(g.form),
  )?.form;
  return genitive ? `${m}, ${genitive}` : m;
}

// --- nouns ------------------------------------------------------------------

/** The one-letter gender a dictionary prints after a noun. */
const GENDER_MARK = {
  masculine: "m",
  feminine: "f",
  neuter: "n",
  common: "c",
};

/**
 * `rex, rēgis` · `manus, manūs (f)` · `agricola, agricolae (m)`.
 *
 * A noun is cited by its nominative and genitive singular, because the genitive
 * is what names the declension and so what lets the student inflect it at all;
 * the gender follows in brackets when the dictionary knows it and the ending
 * does not already give it away.
 *
 * This had no branch here until now, and did not obviously need one: the map
 * shipped with noun citations already in it, made by whatever built the map
 * before this repo could. The moment `build-lemmas.mjs` could rebuild the map,
 * that stopped being true — a rebuild wrote 3,842 bare headwords over them —
 * and a citation nobody can reproduce is a citation that vanishes on the next
 * rebuild. So it is derived here, from the same tagged forms the verbs use.
 */
function nounCitation(forms, entry) {
  const nominative = headword(forms, entry.lemma);
  const genitive = forms.find(
    (f) =>
      hasTag(f, "genitive") &&
      hasTag(f, "singular") &&
      !hasTag(f, "plural") &&
      isForm(f.form),
  )?.form;
  // No comparison between the two: `manus, manūs` differs by the macron alone
  // and `sitis, sitis` not at all, and both are how a dictionary prints them.
  // The adjectives suppress a repeat because three identical nominatives say
  // nothing three times; a noun's second slot is the genitive by position, so
  // it says something even when it looks the same.
  if (!genitive) return undefined;
  const mark = GENDER_MARK[entry.gender ?? ""];
  return mark ? `${nominative}, ${genitive} (${mark})` : `${nominative}, ${genitive}`;
}

/**
 * The last resort for an adjective the dictionary does not hold: `X, X, X`
 * says nothing three times, so at least stop saying it.
 */
function collapseRepeats(citation) {
  const parts = citation.split(", ");
  if (parts.length === 3 && parts[0] === parts[1] && parts[1] === parts[2]) {
    return parts[0];
  }
  return undefined;
}

// --- rewrite ----------------------------------------------------------------

const map = JSON.parse(gunzipSync(readFileSync(MAP)).toString("utf8"));

/** `lemma|pos` -> the entry as first met, so each is looked up once. */
const distinct = new Map();
for (const entries of Object.values(map)) {
  for (const e of entries) {
    const key = `${e.lemma}|${e.pos}`;
    if (!distinct.has(key)) distinct.set(key, e);
  }
}

const rewritten = new Map(); // `lemma|pos` -> new citation
const stats = { verb: 0, verbFull: 0, adj: 0, adjCollapsed: 0, noun: 0, marked: 0, missed: [] };

/**
 * `et (conj)` · `in (prep)` · `Horus (name)`.
 *
 * What a word with nothing to inflect is cited as. A bare `et` in the crib is
 * indistinguishable from a word whose citation simply failed to build, and the
 * part of speech is the one useful thing there is to say about an indeclinable.
 * This is the fallback under every branch above, and it is why the shipped map
 * had 54 bare citations out of 6,747 rather than thousands.
 */
const posMarked = (entry) => `${entry.lemma} (${entry.pos})`;

// `name` rides with `noun`: a proper noun is declined and cited the same way,
// and Rōma, Rōmae is as much use to the student as rex, rēgis.
const NOUNISH = new Set(["noun", "name"]);

for (const [key, entry] of distinct) {
  const inflected =
    entry.pos === "verb" || entry.pos === "adj" || NOUNISH.has(entry.pos);
  const forms = inflected ? formsOf(entry.lemma, entry.pos) : [];
  const derived =
    entry.pos === "verb"
      ? verbCitation(forms, entry.lemma)
      : entry.pos === "adj"
        ? adjectiveCitation(forms, entry.lemma) ?? collapseRepeats(entry.citation)
        : NOUNISH.has(entry.pos)
          ? nounCitation(forms, entry)
          : undefined;
  // Anything the branches above could not build falls back to the part of
  // speech, so no entry is left as its own bare headword.
  const citation = derived ?? posMarked(entry);

  if (citation === entry.citation) continue;
  if (!derived) stats.missed.push(`${entry.lemma} (${entry.pos})`);
  rewritten.set(key, citation);
  if (!derived) {
    stats.marked += 1;
  } else if (entry.pos === "verb") {
    stats.verb += 1;
    if (citation.split(", ").length === 4) stats.verbFull += 1;
  } else if (NOUNISH.has(entry.pos)) {
    stats.noun += 1;
  } else if (forms.length === 0) {
    stats.adjCollapsed += 1;
  } else {
    stats.adj += 1;
  }
}

// The map repeats an entry object per form key (242k forms, 6.7k lemmas), so
// the table above is applied in one pass over every occurrence.
let touched = 0;
for (const entries of Object.values(map)) {
  for (const e of entries) {
    const citation = rewritten.get(`${e.lemma}|${e.pos}`);
    if (citation) {
      e.citation = citation;
      touched += 1;
    }
  }
}

const sample = (pos, n) =>
  [...distinct.values()]
    .filter((e) => e.pos === pos && rewritten.has(`${e.lemma}|${e.pos}`))
    .slice(0, n)
    .map((e) => rewritten.get(`${e.lemma}|${e.pos}`));

console.log(`Reference: ${REF}`);
console.log(
  `Verbs      ${stats.verb} rewritten (${stats.verbFull} with all four parts)`,
);
console.log(
  `Adjectives ${stats.adj} rewritten, ${stats.adjCollapsed} repeated triples collapsed`,
);
console.log(`Nouns      ${stats.noun} rewritten (nominative, genitive, gender)`);
console.log(`Marked     ${stats.marked} cited by part of speech, having nothing to inflect`);
console.log(`Unimproved ${stats.missed.length} entries the dictionary could not build a citation for`);
console.log(`  e.g. ${sample("verb", 3).join(" · ")}`);
console.log(`       ${sample("adj", 3).join(" · ")}`);
console.log(`       ${sample("noun", 3).join(" · ")}`);
console.log(`${touched} of the map's entries updated`);

if (DRY) {
  console.log("\n--dry: nothing written");
} else {
  writeFileSync(MAP, gzipSync(Buffer.from(JSON.stringify(map), "utf8"), { level: 9 }));
  console.log(`\nWrote ${MAP} — now run scripts/build-web-content.mjs`);
}
