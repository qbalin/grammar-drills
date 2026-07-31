# Building a reference

The reference is a pair of SQLite databases per pack — a dictionary of every
inflected form, and a frequency-ranked lemma list. **You do not need them to
work on this repo.** Every gate, both reports and the question generator answer
from what each pack already ships (`content/lemmas.json.gz` and the committed
`reference/frequency.tsv.gz`), which is why none of this is a dependency.

You need them for exactly two things:

- **adding a language** — a new pack's `content/lemmas.json.gz` is built by
  `scripts/build-lemmas.mjs` out of a dictionary;
- **rebuilding citations** — `languages/<pack>/citations.mjs` needs the tagged,
  fully accented forms a citation is made of (`amō, amāre, amāvī, amātum`),
  which cannot be recovered from the shipped map because its keys are folded.

They are large — Latin's dictionary is 474 MB, Greek's 257 MB — so they are
built locally and never committed. `.gitignore` keeps them out.

## The scripts

Python 3, standard library only; no `pip install`.

| script | builds |
|---|---|
| `ingest_dictionary.py` | `dictionary.db` from a kaikki.org Wiktionary extract |
| `ingest_dictionary_greek.py` | `dictionary.db` for Ancient Greek, from Eulexis |
| `ingest_frequency.py` | `frequencies.db` from a corpus you supply |

Everything lands in `languages/<pack>/reference/`, which is the directory shape
`--ref` expects.

## A new language

```bash
# 1. The dictionary, straight off kaikki.org. --kaikki-name is the language as
#    Wiktionary spells it, when that differs from the pack id.
python3 scripts/reference/ingest_dictionary.py --lang latin
python3 scripts/reference/ingest_dictionary.py --lang old-english --kaikki-name "Old English"

# 2. A corpus. Plain text, one work per file — Project Gutenberg is the usual
#    source. What goes in here decides what the pack considers common, so it
#    should be the kind of language the pack teaches.
mkdir -p languages/<pack>/reference/texts
cp ~/downloads/*.txt languages/<pack>/reference/texts/

# 3. The frequency list, which joins the corpus against the dictionary.
python3 scripts/reference/ingest_frequency.py --lang <pack>

# 4. Check the fold agrees with what was just written, before building anything
#    on top of it. This is gate D2, and it is the one that fails silently later.
node --import tsx scripts/validate-pack.mjs --pack languages/<pack> \
  --ref languages/<pack>/reference --require-ref --profile-only

# 5. The pack's lemma map, then its citations, then the committed frequency list.
node --import tsx scripts/build-lemmas.mjs --pack languages/<pack> \
  --ref languages/<pack>/reference --max-rank 12000
node --import tsx languages/<pack>/citations.mjs --ref languages/<pack>/reference
node --import tsx scripts/make-reference.mjs --pack languages/<pack> \
  --ref languages/<pack>/reference
```

Step 5's three outputs are what gets committed. After that the pack is
self-contained and the databases can be deleted.

`ADDING_A_LANGUAGE.md` is the full playbook; Appendix A specifies the schema
these must produce, which matters if you build a dictionary some other way.

## `normalize` has to match the pack's fold

`common.py`'s `normalize()` writes `word_norm` and `form_norm`, the columns
every lookup is keyed by. It is a second implementation of the rule the pack
declares in `profile.json` under `fold`, and the two drifting apart turns every
lookup into a miss while both halves look healthy on their own.

A new language adds its rule to `normalize()` and then runs step 4 above. Do not
skip it on the grounds that the fold looks simple; that is exactly the case
where nobody notices.

## Ancient Greek

kaikki's Ancient Greek is too thin to inflect from, so Greek is built instead
from the lexical data shipped with
[Eulexis_off_line](https://github.com/PhVerkerk/Eulexis_off_line): a
Morpheus-derived analysis table and a trilingual gloss list, both in Beta Code.

Download `Eulexis_data/` from that repository (~90 MB) and put these four files
somewhere — `.cache/eulexis/` is the default, or pass `--data`:

    analyses_gr.txt   betunicode_gr.csv   LSJ.csv   trad_gr_en_fr_de.csv

```bash
python3 scripts/reference/ingest_dictionary_greek.py --lang ancient-greek
```

> **Licence.** `ingest_dictionary_greek.py` and `greek.py` derive from
> Eulexis_off_line, which is **GPLv3**, and the data they read is under that
> project's terms. This repository currently has no `LICENSE` file; decide what
> it should be before publishing, and note that these two files and their
> outputs are the part where the choice is constrained. The other scripts here
> are original and read public Wiktionary data.
