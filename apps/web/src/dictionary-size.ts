/**
 * How big the dictionary download is, in words a student can act on.
 *
 * Settings names it, and used to say "900 KB" because someone typed that once.
 * It is measured at build time now, so it follows the pack and cannot go
 * stale — see `__DICTIONARY_BYTES__`.
 *
 * Rounded to something readable rather than exact: this is a warning about
 * whether to do it on mobile data, not an invoice.
 */
export function dictionarySize(bytes: number = __DICTIONARY_BYTES__): string {
  return size(bytes);
}

/**
 * How much room the whole pack takes once a device has settled — the grammar
 * and the tests it was installed with, plus the dictionary and the paradigms it
 * fetches on first launch.
 *
 * The number Settings shows beside what the browser reports it is actually
 * holding, so the two can be read against each other.
 */
export function offlineSize(bytes: number = __OFFLINE_BYTES__): string {
  return size(bytes);
}

function size(bytes: number): string {
  if (!bytes) return "a few megabytes";
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}
