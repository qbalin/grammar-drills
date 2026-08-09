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

/** The two files `loadDictionary()` fetches. */
const dictionaryBytes = contentBytes(["lemmas.json.gz", "forms.txt.gz"]);

/** Everything a device ends up holding, which is now everything shipped. */
const offlineBytes = contentBytes([
  "grammar.json.gz",
  "tests.json.gz",
  "lemmas.json.gz",
  "forms.txt.gz",
  "paradigms.txt.gz",
]);

export default defineConfig({
  base,
  define: {
    __CONTENT_VERSION__: JSON.stringify(contentVersion),
    __DICTIONARY_BYTES__: JSON.stringify(dictionaryBytes),
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
        runtimeCaching: [
          {
            // The `?v=` stamp is part of the URL, so the pattern may not anchor
            // at the extension — with `$` here the versioned request matched
            // nothing, went uncached, and the dictionary was re-fetched every
            // launch. Keeping the three files immutable-by-URL is what makes
            // `CacheFirst` the right handler rather than a trap: a rebuilt
            // bundle asks for a name nothing has cached, and the entry it
            // replaces falls off the end of `maxEntries` on its own.
            urlPattern: /\/content\/(lemmas\.json|forms\.txt|paradigms\.txt)\.gz(\?|$)/,
            handler: "CacheFirst",
            options: {
              cacheName: profile.storage.dictionaryCacheName,
              // Three files, and room for a couple of rebuilds' worth before
              // the oldest is evicted. `maxAgeSeconds` is a backstop for a
              // device that somehow holds a version nothing asks for again.
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 60 },
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
