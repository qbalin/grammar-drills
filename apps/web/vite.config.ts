// `vitest/config` rather than `vite`: same config, plus the `test` block.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
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

export default defineConfig({
  base,
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
        // are precached (~300 KB gzipped). The dictionary is deliberately not:
        // it is several times that size and only the vocabulary feature needs
        // it, so it is fetched on demand and kept (see runtimeCaching below).
        // The paradigms are larger again and rarer again, and go the same way.
        globPatterns: [
          "**/*.{js,css,html,svg,png,woff2}",
          "content/grammar.json.gz",
          "content/tests.json.gz",
        ],
        runtimeCaching: [
          {
            urlPattern: /\/content\/(lemmas\.json|forms\.txt|paradigms\.txt)\.gz$/,
            handler: "CacheFirst",
            options: {
              cacheName: profile.storage.dictionaryCacheName,
              expiration: { maxEntries: 6 },
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
