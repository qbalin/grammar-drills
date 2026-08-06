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
#    should be the kind of language the pack teaches. Latin's is listed below.
mkdir -p languages/<pack>/reference/texts
cp ~/downloads/*.txt languages/<pack>/reference/texts/

# 3. The frequency list, which joins the corpus against the dictionary.
python3 scripts/reference/ingest_frequency.py --lang <pack>

# 4. Check the fold agrees with what was just written, before building anything
#    on top of it. This is gate D2, and it is the one that fails silently later.
node --import tsx scripts/validate-pack.mjs --pack languages/<pack> \
  --ref languages/<pack>/reference --require-ref --profile-only

# 5. The pack's dictionary and its paradigms, then its citations, then the
#    committed frequency list.
#
#    SHIP THE WHOLE DICTIONARY. Every word the reference holds, each with a
#    gloss — not only the words the corpus ranks. See "How much to ship" below;
#    this is the default and there is no reason to turn it off.
#
#    --max-rank is how far down the frequency list to build the *ranked* half;
#    pass more than the list is long to take all of it.
node --import tsx scripts/build-lemmas.mjs --pack languages/<pack> \
  --ref languages/<pack>/reference --max-rank 20000
node --import tsx scripts/build-paradigms.mjs --pack languages/<pack> \
  --ref languages/<pack>/reference
node --import tsx languages/<pack>/citations.mjs --ref languages/<pack>/reference
node --import tsx scripts/make-reference.mjs --pack languages/<pack> \
  --ref languages/<pack>/reference
```

`build-paradigms` is optional and is what lets a student ask a word for its own
table; a pack without it shows citations and no tables. It needs
`profile.paradigms` to say how that language's forms are laid out, which is the
one part of it nobody else can write for you.

Step 5's five outputs are what gets committed (`build-lemmas` writes two files,
`content/lemmas.json.gz` and `content/forms.txt.gz`). After that the pack is
self-contained and the databases can be deleted.

## How much to ship: all of it

**A pack ships every word its reference dictionary holds, with a gloss for each.
Not only the words its corpus attests.** This is what `build-lemmas.mjs` does by
default and the reason `--no-tail` exists only to describe what packs used to do.

The mistake is easy to make and hard to see, because it fails silently and looks
like nothing. The frequency list is built from a corpus, and a corpus is a
handful of works: Latin's is seven. So a student who meets `reste` on a page and
looks it up was told *"not in the dictionary"* — not because the dictionary
lacked `restis`, which it has had all along with the ablative tagged, but
because Caesar, Cicero, Ovid, Catullus, Seneca, Augustine and Apicius between
them never needed a rope. Nothing in the pipeline complained. The pack looked
complete, every gate was green, and the app called a real word a mistake.

Two halves come out of one build, and they are not the same thing:

| | ranked | tail |
|---|---|---|
| what | the frequency list joined against the dictionary | every other lemma entry the dictionary holds |
| carries a `rank` | yes | **no**, deliberately |
| gloss | `SENSE_LIMIT` senses (6) | 2 senses, 140 chars |
| what it is for | the words the pack teaches | so a lookup always has an answer |

The missing `rank` is load-bearing twice. It sorts the tail behind every ranked
reading, so the crib still offers the word a student probably meant. And
`packReference.attests` tests for it, so gate C5 and `gen-tests`'s
`ok`/`unverified` classifier stay exactly as strict as they were when the pack
shipped ranked lemmas alone — a bigger dictionary must not make it easier for
the generator to pass off an obscure word as real.

What the tail is *not* is every row in the dictionary. Most of a Wiktionary dump
is wordform entries — 833,572 of Latin's 885,996 exist only to say "this is the
imperfect of that" — and each is already reachable through the forms table of
the entry it points at. `reference.lemmaEntries()` skips them by tag
(`form-of`, `inflection`, `participle`), and keeps `alt-of`, because an
alternative spelling is a word someone can meet and is not reachable any other
way. A Morpheus-derived reference like Greek's has no such rows and the same
rule simply finds nothing to skip.

It costs about 2 MB gzipped, on a download that already happens once, lazily,
and is then cached. Latin went from 19,292 lemmas to 55,312 and from a 2.1 MB
dictionary to 4.2 MB; Greek from 24,322 to 97,028 and 2.3 MB to 5.0 MB. Nothing
that is precached moved, so what the study loop costs offline is unchanged.

## The Latin corpus

`frequency.tsv.gz` is committed, so nothing in the ordinary run of things needs
this. It is here because a frequency list nobody can reproduce is a set of
numbers on trust, and step 3 above is the step a reader cannot repeat without
knowing what went into it.

Seven works, 3.4 MB of plain text, one file each:

| file | work | source |
|---|---|---|
| `apicius-de-re-coquinaria.txt` | Apicius, *De re coquinaria* | Project Gutenberg [#16439](https://www.gutenberg.org/ebooks/16439) |
| `augustine-confessiones.txt` | Augustine, *Confessiones* | Project Gutenberg [#33849](https://www.gutenberg.org/ebooks/33849) |
| `caesar-de-bello-gallico.txt` | Caesar, *De bello Gallico* I–IV | Project Gutenberg [#218](https://www.gutenberg.org/ebooks/218) |
| `catullus-carmina.txt` | Catullus, *Carmina* | Project Gutenberg [#23294](https://www.gutenberg.org/ebooks/23294) |
| `cicero-orationes.txt` | Cicero, *Orationes* | Project Gutenberg [#226](https://www.gutenberg.org/ebooks/226) |
| `ovid-opera.txt` | Ovid, *Metamorphoses* and others | a public plain-text edition |
| `seneca-opera.txt` | Seneca, *Epistulae morales* and others | a public plain-text edition |

The Gutenberg files are used as downloaded — `ingest_frequency.py` strips the
licence boilerplate itself (`START OF THE PROJECT GUTENBERG EBOOK` … `END OF`),
so trimming them by hand would only make the corpus harder to check. The last
two carry no such header and are the two whose exact edition is not recoverable
from the file; the ranks are not delicate about it, since a lemma's rank is
decided by its share across the whole corpus and these are two works of seven.

Anyone rebuilding this should expect the ranks to move a little, and everything
downstream of them with it. `make-reference.mjs --check` is how you tell whether
what you built is still the file the repo committed.

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
