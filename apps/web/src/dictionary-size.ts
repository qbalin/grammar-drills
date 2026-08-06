/**
 * How big the dictionary download is, in words a student can act on.
 *
 * Three screens warn about it before it happens, and they used to say "900 KB"
 * because someone typed that once. It is measured at build time now, so it
 * follows the pack and cannot go stale — see `__DICTIONARY_BYTES__`.
 *
 * Rounded to something readable rather than exact: this is a warning about
 * whether to do it on mobile data, not an invoice.
 */
export function dictionarySize(bytes: number = __DICTIONARY_BYTES__): string {
  if (!bytes) return "a few megabytes";
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}
