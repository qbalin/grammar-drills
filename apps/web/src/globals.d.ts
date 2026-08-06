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
