/**
 * Looking a key up in a sorted text file without unpacking it first.
 *
 * Two of the app's assets are one line per key, sorted: the dictionary's
 * `forms.txt.gz` (491,398 lines) and `paradigms.txt.gz` (18,302, but 10 MB of
 * them). Building either into a `Map` costs more than the fetch did, for a
 * feature used a handful of times a session, so neither is: the file is held as
 * one string and bisected where it lies.
 */

/**
 * Bisect `index` for `key`, returning the text after its tab, or null.
 *
 * The window `[lo, hi)` always begins at a line boundary. A probe lands
 * anywhere inside it, backs up to the start of its line — clamping to `lo`,
 * since that back-up can cross out of the window — and compares. Whichever way
 * the comparison goes, the window shrinks: `lo` moves past the end of the
 * probed line, or `hi` moves to its start.
 *
 * Comparison is `<` on JS strings, which is code-unit order — exactly what
 * `Array.sort()` used to write the file. A locale-aware collation here would
 * silently miss entries.
 *
 * `from` lets a caller skip a header line the file carries before its first
 * key; without it the header would be inside the search window and could be
 * probed as though it were a key.
 */
export function bisect(index: string, key: string, from = 0): string | null {
  let lo = from;
  let hi = index.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const start = Math.max(lo, index.lastIndexOf("\n", mid) + 1);
    const eol = index.indexOf("\n", start);
    const end = eol === -1 ? index.length : eol;
    const tab = index.indexOf("\t", start);
    const split = tab === -1 || tab > end ? end : tab;
    const found = index.slice(start, split);
    if (found === key) return split === end ? "" : index.slice(split + 1, end);
    if (found < key) lo = end + 1;
    else hi = start;
  }
  return null;
}
