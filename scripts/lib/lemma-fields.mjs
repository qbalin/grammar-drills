/**
 * The fields a lemma record is made of, read out of one dictionary entry.
 *
 * These live here rather than in `build-lemmas.mjs` because they are the part
 * of that script with rules worth pinning down — how many senses is a
 * definition, and where a gender is actually written — and a script that runs
 * once per pack on a machine holding a 474 MB database is not a thing anyone
 * can test. Pure functions over the `data` blob and the form rows can be.
 *
 * Language-agnostic, like everything under `scripts/`: the tag vocabulary here
 * is wiktextract's, which is the same in every language it covers.
 */

/** Whatever the entry's `data` column holds, or an empty entry if it is junk. */
function parse(data) {
  try {
    return JSON.parse(data) ?? {};
  } catch {
    // A malformed blob is an entry with nothing to say, not a reason to stop
    // building: one bad row upstream should not cost the student the map.
    return {};
  }
}

/**
 * How many senses make a definition.
 *
 * A whole Wiktionary entry is far too much to put under a word in a crib, and
 * the first senses are the ones a reader wants. Three was too few: Latin verbs
 * routinely spend their first senses on a literal reading the student will
 * never meet, and the figurative one they came for sat fourth. Six is still
 * bounded — this is read on a phone — and covers those.
 */
export const SENSE_LIMIT = 6;

/** The first `limit` senses, joined. */
export function glossOf(data, limit = SENSE_LIMIT) {
  return (parse(data).senses ?? [])
    .map((s) => s.gloss)
    .filter(Boolean)
    .slice(0, limit)
    .join("; ");
}

/** The first sense tag starting with `prefix`, with the prefix taken off. */
export function tagValue(data, prefix) {
  for (const sense of parse(data).senses ?? []) {
    for (const tag of sense.tags ?? []) {
      if (tag.startsWith(prefix)) return tag.slice(prefix.length);
    }
  }
  return undefined;
}

/**
 * The inflection class the dictionary names for an entry, where it names one.
 *
 * Two tags, and they are not interchangeable. `declension-N` is written on
 * anything that declines; `conjugation-N` on verbs. wiktextract also writes a
 * declension on a *participle* filed as a verb — `futūrus` declines like
 * `bonus` — so a verb's declension is its adjectival one and says nothing at
 * all about how it conjugates. Reading each tag only where it means what it
 * says is what stops `{pos: "verb", declension: "1"}` from being taken for the
 * first conjugation, which is a mistake that looks right in aggregate: Latin
 * has 2,304 such records and 3,224 genuine first-conjugation verbs.
 */
export function classOf(data, pos) {
  const out = {};
  const declension = tagValue(data, "declension-");
  if (declension) out.declension = declension;
  if (pos === "verb") {
    const conjugation = tagValue(data, "conjugation-");
    if (conjugation) out.conjugation = conjugation;
  }
  const tags = KEPT.filter((tag) => hasTag(data, tag));
  if (tags.length) out.tags = tags;
  return out;
}

/**
 * The entry-level tags worth a field of their own, and no others.
 *
 * wiktextract writes a hundred of them and most say something about register or
 * transitivity that no gate and no screen asks about. `deponent` is different:
 * it is what a book gives a whole section to — Bennett's §112 — and it cannot
 * be recovered from the forms. A deponent's passive-looking forms are tagged
 * *active* in the paradigm, correctly and unhelpfully, so a reader working from
 * the tables alone would find no deponents at all.
 *
 * `impersonal` was tried here beside it and withdrawn, which is worth recording
 * because the failure is the general one. The tag sits on a *sense*, so it
 * marks every verb with an impersonal use rather than every impersonal verb:
 * `cadō` carries it, and 276 quotations were filed under §138 on the strength
 * of `cadunt`. A sense the surface cannot distinguish is not a fact about the
 * word in front of the student. Bennett's own list is used instead.
 *
 * Kept short on purpose. Every tag here is bytes on a phone, and a list that
 * grows by whatever seemed handy stops being a claim about the language.
 */
const KEPT = ["deponent"];

/** Whether any sense of the entry carries this exact tag. */
export function hasTag(data, name) {
  for (const sense of parse(data).senses ?? []) {
    if ((sense.tags ?? []).includes(name)) return true;
  }
  return false;
}

/** The gender tags wiktextract writes, in any language that marks gender. */
const GENDERS = ["masculine", "feminine", "neuter", "common"];

/**
 * The lemma's gender, from the senses first and the headword row second.
 *
 * Reading only the senses found a gender for 40% of the nouns in Latin's
 * frequency band, which is why so many citations printed `rex, rēgis` where a
 * dictionary prints `rex, rēgis (m)`. The gender is not missing upstream:
 * wiktextract writes it on the entry's *headword* row — the form tagged
 * `canonical`, e.g. `thēsaurus` with tags `canonical,masculine` — and only
 * sometimes repeats it on a sense. Reading both takes Latin to 96%.
 *
 * `forms` are the rows `reference.formsFor` returns: `{ form, tags }` with the
 * tags comma-joined. Callers that have not got them may leave them out, and
 * get the sense-only answer.
 */
export function genderOf(data, forms = []) {
  for (const sense of parse(data).senses ?? []) {
    for (const tag of sense.tags ?? []) if (GENDERS.includes(tag)) return tag;
  }
  for (const row of forms) {
    const tags = (row.tags ?? "").split(",");
    if (!tags.includes("canonical")) continue;
    const gender = tags.find((tag) => GENDERS.includes(tag));
    if (gender) return gender;
  }
  return undefined;
}
