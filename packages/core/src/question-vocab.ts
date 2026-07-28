/**
 * The vocabulary of one question: the English of the prompt set against the
 * canonical Latin of the words the answer needs.
 *
 * The sentences are drawn from frequency ranks 400–6000, so a beginner meets
 * words they have never seen and has nothing to do about it but submit an empty
 * answer. Everything needed to help is already shipped — the reference answer
 * and a 242,746-form dictionary whose citations carry verb principal parts and
 * adjective terminations — so this assembles it into a crib.
 *
 * It is a crib and not a reveal: the words come back in the *prompt's* order,
 * never the answer's, and in their dictionary form. The student still has to
 * decline, conjugate and order them.
 *
 * The words are taken from `Question.answer` rather than `Question.vocab`, which
 * holds the same tokens: `scripts/build-web-content.mjs` drops `vocab` from the
 * web bundle to save its bytes, and a hint that exists in the terminal but not
 * on the phone is worse than one built the same way for both.
 */

import { normalize } from "./normalize.js";
import type { LemmaEntry, LemmaLookup, Question } from "./types.js";

/**
 * Why a row looks the way it does. Both apps branch on this rather than on the
 * absent fields, because "the English never said this word" and "no dictionary
 * has this word" are different apologies and have to read differently.
 */
export type VocabStatus = "paired" | "unpaired" | "unknown";

/** One line of a question's vocabulary. */
export interface VocabWord {
  /** The Latin form as it stands in the answer, punctuation stripped. */
  form: string;
  /**
   * The word from the prompt this form translates, when one could be found.
   * Absent for the words a Latin sentence needs and an English one does not —
   * `est`, `in`, `quod` — and wherever the match simply failed.
   */
  english?: string;
  /**
   * The dictionary entry chosen. Absent when the form is in no dictionary at
   * all, which is not a verdict on the word: the dictionary is large but finite,
   * and it is missing most indeclinables and many participles.
   */
  entry?: LemmaEntry;
  /** The other readings of an ambiguous form, best first, minus `entry`. */
  others: LemmaEntry[];
  status: VocabStatus;
}

/**
 * A word with the punctuation the sentence dressed it in taken off: `amat.`,
 * `«rosam»`, `Fīliae,`. Only the ends — nothing inside a word is punctuation.
 */
export function stripPunctuation(token: string): string {
  return token.replace(/^[^\p{Letter}]+|[^\p{Letter}]+$/gu, "");
}

/**
 * The words of a Latin sentence, punctuation stripped, in order.
 *
 * One definition shared by everything that has to cut a sentence into words —
 * the vocabulary crib here, the hold-to-record gesture on the web, and the
 * answer comparison in the CLI — because three copies of this regex drifting
 * apart would mean a word you can hold but cannot look up.
 */
export function latinWords(text: string): string[] {
  return text.split(/\s+/).map(stripPunctuation).filter((word) => word !== "");
}

/**
 * English words carrying no meaning to match on. Matching against these would
 * pair a Latin word with whichever "the" or "having" came first, which is worse
 * than leaving it unpaired: an unpaired word says "work this one out", a wrongly
 * paired one says something false.
 */
const ENGLISH_STOP = new Set(
  ("a an the and or but of to in on at by for from with as so that this these those" +
    " is are was were be been being am has have had having do does did will would" +
    " shall should may might must can could not no nor if then than when while" +
    " he she it they we you i him her them us his hers its their our your my mine" +
    " there here who whom whose which what").split(/\s+/),
);

/**
 * Irregular English, which no suffix rule can reach. The prompts are ordinary
 * narrative English, so past tenses like *led*, *fled* and *sought* are common,
 * and each one missing costs a word its English partner.
 */
const ENGLISH_IRREGULAR: Record<string, string> = {
  led: "lead", fled: "flee", went: "go", gone: "go", took: "take",
  taken: "take", saw: "see", seen: "see", gave: "give", given: "give",
  came: "come", sent: "send", built: "build", fought: "fight",
  brought: "bring", bought: "buy", caught: "catch", taught: "teach",
  sought: "seek", thought: "think", told: "tell", sold: "sell",
  held: "hold", heard: "hear", kept: "keep", left: "leave", lost: "lose",
  made: "make", met: "meet", paid: "pay", ran: "run", said: "say",
  sat: "sit", spoke: "speak", spoken: "speak", stood: "stand",
  struck: "strike", wrote: "write", written: "write", knew: "know",
  known: "know", grew: "grow", threw: "throw", thrown: "throw",
  drove: "drive", driven: "drive", rose: "rise", risen: "rise",
  chose: "choose", chosen: "choose", began: "begin", begun: "begin",
  broke: "break", broken: "break", fell: "fall", fallen: "fall",
  felt: "feel", found: "find", forgot: "forget", froze: "freeze",
  hid: "hide", hidden: "hide", sang: "sing", sung: "sing",
  drank: "drink", drunk: "drink", swam: "swim", flew: "fly",
  flown: "fly", slew: "slay", slain: "slay", bore: "bear", borne: "bear",
  won: "win", shone: "shine", rode: "ride", ridden: "ride",
  wore: "wear", worn: "wear", arose: "arise", arisen: "arise",
  beheld: "behold", bound: "bind", burnt: "burn", dealt: "deal",
  dug: "dig", drew: "draw", drawn: "draw", fed: "feed", laid: "lay",
  lain: "lie", lent: "lend", lit: "light", shot: "shoot",
  shut: "shut", slept: "sleep", spent: "spend", spread: "spread",
  sprang: "spring", stole: "steal", stolen: "steal", swore: "swear",
  sworn: "swear", swept: "sweep", tore: "tear", torn: "tear",
  woke: "wake", wound: "wind",
  men: "man", women: "woman", children: "child", feet: "foot",
  teeth: "tooth", geese: "goose", mice: "mouse", oxen: "ox",
  wives: "wife", lives: "life", knives: "knife", leaves: "leaf",
  thieves: "thief", wolves: "wolf", selves: "self",
};

/**
 * How far a spelling is from the word the prompt actually used. A match that
 * bent the word less is a better match, and the tiers are tried in order.
 *
 * It is what separates the two readings of `dōna` in "the queen gave gifts to
 * the gods": *gift*→*gifts* is a plural, *give*→*gave* is an irregular past, so
 * the noun is offered and `dōnum, dōnī` wins over `dōnō, dōnāre`. Without the
 * tiers whichever Latin word came first would simply take the prompt word it
 * happened to reach.
 */
const AS_WRITTEN = 0;
const INFLECTED = 1;
const IRREGULAR = 2;
const TIERS = [AS_WRITTEN, INFLECTED, IRREGULAR];

/**
 * Every spelling of an English word worth matching on — the word itself, what it
 * looks like stripped of an inflection, and what it looks like carrying one —
 * each with how far it was bent to get there.
 *
 * Both directions are needed because either side may be the inflected one: the
 * prompt says *carrying* where the gloss says *carry*, and *daughters* where it
 * says *daughter*, but it also says *war* where a gloss says *wars*.
 */
function englishForms(word: string): Map<string, number> {
  const out = new Map<string, number>();
  // Kept only if nothing nearer claims the spelling first.
  const at = (form: string, tier: number) => {
    // Two letters match too much: "an" would pair with half the glosses in the
    // dictionary.
    if (form.length < 3) return;
    const known = out.get(form);
    if (known === undefined || tier < known) out.set(form, tier);
  };

  // "the farmer's daughters" is the only place the farmer is named, and no
  // dictionary glosses anything as "farmer's".
  const w = word.toLowerCase().replace(/'s$|'$/, "");
  at(w, AS_WRITTEN);

  const irregular = ENGLISH_IRREGULAR[w];
  if (irregular) at(irregular, IRREGULAR);

  // Strip an inflection.
  if (w.endsWith("ies") && w.length > 4) at(`${w.slice(0, -3)}y`, INFLECTED);
  if (w.endsWith("ves") && w.length > 4) {
    at(`${w.slice(0, -3)}f`, INFLECTED);
    at(`${w.slice(0, -3)}fe`, INFLECTED);
  }
  for (const suffix of ["es", "s", "ed", "ing", "ly", "er", "est", "en"]) {
    if (!w.endsWith(suffix) || w.length - suffix.length < 3) continue;
    const base = w.slice(0, -suffix.length);
    at(base, INFLECTED);
    // "loved" -> "love". "carrying" -> "carrye" is junk, but harmless: it only
    // ever has to *fail* to match.
    at(`${base}e`, INFLECTED);
    // "stopped" -> "stop", "running" -> "run".
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      at(base.slice(0, -1), INFLECTED);
    }
  }

  // Add one.
  for (const suffix of ["s", "es", "ed", "ing", "d"]) at(`${w}${suffix}`, INFLECTED);
  if (w.endsWith("y")) at(`${w.slice(0, -1)}ies`, INFLECTED);
  if (w.endsWith("e")) at(`${w.slice(0, -1)}ing`, INFLECTED);

  return out;
}

/**
 * A dictionary gloss cut into the senses it lists.
 *
 * "to carry, bear; to convey, bring" is four senses, and the citation form of a
 * verb is glossed with the infinitive marker the prompt will never use.
 */
function glossSenses(gloss: string): string[] {
  return gloss
    .split(/[;,]/)
    .map((sense) => sense.trim().toLowerCase().replace(/^(?:to|an?|the)\s+/, ""))
    .filter((sense) => sense !== "");
}

/** The words of one sense, for when the sense is a phrase. */
function senseWords(sense: string): string[] {
  return sense.match(/[a-z']+/g) ?? [];
}

/** Where a spelling could have come from, and how far it was bent to get there. */
interface Candidate {
  position: number;
  tier: number;
}

/** A prompt laid out for matching: each content word, in the order it is read. */
interface PromptIndex {
  words: string[];
  /** Any spelling of a prompt word -> the words it could be. */
  byForm: Map<string, Candidate[]>;
}

function indexPrompt(prompt: string): PromptIndex {
  const words = (prompt.match(/[A-Za-z']+/g) ?? []).filter(
    (w) => !ENGLISH_STOP.has(w.toLowerCase()),
  );
  const byForm = new Map<string, Candidate[]>();
  words.forEach((word, position) => {
    for (const [form, tier] of englishForms(word)) {
      const at = byForm.get(form);
      if (at) at.push({ position, tier });
      else byForm.set(form, [{ position, tier }]);
    }
  });
  return { words, byForm };
}

/** A form matched to a reading of it and a word of the prompt. */
interface Match {
  entry: LemmaEntry;
  position: number;
}

/**
 * The best reading of one Latin form given what the prompt says, or null.
 *
 * Candidates are already ranked by corpus frequency, and the first one is what
 * the app would otherwise show. Frequency alone is often not merely a different
 * answer but a wrong one — `bellum` is far more often the adjective *pretty*
 * than the noun *war*, and a beginner told `bellum` means *pretty* is worse off
 * than with no crib at all. So a reading the prompt corroborates always wins.
 */
function matchForm(
  candidates: LemmaEntry[],
  prompt: PromptIndex,
  taken: Set<number>,
  maxTier: number,
  whole: boolean,
): Match | null {
  for (const entry of candidates) {
    for (const sense of glossSenses(entry.gloss)) {
      // A whole sense first ("young man"), then its separate words. Run over
      // every form before falling back, or a one-word sense elsewhere in the
      // sentence would beat an exact phrase.
      for (const term of whole ? [sense] : senseWords(sense)) {
        if (term.length < 3) continue;
        for (const { position, tier } of prompt.byForm.get(term) ?? []) {
          if (tier > maxTier || taken.has(position)) continue;
          return { entry, position };
        }
      }
    }
  }
  return null;
}

/**
 * The vocabulary of one question, ordered for display.
 *
 * `dictionary` is anything that resolves a form — `Content` satisfies it — so
 * this works over the CLI's whole in-memory map and the web's bisected index
 * alike. A dictionary that resolves nothing yields one bare row per word rather
 * than an empty list: the words are still what the answer needs.
 */
export function questionVocabulary(
  dictionary: LemmaLookup,
  question: Question,
): VocabWord[] {
  // Every shipped question translates English into Latin, so the prompt is the
  // English. Guarding rather than assuming: a `parse` or `translate-la-en`
  // question would have a Latin prompt, and pairing Latin with Latin would
  // produce confident nonsense.
  const alignable = question.kind === "translate-en-la";
  const prompt = alignable
    ? indexPrompt(question.prompt)
    : { words: [], byForm: new Map<string, Candidate[]>() };

  // Deduped: a word repeated in the answer is one word to learn.
  const seen = new Set<string>();
  const forms = latinWords(question.answer).filter((form) => {
    const key = normalize(form);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const candidates = forms.map((form) => dictionary.lookup(form));
  const matched = new Array<Match | null>(forms.length).fill(null);
  const taken = new Set<number>();

  // Nearest matches first, and among those the whole sense before its separate
  // words. A prompt word answers for one Latin word only: without that, "the
  // woods" would be handed to every word whose gloss mentions a wood.
  for (const maxTier of TIERS) {
    for (const whole of [true, false]) {
      forms.forEach((_form, i) => {
        if (matched[i]) return;
        const hit = matchForm(candidates[i]!, prompt, taken, maxTier, whole);
        if (!hit) return;
        matched[i] = hit;
        taken.add(hit.position);
      });
    }
  }

  const rows = forms.map((form, i): VocabWord & { order: number } => {
    const hit = matched[i];
    const readings = candidates[i]!;
    // Annotated, not inferred: with no dictionary entry at all this really is
    // undefined, and every caller has to render that case.
    const entry: LemmaEntry | undefined = hit?.entry ?? readings[0];
    const status: VocabStatus = hit ? "paired" : entry ? "unpaired" : "unknown";
    return {
      form,
      english: hit ? prompt.words[hit.position] : undefined,
      entry,
      others: readings.filter((reading) => reading !== entry),
      status,
      // Three tiers, each keeping its own order. A row the English named is
      // what the student came for; a row with only a gloss is still teachable;
      // a row with nothing is an apology, and apologies go last.
      order:
        status === "paired"
          ? hit!.position
          : prompt.words.length + (status === "unpaired" ? 0 : forms.length) + i,
    };
  });

  // The prompt's order, not the answer's: the crib names the words, and leaves
  // the student to find where Latin puts them.
  return rows
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...row }) => row);
}
