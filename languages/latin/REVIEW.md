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

## Known state

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
