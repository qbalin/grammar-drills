/**
 * How big the launch download is, in words a student can act on.
 *
 * Settings names it, and used to say "900 KB" because someone typed that once.
 * It is measured at build time now, so it follows the pack and cannot go
 * stale — see `__FETCHED_BYTES__`.
 *
 * The dictionary alone, which this used to report, was a fair description of
 * the wait only while the dictionary was the only thing being waited on. The
 * app fetches the tables and the pack's further books at launch as well, so a
 * screen that named one file's weight was quoting a third of the answer to
 * "should I do this on mobile data" — which is the whole question this figure
 * exists for. Rounded to something readable rather than exact: a warning, not
 * an invoice.
 */
export function fetchedSize(bytes: number = __FETCHED_BYTES__): string {
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
