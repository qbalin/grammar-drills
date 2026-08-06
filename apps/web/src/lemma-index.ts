import type { LemmaEntry, LemmaLookup } from "@lang-tutor/core";
import { bisect } from "./bisect.js";
import { fold } from "./pack.js";

/**
 * The dictionary, as a phone can afford to hold it.
 *
 * `content/lemmas.json.gz` inflates to 42.9 MB of `Record<form, LemmaEntry[]>`.
 * `scripts/build-web-content.mjs` splits that into the 6,747 distinct entries
 * (small enough to parse) and a sorted `form\tidx[,idx…]` index over 242,746
 * forms (not). This reads the index as one string and bisects it in place, so
 * the browser never builds a 242k-key object — the cost is the 4 MB of text
 * itself and nothing more.
 */
export class LemmaIndex implements LemmaLookup {
  constructor(
    private readonly entries: LemmaEntry[],
    /** Sorted `form\tids` lines, newline-separated. */
    private readonly index: string,
  ) {}

  /**
   * Ranked citations for an inflected form, most frequent first, matching
   * `lookupForm`'s contract. Empty when the form is unknown.
   */
  lookup(form: string): LemmaEntry[] {
    const key = fold(form);
    if (key === "") return [];
    const line = bisect(this.index, key);
    if (line === null) return [];
    return line
      .split(",")
      .map((n) => this.entries[Number(n)])
      .filter((e): e is LemmaEntry => e !== undefined);
  }
}
