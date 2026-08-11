# A spaced-repetition language tutor that runs with no LLM

A tutor in the spirit of a normal SRS language app, but **nothing calls an LLM
at runtime**. Two jobs that such apps usually give to a model are removed:

- **Grading** — you grade yourself. Each question is an English sentence you
  translate **into the language you are learning**: you type your answer, submit
  it, and see *your answer next to the reference answer*, then rate your mastery
  of the *topic* 1–4. No automatic grader is needed.
- **Writing exercises** — done **offline, once**, then frozen to static JSON.
  Each topic ships with a set of rich, varied translation tests (4 sentences
  each) so a due topic serves a fresh one each time. Every form in every
  reference answer is validated against a real dictionary before it is frozen
  (`scripts/gen-tests.mjs`); the app itself only reads the frozen content.

The **syllabus** is not hand-written either: each language's `grammar.json` is
parsed straight out of a public-domain grammar (see [The grammar](#the-grammar)).

## One engine, many languages

Everything specific to a language lives in a **language pack** under
`languages/<name>/` — how to fold a word, what the grammar families are called,
how the language cites a word, what to tell a model when asking for practice
sentences. `packages/core` holds the engine and is not allowed to know about any
of it; CI checks that it does not.

Two packs ship:

| Pack | Grammar | Syllabus | Questions |
| --- | --- | --- | --- |
| `latin` | Bennett, *New Latin Grammar* | 114 topics | 6,581 over all 114 |
| `ancient-greek` | Smyth, *A Greek Grammar for Colleges* | 485 topics | 3,533 over 78 so far |

Ancient Greek is still being written — its syllabus is complete and its questions
are being generated topic by topic, so it publishes with its coverage gates
reported rather than enforced (see `LANG_PACKS_DRAFT` in the deploy workflow).
**To add a third, follow [ADDING_A_LANGUAGE.md](ADDING_A_LANGUAGE.md)** — a
checklist where each step ends in a command whose exit code is the answer.

The apps are built one language at a time: `pnpm cli -- --language latin`, and
`LANG_PACK=ancient-greek pnpm --filter @lang-tutor/web build`. Each web build is
its own installable app at its own URL, with its own icon and its own stored
progress; there is no in-app switcher.

**Installable now:** <https://qbalin.github.io/grammar-drills/> — [Latina](https://qbalin.github.io/grammar-drills/latin/)
(Latin) and [Ἑλληνικά](https://qbalin.github.io/grammar-drills/ancient-greek/)
(Ancient Greek). Open either on a phone and add it to the home screen; it then
works with no signal.

Two errands, and a switch between them: **Review** serves what is due, and
**Explore** reads the book. It opens on the reviews whenever any are waiting and
on the book when none are, and it throws itself back to the book as soon as the
pile is cleared. Where the book reads from is yours to say — see
[Three ways forward](#three-ways-forward).

Spaced repetition runs on two independent [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)
tracks: **grammar topics** (driven by your self-grades) and **vocabulary** you
record as you go.

## The words behind a question

The sentences are drawn from frequency ranks 400–6000, so a beginner regularly
meets a question containing words nobody has taught them, and the only thing to
do about it was to submit nothing and grade yourself *again*. Every question can
now show its own vocabulary — **hidden until you ask for it**, `w` (or `Tab`
while writing) in the CLI, a `Vocabulary — 6 words` line above the box on the
web:

```
Vocabulary — 6 words in this sentence
farmer's      agricola, agricolae (m)
daughters     fīlia, fīliae (f)
carrying      portō, portāre, portāvī, portātum
water         aqua, aquae (f)
deep          altus, alta, altum
·             ex (prep)
              out of, from; down from
```

It is a **crib, not a reveal**: the words are in the *English* sentence's order,
never the Latin's, and in their dictionary form. Which word goes where, in which
case, and with what ending is still the whole exercise.

The English column is the prompt's own words, matched to the dictionary's gloss
through a small English de-inflection (`carrying`→`carry`, `daughters`→
`daughter`) plus a table of irregulars (`led`→`lead`, `men`→`man`). About **69%**
of words find their partner that way; the rest show the dictionary's gloss under
a `·`, and the **4.7%** the dictionary has never heard of (`dum`, `nam`,
`tamen`, participles like `territī`) are listed and marked rather than quietly
dropped — a sentence you are stuck on is the worst place to be handed a short
list.

Matching against the prompt also **decides which word an ambiguous form is**,
which frequency alone gets wrong often enough to matter:

| form | most frequent | what the prompt picks |
|---|---|---|
| `bellum` | `bellus, bella, bellum` *pretty* | `bellum, bellī (n)` *war* |
| `dōna` | `dōnō, dōnāre` *to give* | `dōnum, dōnī` *gift* |
| `rēgīna` | `rex, rēgis` *king* | `regina, rēgīnae` *queen* |
| `mare` | `mās, mare` *male* | `mare, maris (n)` *sea* |

Told unprompted that `bellum` means *pretty*, a beginner is worse off than with
no crib at all. Across the 4,025 shipped questions the prompt overrules the
frequency-first reading **2,443 times**. Nothing here calls a model: it is the
shipped dictionary, the question's own English, and
`packages/core/src/question-vocab.ts`.

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

## The sentence you met the word in

A card keeps the question it came from, and the sentence the word stood in:

```
manus, manūs (f)                     ← the back of the card
noun · feminine · declension 4

Reference
  The soldiers raised their hands.
  Mīlitēs manūs sustulērunt.
```

Which sentence depends on where the press landed. A word held in the **reference
answer**, or a row held in the vocabulary crib, keeps the reference; a word held
in **what you wrote** keeps your own line, labelled as yours — it may be wrong,
and a card that drew it as the book's would teach the mistake back to you. The
word you held is picked out in it.

A word met in several questions gathers several sentences, up to eight, and
identical ones are not kept twice — an answer typed correctly folds equal to the
reference, so holding a word in both texts of one question keeps one. They can be
reordered, corrected and deleted from the card's edit sheet (`V` then `c` in the
terminal), and the first is the one the **hint** offers: a step before the reveal
that shows the *English* half of a sentence and nothing else, which is very often
the whole of what was missing and costs none of the answer.

Turn it off in Settings — `a` in the terminal's vocabulary list — and words are
recorded alone. The preference travels with your progress, so it holds on both
surfaces; sentences already saved stay where they are.

## Layout

```
packages/core/   Isomorphic runtime: types, FSRS scheduler, session state
                 machine, the fold, form→citation lemmatizer, per-question
                 vocabulary, storage adapters. Knows no language. No LLM.
apps/cli/        Delightful terminal UI (Ink). The v1 surface.
apps/web/        Installable, offline, no-backend phone app over the same core.
languages/latin/ The Latin pack — everything Latin-specific:
                   profile.json      — the shape of the language: the fold, the
                                        families, the wording, the storage keys.
                   fold.fixtures.json — what counts as the same word, both ways.
                   grammar/parse.py  — rebuilds grammar.json from Gutenberg #15665.
                   citations.mjs     — principal parts / adjective terminations.
                   gen/config.mjs    — the generator prompt, band, function words.
                   content/          — grammar.json (114 topics), tests/<id>.json,
                                        lemmas.json.gz (top ~7k lemmas).
scripts/         Offline tooling, language-agnostic (not used at runtime):
                   gen-tests.mjs     — writes tests/<id>.json (see "Generation").
                   build-lemmas.mjs  — builds lemmas.json.gz from the reference DBs.
                   grammar-report.mjs / coverage-report.mjs — the quality gates.
                   validate-pack.mjs — every gate, in one command.
                   build-web-content.mjs — repacks a pack for the web app.
```

## Run the CLI

```bash
pnpm install
pnpm cli                      # the Latin pack and ~/.latin-tutor/progress.json
# or:
pnpm --filter @lang-tutor/cli start -- --language latin --progress ./my.progress.json
```

Flow: read the English prompt, **type your Latin and press Enter**, compare with
the reference answer, then `1–4` self-grade (1 again · 4 easy). `w` the words of
this question · `v` record a word · `g` grammar section · `h` your earlier
answers on this topic · `x` switch errand · `b` back to the book in order ·
`Esc` peek at the grammar mid-answer · `m` grammar index · `q` quit
(autosaves).

While the answer box has the keyboard, every letter goes into the answer, so the
same two things are reached by chords: **`Tab`** the words, **`^N`** the index
(alongside `Esc` for the grammar and `^Z` to take back a grade).

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
  the grade touched — the card, the mastery score, the answer trail, the book
  cursor, and which errand you were on. Re-grading then counts once, not twice.

One grade deep, and only the most recent: this is an undo for the keypress you
just regret, not a history to walk back through. The web app has the same three,
as *keep writing*, the sheet's close button, and an **↺** in the status bar.

## Run on a phone

`apps/web/` is the same engine as an installable web app, for anyone who is
never going to open a terminal. It is a static page: no backend, no account, and
the whole study loop works offline once installed.

```bash
pnpm --filter @lang-tutor/web dev      # build the content bundle and serve
pnpm --filter @lang-tutor/web build    # -> apps/web/dist, deployable anywhere
```

Pushing to `main` publishes every pack to GitHub Pages
(`.github/workflows/deploy-web.yml`): one build per language at
`/<pack>/`, under a landing page that links to each. Students open the URL for
the language they want, once, and *Add to Home Screen*. Same loop — write the
sentence, compare, self-grade 1–4 — with a
**Reveal** button for when typing a sentence on glass is not happening, the
grade buttons labelled with the interval each one buys, and the grammar index
redrawn as tappable rows — one per topic, each naming its § and how far along it
is, since a thumb wants a target and a screen has room for words.

The grammar sheet **turns pages**: a swipe across it moves to the next or the
previous section in book order, with the two neighbours named at the foot for
thumbs that would rather tap and arrow keys for anyone on a desktop. Reading
rarely stops at the one § you opened, and until this it cost a close, a map and
another pick. The **→** in its head is the way from the section you have read to
what can be done with it, so studying what you just found is one tap rather than
a walk back through the index.

The CLI's two index keys become three buttons on the topic sheet — **Study from
here**, **Practise these 17** and **Book order** — so all three ways of reading
the book are chosen in one place, and choosing one is also how you leave the
last.

The status bar leads with the two errands: **Explore** and **Review**, both
labels always on screen, the live one pressed. Three links used to say the same two things one at
a time — *set these aside and explore*, *back to reviews*, *back to the book* —
so whichever state you were not in was invisible, and the one you were in looked
like the only one there was.

Beside the switch the bar names **what is on screen and why** in one word —
`review`, `new`, `drill`, `revisiting`, `vocabulary` — and a `drill` carries
its run's count with it, because for a long time it named exactly
one of them. A card come back on schedule, a topic you asked to stay on and a
topic the book has come back to are the same four sentences under the same
title, and only *new* was ever said out loud, so "why am I being shown this"
had no answer on screen. It is written on the round rather than derived from
the scheduler, which is what makes it survive a reload: `next` says why once,
and a resumed round never asks it again. The line under it says what is being
worked on and nothing else — a vocabulary card reads `Vocabulary`, where the
grammar topic answered before it used to stand, reference, prose link and all.

The question's vocabulary is a disclosure above the answer box rather than a
sheet, on both the writing and the graded screen: a sheet would cover the box,
and the moment it is wanted is the moment you are mid-sentence and stuck. The
word count is taken from the sentence, so `Vocabulary — 6 words` is on screen and
honest while the dictionary is still downloading — and opening it is what
triggers that download, never a prefetch.

The dictionary is every word the reference holds — 55,312 Latin lemmas over
893,854 inflected forms, not merely the ones a corpus attests. That distinction
is the difference between looking `reste` up and being told it is not a word,
which is what the app used to do: the frequency list it was built from is seven
works long, and none of the seven ever needed a rope.

Shipping all of it means never shipping the obvious shape. A `form → entries`
map repeats each gloss under every form and would be some 300 MB of JSON, so a
pack writes the two files apart — the distinct lemmas, and a sorted form index
into them — and both apps bisect the index as raw text instead of parsing it.
4.2 MB gzipped, fetched once, and only when a word is first looked up. See
[`apps/web/README.md`](apps/web/README.md) and
[`scripts/reference/README.md`](scripts/reference/README.md).

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

The Latin pack's `content/grammar.json` is **parsed from Charles E. Bennett's
*New Latin Grammar*** (Boston, 1908) — [Project Gutenberg ebook #15665][pg],
which is public domain and free to reuse. The parser is
`languages/latin/grammar/parse.py`:

```bash
python3 languages/latin/grammar/parse.py    # downloads the book, rewrites the pack's grammar.json
python3 languages/latin/grammar/parse.py --src bennett.htm --out /tmp/grammar.json
```

It reads the **HTML** edition rather than the plain text one. In the plain text
a paradigm is a fixed-width column layout whose cells wrap across physical
lines, and nothing downstream can tell a wrapped cell from a new row: the table
of correlatives in §140 arrived with its first heading cut off at the column
edge ("RELATIVE AND", the "INTERROGATIVE." lost) and its continuation lines
loose between four fragments of what is one table. The HTML has real
`<table>`/`<tr>`/`<td>`, so a row is a row and a cell is a cell — and it has the
`<b>`/`<i>` the plain text throws away, which is how am**ō** keeps the bold on
the ending that *is* the lesson.

It takes the book's own structure as the syllabus. Bennett numbers 375 sections
and groups runs of them under one heading; each such run becomes one topic, so
§20–22 is *First Declension* and §301–312 is *Conditional Sentences*. Three of
the six parts are dropped, because none of them can carry an English→Latin
translation exercise: Part I (sounds, accent, quantity), Part IV (word
formation) and Part VI (prosody). What remains is Parts II, III and V —
**114 topics** across nine families:

| Family | Topics | Bennett |
|---|---|---|
| Nouns · Adjectives & adverbs · Pronouns | 9 · 5 · 9 | Part II, *Declension* |
| Verb forms | 17 | Part II, *Conjugation* |
| Particles | 3 | Part III |
| Noun syntax · Adjective & pronoun syntax · Verb syntax | 18 · 13 · 28 | Part V |
| Word-order & style | 12 | Part V, *Hints on Latin Style* |

Those nine names are the only ones there are: `FAMILIES` in
`packages/core/src/families.ts` carries one label per family and both apps print
it as-is. Abbreviating them for a narrow column ("Ptcl", "N-syntax") saved eight
characters and cost the student any idea of where they were.

Each topic's `text` is the section's own prose **in full**: one line per
paragraph, one line per table row with its cells held apart by exactly two
spaces, and each stretch the book emphasised wrapped in `⟦b:…⟧` or `⟦i:…⟧`.
Those brackets contain no space, so they cannot invent a column, and
`plainText` in core strips them for anything that measures the words rather
than the markup. Nothing is trimmed to a character budget: what the parser
drops, the student can never read.

[pg]: https://www.gutenberg.org/ebooks/15665

## Three ways forward

A syllabus of 114 topics is walked by more than one kind of student, and for a
long time it was walked by only one: the next topic was the first one in book
order you had not touched, so every route through the book ended up back at
chapter one.

**Two errands, and a switch.** *Review* serves what is due and nothing else;
*Explore* reads the book and nothing else. It opens on the reviews whenever any
are waiting and on the book when none are, switching is immediate rather than
"after this round", and clearing the last review throws the switch back to the
book by itself. Which errand you are on is not written down: a pile of reviews
is exactly the thing a saved preference should not be able to hide, so every
launch puts it back in front of you. With nothing due the switch greys out —
there is no pile to go back to. The accent goes green while reviewing, the same
variable every button and meter already reads, so the app is a different colour
for as long as it is a different errand.

Exploring walks a **cursor** through the book, and it steps forward one section
per round whatever the grade was, and whether or not the round was finished.
That last part is the whole design: a rule like "the first topic not yet
mastered" cannot move past a topic that is going badly, which is the one topic a
student most needs to be able to leave. Mastery decides only where the cursor is
*put*. Three things put it there, and they are remembered until another is
chosen:

**Book order** — the default, and the quick refresher. Drops the cursor on the
earliest section still short of the top band and reads on from there.

**Study from here** — the same walk begun where you say, set by `f` on the index
(web: *Study from here*). Knowing your declensions and wanting to start at the
verbs is the case this exists for. It reads on one section to the next from
there, across the family boundaries and off the end of the book, where it wraps
back to whatever it left behind. The sections you skipped stay *unstudied* on
the index rather than being marked known — they are.

**Practise these** — Enter on the index (web: *Practise these 17*). A section
ships 19–93 questions (median 24) in tests of four, so doing well on one test
and being moved on is not the same as having the topic. This stays put and works
out the questions you have never answered; once there are none of those, asking
again takes the whole bank a second time, leading with whatever you have not
seen for longest. When the run is worked out the loop **stops and says so**
rather than sliding onto the next topic: staying here was an instruction, and
that is not how one ends. The status bar carries the run's count while it lasts,
and it leaves the book cursor alone, so the detour costs you nothing.

**One round of questions is one review.** A served test is four sentences on one
topic, and grading each of them used to drive four FSRS reps into the same card
in a single sitting. The round is the unit instead, graded by the worst answer
in it — a topic you get three of four right on is not one you have. Mastery
still moves per question: it counts what you got right.

## The grammar index

`m` opens the syllabus as a line per grammar family, the selected one expanded to
one cell per topic. (One cell per topic for all 114 at once would need ~136
columns.)

```
Grammar index                                     7% mastered overall

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
one. Beside the score
sits **how much of the topic's bank you have answered** — `9/24 questions` — and
they are different questions: a topic can be mastered on the four sentences it
has served and still hold twenty you have never seen.

`← →` walks the cursor along the bar (including topics you have never met),
`↑ ↓` cycles between families and wraps at both ends, `g` opens the selected
section in full (scrolling as above, `Esc` back to the index), and two keys act on
the topic under the cursor:

- **Enter** stays on it and works a run of its questions out.
- **`f`** takes the book up from it and reads on from there.

The map opens from **every** screen, the way the web app's `▦` button does —
mid-answer (`^N`, since the letters are the answer's), on a vocabulary card and
from the schedule. Whatever it was opened over is what `Esc` puts back,
half-written answer and all.

Both keys cost something from a half-written answer, since they throw it away,
so from there each asks first and a second press goes ahead —

```
§ 100 Conjugation of sum
Press Enter again to leave the answer you are writing and practise “Conjugation of sum”.
```

— and moving the cursor cancels it, because the warning named a topic and `←`
names a different one.

## Progress storage

Progress is user data, saved through a pluggable `StorageAdapter`:

- **Local file** (CLI default) — `~/.latin-tutor/progress.json`.
- **`localStorage`** (web default), with export/import to a JSON file.
- **Private GitHub repo** — `GitHubStorage` commits the JSON via the GitHub REST
  API with a fine-grained token that can read and write that repo's contents (no
  backend). Google Drive/etc. can be added as further adapters.

Both apps can mirror to GitHub, and the local copy stays authoritative in each:
it is written synchronously on every grade, and the push is a four-second
trailing debounce so a four-question test becomes one commit.

On the web, **Settings → Sync with GitHub**. In the terminal:

```
tutor --setup-sync      # asks for owner, repo, file, branch, token
```

It checks the repo before writing anything — a token with the wrong scope
otherwise fails four seconds after a grade, with the next question already on
screen. Settings land in `sync.json` beside `progress.json` in the pack's
`cliDir` (`~/.latin-tutor/sync.json`), created `0600` because it holds a token.
Beside rather than inside: progress is exported and adopted wholesale between
devices, and a credential in it would travel too. `GITHUB_TOKEN` overrides the
stored token, and `--setup-sync` leaves the token out of the file entirely when
the environment already carries it.

The terminal flushes on exit rather than on `visibilitychange`, which is the
browser's equivalent; without that the last grades of a session would sit in the
debounce. Both check for a newer remote copy **at startup only**, and resolve it
whole-file, last-writer-wins after asking. Two devices studying at once will
still lose one of them: merging two spaced-repetition schedules is a much larger
problem than this is trying to solve.

The answers you write are part of that file (`attempts`, keyed by topic), and
none of them is dropped: a question you meet once a year is exactly the one
whose earlier answers are worth having, and the cost is a file that grows with
study. The whole file is rewritten — and, on GitHub storage, committed — on
every save. A file written before the trail existed simply has none; it starts
filling on the next answer. (Only `seenTests`, the rotation's memory, is capped,
at ten per topic.)

Where you are is in there too: `bookAt` (the cursor's section), `practise` (the
run in flight, if any — together these are which of the
[three ways forward](#three-ways-forward) is running) and `openRound` (the round
of questions in flight, so closing the app mid-test still leaves the topic with
exactly one review). Which *errand* you are on is deliberately not: it resets on
every launch, so a waiting pile cannot be hidden from you by a saved preference.
A file written before any of this has none, and opens on the earliest section
short of the top band — which is what it was doing anyway.

## Generation (offline, one-time — not shipped)

All three content files are already built, and everything here runs against
what the repo already holds. `grammar.json` rebuilds from a source in this repo
(`languages/latin/grammar/parse.py`, above). `lemmas.json.gz` is the one file
that needs the reference dictionary — 474 MB of Wiktionary, built locally by
`scripts/reference/` and never committed — because it is made out of it. A
machine that needs it fetches the one this content was built from rather than
ingesting a newer dump: `snapshot.mjs restore --pack languages/latin`, and
[`scripts/reference/README.md`](scripts/reference/README.md) for why.

The per-topic tests are produced by `scripts/gen-tests.mjs`, which drives Claude
Opus via the authenticated `claude -p` CLI, seeds each prompt with vocabulary
sampled from frequency ranks 400–6000 so the sentences stay varied, and checks
every word of every answer against the reference:

```bash
node --import tsx scripts/gen-tests.mjs --target 6                        # every topic lacking a file
node --import tsx scripts/gen-tests.mjs --target 6 bn-020-first-declension   # one topic
node --import tsx scripts/gen-tests.mjs --ref languages/latin/reference   # check against the full dictionary
```

A miss is not fatal, and saying so matters: neither reference is complete, so
treating one as proof of a bad form throws away correct Latin. A sentence may
carry up to `--allow-unverified` misses and still be kept; past that it is the
signature of invented Latin and the item goes. Every form that survives
unconfirmed is counted into `content/gen-stats.json`.

What that tolerance lets through is then answered for by a gate rather than by
trust — `scripts/attestation-report.mjs` re-checks every shipped question with
the same rule and names the ones that carry an unattested form:

```bash
node --import tsx scripts/attestation-report.mjs --pack languages/latin
node --import tsx scripts/attestation-report.mjs --pack languages/latin --ref languages/latin/reference
```

With `--ref` it splits the misses two ways, which is the split worth having: a
form the dictionary knows and the pack does not ship is a thin index to grow,
not a sentence to rewrite. `validate-pack` runs it without `--ref`, because the
pack's own committed content is the only reference a fresh checkout has.

Attestation comes from the pack's own `lemmas.json.gz` unless `--ref` points at
a dictionary. That is not a compromise: on Latin the shipped map attests 98.4%
of generated answer tokens against the dictionary's 94.4%, because a Wiktionary
dump is built around inflected forms and misses common indeclinables — the same
holes the `functionWords` list in `languages/latin/gen/config.mjs` exists to
paper over. The pack's `enclitics` cover the other half of that: `marīque` is
one token to a whitespace split and no word to any dictionary, so the checker
looks through the enclitic before calling it a miss — whole form first, since
`neque` is a word in its own right.

Topics that already have a file are skipped, so a run interrupted by a usage
limit resumes where it stopped. On a sustained limit it retries with a growing
backoff and then stops, rather than marching through the remaining topics
producing nothing.

Calls per topic are budgeted from the deficit, so topping a topic up by two
tests does not cost what writing it from nothing does. The ceiling (`--max`)
defaults to whatever clears the pack's own largest target — set it by hand and
a topic can no longer reach that target, which is a deficit `--fill` will chase
forever without closing.

`languages/latin/citations.mjs` rewrites the citations in `lemmas.json.gz` so
verbs carry their principal parts and adjectives their terminations. The parts
cannot be recovered from what is shipped — the form keys are folded, so the
perfect of *amō* is stored as `amaui` — and they come from the same
`dictionary.db`, whose `forms` table is tagged and fully macronized:

```bash
REF=languages/latin/reference   # built by scripts/reference/; see its README
node --import tsx languages/latin/citations.mjs --ref $REF --dry   # what would change
node --import tsx languages/latin/citations.mjs --ref $REF   # rewrite lemmas.json.gz
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

## Sentences somebody wrote

Some questions carry a `source`, and the grading screen credits it under the
reference answer — `— Cicero, Paradoxa Stoicorum 1.15`. Those answers are not
generated. They are quotations, and the field is present only where one is:
a question with no `source` is one nobody can be credited for, which is still
most of them.

The two packs get theirs from different places, because the two books are not
alike. **Smyth cites constantly**, and the Alpheios TEI keeps the three parts
apart — the Greek in a `<quote lang="greek">`, the English in a `<gloss>`, and
the locus in a `<bibl n="Xen. Anab. 1.2.3">` whose `n` is already Perseus's
canonical citation. So `grammar/parse.py` lifts them before it flattens
anything, and they arrive filed under the topic they illustrate, by the book's
own hand. `languages/ancient-greek/gen/sources.mjs` turns the 86 abbreviations
that occur into names a student can use.

**Bennett cites nobody** in his body text. He has a back index that names a
source for every syntax example, and it looked like the answer — it parses to
130 sections and 531 entries, his own abbreviation table expands them, and a
matcher on section-plus-opening-words attributes 80% of them. It is not the
answer, and the check that says so is worth keeping: against
`reference/texts/`, only 4 of 54 Caesar attributions matched verbatim, and a
far weaker test — all the distinctive words inside any 40-word window — still
failed 38 of 65. Bennett's `Orgetorīx Helvētiīs persuāsit` is filed under
*B.G.* i, 2, where Caesar wrote `Orgetorix ... civitati persuasit`. The index
title is exact if read literally: it indexes the sources of the *illustrative
examples*, meaning what each was drawn from. Bennett wrote the sentences.
Attributing them would manufacture quotations, so that route was measured and
abandoned.

Latin's quotations come from three pools instead, and they are additive rather
than alternative — each reaches sentences the others cannot.

| pool | from | records | licence |
|---|---|---|---|
| `quotes.jsonl.gz` | the Wiktionary dump, where a sense cites real text with a `ref` | 372 | CC BY-SA 4.0 |
| `ag-quotes.jsonl.gz` | Allen & Greenough, via Perseus/DCC as Alpheios mirrors it | 592 | text PD, digitization CC BY-NC-SA 3.0 |
| `lane-quotes.jsonl.gz` | Lane's *Latin Grammar* (1898), Project Gutenberg #44653 | 1,543 | public domain, text and transcription both |

The dump reaches sentences no grammar prints; the grammars reach the syntax the
dump cannot be asked about. **Lane is the largest and the cheapest**, because
Project Gutenberg #44653 is a Distributed Proofreaders transcription rather than
a scan: it is macronized, it glosses every example itself, and it cites a locus,
so a model is asked for one thing rather than three. It was measured before a
line of its pipeline was written — 98.2% of its Latin tokens are attested by the
pack's own index, against A&G's 97.7% and a bar of roughly 95% — and then held
to the test that killed Bennett's index: of its whole pool, 1,235 sentences were
confirmed verbatim against a corpus of the authors it cites and **none was
contradicted**.

Together the three take Latin from **889 attested questions of 7,470 (11.9%) to
2,387 of 8,984 (27%)**, over 62 topics rather than 50. Verb syntax is 44%
attested and noun syntax 37%, where they were 21% and 23%. The inflection
families stay near zero and that is correct: nobody quotes Cicero to teach the
fourth declension.

```bash
node --import tsx scripts/build-quote-pool.mjs --pack languages/latin \
  --dump <kaikki.jsonl> --ref languages/latin/reference   # -> content/quotes.jsonl.gz
node --import tsx scripts/ag-quotes.mjs   --pack languages/latin   # -> content/ag-quotes.jsonl.gz
node --import tsx scripts/lane-quotes.mjs --pack languages/latin   # -> content/lane-quotes.jsonl.gz
node --import tsx scripts/quote-tests.mjs --pack languages/latin --from quotes
node --import tsx scripts/quote-tests.mjs --pack languages/ancient-greek --from grammar
```

Only the first needs the 1.2 GB dump and the dictionary, and it needs them for
the macrons alone; the two grammars print theirs. Each writes a committed
artifact and everything downstream reads that. All three call a model, and what
they ask for is narrow — the dump's builder wants topics, a spelling from a
*closed* set, and an English rendering; the grammars' builders want only which
topic a section teaches, decided once per section rather than once per sentence.
The Latin is the quotation as printed. Nothing here writes any.

Two rules hold the whole thing up. **Nothing may move a gate**: a quotation is
kept only if it carries no unattested form at all, because both packs sit at
their `maxUnattestedForms` exactly and a raise bought by a feature rather than
by the content needing it is what `CLAUDE.md` calls an excuse. And **an
unmatchable quotation is dropped, never guessed at** — a sentence credited to
the wrong author is a lie no gate can see, while a sentence credited to nobody
is just a sentence.

The macron cut that `scripts/lib/quotes.mjs` used to end at is no longer final:
`scripts/lib/macronize.mjs` inverts the fold wherever the dictionary makes it
unambiguous — one marked spelling under a folded key is a lookup, several is a
choice, and a choice is one of the three things the model is asked for.

## Develop

```bash
pnpm -r test          # core + CLI test suites
pnpm --filter @lang-tutor/cli typecheck
```
