# Greek pack — human review record

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
| — | *not yet signed off* | the 71 reading topics | 2026-08-12 shipped Part I (letters, sounds, accent, §§ 1-188) and Part III (word formation, §§ 822-899) as 57 topics marked `readingOnly`, plus the 14 runs under 120 characters. None has been read through — the 2026-07-29 scan covered a syllabus these were not in. Part I is the pack's densest typography (breathings, accents, the alphabet table) and is exactly where a rendering fault would hide; the taught 485 are unchanged byte for byte and are not what this row is about. |

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

## H2 — generated question review  *(was C8)*

Attestation proves every word of an answer exists. It does not prove the
sentence is grammatical, idiomatic, or a translation of the English beside it —
so 30 items, stratified across the families, get read.

Aim for ≥28 of 30. The failure to look for is not a wrong word; it is a
sentence that is impeccably attested and means something other than the prompt.

| Date | Reviewer | Sample | Verdict |
|---|---|---|---|
| 2026-07-29 | Claude (assisted build) | 8 of the first topic generated | **Not signed off — generation is still running.** The eight items of `sm-211-first-declension-stems-in-a` were read in full and all eight are correct Attic that exercises the stated point (νεανίαι, πολίτας, ἀγορᾷ, θάλατταν, θεᾶς, ταμίας, Πέρσης, κόρη). A sample of 8 out of a set that is not yet written is not gate C8. |
| 2026-08-14 | Claude (this session) | 33 items — 3 per family across all 11 taught families, drawn on an even stride through each family's questions in topic order, so the draw repeats. Ids listed below the table. | **Pass, 32 of 33** (bar is ≥28/30). Generation has finished, so this is the first draw that is actually gate C8. No item was found whose Greek means something other than its English, which is the failure the gate exists for. The Greek is idiomatic Attic and on-topic: the deliberative subjunctive at `sm-1795`, the indirect reflexive οἷ at `sm-325`, τί ἄλλο ἤ with the verb left out at `sm-944`, neuter plural with a singular verb at `sm-311`, and γάρ carrying the force of a surprised question at `sm-2803` — rendered "What! Do you really think…", which is the particle done properly rather than dropped. **The one miss is `sm-1959-periphrastic-tenses-t5#1`:** πῶς οὐ μέλλει τοῦτο πᾶσι γελοῖον εἶναι; is glossed "How should this not be ridiculous to everyone?", which is defensible English for it but gives a student no cue to reach for μέλλω — so the prompt under-determines the very construction the topic teaches. Two more are borderline and were counted as passes: `sm-976-apposition-t11#2` ("You yourselves" is emphasis the Greek τὰ ὑμέτερα αὐτῶν does not carry), and `sm-3018…-t18#3` (the infinitive after οἶμαι is left to be understood — correct as the figure, hard to produce). Separately, `sm-3028-hyperbaton-t25#4` is good Greek and a good sentence but exercises polysyndeton rather than hyperbaton; that is topic fit, not the C8 failure mode, and is noted rather than counted. |

The 33 read on 2026-08-14, in draw order:

```
sm-211…-t10#3  sm-252…-t9#4  sm-268…-t20#1  sm-291…-t6#3  sm-311…-t3#4
sm-341-adverbs-t21#1  sm-325…-t9#3  sm-325…-t26#4  sm-334…-t18#1  sm-412…-t16#2
sm-546…-t9#3  sm-728-fourth-class-t16#1  sm-906…-t15#3  sm-944…-t10#1  sm-976…-t11#2
sm-1060…-t7#4  sm-1136…-t15#1  sm-1218…-t7#1  sm-1341…-t2#3  sm-1474…-t25#2
sm-1634…-t4#4  sm-1795…-t15#4  sm-1959…-t5#1  sm-2088…-t2#1  sm-2260…-t5#4
sm-2462…-t14#1  sm-2690…-t6#1  sm-2803-gar-2803-t8#1  sm-2881…-t10#4  sm-2955-oun-t13#1
sm-3004-anacoluthon-t15#3  sm-3018…-t18#3  sm-3028-hyperbaton-t25#4
```

## H3 — quoted question review  *(was C9)*

1,109 questions in 290 tests (ids `-q<n>`) have an answer Smyth quoted from an
author, taken out of the Alpheios TEI's `<cit>` before the parser flattens it,
and credited from the `n` attribute of its `<bibl>` — which is already Perseus's
canonical citation, so nothing here guessed at an expansion.

The Greek is not what needs reading; `scripts/verify-attribution.mjs` confirmed
542 of the 672 checkable against `reference/texts/` with **0 contradictions**,
and 537 of those 542 were found in the *cited work* rather than merely somewhere
in the author. What needs reading is the English. Smyth's glosses were written
to sit inside a sentence of his own, and `quote-tests.mjs` only capitalises and
stops them; a gloss that reads as a fragment on its own is not a fair prompt
even though it is a correct translation.

Also worth a reader's eye: the pipeline strips Smyth's marks of vowel quantity
(`ἁμάξᾱς` → `ἁμάξας`), because they are his annotation and not what the author
wrote, and only 10 of 4,302 sampled generated answers carry one. That decision
is visible on screen and nowhere else.

Aim for ≥28 of 30, sampled across authors.

| Date | Reviewer | Sample | Verdict |
|---|---|---|---|
| — | *not yet signed off* | — | Machine-checked only: 0 contradictions against an independent corpus. No person has read a prompt. |
| 2026-08-14 | Claude (this session) | 35 items — 5 per family across the 7 families that hold quoted questions, same even stride, across Xenophon, Thucydides, Plato, Demosthenes, Lysias, Isocrates and Herodotus. Ids listed below the table. | **Fails: 17 of 35** against a bar of ≥28/30. The section above predicted the failure exactly — "a gloss that reads as a fragment on its own is not a fair prompt even though it is a correct translation" — and it is worse than a minority case. See the breakdown below. |

What the 35 divide into, since the number alone does not say what to repair:

- **Fragments, 11 of 35.** Smyth's gloss translates a phrase he is quoting inside a sentence of his own: "Those in power, the government." (`sm-1153`), "Above the rest of men." (`sm-1437`), "Plans like the deeds." (`sm-1499`), "A passion so terrible." (`sm-3028-q1`), "A State or certain individuals." (`sm-2675`). Each is a correct translation and none is a sentence a student could be asked to produce. They are invisible to any check, because `quote-tests.mjs` capitalises and stops every gloss — so a fragment arrives wearing a capital letter and a full stop and looks exactly like a sentence.
- **An unmarked hole in the Greek, 7 of 35 — and 129 of all 1,143 quoted questions (11.3%), touching 99 tests.** Smyth elides with " . . . " and the pipeline carries it into the answer: `εἰς . . . τόπον . . . ἀειδῆ, εἰς Ἅιδου`, `ὅπως . . . ὑμεῖς ἐμὲ ἐπαινέσετε`. The student is asked to write a sentence with a gap in it, which cannot be done. This one *is* mechanically detectable, and is the cheapest real repair available.
- **Prompt artifacts, 3 of 1,143.** Two prompts open on a semicolon — `sm-1044-with-one-subject-q1#4` is literally "; is it pleasant to have many enemies?" — and one carries Smyth's gloss notation, "Nothing either great or small = absolutely nothing."
- **Two digitization faults in the Greek, found incidentally.** `sm-976-apposition-q2#3` reads τὸ τοῦ **Ὁμήρον** where the genitive is Ὁμήρου; `sm-2070…-q2#2` opens **ἧλθον** (U+1F27, rough) where ἦλθον (U+1F26, smooth) is the aorist of ἔρχομαι. Both are in the same family as the 36 Perseus brace artifacts already recorded under H1. Neither was caught by attestation, which is expected: it asks whether a form exists, and a wrongly-breathed one folds to a form that does.

The remedy is not to argue with the bar. In order of cost: drop the 129 gapped answers in `quote-tests.mjs` the way `verse` and `unattested` are already dropped, and report them in the funnel; then decide what to do about the fragments, which needs either a length-and-shape test on the gloss or a pass that rewrites them into standalone English — the second being a model writing prompts for quoted answers, which is a different thing from quoting and should be labelled as such if it is ever done. **None of this was changed here.** A gate that has just been read is the wrong moment to also move what it measures.

The 35 read on 2026-08-14, in draw order:

```
sm-929…-q1#2  sm-949…-q1#2  sm-958…-q1#2  sm-963…-q2#2  sm-976-apposition-q2#3
sm-1044…-q1#4  sm-1085-superlative-q1#3  sm-1153…-q1#1  sm-1172…-q2#3  sm-1218…-q3#1
sm-1306…-q4#4  sm-1382…-q1#2  sm-1437…-q1#3  sm-1499…-q1#1  sm-1619…-q3#2
sm-1770…-q1#2  sm-1889-imperfect-q1#3  sm-1991…-q2#4  sm-2070…-q2#2  sm-2123…-q1#2
sm-2193…-q2#1  sm-2359…-q1#1  sm-2553…-q2#2  sm-2675…-q1#4  sm-2737…-q2#2
sm-2803-gar-2803-q1#3  sm-2856-e-q1#2  sm-2881…-q3#2  sm-2932…-q1#3  sm-2967-te-q1#4
sm-3018…-q1#3  sm-3028-hyperbaton-q1#3  -q2#3  -q3#3  -q4#3
```

## Known state

- **The question set is complete, as of 2026-08-14.** All 485 taught topics have
  tests, and none is below its size-scaled target — the coverage report's thin
  note prints nothing. 30,180 questions, of which 1,143 are quoted. All nine
  coverage gates pass, C3 included.

  The floor-first plan this section used to describe worked as written: every
  empty topic was given `coverage.minTestsPerTopic` tests first, and the
  size-scaled targets were topped up afterwards over a series of `--fill` runs.
  The prediction it made was also right — the floor alone did not turn C3 green,
  because C3 is two-sided and the two small families generated early at full
  targets (`adj`, `pron`) sat above the ceiling rather than the rest sitting
  below it. Filling everything is what closed it: the mean landed at 62.2, near
  the 57.7 predicted, and every family fell inside the band.

  **Greek no longer needs `--allow-incomplete`.** `validate-pack` without it
  prints "Ancient Greek passes every gate" and exits 0: 10 grammar, 9 coverage,
  2 attestation, 5 pack. That is a statement about the automated gates and
  nothing else. What is unfinished is on this page — H3 is read and **failed**,
  and the 71 reading topics under H1 have still never been read by anybody. The
  pack is not a draft by any number a script can produce, and is not signed off
  by the two gates that were always going to need eyes.
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
