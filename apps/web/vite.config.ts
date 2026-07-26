// `vitest/config` rather than `vite`: same config, plus the `test` block.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves a project site under /<repo>/, so the workflow sets
// BASE_PATH; a local dev server and any root-hosted copy get "/".
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      // No `includeAssets`: the glob below already takes every icon, and naming
      // them twice puts them in the precache manifest twice.
      workbox: {
        // The study loop must work on a plane, so the syllabus and every test
        // are precached (~300 KB gzipped). The dictionary is deliberately not:
        // it is three times that size and only the vocabulary feature needs it,
        // so it is fetched on demand and kept (see runtimeCaching below).
        globPatterns: [
          "**/*.{js,css,html,svg,png,woff2}",
          "content/grammar.json.gz",
          "content/tests.json.gz",
        ],
        runtimeCaching: [
          {
            urlPattern: /\/content\/(lemmas\.json|forms\.txt)\.gz$/,
            handler: "CacheFirst",
            options: {
              cacheName: "latina-dictionary",
              expiration: { maxEntries: 4 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Latina — Latin tutor",
        short_name: "Latina",
        description:
          "A spaced-repetition Latin tutor. Translate into Latin, grade yourself, and watch the grammar fill in.",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#12121a",
        theme_color: "#12121a",
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
