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
| `content/` | **generated**, and what ships: `grammar.json`, `tests/*.json`, `lemmas.json.gz` |
| `grammar/parse.py` | builds `grammar.json` from a public source it downloads |
| `gen/config.mjs` | what the question generator needs to know about this language |
| `citations.mjs` | rewrites citations in `lemmas.json.gz`; needs the reference dictionary |
| `reference/frequency.tsv.gz` | committed, ~200 KB; ranked lemmas for the gates |
| `fold.fixtures.json` | pairs that must fold alike and pairs that must not |
| `icon.mjs` | the app icon's glyph, as capsules or an SVG path |
| `confetti.mjs` | the silhouettes thrown every 10–20 answers, and which may share a burst |
| `BASELINE.json` | what the pack measured when last validated — a record, not an input |

Do not hand-edit anything under `content/`; regenerate it.

## Commands

```bash
pnpm -r test && node scripts/check-core-purity.mjs      # what CI runs
node --import tsx scripts/validate-pack.mjs --pack languages/latin   # every gate
LANG_PACK=latin pnpm --filter @lang-tutor/web build
```

Scripts importing `@lang-tutor/core` need `node --import tsx`; the few that do
not are plain `node`.

`validate-pack` is the answer to "is this pack ready" — it composes the grammar
and coverage reports and exits non-zero on any failure. Greek is a draft and
takes `--allow-incomplete`, which reports the how-much-is-written gates without
letting them decide the exit code. Nothing about correctness is relaxed by it.

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
