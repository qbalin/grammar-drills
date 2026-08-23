# What this repository ships, and under what

This file covers **content** — the things a pack ships and the app displays. It
is not a licence for the code, which this repository still does not have one for;
`scripts/reference/README.md` notes the same gap and it is worth closing.

## Why this file exists now

The packs have shipped derived content from the start: `content/lemmas.json.gz`
is built from a Wiktionary extract and is therefore CC BY-SA already. What is new
is that a pack now ships a **further dictionary** — a lexicon whose articles are
put in front of a student as that book's own prose, at length, under its own
name. Attribution stops being a line in a file nobody opens and becomes something
the screen has to say, which is why `profile.dictionaries[].source.licence` is
rendered in the sheet that displays the articles rather than only recorded.

## Per source

| what | where it ships | source | licence |
|---|---|---|---|
| Bennett, *New Latin Grammar* (1908) | `languages/latin/content/grammar.json` | Project Gutenberg #15665 | public domain |
| Lane, *A Latin Grammar* (1898) | `languages/latin/content/grammars/lane.json` | Project Gutenberg #44653 | public domain |
| Smyth, *A Greek Grammar* | `languages/ancient-greek/content/grammar.json` | Alpheios `grammar-smyth` | CC BY-SA 3.0 |
| **Lewis & Short, *A Latin Dictionary* (1879)** | `languages/latin/content/dictionaries/lewis-short.*` | [PerseusDL/lexica](https://github.com/PerseusDL/lexica) | **CC BY-SA 4.0** |
| Latin lemmas and glosses | `languages/latin/content/lemmas.json.gz` | Wiktionary, via kaikki.org | CC BY-SA 4.0 |
| Ancient Greek lemmas and glosses | `languages/ancient-greek/content/lemmas.json.gz` | Eulexis / Morpheus | GPLv3 |

The reference databases those last two are built from are never committed — see
`scripts/reference/README.md`, which carries the same licensing note and the
`PROVENANCE.txt` each snapshot travels with.

## What CC BY-SA asks of a build that ships Lewis & Short

**Attribution, where the work is read.** The Inspect sheet prints the dictionary's
label and its `source.licence` beneath every article it shows. Removing that line
is not a cosmetic change.

**Share-alike.** The articles as this repo ships them are a derived work: they are
reparsed out of Perseus's TEI into the pack's own article shape, with Beta Code
transcoded to Unicode. That derivative is CC BY-SA 4.0, and anything built from
`content/dictionaries/` inherits it.

**Not the whole app.** The share-alike travels with the content, not with the code
that reads it. `packages/core` knows nothing about any dictionary; it holds an
index and a lookup.

## Adding a further dictionary

A new one declares its own `source.licence` in `profile.dictionaries` and gains a
row above. Two things are worth checking before it is worth parsing:

- **That the source is the text**, not a client for it. The obvious candidate for
  Latin was Forcellini, whose best-known "offline" distribution turns out to be a
  152 KB GoldenDict wrapper that fetches one word at a time from a third-party
  server. There is no lexicon in it, and its CC0 covers the wrapper.
- **That the licence is the data's.** A repository's `LICENSE` file describes what
  that repository holds. Where it holds a downloader, that is what has been
  licensed.
