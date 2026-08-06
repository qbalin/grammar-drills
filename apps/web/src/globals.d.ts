/**
 * The content bundle's hash, compiled in by `vite.config.ts` from the
 * `version.txt` that `scripts/build-web-content.mjs` writes beside the assets.
 *
 * A constant rather than a fetch: it has to be known before the first content
 * request, and one more round trip to learn it would be a round trip the
 * service worker would then have to be told not to cache.
 */
declare const __CONTENT_VERSION__: string;
