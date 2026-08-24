# lang-tutor

A spaced-repetition language tutor that runs with **no LLM at runtime**. The app
is a static site; everything a student meets was generated offline and shipped
as data. `README.md` is the long version.

## Layout

```
packages/core      the engine — scheduler, fold, session, storage. Knows no language.
apps/web           the PWA. One build per pack; the language is compiled in.
apps/cli           the same content, read straight off disk.
languages/<pack>   a language pack (latin, ancient-greek)
scripts/           offline tooling: build, generate, validate
```

A pack is the unit of work. Every script takes `--pack languages/<id>` (or
`$LANG_PACK`), and making a script work for a second language means never
hardcoding the first. `scripts/check-core-purity.mjs` enforces the matching rule
for the engine: `packages/core` must not learn a language.

## Inside a pack

| path | what it is |
|---|---|
| `profile.json` | the pack's contract — fold, families, thresholds, UI strings |
| `content/` | **generated**, and what ships: `grammar.json`, `tests/*.json`, `lemmas.json.gz` + `forms.txt.gz` |
| `content/quotes.jsonl.gz` | Latin only: quotations filed under topics, an input to `quote-tests.mjs` rather than something that ships |
| `content/ag-quotes.jsonl.gz` | Latin only: the same, out of Allen & Greenough rather than the dictionary dump. `quote-tests.mjs --from quotes` reads both pools |
| `grammar/inflection-topics.tsv` | the classes a topic is about, one row per rule — read `inflection-topics.mjs` |
| `content/inflection-topics.jsonl.gz` | the topics that table confirmed for each pool sentence, merged into its own by `quote-tests.mjs` |
| `gen/sources.mjs` | the citation abbreviations a pack's grammar uses, expanded |
| `grammar/parse.py` | builds `grammar.json` from a public source it downloads |
| `content/grammars/<id>.json` | a *further* grammar of the same language, declared in `profile.grammars` |
| `grammar/lane-parse.py` | Latin only: builds one, as a sibling of `parse.py` rather than a copy |
| `gen/config.mjs` | what the question generator needs to know about this language |
| `dict/<id>-parse.py` | a further dictionary's parser — read "More than one dictionary" |
| `content/dictionaries/` | **generated**: `<id>.json.gz` + `<id>-forms.txt.gz`, and the manifest |
| `citations.mjs` | rewrites citations in `lemmas.json.gz`; needs the reference dictionary |
| | *the dictionary is split: a lemma table plus a sorted form index over it* |
| `content/etymology.txt.gz` | Latin only: where each word comes from, keyed `lemma\|pos`. Built by `build-etymology.mjs` from a kaikki dump, joined against the lemmas the pack already ships — it does **not** touch `dictionary.db`, and a later dump is fine because no gate reads it. Greek's dictionary is Eulexis-derived and has no etymology to ship |
| `reference/frequency.tsv.gz` | committed, ~200 KB; ranked lemmas for the gates |
| `fold.fixtures.json` | pairs that must fold alike and pairs that must not |
| `icon.mjs` | the app icon's glyph, as capsules or an SVG path |
| `confetti.mjs` | the silhouettes thrown when a round is worked out, which may share a burst, and the group kept back for a milestone |
| `BASELINE.json` | what the pack measured when last validated — a record, not an input |

Do not hand-edit anything under `content/`; regenerate it.

A pack ships **every word its reference dictionary holds, each with a gloss** —
not only the words its corpus attests. `build-lemmas.mjs` does this by default.
Ship the corpus's vocabulary alone and the app tells a student that a perfectly
ordinary word is not a word, silently, with every gate green. See "How much to
ship" in `scripts/reference/README.md`.

## The whole book, and the part of it that is taught

A pack ships **every numbered section of its source grammar**. Sounds, word
formation and prosody carry no English→L2 translation exercise, and that is a
fact about *questions*, not about reading: the parser marks their topics
`readingOnly` rather than dropping them. They are in the index and the reader
like any other page, and no question is ever written against one. `G10` is the
gate that says so; the one thing a parser may still drop is a book's own
apparatus — an index of cited sources, a key to author abbreviations — and it
must name the reason `apparatus`.

**`readingOnly` is declared, never derived from "this topic has no tests."**
Derived, an orphaned test file would silently reclassify a real topic, which is
the defect `C0` and `C1` exist to catch. Absent means teachable, and a teachable
topic must have questions — a pack that says nothing inherits the strict rule,
as with `attestation`. The parser records the reason per topic in its coverage
manifest and `G11` holds the two in step.

So there are two populations, and every gate has to know which it measures.
`scripts/lib/pack.mjs` exports `teachable()` for the syllabus: the shape band
(`G2`, `G3`), everything in `coverage-report`, `X2`/`X3`, the crosswalk, and all
six offline generators read it. What reads the whole book instead is anything
about a page a student can open — families, ids, order, `G6`, `G7` — and
`Content.sections()`, which is what the reader pages through.

The engine has no figure over either population. It had one — `overallPercent`,
a mean mastery drawn as a ring and a per-family bar — and the rule here was that
it count teachable topics only, so a student's figure could not fall because the
*book* grew. The score behind it is gone (see "One way forward" in `README.md`),
and with it the whole question: the index counts questions answered and cards
due, and both are facts about what is in front of the student rather than
averages over a population.

## Commands

```bash
pnpm -r test && node scripts/check-core-purity.mjs      # what CI runs
node --import tsx scripts/validate-pack.mjs --pack languages/latin   # every gate
LANG_PACK=latin pnpm --filter @lang-tutor/web build
```

Scripts importing `@lang-tutor/core` need `node --import tsx`; the few that do
not are plain `node`.

`validate-pack` is the answer to "is this pack ready" — it composes the grammar,
coverage and attestation reports and exits non-zero on any failure. **Both packs
pass every gate**, Greek included, and neither is a draft: `--allow-incomplete`
still exists for a pack midway through generating its questions, and reports the
how-much-is-written gates without letting them decide the exit code, but nothing
in this repo passes it now. Nothing about correctness was ever relaxed by it, the
attestation gates included.

What `validate-pack` does **not** answer is the part no script can. Each pack's
`REVIEW.md` records the gates a person has to read — segmentation (H1), the
generated questions (H2), the quoted ones (H3) — and those are not all signed
off. Greek's H3 is a recorded **failure**, 17 of 35. They are `H`-numbered so
that none of them collides with a gate a script runs: the human question review
was C8 until the automated C8 below took the number. A green `validate-pack` and
an unread `REVIEW.md` are two different claims and the second is the weaker one.

## More than one grammar

A pack may teach the same language out of more than one book. `profile.grammars`
declares the further ones — Latin ships Bennett as its primary and Lane beside
it — and `grammar-report.mjs --grammar <id>` holds each to its own gates, which
`validate-pack` runs once per book.

Only what differs is declared. Typography belongs to the language rather than to
the book, so `paradigmLabels` and the heading rules are inherited from
`profile.grammar`. **`families` and `grammarShape` are not**, because they are
precisely where two books disagree: a family list is one book's table of
contents, and a shape gate is calibrated against one book's idea of how long a
topic is. Averaging two of them measures neither.

Nothing at runtime reads a secondary grammar yet — the app still opens the
primary. The declaration exists so that a second book is gated from the day it
is parsed rather than from the day it is displayed.

**A further grammar has no questions of its own.** It is served out of the ones
written against the primary, reached through `content/grammars/crosswalk.json`,
which `build-crosswalk.mjs` joins from the `grammar/<id>-topics.tsv` tables a
model filled in section by section. So the chain is

```
primary topic  <-  <id>-topics.tsv  <-  foreign section  ->  assigned  ->  foreign topic
```

and every link is a model answer somebody can read back or a fact the parser
recorded. Nothing may guess at the join: an invented topic pair looks exactly
like a checked one. `crosswalk-report.mjs` gates the result (X1–X3) and prints
how much of each book is reachable. Its gates are numbered apart from the
coverage report's on purpose — a low figure there is a gap in the *table*, not a
hole in the pack.

**Progress does not move.** `topicCards`, `starred`, `seenTests` and `attempts`
stay filed under the *primary* grammar's topic ids whichever book is open,
because that is the syllabus the questions were written against. A further
grammar's section reads the progress of the topics it teaches
(`Content.primaryTopicsFor`), and a round opened on one is graded against the
topic its test belongs to — never against the section it was reached through,
which would file a card under an id no question belongs to. `star`, `unstar`
and `dismissTopic` all map through `primaryTopicsFor` for that reason.

So switching books is a view change: no migration, no schema version, no second
store to keep in step. `Progress.grammarId` records which book is open; a file
without it is the primary, which is every file written before there was a second
book.

The consequence to state rather than discover: **two sections of one book that
teach the same topic of the other move in lockstep.** There is one bank of
dative questions, so there is one answer to give about them; a finer one would
be invented. Starring either starts both, and dismissing either takes both off
the pile, for the same reason. `packages/core/src/grammars.test.ts` asserts it
so it cannot drift into a surprise.

`questionId` (core) is *not* what the **syllabus** is keyed by — see above — and
it is the only key left the day a pack generates questions against a second
grammar's own topics. Derived from prompt and answer rather than written into
the content, so it cannot drift out of step. C8 measures that it stays a key.

One thing is keyed by it already: **the sentences a student keeps**
(`packages/core/src/sentences.ts`). A kept sentence is filed under the question
rather than under the topic it was met through, because it is the question the
student wanted and not the filing — and because a card must survive the bank
being regenerated, which the derived id gives for free. It carries its own copy
of the prompt, the answer, the note and the attribution, so nothing about it
breaks when the content is rebuilt; `sectionId` rides along as provenance and is
never looked up by.

So there are **three decks**, and every count over the pile has to know it:
topics, words, sentences. `Session.stats().due` is the total and is what a
screen asks — six places used to add up the two kinds they knew about, which is
exactly the sum that goes quietly wrong when a third arrives.

`profile.attestation` is what a pack may ship that its own content cannot
confirm — `maxMissesPerQuestion` (distinct forms in one answer, and the bar the
generator writes to) and `maxUnattestedForms` (tokens across the pack). Both are
measurements a pack was admitted at rather than targets.

They move in one of two ways and no others. **Down**, in the commit that earns
the reduction. **Up**, only in the commit that generates the content needing it,
and only by what that content actually measures — because a reference is not a
language: a pack that could never raise this number could never teach a form its
dictionary happens not to list, and both of these do. Latin's archaic gerundives
live in the topic on peculiarities of conjugation; Greek's future optatives live
in the topics on indirect discourse. What is never allowed is raising it to make
an unrelated red build green, which is the whole difference between a budget and
an excuse. Say which questions bought the increase in the commit message.

**A pack that declares no `attestation` block is held to 0/0**, so a language
added later inherits the strict rule by saying nothing.

Quoted questions (`scripts/quote-tests.mjs`, ids `-q<n>`) are the case where the
rule bites hardest and is right to. Real classical text is full of forms the
shipped index does not attest, so the temptation to raise the budget is exactly
the "unrelated red build" the rule forbids — the feature would be buying the
raise, not the content. So the pipeline filters instead: a quotation ships only
if it carries no unattested form at all, and the ones dropped for it are
reported rather than argued with. Both packs' numbers were unmoved by it.

## More than one dictionary

A pack ships one dictionary of its own — `lemmas.json.gz`, a citation and a
joined gloss per lemma, sized for the crib above an answer box. `profile.dictionaries`
declares **further** ones, which are lexica: the senses divided, the constructions
named, the authors cited. Latin ships Lewis & Short beside its own.

The declaration mirrors `profile.grammars` and so does the pipeline:

```
<pack>/dict/<id>-parse.py   ->  content/dictionaries/<id>.jsonl   (gitignored)
scripts/build-dictionary.mjs ->  <id>.json.gz + <id>-forms.txt.gz  (shipped)
scripts/dictionary-report.mjs -> Y1-Y5, once per declared book
```

The parser pins its source by SHA-256 and exits hard on a mismatch, as
`lane-parse.py` does. It never folds anything: the fold is `profile.json`'s and
is compiled by `packages/core/src/fold.ts`, so keying happens on the JS side —
the same split, and the same reason, as `parse.py` against `build-lemmas.mjs`.

**A further dictionary is read, never counted.** It does not feed the question
crib, it does not feed attestation, and it cannot move `maxUnattestedForms`.
`dictionary-report.mjs` may not import `scripts/lib/reference.mjs`, and
`attestation-report.mjs` knows nothing about `profile.dictionaries`. What a
lexicon holds says nothing about what the pack may ship; the day it does is a
commit that argues for it.

The gates are `Y`-numbered for the reason the crosswalk's are `X`-numbered — a
low figure here is not a hole in the pack. **`Y4` is the one that matters** and it
gates a *band*: a lexicon and a frequency list disagree most about rare words, so
the figure over everything is dominated by words no student meets. Lewis & Short
answers for 97.1% of Latin's top 2,000 lemmas, 79.0% of all 19,291 ranked, and
57.6% of every lemma including the tail. Gating the last of those would gate noise.

**The join is two-step**, and that is what keeps a lexicon from having to know
about inflection: the pack's own dictionary resolves a form to its lemmas, and the
lemma is what the further book is asked about, with the bare form tried last for
indeclinables. Two things are done at build time to make it hit — Perseus's
homograph digits are stripped off the key (`sum1` -> `sum`, worth ten points), and
every `<orth>` an entry prints becomes a key for it (worth another four). An
assimilated-prefix table was tried and dropped: it bought 1.2 points of ranked
reach and none at all inside the band.

Articles carry the same `⟦b:…⟧` / `⟦i:…⟧` inline markup grammar prose does and are
decoded by the same `decodeRuns`, which is what keeps a source document's markup
from becoming markup here. They are **not** run through `parseBlocks`: that
classifier is calibrated on the pack's grammar, reads a lowercase `a.` as a
sub-point and knows nothing of `A.` or `(b)`, and Lewis & Short uses all three
across five levels. So the senses ship as records carrying the level the book
stated, and the reader indents them.

Perseus's lexica are entirely in Beta Code — LSJ writes its *headwords* that way,
so for Greek the transcoding is on the join path rather than the display path.
`scripts/lib/betacode.py` is the shared converter, and it is written here rather
than taken from `scripts/reference/greek.py`, whose table lives inside an
uncommitted 90 MB download and is GPLv3.

Content licensing is in `LICENSES.md`. Lewis & Short is CC BY-SA 4.0, and the
attribution is rendered where the articles are read.

## Two ways a quotation reaches a topic

A pool record's `topics` are a model's answer, recorded per sentence or per
source section in a reviewable table, because for syntax there is no other kind
of answer: nothing can look up whether a sentence teaches the ablative of means.

For inflection there is. `scripts/inflection-topics.mjs` files a sentence under
the topics a **lookup** confirms, out of `grammar/inflection-topics.tsv` — a
declared table whose every row carries the sentence of the book that licenses
it. A form licenses a class only when every candidate lemma of it agrees, a
declension wants an oblique cell, and a rule that licenses nothing is
**withdrawn rather than loosened**: the relative and interrogative pronouns
share their forms, so no sentence proves which is meant, and their rows are
gone. `impersonal` was withdrawn for the same reason — the dictionary writes it
on a *sense*, so it marks `cadō`, and a sense the surface cannot distinguish is
not a fact about the word in front of the student.

**A sentence still ships once.** `quote-tests.mjs --allocate` deals the whole
pool in one pass, sparsest topic first, out of the surplus of the topics that
have most and never below `--donor-floor`. So filling a topic means moving a
sentence, not copying one: `answerKey` keeps meaning what it says and C4 does
not move. The corollary is that a pool cannot be re-dealt incrementally — the
composer seeds its keys from everything on disk — so a different deal starts
with `prune-tests.mjs --quoted`, which hands the quoted tests back to the pools
and leaves the generated ones holding the floor.

## The reference

Attestation ("is this a real word") and the vocabulary band come from
`scripts/lib/reference.mjs`, which has two backends. By default it answers from
the pack's own committed content and needs nothing external — this is why the
gates run in CI. Pass `--ref <dir>` and it uses the full reference databases
instead.

Only `scripts/build-lemmas.mjs` and a pack's `citations.mjs` require the
dictionary, because they are what build the committed content out of it. Both
refuse to run without one and say how to get one:
`scripts/reference/README.md`.

Do not reintroduce a dependency on a checkout outside this repo. It is meant to
be self-contained.
