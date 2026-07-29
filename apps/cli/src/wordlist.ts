/**
 * A question's vocabulary, laid out for the terminal.
 *
 * Two columns: the English word the prompt used, and the Latin it wants in its
 * dictionary form. Pre-wrapped, one entry per screen line, for the same reason
 * the grammar pager and the answer trail are — scrolling counts screen lines,
 * and `appropinquō, appropinquāre, appropinquāvī, appropinquātum` outruns a
 * narrow pane on its own.
 */

import type { VocabWord } from "@lang-tutor/core";
import { wrapLines } from "./pager.js";

/** How the Latin half of a line is coloured. */
export type WordTone =
  /** A citation: the thing being taught, and the thing to write. */
  | "citation"
  /** A gloss under a citation the English never named. */
  | "gloss"
  /** A word the dictionary does not have. */
  | "missing";

export interface WordListLine {
  /** Already padded to the column, blank on a continuation line. */
  english: string;
  latin: string;
  tone: WordTone;
}

/**
 * The widest English column worth giving up. `transformation` is the longest
 * word in any prompt at 14 characters, but 95% of them are 8 or under, and a
 * column sized for the outlier would push every citation right for the sake of
 * one row. Anything longer wraps like the Latin does.
 */
const MAX_ENGLISH = 13;

/** Shown where the English never named the word. */
const NO_ENGLISH = "·";

export function wordListLines(words: VocabWord[], width: number): WordListLine[] {
  const englishWidth = Math.min(
    MAX_ENGLISH,
    Math.max(
      NO_ENGLISH.length,
      ...words.map((w) => Math.min(w.english?.length ?? 0, MAX_ENGLISH)),
    ),
  );
  // One space between the columns; the Latin gets whatever is left. The floor
  // keeps a very narrow terminal from wrapping every citation to one letter a
  // line — it will overflow instead, which at least stays readable.
  const latinWidth = Math.max(16, width - englishWidth - 1);

  const out: WordListLine[] = [];
  // The column plus the single space that separates it from the Latin.
  const gutterWidth = englishWidth + 1;
  const push = (english: string, latin: string, tone: WordTone) => {
    let gutter = english.padEnd(gutterWidth);
    for (const line of wrapLines(latin, latinWidth)) {
      out.push({ english: gutter, latin: line, tone });
      // A wrapped citation hangs under itself rather than repeating the word.
      gutter = "".padEnd(gutterWidth);
    }
  };

  for (const word of words) {
    const english = word.english ?? NO_ENGLISH;
    if (!word.entry) {
      // Named, not dropped: the sentence needs this word, and saying so is more
      // use than a list that quietly comes up short.
      push(english, `${word.form} — not in the dictionary`, "missing");
      continue;
    }
    push(english, word.entry.citation, "citation");
    // Only where the English says nothing. Where it does, the prompt's own word
    // is the gloss, and printing the dictionary's as well doubles the list.
    if (word.status !== "paired") push("", word.entry.gloss, "gloss");
  }
  return out;
}
