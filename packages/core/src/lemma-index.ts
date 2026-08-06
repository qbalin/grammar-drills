import { bisect } from "./bisect.js";
import type { Fold } from "./fold.js";
import type { LemmaEntry, LemmaLookup } from "./types.js";

/**
 * The dictionary, as a phone can afford to hold it.
 *
 * A pack ships its dictionary already split in two: `lemmas.json.gz` is the
 * distinct entries — 149k of them once the whole reference ships, small enough
 * to parse — and `forms.txt.gz` is a sorted `form\tidx[,idx…]` index over the
 * 873k inflected forms that point into it, which is not. This reads the index
 * as one string and bisects it in place, so nobody ever builds an 873k-key
 * object; the cost is the text itself and nothing more.
 *
 * The split is what makes shipping the whole dictionary affordable at all. The
 * map it replaced repeated a lemma's gloss under every one of its forms, so it
 * inflated to 116 MB for a twentieth of the words.
 *
 * The fold is the pack's — the index was keyed with it, so a lookup has to use
 * the same one or every form misses.
 */
export class LemmaIndex implements LemmaLookup {
  constructor(
    private readonly entries: LemmaEntry[],
    /** Sorted `form\tids` lines, newline-separated. */
    private readonly index: string,
    private readonly fold: Fold,
  ) {}

  /**
   * Ranked citations for an inflected form, most frequent first, matching
   * `lookupForm`'s contract. Empty when the form is unknown.
   */
  lookup(form: string): LemmaEntry[] {
    const key = this.fold(form);
    if (key === "") return [];
    const line = bisect(this.index, key);
    if (line === null) return [];
    return line
      .split(",")
      .map((n) => this.entries[Number(n)])
      .filter((e): e is LemmaEntry => e !== undefined);
  }
}
