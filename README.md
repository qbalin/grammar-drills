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
| `latin` | Bennett, *New Latin Grammar* | 114 topics | 9,006 over all 114 |
| `ancient-greek` | Smyth, *A Greek Grammar for Colleges* | 485 topics | 30,214 over all 485 |

Greek's generation has finished. Both packs now clear every gate
`validate-pack` runs, with nothing relaxed and no `--allow-incomplete`, so
neither publishes as a draft any more.

That is the whole of what a script can say, and it is worth being exact about
the rest. Each pack's `REVIEW.md` holds the gates a person has to read, and they
are not all signed off — Greek's **H3, the quoted-question review, is a recorded
failure at 17 of 35**, and Part I's 71 reading topics have never been read by
anybody. See [`languages/ancient-greek/REVIEW.md`](languages/ancient-greek/REVIEW.md)
and [`languages/latin/REVIEW.md`](languages/latin/REVIEW.md) before treating
either pack as finished.

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
**Explore** serves the topic you chose. It opens on the reviews whenever any are
waiting, and with nothing waiting it asks which topic — see
[One way forward](#one-way-forward).

## The end of a round

A round used to run straight into the next question. The burst that marks
finishing one fired and the loop advanced in the same breath, so the confetti
played over the *next* topic's first prompt and the round that earned it was
already off the screen; and the pile emptying — the one unambiguously good thing
the schedule ever produces — was a 2.6-second toast over a question you had just
been handed.

So the loop stands still. The last grade of a round lands on a card naming the
topic and when it comes back. **Keep going** serves the next question and
**Stop here** opens the schedule — there is no session to end, and what somebody
stopping wants is the dates. The burst fires over this rather than over what
came after it.

It says two things and refuses a third. Not how the round was graded: every
grade in it has already been given and already moved the schedule, and a screen
that added them up would turn four self-assessments into a score, in a loop whose
whole design is that nothing marks you. It used to say a third thing — four
cells drawing where the topic's mastery stood, and which of them this round
moved. That score is gone; see [One way forward](#one-way-forward).

**On a topic that is not in your review pile, it asks instead.** *It is not in
your reviews. Add it and it comes back in 9 days* — **Add to my reviews** or
**Not now**, and the date is the one the grade you just gave has already been
shown to buy, under the button you pressed it with. Answering a topic used to
enrol it, so opening the index and trying a page cost you a card that came due
for the next five years, which is a standing reason not to open the index. It is
the same two things in the interrogative: what was worked on, and when it *would*
come back.

Saying no is not remembered, because there is nothing to remember — the next
round on the topic asks again, and by then the answer may have changed. Saying
yes does not move you on: the card turns into the ordinary landing with the date
on it, and **Keep going** is where it always was.

A grade that also empties the pile gets **one** card, not two to dismiss in a
row: the same card and a line saying so. A word that empties it gets the card
with no topic on it, since a vocabulary card is one question and has no round
behind it.

**And the burst has a top end.** It has fired on every round since it stopped
counting answers — about every four questions, which is a cadence rather than a
surprise. The rarer one is kept for the rarest thing a pack has to offer: the
first line you ever answer by an author you have not read before. Latin quotes
twenty of them and Greek eleven, so it is some twenty bursts in a course. It is
heavier, it draws a group of shapes the pack keeps back for it — Latin throws the
eagle, the wreath, the temple and the chariot — and the card *names* the author,
which is the half that survives a reader who has asked their system not to
animate things.

Who you have met is read back out of the answer trail rather than counted
forward from the day this shipped, so nobody is congratulated in an update for a
Cicero they met last year. Nothing new is written down for it, and there is
nothing to grind at: no screen anywhere says which authors you have met, or which
one the next question quotes.

Spaced repetition runs on two independent [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)
tracks: **grammar topics** (driven by your self-grades) and **vocabulary** you
record as you go. Both are joined by asking rather than by using the app — a
word when you record it, a topic when you say yes at the end of a round. A review serves the **words first** and the grammar after
them: a card is answered in seconds where a round of sentences is not, so a
session cut short has got through far more of what was due — and a word queued
behind a hard topic is a word that misses its review outright when you stop on
the third sentence.

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

**Double-click a word** instead of holding it and you get the word itself rather
than a card: its citation, its gloss, the other readings of that form as chips,
and its own inflection table — the grammar shows one noun of each declension and
expects you to see that yours follows it, which works until the word is
irregular, or defective, or you simply cannot tell which model it belongs to.

The form you pressed is **picked out of that table**, along with the two stubs
that name it — press `rēgem` and the accusative singular is lit, which is the
question you asked. It was a table of thirty endings that look alike and a
student left to find their own word in it, which is the haystack the lookup was
supposed to end. A spelling standing in more than one cell lights all of them,
because that is what syncretism is: `manūs` is the genitive singular *and* the
nominative plural, and naming one would invent a distinction the word does not
make. An exact hit wins where the text has one, so a printed `manūs` is not
confused with the nominative singular `manus`; where nothing matches as written
— you typed the word yourself, without the quantities — the pack's fold decides
instead. Participles, infinitives and the rest are lit the same way in *Other
forms* below the grid, and a wide table scrolls the lit cell into view rather
than leaving it off the edge of a phone.

That sheet now also says **where the word comes from**, folded away under the
gloss: `▸ Etymology`, opening to the paragraphs Wiktionary has for it. It ships
as `content/etymology.txt.gz` — 38,532 of Latin's 55,312 lemmas, 1.2 MB gzipped
— and comes down with the dictionary rather than on the tap, because a sheet you
opened in order to read is the wrong place for a spinner. Greek shows none: its
dictionary was built from Eulexis rather than from Wiktionary, and there is no
etymology in it to ship. Nothing had to be rebuilt for this — the dump the Latin
dictionary was made from carried the field all along and the ingest read past
it, so `scripts/build-etymology.mjs` joins it on by `lemma|pos` and writes one
more file beside what already ships, leaving `dictionary.db` and everything
generated out of it exactly where they were.

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

### And the page it came off

Each sentence on the back names the topic it was met under, and the name is a
tap into the book:

```
Reference
  The soldiers raised their hands.
  Mīlitēs manūs sustulērunt.
                                       § 48  Fourth Declension
```

A vocabulary card and a kept sentence were the only two screens in the app with
no way into the grammar, and that was not an oversight so much as an unfinished
thought. The status bar carries the topic the whole time a *question* is on
screen, and it deliberately stops doing so on a card — a word being graded is
not the topic that carried it, and `Fourth Declension` printed over the gloss
*hand* is most of the answer. So the link lives where the attribution lives,
under the sentence and behind the reveal, and says the same kind of thing: `—
Cicero, Tusc. 2.13` names who wrote the line, `§ 48` names where the book
teaches it.

**Per sentence, not per card**, because a card holding eight of them can have
met them on eight different pages. Two lines off one page draw the same link
twice, which is the truth about each of them rather than a repetition.

The page is **written down when the word is held**, not worked out afterwards
from the question bank — the bank is regenerated, and a card that went looking
for its question months later would be answering from a book that had moved.
Which means the cards you already have say nothing, and so does a word typed
into the vocabulary list with no question on screen. That is the honest answer
rather than a gap: no link is drawn, and none is promised. A topic the pack no
longer holds is dropped the same way, for the same reason the parser un-links a
reference to a section that is not there.

A kept sentence has carried its topic since the deck existed — it just had
nowhere to say it.

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
  the grade touched — the card, the answer trail, the run in flight, and which
  errand you were on. Re-grading then counts once, not twice.

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

The CLI's index keys become buttons on the topic sheet — **Practise these 17**
leading, then **Read § 63-66**, and two marks of your own beside each other: the
bookmark, and **Never roll this**. The dismissal used to be there too, at the
foot; it is on the review itself now, which is where a topic proves it is not
what you need.

Beside the 📖 that opens the index is a **🎲**, which is the same question
answered for you: one tap picks a topic and starts practising it. It leans
towards the topics you have answered least — `1/sqrt(1 + answered)`, so an
untouched one is about five times as likely as one you are twenty-four questions
into — and it leans no harder than that, because a die that never revisits
anything would be a rule about what you may study. It never hands back what is
already on screen, and the toast it raises carries **roll again** for a roll you
do not like. A topic you have worked out and do not want offered comes off it
from its own sheet, and its row on the index then reads `off the die`.

The status bar leads with the two errands: **Explore** and **Review**, both
labels always on screen, the live one pressed. Three links used to say the same two things one at
a time — *set these aside and explore*, *back to reviews*, *back to the book* —
so whichever state you were not in was invisible, and the one you were in looked
like the only one there was.

Beside the switch the bar names **what is on screen and why** in one word —
`review`, `drill`, `vocabulary` — and a `drill` carries its run's count with it.
A card come back on schedule and a topic you asked to stay on are the same four
sentences under the same title, and neither was ever said out loud, so "why am I
being shown this" had no answer on screen. (`new` and `revisiting` were two more,
for the book's walk reaching a topic for the first time and coming back round to
one already graded. Neither is a *reason* any more — a topic is on screen because
you asked for it — though whether the ground is new still decides whether the
grammar is shown before the questions.) It is written on the round rather than
derived from the scheduler, which is what makes it survive a reload: `next` says
why once, and a resumed round never asks it again. The line under it says what is being
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

### A second grammar of the same language

Bennett is the syllabus the app teaches, but he is not the only way to cut
Latin into topics. The pack also parses **Lane's *A Latin Grammar for Schools
and Colleges*** (New York, 1898) — [Project Gutenberg #44653][pg44653], the
book its third quotation pool already comes from — into a syllabus of its own:

```bash
python3 languages/latin/grammar/lane-parse.py   # -> content/grammars/lane.json
node --import tsx scripts/grammar-report.mjs --pack languages/latin --grammar lane
```

459 topics over §§397–2427, against Bennett's 114 over 376 sections: Lane's are
*finer per section*, which is the point of having two. Where Bennett gives one
topic on the dative, Lane gives the complementary dative and the predicative
dative separately, and each has its own page of prose to read.

`lane-parse.py` imports `parse.py` rather than copying it. The markup, the
per-character style buffer and the table reader are the same problem in both
books, and Lane's paradigms come through them untouched — so nothing downstream
learns a second format. What is Lane's own is where a topic begins, what family
it belongs to, and what to call it when the book uses the same words twice.

Two things are Lane's rather than the pack's, declared in `profile.grammars`:

- **Its families are its own chapters.** Filing 459 Lane topics into the pack's
  nine puts 43.8% of them in one accordion. Lane's own headings give 18 families
  of median 12 topics — almost exactly Bennett's 114-over-9 shape.
- **Its shape gates are its own.** Only `maxTopics` actually differs; every
  other threshold Bennett was calibrated at, Lane clears unchanged.

**Nothing at runtime reads it yet.** The app still opens Bennett. The bundle
ships as its own `grammar-lane.json.gz` (416 KB gzipped, against Bennett's 129)
and is deliberately left out of the service worker's precache, so a book nobody
has switched to costs nothing.

[pg44653]: https://www.gutenberg.org/ebooks/44653

## One way forward

**Two errands, and a switch.** *Review* serves what is due and nothing else;
*Explore* serves the topic you chose and nothing else. It opens on the reviews
whenever any are waiting, switching is immediate rather than "after this round",
and clearing the last review throws the switch back by itself. Which errand you
are on is not written down: a pile of reviews is exactly the thing a saved
preference should not be able to hide, so every launch puts it back in front of
you. With nothing due the switch greys out — there is no pile to go back to —
unless a review was left half-answered, which is a place to go back to whatever
the count says. The
accent goes green while reviewing, the same variable every button and meter
already reads, so the app is a different colour for as long as it is a different
errand.

**Leaving a round is not losing it.** A test is a round of questions, and the
round is what the scheduler sees: every grade in it rewinds the topic's card and
re-rates it with the worst answer given, so one round costs exactly one rep
however far into it you get. What used to be lost was the *place* — the die, the
switch and *review this one now* each ended the round on the way past, and two
questions in, one tap, you came back to a different test of a different topic.
Each errand now puts its round down instead and picks it up when you come back
to it, on the same question with the same half-written sentence still in the box.
One round each, not a history: a second round put down in the same errand takes
the first one's place. Choosing a topic to practise is the exception, and it is
not an interruption — asking for a run is asking for the whole bank again, so it
starts fresh.

**You pick the topic.** *Practise these* on the index — Enter in the terminal —
is the only way onto one, and the run stays there until you pick another. A
section ships 19–93 questions (median 24) in tests of four, so doing well on one
test and being moved on is not the same as having the topic. The run works out
the questions you have never answered; once there are none of those, asking
again takes the whole bank a second time, leading with the quotations and then
with whatever you have not seen for longest. When it is worked out the loop
**stops and says so** — *Practise all 24 again*, or *Pick another topic*.
Staying here was an instruction, and sliding off it is not how one ends. The
status bar carries the run's count while it lasts.

With nothing due and no topic chosen, the app asks for one rather than choosing.

**There used to be a cursor**, and two more ways forward that placed it: *Book
order* dropped it on the earliest section still short of the top mastery band,
*Study from here* dropped it where you said, and from either it read on one
section per round whatever the grade was. It worked, and it decided what you
studied. A student who wants to drill the ablative absolute got the ablative
absolute once and then the next section, and the way to stay was one of three
co-equal buttons rather than the way the app worked. Now staying is what
studying *is*, and moving on means coming back to the index and choosing.

**And the percentage is gone with it.** Each topic used to carry a mastery score
from 1 to 4, moved by your self-grades (good/easy `+1`, hard `+0.5`, again
`−1`), drawn as a per-family bar, a ring over the whole syllabus, and four cells
on the card at the end of a round. Three good answers filled it, so in practice
it read 0% or 100% and almost nothing in between: what it measured was how many
topics you had *visited*, in the clothes of how well they had gone — and it
rewarded touching every topic once over working one out. Its only other job was
placing the cursor, and there is no cursor. What is drawn instead is what can be
counted: `9/24 questions answered`, `due now`, and `failed 6 times` where FSRS
has recorded a topic going badly.

Nothing about the schedule changed. You still grade yourself 1–4 and that still
drives [FSRS](https://github.com/open-spaced-repetition/ts-fsrs); the score that
went was a second, parallel number that no review ever read.

**Two marks of your own.** A topic can be **bookmarked** — it pins to a shelf
above the families on the index, in book order, and it is the one fact about a
topic the app does not derive from your record of study. The ribbon is in the
reader's own header as well as on the topic sheet, because the moment you know a
section is one to come back to is a moment spent reading it, and saying so used
to cost a way out of the book and back in. And a topic that keeps coming
back when it is not what you need can be taken **out of the review pile**:
`⊘ stop reviewing this` on the review itself, which is the moment you actually
want it, or `x` twice on the terminal's index. It deletes the scheduling card and
nothing else — the answers stay, the bookmark stays — and practising the topic
*offers* to put it back when the round lands. The grammar half of *Delete this
word*, and it deletes as little.

It was on the topic sheet as well, at the foot under a *Reviews* heading. Two
surfaces for one decision, and that was the wrong one of the two: the sheet is
what you open in order to *start* something, and it ended with a way to stop.

It used to be undone by your next grade, silently, which sat badly with calling
it your decision: a dismissal survived exactly until you next answered a question
on the topic. A dismissed topic is now an unenrolled one like any other, and
comes back the same way any other does — by being asked for.

The app still never suspends a topic on your behalf. `failed 6 times` is a count
and a suggestion; taking it out of the rotation is your decision to make, which
is the whole difference.

**The quotations come first.** Most of what a pack asks was written for this
app; some of it quotes an author, and that half is much the smaller — 2,387 of
Latin's 8,984 questions, 1,109 of Greek's 27,002, and none at all under the
declensions. So a topic hands its tests over in an order rather than picking one
each time: every quotation it holds, then everything else, and when the topic
has been through, both halves shuffled and round again. It orders runs and
reviews alike, because an order withholds nothing — turning it off in Settings
shuffles the topic together instead, and *explore only quoted sentences*, which
does withhold, is the separate setting above it.

**One round of questions is one review.** A served test is four sentences on one
topic, and grading each of them used to drive four FSRS reps into the same card
in a single sitting. The round is the unit instead, graded by the worst answer
in it — a topic you get three of four right on is not one you have.

## The grammar index

`m` opens the syllabus as a line per grammar family, the selected one expanded to
one cell per topic. (One cell per topic for all 114 at once would need ~136
columns.)

```
Grammar index                                 ⚑ 3 bookmarked · 5 due

  Nouns                       ⚑1 2 due    9 topics
▸ Adjectives & adverbs        ⚑2          5 topics
    ▓▓⚑░░  topic 3 of 5
      ▲
  Pronouns                                9 topics
  Verb forms                  1 due      35 topics
  Particles                               3 topics
  Noun syntax                 ⚑1         19 topics
  Adjective & pronoun syntax             13 topics
  Verb syntax                            30 topics
  Word-order & style                     12 topics

§ 63-66 Adjectives of the First and Second Declensions
⚑ bookmarked · 9/24 questions · due
In these the Masculine is declined like hortus, puer, or ager, the
Feminine like porta, and the Neuter like bellum. Thus, Masculine like
hortus:—
Bonus, good.
SINGULAR.
press g to read § 63-66 in full
```

One family per line is what makes `↑ ↓` legible — three to a row, "down" moved
sideways two times out of three — and the whole selected line is highlighted, not
just its name.

Every number is one you can act on. Bars and percentages stood in those columns
for a long time, over the mastery score described above, and what they reported
was how many topics had been visited. What is there instead is the shortlist and
the pile: how many of a family's topics you bookmarked, and how many are due. A
family with neither shows nothing rather than two zeroes.

The cells are the same four facts: `⚑` bookmarked, `█` due, `▓` answered before,
`░` never met, and `·` nothing to serve. The bookmark outranks due, because it
is your own mark and a bookmarked topic that is also due is still first of all a
bookmarked one.

Below the cursor sits the opening of that section, **the same wrapped lines for
every topic** — five of them where the terminal is tall enough, fewer on a short
one, never varying with the topic. Clipped by source line it would be a
paragraph of prose for one topic and a handful of words for a paradigm table, and
the map would change height under you as you walked it.

Beside the § reference sits **how much of the topic's bank you have answered** —
`9/24 questions` — which is a count rather than a verdict: four sentences served
never swept a bank of twenty-odd. `failed 6 times` joins it once FSRS has
recorded a topic going badly.

`← →` walks the cursor along the bar (including topics you have never met),
`↑ ↓` cycles between families and wraps at both ends, `g` opens the selected
section in full (scrolling as above, `Esc` back to the index), and three keys act
on the topic under the cursor:

- **Enter** stays on it and works a run of its questions out.
- **`b`** bookmarks it, or takes the bookmark off. It works inside `g` too,
  where the head of the page draws the mark.
- **`x`**, twice, takes it out of the review pile.

The map opens from **every** screen, the way the web app's `▦` button does —
mid-answer (`^N`, since the letters are the answer's), on a vocabulary card and
from the schedule. Whatever it was opened over is what `Esc` puts back,
half-written answer and all.

Enter costs something from a half-written answer, since it throws it away, so
from there it asks first and a second press goes ahead —

```
§ 100 Conjugation of sum
Press Enter again to leave the answer you are writing and practise “Conjugation of sum”.
```

— and moving the cursor cancels it, because the warning named a topic and `←`
names a different one. `x` asks twice for its own reason: it is a deletion, the
idiom the vocabulary list already uses.

A round worked out on a topic that is not in the review pile stops to ask, the
way the web app's card does:

```
✓ Round done — “Genitive with Verbs” is not in your reviews.
Press a to add it, and it comes back in 10 minutes. Enter carries on without it.
```

This is the terminal's only end-of-round screen, and it exists because the engine
no longer enrols a topic for being answered — without somewhere to ask, this app
could not put anything in the pile by exploring at all. `a` adds it and carries
on; Enter carries on without it, and writes nothing at all.

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

The terminal flushes on exit rather than on `visibilitychange` and `pagehide`,
which are the browser's equivalents; without that the last grades of a session
would sit in the debounce. A push that finds one already in the air re-runs when
that one lands, rather than being turned away and forgotten — the queue is
nobody's to look at again once the app has been taken away. Both check what the
remote holds **at startup**, and resolve the whole file. Two devices studying at
once will still lose one of them: merging two spaced-repetition schedules is a
much larger problem than this is trying to solve.

Which of the two copies wins is a question of what would be lost, and **never of
which clock is later**. `updatedAt` says when a device last *wrote*, not how much
study it holds, and opening the app is a write — it serves a test and writes the
round down. So a laptop untouched for a week is stamped "now" the moment it is
opened, out-clocks last night's phone, and lands on top of it. The two
quantities are unrelated, and no clock drift between the devices is needed for
them to come apart.

What is compared instead is lineage. Each device records **two** things about
the last time it and the remote agreed: the local `updatedAt` it got up there,
and what the remote's `updatedAt` was at that moment. They are the same value
except after a commit that sent nothing, and that is exactly why they are two —
kept as one, that no-op would leave every launch after it believing another
device had been at the file. They live in `localStorage` on the web and
`~/.latin-tutor/synced` in the terminal, and in neither case inside
`progress.json`, because a marker that synced would describe whichever device
wrote it last. Files written before there were two of them hold a bare string,
which is read as both.

Two questions come out of that, and neither compares timestamps for order: has
the remote moved since we agreed, and does this device hold work it never sent.
Only the first decides anything. The second decides how the question is *worded*
— and that distinction is the whole of what follows.

**Nothing is ever replaced automatically unless nothing can be lost**, and only
two cases prove that. A device with no copy at all takes whatever is there,
which is how a second device starts. And two copies that **say the same thing**
are the same file with two clocks on it, so there is nothing to choose: the
marker is mended and nothing is said. That second case is not a nicety. It
happens on one device with no second one in the world — the flush on the way out
of the app lands its commit and the page is gone before the marker can be
written down, so next launch the remote has "moved" (it holds this device's own
work) and the device has "unsent" work (opening it moved the clock). Read from
lineage that is a question asked over two identical files. Compared, it is not a
question at all. It is the same rule `GitHubStorage` declines to commit on.

Everything else asks, including the phone-on-the-sofa-and-laptop-in-the-morning
case that used to be taken in silence. The silence rested on `hasUnsent` — the
marker's word that this device had nothing of its own — and a marker is a claim
about a past push, wrong exactly when the mirror had quietly stopped pushing,
which is the moment a session is on the line. A destructive answer may not rest
on a guard that can be quietly false. So the morning costs one question, and the
case above is what keeps it from being a daily one.

Since two quite different situations now reach that question, it has to say
which it is, and `unsent` is carried out of the check rather than asked again
later — only the check knows which copy it compared, and asked of the live
session the answer is nearly always "yes", because opening the app moves the
clock. A device that has been studied is choosing which copy to lose. A device
that has not is being offered a catch-up that costs it nothing, and is told so:
in the terminal that changes the default answer, which is the half that matters
when somebody presses Enter. Told alike, the second reads as the first, and the
obvious answer to the first force-pushes a week-old copy over last night.

**Pull** warns on the same footing — a pull discards whatever this device has
not sent, so what it asks about is the loss, not the direction.

The check also runs **again when the tab comes back**, not only at launch, held
to once a minute. An installed app left open for a week never looked at GitHub
after the morning it was opened, so the first anybody heard of the other device
was a push refused in the middle of a question. Coming back to the tab is the
calm moment to find out, and — because of the paragraph above — nearly always a
silent one: a device that studied nothing while it was away holds what the
remote holds, and settles itself.

The same rule is what `GitHubStorage` refuses on. A save is turned away unless
the remote holds the copy this device last agreed with, whether GitHub reports a
sha mismatch or (the case that actually lost the data) accepts a freshly-read
sha carrying a week-old file. Only an explicit `force` gets past it, and only
four things pass one — each of them a person choosing: **Keep this device**,
**Replace it with this device's**, **Push this device's instead**, and answering
the terminal's prompt with `n`.

That refusal, rather than the startup check, is what makes the rule hold. The
check runs once and a session runs for an hour: study on the phone at half past
and this device's next grade is a push over work it has never seen. **Nothing is
pushed until the check has answered** — the web app's first grade could beat it
through the four-second debounce — but that gate is an ordering, not the
guarantee, and it opens only on the answers this app can settle itself. A push
refused mid-session raises the same sheet the startup check raises, over the
same two answers; it used to be a line of text in Settings, which is to say the
one moment there was something to ask about was the one moment nothing asked.

Connecting to a repo that already holds a file always asks. This device has
never agreed with it about anything, so there is no honest way to work out whose
copy is whose — and naming a repo happens once per device, not once per morning.

**Connect** and **Update** are the same button relabelled, though, and that
argument is only true of the first of them. A device that has synced always
finds a file up there, so Update asked every time — under a sheet reading "this
device has never synced with that repo", which was false in the case it was
shown in. It is the button you press to paste a reissued token. So what a repo
is *named* by is owner, repo, branch and path, and the token is not part of it:
a changed name ends the agreement and asks, while a changed token keeps it, and
Update on a repo this device is in step with goes through the ordinary check and
says nothing at all.

Nor is an unchanged copy committed. Opening the app moves `updatedAt` without
anything being studied, and that used to be a commit on somebody's real
repository every time; a save whose content matches what the remote holds, its
clock aside, sends nothing at all.

That last rule is one object identity away from being a catastrophe, and was.
`Session.progress()` hands out `this.p` itself — live, mutated in place by every
grade, because cloning it on the keystroke path is work nobody asked for. Held
by the mirror as "what the remote holds", it stopped being a record of anything
and became a second name for what the device was doing: the next commit compared
that object with itself, called it unchanged whatever had been studied, and sent
nothing, while reporting a push that landed. One commit per session, silently,
with the status line saying *synced* — and a marker naming a file GitHub had
never been given, which the next check read as another device having been at it.
So both ends now keep copies they own: the mirror queues a detached one, and
`commit` answers about the copy it serialized rather than about the caller's.
The rule to hold on to is that **anything kept past the moment it was handed
over must be a copy**, because what it was handed was not a value.

The answers you write are part of that file (`attempts`, keyed by topic), and
none of them is dropped: a question you meet once a year is exactly the one
whose earlier answers are worth having, and the cost is a file that grows with
study. The whole file is rewritten — and, on GitHub storage, committed — on
every save. A file written before the trail existed simply has none; it starts
filling on the next answer. (Only `seenTests` is capped, at ten per topic. It
used to be the rotation's whole memory — "serve what is not in here" — and could
not be, because a topic runs to ninety tests and ten of them is not an answer to
"have they all been seen". `testCycles` carries the rotation now: two numbers per
topic, a seed naming the order and how far into it you are, so the order is
derived rather than stored. What is left for `seenTests` is which of two tests
was served longer ago, which is what a practice run breaks a tie with, and a cap
is fine for that.)

Where you are is in there too: `practise` (the run in flight, if any — see
[One way forward](#one-way-forward)), `bookmarked` (the topics you marked, filed
under the primary grammar's ids like everything else) and `openRound` (the round
of questions in flight, so closing the app mid-test still leaves the topic with
exactly one review). Which *errand* you are on is deliberately not: it resets on
every launch, so a waiting pile cannot be hidden from you by a saved preference.

A file written before any of this opens with no topic chosen and keeps
everything that matters: its cards, its answer trail, its vocabulary. What it
loses are the three fields the book's walk was made of — `bookAt`,
`bookAtByGrammar` and the `topicMastery` score that placed the cursor — which
are dropped rather than migrated, because there is nothing left for them to
become. See `LegacyProgress` in `packages/core/src/types.ts`, which records what
each of them was and what happened to it.

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

Two topics are written at once. A topic is the unit that parallelises without
anything having to be kept in step — it owns its file, its call budget and the
prompts it must not repeat — while the calls *within* one stay in sequence,
because each is told what the last one wrote. `--jobs N` sets the number and
`--jobs 1` is the strictly serial run; the ceiling worth respecting is the
`claude -p` usage limit rather than the machine. Splitting a pack across
several processes over disjoint topic lists works as it always did —
`gen-stats.json` is appended under a lock for exactly that — and the two
compose, so eight streams is four processes at `--jobs 2`.

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
2,409 of 9,006 (27%)**. Verb syntax is 36% attested and noun syntax 35%, where
they were 21% and 23%.

### Asking the sentence instead of a model

For a long time the inflection families stayed near zero, and there was a
sentence here saying that was correct — nobody quotes Cicero to teach the fourth
declension. That was true about the *books*, and wrong about the sentences. Of
Bennett's nine noun topics, eight had no quotation at all, because no
grammarian's syntax section illustrates the fourth declension and a section is
the only thing the pools were ever filed by.

But "does this sentence show a fourth-declension noun" is not the kind of
question a model is needed for. It is a lookup, and the pack already ships what
answers it: `lemmas.json.gz` names a lemma's declension and conjugation, and
`paradigms.txt.gz` says which cell of its own table a surface form fills. So
`inflection-topics.mjs` files the pools' sentences under the inflection topics a
lookup can confirm, out of a table the pack owns —
`grammar/inflection-topics.tsv`, one row per rule, each carrying the sentence of
Bennett's that licenses it. `manus` is a fourth-declension noun; `ortū` fills its
ablative singular; the sentence containing it teaches §48, and no one had to be
asked.

Three things keep the rule honest. A form licenses a class only when **every**
candidate lemma of it agrees — one reading the table cannot classify and the
token is refused, which is what stops `dī` being filed under the fifth
declension. A declension wants an **oblique** cell, because a nominative
singular shows a word and not a paradigm. And the rules that license nothing
were **withdrawn rather than loosened**: the relative and interrogative pronouns
share almost every form they have, so no sentence proves which is meant, and
they are left empty. `impersonal` went the same way — wiktextract writes it on a
*sense*, so it marks `cadō`, and Bennett's own list is used instead.

Since a sentence ships once, this is a redistribution rather than an addition:
`quote-tests --allocate` deals the whole pool at once, sparsest topic first, out
of the surplus of the topics that have most, and never below a floor that keeps
a donor at 16. Conditional sentences goes from 255 quoted questions to 105 —
still the deepest in the pack — and thirty topics that had nothing get sixteen.
**Topics with no quoted question at all: 52 before, 23 after.**

What remains is what no lookup can reach and no book had a section for: word
order and the style family, the umbrella topics whose children carry the
quotations, and §13 on gender, which belongs to the lemma rather than to the
sentence. Those wait for another book.

```bash
node --import tsx scripts/build-quote-pool.mjs --pack languages/latin \
  --dump <kaikki.jsonl> --ref languages/latin/reference   # -> content/quotes.jsonl.gz
node --import tsx scripts/ag-quotes.mjs   --pack languages/latin   # -> content/ag-quotes.jsonl.gz
node --import tsx scripts/lane-quotes.mjs --pack languages/latin   # -> content/lane-quotes.jsonl.gz
node --import tsx scripts/inflection-topics.mjs --pack languages/latin  # -> content/inflection-topics.jsonl.gz
node --import tsx scripts/prune-tests.mjs --pack languages/latin --quoted --apply
node --import tsx scripts/quote-tests.mjs --pack languages/latin --from quotes --allocate --per-topic 16
node --import tsx scripts/quote-tests.mjs --pack languages/ancient-greek --from grammar
```

Only the first needs the 1.2 GB dump and the dictionary, and it needs them for
the macrons alone; the two grammars print theirs. Each writes a committed
artifact and everything downstream reads that. The three pool builders call a
model, and what they ask for is narrow — the dump's builder wants topics, a
spelling from a *closed* set, and an English rendering; the grammars' builders
want only which topic a section teaches, decided once per section rather than
once per sentence. `inflection-topics.mjs` calls none: every answer it gives is
a row of a table somebody wrote out or a cell of a paradigm the pack ships.
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
