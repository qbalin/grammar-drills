# Latin pack — human review record

Two of the gates cannot be automated, because they are about whether the thing
reads well rather than whether it parses. They are recorded here so a later run
can see what was actually looked at, by whom, and when — an unsigned gate is an
unchecked gate.

## G9 — grammar segmentation read-through

Every topic is shown to the student verbatim, so what the parser mangles the
student meets mangled, and what it drops the student can never read.

```
node --import tsx scripts/grammar-report.mjs --sample 12 --render
```

Read all twelve. The questions to hold in mind:

- Does the topic stand alone, or does it only make sense next to its neighbour?
- Did the paradigm tables survive as tables, with the endings under each other?
- Is the title the topic's own, or a heading that belongs to the section above?
- Is anything obviously missing in the middle?

| Date | Reviewer | Sampled ids | Verdict |
|---|---|---|---|
| — | *not yet signed off* | — | The automated gates G1–G8 pass. The read-through has not been done for this pack; it inherits a syllabus that was in use before the gates existed. |
| 2026-07-30 | *not signed off — machine check only* | §13-15, §71-75, §92-96, §101-102, §115, §120-123, §140, §162, §205-212, §242, §266-269, §273, §282-290, §336-337 | The reparse from HTML was checked by rendering, not by a reader. §140 (the table of correlatives) is whole and three-columned where it used to arrive as four fragments with its first heading cut down to "RELATIVE AND". Paragraph fragments of twelve characters or less — the signature of a cell that wrapped in the source — fell from 136 to 49, and the 49 that remain are the book's own short sub-headings ("ā-Stems.", "Here belong—"). Still wanted from a human: whether the merged topics read as one topic, and whether the new titles are the book's. |

## C8 — generated question review

Attestation proves every word of an answer exists. It does not prove the
sentence is grammatical, idiomatic, or a translation of the English beside it —
so 30 items, stratified across the families, get read.

Aim for ≥28 of 30. The failure to look for is not a wrong word; it is a
sentence that is impeccably attested and means something other than the prompt.

| Date | Reviewer | Sample | Verdict |
|---|---|---|---|
| — | *not yet signed off* | — | The automated gates C1–C7 pass on 6,557 questions. 2,532 of these were generated on 2026-07-29 across three backfill runs and have had no human read-through; the 4,025 that predate them were reviewed before the gates existed. This is now the largest unreviewed block in the pack and the most useful thing a next run could do. |

## C9 — quoted question review

A quoted question fails differently from a generated one. The Latin is not in
doubt: it is what a classical author wrote, and `scripts/verify-attribution.mjs`
checks a sample of it against `reference/texts/`, which is text nobody in this
repo produced. What no gate can check is the two things wrapped around it —
whether the English prompt is a fair and reachable target for that exact
sentence, and whether the attribution is the right one.

The second is the one that matters, and it is the reason this row exists.
A sentence credited to the wrong author is a lie that every automated check in
the tree passes, because every one of them is measuring self-consistency.

Aim for ≥28 of 30, sampled across authors rather than across topics — the
failure mode follows the citation parser, not the syllabus.

| Date | Reviewer | Sample | Verdict |
|---|---|---|---|
| — | *not yet signed off* | — | 885 quoted questions from two pools, and nothing has been read by a person. Sample across **authors and across pools** — the dump's prompts were written by a model, A&G's are the book's own glosses, and they fail in different ways. |

### What Allen & Greenough was made to prove first

A&G was put through the test below before a line of its pipeline was written,
because it is the same kind of source that Bennett's index turned out not to be:
a grammar, citing loci, printing sentences it says are somebody else's.

It passed. Against `de Bello Gallico` I–IV — all the corpus held at the time — 50
surviving sentences, asking what fraction of A&G's words appear in Caesar in
order: 34 at 90% or better, 15 between 65% and 90%, and one below, which is A&G's
own ellipsis correctly marking an omission. Bennett's index scored 4 of 54 on the
same author. A&G abridges, as Smyth abridges. It does not recast.

`verify-attribution.mjs` then measured the shipped questions against a corpus
widened to what these citations actually name — all of Cicero's cited works,
Livy, Sallust, Tacitus, and `de Bello Gallico` entire: **561 confirmed of 750
checkable (74.8%), 0 contradicted**, and 557 of the 561 found in the *work* cited
rather than merely somewhere in the author. Greek sits at 80.7% with Smyth.

That corpus is not `reference/texts/`, deliberately. That directory is also what
`ingest_frequency.py` ranks into the committed `frequency.tsv.gz`, so widening it
to settle an attribution would quietly move what the pack calls a common word.
`verify-attribution.mjs --texts <dir>` keeps the two apart.

### Why the filing is per section and not per sentence

The first run asked a model to place each of 593 sentences on its own. Nothing
about that is checkable by a gate, and it was wrong often enough to matter.

Shown a bare sentence, a model has only its surface, and the surfaces collide:
`Quid ipse sentiam expōnam` and `Exspectās fortasse dum dīcat` are both a
subordinate clause with a subjunctive verb. So sentences drifted toward whatever
topic matched the shape. A&G §485 (sequence of tenses), §592 (implied indirect
discourse) and §449 (the future imperative) all landed under temporal clauses,
and the sentences of **64 of 147 A&G sections were scattered across two Bennett
topics or more, up to seven** — which is impossible if the filing is right,
because a section illustrates one construction.

The information that fixes it was never passed in. A&G prints each sentence
*under a section that explains the construction*, so the section is the unit
that carries the answer. Asking once per section, with A&G's prose attached:
scatter fell to 6 of 147, §485 went to `bn-266`, §592 to `bn-323`, §449 to
`bn-271`, and the whole pass cost 6 model calls instead of 24.

The residue is the honest part. Sections A&G writes about one thing and Bennett
splits across two are the 6 that still scatter, and they are in the map to be
read rather than argued with.

### What was already ruled out, so it is not tried again

**Gildersleeve & Lodge, and every scan of it there is.** Measured 2026-08-10.
It is the obvious third source — denser in citations than A&G, and strongest on
exactly the stylistic material A&G skims — and it cannot be read. There is no
clean digitization anywhere: not Gutenberg, not Perseus, not GitHub. Alpheios
holds two grammar repos in total, `grammar-smyth` and `grammar-allen-greenough`,
and the pack already uses both.

What is left is OCR of the scans, and the Internet Archive epub states its own
verdict on all 558 pages: median **24% accurate**, and not one page above 28%.
Held to the measure this pack judges a source by — what fraction of its Latin
the shipped index attests:

| source | token attestation | runs fully clean |
|---|---|---|
| A&G, the Alpheios HTML | **97.7%** | what ships |
| G&L `gildersleeveslat00gildrich`, the best scan | 82.2% | 30% |
| G&L `gildersleeveslat00gilduoft` | 80.6% | 38% |
| G&L `gildersleevesla03lodggoog` | 59.9% | 6% |

`T5 ab eo libero` for `Tē`, `Ab ilia exoludor` for `illa excludor`. This is the
failure that took the *Sintassi normativa* scan off the table on the same day
and for the same reason: the substitutions land on real Latin words, so the
corruption passes attestation and `verify-attribution` files it under the
harmless `not-found`. No gate in this tree sees it. The citations are damaged
too — `Lad.` for `Lael.` — so it cannot even be used as a finding aid with the
text pulled from a corpus; 76 parseable citation runs came out of a book that
prints thousands.

Re-OCR with a modern engine is the only route, and it is a project rather than
an afternoon. Anything below roughly 95% attestation should be assumed to be
this same trap and measured before a line of pipeline is written for it.

Bennett's back index — "INDEX OF THE SOURCES OF THE ILLUSTRATIVE EXAMPLES
CITED IN THE SYNTAX" — was built, measured and abandoned on 2026-08-07. It
parses cleanly (130 sections, 531 entries, 110 abbreviations once continuations
are filed under the joint key the index cites them by), and a matcher on
section-plus-opening-words with a bijection rule, an ordinal-monotonicity rule
and a 50%-per-section floor attributed 424 of them, 80%, over 48 topics. Every
filter engaged. It looked like a success and was not one.

Corroboration against `reference/texts/` is what caught it. On Caesar, whose
*de Bello Gallico* is present in full, 4 of 54 attributions matched verbatim,
and an order-free check — all the distinctive words inside any 40-word window —
still failed 38 of 65. Two cases say why:

- `Orgetorīx Helvētiīs persuāsit`, filed under *B.G.* i, 2. Caesar wrote
  `Orgetorix ... civitati persuasit`; the two words do not co-occur within 40
  words anywhere in the work.
- `oppidum prīmum Thessaliae venientibus ab Ēpīrō`, filed under *B.G.* iii, 80.
  That is *de Bello Civili* 3.80.

The index title is exact if read literally. It names what each illustration was
*drawn from*; Bennett wrote the sentences, abridging and recasting. Attributing
them would manufacture quotations. The general lesson is worth more than the
particular one: a matcher's own filters cannot tell you its premise is wrong,
because they measure self-consistency, and a source that is internally
consistent and externally wrong passes all of them.

## Where the next attested sentences would come from

Measured 2026-08-10, after the A&G run. The pack is **889 attested of 7,470
questions, 11.9%**, over 50 of 114 topics. What the distribution says is that
both pools are syntax-shaped, and for the same reason: a grammar quotes an
author where construction matters and drills paradigms where form matters.

| family | topics | with attested | attested | generated | % |
|---|---|---|---|---|---|
| noun-syntax | 18 | 13 | 301 | 995 | 23% |
| verb-syntax | 28 | 20 | 461 | 1,715 | 21% |
| adj-pron-syntax | 13 | 5 | 75 | 524 | 13% |
| style | 12 | 4 | 24 | 559 | 4% |
| particles | 3 | 1 | 3 | 123 | 2% |
| pron | 9 | 2 | 7 | 342 | 2% |
| verb-forms | 17 | 3 | 12 | 1,410 | 1% |
| adj | 5 | 1 | 3 | 385 | 1% |
| nouns | 9 | 1 | 3 | 528 | 1% |

**The inflection families are a permanent zero and that is correct.** Nobody
quotes Cicero to teach the fourth declension. Some 2,300 questions across
`verb-forms`, `nouns` and `adj` will stay generated whatever is done here, and
chasing them is the wrong work.

Three things are worth doing, in this order.

**1. A&G's phrases, for the topics where a phrase is the construction.** The
largest lever by a distance. Dropping the sentences-only rule takes the A&G pool
from 592 to **1,248** and adds 25 sections to the map (about one model call):

| relaxation | pool | gain |
|---|---|---|
| today | 592 | — |
| allow phrases, `--min-words 2` | 1,248 | +656 |
| …and verse as well | 1,497 | +249 more |

Phrases were excluded on purpose and the reason still holds for clause topics —
`ā māgnō dēmissum nōmen Iūlō` is a fragment, not an exercise. But that is not
what the bucket mostly holds. `Ariovistī mors` → *the death of Ariovistus*,
`potentia Pompêī` → *Pompey's power*: for the case topics these are the
canonical drill, because the case lives in the phrase and A&G teaches it that
way. The rule that follows is one line, keyed on data already present — allow a
phrase when the section's mapped topic is in `noun-syntax` or
`adj-pron-syntax`, require a sentence everywhere else. That aims the gain at the
two families sitting at 23% and 13%, and leaves `verb-syntax` alone.

Watch C3 if it is taken: `noun-syntax` would go from about 72 questions/topic to
about 94 against a pack mean near 69 — a ratio of 1.36, inside the 2× ceiling,
but it is the gate that notices first.

**Leave verse off.** The +249 is real and the reason for refusing it has not
changed: hexameter word order is not the model answer for a student writing
prose, which is the call `scripts/lib/quotes.mjs:109` already made for the dump.

**2. `style`, which neither pool reaches.** Four percent, and eight of its twelve
topics are at zero — word order, sentence structure, the peculiarities sections.
A&G is thin there and Gildersleeve is unreadable (above). The material is in
`reference/texts/` instead: 1.7M words of Cicero, Livy, Caesar and Tacitus that
are already verbatim and already attributable. What a grammar was supplying for
free is the one missing piece — which topic each sentence illustrates — so this
is `build-quote-pool.mjs`'s route pointed at real text rather than a dictionary
dump. It is the only unblocked path to those topics.

**3. Small change, seven topics.** Seven topics have one or two A&G sentences
and get nothing, because `minQuestionsPerTest` is 3 and a topic below it is
dropped whole — `bn-166-subject`, `bn-278-concessive-subjunctive`,
`bn-319-conditional-sentences-in-indirect`, `bn-324-subjunctive-by-attraction`
among them. Whether a two-question quoted test is worth having is a judgement
about the study loop, not about the pipeline, and it is cheap either way.

**Not worth doing: redistributing the second topic.** Only 24 of 592 records
name one, and no topic depends on being another's second choice. Measured and
empty.

## Known state

- **Latin quotes 889 questions over 50 topics, out of two pools.** 308 came from
  the dictionary dump through `build-quote-pool.mjs`, which is the run the next
  section is about. 581 came from Allen & Greenough through `ag-quotes.mjs` on
  2026-08-10. The two are additive and neither replaces the other: the dump
  reaches sentences no grammar prints, and A&G reaches the syntax the dump
  cannot be asked about.
- **A&G's half is filed by section, and the map is committed** at
  `grammar/ag-topics.tsv`. Filing sentence by sentence was tried first and
  abandoned — see below. Reading a row is the review: A&G's own words on the
  left, Bennett's topic on the right, 147 of them.
- **A topic's title is narrower than the sections it covers**, and this misled a
  review of the filing before it misleads another. `bn-292` is titled *Temporal
  clauses with the subjunctive* and spans Bennett §§292–300, which also hold
  substantive clauses of purpose, of result, with `quīn`, with `quod`, and
  indirect questions. An indirect question filed there is correctly filed. Judge
  a row against the topic's `ref` range and text, never against its title.
- Every one of the 114 topics is at or above its size-scaled target: 6 tests at
  the thinnest, 12 median, 63 at the largest. The coverage gap is closed.
- The 63 is a merge, not a windfall: §124-132 was six separate topics under the
  old parser and its six banks were carried onto one. A merged topic's drills
  were written against a narrower heading than the one they now sit under, which
  is worth a read even though every gate passes.
- Gate C6 (kept ratio) covers two of the three backfill runs. `gen-stats.json`
  is written when a run finishes, and the middle run was stopped by hand, so
  roughly 270 shipped tests have no rejection-rate data behind them. Writing
  those stats incrementally would close it.
- 41 distinct forms were accepted without a dictionary match across that run
  (the allowance is 2 per sentence). They are listed in `content/gen-stats.json`
  and are worth reading: a form that recurs is either a real gap in the
  dictionary or a word the generator invented.
- `content/lemmas.json.gz` **is now rebuilt** by `scripts/build-lemmas.mjs`
  (`--merge --drop-artifacts --max-rank 12000`) and no longer predates it. The
  map it replaced was missing `dum`, `tamen`, `iam`, `nam`, `tam`, `nunc`,
  `semper`, `inter` and `sub` outright, despite all nine being in
  `dictionary.db` under a matching part of speech. Unresolved answer tokens fall
  from 5.31% to 1.60%; the map goes from 242,746 keys to 353,557.
- **Citing nouns is part of that rebuild.** `citations.mjs` improved verbs and
  adjectives only, because the map had arrived with noun citations already in it
  from whatever built it before this repo could. The first real rebuild wrote
  3,842 bare headwords over them, so nouns and names are now derived here too —
  nominative, genitive, gender — and anything still underivable is cited by its
  part of speech (`et (conj)`), which is the convention the old map used. There
  are now **no** bare citations in the map, against 54 before, and no shared
  lemma's citation came out worse than the one it replaced.
- What is still unresolved is mostly **perfect participles** — `territi`,
  `polliciti`, `gauisi`, `deleta`, `mirati` — which have *zero* rows in
  `dictionary.db.forms`. No rank cutoff reaches them; only generated morphology
  would, which nothing here does.
- **Enclitics are looked through** now: `ēloquentiamque` resolves to
  `ēloquentia` via `profile.enclitics`, and only when the whole form resolves to
  nothing, so `neque` is still `neque`.

## Picking the Latin quotations back up

**What happened on 2026-08-07.** The third of the three outcomes this section
used to enumerate: the builder died with no artifact, and because it wrote only
at the end, ~105 minutes of answers went with it. The watcher left to finish the
deterministic half recorded two `started` lines and nothing else — it never had
a pool to work from. Latin was untouched, and `git status` was clean, which is
exactly the state that hides this.

**What was fixed before rerunning, on 2026-08-09.** `build-quote-pool.mjs` now
appends each answered batch to `content/.quotes.partial.jsonl` (gitignored) and
resumes from it, so a death costs the batch in flight rather than the run. Three
things about that file are load-bearing:

- It is keyed on each batch's **start index in the pool**, not on how many
  quotations have been filed. A batch files fewer than it consumes — topics come
  back empty, the post-marks attestation check still rejects — so a filed-count
  cannot locate a restart, and using one would file every later answer against
  the wrong sentences.
- Its header carries a fingerprint of the gathered pool. A resume whose gather
  does not reproduce that fingerprint **aborts** rather than guessing, because
  the gather is what the indices are relative to.
- A process killed mid-append leaves exactly one torn line, so the reader stops
  at the first unparseable record and re-asks that batch.

**Where it stands.** The state is on disk, not in a log: `quotes.jsonl.gz` exists
or it does not, and `.quotes.partial.jsonl` says how far a stopped run got.

- *The pool is there.* Compose with `quote-tests.mjs --from quotes`, run
  `verify-attribution.mjs` and `validate-pack.mjs`, read a dozen prompts against
  their answers, sign gate C9 above, update `BASELINE.json`, and commit.
- *Only the partial is there.* Rerun the same command; it picks up.
- *`verify-attribution.mjs` reports a contradiction.* **Do not ship it.** A
  contradiction is either a real misattribution or one ancient author quoting
  another — Augustine quotes Cicero at length and both are in
  `reference/texts/` — and the two are told apart by reading the passage it
  collided with, not by a threshold.

**What the run costs, so it can be judged before being repeated.** 18 calls,
roughly 4–6 minutes each and slowing, against the ~1,700 that generated the
existing Latin pack. Greek's half cost nothing at all.

**What it is filtered to, and why the numbers look small.** Of 944 usable
quotations, 439 survive: only those carrying *no* unattested form at all, and
needing at most two macron decisions. That is deliberate. Latin sits at
`maxUnattestedForms` 105/105 with no headroom, and the whole 944 would cost E2
553 tokens — a raise bought by a feature rather than by the content needing it,
which is the distinction `CLAUDE.md` draws between a budget and an excuse.

**Do not** run `prune-tests.mjs --generated` as part of this. Displacing
generated questions with quoted ones is a separate decision and has not been
made.
