/**
 * Where the offline scripts get their answers about the language itself.
 *
 * Two questions run through everything here: is this inflected form a real word
 * (attestation), and which lemmas does the frequency band contain (vocabulary).
 * Both used to be answered by a pair of SQLite files in a sibling checkout —
 * 474 MB for Latin — which meant the gates that asked them could only run on
 * one laptop and reported themselves *skipped* everywhere else, CI included.
 *
 * So there are two backends behind one interface:
 *
 *   pack        the default. `content/lemmas.json.gz`, which every pack already
 *               ships, plus the vendored `reference/frequency.tsv.gz`. Answers
 *               attestation and vocabulary; knows nothing about entries.
 *   dictionary  --ref / $LANG_REF. The full reference databases, when they are
 *               there. Answers everything, including the entry-level questions
 *               that build a lemma map in the first place.
 *
 * The pack backend is not the poor relation. On Latin it attests 98.4% of the
 * generated answer tokens where the dictionary manages 94.4%, because the
 * dictionary is a Wiktionary dump built around inflected forms and is missing
 * 47 of the commonest indeclinables outright — the holes that the packs'
 * `gen/config.mjs` `functionWords` lists exist to paper over.
 *
 * What the pack backend genuinely cannot do is `entriesFor`/`formsFor`: glosses,
 * genders and the tagged, macronized forms a citation is made of. Those are the
 * inputs to `build-lemmas.mjs` and the packs' `citations.mjs`, which is why
 * those two require the dictionary backend and say so.
 */
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { compileFold } from "@lang-tutor/core";
import { loadLemmaIndex } from "./pack.mjs";

export const FREQUENCY_FILE = "frequency.tsv.gz";

/** The pack's vendored reference data, as opposed to its shipped `content/`. */
export function referenceDir(dir) {
  return join(dir, "reference");
}

/**
 * Resolve `--ref`, then `$LANG_REF`, then `$LATIN_REF` for the pack that
 * predates the rename. There is deliberately no fallback path: the dictionary
 * is either pointed at or absent, and absent is a supported state rather than
 * a broken one.
 */
export function dictionaryDir(profile, argv = process.argv.slice(2)) {
  const i = argv.indexOf("--ref");
  if (i >= 0) return argv[i + 1];
  return (
    process.env.LANG_REF ??
    (profile.id === "latin" ? process.env.LATIN_REF : undefined)
  );
}

/**
 * A reference for one pack, backed by the dictionary when it is pointed at and
 * by the pack's own content otherwise.
 *
 * `lemmaOf` folds, because the only thing anyone does with it is compare it
 * against other folded text. The row-returning methods do not: the coverage
 * report wants `lemma_norm` to compare, and the generator wants `lemma` to put
 * in a prompt, where a folded Greek headword would have lost its accents and
 * breathings and be no use to anybody.
 */
export function openReference(dir, profile, argv = process.argv.slice(2)) {
  const ref = dictionaryDir(profile, argv);
  if (ref && existsSync(join(ref, "dictionary.db"))) {
    return dictionaryReference(ref, profile);
  }
  if (ref) {
    throw new Error(
      `no dictionary.db at ${ref}\n` +
        `Drop --ref/$LANG_REF to use the pack's own content, or see ` +
        `scripts/reference/README.md for how to build one.`,
    );
  }
  return packReference(dir, profile);
}

/** Fail unless the full dictionary is behind this reference. */
export function requireDictionary(reference, profile) {
  if (reference.source === "dictionary") return reference;
  throw new Error(
    `${profile.id}: this needs the reference dictionary, and ${reference.label} ` +
      `cannot answer for it.\n` +
      `Point at one with --ref /path/to/languages/${profile.id} or LANG_REF=..., ` +
      `or build one with scripts/reference/ (see its README).`,
  );
}

// --- the pack's own content ---------------------------------------------------

function packReference(dir, profile) {
  const fold = compileFold(profile.fold);
  const freqPath = join(referenceDir(dir), FREQUENCY_FILE);

  // Both files are big and only some callers need either, so neither is read
  // until something asks a question that needs it.
  let map;
  const lemmas = () => (map ??= loadLemmaIndex(dir));

  let rows;
  const frequency = () => {
    if (rows) return rows;
    if (!existsSync(freqPath)) {
      throw new Error(
        `no ${FREQUENCY_FILE} in ${referenceDir(dir)}\n` +
          `Build it with: node scripts/make-reference.mjs --pack ${dir} --ref /path/to/reference`,
      );
    }
    // The inverse of make-reference.mjs's escape: a lemma may legitimately
    // contain a newline, and one of Latin's does.
    const unescape = (s) =>
      s.replace(/\\(.)/g, (_, c) => ({ t: "\t", n: "\n", r: "\r" })[c] ?? c);
    rows = gunzipSync(readFileSync(freqPath))
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [rank, lemma, lemma_norm, pos] = line.split("\t").map(unescape);
        return { rank: Number(rank), lemma, lemma_norm, pos: pos || null };
      });
    return rows;
  };

  return {
    source: "pack",
    label: `the ${profile.id} pack's own content`,
    // No directory of loose reference material to go alongside; the callers
    // that look for one (Greek's corpus tie-breaker) treat absence as "no
    // evidence" and decide without it.
    dir: null,

    /**
     * Attested means *a ranked lemma has this form* — not merely that the
     * dictionary knows the word.
     *
     * The map used to be the ranked lemmas and nothing else, so "is this a key"
     * and "is this a word we have any business teaching" were the same question.
     * Now that the whole dictionary ships, they are not: 149k lemmas would
     * attest almost anything, and C5 and `gen-tests`'s ok/unverified classifier
     * would go quietly green on words no student will meet. Asking for a rank
     * keeps this gate at exactly the strength it had when the map was small.
     */
    attests: (formNorm) => lemmas().lookup(formNorm).some((e) => e.rank != null),

    // The map is sorted most-frequent-first by build-lemmas, so the first
    // candidate is the reading the crib itself offers — the closest thing there
    // is to the dictionary join's arbitrary `limit 1`, and a better answer.
    //
    // Unranked candidates sort last, so a form that had a ranked reading still
    // gets it. A form that had none now answers with a tail lemma where it used
    // to answer with nothing — which cannot move C7, since a tail lemma is by
    // definition absent from the frequency list and so from any band.
    lemmaOf(formNorm) {
      const candidates = lemmas().lookup(formNorm);
      return candidates.length ? fold(candidates[0].lemma) : undefined;
    },

    ranked: (maxRank) => frequency().filter((r) => r.rank <= maxRank),

    band: ({ min, max, pos }) =>
      frequency().filter(
        (r) => r.rank >= min && r.rank <= max && (!pos.length || pos.includes(r.pos)),
      ),

    top: (n) => frequency().slice(0, n),

    allRanks: () => frequency().map((r) => r.rank),

    /**
     * D2 against what is actually committed: the map's keys have to be fold
     * output, and the frequency list's `lemma_norm` has to be what the fold
     * makes of its `lemma`. Both were written by the pipeline that built the
     * dictionary, so this catches the same drift the old dictionary-side check
     * did — and unlike it, this one can run in CI.
     */
    foldAgreement() {
      const bad = [];
      let checked = 0;
      for (const k of lemmas().forms()) {
        checked++;
        if (fold(k) !== k) bad.push({ shown: k, stored: fold(k) });
      }
      const freq = frequency();
      for (const r of freq) {
        if (fold(r.lemma) !== r.lemma_norm) {
          bad.push({ shown: r.lemma, stored: r.lemma_norm });
        }
      }
      return {
        checked: checked + freq.length,
        bad,
        what: "the lemma map's keys and the frequency list's lemma_norm",
      };
    },

    entriesFor: () => { throw new Error("entriesFor needs the dictionary backend"); },
    formsFor: () => { throw new Error("formsFor needs the dictionary backend"); },
    lemmaEntries: () => { throw new Error("lemmaEntries needs the dictionary backend"); },

    close() {},
  };
}

// --- the reference databases ---------------------------------------------------

/** The senses of an entry's `data` blob, or none if it is junk. */
function parseSenses(data) {
  try {
    return JSON.parse(data)?.senses ?? [];
  } catch {
    return [];
  }
}

/**
 * The tags wiktextract writes on a sense that is only a wordform.
 *
 * `alt-of` is deliberately not here. An alternative spelling — `tago` for
 * `tangō`, Old-Latin `en` for `in` — is a word a student can meet on a page and
 * will want to look up, and unlike an inflection it is not reachable through
 * some other entry's form table. Excluding it cost 4,703 lemmas and every one
 * of them was a lookup someone could plausibly need.
 */
const INFLECTION_TAGS = ["form-of", "inflection", "participle"];

const isInflection = (sense) =>
  (sense.tags ?? []).some((t) => INFLECTION_TAGS.includes(t));

function dictionaryReference(ref, profile) {
  const fold = compileFold(profile.fold);
  const dict = new DatabaseSync(join(ref, "dictionary.db"), { readOnly: true });

  const freqPath = join(ref, "frequencies.db");
  if (!existsSync(freqPath)) {
    throw new Error(
      `dictionary.db is at ${ref} but frequencies.db is not.\n` +
        `Build it with scripts/reference/ingest_frequency.py (see the README there).`,
    );
  }
  const freq = new DatabaseSync(freqPath, { readOnly: true });

  const attested = dict.prepare("select 1 from forms where form_norm = ? limit 1");
  const lemmaFor = dict.prepare(
    "select e.word_norm w from forms f join entries e on e.id = f.entry_id where f.form_norm = ? limit 1",
  );
  const entries = dict.prepare(
    "select id, word, pos, data from entries where word_norm = ? and pos = ?",
  );
  const forms = dict.prepare("select form, tags from forms where entry_id = ?");

  return {
    source: "dictionary",
    label: ref,
    /** The reference directory itself, for what lives beside the databases. */
    dir: ref,

    attests: (formNorm) => Boolean(attested.get(formNorm)),
    lemmaOf: (formNorm) => lemmaFor.get(formNorm)?.w,

    ranked: (maxRank) =>
      freq
        .prepare(
          "select lemma, lemma_norm, pos, rank from frequency where rank <= ? order by rank",
        )
        .all(maxRank),

    band: ({ min, max, pos }) =>
      freq
        .prepare(
          `select lemma, lemma_norm, pos, rank from frequency where rank between ? and ?` +
            (pos.length ? ` and pos in (${pos.map(() => "?").join(",")})` : "") +
            ` order by rank`,
        )
        .all(min, max, ...pos),

    top: (n) =>
      freq
        .prepare("select lemma, lemma_norm, pos, rank from frequency order by rank limit ?")
        .all(n),

    allRanks: () =>
      freq.prepare("select rank from frequency order by rank").all().map((r) => r.rank),

    /**
     * The invariant this whole indirection exists to protect: `form_norm` is
     * what every lookup is keyed by, so a fold that disagrees with it turns
     * every lookup into a miss while both halves look healthy on their own.
     * Sampled rather than exhaustive — 2.5M forms is a long wait for an answer
     * that a mismatch gives in the first hundred.
     */
    foldAgreement() {
      const SAMPLE = 20000;
      const f = dict.prepare(`select form, form_norm from forms limit ${SAMPLE}`).all();
      const e = dict.prepare(`select word, word_norm from entries limit ${SAMPLE}`).all();
      const bad = [
        ...f.filter((r) => fold(r.form) !== r.form_norm)
          .map((r) => ({ shown: r.form, stored: r.form_norm })),
        ...e.filter((r) => fold(r.word) !== r.word_norm)
          .map((r) => ({ shown: r.word, stored: r.word_norm })),
      ];
      return {
        checked: f.length + e.length,
        bad,
        what: "the dictionary's form_norm and word_norm",
      };
    },

    /** Every entry under one folded headword and part of speech. */
    entriesFor: (wordNorm, pos) => entries.all(wordNorm, pos ?? ""),

    /**
     * Every entry the dictionary holds that is a word rather than a wordform.
     *
     * Most of a Wiktionary dump is not lemmas: 736,879 of Latin's 885,996
     * entries exist only to say "this is the imperfect of that", and every one
     * of them is already reachable through the `forms` table of the entry it
     * points at. Keeping them would multiply the shipped dictionary five times
     * over to add nothing a lookup could not already find.
     *
     * The test is that *every* sense is an inflection. A word whose senses are
     * partly its own — `dictus` is the participle of `dico` and an adjective in
     * its own right — is a lemma, and is kept.
     *
     * Yielded rather than returned: this is 886k rows and the caller wants them
     * one at a time.
     */
    *lemmaEntries() {
      for (const row of dict.prepare("select id, word, pos, data from entries").iterate()) {
        const senses = parseSenses(row.data);
        if (senses.length && senses.every(isInflection)) continue;
        yield row;
      }
    },

    /** Every tagged form of one entry. Tags are comma-joined and sorted. */
    formsFor: (entryId) =>
      forms.all(entryId).map((r) => ({ form: r.form, tags: r.tags ?? "" })),

    close() {
      dict.close();
      freq.close();
    },
  };
}
