import { normalize } from "./normalize.js";
import type { LemmaEntry, LemmaMap } from "./types.js";

/**
 * Resolve an inflected form (as the student typed it) to ranked dictionary
 * citations. The first entry is the most frequent lemma, so callers can offer
 * it as the default and fall back to the list to disambiguate.
 *
 * e.g. lookupForm(map, "manibus") -> [{ citation: "manus, ūs (f)", ... }, ...]
 */
export function lookupForm(map: LemmaMap, form: string): LemmaEntry[] {
  return map[normalize(form)] ?? [];
}
