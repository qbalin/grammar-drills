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
amāvērunt→  amō, amāre, amāvī, amātum
ūsī      →  ūtor, ūtī, ūsus sum
bonīs    →  bonus, bona, bonum
fortibus →  fortis, forte
```

Every part of speech is cited the way a dictionary cites it: verbs by their
**principal parts**, adjectives by their **terminations** — three where they
differ (`bonus, bona, bonum`), two where the masculine and feminine coincide
(`fortis, forte`), and nominative-plus-genitive for the one-termination third
declension (`fēlīx, fēlīcis`), which is the only shape that shows how to decline
it. Deponents stop at the periphrastic perfect (`ūtor, ūtī, ūsus sum`), and a
verb with no supine simply stops (`sum, esse, fuī`).

Ambiguous forms (e.g. `manibus` also matches the adjective `mānis`) are offered
most-frequent-first for you to disambiguate. Any card can be edited later —
citation and gloss both — from the vocabulary list, and deleted if a stray press
recorded the wrong word.

## Layout

```
packages/core/   Isomorphic runtime: types, FSRS scheduler, session state
                 machine, form→citation lemmatizer, storage adapters. No LLM.
apps/cli/        Delightful terminal UI (Ink). The v1 surface.
apps/web/        Installable, offline, no-backend phone app over the same core.
content/         Frozen, shipped content:
                   grammar.json      — 135 topics parsed from Bennett's New Latin
                                        Grammar (public domain); `ref` cites its §§.
                   lemmas.json.gz     — form→citation map (top ~7k lemmas, 1.6 MB gz).
                   tests/<id>.json    — the Opus-generated tests (see "Generation").
scripts/         Offline content tooling (not used at runtime):
                   parse-grammar.py  — rebuilds grammar.json from Gutenberg #15665.
                   gen-tests.mjs     — writes tests/<id>.json (see "Generation").
                   canonical-forms.mjs — principal parts / adjective terminations.
                   build-web-content.mjs — repacks content/ for the web app.
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
(1 again · 4 easy). `v` record a word · `g` grammar section · `h` your earlier
answers on this topic · `Esc` peek at the grammar mid-answer · `m` grammar map ·
`q` quit (autosaves).

The grammar pane shows the **whole** section — Bennett's paradigm sections run
to hundreds of lines — so it pages: `↑ ↓` a line, `PgUp/PgDn` a screen, with
`lines 25–33 of 90` under the text saying where you are.

## Taking a keypress back

Three single keys drive the whole loop, so all three get pressed by mistake, and
none of them is a dead end:

- **`Esc`** leaves a vocabulary recording opened by a stray `v` — nothing looked
  up, nothing saved. (So does Enter on an empty box.)
- **`u`** goes back to the answer box when Enter came too early: the half-written
  answer is still there, and nothing has been graded.
- **`^Z`** (`u` on any screen without a text box) takes back the self-grade just
  given. The question comes back exactly as you left it, and so does everything
  the grade touched — the card, the mastery score, the answer trail, your place
  in placement. Re-grading then counts once, not twice.

One grade deep, and only the most recent: this is an undo for the keypress you
just regret, not a history to walk back through. The web app has the same three,
as *keep writing*, the sheet's close button, and an **↺** in the status bar.

## Run on a phone

`apps/web/` is the same engine as an installable web app, for anyone who is
never going to open a terminal. It is a static page: no backend, no account, and
the whole study loop works offline once installed.

```bash
pnpm --filter @latin-tutor/web dev      # build the content bundle and serve
pnpm --filter @latin-tutor/web build    # -> apps/web/dist, deployable anywhere
```

Pushing to `main` publishes it to GitHub Pages
(`.github/workflows/deploy-web.yml`); students open that URL once and *Add to
Home Screen*. Same loop — write the Latin, compare, self-grade 1–4 — with a
**Reveal** button for when typing a sentence on glass is not happening, the
grade buttons labelled with the interval each one buys, and the grammar map
redrawn as tappable rows — one per topic, each naming its § and how far along it
is, since a thumb wants a target and a screen has room for words.

The dictionary is the one thing that could not be shipped as-is:
`lemmas.json.gz` inflates to 43 MB, which no phone should parse. The build
repacks it — 242,746 forms turn out to point at only 6,747 distinct lemmas — into
a 1 MB lemma table plus a sorted form index that is bisected as raw text instead
of parsed. See [`apps/web/README.md`](apps/web/README.md).

## Earlier answers on a topic

Nothing grades you, so the only record of what you actually wrote is the one the
app keeps. Once an answer is on screen, `h` opens the last ten answers on that
topic, newest first — what was asked, what you wrote, and the correction where
the two differ:

```
Earlier on First declension nouns — 3 answers, newest first
20 minutes ago · graded again
The sailors of the island praise the queen.
you     —
correct nautae īnsulae rēgīnam laudant

yesterday · graded easy
The farmers give roses to the girls of the great island.
✓       agricolae puellīs īnsulae magnae rosās dant
lines 1–9 of 13 · ↑↓ scroll, PgUp/PgDn page
```

An answer that matched is ticked rather than corrected — macrons and `u/v`,
`i/j` are folded first, so writing `puella rosam amat` without the macrons is
right, not a correction. It pages like the grammar pane, and shares the screen
with it: opening one closes the other. It is only offered **after** you have
answered — earlier attempts carry reference answers, and the same question comes
round again.

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
| Nouns · Adjectives & adverbs · Pronouns | 9 · 5 · 9 | Part II, *Declension* |
| Verb forms | 35 | Part II, *Conjugation* |
| Particles | 3 | Part III |
| Noun syntax · Adjective & pronoun syntax · Verb syntax | 19 · 13 · 30 | Part V |
| Word-order & style | 12 | Part V, *Hints on Latin Style* |

Those nine names are the only ones there are: `FAMILIES` in
`packages/core/src/families.ts` carries one label per family and both apps print
it as-is. Abbreviating them for a narrow column ("Ptcl", "N-syntax") saved eight
characters and cost the student any idea of where they were.

Each topic's `text` is the section's own prose **in full**, with Gutenberg
markup removed, hard wrapping undone and paradigm tables flattened to one line
apiece so the endings survive in a terminal-width pane. Nothing is trimmed to a
character budget: what the parser drops, the student can never read.

[pg]: https://www.gutenberg.org/ebooks/15665

## The grammar map

`m` opens the syllabus as a line per grammar family, the selected one expanded to
one cell per topic. (One cell per topic for all 135 at once would need ~161
columns.)

```
Grammar map                                       7% mastered overall

  Nouns                       ███░░░  44%   9 topics
▸ Adjectives & adverbs        ██░░░░  27%   5 topics
    ░░▓░░  topic 3 of 5
      ▲
  Pronouns                    ░░░░░░   0%   9 topics
  Verb forms                  ░░░░░░   0%  35 topics
  Particles                   █░░░░░  22%   3 topics
  Noun syntax                 █░░░░░  18%  19 topics
  Adjective & pronoun syntax  ░░░░░░   0%  13 topics
  Verb syntax                 ░░░░░░   0%  30 topics
  Word-order & style          ░░░░░░   0%  12 topics

§ 63-66 Adjectives of the First and Second Declensions
not started
In these the Masculine is declined like hortus, puer, or ager, the
Feminine like porta, and the Neuter like bellum. Thus, Masculine like
hortus:—
Bonus, good.
SINGULAR.
press g to read § 63-66 in full
```

One family per line is what makes `↑ ↓` legible — three to a row, "down" moved
sideways two times out of three — and the whole selected line is highlighted, not
just its name. Every number says what it counts.

Below the cursor sits the opening of that section, **the same wrapped lines for
every topic** — five of them where the terminal is tall enough, fewer on a short
one, never varying with the topic. Clipped by source line it would be a
paragraph of prose for one topic and a handful of words for a paradigm table, and
the map would change height under you as you walked it.

Each topic carries a **mastery score from 1 (not mastered) to 4 (mastered)**,
moved by your self-grades: good/easy `+1`, hard `+0.5`, again `−1`. A single
lucky answer therefore can't mark a topic mastered, and one bad day can't wipe
one. Topics passed in placement show as mastered but assumed.

`← →` walks the cursor along the bar (including topics you have never met),
`↑ ↓` cycles between families and wraps at both ends, `g` opens the selected
section in full (scrolling as above, `Esc` back to the map), and **Enter serves a
test on the selected topic straight away** — the way to explore ahead of where the
scheduler has taken you.
Normal spaced repetition resumes once the test is done.

## Progress storage

Progress is user data, saved through a pluggable `StorageAdapter`:

- **Local file** (CLI default) — `~/.latin-tutor/progress.json`.
- **`localStorage`** (web default), with export/import to a JSON file.
- **Private GitHub repo** — `GitHubStorage` commits the JSON via the GitHub REST
  API with a personal access token (no backend). Google Drive/etc. can be added
  as further adapters.

The answers you write are part of that file (`attempts`, keyed by topic). The
whole file is rewritten — and, on GitHub storage, committed — on every save, so
the trail is capped at the last **ten answers per topic**, oldest dropped first.
A file written before the trail existed simply has none; it starts filling on
the next answer.

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

`scripts/canonical-forms.mjs` rewrites the citations in `lemmas.json.gz` so
verbs carry their principal parts and adjectives their terminations. The parts
cannot be recovered from what is shipped — the form keys are folded, so the
perfect of *amō* is stored as `amaui` — and they come from the same
`dictionary.db`, whose `forms` table is tagged and fully macronized:

```bash
node scripts/canonical-forms.mjs --dry     # report what would change
node scripts/canonical-forms.mjs           # rewrite content/lemmas.json.gz
node scripts/build-web-content.mjs         # repack the web app's copy
```

It rewrote 1,897 verbs (1,579 with all four parts) and 445 adjectives; the
remainder are entries the dictionary cannot improve, which keep the citation
they have. Vocabulary cards already saved carry their own copy of the citation,
so `CITATIONS_VERSION` in `packages/core/src/types.ts` is bumped alongside and
`Session.refreshCitations` catches them up on the next launch.

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
