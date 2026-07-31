/**
 * The vocabulary of one question: the prompt's own words set against the
 * canonical form of the words the answer needs.
 *
 * The sentences are drawn from the middle of the frequency list, so a beginner
 * meets words they have never seen and has nothing to do about it but submit an
 * empty answer. Everything needed to help is already shipped — the reference
 * answer and a dictionary whose citations carry each part of speech's proper
 * citation form — so this assembles it into a crib.
 *
 * It is a crib and not a reveal: the words come back in the *prompt's* order,
 * never the answer's, and in their dictionary form. The student still has to
 * inflect them and put them in order.
 *
 * The words are taken from `Question.answer` rather than `Question.vocab`, which
 * holds the same tokens: `scripts/build-web-content.mjs` drops `vocab` from the
 * web bundle to save its bytes, and a hint that exists in the terminal but not
 * on the phone is worse than one built the same way for both.
 *
 * Everything here that knows about a *language* is reached through the profile:
 * the fold, whether the question's kind puts L2 in the student's hands, and the
 * L1 adapter that reads the prompt.
 */

import { l1For, type L1Adapter, type PromptIndex } from "./l1/index.js";
import type { Fold } from "./fold.js";
import type { Profile } from "./pack.js";
import type { LemmaEntry, LemmaLookup, Question } from "./types.js";

/**
 * What the crib needs to know: a dictionary, the language, and the fold.
 * `Content` satisfies this, which is how both apps call it.
 */
export interface VocabSource extends LemmaLookup {
  readonly profile: Profile;
  readonly fold: Fold;
  isProduceKind(kind: string): boolean;
}

/**
 * Why a row looks the way it does. Both apps branch on this rather than on the
 * absent fields, because "the prompt never said this word" and "no dictionary
 * has this word" are different apologies and have to read differently.
 */
export type VocabStatus = "paired" | "unpaired" | "unknown";

/** One line of a question's vocabulary. */
export interface VocabWord {
  /** The L2 form as it stands in the answer, punctuation stripped. */
  form: string;
  /**
   * The prompt word this form translates, when one could be found. Absent for
   * the words an L2 sentence needs and the prompt's language does not — `est`,
   * `in`, `quod` — and wherever the match simply failed.
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
 *
 * Unicode-property based, so it holds for any script the pack writes in.
 */
export function stripPunctuation(token: string): string {
  return token.replace(/^[^\p{Letter}]+|[^\p{Letter}]+$/gu, "");
}

/**
 * The words of an L2 sentence, punctuation stripped, in order.
 *
 * One definition shared by everything that has to cut a sentence into words —
 * the vocabulary crib here, the hold-to-record gesture on the web, and the
 * answer comparison in the CLI — because three copies of this drifting apart
 * would mean a word you can hold but cannot look up.
 */
export function words(text: string): string[] {
  return text.split(/\s+/).map(stripPunctuation).filter((word) => word !== "");
}

/**
 * The dictionary's readings of one form, looking through an enclitic if it has
 * to.
 *
 * `ēloquentiamque` is one token to a whitespace split and no word to any
 * dictionary, because the `-que` is a separate particle the orthography glues
 * on. The generator's own `vocab` splits them; the crib reads the answer, so
 * without this it shows "not in the dictionary" for a word the student can see
 * is ordinary.
 *
 * The whole form is always tried first and wins whenever it resolves: `neque`
 * and `quisque` are words in their own right, and a rule that took the ending
 * off on sight would replace a right answer with a wrong one.
 */
function readings(source: VocabSource, form: string): LemmaEntry[] {
  const whole = source.lookup(form);
  if (whole.length) return whole;
  for (const enclitic of source.profile.enclitics ?? []) {
    if (form.length <= enclitic.length) continue;
    const stem = form.slice(0, -enclitic.length);
    // Compared folded: the answer is accented and the enclitic list is not.
    if (source.fold(form.slice(-enclitic.length)) !== source.fold(enclitic)) continue;
    const found = source.lookup(stem);
    if (found.length) return found;
  }
  return whole;
}

/** A form matched to a reading of it and a word of the prompt. */
interface Match {
  entry: LemmaEntry;
  position: number;
}

/**
 * The best reading of one L2 form given what the prompt says, or null.
 *
 * Candidates are already ranked by corpus frequency, and the first one is what
 * the app would otherwise show. Frequency alone is often not merely a different
 * answer but a wrong one — `bellum` is far more often the adjective *pretty*
 * than the noun *war*, and a beginner told `bellum` means *pretty* is worse off
 * than with no crib at all. So a reading the prompt corroborates always wins.
 */
function matchForm(
  candidates: LemmaEntry[],
  l1: L1Adapter,
  prompt: PromptIndex,
  taken: Set<number>,
  maxTier: number,
  whole: boolean,
): Match | null {
  for (const entry of candidates) {
    for (const sense of l1.glossSenses(entry.gloss)) {
      // A whole sense first ("young man"), then its separate words. Run over
      // every form before falling back, or a one-word sense elsewhere in the
      // sentence would beat an exact phrase.
      for (const term of whole ? [sense] : l1.senseWords(sense)) {
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

const NO_PROMPT: PromptIndex = { words: [], byForm: new Map() };

/**
 * The vocabulary of one question, ordered for display.
 *
 * `source` is anything that resolves a form and knows its language — `Content`
 * satisfies it — so this works over the CLI's whole in-memory map and the web's
 * bisected index alike. A dictionary that resolves nothing yields one bare row
 * per word rather than an empty list: the words are still what the answer needs.
 */
export function questionVocabulary(
  source: VocabSource,
  question: Question,
): VocabWord[] {
  // Pairing only makes sense when the prompt is L1 and the answer L2. Guarding
  // rather than assuming: a `parse` or reversed question has an L2 prompt, and
  // pairing L2 with L2 would produce confident nonsense. A prompt language with
  // no adapter is the same situation — no pairing, rather than wrong pairing.
  const l1 = source.isProduceKind(question.kind)
    ? l1For(source.profile.l1.code)
    : null;
  const prompt = l1 ? l1.indexPrompt(question.prompt) : NO_PROMPT;

  // Deduped: a word repeated in the answer is one word to learn.
  const seen = new Set<string>();
  const forms = words(question.answer).filter((form) => {
    const key = source.fold(form);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const candidates = forms.map((form) => readings(source, form));
  const matched = new Array<Match | null>(forms.length).fill(null);
  const taken = new Set<number>();

  // Nearest matches first, and among those the whole sense before its separate
  // words. A prompt word answers for one L2 word only: without that, "the
  // woods" would be handed to every word whose gloss mentions a wood.
  if (l1) {
    for (const maxTier of l1.tiers) {
      for (const whole of [true, false]) {
        forms.forEach((_form, i) => {
          if (matched[i]) return;
          const hit = matchForm(candidates[i]!, l1, prompt, taken, maxTier, whole);
          if (!hit) return;
          matched[i] = hit;
          taken.add(hit.position);
        });
      }
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
      // Three tiers, each keeping its own order. A row the prompt named is
      // what the student came for; a row with only a gloss is still teachable;
      // a row with nothing is an apology, and apologies go last.
      order:
        status === "paired"
          ? hit!.position
          : prompt.words.length + (status === "unpaired" ? 0 : forms.length) + i,
    };
  });

  // The prompt's order, not the answer's: the crib names the words, and leaves
  // the student to find where the language puts them.
  return rows
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...row }) => row);
}
