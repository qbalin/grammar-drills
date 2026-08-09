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
 * The size in bytes of the two files `loadDictionary()` fetches, measured by
 * `vite.config.ts` at build time.
 *
 * The screens that warn about the one-time download used to name a figure
 * written by hand, which went stale the moment the dictionary grew and was
 * wrong for whichever pack it had not been written for. Use `dictionarySize()`
 * rather than this directly.
 */
declare const __DICTIONARY_BYTES__: number;

/**
 * The size in bytes of every content file a device ends up holding — the
 * grammar, the tests, the dictionary and the paradigms — measured the same way.
 *
 * All of it is fetched now, the precache at install and the rest as soon as the
 * app is up, so this is the honest answer to "how much room does this take".
 * Use `offlineSize()` rather than this directly.
 */
declare const __OFFLINE_BYTES__: number;
