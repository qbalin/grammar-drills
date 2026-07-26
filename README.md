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

The **syllabus** is not hand-written either: `content/grammar.json` is parsed
straight out of a public-domain grammar (see [The grammar](#the-grammar)).

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
                   grammar.json      — 135 topics parsed from Bennett's New Latin
                                        Grammar (public domain); `ref` cites its §§.
                   lemmas.json.gz     — form→citation map (top ~7k lemmas, 1.6 MB gz).
                   tests/<id>.json    — the Opus-generated tests (see "Generation").
scripts/         Offline content tooling (not used at runtime):
                   parse-grammar.py  — rebuilds grammar.json from Gutenberg #15665.
                   gen-tests.mjs     — writes tests/<id>.json (see "Generation").
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
(1 again · 4 easy). `v` record a word · `g` grammar section · `Esc` peek at the
grammar mid-answer · `m` grammar map · `q` quit (autosaves).

The grammar pane shows the **whole** section — Bennett's paradigm sections run
to hundreds of lines — so it pages: `↑ ↓` a line, `PgUp/PgDn` a screen, with
`lines 25–33 of 90` under the text saying where you are.

## The grammar

`content/grammar.json` is **parsed from Charles E. Bennett's *New Latin
Grammar*** (Boston, 1908) — [Project Gutenberg ebook #15665][pg], which is
public domain and free to reuse. The parser is `scripts/parse-grammar.py`:

```bash
python3 scripts/parse-grammar.py            # downloads the text, rewrites content/grammar.json
python3 scripts/parse-grammar.py --src bennett.txt --out /tmp/grammar.json
```

It takes the book's own structure as the syllabus. Bennett numbers 371
sections and groups runs of them under one heading; each such run becomes one
topic, so §20–22 is *First Declension* and §301–313 is *Conditional Sentences*.
Three of the six parts are dropped, because none of them can carry an
English→Latin translation exercise: Part I (sounds, accent, quantity), Part IV
(word formation) and Part VI (prosody). What remains is Parts II, III and V —
**135 topics** across nine families:

| Family | Topics | Bennett |
|---|---|---|
| Nouns · Adj/Adv · Pronouns | 9 · 5 · 9 | Part II, *Declension* |
| Verb forms | 35 | Part II, *Conjugation* |
| Particles | 3 | Part III |
| Noun syntax · Adj/Pron syntax · Verb syntax | 19 · 13 · 30 | Part V |
| Word-order & style | 12 | Part V, *Hints on Latin Style* |

Each topic's `text` is the section's own prose **in full**, with Gutenberg
markup removed, hard wrapping undone and paradigm tables flattened to one line
apiece so the endings survive in a terminal-width pane. Nothing is trimmed to a
character budget: what the parser drops, the student can never read.

[pg]: https://www.gutenberg.org/ebooks/15665

## The grammar map

`m` opens the syllabus as a bar per grammar family, with the selected family
expanded to one cell per topic. (One cell per topic for all 135 at once would
need ~161 columns.)

```
Nouns    ██░░░░  39%  Adj/Adv  █░░░░░  13%  Pron     ░░░░░░   0%
Verbs    ░░░░░░   1%  Ptcl     ░░░░░░   0%  N-syntax ░░░░░░   0%
A-syntax ░░░░░░   0%  V-syntax ░░░░░░   1%  Style    ░░░░░░   0%

Adj/Adv  5 topics · 1/5
░░▓░░
▲
§ 63-66 Adjectives of the First and Second Declensions — not started
```

Each topic carries a **mastery score from 1 (not mastered) to 4 (mastered)**,
moved by your self-grades: good/easy `+1`, hard `+0.5`, again `−1`. A single
lucky answer therefore can't mark a topic mastered, and one bad day can't wipe
one. Topics passed in placement show as mastered but assumed.

`← →` walks the cursor along the bars (including topics you have never met),
`↑ ↓` jumps between families, `g` opens the selected section in full (scrolling
as above, `Esc` back to the map), and **Enter serves a test on the selected
topic straight away** — the way to explore ahead of where the scheduler has
taken you.
Normal spaced repetition resumes once the test is done.

## Progress storage

Progress is user data, saved through a pluggable `StorageAdapter`:

- **Local file** (CLI default) — `~/.latin-tutor/progress.json`.
- **Private GitHub repo** — `GitHubStorage` commits the JSON via the GitHub REST
  API with a personal access token (no backend). Google Drive/etc. can be added
  as further adapters.

## Generation (offline, one-time — not shipped)

All three content files are already built. Only `grammar.json` rebuilds from a
source in this repo (`scripts/parse-grammar.py`, above); the other two need the
reference `language_learning` project checked out alongside this one for its
`dictionary.db` (886k entries / 2.5M inflected forms) and `frequencies.db`
(19,342 ranked lemmas).

The per-topic tests are produced by `scripts/gen-tests.mjs`, which drives Claude
Opus via the authenticated `claude -p` CLI, seeds each prompt with vocabulary
sampled from frequency ranks 400–6000 so the sentences stay varied, and drops
any item containing a Latin form that is not in `dictionary.db`:

```bash
node scripts/gen-tests.mjs --target 6                        # every topic lacking a file
node scripts/gen-tests.mjs --target 6 bn-020-first-declension   # one topic
LATIN_REF=/elsewhere/languages/latin node scripts/gen-tests.mjs  # relocated reference DBs
```

Topics that already have a file are skipped, so a run interrupted by a usage
limit resumes where it stopped. On a sustained limit it retries with a growing
backoff and then stops, rather than marching through the remaining topics
producing nothing.

Validation note: a word is checked case-folded, and an unknown word is allowed
only when it is capitalised *mid-sentence* — i.e. a genuine proper noun. An
earlier version waved through every capitalised token, which silently exempted
the first word of every answer.

The runtime never calls a model and needs no API key — it only reads the frozen
JSON.

## Develop

```bash
pnpm -r test          # core + CLI test suites
pnpm --filter @latin-tutor/cli typecheck
```
