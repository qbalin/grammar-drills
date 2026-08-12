/**
 * The content bundle's hash, compiled in by `vite.config.ts` from the
 * `version.txt` that `scripts/build-web-content.mjs` writes beside the assets.
 *
 * A constant rather than a fetch: it has to be known before the first content
 * request, and one more round trip to learn it would be a round trip the
 * service worker would then have to be told not to cache.
 */
declare const __CONTENT_VERSION__: string;

/**
 * The size in bytes of everything the app fetches for itself once it is up —
 * the dictionary, the paradigms and the pack's further books — measured by
 * `vite.config.ts` at build time.
 *
 * The screens that warn about the one-time download used to name a figure
 * written by hand, which went stale the moment the dictionary grew and was
 * wrong for whichever pack it had not been written for. Then it named the
 * dictionary, correctly, while the launch was quietly fetching two other things
 * beside it. Use `fetchedSize()` rather than this directly.
 */
declare const __FETCHED_BYTES__: number;

/**
 * The size in bytes of every content file a device ends up holding — the
 * grammar, the tests, the dictionary, the paradigms, and whatever further books
 * the pack declares — measured the same way.
 *
 * All of it is fetched now, the precache at install and the rest as soon as the
 * app is up, so this is the honest answer to "how much room does this take".
 * The books belong in it for exactly that reason: they were left out while they
 * were also left uncached, and the sum was right about the device by being
 * wrong about the pack. Use `offlineSize()` rather than this directly.
 */
declare const __OFFLINE_BYTES__: number;
