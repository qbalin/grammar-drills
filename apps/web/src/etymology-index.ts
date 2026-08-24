import { bisect } from "./bisect.js";

/**
 * Where a word came from, as a phone can afford to hold it.
 *
 * The sibling of `ParadigmIndex`, and simpler: `content/etymology.txt.gz` is one
 * `lemma|pos \t <text>` line per word, sorted, with no header to intern. It is
 * held as the string it arrived as and bisected in place rather than parsed into
 * a `Map` — 14,000 entries would be a large object to build for a gesture that
 * asks about one word, and the same trick already serves the dictionary and the
 * tables beside it.
 *
 * `${lemma}|${pos}` is the key, which is what a `LemmaEntry` already carries, so
 * a word resolves its own origin without an index in between.
 *
 * A pack whose dictionary did not come out of Wiktionary ships no such file —
 * Greek's came from Eulexis, which has no etymologies at all — and an index over
 * the empty string simply answers null to everything. That is why the absence
 * needs no flag anywhere: it looks exactly like a word nobody has written an
 * etymology for, which is the commoner case in any pack.
 */
export class EtymologyIndex {
  constructor(private readonly index: string) {}

  /**
   * The etymology of one lemma, as its paragraphs, or an empty list if the file
   * holds none for it.
   *
   * The builder escapes the newlines inside a text, because a line of the file
   * is a record. They are put back here: Wiktionary's etymologies are often two
   * or three paragraphs — the origin, then the cognates — and running them
   * together loses the break that says which is which.
   */
  paragraphsFor(lemma: string, pos: string): string[] {
    const line = bisect(this.index, `${lemma}|${pos}`);
    if (line === null || line === "") return [];
    return line
      .split("\\n")
      .map((p) => p.trim())
      .filter(Boolean);
  }
}
