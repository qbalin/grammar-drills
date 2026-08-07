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
| — | *not yet signed off* | — | The quotation pipeline is new. Nothing has been read by a person. |

### What was already ruled out, so it is not tried again

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

## Known state

- **Latin quotes nothing yet, and the run that would change that was left
  going.** Every Latin question on screen is generated. Greek's quoted half
  shipped on 2026-08-07; Latin's was still building when the session ended.
  Where it stands, and how to pick it up, is the next section.
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

Left running on 2026-08-07 and unfinished. Nothing below is committed; the
tree at that commit is clean and Latin is untouched.

**Where it got to.** `scripts/build-quote-pool.mjs` was ~105 minutes into 18
batched calls, filing 439 quotations under topics, choosing among closed macron
candidates and writing English prompts. No failures. A detached watcher was left
behind to finish the deterministic half when the pool lands: compose the tests,
run every gate, run `verify-attribution.mjs`, rebuild the bundle. It writes
`.latin-finish.log` (gitignored) and **commits and pushes nothing**.

**First thing to do: read `.latin-finish.log`.** It says which of three
happened.

1. *It finished and everything passed.* `content/quotes.jsonl.gz` exists,
   `content/tests/*.json` have `-q<n>` entries, `quote-stats.json` is written.
   Read a dozen prompts against their answers, sign gate C9 above, update
   `BASELINE.json`, and commit. The README's "built but not yet shipped"
   paragraph has to change in the same commit — it is a claim about what is on
   screen.
2. *`verify-attribution.mjs` reported a contradiction.* **Do not ship it.** A
   contradiction is either a real misattribution or one ancient author quoting
   another — Augustine quotes Cicero at length and both are in
   `reference/texts/` — and the two are told apart by reading the passage it
   collided with, not by a threshold.
3. *The builder exited with no artifact.* Nothing is recoverable: the script
   writes only at the end. **Fix that before rerunning** — it should append and
   resume the way `gen-tests.mjs` does, which is the difference between losing
   twenty minutes and losing two hours.

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
