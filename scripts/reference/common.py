"""Shared helpers for the reference ingest scripts.

Every script here prints a single JSON document to stdout, so a caller never
has to scrape prose to find out what happened.

Paths follow this repo's pack layout rather than the tutor project these came
from: a pack is `languages/<pack-id>` with a hyphenated id, and everything the
ingest produces lands in `languages/<pack-id>/reference/` —

    languages/latin/reference/dictionary.db
    languages/latin/reference/frequencies.db
    languages/latin/reference/texts/*.txt      (the corpus, yours to supply)

which is exactly the directory shape `--ref` expects, so a freshly built
reference can be used without moving anything:

    node --import tsx scripts/validate-pack.mjs --pack languages/latin \\
      --ref languages/latin/reference --require-ref
"""
import argparse
import json
import sqlite3
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LANGUAGES = ROOT / "languages"

DICT_DB = "dictionary.db"
FREQ_DB = "frequencies.db"


class JsonArgumentParser(argparse.ArgumentParser):
    """ArgumentParser whose errors are JSON on stdout, like every other
    output of these scripts, so a caller never has to scrape usage text."""

    def error(self, message):
        print(json.dumps({"error": message,
                          "usage": self.format_usage().strip()},
                         ensure_ascii=False))
        sys.exit(2)


def lang_dir(lang: str) -> Path:
    """The pack's reference directory, e.g. `languages/ancient-greek/reference`.

    Pack ids are taken as written. The project these scripts came from spelled
    its directories with underscores (`ancient_greek`) and munged spaces into
    them, which is precisely the mismatch that used to make the reference
    resolve to nothing for any pack whose id is more than one word.
    """
    return LANGUAGES / lang.strip() / "reference"


def db_path(lang: str, name: str) -> Path:
    return lang_dir(lang) / name


def open_db(lang: str, name: str, must_exist: bool = True) -> sqlite3.Connection:
    path = db_path(lang, name)
    if must_exist and not path.exists():
        die(f"{name} not found for pack '{lang}' (expected {path}). "
            f"Run the matching ingest script first.")
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def out(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=1, default=str))


def die(msg: str, **extra) -> None:
    print(json.dumps({"error": msg, **extra}, ensure_ascii=False), file=sys.stdout)
    sys.exit(1)


def normalize(word: str, lang: str = "") -> str:
    """Lowercase, strip diacritics; language-specific letter folding.

    This writes `word_norm` and `form_norm`, which is what every lookup in the
    app is keyed by — so it MUST agree with the pack's `profile.json` fold. It
    is a second implementation of the same rule in a second language, and the
    two drifting apart would turn every lookup into a miss while both halves
    looked healthy on their own. That is what validate-pack's D2 gate checks,
    and a new pack must add its rule here and then run D2 rather than assume.

    For Latin, macrons/breves are editorial and u/v, i/j are spelling variants,
    so both sides of a lookup are folded the same way.

    Greek delegates to greek.greek_fold, which also folds final sigma. Doing
    that here by hand would leave two spellings of the fold in the tree.
    """
    if lang.strip().lower() in ("ancient-greek", "ancient_greek", "greek", "grc"):
        from greek import greek_fold
        return greek_fold(word)
    s = unicodedata.normalize("NFD", word.strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    if lang.strip().lower() in ("latin", "la"):
        s = s.replace("j", "i").replace("v", "u")
    return s
