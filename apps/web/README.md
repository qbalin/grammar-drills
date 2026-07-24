# Web app (follow-on)

Planned single-page, no-backend web build over `@latin-tutor/core` (the same
engine the CLI uses), per the CLI-first plan.

It will:

- bundle `content/` (fetch `grammar.json`, the per-topic tests, and
  `lemmas.json.gz` — inflated in-browser with `DecompressionStream`);
- run the identical `Session` state machine and FSRS scheduling as the CLI;
- persist progress with browser adapters: File System Access API + download/upload
  and `localStorage` autosave, plus the shared `GitHubStorage` adapter (PAT).

The core is already isomorphic and web-safe (no Node-only APIs), so this surface
is UI work only — no runtime logic is duplicated.
