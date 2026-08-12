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
| `gen/sources.mjs` | the citation abbreviations a pack's grammar uses, expanded |
| `grammar/parse.py` | builds `grammar.json` from a public source it downloads |
| `content/grammars/<id>.json` | a *further* grammar of the same language, declared in `profile.grammars` |
| `grammar/lane-parse.py` | Latin only: builds one, as a sibling of `parse.py` rather than a copy |
| `gen/config.mjs` | what the question generator needs to know about this language |
| `citations.mjs` | rewrites citations in `lemmas.json.gz`; needs the reference dictionary |
| | *the dictionary is split: a lemma table plus a sorted form index over it* |
| `reference/frequency.tsv.gz` | committed, ~200 KB; ranked lemmas for the gates |
| `fold.fixtures.json` | pairs that must fold alike and pairs that must not |
| `icon.mjs` | the app icon's glyph, as capsules or an SVG path |
| `confetti.mjs` | the silhouettes thrown every 10–20 answers, and which may share a burst |
| `BASELINE.json` | what the pack measured when last validated — a record, not an input |

Do not hand-edit anything under `content/`; regenerate it.

A pack ships **every word its reference dictionary holds, each with a gloss** —
not only the words its corpus attests. `build-lemmas.mjs` does this by default.
Ship the corpus's vocabulary alone and the app tells a student that a perfectly
ordinary word is not a word, silently, with every gate green. See "How much to
ship" in `scripts/reference/README.md`.

## Commands

```bash
pnpm -r test && node scripts/check-core-purity.mjs      # what CI runs
node --import tsx scripts/validate-pack.mjs --pack languages/latin   # every gate
LANG_PACK=latin pnpm --filter @lang-tutor/web build
```

Scripts importing `@lang-tutor/core` need `node --import tsx`; the few that do
not are plain `node`.

`validate-pack` is the answer to "is this pack ready" — it composes the grammar,
coverage and attestation reports and exits non-zero on any failure. Greek is a
draft and takes `--allow-incomplete`, which reports the how-much-is-written gates
without letting them decide the exit code. Nothing about correctness is relaxed
by it, the attestation gates included.

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

**Progress does not move.** `topicCards`, `topicMastery`, `seenTests` and
`attempts` stay filed under the *primary* grammar's topic ids whichever book is
open, because that is the syllabus the questions were written against. A further
grammar's section reads the progress of the topics it teaches
(`Content.primaryTopicsFor`), and a round opened on one is graded against the
topic its test belongs to — never against the section it was reached through,
which would file a card under an id no question belongs to.

So switching books is a view change: no migration, no schema version, no second
store to keep in step. `Progress.grammarId` records which book is open and
`bookAtByGrammar` its cursor; a file that has neither is the primary, which is
every file written before there was a second book.

The consequence to state rather than discover: **two sections of one book that
teach the same topic of the other move in lockstep.** There is one bank of
dative questions, so there is one answer to give about them; a finer one would
be invented. `packages/core/src/grammars.test.ts` asserts it so it cannot drift
into a surprise.

`questionId` (core) is *not* what progress is keyed by — see above — but it is
the only key left the day a pack generates questions against a second grammar's
own topics. Derived from prompt and answer rather than written into the content,
so it cannot drift out of step. C8 measures that it stays a key.

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
