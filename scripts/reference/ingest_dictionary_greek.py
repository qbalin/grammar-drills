"""Build the Ancient Greek dictionary.db from the Eulexis lexical data.

Source: https://github.com/PhVerkerk/Eulexis_off_line (GPLv3), whose
Eulexis_data/ holds a Morpheus-derived analysis table and a trilingual gloss
list, both in Beta Code:

  analyses_gr.txt        lookup key TAB {[surface,]lemma TAB morphology}...
  trad_gr_en_fr_de.csv   lemma TAB english TAB french TAB german
  betunicode_gr.csv      the Beta Code -> Unicode table

Run:
  python3 scripts/reference/ingest_dictionary_greek.py [--lang ancient-greek] [--data DIR]

This replaces languages/<pack>/reference/dictionary.db wholesale. The schema is
the one ADDING_A_LANGUAGE.md Appendix A specifies, and the normalized columns
are produced by greek.greek_fold — the same fold the pack declares, so that a
lookup keyed on one side finds the row written by the other.
"""
import collections
import csv
import io
import json
import os
import re
import sqlite3
import sys

from common import JsonArgumentParser, db_path, out
import greek

SCHEMA = """
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS forms;
DROP TABLE IF EXISTS meta;
CREATE TABLE entries (
  id        INTEGER PRIMARY KEY,
  word      TEXT NOT NULL,
  word_norm TEXT NOT NULL,
  pos       TEXT,
  data      TEXT NOT NULL
);
CREATE TABLE forms (
  form      TEXT NOT NULL,
  form_norm TEXT NOT NULL,
  tags      TEXT,
  entry_id  INTEGER NOT NULL REFERENCES entries(id)
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
"""

INDEXES = """
CREATE INDEX idx_forms_norm   ON forms(form_norm);
CREATE INDEX idx_forms_entry  ON forms(entry_id);
CREATE INDEX idx_entries_norm ON entries(word_norm);
-- Exact spelling as well as folded: the frequency builder resolves a fully
-- accented corpus token before it falls back to the forgiving index.
CREATE INDEX idx_forms_exact   ON forms(form);
CREATE INDEX idx_entries_exact ON entries(word);
"""

# {surface,lemma TAB morphology} — the surface is written only where it differs
# from the record's own lookup key, which is most often an unaccented spelling.
ANALYSIS = re.compile(r"\{([^{}\t]*)\t([^{}]*)\}")

# A physical line holds one or more records, not exactly one: Eulexis packs
# several keys onto a line as `key TAB {..}{..} TAB key TAB {..}`. Reading the
# first key as the line's key silently files every later record's forms under
# the wrong spelling — λογῶν, a participle of λογάω, arrives as the genitive
# plural of λόγος and looks perfectly plausible in the table.
RECORD = re.compile(r"([^\t{}]+)\t((?:\{[^{}]*\})+)")


def records(path):
    """Every (lookup key, analyses) record in the file, in order."""
    for line in io.open(path, encoding="utf-8"):
        for m in RECORD.finditer(line):
            yield m.group(1), m.group(2)


def split_analysis(head: str):
    """'e)/bale,ba/llw' -> ('e)/bale', 'ba/llw'); 'ba/llw' -> (None, 'ba/llw').

    Double-compound verbs list their preverbs as extra fields
    ('a)nafeyhme/na_s,a)na/,a)po/-e(ya/w'); the lemma is always the last.
    """
    parts = head.split(",")
    if len(parts) == 1:
        return None, parts[0]
    return parts[0], parts[-1]


def read_glosses(data_dir):
    """Lemma (Beta Code) -> short English gloss.

    Eulexis leaves the English column empty for most proper names and for
    entries it never translated, so this covers about four lemmas in five.
    """
    glosses = {}
    path = os.path.join(data_dir, "trad_gr_en_fr_de.csv")
    with io.open(path, encoding="utf-8") as fh:
        for row in csv.reader(fh, delimiter="\t"):
            if len(row) > 1 and row[0] and row[1].strip():
                glosses[row[0]] = row[1].strip()
    return glosses


def survey(path, unknown):
    """First pass: what part of speech is each lemma, and what gender.

    Both answers need every analysis of a lemma at once — a lemma is a verb if
    any of its forms is a finite one, and a noun's gender is the one most of its
    forms agree on — so they cannot be decided while streaming the forms out.
    """
    tags_by_lemma = collections.defaultdict(set)
    genders_by_lemma = collections.defaultdict(collections.Counter)
    analyses = 0

    for _, blob in records(path):
        for m in ANALYSIS.finditer(blob):
            _, lemma = split_analysis(m.group(1))
            if not lemma:
                continue
            analyses += 1
            tags, unknown_tokens = greek.parse_morph(m.group(2))
            unknown.update(unknown_tokens)
            tags_by_lemma[lemma].update(tags)
            for g in greek.GENDERS.intersection(tags):
                genders_by_lemma[lemma][g] += 1
    return tags_by_lemma, genders_by_lemma, analyses


def build_entries(tags_by_lemma, genders_by_lemma, glosses):
    """One entry per lemma: the printed headword, its part of speech, a gloss."""
    entries = {}
    for lemma_beta, tags in tags_by_lemma.items():
        word = greek.beta_to_unicode(lemma_beta)
        pos = greek.pos_of(word, [tags])
        sense_tags = []
        if pos in ("noun", "name"):
            gender = greek.gender_of(genders_by_lemma.get(lemma_beta, {}))
            if gender:
                sense_tags.append(gender)
        entries[lemma_beta] = {
            "word": word,
            "word_norm": greek.greek_fold(word),
            "pos": pos,
            "gloss": glosses.get(lemma_beta, ""),
            "tags": sense_tags,
        }
    return entries


def write_forms(db, path, entry_ids, stats):
    """Second pass: every analysis becomes a row under its lemma's entry.

    The form written is the analysis's own surface where it has one, because
    that is the accented spelling as printed; the line's lookup key is a
    degraded form Eulexis indexes by. Rows are deduplicated on
    (form, tags, entry) — the same parse recurs once per dialect the analysis
    names, and the dialects are already in the tags.
    """
    seen = set()
    batch = []
    for key, blob in records(path):
        for m in ANALYSIS.finditer(blob):
            surface, lemma = split_analysis(m.group(1))
            entry_id = entry_ids.get(lemma)
            if entry_id is None:
                continue
            form = greek.beta_to_unicode(surface or key)
            if not form or form.startswith("'"):
                # Aphaeresis ('βαλε for ἔβαλε): a spelling the fold does not
                # reach, so it would never be matched by anything a student types.
                stats["aphaeresis"] += 1
                continue
            tags, _ = greek.parse_morph(m.group(2))
            row = (form, entry_id, tags)
            if row in seen:
                stats["duplicate"] += 1
                continue
            seen.add(row)
            batch.append((form, greek.greek_fold(form), ",".join(tags), entry_id))
            if len(batch) >= 50000:
                db.executemany("INSERT INTO forms VALUES (?,?,?,?)", batch)
                batch = []
    if batch:
        db.executemany("INSERT INTO forms VALUES (?,?,?,?)", batch)


def main():
    ap = JsonArgumentParser(description=__doc__)
    ap.add_argument("--lang", default="ancient-greek")
    ap.add_argument("--data", default=greek.DATA,
                    help="directory holding the Eulexis data files")
    a = ap.parse_args()

    analyses_path = os.path.join(a.data, "analyses_gr.txt")
    if not os.path.exists(analyses_path):
        ap.error(f"no analyses_gr.txt in {a.data} — see the module docstring "
                 f"for where to fetch the Eulexis data")

    unknown = collections.Counter()
    print("surveying analyses...", file=sys.stderr)
    tags_by_lemma, genders_by_lemma, analyses = survey(analyses_path, unknown)
    if unknown:
        # A morphology vocabulary that has grown a token this build does not
        # know would otherwise write silently untagged rows.
        ap.error(f"unmapped morphology tokens: {dict(unknown.most_common(20))}")

    glosses = read_glosses(a.data)
    entries = build_entries(tags_by_lemma, genders_by_lemma, glosses)

    path = db_path(a.lang, "dictionary.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".db.tmp")
    if tmp.exists():
        tmp.unlink()
    db = sqlite3.connect(tmp)
    db.executescript(SCHEMA)

    entry_ids = {}
    rows = []
    for i, (lemma_beta, e) in enumerate(sorted(entries.items()), start=1):
        entry_ids[lemma_beta] = i
        data = {"senses": [{"gloss": e["gloss"], "tags": e["tags"]}]}
        rows.append((i, e["word"], e["word_norm"], e["pos"],
                     json.dumps(data, ensure_ascii=False)))
    db.executemany("INSERT INTO entries VALUES (?,?,?,?,?)", rows)
    print(f"{len(rows)} entries; writing forms...", file=sys.stderr)

    stats = collections.Counter()
    write_forms(db, analyses_path, entry_ids, stats)
    db.executescript(INDEXES)

    form_count = db.execute("SELECT count(*) FROM forms").fetchone()[0]
    pos_counts = dict(db.execute(
        "SELECT pos, count(*) FROM entries GROUP BY pos ORDER BY 2 DESC").fetchall())
    glossed = db.execute(
        "SELECT count(*) FROM entries WHERE data NOT LIKE '%\"gloss\": \"\"%'").fetchone()[0]
    db.executemany("INSERT INTO meta VALUES (?,?)", [
        ("source", "Eulexis (PhVerkerk/Eulexis_off_line), GPLv3"),
        ("fold", "greek.greek_fold — profile.fold variant A"),
        ("analyses", str(analyses)),
    ])
    db.commit()
    db.close()
    path.unlink(missing_ok=True)
    tmp.rename(path)

    out({
        "db": str(path),
        "entries": len(rows),
        "forms": form_count,
        "analyses": analyses,
        "pos": pos_counts,
        "glossed_pct": round(glossed / len(rows) * 100, 1),
        "skipped": dict(stats),
    })


if __name__ == "__main__":
    main()
