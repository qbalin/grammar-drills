# Greek pack — human review record

Two of the gates cannot be automated, because they are about whether the thing
reads well rather than whether it parses. They are recorded here so a later run
can see what was actually looked at, by whom, and when — an unsigned gate is an
unchecked gate.

## G9 — grammar segmentation read-through

Every topic is shown to the student verbatim, so what the parser mangles the
student meets mangled, and what it drops the student can never read.

```
node --import tsx scripts/grammar-report.mjs --pack languages/greek --sample 12 --render
```

Read all twelve. The questions to hold in mind:

- Does the topic stand alone, or does it only make sense next to its neighbour?
- Did the paradigm tables survive as tables, with the endings under each other?
- Is the title the topic's own, or a heading that belongs to the section above?
- Is anything obviously missing in the middle?

| Date | Reviewer | Sampled ids | Verdict |
|---|---|---|---|
| 2026-07-29 | Claude (assisted build) | 12 rendered, plus a scripted scan of all 485 | **Provisional pass.** Tables survive: the εἰμί and εἶμι paradigms in `sm-768-irregular-mi-verbs` set the moods in columns with the persons stubbed down the side, and the first-declension ending table in `sm-211` reads across correctly. Prose is clean polytonic throughout. Not a substitute for a Hellenist's read-through, which this pack still wants. |

Found during that read, and left alone deliberately:

- **36 topics carry a Perseus source artifact.** Smyth prints a brace over
  alternative letters; the digitization renders it `-[ιγλιδε]όε-` (§ 507 and
  others). It is in the TEI, not in the parser, and would need a substitution
  table to repair. Filed here rather than fixed silently.
- **`pron` holds only 2 topics.** Smyth's pronoun chapter (§§ 325–340) is short
  and mostly paradigm, so it groups into two long runs. The family is populated
  and G4 passes, but it is the thinnest bar on the map.
- **22 topics exceed 4× the median.** They are the syntax chapters, already cut
  at `--max-chars 12000`; every one is under `maxTextChars`.

## C8 — generated question review

Attestation proves every word of an answer exists. It does not prove the
sentence is grammatical, idiomatic, or a translation of the English beside it —
so 30 items, stratified across the families, get read.

Aim for ≥28 of 30. The failure to look for is not a wrong word; it is a
sentence that is impeccably attested and means something other than the prompt.

| Date | Reviewer | Sample | Verdict |
|---|---|---|---|
| 2026-07-29 | Claude (assisted build) | 8 of the first topic generated | **Not signed off — generation is still running.** The eight items of `sm-211-first-declension-stems-in-a` were read in full and all eight are correct Attic that exercises the stated point (νεανίαι, πολίτας, ἀγορᾷ, θάλατταν, θεᾶς, ταμίας, Πέρσης, κόρη). A sample of 8 out of a set that is not yet written is not gate C8. |

## Known state

- **The question set is incomplete.** 485 topics want 6,957 tests; generation is
  a long resumable run and was still going when this was committed. Until it
  finishes, gates C1, C5 and C7 fail by definition — a topic with no questions
  is exactly what C1 is for. Resume with:
  `node --import tsx scripts/gen-tests.mjs --pack languages/greek --fill`
- **The fold is variant A** — accents, breathings and the iota subscript all
  fold away, and so does final sigma. The cost is written into
  `fold.fixtures.json` under `equal`, where it can be read: ἀγορά/ἁγορά and
  εἰμί/εἶμι are distinct words in print and this pack cannot tell them apart.
  Gate D2 confirms the pack's fold reproduces `dictionary.db`'s own normalized
  columns on 40,000 sampled rows, which is the invariant that spans both repos.
- **Two citations are known wrong**, both where the dictionary's tags cannot
  choose and the Attic corpus is silent: `ἵστημι` cites the perfect as ἕστα
  rather than ἕστηκα, and `δύναμαι` fills the aorist slot with the middle
  ἠδυνάμην rather than the passive ἐδυνήθην.
- **903 verbs keep the bare headword.** Most are Morpheus's hyphenated
  double-compounds (`ἐν-ξέω`), whose form tables hold no finite verb to build
  parts from. They are excluded from the frequency list for that reason, so
  they are almost never what a student is shown.
- **The syllabus is Perseus's TEI, not CCEL.** CCEL publishes only Parts I–II of
  Smyth, §§ 1–573 — no syntax at all, which is 2,149 of the 3,048 sections. A
  pack built on it would teach the forms and nothing about using them.
