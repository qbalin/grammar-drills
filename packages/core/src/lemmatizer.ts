import type { Fold } from "./fold.js";
import type { LemmaEntry, LemmaMap } from "./types.js";

/**
 * Resolve an inflected form (as the student typed it) to ranked dictionary
 * citations. The first entry is the most frequent lemma, so callers can offer
 * it as the default and fall back to the list to disambiguate.
 *
 * The fold is the pack's: the map was keyed with it, so a lookup has to use
 * the same one or every form misses.
 *
 * e.g. lookupForm(map, "manibus", fold) -> [{ citation: "manus, ūs (f)", ... }, ...]
 */
export function lookupForm(map: LemmaMap, form: string, fold: Fold): LemmaEntry[] {
  return map[fold(form)] ?? [];
}
