import type { LemmaEntry, LemmaLookup } from "@lang-tutor/core";
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
    const line = this.find(key);
    if (line === null) return [];
    return line
      .split(",")
      .map((n) => this.entries[Number(n)])
      .filter((e): e is LemmaEntry => e !== undefined);
  }

  /**
   * Bisect for `key`, returning the text after its tab, or null.
   *
   * The window `[lo, hi)` always begins at a line boundary. A probe lands
   * anywhere inside it, backs up to the start of its line — clamping to `lo`,
   * since that back-up can cross out of the window — and compares. Whichever
   * way the comparison goes, the window shrinks: `lo` moves past the end of the
   * probed line, or `hi` moves to its start.
   *
   * Comparison is `<` on JS strings, which is code-unit order — exactly what
   * `Array.sort()` used to write the file. A locale-aware collation here would
   * silently miss entries.
   */
  private find(key: string): string | null {
    let lo = 0;
    let hi = this.index.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const start = Math.max(lo, this.index.lastIndexOf("\n", mid) + 1);
      const eol = this.index.indexOf("\n", start);
      const end = eol === -1 ? this.index.length : eol;
      const tab = this.index.indexOf("\t", start);
      const split = tab === -1 || tab > end ? end : tab;
      const form = this.index.slice(start, split);
      if (form === key) {
        return split === end ? "" : this.index.slice(split + 1, end);
      }
      if (form < key) lo = end + 1;
      else hi = start;
    }
    return null;
  }
}
