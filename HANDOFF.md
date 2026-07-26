# Handoff — Bennett grammar migration

Status doc for picking this work up in a fresh session with no prior context.
Everything below is verified unless marked otherwise.

## What this repo is

`Latina`, a spaced-repetition Latin tutor that calls **no LLM at runtime**. You
translate English→Latin, compare with a frozen reference answer, and self-grade
1–4. Exercises are generated offline, once, and shipped as static JSON.

Surfaces: `apps/cli` (Ink terminal app — the only implemented UI; `apps/web` is
a README with an empty `src/`), `packages/core` (isomorphic engine), `content/`
(frozen bundle), `scripts/` (offline content tooling).

## What changed in this session

The syllabus was replaced. It used to be **38 hand-written summaries** that
merely cited Allen & Greenough section numbers — nothing was parsed. It is now
**135 topics parsed from a real public-domain grammar**.

### 1. Source: Bennett, not Wheelock — this matters

The sibling project `../language_learning` has `languages/latin/grammar.db`
(3,004 sections), but it was ingested from
`Wheelock's Latin, 7th Edition … Anna's Archive.epub` — a **copyrighted 2011
HarperCollins textbook obtained from a piracy site**. Its text must not be
copied into this repo, which advertises its content as redistributable.

The shipped grammar is instead **Charles E. Bennett, _New Latin Grammar_ (1908),
[Project Gutenberg #15665](https://www.gutenberg.org/ebooks/15665)** — public
domain, "almost no restrictions whatsoever".

`../language_learning` is still used, legitimately, for two **tools** (never
redistributed): `dictionary.db` (886k entries / 2.5M inflected forms, validates
generated Latin) and `frequencies.db` (19,342 rank-ordered lemmas, seeds vocab).

### 2. The parse

`scripts/parse-grammar.py` — reproduces `content/grammar.json` byte-identically.

```bash
python3 scripts/parse-grammar.py                       # downloads, rewrites content/grammar.json
python3 scripts/parse-grammar.py --src b.txt --out /tmp/g.json   # dry run
```

A topic = a run of consecutive numbered sections under one of Bennett's own
run-headings (§20–22 → *First Declension*). Parts I (sounds), IV (word
formation) and VI (prosody) are dropped — none can carry a translation
exercise — leaving Parts II, III, V: **135 topics in 9 families**
(nouns 9, adj 5, pron 9, verb-forms 35, particles 3, noun-syntax 19,
adj-pron-syntax 13, verb-syntax 30, style 12).

Roughly 25 headings needed manual titles (`TITLE_OVERRIDE` in the script):
paradigm-heavy sections inherit a table label like "IMPERATIVE" instead of a
topic name. Do not assume auto-derived titles are correct if you re-parse.

### 3. Questions re-assigned, none lost

All 449 original tests / 1,672 questions were remapped onto Bennett ids. Six
pairs merged where Bennett is coarser (`ag-decl3`+`ag-decl3i` → *Third
Declension*). The verb-**tense** drills had no counterpart — Bennett organises
verb forms by **conjugation**, not tense — so they went to the syntax sections
governing those tenses (`ag-verb-impf`/`ag-verb-fut` → *Tenses of the
Indicative*). This is **already applied and does not need re-running**; the
one-shot mapping script was not kept, since the old `ag-*` files no longer
exist to remap.

### 4. Core + UI changes

- `GrammarSection` gained a **`family` field**. Families come from the content,
  not from guessing id prefixes (`packages/core/src/families.ts`).
- `Progress.topicMastery: Record<string, number>` — cumulative 1–4 mastery per
  topic (good/easy +1, hard +0.5, again −1, clamped). Absent in older progress
  files; the `Session` constructor defaults it.
- `Session.grammarMap()` / `familyProgress()` / `overallPercent()` feed the map.
- **Grammar map** (`m` key, `apps/cli/src/app.tsx`): one cell per topic no
  longer fits (135 topics ≈ 161 columns), so it is now 9 fixed-width family
  bars plus the selected family expanded per-topic — 66 columns. `← →` walks
  topics, `↑ ↓` jumps family, `Enter` quizzes the selected topic immediately.
- Vocab cards were flipped to English → Latin.

## Current state — content is COMPLETE

| | |
|---|---|
| Topics | **135** |
| Topics with exercises | **135 — full coverage**, no gaps, no orphan files |
| Tests / questions | **1,065 / 3,916** (was 449 / 1,672 before the migration) |
| Distinct inflected forms | 8,736 |
| Duplicate prompts / answers | 0 / 0 |
| Vocab resolving in `lemmas.json.gz` | 95.6% of occurrences |
| Tests | 20 passing (`pnpm -r test`) |
| Typecheck + build | clean |
| Git | **everything still uncommitted on `main`** (~140 changed/untracked paths) |

The generation task described below is **done**. The procedure is kept because
it is how you add or regenerate topics, not because work is outstanding.

Every topic is practisable. The `· no tests` path described below is still
live in the code and still tested — it just has nothing to display right now.

## The generator, and the bugs already fixed in it

`scripts/gen-tests.mjs` writes ~6 tests × 4 questions per topic. It drives
`claude -p`, seeds vocabulary from frequency ranks 400–6000, and drops any item
containing a Latin form absent from `dictionary.db`. It **skips topics that
already have a file**, so rerunning always resumes. It resolves the reference
databases at `../language_learning/languages/latin`; override with
`LATIN_REF=/path/to/languages/latin`.

(It used to live in a session scratchpad, which does not survive a restart. It
is now in the repo alongside the parser.)

**Each usage-limit window yields roughly 14 topics, then blocks.** Three bugs
were found and fixed while chasing that — worth knowing, because the old
symptoms are all over the logs in the scratchpad:

1. A usage-limit rejection makes `claude -p` exit **non-zero** while printing
   its JSON envelope, so it is caught by the `execFileSync` handler — not by
   the `is_error` branch. An earlier fix put the retry logic in the unreachable
   branch and silently did nothing. Detection now keys on
   `duration_api_ms: 0` + `is_error: true` (the message text can be empty).
2. Transient failures used to consume the topic's call budget, so one limit
   window abandoned ~98 topics in under an hour while still printing "Done".
   Now they retry on a 30s → 60s → 2m → 5m → 10m ladder without spending
   budget, and after **two consecutive fully-blocked topics the run stops** with
   a message rather than burning through the rest.

3. Validation waved through *any* capitalised token as a proper noun, which
   exempted the first word of every answer — Latin capitalises it by position —
   from dictionary checking entirely. Only mid-sentence capitals get that pass
   now. **Do not loosen this again**; it is the project's only quality gate on
   generated Latin.

## Generating exercises (reference — the backlog is cleared)

### What "missing" means

A topic with no `content/tests/<id>.json` is **not a broken state**. The app
handles it deliberately and everywhere:

- `Content.testsFor()` returns `[]`, `Content.topicIds()` filters it out, so the
  scheduler never introduces it as a new topic;
- `Session.grammarMap()` marks it `hasTests: false`;
- the grammar map draws it as a normal cell but labels the detail line
  `· no tests`, and pressing Enter on it flashes "No tests for … yet" instead of
  starting a quiz;
- there is a regression test for this (`core.test.ts`, "marks due topics and
  topics that have no tests").

So you can stop at any point and ship. The only consequence is that the
uncovered slice of the syllabus is browsable but not practisable.

### Step 1 — see what is missing

```bash
python3 -c "
import json,glob,os
g=json.load(open('content/grammar.json'))
files={os.path.basename(f)[:-5] for f in glob.glob('content/tests/*.json')}
missing=[t['id'] for t in g if t['id'] not in files]
print(f'{len(g)-len(missing)}/{len(g)} covered, {len(missing)} missing')
for m in missing: print(' ', m)
"
```

### Step 2 — run the generator, repeatedly

```bash
node scripts/gen-tests.mjs --target 6 --per 6 --max 3 --sleep 3000
```

It only attempts topics with no file, so **just rerun it**; there is no resume
flag or state to manage. Expect roughly 60–200s per topic. A healthy line looks
like:

```
bn-088-the-intensive-pronoun  6 tests /  23 q  (kept 23/24 items · 1 calls · 64s)
```

Repeat until the coverage check prints `0 missing`. Historically each usage
window cleared about 14 topics before limits closed it.

### Step 3 — read *why* a topic produced nothing

Zero-yield topics have two very different causes; the log distinguishes them.

**Usage limits** — the run prints `transient (…) — retry N in Ns`, and after the
ladder is exhausted stops with `Stopping: 2 consecutive topics blocked by usage
limits`. Nothing is wrong with the content. Wait for quota and rerun; the
circuit breaker exists precisely so this costs you two topics' worth of
attempts rather than eighty.

**Content** — the run prints `call N error:` without `transient`, or reports
`kept 0/24 items`, meaning Claude produced sentences but every one contained a
Latin form absent from `dictionary.db`. Rerunning will not help much. See the
next step.

### Step 4 — the `kept 0/N` trap, and how it was fixed

Three topics scored a literal **0 out of 72** — `bn-245-reciprocal-pronouns`,
`bn-279-optative-subjunctive`, `bn-292-temporal-clauses-with-the-subjunctive`.
Not throttling, and not bad Latin: `dictionary.db` is a Wiktionary dump built
around *inflected* forms and has no `forms` row for most indeclinables. **47 of
the commonest are missing**, including `utinam`, `antequam`, `priusquam`,
`quoad`, `inter` and `invicem`.

A test is dropped when any single word fails validation, so a topic *defined* by
one of those words loses every item it generates, forever, no matter how many
times you rerun. Extending `FUNCTION_WORDS` in `scripts/gen-tests.mjs` with the
verified-absent indeclinables took those three topics from 0% to **97.2%** on
the next run.

If a new topic ever reports `kept 0/N`, check its defining function word first:

```bash
node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("../language_learning/languages/latin/dictionary.db", { readOnly: true });
const q = db.prepare("select 1 from forms where form_norm = ? limit 1");
for (const w of ["utinam","antequam","quoad"]) console.log(w, !!q.get(w));
'
```

Add genuinely-indeclinable misses to `FUNCTION_WORDS`. **Never** relax the check
for inflected forms — that is the project's only quality gate on generated
Latin, and it has already been weakened twice by accident (the capitalised
first-word hole, and this over-narrow allowlist).

### Step 5 — topics that might still generate poorly

I predicted the reference-apparatus sections would resist generation. **They
did not** — the principal-parts lists, defective verbs, style sections and
"peculiarities" lists all produced full sets. Keep an eye on them anyway if you
regenerate, since they are the weakest fit for a translation exercise:

- `bn-120…123-principal-parts-*` — four bare lists of verb principal parts.
- `bn-133-defective-verbs`, `bn-134-inquam`, `bn-135-ajo-i-say`,
  `bn-136-fari-to-speak`, `bn-137-other-defective-forms` — tiny paradigm
  fragments of verbs with few usable forms.
- `bn-353…356-style-*`, `bn-348-word-order`, `bn-350/351` — prose-style advice
  with no single correct translation.
- `bn-357…359-peculiarities-*` — lists of idiomatic exceptions.

Observed low yields: `bn-078-numerals` (kept 16/56 — numeral forms are sparse
in `dictionary.db`), `bn-054-defective-nouns` (4 tests), `bn-324-subjunctive-
by-attraction` (20/36) and `bn-341-coordinate-conjunctions` (19/40). All still
produced usable material. Overall the run kept 63.6% of generated items.

If a topic resists after two or three honest attempts, **leave it uncovered**.
That is a supported state (see above), and it is better than shipping
low-quality or unvalidated exercises. Do not be tempted to relax the dictionary
validation to force a pass — that check is the project's whole quality
guarantee, and it has already been weakened once by accident (the capitalised
first-word hole).

### Step 6 — verify what was generated

```bash
python3 -c "
import json,glob,os
bad=[]
for f in sorted(glob.glob('content/tests/*.json')):
    t=json.load(open(f)); sid=os.path.basename(f)[:-5]
    if not isinstance(t,list) or not t: bad.append((sid,'empty')); continue
    for i,x in enumerate(t,1):
        if x['sectionId']!=sid: bad.append((sid,'sectionId'))
        if x['id']!=f'{sid}-t{i}': bad.append((sid,'id numbering'))
        if not 3<=len(x['questions'])<=4: bad.append((sid,'question count'))
        for q in x['questions']:
            if q['kind']!='translate-en-la': bad.append((sid,'kind'))
print('malformed:', bad or 'none')
print('files:', len(glob.glob('content/tests/*.json')))
"
pnpm -r test
```

A corpus-level audit is worth running once generation finishes — it catches the
failure modes the per-file check cannot (the generator only de-duplicates
*within* a topic, so cross-topic repeats are possible in principle):

```bash
python3 - <<'EOF'
import json, glob, os, gzip, unicodedata
from collections import Counter
def norm(w):
    s = unicodedata.normalize("NFD", w.strip().lower())
    return "".join(c for c in s if not unicodedata.combining(c)).replace("j","i").replace("v","u")
qs = [q for f in glob.glob('content/tests/*.json')
      for t in json.load(open(f)) for q in t['questions']]
print(f"{len(qs)} questions")
for field in ("prompt", "answer"):
    c = Counter(q[field].strip().lower() for q in qs)
    print(f"  duplicate {field}s:", sum(1 for v in c.values() if v > 1))
forms = Counter(v for q in qs for v in q['vocab'])
lem = json.loads(gzip.open('content/lemmas.json.gz').read().decode('utf8'))
hit = sum(n for w, n in forms.items() if norm(w) in lem)
print(f"  distinct inflected forms: {len(forms)}")
print(f"  resolving in lemmas.json.gz: {hit/sum(forms.values()):.1%} of occurrences")
EOF
```

Reference figures measured at 57/135 topics covered — later runs should stay in
this range, and a sharp drop means something regressed:

| | |
|---|---|
| Duplicate prompts / answers | 0 / 0 |
| Distinct inflected forms | 5,830 as the block counts them, i.e. case-sensitively; 5,305 case-folded, against 4,791 for the original 38-topic corpus |
| Vocab resolving in `lemmas.json.gz` | 95.8% of occurrences, 93.1% of distinct forms |

That ~5% shortfall is expected and pre-existing — `lemmas.json.gz` is only the
top ~7k lemmas, so proper nouns (`Athēnās`, `Aegyptō`) and some sentence-initial
capitals miss. Generated Latin is validated against the far larger
`dictionary.db`, not this map. The consequence is only that pressing `v` on such
a word shows "No dictionary match".

Then eyeball a couple of new files — the questions should exercise *that*
topic, not generic Latin:

```bash
python3 -c "
import json
for t in json.load(open('content/tests/bn-338-the-gerund.json'))[:1]:
    for q in t['questions']: print(q['prompt'],'\n  ->',q['answer'])
"
```

### Definition of done

- Coverage check prints `0 missing`, **or** the only gaps are topics from Step 4
  and you have noted which and why.
- `pnpm -r test`, `pnpm --filter @latin-tutor/cli typecheck`,
  `pnpm --filter @latin-tutor/core build` all clean.
- The malformed-file check prints `none`.
- Then do the queued slug fix and commit (see TODO below).

## Remaining TODO

1. ~~Finish generation~~ — **done**, 135/135 topics covered.
2. ~~Slug fix~~ — **done**. `bn-341-co-rdinate-conjunctions` is now
   `bn-341-coordinate-conjunctions`, test file renamed with it, no orphans.
3. **Commit — the only outstanding task.** Nothing has been committed; the tree
   still sits on the single original commit, with ~140 changed/untracked paths.
4. Not done: the CLI has not been driven interactively against the full
   135-topic syllabus. Automated tests, a scripted render of the map, and the
   full content audit all pass, but no human has used it end to end.

## Gotchas

- **The filename is the section id.** `content/tests/<sectionId>.json`; the
  `sectionId` field inside is never read at runtime. A mismatch fails silently
  — the tests simply become dead weight. Check both directions after any rename.
- **No load-time validation.** `apps/cli/src/content-loader.ts` is
  `JSON.parse(...) as T`. Malformed JSON kills startup; a wrong id is silent.
- **`packages/core/dist/` is stale gitignored output.** `package.json` points
  `main`/`types`/`exports` at `./src/index.ts`; nothing loads `dist/`.
- **`lemmas.json.gz` covers only ~7k lemmas** and cannot resolve ~6.5% of the
  bundle's own forms — generated vocab is validated against `dictionary.db`
  instead. A student pressing `v` on a rare word may see "No dictionary match".
- Section `text` holds flattened paradigm tables, so it is many short lines.
  The map clips to 5 lines / 400 chars; the `g` drawer clips at 1200.

## Verify

```bash
pnpm -r test                              # 20 tests
pnpm --filter @latin-tutor/cli typecheck
pnpm --filter @latin-tutor/core build
pnpm cli -- --progress /tmp/scratch.progress.json   # press m for the map
```
