# The tutor on the web

The same tutor as the CLI, as a page you can install on a phone. No backend, no
account, and nothing calls a model — the lessons are static files and your
progress is yours.

One build serves one language, so each is its own install with its own icon and
its own progress: **Latina** for Latin, **Ἑλληνικά** for Ancient Greek. Pick one
from <https://qbalin.github.io/grammar-drills/>, or install both — they share
nothing and cannot overwrite each other.

## For students

Open the link, then add it to your home screen:

- **iPhone / iPad** — Share (the box with the arrow) → *Add to Home Screen*.
- **Android** — the ⋮ menu → *Install app* (or *Add to Home Screen*).

It then opens like any other app and **works with no signal**. The first launch
needs a connection so it can save the lessons to the device; after that it does
not, except to sync (below), which is optional.

**How it goes.** You get an English sentence and write it in the language you
are learning. Nothing marks you — you press Submit, see your sentence beside the
reference, and say
how it went: *Again*, *Hard*, *Good*, *Easy*. That grade schedules when the
topic comes back, and each button shows when. If you can't face typing on a
phone, **Reveal** shows the answer and you grade yourself the same way.

Two more things worth knowing:

- **§ grammar** opens the section from the source grammar — Bennett for Latin,
  Smyth for Ancient Greek — in full, whenever you want it. On a topic you have
  not met, it opens by itself first. **Swipe across** to read on: the book is in
  order, so the § next door is a thumb away rather than a close-map-pick, and
  the two neighbours are named at the foot of the page for anyone who would
  rather tap. The **→** in the head goes from the section you are reading to
  what you can do with it — *Practise these*, star it, or take it off the review
  pile. Under the last line of the **grammar map** is whose book all of it is,
  licence and all, linked to the edition it was parsed from: not a page of this
  grammar was written here.
- **+ record a word** takes any word as you met it — `manibus`, `amāvērunt`,
  `λόγοις` — and works out the dictionary headword. Those words then come back
  for review on their own schedule.

## Keeping your progress

It lives on the device. Two ways to move it:

- **Export / Import** (Settings) — a file you can mail yourself. No account.
- **GitHub sync** (Settings, optional) — commits the progress file to a private
  repository of yours, using a fine-grained personal access token that can write
  Contents on that one repo. The token stays on the device and goes only to
  github.com. If the copy on GitHub is newer than the device's, the app asks
  which to keep rather than guessing.

## For developers

```bash
pnpm --filter @lang-tutor/web dev      # builds the content bundle, then serves
pnpm --filter @lang-tutor/web build    # -> apps/web/dist
pnpm --filter @lang-tutor/web test
```

`dev` and `build` both run `pnpm content` first, which is
`scripts/build-web-content.mjs` plus the icon generator. Nothing under
`public/content` or `public/icons` is committed.

Set `BASE_PATH` when the app is served from a subdirectory (the Pages workflow
sets it to `/<repo>/`); it defaults to `/`.

### What the build does to `content/`

Less than it used to. The dictionary arrives from the pack already split into a
lemma table and a sorted `form\tidx[,idx…]` index, so the build copies both
through and the repack is really about grammar and tests.

The split is what makes shipping the whole dictionary affordable. A single
`Record<form, LemmaEntry[]>` repeats a lemma's gloss under each of its forms:
Latin's 55,312 lemmas over 893,854 forms would be some **300 MB** of JSON, which
is past what even the CLI can parse off a local disk. As a table plus an index
it is 8.5 MB, and `@lang-tutor/core`'s `LemmaIndex` bisects the index where it
lies rather than building an 894k-key object.

Latin, as built today:

| Asset | Raw | Gzipped | |
|---|---|---|---|
| `grammar.json.gz` | 448 KB | 129 KB | precached |
| `tests.json.gz` | 1.1 MB | 298 KB | precached |
| `lemmas.json.gz` | 8.3 MB | 1.8 MB | on demand |
| `forms.txt.gz` | 15.5 MB | 2.4 MB | on demand |
| `paradigms.txt.gz` | 10.9 MB | 2.5 MB | on demand, later |

So the study loop is offline after a **427 KB** install, and the dictionary —
which only the vocabulary feature needs — is fetched when first used, or in
advance from Settings. The screens that warn about that download measure it at
build time (`__DICTIONARY_BYTES__` in `vite.config.ts`) rather than naming a
figure by hand, because the hand-written one went stale and was wrong for
whichever pack it had not been written for.

These are fetched as bytes and inflated in the app rather than left to
`Content-Encoding`, because hosts disagree about whether a `.gz` file is
pre-compressed content or an opaque download. `content-loader.ts` checks the
gzip magic number and handles both.

### Structure

The engine is `@lang-tutor/core`, unchanged and shared with the CLI: `Session`
holds the whole state machine, FSRS scheduling and the answer trail. This app is
the touch surface over it.

```
src/
  app.tsx             the loop, ported from apps/cli/src/app.tsx
  content-loader.ts   fetch + inflate; the web twin of the CLI's loader
  lemma-index.ts      bisection over the sorted form index
  storage/            localStorage, the GitHub mirror, export/import
  screens/            Study · Grammar · Map · Vocab · Settings
  ui.tsx              Sheet, GradeBar, MacronKeys, Toast
```

The CLI's single `Phase` union splits in two here — a `Phase` for where the loop
is and an `Overlay` for what is layered over it — because a sheet on a phone
covers the question rather than replacing it.
