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

## C8 — generated question review

Attestation proves every word of an answer exists. It does not prove the
sentence is grammatical, idiomatic, or a translation of the English beside it —
so 30 items, stratified across the families, get read.

Aim for ≥28 of 30. The failure to look for is not a wrong word; it is a
sentence that is impeccably attested and means something other than the prompt.

| Date | Reviewer | Sample | Verdict |
|---|---|---|---|
| — | *not yet signed off* | — | The automated gates C1–C7 pass on 5,388 questions. 1,363 of these were generated on 2026-07-29 and have had no human read-through; the 4,025 that predate it were reviewed before the gates existed. |

## Known state

- 40 of 135 topics are still below their size-scaled target, down from 95. The
  first backfill run took 58 topics to target and stopped itself on usage
  limits; `gen-tests.mjs --only-thin` recomputes the deficit and resumes.
- 41 distinct forms were accepted without a dictionary match across that run
  (the allowance is 2 per sentence). They are listed in `content/gen-stats.json`
  and are worth reading: a form that recurs is either a real gap in the
  dictionary or a word the generator invented.
- `content/lemmas.json.gz` predates `scripts/build-lemmas.mjs` and is not
  regenerated; see `BASELINE.json` for the verified drift.
