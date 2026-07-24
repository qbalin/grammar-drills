# Latina — a spaced-repetition Latin tutor that runs with no LLM

A Latin tutor in the spirit of a normal SRS language app, but **nothing calls an
LLM at runtime**. Two jobs that such apps usually give to a model are removed:

- **Grading** — you grade yourself. Each question is an English sentence you
  translate **into Latin**: you type your answer, submit it, and see *your answer
  next to the reference answer*, then rate your mastery of the *topic* 1–4. No
  automatic grader is needed.
- **Writing exercises** — done **offline, once, with Claude Opus 4.8**, then
  frozen to static JSON. Each topic ships with a set of rich, varied
  English→Latin translation tests (4 sentences each) so a due topic serves a
  fresh one each time. Every Latin form in every reference answer is validated
  against a real Latin dictionary before it is frozen. The generator is **not**
  part of this repo — the app only reads the frozen content.

A short **placement test** runs on a fresh deck: you translate one sentence per
evenly-spaced topic and grade yourself; passed topics are taken as known and the
frontier is set, so study begins at your level instead of chapter one.

Spaced repetition runs on two independent [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)
tracks: **grammar topics** (driven by your self-grades) and **vocabulary** you
record as you go.

## Recording vocabulary — automatic dictionary citations

When you meet an unknown word, type it *as you saw it* (any inflected form). The
canonical dictionary headword is built for you from a bundled form→citation map:

```
manibus  →  manus, manūs (f): hand
regem    →  rex, rēgis
amāvērunt→  amō, amāre
bonīs    →  bonus, bona, bonum
```

Ambiguous forms (e.g. `manibus` also matches the adjective `mānis`) are offered
most-frequent-first for you to disambiguate.

## Layout

```
packages/core/   Isomorphic runtime: types, FSRS scheduler, session state
                 machine, form→citation lemmatizer, storage adapters. No LLM.
apps/cli/        Delightful terminal UI (Ink). The v1 surface.
apps/web/        Single no-backend web page over the same core (follow-on).
content/         Frozen, shipped content:
                   grammar.json      — 30 core grammar topics (concise, original,
                                        redistributable summaries; `ref` cites A&G).
                   lemmas.json.gz     — form→citation map (top ~7k lemmas, 1.6 MB gz).
                   tests/<id>.json    — the Opus-generated tests (see "Generation").
```

## Run the CLI

```bash
pnpm install
pnpm cli                      # uses ./content and ~/.latin-tutor/progress.json
# or:
pnpm --filter @latin-tutor/cli start -- --content ./content --progress ./my.progress.json
```

Flow: (placement on first run →) read the English prompt, **type your Latin and
press Enter**, compare with the reference answer, then `1–4` self-grade
(1 again · 4 easy). `v` record a word · `g` grammar extract · `Esc` peek at the
grammar mid-answer · `q` quit (autosaves).

## Progress storage

Progress is user data, saved through a pluggable `StorageAdapter`:

- **Local file** (CLI default) — `~/.latin-tutor/progress.json`.
- **Private GitHub repo** — `GitHubStorage` commits the JSON via the GitHub REST
  API with a personal access token (no backend). Google Drive/etc. can be added
  as further adapters.

## Generation (offline, one-time — not shipped)

`content/grammar.json` and `content/lemmas.json.gz` are already built. The
per-topic tests are produced by a throwaway script (kept out of this repo) that
calls Claude Opus 4.8, validates every form against the reference `dictionary.db`,
and writes `content/tests/<topicId>.json`. To (re)generate or extend coverage:

```bash
# with the reference language_learning project checked out alongside this one
cd <scratchpad>/gen && npm i @anthropic-ai/sdk
ANTHROPIC_API_KEY=sk-ant-... node gen-tests.mjs           # all topics
ANTHROPIC_API_KEY=sk-ant-... node gen-tests.mjs ag-decl1  # one topic
```

The runtime never needs the key — it only reads the frozen JSON.

## Develop

```bash
pnpm -r test          # core + CLI test suites
pnpm --filter @latin-tutor/cli typecheck
```
