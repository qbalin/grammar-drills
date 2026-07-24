/**
 * Lowercase, strip diacritics, and apply Latin letter folding.
 *
 * Ported from the reference project's `common.normalize`: for Latin the
 * macrons/breves are editorial and u/v, i/j are spelling variants, so both
 * sides of any lookup are folded the same way. This makes `Vī`, `vi`, and
 * `uī` all normalize to `ui`.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalize(word: string): string {
  const stripped = word
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "");
  return stripped.replace(/j/g, "i").replace(/v/g, "u");
}
