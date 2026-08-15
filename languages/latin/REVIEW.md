# Latin pack — human review record

Three of the gates cannot be automated, because they are about whether the thing
reads well rather than whether it parses. They are recorded here so a later run
can see what was actually looked at, by whom, and when — an unsigned gate is an
unchecked gate.

**They are `H`-numbered, and that is new.** They used to be G9, C8 and C9,
sharing a namespace with the gates `validate-pack` runs — and C8 was taken by an
automated gate added later, the one measuring that `questionId` does not
collide. So "C8 passes" in a CI log and "C8 not signed off" on this page were
two unrelated statements about two unrelated things, and both appeared in
`CLAUDE.md` sixty lines apart. The dated rows below are left exactly as they
were written; only the headings and the prose move.

## H1 — grammar segmentation read-through  *(was G9)*

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
| — | *not yet signed off* | the 35 reading topics | 2026-08-12 shipped Parts I, IV and VI and the 12 definitional sections behind a structural heading, as 35 topics marked `readingOnly`. None of them has ever been read through: every earlier sample was drawn from a syllabus these were not in, and the automated gates have only just met the vowel tables of Part I and the metrical schemes of Part VI. The taught 114 are unchanged byte for byte and are not what this row is about. Worth a reader's eye first: §360-361 and §362-375, where scansion is row-shaped by accident and G6 counts it as table rows; and the short ones — §160 "Syntax" is 46 characters, §194 "The Genitive" 55 — which are real sections of the book but may read as stubs on the map. |

## H2 — generated question review  *(was C8)*

Attestation proves every word of an answer exists. It does not prove the
sentence is grammatical, idiomatic, or a translation of the English beside it —
so 30 items, stratified across the families, get read.

Aim for ≥28 of 30. The failure to look for is not a wrong word; it is a
sentence that is impeccably attested and means something other than the prompt.

| Date | Reviewer | Sample | Verdict |
|---|---|---|---|
| — | *not yet signed off* | — | The automated gates C1–C7 pass on 6,557 questions. 2,532 of these were generated on 2026-07-29 across three backfill runs and have had no human read-through; the 4,025 that predate them were reviewed before the gates existed. This is now the largest unreviewed block in the pack and the most useful thing a next run could do. |

## H3 — quoted question review  *(was C9)*

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
| 2026-08-11 | *not signed off — machine review only* | 36 Lane prompts, stratified across Cicero, Caesar, Livy, Tacitus, Sallust, Nepos and Pliny; plus a ten-check sweep of all 1,584 | **3 of the first 21 were defective and the defect was structural.** Lane sets its sub-item labels as `(<i>b.</i>)` immediately after an example, and the gloss joiner inherited from `ag-quotes.mjs` swallowed them, so `bewitched with Dion b.` and `why should I teach you your A B C's? b.` were on their way to a student as things to translate. Fixed by taking the sentence-ending mark as the gloss boundary, looked for on *both* sides of the tag; a fresh 15 read clean. The sweep found two more, in the Latin: a cross-reference to Lane's own §313 inside a quotation, and Lane explaining a word mid-sentence in parentheses. Both now go to an `annotated` bucket. **Still wanted from a human**: whether each English prompt is a fair and reachable target for that exact Latin. The attribution half is separately evidenced — 1,861 of 2,291 checkable confirmed against `.cache/attrib-corpus`, 0 contradicted. |

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

#### How to rebuild the attribution corpus, because the last one was lost

The corpus behind the 561-of-750 figure above is **not in this tree and not in
the snapshot manifest** — `reference/texts/` holds the seven frequency works and
nothing else, so a fresh checkout cannot reproduce that measurement. It was
rebuilt from scratch on 2026-08-11 for the Lane run, and the recipe is written
down here so the next person does not pay for it a third time.

It lives at `.cache/attrib-corpus/` — gitignored, so it survives between runs on
one machine and is never committed, never shipped, and never ranked.

    node --import tsx scripts/verify-attribution.mjs --pack languages/latin \
      --texts .cache/attrib-corpus

66 files, ~15 MB, one per **work**, named `<author-stem>-<work-slug>.txt`:
`cicero-in-verrem.txt`, `livius-ab-urbe-condita.txt`,
`caesar-de-bello-gallico.txt`. Per work rather than per author, and that is
load-bearing: `verify-attribution` counts a sentence as `not-found` only when the
cited *work* is on disk, so a corpus of `cicero-opera.txt` blobs empties the
denominator and reports 100% of nothing. The author stem has to share a token
with the cited author as `gen/sources.mjs` spells it — `livius` for
"Titus Livius", `sallustius` for "Gaius Sallustius Crispus".

Contents: all 54 of the Cicero works Lane and A&G cite, Caesar entire (*B.G.*
I–VIII and *B.C.* I–III), Livy I–X and XXI–XLV, Tacitus (*Annales*, *Historiae*,
*Germania*, *Agricola*, *Dialogus*), Sallust's two monographs, Quintilian, and
Seneca's letters. Absent and therefore `unchecked`: Nepos, the two Plinies,
Gellius, Suetonius, Columella, Cato — about 4% of what is cited.

Measured against the 889 questions shipped *before* Lane, it gives **685
confirmed, 0 contradicted, 144 not-found, 60 unchecked — 82.6% of 829
checkable**, with 683 of the 685 found in the work cited rather than merely
somewhere in the author. That is the same pools the 74.8%-of-750 line above
measures; the rate rose because the corpus is wider, not because anything about
the content changed.

The text came from The Latin Library, which is the pragmatic choice and not a
clean one: it is public-domain text with no licence statement and no stated
edition. That is tolerable *here* and nowhere else, because this corpus is a
measuring instrument that is never committed, never shipped, and never ranked
into `frequency.tsv.gz`. `PerseusDL/canonical-latinLit` (CC BY-SA 4.0, TEI) is
the right source the day this needs to be reproducible rather than merely
repeatable.

### What Lane was made to prove, and the one thing it got wrong

Lane went through the same gauntlet, in the same order, before its pipeline was
written. It is the third source and the first that is public domain outright.

**Token attestation, the G&L threshold.** 98.2% of the Latin in its
sentence-shaped examples is attested by the pack's own shipped index, against
A&G's 97.7% and the ~95% bar. Proofread rather than OCR is the whole of the
difference: Project Gutenberg #44653 is a Distributed Proofreaders transcription,
so there is no `T5 ab eo libero` in it.

**Quoting versus recasting, the Bennett test.** Run twice, and the second run is
the one that matters.

*First, against Caesar alone*, the only author `reference/texts/` holds in bulk.
175 of Lane's sentences are cited to *de Bello Gallico* I–IV; asking what
fraction of Lane's words appear in Caesar in order:

| | ≥90% | 65–90% | <65% |
|---|---|---|---|
| Lane | **150 (86%)** | 25 | **0** |
| A&G | 34 (68%) | 15 | 1 |

*Then against the whole rebuilt attribution corpus*, all 1,586 pool sentences by
`verify-attribution`'s own rule — any run of four tokens confirms, ten
contradicts:

```
   1235  confirmed        80.2% of the 1539 that could be checked  (want ≥70%)
      0  contradicted
    304  not-found
     47  unchecked
```

By author: Cicero 767 of 958, Caesar 244 of 310, Livy 163 of 193, Tacitus 30 of
39, Sallust 23 of 29. Nepos, Pliny, Suetonius and Gellius are `unchecked`
because the corpus does not hold them.

Lane abridges, as A&G abridges, and rather less. Bennett's index scored 4 of 54
on Caesar alone.

**The one real misattribution, and it is Lane's fault rather than the parser's.**
§2742 declares that a citation of figures alone is Caesar's Gallic War, and at
§1666 Lane breaks its own rule: the section is about Tacitus, and it prints
`rēgem Rhamsēn ... potītum`, `2, 60` with no author — meaning *Annals* 2.60, not
*B.G.* 2.60, and leaning on the sentence it had just written rather than on the
convention. Filed as printed it credited Tacitus's words to Caesar, and **every
automated check in this tree passes that**: the Latin is real, the Latin is
attested, the citation parses, and `verify-attribution` files the miss under the
harmless `not-found`. Corroboration against the corpus is what found it, which
is the lesson of Bennett's index arriving a second time.

The guard is in `gen/lane-sources.mjs` and is deterministic rather than clever:
book 2 of the Gallic War has 35 chapters, so `2, 60` is not a place in it and
cannot be filed under it. `BG_CHAPTERS` is the eight books' extents; a bare-figure
citation outside them is dropped, not guessed at. It costs three quotations and
took the sub-65% bucket to zero.

**What only reading twenty-one prompts caught.** Every gate was green and three
of the first twenty-one sampled were wrong, all the same way: Lane sets its
sub-item labels as `(<i>b.</i>)` immediately after the example they follow, and
the gloss joiner — which is right for A&G, and was copied from it — swallowed
them. `bewitched with Dion b.`, `council hall b.`, `your A B C's? b.` went into
the pool as prompts a student would be asked to translate. Nothing downstream
could see it: the Latin is untouched, the attestation is untouched, and a prompt
is only ever compared against itself.

A sweep of the whole pool for the shapes a sample can only spot-check turned up
two more, in the Latin rather than the English, and both were invisible for the
same structural reason — `clean()` reduces a token to letters before looking it
up, so a digit becomes the empty string and is waved through as `empty`, and a
parenthesis is punctuation. `quō factō ... animōs centuriōnum 313` carried
Lane's cross-reference to its own §313 inside the quotation, and `lēgātus capite
vēlātō fīlō (lānae vēlāmen est)` carried Lane explaining a word to its reader
mid-sentence. Both now go to an `annotated` bucket. The pool was otherwise clean
on ten such checks: no Latin in a prompt, no markup, no truncated clause, no
double space.

The boundary is the sentence-ending mark, and it has to be looked for on both
sides of the tag — Lane leaves the stop outside the run in `council hall</i>.
(<i>b.</i>)` and inside it in `A B C's?</i> (<i>b.</i>)`. Checking only the gap
fixed twelve of twenty-four. This is the third filter in this pipeline that was
wrong on the first pass, which is the count `ag-quotes.mjs` records for itself,
and the argument for `--why` and for gate H3 in one.

**What Lane cannot do, corrected after the run.** Two guesses were written here
before the filing finished and both were wrong, in opposite directions, which is
the argument for not writing predictions as findings.

*Guessed:* Lane has no word-order chapter, so `bn-353`–`bn-356` stay unreached.
*Measured:* `bn-353` Style: nouns **is** reached, with 4 questions. `bn-354`,
`bn-355`, `bn-356` are not.

*Guessed:* Lane opens Part Second on sentence classification, so it reaches three
of the four overview topics. *Measured:* it reaches **one**.
`bn-164-simple-and-compound-sentences` has 4 questions; `bn-161` Classification
of Sentences, `bn-163` Subject and Predicate and `bn-213` The Ablative are still
at zero, because those are Bennett's own scaffolding headings and nobody quotes
an author to illustrate a table of contents.

*Also wrong by omission:* `bn-357`–`bn-359`, the peculiarities of the accusative,
dative and genitive, were expected to fall out of Lane's case chapters and did
not. What actually lifted `style` from 4% to 18% is elsewhere in the family —
`bn-341` coordinate conjunctions went to 88 questions and `bn-347` syntax of
adverbs to 19.

So the corpus route remains the only path to `bn-354`–`bn-359` and
`bn-350`, and that is now measured rather than assumed.

**What was dropped, and the case for buying it back.** 193 sentences carry
Lane's macron-over-breve, its mark for a quantity that varies between authors:
`mihī̆`, `tibī̆`, `sibī̆`, `rē̆ī`. They are dropped the way A&G's circumflex is,
because writing either mark asserts something the book declined to assert and the
fold strips it before attestation could catch a wrong guess.

The case for reversing that is stronger than it looked when the decision was
made, and the evidence arrived from the other direction. Measuring what the
shipped pools already do with these words: **the dump pool ships them bare in
27.7% of its sentences and A&G's in 18.6%** — `mihi`, `tibi`, `sibi`, `ubi`,
`ego` — and the dictionary holds *only* the doubtful-marked spelling for each. So
the pack has already settled on bare as the spelling for exactly this class of
word, in two pools, and dropping Lane's 193 makes it the one source held to a
different rule. Mapping macron-over-breve to the bare vowel would buy back 193
sentences and make the three pools agree.

Not done in this commit, because it is a change to how a word is spelled across
the whole pack and belongs in its own, where the diff shows it.

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

### The source survey, so it is not paid for twice

Done 2026-08-11, looking for openly-licensed, machine-parsable Latin dense in
quotations from classical authors. **Lane is the find and the rest of this is the
record of what else there is.** The licence ceiling is settled: A&G already
arrives CC BY-NC-SA 3.0, so NC share-alike is what the pack has already taken on,
and nothing below is excluded on licensing grounds.

**Taken: Lane, *A Latin Grammar for Schools and Colleges* (1898).** Project
Gutenberg #44653, public domain in both the text and the transcription, which is
Distributed Proofreaders rather than OCR. What it was made to prove, and the
misattribution it was caught in, are two sections above.

**Worth having later, in this order.**

| source | what it is | licence |
|---|---|---|
| `PerseusDL/canonical-latinLit` | 428 Latin + 259 English TEI files. Not a quotation source: the clean way to rebuild the widened attribution corpus `verify-attribution --texts` wants, and to pull context around any locus Lane or A&G cites. Alignment is citation-level, not sentence-level. | CC BY-SA 4.0 |
| `PerseusDL/canonical-pdlrefwk` | A&G as real TEI rather than Alpheios HTML, plus Smith's dictionaries. A text-quality option, not a licensing one. | CC BY-SA 4.0 |
| UD_Latin-CIRCSE | 1,972 sentences, Seneca's tragedies and Tacitus *Germania*, CoNLL-U. Constructions are queryable: `VerbForm=Gdv`, an `advcl`-heading `Case=Abl` participle for the ablative absolute, `ccomp` with `VerbForm=Inf` for acc.+inf. Purpose and result are *not* separable from UD annotation alone. | CC BY-SA 4.0 |
| UD_Latin-Perseus | 2,273 sentences, classical. The UD page says CC BY-NC-SA 2.5 and PerseusDL's own site says CC BY-SA 3.0; pin from the release downloaded, not from either page. | disputed, see left |
| LASLA / Opera Latina | ~1.7M tokens, the largest annotated classical corpus, CoNLL-U via `CIRCSE/LASLA`. Syntactic annotation only partial. | CC BY-NC-SA 4.0 |
| Meissner–Auden, *Latin Phrase-Book* | PG #50280, proofread, every entry glossed — but **mixed**: only entries carrying a parenthetical locus are attested and the unattributed majority is composed idiom. Filter on the citation or it becomes Bennett's index again. | public domain |

Everything in that table except the first two shares one problem and it is the
same one: **none of them is macronized.** That is the tax, not attestation.
Measured here: Livy I and Tacitus *Annals* I, neither ever ingested, attest at
98.1% and 97.7% against the shipped index, and roughly three-quarters of their
4–22-word sentences carry no unattested form at all — so the corpus route is
wide open on the gates. But strip the marks off the 964 sentences already in the
two pools and ask `scripts/lib/macronize.mjs` to put them back, and it recovers
83.5% and 85.6% of tokens and the whole sentence 32% and 21% of the time. On raw
Livy and Tacitus only 7% and 5% of short sentences come out attestation-clean
*and* fully marked inside the two-decision budget. **The decisive property of a
source is that it prints macrons**; a source that does not pays the dump pool's
price of marks and prompts both, 18 calls and ~105 minutes.

One thing that measurement turned up and did not settle:
`build-quote-pool.mjs:118` rejects on `ambiguous.length > 2` and never checks
`unknown`, so a sentence holding a word the dictionary offered no spelling for
can pass through partially unmarked. **Whether anything shipped that way is not
established, and the obvious way of asking does not answer it.** Counting
shipped words that carry no mark but whose every dictionary spelling carries one
gives 27.7% of the dump pool and 18.6% of A&G's — and then the list turns out to
be `mihi`, `tibi`, `sibi`, `ubi`, `ego`, `parum`, where what the dictionary holds
is `mihī̆`, `tibī̆`, `ubī̆`, `egō̆`: the common-quantity mark, for a vowel that is
long in some authors and short in others. Bare is the conventional spelling
there, it is what both grammars print, and it is what the pack should ship. The
measure is swamped by them. A real one would have to exclude the doubtful marks
first, and was not written. The `unknown` check is still missing rather than
unnecessary.

**Ruled out, with the reason, so nobody re-tries them.**

| source | why |
|---|---|
| Roby, Harkness, Hale & Buck, Madvig, Draeger, Kühner-Stegmann | Raw OCR only; no proofread digitization exists for any of them. Same class as G&L below — measure before believing otherwise. Project Gutenberg's entire "Latin language — Grammar" subject holds exactly two books, Lane and Bennett, and both are now in this pack. |
| Bassols de Climent, *Sintaxis latina* | Published 1956, author died 1973: **in copyright** in the EU until 2043. The Archive.org copies are unauthorized re-uploads. |
| `grosenthal/latin_english_parallel` | Sentence-aligned and convenient, and its translations come from the in-copyright Loeb, paraphrased by GPT-3.5 to "transform them into the public domain". That is not how copyright clears, and the sibling repo's MIT label does not cure the provenance. |
| Riley's *Dictionary of Latin Quotations* (`gfranzini/riley-latin-quotations`) | 2,490 entries in a clean TSV, 2,477 of them translated — and `source_1` holds an author name only, with `source_2` populated in **4 entries of 2,490**. No loci at all, so every citation would have to be re-found. Also weighted toward proverbs and legal maxims rather than syntax. No LICENSE file on the corrections. |
| Arnold, North & Hillard, and Meissner's unattributed entries | Composed sentences. Attributing them manufactures quotations, which is the Bennett-index failure exactly. |
| Steadman's readers | Licence is fine (CC BY-NC-SA 3.0); PDF-only with facing-page layout. |
| DCC commentaries | CC BY-SA 4.0 and cross-linked to A&G section numbers, which would make a natural bridge — but Drupal-served HTML with no bulk export. Scraping only. |

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

## Lane as a second syllabus, and not only a second pool

Measured 2026-08-11 by `scripts/probe-lane-grammar.py`, which reads the same
pinned Gutenberg #44653 the quotation pipeline reads and answers a different
question about it: not *does Lane quote its authors* but **would Lane's own book
segment into a syllabus a student could work through**, beside Bennett's rather
than instead of it.

**It would.** Over the teachable range — §§396–2427, which is Lane's inflection,
particles, syntax and appendix, dropping sound, word formation and prosody the
way `parse.py` drops Bennett's Parts I, IV and VI — Lane segments into **461
topics, 986 KB of prose**, and clears every shape gate but one:

| gate | Lane | Bennett's threshold |
|---|---|---|
| topic count | **461** | 60–300 — **the one failure** |
| min chars | 140 | ≥ 120 |
| max chars | 14,487 | ≤ 24,000 |
| median chars | 1,638 | 400–4,000 |
| p90 chars | 4,723 | ≤ 8,000 |
| largest family | 17.1% of 17 | ≤ 45% |

**Segmentation needs no guessing here, which is the difference from Bennett.**
`parse.py` has to find Bennett's run-headings by their capitalisation. The
Distributed Proofreaders transcription marks Lane's hierarchy with real
`<h2>`–`<h6>`, and inside the inflection chapters — where Lane sets a run-heading
as a styled paragraph rather than a heading — with `class="header"`. Proofread
rather than OCR pays a second time.

Three findings that decide how it has to be built.

**1. The topic count is a real disagreement, not a tuning failure.** Lane is a
2,745-section book against Bennett's 376, and its 461 topics are *finer per
section*, not merely more numerous — which is the whole point of a second
grammar. Coarsening to fit 300 costs the distribution rather than saving it:
cutting only at `<h6>` and above gives 279 topics but pushes p90 to 8,161, over
the gate, with topics of 23,000 characters. So `grammarShape` has to become
per-grammar, and Lane's is set to what Lane measures. **`maxTopics` is a shape
threshold, not a correctness one** — nothing about attestation is relaxed by
this, and the rule `CLAUDE.md` states for `profile.attestation` still binds.

**2. The nine families do not survive, and Lane supplies better ones.** Filing
461 Lane topics into the pack's nine puts 202 of them — 43.8% — into
`verb-syntax`, one accordion holding nearly half the book. Lane's own `<h3>`/`<h4>`
chapter headings give **17 families, largest 17.1%, median 12 topics apiece**,
which is almost exactly Bennett's own 114-over-9 shape, and reads as the book's
table of contents rather than as a scheme imposed on it:

```
  79  (B.) INFLECTION OF THE VERB.        13  CONNECTION OF SEPARATE SENTENCES
  76  (A.) USE OF THE NOUN.               11  THE RELATIVE SENTENCE.
  71  THE CONJUNCTIVE PARTICLE SENTENCE.   9  THE COMPOUND SENTENCE
  68  (A.) INFLECTION OF THE NOUN.         8  (B.) INDIRECT DISCOURSE.
  37  NOUNS OF THE VERB.                   7  (D.) NUMERALS.
  28  (B.) USE OF THE VERB.                6  (A.) PECULIARITIES OF VERBS.
  17  (C.) PRONOUNS.                       5  THE INDIRECT QUESTION.
  14  THE COMPLEX SENTENCE                 2  C. INFLECTION.  + 10 unplaced
```

So `families` moves from the pack to the grammar. That is where it always
belonged: `families.ts` already calls the order "load-bearing: the order the
grammar index is drawn in", and it is *a* grammar's index, not the language's.
The 10 unplaced topics are what `fallbackFamily` is for.

**3. The cross-reference map covers half of Lane, and the missing half is the
half that would cost a model run.** `lane-topics.tsv` was built for the
quotation pipeline, so it maps §1056–2421 — Part Second — and nothing else:

| range | Lane topics | reaching a Bennett topic |
|---|---|---|
| inflection §396–1022 | 150 | **0** |
| syntax §1023–2427 | 311 | 267 (85%) |

62 of Bennett's 114 topics are reached. The 52 that are not are mostly the
inflection ones the extended map would pick up — `verb-forms` 14, `nouns` 9,
`pron` 8, `adj` 4 — plus `style` 7, which is Lane's known permanent gap: it has
no word-order chapter, so `bn-353`–`bn-356` stay unreached by any grammar.

**Filing questions into Lane's syllabus therefore needs the map extended over
§§396–1022 before anything can be served there**, at roughly the cost of the run
that built the existing rows. Until that exists, Lane's inflection half is
readable prose with no questions under it — which is not a defect to hide but a
number to print, and the reason Lane's own `coverage.topicsWithTestsPct` cannot
be Bennett's 100.

**What this does not settle.** That Lane *segments* is not that Lane *reads*
well, and the same lesson arrives here as everywhere else in this file: every
gate above is measuring self-consistency. H1 exists because a segmentation can
pass all of them and still cut a topic in the wrong place, and Lane has had no
H1 read-through. That is owed before the parser's output ships.

### What the parser then measured, and the two things the probe got wrong

`languages/latin/grammar/lane-parse.py` was written against the numbers above
and lands at **459 topics** rather than 461, passing all eight gates:

```
✓ G1  459 topics (want 300–600)      ✓ G5  ids unique, order strict, titles distinct
✓ G2  min 141 chars                  ✓ G6  all 1364 row-shaped lines recovered
✓ G3  median 1607 · p90 4642 · max 14307     (1462 table rows)
✓ G4  18 families, largest 17.2%     ✓ G7  every topic renders as something
                                     ✓ G8  2031 assigned + 714 dropped = 2745
```

G6 is the one worth reading twice. Lane's paradigms come through Bennett's own
`⟦b:…⟧` markup and table reader untouched — which is why the parser imports
`parse.py` rather than restating it — so every declension and conjugation
renders without `grammar-blocks.ts` learning a second format.

**Two corrections to the probe, both found by reading the output rather than the
gates**, which is the same lesson as the twenty-one prompts:

- **The range opens at §397, not §396.** Lane sets its `C. INFLECTION.` heading
  *after* §396, so §396 is the last section of word formation. Started at 396 it
  produced a topic titled "Section 396" whose family was `formation`, a chapter
  the syllabus does not contain.
- **`titleise` cannot be reused, and failed quietly.** Bennett's helper strips a
  trailing hyphen along with the full stop, and judges a heading to be shouting
  by `not any(c.islower())`. A third of Lane's inflection headings name a *form*
  rather than a word — `STEMS IN -ā-`, `VERBS IN -iō, -ere` — and the lowercase
  part is the ending. 22 titles came through as `STEMS IN -ā`, having lost the
  mark that says `-ā-` is a stem, and one qualified pair as `pERFECT STEM IN -v`.
  Every gate passed on all of them: they are unique, well-formed ids with
  distinct titles. Lane cases its own titles now, leaving a word already in lower
  case exactly as the book set it.

### Filling the other half of the crosswalk, and how it was checked

A further grammar has no questions of its own — Lane's topics are served out of
the ones written against Bennett, reached through `grammar/lane-topics.tsv`. That
table was built by the *quotation* pipeline, which walks the sentences a grammar
prints, and Lane prints those in Part Second. So it covered §§1056–2421 and
nothing else, and half of Lane's syllabus had prose to read with nothing under
it: **235 of 459 topics reachable, carrying 6,025 of 8,984 questions**.

`extend-crosswalk.mjs` asked about the 220 topics nothing had been asked about
— 11 calls, one judgement per topic rather than per section, because the
question is about a grammar point and asking about each of a topic's four
sections separately is four chances to answer differently about one thing.
**196 were placed, 24 had no counterpart**, and Lane went to **431/459 topics
and 8,430/8,984 questions (94%)**.

**The part with a knowable answer is right.** Every gate here measures
self-consistency, so the check that matters is the one where the answer is known
in advance — and Lane names a declension by its stem where Bennett numbers it,
which makes the whole inflection half checkable by anyone who knows the language:

| Lane | Bennett |
|---|---|
| Stems in -ā- / -o- / -u- / -ē- | First / Second / Fourth / Fifth Declension |
| Consonant stems, stems in -i- and mixed | Third Declension |
| Verbs in -āre / -ēre / -ere / -īre | First / Second / Third / Fourth Conjugation |
| Verbs in -iō, -ere | Verbs in -iō of the Third Conjugation |

All twelve correct, which is the evidence the other 184 placements are worth
trusting — and it is evidence rather than proof, so a read-through is still owed.

**13 Bennett topics stay unreachable, and only seven of them structurally.**
Word order, sentence structure, style of pronouns and of verbs: Lane has no
chapter on any of it. The other six are topics Bennett isolates and Lane folds
into a neighbour — Lane's conjunctions went to Bennett's *Coördinate
Conjunctions* rather than to his list of the forms, its *Wish* to the *Optative
Subjunctive* rather than the *Volitive*. Those are the books disagreeing, which
is the whole reason to have a second one, and not a table to correct.

**A wart the gates cannot see, and why it is safe to leave.** Eight titles
qualified themselves with a *sibling* rather than a parent, because Lane
occasionally nests one run-heading under another of the same kind:

```
  §794         Verbs in -āre: Verbs in -ēre
  §1587-1593   The Tenses of the Indicative: The Present Tense
  §2219-2222   The Infinitive: The Present Tense
```

The first reads as a contradiction and the others merely as a mouthful. G5 sees
nothing: they are unique, well-formed and distinct. Fixing it means re-running
the parser, which changes those topics' ids — and **that is safe, because the
table is keyed on Lane's section numbers rather than on its topic ids**, so
`build-crosswalk.mjs` re-derives the join and the model run is not spent again.
That property is worth more than the wart costs, and it was the reason for
choosing the section as the table's grain.

**Titles are qualified rather than overridden.** Bennett needs a hand-written
table of 20 headings that name their enclosing section instead of their topic.
Lane's hierarchy is deeper and has far more — five topics called "Singular
Cases", four called "Greek Nouns" — and a table of 461 entries is not a fix, so
a colliding title takes the heading above it: `Stems in -ā-: Singular Cases`. The
same rule catches a heading that is a *continuation* rather than a name —
`(A.) OF THE VERB.` under `AGREEMENT.` — which no collision check would have
found, because "Of the Verb" is perfectly unique and means nothing on a map.

## Where the next attested sentences would come from

> **Superseded 2026-08-11 by the Lane run, and kept because the reasoning held.**
> The pack is now **2,387 attested of 8,984 questions, 27%**, over 62 of 114
> topics — up from 889 of 7,470 over 50. What follows was written when the first
> two figures were the current ones, and its central claim survives: the
> inflection families stayed where it said they would.
>
> | family | topics | attested | total | % (was) |
> |---|---|---|---|---|
> | verb-syntax | 28 | 1,351 | 3,066 | **44%** (21%) |
> | noun-syntax | 18 | 584 | 1,579 | **37%** (23%) |
> | adj-pron-syntax | 13 | 281 | 805 | **35%** (13%) |
> | style | 12 | 119 | 678 | **18%** (4%) |
> | particles | 3 | 19 | 142 | **13%** (2%) |
> | pron | 9 | 7 | 365 | 2% (2%) |
> | verb-forms | 17 | 20 | 1,430 | 1% (1%) |
> | adj | 5 | 3 | 388 | 1% (1%) |
> | nouns | 9 | 3 | 531 | 1% (1%) |
>
> The four inflection families did not move and were never going to. 52 topics
> still ship no quoted question, against 64 before; 33 of the 37 that no pool
> reached are still unreached, and 20 of those 33 are inflection topics or
> Bennett's own scaffolding headings.

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

> **Corrected 2026-08-11. That paragraph is measured on the A&G pool alone, and
> it is wrong about the other half of the corpus.** A&G files per section, so of
> course few of its records name a second topic — one decision covers every
> sentence beneath it. The dump pool files per sentence, and **187 of its 372
> records name a second topic**. Every one of those second copies is thrown into
> `duplicate` by `quote-tests.mjs`, because the first-listed topic wins and the
> prompt then collides. The lever is half the corpus in size, not 4%.
>
> It joins a second one found the same day. **27 topics are named by a pool and
> ship nothing**, lost to `thinTopic` — a topic with fewer than
> `minQuestionsPerTest` accepted quotes is dropped whole — and to that same
> second-topic rule. Six already hold three or more pool records, which is at or
> above the floor: `bn-236-adjectives-used-substantively` (6, both pools),
> `bn-071-comparison-of-adjectives` (4),
> `bn-239-adjectives-with-the-force-of-adverbs` (4),
> `bn-116-peculiarities-of-conjugation` (3),
> `bn-253-syntax-of-pronominal-adjectives` (3),
> `bn-076-formation-and-comparison-of-adverbs` (3).
>
> Neither was acted on *deliberately* in the Lane commit, because Lane is the
> larger lever and mixing them would make it impossible to say which moved what.
> But the compose run cashes part of the `thinTopic` one whether or not anyone
> asks it to: `quote-tests.mjs` pools candidates from all three files before
> applying the floor, so a stranded A&G or dump sentence — one that never
> shipped, and therefore never collided with a prompt — becomes live again
> wherever Lane pushes its topic past three. Old-pool sentences did ship in this
> run, and nothing on a shipped question says which pool it came from. The
> second-topic lever is untouched and still there.

**And 37 of the 114 topics were named by no pool record at all** — the true
"nothing has reached this" set, as against the 64 that merely ship none.
Measured 2026-08-11, before Lane:

| family | n | ids |
|---|---|---|
| verb-forms | 11 | `bn-097`, `bn-098`, `bn-100`, `bn-101`, `bn-103`, `bn-105`, `bn-107`, `bn-109`, `bn-114`, `bn-117`, `bn-120` |
| style | 7 | `bn-353`…`bn-359` |
| nouns | 4 | `bn-017`, `bn-018`, `bn-020`, `bn-023` |
| noun-syntax | 4 | `bn-161`, `bn-163`, `bn-164`, `bn-213` |
| pron | 3 | `bn-085`, `bn-086`, `bn-089` |
| verb-syntax | 3 | `bn-256`, `bn-273`, `bn-317` |
| particles | 2 | `bn-140`, `bn-145` |
| adj-pron-syntax | 2 | `bn-234`, `bn-241` |
| adj | 1 | `bn-063` |

Sixteen are inflection topics and stay a correct zero for the reason above. Four
more — `bn-161` Classification of Sentences, `bn-163` Subject and Predicate,
`bn-164` Simple and Compound Sentences, `bn-213` The Ablative — are overview
headings that no grammar illustrates with a quotation, or so it looked; Lane
opens its Part Second with exactly those and reaches three of the four. **The
genuinely winnable unreached set was about 17 topics**, and Lane is aimed at it.

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

- *The pool is there.* Refresh `inflection-topics.mjs`, hand the shipped
  quotations back with `prune-tests.mjs --quoted --apply`, compose with
  `quote-tests.mjs --from quotes --allocate --per-topic 16`, run
  `verify-attribution.mjs` and `validate-pack.mjs`, read a dozen prompts against
  their answers, sign gate H3 above, update `BASELINE.json`, and commit. The
  prune is not optional and not a deletion: the composer refuses to ship a
  sentence it can already see on disk, so a pool that has been dealt once cannot
  be dealt differently without being taken back first.
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
