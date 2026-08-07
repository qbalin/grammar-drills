# lang-tutor

A spaced-repetition language tutor that runs with **no LLM at runtime**. The app
is a static site; everything a student meets was generated offline and shipped
as data. `README.md` is the long version.

## Layout

```
packages/core      the engine — scheduler, fold, session, storage. Knows no language.
apps/web           the PWA. One build per pack; the language is compiled in.
apps/cli           the same content, read straight off disk.
languages/<pack>   a language pack (latin, ancient-greek)
scripts/           offline tooling: build, generate, validate
```

A pack is the unit of work. Every script takes `--pack languages/<id>` (or
`$LANG_PACK`), and making a script work for a second language means never
hardcoding the first. `scripts/check-core-purity.mjs` enforces the matching rule
for the engine: `packages/core` must not learn a language.

## Inside a pack

| path | what it is |
|---|---|
| `profile.json` | the pack's contract — fold, families, thresholds, UI strings |
| `content/` | **generated**, and what ships: `grammar.json`, `tests/*.json`, `lemmas.json.gz` + `forms.txt.gz` |
| `grammar/parse.py` | builds `grammar.json` from a public source it downloads |
| `gen/config.mjs` | what the question generator needs to know about this language |
| `citations.mjs` | rewrites citations in `lemmas.json.gz`; needs the reference dictionary |
| | *the dictionary is split: a lemma table plus a sorted form index over it* |
| `reference/frequency.tsv.gz` | committed, ~200 KB; ranked lemmas for the gates |
| `fold.fixtures.json` | pairs that must fold alike and pairs that must not |
| `icon.mjs` | the app icon's glyph, as capsules or an SVG path |
| `confetti.mjs` | the silhouettes thrown every 10–20 answers, and which may share a burst |
| `BASELINE.json` | what the pack measured when last validated — a record, not an input |

Do not hand-edit anything under `content/`; regenerate it.

A pack ships **every word its reference dictionary holds, each with a gloss** —
not only the words its corpus attests. `build-lemmas.mjs` does this by default.
Ship the corpus's vocabulary alone and the app tells a student that a perfectly
ordinary word is not a word, silently, with every gate green. See "How much to
ship" in `scripts/reference/README.md`.

## Commands

```bash
pnpm -r test && node scripts/check-core-purity.mjs      # what CI runs
node --import tsx scripts/validate-pack.mjs --pack languages/latin   # every gate
LANG_PACK=latin pnpm --filter @lang-tutor/web build
```

Scripts importing `@lang-tutor/core` need `node --import tsx`; the few that do
not are plain `node`.

`validate-pack` is the answer to "is this pack ready" — it composes the grammar,
coverage and attestation reports and exits non-zero on any failure. Greek is a
draft and takes `--allow-incomplete`, which reports the how-much-is-written gates
without letting them decide the exit code. Nothing about correctness is relaxed
by it, the attestation gates included.

`profile.attestation` is what a pack may ship that its own content cannot
confirm — `maxMissesPerQuestion` (distinct forms in one answer, and the bar the
generator writes to) and `maxUnattestedForms` (tokens across the pack). Both are
measurements a pack was admitted at rather than targets.

They move in one of two ways and no others. **Down**, in the commit that earns
the reduction. **Up**, only in the commit that generates the content needing it,
and only by what that content actually measures — because a reference is not a
language: a pack that could never raise this number could never teach a form its
dictionary happens not to list, and both of these do. Latin's archaic gerundives
live in the topic on peculiarities of conjugation; Greek's future optatives live
in the topics on indirect discourse. What is never allowed is raising it to make
an unrelated red build green, which is the whole difference between a budget and
an excuse. Say which questions bought the increase in the commit message.

**A pack that declares no `attestation` block is held to 0/0**, so a language
added later inherits the strict rule by saying nothing.

## The reference

Attestation ("is this a real word") and the vocabulary band come from
`scripts/lib/reference.mjs`, which has two backends. By default it answers from
the pack's own committed content and needs nothing external — this is why the
gates run in CI. Pass `--ref <dir>` and it uses the full reference databases
instead.

Only `scripts/build-lemmas.mjs` and a pack's `citations.mjs` require the
dictionary, because they are what build the committed content out of it. Both
refuse to run without one and say how to get one:
`scripts/reference/README.md`.

Do not reintroduce a dependency on a checkout outside this repo. It is meant to
be self-contained.
