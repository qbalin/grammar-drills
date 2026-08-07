/**
 * Attested quotations, distilled out of the reference dictionary's raw dump.
 *
 * The dump behind `dictionary.db` carries, on many senses, an example sentence
 * with a citation — author, work and locus. `scripts/reference/ingest_dictionary.py`
 * throws them away, because a dictionary needs glosses and forms and nothing
 * else. They are the only source of genuinely attested sentences the repo can
 * reach without a new corpus, so this module recovers them.
 *
 * Four filters decide what survives, and each of them was measured rather than
 * guessed. Against the Latin dump, at this module's own default policy (4-30
 * words, classical, prose): 9,522 distinct cited examples, 9,179 of them at
 * least four words, and then
 *
 *   sentence-shaped   3,169   a fragment is not a translation exercise
 *   elided/unparsed   2,018   a citation this cannot split is not shown
 *                             half-attributed
 *   classical         1,560   the dump quotes Kepler, Linnaean taxonomists and
 *                             a 2023 papal bull as readily as it quotes Cicero
 *   prose               944   a hexameter's word order is not a model of usage
 *   macronized          398   the pack's answers are marked; bare Latin beside
 *                             them is a defect no gate can see, because the
 *                             fold strips marks before anything compares them
 *
 * CORRECTION, 2026-08-07. This header and the commit that added it (60e8f15)
 * recorded 4,042 sentence-shaped and 799 macronized. The 4,042 reproduces
 * exactly, but only with no upper word bound; the 799 does not reproduce at
 * all, on the same dump and this same code, at any policy tried. The numbers
 * above are what the module actually measures today, and the divergence is
 * recorded rather than quietly overwritten because a number nobody can
 * reproduce is worse than a number that moved.
 *
 * The macron cut is no longer the end of the story: `scripts/lib/macronize.mjs`
 * inverts the fold where the dictionary makes it unambiguous, which is why
 * `marks: "any"` exists below. Of the 944, 373 are already marked and carry no
 * unattested form at all, and 159 more are attestation-clean and need a choice
 * on one or two words.
 *
 * Either way this is one input among several and not a replacement for the
 * generator, and it reports its own funnel rather than looking sufficient.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Authors whose Latin the pack means to teach.
 *
 * An allowlist rather than a blocklist, because the tail is 1,267 distinct
 * author strings long and most of it is Neo-Latin: eighteenth-century
 * entomologists naming beetles, Kepler, a modern taxonomist or two. Their Latin
 * is perfectly correct and entirely beside the point — a student asking for
 * classical authors has not asked for a species description from 1761.
 *
 * Keyed by the surname the dump usually gives, with the variants it also uses.
 * The dump is inconsistent about this: Cicero appears as both `Cicero` and
 * `Marcus Tullius Cicero`, Pliny as `Plinius Maior` and `Pliny the Elder`.
 */
const CLASSICAL = [
  ["Cicero", ["Marcus Tullius Cicero", "Tullius Cicero"]],
  ["Plautus", ["Titus Maccius Plautus", "Maccius Plautus"]],
  ["Vergilius", ["Vergil", "Virgil", "Publius Vergilius Maro"]],
  ["Publius Terentius Afer", ["Terence", "Terentius Afer"]],
  ["Julius Caesar", ["Gaius Julius Caesar", "Caesar"]],
  ["Plinius Maior", ["Pliny the Elder"]],
  ["Plinius Minor", ["Pliny the Younger"]],
  ["Seneca Minor", ["Seneca the Younger", "Lucius Annaeus Seneca"]],
  ["Seneca Maior", ["Seneca the Elder"]],
  ["Titus Livius", ["Livy"]],
  ["Ovidius", ["Ovid", "Publius Ovidius Naso"]],
  ["Petronius", []],
  ["Suetonius", ["Gaius Suetonius Tranquillus"]],
  ["Marcus Terentius Varro", ["Varro"]],
  ["Apuleius", []],
  ["Columella", []],
  ["Aulus Gellius", ["Gellius"]],
  ["Tacitus", ["Publius Cornelius Tacitus"]],
  ["Marcus Porcius Cato", ["Cato"]],
  ["Catullus", ["Gaius Valerius Catullus"]],
  ["Horatius", ["Horace", "Quintus Horatius Flaccus"]],
  ["Martialis", ["Martial"]],
  ["Vitruvius", []],
  ["Gaius Sallustius Crispus", ["Sallust", "Sallustius"]],
  ["Quintilianus", ["Quintilian"]],
  ["Aulus Cornelius Celsus", ["Celsus"]],
  ["Lucretius", ["Titus Lucretius Carus"]],
  ["Juvenalis", ["Juvenal"]],
  ["Statius", []],
  ["Publilius Syrus", []],
  ["Propertius", []],
  ["Tibullus", []],
  ["Phaedrus", []],
  ["Nepos", ["Cornelius Nepos"]],
  ["Curtius Rufus", ["Quintus Curtius Rufus"]],
  ["Valerius Maximus", []],
  ["Lucanus", ["Lucan"]],
  ["Ennius", []],
  ["Sextus Pompeius Festus", ["Festus"]],
  ["Nonius Marcellus", []],
];

/**
 * Verse and drama.
 *
 * Excluded not because the Latin is worse but because word order in hexameter
 * and in stage dialogue is not what a student translating prose should be
 * shown as the model answer. Kept as its own switch so the decision is visible
 * and reversible rather than baked into the allowlist.
 */
const VERSE = new Set([
  "Vergilius",
  "Ovidius",
  "Horatius",
  "Lucretius",
  "Catullus",
  "Martialis",
  "Juvenalis",
  "Statius",
  "Propertius",
  "Tibullus",
  "Plautus",
  "Publius Terentius Afer",
  "Phaedrus",
  "Lucanus",
  "Ennius",
  "Publilius Syrus",
]);

const CANON = new Map();
for (const [name, aliases] of CLASSICAL) {
  CANON.set(name.toLowerCase(), name);
  for (const alias of aliases) CANON.set(alias.toLowerCase(), name);
}

/** The canonical author name for a `ref`'s author part, or null if not classical. */
export function classicalAuthor(name) {
  return CANON.get(name.trim().toLowerCase()) ?? null;
}

export function isVerse(author) {
  return VERSE.has(author);
}

const MACRON = /[āēīōūȳĀĒĪŌŪȲ]/;
const ELLIPSIS = /\[…\]|\.\.\.|…/;
/** A capital to start and a stop to end: the cheapest test for "whole sentence". */
const SENTENCE = /^[A-ZĀĒĪŌŪ]/;
const TERMINAL = /[.!?]["'”’]?$/;
/**
 * Wiktionary's own placeholder, which is not a translation and must not be
 * counted as one. 776 of the sentence-shaped Latin quotations carry it.
 */
const NO_TRANSLATION = /please add an English translation/i;
/** Long-s, which arrives from OCR'd editions and matches nothing in the dictionary. */
const LONG_S = /ſ/g;

/**
 * Split a `ref` into author, work and locus.
 *
 * Three comma-separated parts — `c. 52 BCE, Julius Caesar, Commentarii de bello
 * Gallico 4.25` — is the shape 76% of them have, and it is the only shape worth
 * parsing. The rest are Wiktionary's full citation template, which runs to ten
 * parts with an editor, a publisher and an ISBN; a parser for those is a
 * fortnight of special cases for a handful of quotations. They keep the raw
 * string and are dropped by the caller rather than shown half-attributed.
 */
export function parseRef(ref) {
  const parts = ref.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return null;
  const [date, author, tail] = parts;
  const at = tail.match(/^(.*?)[\s,]+([\dIVXLCDM]+[\d.,:–-]*)$/);
  const work = (at ? at[1] : tail).trim();
  const locus = at ? at[2].replace(/[.,]$/, "") : undefined;
  if (!author || !work) return null;
  return { date, author, work, ...(locus ? { locus } : {}) };
}

/**
 * Every distinct cited example in the dump, as records, before any era or
 * length policy is applied. The caller decides what to keep; this only reads.
 *
 * The dump is 1.2 GB and is not committed, so this streams and is expected to
 * run once, into an artifact that is.
 */
export async function* readQuotes(dumpPath) {
  const seen = new Set();
  const rl = createInterface({
    input: createReadStream(dumpPath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    // Cheap reject before the JSON parse: most of the 891,525 lines have no
    // citation at all, and parsing them all costs minutes.
    if (!line.includes('"ref"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    for (const sense of entry.senses ?? []) {
      for (const example of sense.examples ?? []) {
        if (!example.ref || !example.text) continue;
        const text = example.text.replace(LONG_S, "s").trim();
        if (seen.has(text)) continue;
        seen.add(text);
        const english = example.english?.trim() ?? "";
        yield {
          text,
          ref: example.ref.trim(),
          refParsed: parseRef(example.ref),
          english,
          englishIsPlaceholder: english ? NO_TRANSLATION.test(english) : false,
          hostLemma: entry.word,
          hostPos: entry.pos,
          wordCount: text.split(/\s+/).filter(Boolean).length,
          macronized: MACRON.test(text),
          hasEllipsis: ELLIPSIS.test(text),
        };
      }
    }
  }
}

/**
 * Which cut a quote falls at, or null if it survives all of them.
 *
 * Returned as a reason rather than a boolean so the caller can print the funnel;
 * "3,158 survived" is not an answer anyone can act on, and the shape of the
 * losses is the whole finding.
 */
/**
 * `marks` decides whether the last cut applies.
 *
 * `"require"` is the original policy: an unmarked sentence beside marked ones is
 * a defect no gate can see, so drop it. `"any"` keeps it, and is only honest
 * when the caller has something that puts the marks back — see
 * `scripts/lib/macronize.mjs`, which is why this switch exists at all.
 */
export function rejectionOf(quote, policy) {
  const {
    minWords = 4,
    maxWords = 30,
    era = "classical",
    verse = false,
    marks = "require",
  } = policy;
  if (quote.wordCount < minWords) return "tooShort";
  if (quote.wordCount > maxWords) return "tooLong";
  if (!SENTENCE.test(quote.text) || !TERMINAL.test(quote.text)) return "notASentence";
  if (quote.hasEllipsis) return "elided";
  if (!quote.refParsed) return "refUnparsed";
  const author = classicalAuthor(quote.refParsed.author);
  if (era === "classical" && !author) return "notClassical";
  if (!verse && author && isVerse(author)) return "verse";
  if (marks === "require" && !quote.macronized) return "unmacronized";
  return null;
}

export const FUNNEL_ORDER = [
  "tooShort",
  "tooLong",
  "notASentence",
  "elided",
  "refUnparsed",
  "notClassical",
  "verse",
  "unmacronized",
];
