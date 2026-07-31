# Greek pack — human review record

Two of the gates cannot be automated, because they are about whether the thing
reads well rather than whether it parses. They are recorded here so a later run
can see what was actually looked at, by whom, and when — an unsigned gate is an
unchecked gate.

## G9 — grammar segmentation read-through

Every topic is shown to the student verbatim, so what the parser mangles the
student meets mangled, and what it drops the student can never read.

```
node --import tsx scripts/grammar-report.mjs --pack languages/ancient-greek --sample 12 --render
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

- **The question set is incomplete.** 78 of 485 topics have tests; generation is
  a long resumable run and was still going when this was committed. Until it
  finishes, gates C1 and C3 fail by definition — a topic with no questions is
  exactly what C1 is for. (C5 and C7 pass already: 99.7% of answer tokens are
  attested and 39.5% of the band is exercised.)

  It is being written **floor-first**: every empty topic gets
  `coverage.minTestsPerTopic` tests, which is what C1 and C2 actually require,
  and the size-scaled targets get topped up afterwards. That is 2,442 tests to
  reach the floor against 5,776 to reach full target, and it puts questions in
  front of a student on every topic sooner.
  `node --import tsx scripts/gen-tests.mjs --pack languages/ancient-greek --target 6`
  writes the empty ones; `--fill` afterwards tops everything up.

- **The floor alone will not turn C3 green, and the reason is not starvation.**
  C3 is two-sided — a family fails at under 0.5× or over 2× the pack mean. With
  every remaining topic at 24 questions the pack mean lands at 27.4, and the two
  small families generated earlier at full size-scaled targets sit above the
  ceiling: `adj` 83.6 and `pron` 103.5 q/topic. They are over-served, not the
  rest under-served, and nothing is wrong with them. At full targets everywhere
  the mean is 57.7 and all eleven families fall inside 28.8–115.3, so the top-up
  pass is what closes C3. Until then Greek needs `--allow-incomplete`, which is
  what `LANG_PACKS_DRAFT` is for.
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
- **The vocabulary map was rebuilt at rank 12000.** It had been built at 7000,
  which left `πρό` (rank 11227), `ἀντί` (14972) and `εἴθε` (9558) out of the
  crib entirely — `πρό` alone was 134 of the misses. Rebuilding with
  `--merge --drop-artifacts --max-rank 12000` takes the unresolved share of
  answer tokens from 1.97% to 0.92% and the map from 276,027 keys to 386,391.
  `--merge` is not optional here: a plain rebuild gains 24,780 keys and *loses*
  6,854, which is a regression on whatever word the student is looking at.
  `--drop-artifacts` sheds 2,618 Morpheus hyphen/plus compounds nobody can type.
- **What is still unresolved is compounds and rarities**, not function words:
  προεδωκεν, προηλθον, προιεναι (προ- compounds the analyser holds only as
  `προ+…`), λαφυρα, κυνηγεται, δρομευσ. Raising the cutoff further reaches some
  of them; the table in the plan for this change has the cost.
- **The syllabus is Perseus's TEI, not CCEL.** CCEL publishes only Parts I–II of
  Smyth, §§ 1–573 — no syntax at all, which is 2,149 of the 3,048 sections. A
  pack built on it would teach the forms and nothing about using them.
