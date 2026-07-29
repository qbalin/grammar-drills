/**
 * Prompt-language adapters.
 *
 * The vocabulary crib has to read the prompt as a language — which words carry
 * meaning, which spellings are the same word, how a dictionary gloss lists its
 * senses. That knowledge is about L1, not about the language being taught, so a
 * pack names its prompt language in `profile.l1.code` and the matching adapter
 * is looked up here.
 *
 * Only English ships. A pack prompting in something else gets `null` and the
 * crib falls back to unpaired rows — honest, and better than pairing on rules
 * that do not apply.
 */
import { english } from "./english.js";

/** Where a spelling could have come from, and how far it was bent to get there. */
export interface Candidate {
  position: number;
  tier: number;
}

/** A prompt laid out for matching: each content word, in the order it is read. */
export interface PromptIndex {
  words: string[];
  /** Any spelling of a prompt word -> the words it could be. */
  byForm: Map<string, Candidate[]>;
}

export interface L1Adapter {
  code: string;
  /** Match tolerances to try, nearest first. */
  tiers: number[];
  indexPrompt(prompt: string): PromptIndex;
  glossSenses(gloss: string): string[];
  senseWords(sense: string): string[];
}

const ADAPTERS: Record<string, L1Adapter> = { en: english };

export function l1For(code: string): L1Adapter | null {
  return ADAPTERS[code] ?? null;
}

export { english };
