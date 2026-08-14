# Adding a language

This is a checklist. Each step ends in a command whose exit code is the answer,
so a run that follows it either finishes with a pack that passes every gate or
stops somewhere specific.

Latin is the worked example throughout, because it is the pack that exists.
Ancient Greek is the second example, because the interfaces were designed
against it — where Greek would answer differently, it says so.

---

## 0. Read this first

A **language pack** is one directory. It holds the language's profile, its
content, and the three scripts that are irreducibly about that language: how to
parse its reference grammar, how it cites a word, and what to tell a model when
asking for practice sentences.

**The one rule: add files under `languages/<name>/`, and change nothing under
`packages/core/`.** CI enforces it (`scripts/check-core-purity.mjs`). If the
engine genuinely needs to know something new about a language, that is a missing
field on the profile — add it to `packages/core/src/pack.ts`, give Latin its
value too, and say in the commit what the abstraction had missed. Reaching into
`languages/` from core is never the answer.

**One build per language.** The CLI takes `--language ancient-greek`; the web app is
built with `LANG_PACK=ancient-greek` and deployed to its own URL. There is no in-app
switcher, and adding one is a bigger change than adding a language.

```
languages/ancient-greek/
  profile.json          the shape of the language                      step 3
  fold.fixtures.json    what counts as the same word, both ways        step 2
  grammar/parse.py      your grammar -> content/grammar.json           step 4
  gen/config.mjs        the prompt, the band, the function words       step 7
  citations.mjs         how this language cites a word                 step 6
  icon.mjs              the glyph: capsules, or an SVG path            step 8
  content/              grammar.json · tests/ · lemmas.json.gz ·
                        forms.txt.gz                                   built
  BASELINE.json         what it measured when it last passed           step 9
  REVIEW.md             the two gates a human has to sign              steps 4, 7
```

---

## 1. Choose the language and its sources

You need three things before writing any code. Two of them are outside this
repo, and finding out on step 7 that one is missing wastes everything before it.

**A public-domain reference grammar with numbered sections.** The numbering is
what makes automatic splitting possible; without it you are segmenting prose by
hand. Bennett's *New Latin Grammar* (Project Gutenberg #15665) for Latin,
Smyth's *Greek Grammar* for Greek. Check the licence before writing a parser,
and record it in `profile.grammar.source` — it is printed by `validate-pack` so
nobody has to go looking later.

**Check the edition is the whole book.** This is worth a few minutes because it
is invisible later: CCEL's Smyth, which earlier drafts of this file named, holds
only Parts I and II — §§ 1–573, the letters and the inflections. It stops before
Syntax, which is 2,149 of the book's 3,048 sections, and a pack built on it
would teach every ending and nothing about using them. The Greek pack uses the
Perseus Project's TEI instead. Count the sections in the source against the
book's own last section number before writing a parser against it.

**A `dictionary.db` and a `frequencies.db` for the language**, built by
`scripts/reference/` — see its README, and Appendix A for the schema they must
have. They are large (Latin's dictionary is 474 MB) and are never committed;
they are needed to *build* a pack's lemma map and citations, and for nothing
afterwards. Everything from step 5 on is blocked without them, so build them
early. You will also need a plain-text corpus of the language for the frequency
list — Project Gutenberg or Perseus — in the dialect the pack means to teach.

**A prompt language.** Only English ships an adapter
(`packages/core/src/l1/english.ts`). A pack can name another in `profile.l1`,
and the vocabulary crib will then return unpaired rows rather than wrong ones —
honest, but a visibly poorer app. Writing a second adapter is real work; treat
it as its own project.

---

## 2. Decide the fold — before anything else

The fold decides whether a written answer is marked right. It also keys the
dictionary index, the `lemmas.json.gz` map and every saved vocabulary card id.
Changing it later invalidates all four, so it is the first decision and
effectively a permanent one.

Getting it wrong is silent. An over-eager fold marks wrong answers right
forever, and nothing else in the test suite notices. That is why a pack ships
fixtures in *both* directions.

```jsonc
// languages/ancient-greek/fold.fixtures.json
{
  "equal":  [["λόγος", "λογος"], ["ἄνθρωπος", "ανθρωπος"], /* ≥20 from real text */],
  "differ": [["λόγος", "λόγου"], ["πόλις", "πόλεως"], /* ≥20 — base letters differ */]
}
```

Put a pair under `differ` only if the fold you chose really keeps it apart. An
earlier draft of this file offered `["ἀγορά", "ἁγορά"]` as a must-differ pair
and variant A folds it equal — breathings are inside `̀-ͯ` and get
stripped with everything else. Fixtures are cheap to write and the gate will
tell you which side a pair belongs on; guessing puts the pack's own documented
behaviour at odds with itself.

### What Greek has to decide

Three defensible positions, all expressible. Pick one, and write down why.

```jsonc
// A — accents are editorial. The student types from a keyboard and an accent
//     is the commonest thing to get wrong. Recommended for a tutor.
"fold": { "trim": true, "caseFold": "lower", "decompose": "NFD",
          "stripMarks": ["\\u0300-\\u036f", "\\u0342", "\\u0345"],
          "map": [["ς", "σ"]], "recompose": "NFC" }

// B — accents and breathings are significant; only final sigma folds.
"fold": { "decompose": "NFC", "stripMarks": [], "map": [["ς", "σ"]], "recompose": "NFC" }

// C — strip the accents, keep the breathings, because ἀ- and ἁ- are different
//     words. Note the absence of ̓ and ̔.
"stripMarks": ["\\u0300", "\\u0301", "\\u0342", "\\u0304", "\\u0306"]
```

Three things that are not optional:

- **`decompose: "NFD"` is mandatory if you strip anything.** Polytonic Greek
  ships precomposed (U+1F00–U+1FFF); nothing reaches the marks until it is
  decomposed.
- **`map: [["ς", "σ"]]` is required in every variant.** `caseFold` lowercases
  `Σ` to `ς` word-finally, so without the map a word compares unequal to itself
  depending on where it sat in the sentence.
- **`recompose: "NFC"`.** The web app bisects `forms.txt` by UTF-16 code unit,
  and a mixed NFC/NFD index sorts inconsistently and misses.

Latin sets `recompose: "none"` — after stripping the macrons there is nothing
left to recompose, and "none" is what reproduces its historical keys exactly.

**Gate A.** `node --import tsx scripts/validate-pack.mjs --pack languages/ancient-greek --profile-only`
— A1 wants ≥5 must-equal and ≥3 must-differ pairs; aim well past that. Then
**Gate D2** once the databases exist: the fold must reproduce
`dictionary.db.form_norm` exactly. This is the invariant that spans both
repositories, and the one that breaks everything silently when it is violated.

---

## 3. Write `profile.json`

Copy `languages/latin/profile.json` and work through it. `parseProfile` rejects
unknown keys, so a typo fails at startup rather than defaulting quietly.

| Field | Latin | Greek would say |
|---|---|---|
| `id` | `latin` | `greek` — the directory name |
| `l2` | Latin / Latina / latn / ltr | Greek / Ἑλληνικά / grek / ltr |
| `families` | Bennett's nine | Smyth's parts: accidence split into nouns/adjectives/pronouns/verbs, then the syntax chapters, then particles |
| `fallbackFamily` | `style` | whichever is the catch-all |
| `grammar.idPrefix` | `bn` | `sm` |
| `grammar.refPrefix` | `§ ` | `§ ` |
| `grammar.paradigmLabels` | nom/gen/dat/acc/abl/voc/loc, sing/plur, 1st/2nd/3rd | nom/gen/dat/acc/voc, sing/**dual**/plur, 1st/2nd/3rd — Greek has a dual and Latin has an ablative |
| `grammar.headingPattern` | `^[A-Z][A-Z .,'’—-]*\.?$` | `^\p{Lu}[\p{Lu} .,'’—-]*\.?$` with `headingFlags: "u"` |
| `citationsVersion` | 2 | 1 to start; bump whenever `citations.mjs` changes what a citation says |
| `storage.*` | today's `latin-*` keys, pinned | **must differ from every other pack** |
| `grammarShape`, `coverage` | the gate thresholds | start from Latin's and adjust once you have measured |

**Family order is permanent.** `PlacementRun.familyIndex` is a position in this
list, so reordering a shipped pack's families resumes a saved placement against
the wrong one.

**Gate:** `validate-pack --profile-only` passes.

---

## 4. Split the grammar into small, self-contained topics

**This is the step everything else rests on.** The map is drawn from these
topics, placement bisects them, and every generated question is about one of
them. A parser that runs twenty sections together produces a topic no set of
questions can cover; one that drops sections silently produces a syllabus with
holes nobody can see.

Write `languages/<name>/grammar/parse.<ext>`. The input can be anything —
Bennett is Gutenberg HTML and Smyth is TEI XML, so both parsers read `<p>` and
`<table>` nodes rather than looking for columns of spaces. Nothing downstream
knows or cares.

Prefer a marked-up edition over a plain-text one wherever the book has both.
Bennett was parsed from Gutenberg's plain text until 2026-07-30, and the cost
was structural: in fixed-width output a table cell wraps across physical lines,
so a parser reading a line as a row truncates the cell at the column edge and
leaves the remainder as a loose line. The table of correlatives in §140 arrived
as four fragments with its first heading cut down to "RELATIVE AND". No
downstream cleverness recovers that; only the markup does.

### The output contract

`content/grammar.json`, an array of:

```jsonc
{ "id": "sm-203-first-declension",   // <idPrefix>-<3-digit first section>-<slug ≤40, cut at a word boundary>
  "ref": "203-210",                  // the book's own citation
  "title": "First declension",
  "family": "accidence-nouns",       // one of profile.families
  "order": 1240,                     // strictly increasing across the pack
  "text": "…"                        // the whole run, flattened
}
```

Seven rules, all of them learned the hard way:

1. **A topic is a run of consecutive sections under one heading.** The book's
   own structure is the syllabus. Do not invent a taxonomy.
2. **Never truncate.** The whole run goes in `text`; the reader pages through
   it. What the parser drops, the student can never read.
3. **Flatten paradigm tables, do not discard them.** One row per line, cells
   separated by **exactly two spaces** — and never two inside a cell, since the
   gap is the only thing saying where a column begins. That is what
   `parseBlocks` reconstructs the table from, and gate G6 checks that every
   row-shaped line comes back. A row the source set across every column — a
   mood, a tense, a caption — is prefixed `⟦=⟧`; it becomes a divider that
   stays inside the table instead of prose that splits it in two.
4. **Keep the emphasis, if the source has any.** Wrap each stretch in
   `⟦b:…⟧` or `⟦i:…⟧`; double a literal `⟦` or `⟧`. A reference grammar means
   something by its type — Bennett bolds the *ending* inside each form and
   italicises the English gloss — and a paradigm stripped of it is a list of
   words with nothing marking which part is the lesson. The brackets contain no
   space, so they cannot invent a column, and every classifier reads the line
   with them removed. Emitting none is fine: Smyth does, and its topics render
   exactly as before.
5. **Small.** Under `grammarShape.minTextChars` is too thin to teach; over
   `maxTextChars` should be split at a sub-heading rather than shipped as a wall.
6. **Unique titles.** Reference grammars reuse headings across parts — Bennett
   needed 17 hand-written overrides for exactly this, and Smyth will need its
   own. A duplicate title is an unnavigable map, and G5 fails on it.
7. **Account for every source section.** Also emit
   `content/grammar-coverage.json`: each source section is either `assigned` to
   a topic or `dropped` with a stated reason, and the two must add up. Nothing
   may merely disappear. (Latin: 376 sections = 325 assigned + 51 dropped, 39
   for being in a part that cannot carry a translation exercise and 12 for being
   structural headings.)

### Gates

```bash
node --import tsx scripts/grammar-report.mjs --pack languages/ancient-greek
```

G1–G8 must be green: topic count, no empty topic, a sane size distribution,
every family populated and none dominant, ids and titles distinct, every
paradigm row recovered, every topic renders as something, and the section
account balances. The report also *notes* topics over four times the median —
those are the ones no single test set can cover, so either split them or decide
deliberately not to.

**G9 is a human gate and cannot be automated:**

```bash
node --import tsx scripts/grammar-report.mjs --pack languages/ancient-greek --sample 12 --render
```

Read all twelve, as the student would meet them. Does each stand alone? Did the
tables survive with the endings under each other? Is the title the topic's own?
Record the verdict, the date and the sampled ids in the pack's `REVIEW.md`. An
unsigned gate is an unchecked gate.

---

## 5. Build the dictionary

```bash
node --import tsx scripts/build-lemmas.mjs --pack languages/ancient-greek \
  --ref $LANG_REF --max-rank 25000
```

This makes two files — `content/lemmas.json.gz`, the distinct lemma entries, and
`content/forms.txt.gz`, a sorted `form\tidx[,idx…]` index over them. Together
they are folded form → ranked lemma candidates; they are split because the map
they replaced repeated a gloss under every form and inflated to 116 MB for a
third of the words a pack now ships. Both apps bisect the index in place
(`@lang-tutor/core`'s `LemmaIndex`), so neither ever builds the big object.

**Ship every word the dictionary has, with a gloss.** Not only the words your
corpus attests. `build-lemmas` does this by default: the *ranked* half is the
frequency list joined against the dictionary, and the *tail* is every other
lemma entry, unranked and briefly glossed. `--max-rank` sets how far down the
frequency list the ranked half goes — pass more than the list is long.

This matters more than it looks. A frequency list is a corpus, and a corpus is a
few works; Latin's is seven. Ship the ranked half alone and a student who meets
a perfectly ordinary word those authors happened not to use is told it is not a
word. That is what happened with `reste`, and nothing in the pipeline complained
— every gate was green. `scripts/reference/README.md` has the full account under
"How much to ship"; the short version is that the tail costs about 2 MB gzipped
on a download that already happens once, and carries no `rank`, which is what
keeps the attestation gates exactly as strict as they were.

**Gate C.** Tokenise a page of real text in the language and check the share
that resolves — aim for ≥95% for a modern language, ≥90% for an ancient one. If
coverage is thin, fix it here: every real-but-unattested form becomes a rejected
sentence in step 7, and a weak dictionary quietly strangles generation.
`validate-pack` also prints the top 20 by frequency — read them. If they do not
look like the commonest words of the language, the corpus or the lemmatiser is
wrong, and nothing downstream can be trusted.

Coverage here means the *ranked* half: C5 asks whether a generated answer token
is a word the pack teaches, and it deliberately does not count the tail. A thin
ranked half is still a real problem however many words the tail holds.

---

## 6. Teach it to cite a word

`languages/<name>/citations.mjs` rewrites the plain headwords from step 5 into
what a dictionary actually prints. This is irreducibly per-language:

- **Latin** — verbs by four principal parts (`amō, amāre, amāvī, amātum`),
  adjectives by their termination count (`fortis, forte`; `fēlīx, fēlīcis`).
- **Greek** — nouns by nominative + genitive + article (`ὁ λόγος, τοῦ λόγου`),
  verbs by principal parts, adjectives by three terminations.
- **Russian** — verbs by aspect pair, nouns by gender + genitive.
- **German** — verb, preterite, participle; nouns with article and plural.

Run it `--dry` first; it reports what it would change without writing. Then bump
`profile.citationsVersion`, which is what makes already-saved vocabulary cards
catch up on next launch.

A pack that skips this step still works — the citation is just the headword —
so it is a reasonable thing to defer and come back to.

---

## 7. Generate the questions, aiming at exhaustive coverage

**The second step everything rests on.** Attestation is a strong gate and a
narrow one: it proves every word of an answer exists, not that the sentence is
grammatical or that it means what the prompt says.

Write `languages/<name>/gen/config.mjs`. Copy Latin's and replace:

- **`rules`** — the prompt. Say the language, say what a good sentence looks
  like, and say that `vocab` must list every inflected form exactly as written,
  because those are what get checked.
- **`band`** — which frequency ranks seed the vocabulary. Latin uses 400–6000:
  below that is function words the student already has, above it is where a
  reference grammar's own examples stop going.
- **`functionWords`** — indeclinables your `dictionary.db` has no `forms` row
  for. **Verify each one absent; do not guess.** A test is dropped when any word
  fails, so a topic *defined* by such a word loses everything. Optative
  subjunctive and temporal clauses each scored a literal 0 out of 72 before
  Latin's list was extended.
- **`properNounExemption`** — `"mid-sentence-capital"`, or `"none"` for a script
  with no letter case. Note what the rule is *not*: exempting every capital
  would wave through the first word of every answer.
- **`target`** — how many tests a topic wants, as a function of its size.

Then:

```bash
node --import tsx scripts/gen-tests.mjs --pack languages/ancient-greek --plan   # what would it do
node --import tsx scripts/gen-tests.mjs --pack languages/ancient-greek          # topics with nothing
node --import tsx scripts/gen-tests.mjs --pack languages/ancient-greek --fill   # top everything up
node --import tsx scripts/gen-tests.mjs --pack languages/ancient-greek --only-thin
node --import tsx scripts/gen-tests.mjs --pack languages/ancient-greek --jobs 1  # one topic at a time
```

Two topics are written at once; `--jobs N` sets the number, and `--jobs 1` is
the serial run to fall back to when a usage limit is already being felt.

Every run is resumable and appends, so a usage limit costs nothing but time.
Resuming is **by count against the target**, not by whether a file exists —
which is the bug this replaced, where a topic that yielded three tests against a
target of twelve was skipped by every run thereafter.

**The limit is the constraint, not the clock.** Greek wants 6,957 tests across
485 topics, and the obvious speed-up — shard the topic list and run several
processes at once — does not work: five parallel runs each managed three to five
topics, hit the account's usage limit, retried five times and stopped. They
spent the budget five times faster rather than finishing five times sooner.
Parallelism helps only if the limit is not what you are up against; otherwise
run one, let it stop, and rerun it when the limit resets. A wrapper that reruns
`--fill` until `--plan` reports nothing left turns "it stopped" into "it
finished" without anyone watching.

A pack this size is not a single sitting. If you need it shippable sooner, the
lever is the target rather than the throughput: `coverage.minTestsPerTopic`
tests per topic is what C1 and C2 actually require, which for Greek is 2,910
tests instead of 6,957. Ship at the floor and top up with `--only-thin` later.

### Gates

```bash
node --import tsx scripts/coverage-report.mjs --pack languages/ancient-greek
```

C1 every topic has questions · C2 none below the floor · C3 no family starved ·
C4 no duplicated prompts · C5 answer tokens attested · C6 the generator is not
fighting the validator · C7 the frequency band actually exercised.

The report also lists topics below their size-scaled target — that list is the
work queue for `--only-thin`.

**C8 is a human gate.** Read 30 items, stratified across the families. Aim for
≥28. The failure to look for is not a wrong word; it is a perfectly attested
sentence that means something other than the English beside it. Attestation
cannot see that, and neither can any of C1–C7. Record it in `REVIEW.md`.

---

## 8. Wire the build

Give the pack an `icon.mjs` — the glyph, either of two ways. `capsules` is
round-capped strokes in a 0..1 box, which is right for a letterform that is
essentially pen strokes (Latin's Ā is four of them). `path` is SVG path data,
filled even-odd and fitted to the icon box for you, which is right for anything
with a bowl or a counter in it: one weight of stroke cannot draw Ω, and a Ω
stitched out of capsules looks stitched. Greek's `icon.mjs` is four lines,
because it imports the Ω its own `confetti.mjs` already draws — the same letter
in the launcher and in the burst.

Give it a `confetti.mjs` too — the shapes this language throws every ten to
twenty answers. A shape is a stack of layers, `[paint, path]`, painted back to
front, each SVG path data in a 24x24 box:

```js
scutum: [
  ["blood", "M6.2 2.0 … Z"],   // the board
  ["gold",  "M11.5 10.2 … Z"], // the wings on it
],
```

Every layer is filled with fill-rule evenodd, so a subpath drawn *inside*
another **within one layer** reads as a hole — that is how a shield's boss or a
wheel's hub is cut. Across layers there is no such rule: a later layer simply
covers the one beneath. Reach for a second layer before reaching for a hole.

Paints are names, resolved through the `palette` at the top of the file, so the
pack's colours are tuned in one place. Pick them to be read rather than to be
accurate — the point is that a leaf is green and a hull is not the colour of its
oars. `throws` groups the names that may share one burst; a group of one is a
burst of only that shape, and the choice is uniform over groups, so a shape
listed twice shows up twice as often.

Draw them at 40px, then look at them at 17px, which is the size they are thrown
at; anything that needs its fine detail to be recognized will not survive. The
playground under Settings shows both at once — see `apps/web/src/confetti/`.
`pack.test.ts` calls `checkConfetti` from `scripts/lib/confetti.mjs`, which
fails on a paint or a shape name that is not there.

```bash
LANG_PACK=ancient-greek pnpm --filter @lang-tutor/web build
pnpm cli -- --language ancient-greek
```

**Check the storage strings differ from every other pack.** Two packs served
from one origin share `localStorage`, so identical keys mean two languages
writing over each other's progress. The dictionary cache name must differ too.

---

## 9. The ship gate

```bash
node --import tsx scripts/validate-pack.mjs --pack languages/ancient-greek \
  --built apps/web/public/content --require-ref
pnpm -r test
node scripts/check-core-purity.mjs
git diff --stat packages/core          # must be empty
```

`--require-ref` is the difference between this and what CI runs. The reference
databases are not in this repo, so CI cannot check the fold against them and
says those gates were skipped. You *can*, and before shipping a pack you must:
a fold that disagrees with the dictionary it was built against misses every
lookup while both halves look perfectly healthy on their own.

That last line is the real test of the whole exercise. If `packages/core`
changed, the change is a missing interface: put it on the profile, backfill it
into Latin, and note what the abstraction had missed.

### Shipping before the questions are done

A pack's syllabus finishes long before its question set does, and the two are
worth deploying on different days. `--allow-incomplete` reports the coverage
gates without letting them set the exit code:

```bash
node --import tsx scripts/validate-pack.mjs --pack languages/ancient-greek \
  --built apps/web/public/content --allow-incomplete
```

It relaxes nothing about correctness — the fold, the families, the syllabus, the
dictionary invariant and every question that *has* been written are all still
gates, and a pack with a real defect fails with the flag exactly as without it.
In CI, `LANG_PACKS_DRAFT` names the packs that get it. Empty that variable when
the set is finished, and say in `REVIEW.md` that C8 is unsigned until someone
has actually read thirty items.

Then record what the pack measured in `BASELINE.json`, so the next run can see
whether a number moved rather than only whether it still clears a threshold.

---

## Appendix A — the reference database contract

Built by `scripts/reference/` (see its README) into
`languages/<pack>/reference/`, and resolved from `--ref`, then `$LANG_REF`.
There is no fallback path: the dictionary is either pointed at or absent, and
absent is a supported state.

**Most things do not need it.** The gates, both reports and `gen-tests` answer
from what the pack ships — `content/lemmas.json.gz` for attestation and
`reference/frequency.tsv.gz` for the vocabulary band — which is why they run in
CI and on any machine. On Latin the shipped map attests 98.4% of generated
answer tokens where the dictionary manages 94.4%, because a Wiktionary dump is
built around inflected forms and misses common indeclinables.

Two things do need it, because they are what *builds* the shipped map:
`scripts/build-lemmas.mjs` and the pack's own `citations.mjs`. Both refuse to
run without it and say so. `--require-ref` makes `validate-pack` insist on it
too, which is what a human shipping a pack wants and not something CI can ask
for.

```sql
-- dictionary.db      (Latin: 885,996 entries / 2,492,884 forms)
CREATE TABLE entries (
  id        INTEGER PRIMARY KEY,
  word      TEXT NOT NULL,   -- headword as printed, fully accented
  word_norm TEXT NOT NULL,   -- MUST equal fold(word) under profile.fold
  pos       TEXT,            -- noun, verb, adj, adv, name, num, pron, prep, conj, …
  data      TEXT NOT NULL);  -- JSON: {"senses":[{"gloss":"…","tags":["declension-4","feminine"]}]}

CREATE TABLE forms (
  form      TEXT NOT NULL,   -- inflected form as printed, fully accented
  form_norm TEXT NOT NULL,   -- MUST equal fold(form)
  tags      TEXT,            -- lowercase, ALPHABETICALLY SORTED, comma-joined, no spaces
  entry_id  INTEGER NOT NULL REFERENCES entries(id));

CREATE INDEX idx_forms_norm   ON forms(form_norm);    -- hit once per generated token
CREATE INDEX idx_forms_entry  ON forms(entry_id);
CREATE INDEX idx_entries_norm ON entries(word_norm);

-- frequencies.db     (Latin: 19,342 lemmas, ranks dense 1..N)
CREATE TABLE frequency (
  lemma      TEXT NOT NULL,
  lemma_norm TEXT NOT NULL,  -- fold(lemma)
  pos        TEXT,
  count      REAL NOT NULL,
  rank       INTEGER NOT NULL);   -- 1 = most frequent, dense, no gaps

CREATE INDEX idx_freq_rank ON frequency(rank);
```

The sorted-tags rule exists because a citations module matches some tags by
whole-string equality (`tags = 'infinitive,present'`) and others by membership.
A pack with different conventions writes its own queries; only the schema and
the tag format are the contract.

**The invariant that matters most:** `form_norm`, `word_norm` and `lemma_norm`
must be produced by the *same fold the pack declares*. If they drift, every
lookup misses while both halves look perfectly healthy on their own. Gate D2
checks exactly this — against 40,000 sampled dictionary rows when `--ref` is
given, and otherwise against every key of the shipped lemma map and every row
of the committed frequency list, which were written by the same pipeline.

The distilled list the repo commits is `reference/frequency.tsv.gz`: rank,
lemma, `lemma_norm`, pos, tab-separated and gzipped, ~200 KB. Produced by
`scripts/make-reference.mjs`, and `--check` re-derives it to confirm the
committed file is still the one the database yields.

---

## Appendix B — when something is wrong

| Symptom | Almost always |
|---|---|
| Every dictionary lookup misses; the app looks fine | The fold and `form_norm` disagree (D2), or `lemmas.json.gz` was built under a different fold. The web app refuses to start on a fold-digest mismatch; the CLI will not. |
| A family renders as a dead bar on the map | It has no topics — G4. The grammar parser's family assignment is wrong for that part of the book. |
| The generator rejects almost everything | The function-word list is short (C6). Query `dictionary.db` for the indeclinables of the topics scoring zero and add the ones genuinely absent. |
| A paradigm reads as a run-on sentence | The parser did not separate the cells with exactly two spaces — G6. |
| A table breaks in half around a stray one-word paragraph | A cell wrapped across lines in the source, or a full-width caption was not marked `⟦=⟧`. |
| Answers marked right that are wrong | The fold is too aggressive. Add the pair to `fold.fixtures.json` under `differ` and watch it fail. |
| A topic is enormous and its questions feel repetitive | It is over 4× the median (noted by `grammar-report`). Split the run. |
| Two languages overwrite each other's progress | Their `profile.storage` keys are the same. They must all differ. |
