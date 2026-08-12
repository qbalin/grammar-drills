// `vitest/config` rather than `vite`: same config, plus the `test` block.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// GitHub Pages serves a project site under /<repo>/, so the workflow sets
// BASE_PATH; a local dev server and any root-hosted copy get "/".
const base = process.env.BASE_PATH ?? "/";

// One build per language: the pack is chosen here, once, and reaches the app
// as the `@pack/profile` module. Everything the app says about the language it
// teaches comes from this file.
const packName = process.env.LANG_PACK ?? "latin";
const profilePath = fileURLToPath(
  new URL(`../../languages/${packName}/profile.json`, import.meta.url),
);
// What this language throws when the confetti fires. Beside the profile
// because it is the same kind of thing: the pack's own look, compiled in.
const confettiPath = fileURLToPath(
  new URL(`../../languages/${packName}/confetti.mjs`, import.meta.url),
);
const profile = JSON.parse(readFileSync(profilePath, "utf8"));

// The content bundle's own hash, written by `scripts/build-web-content.mjs`,
// which both `dev` and `build` run first. It rides on every content URL so a
// rebuilt bundle is a different URL — see `contentUrl`. Missing only when vite
// was started without `pnpm content`, and then nothing is cached to go stale.
const contentVersion = (() => {
  const path = fileURLToPath(new URL("./public/content/version.txt", import.meta.url));
  return existsSync(path) ? readFileSync(path, "utf8").trim() : "dev";
})();

/**
 * What the content actually weighs, for the copy that tells a student so.
 *
 * The screens naming the download used to name a figure written by hand, which
 * said "900 KB" long after it stopped being true — the dictionary grew to hold
 * every word rather than only the ones a corpus attested. It also differs per
 * pack, and there is one build per pack. So it is measured here instead, off
 * the files themselves.
 */
const contentBytes = (names: string[]) => {
  const dir = new URL("./public/content/", import.meta.url);
  return names.reduce((total, name) => {
    const path = fileURLToPath(new URL(name, dir));
    return total + (existsSync(path) ? statSync(path).size : 0);
  }, 0);
};

/**
 * A pack's further grammars, and the crosswalk that makes them teachable.
 *
 * Derived from `profile.grammars` rather than listed, because the number of
 * books is the pack's business: Latin ships Lane beside Bennett, Greek ships
 * one book and gets an empty list here. No crosswalk without a second book —
 * there would be nothing for it to join.
 */
const bookFiles = (profile.grammars ?? []).length
  ? [
      ...profile.grammars.map((g: { id: string }) => `grammar-${g.id}.json.gz`),
      "crosswalk.json.gz",
    ]
  : [];

/**
 * Everything a device ends up holding, which is now everything shipped — the
 * further books included, since they are fetched at launch like the rest.
 */
const offlineBytes = contentBytes([
  "grammar.json.gz",
  "tests.json.gz",
  "lemmas.json.gz",
  "forms.txt.gz",
  "paradigms.txt.gz",
  ...bookFiles,
]);

/**
 * The part of that the app fetches for itself once it is up — everything but
 * the two files the install already precached.
 *
 * This replaced a figure for the dictionary alone, which was the right number
 * only while the dictionary was the only thing Settings could be waiting on.
 * It is what the screen is describing in both of the states that are not "all
 * here": what is coming, and what has not arrived.
 */
const fetchedBytes = contentBytes([
  "lemmas.json.gz",
  "forms.txt.gz",
  "paradigms.txt.gz",
  ...bookFiles,
]);

export default defineConfig({
  base,
  define: {
    __CONTENT_VERSION__: JSON.stringify(contentVersion),
    __FETCHED_BYTES__: JSON.stringify(fetchedBytes),
    __OFFLINE_BYTES__: JSON.stringify(offlineBytes),
  },
  resolve: {
    alias: {
      "@pack/profile": profilePath,
      "@pack/confetti": confettiPath,
    },
  },
  plugins: [
    react(),
    {
      // The shell has to name the language too: the tab title and the iOS
      // home-screen label are read before any of the app's code runs.
      name: "pack-html",
      transformIndexHtml(html: string) {
        return html
          .replace(/%APP_NAME%/g, profile.ui.appName)
          .replace(/%DESCRIPTION%/g, profile.ui.description)
          .replace(/%THEME_COLOR%/g, profile.ui.themeColor)
          .replace(/%L1_CODE%/g, profile.l1.code);
      },
    },
    VitePWA({
      registerType: "prompt",
      // No `includeAssets`: the glob below already takes every icon, and naming
      // them twice puts them in the precache manifest twice.
      workbox: {
        // The study loop must work on a plane, so the syllabus and every test
        // are precached — a megabyte or two gzipped, depending on the pack.
        // The dictionary and the paradigms are not, because precaching is what
        // the *install* has to wait for and those are several megabytes more.
        // They are runtime-cached instead (see below), and the app asks for
        // them itself once it is up — so a device still ends up holding all of
        // it, without a first launch that stalls behind the largest file.
        globPatterns: [
          "**/*.{js,css,html,svg,png,woff2}",
          "content/grammar.json.gz",
          "content/tests.json.gz",
        ],
        // The `?v=` stamp `contentUrl` hangs on every content request is not
        // part of a precache key, and workbox strips only what is named here
        // before it looks one up — so without `/^v$/` the two precached files
        // were fetched as `grammar.json.gz?v=…`, missed the entry sitting right
        // there under `grammar.json.gz`, and went to the network. Precached and
        // never served: exactly the launch on a plane the precache is for. The
        // defaults are kept rather than replaced, since dropping them would let
        // a link with `?utm_source=` miss the shell for the same reason.
        //
        // Stripping it is safe *here* and nowhere else. A precached file is
        // versioned by the manifest revision instead — a rebuild reinstalls it
        // — whereas the runtime-cached files below have no revision but their
        // URL, which is why `?v=` stays load-bearing for them.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
        runtimeCaching: [
          {
            // The `?v=` stamp is part of the URL, so the pattern may not anchor
            // at the extension — with `$` here the versioned request matched
            // nothing, went uncached, and the dictionary was re-fetched every
            // launch. Keeping these files immutable-by-URL is what makes
            // `CacheFirst` the right handler rather than a trap: a rebuilt
            // bundle asks for a name nothing has cached, and the entry it
            // replaces falls off the end of `maxEntries` on its own.
            //
            // The further books are here too, and were nowhere: fetched by the
            // switch, matched by neither the precache glob nor this pattern,
            // and so never on the device at all. `grammar-` cannot catch the
            // primary `grammar.json.gz`, which the precache holds — there is no
            // hyphen in it.
            urlPattern:
              /\/content\/(lemmas\.json|forms\.txt|paradigms\.txt|grammar-[^/?]+\.json|crosswalk\.json)\.gz(\?|$)/,
            handler: "CacheFirst",
            options: {
              cacheName: profile.storage.dictionaryCacheName,
              // Room for a couple of rebuilds' worth of whatever this pack has
              // before the oldest is evicted — three files plus its books, so a
              // pack that grows a second book grows this rather than quietly
              // holding fewer versions. `maxAgeSeconds` is a backstop for a
              // device that somehow holds a version nothing asks for again.
              expiration: {
                maxEntries: (3 + bookFiles.length) * 4,
                maxAgeSeconds: 60 * 60 * 24 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: profile.ui.manifestName,
        short_name: profile.ui.appName,
        description: profile.ui.description,
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: profile.ui.backgroundColor,
        theme_color: profile.ui.themeColor,
        categories: ["education"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
});
