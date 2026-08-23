import { bisect } from "./bisect.js";
import type { Fold } from "./fold.js";
import type { DictionaryArticle, LemmaEntry, LemmaLookup } from "./types.js";

/**
 * A book of entries, as a phone can afford to hold it.
 *
 * A pack ships each of its books already split in two: a JSON array of the
 * distinct entries — small enough to parse — and a sorted `key\tidx[,idx…]`
 * index over the keys that point into it, which is not. This reads the index as
 * one string and bisects it in place, so nobody ever builds the key object; the
 * cost is the text itself and nothing more.
 *
 * The split is what makes shipping a whole book affordable at all. The map it
 * replaced repeated a lemma's gloss under every one of its forms, so it
 * inflated to 116 MB for a twentieth of the words.
 *
 * The fold is the pack's — the index was keyed with it, so a lookup has to use
 * the same one or every key misses.
 *
 * Generic because two books now use it and the invariant is the fragile part:
 * the index must be sorted by code unit, which the writer guarantees and the
 * bisect assumes. Writing it twice would be writing that assumption twice.
 */
export class EntryIndex<T> {
  constructor(
    private readonly entries: T[],
    /** Sorted `key\tids` lines, newline-separated. */
    private readonly index: string,
    private readonly fold: Fold,
  ) {}

  /** The entries filed under a key, in the order the index lists them. Empty
   *  when the key is unknown. */
  lookup(key: string): T[] {
    const folded = this.fold(key);
    if (folded === "") return [];
    const line = bisect(this.index, folded);
    if (line === null) return [];
    return line
      .split(",")
      .map((n) => this.entries[Number(n)])
      .filter((e): e is T => e !== undefined);
  }
}

/**
 * The pack's own dictionary: an inflected form to its ranked citations, most
 * frequent first, matching `lookupForm`'s contract.
 */
export class LemmaIndex extends EntryIndex<LemmaEntry> implements LemmaLookup {}

/**
 * A further dictionary: a folded headword to the articles filed under it.
 *
 * Keyed by headword rather than by inflected form, because that is what a
 * lexicon is indexed by. Getting from a form to a headword is the pack's own
 * dictionary's job, and `Content.articlesFor` is where the two meet.
 */
export class ArticleIndex extends EntryIndex<DictionaryArticle> {}
