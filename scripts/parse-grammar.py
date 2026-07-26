#!/usr/bin/env python3
"""Build content/grammar.json from Bennett's *New Latin Grammar*.

Source: Charles E. Bennett, "New Latin Grammar" (Boston, 1908), Project
Gutenberg ebook #15665 — public domain, "almost no restrictions whatsoever".

The book's own run-headings define the topics: a topic is a run of consecutive
numbered sections sharing one heading. Parts I (sounds/accent/quantity), IV
(word formation) and VI (prosody) are dropped — none of them can carry an
English->Latin translation exercise — leaving Parts II (inflections),
III (particles) and V (syntax).

Usage:
    python3 scripts/parse-grammar.py [--src bennett.txt] [--out content/grammar.json]

With no --src the Gutenberg text is downloaded to a temporary file.
"""
import argparse, io, json, os, re, sys, tempfile, unicodedata, urllib.request
from collections import Counter

GUTENBERG_URL = "https://www.gutenberg.org/files/15665/15665-0.txt"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STARS = re.compile(r"^\s*(\*\s+){3,}\*?\s*$")
PART = re.compile(r"^PART ([IVX]+)\.\s*$")
CHAPTER = re.compile(r"^\s*CHAPTER ([IVXL]+)\.--_(.+?)(?:\s*§\s*\d+)?_\s*$")
# A numbered section opens a line: "34. The first declension..."
SECTION = re.compile(r"^(\d{1,3})\.(\s|$)")
# All-caps standalone heading, e.g. "THE ALPHABET." or "A. NOUNS."
HEADING = re.compile(r"^\s*(?:[A-Z]\.\s+)?[A-Z][A-Z \-,'\.À-ž]{3,}\.?\s*$")


def is_heading(line: str) -> bool:
    """A real heading, not a paradigm table row like 'SINGULAR.   PLURAL.'."""
    if not HEADING.match(line) or not line.strip():
        return False
    body = line.strip()
    # Table rows align columns with runs of spaces; headings do not.
    if re.search(r"\S {2,}\S", body):
        return False
    # Case labels and similar single-word table furniture.
    if body.rstrip(".") in {"SINGULAR", "PLURAL", "SING", "PLUR", "MASC", "FEM", "NEUT"}:
        return False
    return True


def load_body(src):
    t = io.open(src, encoding="utf-8-sig").read()
    s = t.index("*** START OF THIS PROJECT GUTENBERG EBOOK")
    e = t.index("*** END OF TH", s + 10)
    body = t[t.index("\n", s) + 1 : e]
    # The front matter repeats the whole table of contents. The real body
    # begins at the second "PART I." — the one followed by a star divider.
    starts = [m.start() for m in re.finditer(r"^PART I\.\s*$", body, re.M)]
    return body[starts[-1] :]


def parse(src):
    body = load_body(src)
    lines = body.split("\n")

    part = chapter = heading = pending = None
    sections = []
    cur = None
    last_n = 0

    for line in lines:
        if STARS.match(line):
            continue
        m = PART.match(line)
        if m:
            part, chapter, heading, pending = m.group(1), None, None, None
            continue
        m = CHAPTER.match(line)
        if m:
            chapter, heading, pending = m.group(2).strip(), None, None
            continue

        m = SECTION.match(line)
        # Section numbers run strictly upward; anything else numeric at line
        # start (verse line numbers, paradigm rows) is body text.
        if m and int(m.group(1)) == last_n + 1:
            n = int(m.group(1))
            last_n = n
            cur = {
                "n": n,
                "part": part,
                "chapter": chapter,
                # A heading covers a run of sections, so it carries forward
                # until the next one; `opens_group` marks where a run starts.
                "heading": heading,
                "opens_group": pending is not None,
                "lines": [line[m.end(1) + 1 :].lstrip()],
            }
            sections.append(cur)
            pending = None
            continue

        if cur is None:
            continue

        if is_heading(line):
            # A heading line belongs to the NEXT section, not the current one.
            heading = pending = line.strip().rstrip(".")
            continue

        cur["lines"].append(line)

    for s in sections:
        raw = "\n".join(s.pop("lines"))
        s["raw"] = raw.strip("\n")
    return sections



TEACHABLE_PARTS = {"II", "III", "V"}

def fold_ascii(text):
    """Strip diacritics so ids stay readable: Fīō -> fio (not f), Coördinate ->
    coordinate. Dropping them as 'not [a-z]' mangles the word instead."""
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if not unicodedata.combining(c)
    )

# Run-headings that are structural dividers or bare pointers, not topics.
SKIP_HEADINGS = {
    "INFLECTIONS", "A. NOUNS", "B. ADJECTIVES", "C. PRONOUNS",
    "PARTICLES", "SYNTAX", "NUMBER", "THE NOMINATIVE", "THE GENITIVE",
    "NOUN AND ADJECTIVE FORMS OF THE VERB",
}

# Headings that are paradigm-table furniture: the run-heading machinery picks
# up the last table label instead of a topic name, so the title is derived
# from the section's own opening line instead.
FURNITURE = {"IMPERATIVE", "SUBJUNCTIVE", "INDICATIVE MOOD", "PARTICIPLE", "INFINITIVE"}

CONJUGATION = {
    "amo": "First conjugation", "moneo": "Second conjugation",
    "rego": "Third conjugation", "audio": "Fourth conjugation",
    "capio": "Third conjugation (-iō verbs)",
}

# Groups the heading machinery gets wrong in a way no rule recovers.
TITLE_OVERRIDE = {
    120: "Principal parts: first conjugation",
    121: "Principal parts: second conjugation",
    122: "Principal parts: third conjugation",
    123: "Principal parts: fourth conjugation",
    175: "The accusative case",
    268: "Sequence of tenses",
    133: "Defective verbs",
    137: "Other defective forms",
    130: "Volō, nōlō, mālō",
    258: "Principal and historical tenses",
    289: "Cum clauses",
    291: "Antequam and priusquam with the indicative",
    292: "Temporal clauses with the subjunctive",
    # Part V repeats the Part II pronoun headings; disambiguate the syntax half.
    242: "Syntax of personal pronouns",
    243: "Syntax of possessive pronouns",
    244: "Syntax of reflexive pronouns",
    246: "Syntax of demonstrative pronouns",
    250: "Syntax of relative pronouns",
    252: "Syntax of indefinite pronouns",
    253: "Syntax of pronominal adjectives",
    # 'Hints on Latin Style' repeats the bare part-of-speech headings.
    347: "Syntax of adverbs",
    350: "Word-order: special principles",
    353: "Style: nouns",
    354: "Style: adjectives",
    355: "Style: pronouns",
    356: "Style: verbs",
}

# Bennett's own part/chapter structure, collapsed into display families.
def family_of(part, chapter, n):
    if part == "II":
        if chapter == "Conjugation.":
            return "verb-forms"
        return "nouns" if n <= 61 else ("adj" if n <= 81 else "pron")
    if part == "III":
        return "particles"
    if n <= 233:
        return "noun-syntax"
    if n <= 253:
        return "adj-pron-syntax"
    if n <= 340:
        return "verb-syntax"
    return "style"


def strip_markup(text):
    """Drop Gutenberg markup. Run this only on text whose paragraphs have
    already been unwrapped: _italics_ routinely span a hard line break, and
    matching across newlines mispairs on the book's unbalanced underscores."""
    text = re.sub(r"\[\d+\]", "", text)          # footnote markers
    text = text.replace("--", "—")
    text = re.sub(r"_([^_\n]+)_", r"\1", text)   # _italics_
    return text.replace("_", "")                 # leftover unpaired marks


def clean_text(raw):
    """Readable prose: paragraphs joined, paradigm tables flattened.

    The whole section is kept. The reader pages through it (see the CLI's
    grammar pager); truncating here would put part of the grammar permanently
    out of the student's reach."""
    out, para = [], []
    for line in raw.split("\n"):
        if not line.strip():
            if para:
                out.append(" ".join(para))
                para = []
            continue
        # Paradigm rows align columns with wide gaps; flatten them to one line
        # each so the endings survive without wrecking the wrap.
        if re.search(r"\S {2,}\S", line):
            if para:
                out.append(" ".join(para))
                para = []
            out.append(re.sub(r"\s{2,}", "  ", line.strip()))
        else:
            para.append(line.strip())
    if para:
        out.append(" ".join(para))

    # Paragraphs are unwrapped now, so italic spans sit on a single line.
    text = strip_markup("\n".join(out))
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"\n{2,}", "\n", text)).strip()


def titleise(heading):
    heading = re.sub(r"^[IVX]+\.\s*", "", heading)       # "IV. DEMONSTRATIVE..."
    heading = re.sub(r"^[A-E]\.\s*", "", heading)        # "A. HORTATORY..."
    heading = heading.strip().rstrip(",-— ").strip()
    small = {"of", "the", "and", "with", "in", "to", "a", "an", "or", "by", "for"}
    words = heading.lower().split()
    out = [words[0].capitalize()] + [
        w if w in small else w.capitalize() for w in words[1:]
    ]
    return " ".join(out)


def derive_paradigm_title(first_line):
    """'Active Voice.—Amō, I love.' -> 'First conjugation, active — amō'."""
    # Bennett is inconsistent: "Active Voice.--" and "Active voice.--" both occur.
    m = re.match(r"(Active|Passive) voice\.\s*—\s*([A-Za-zĀ-ū]+)",
                 strip_markup(first_line), re.I)
    if m:
        voice, lemma = m.group(1).lower(), m.group(2)
        key = lemma.lower().translate(str.maketrans("āēīōūăĕĭŏŭ", "aeiouaeiou"))
        key = key.replace("or", "o") if key.endswith("or") else key
        conj = CONJUGATION.get(key)
        if conj:
            return f"{conj}, {voice} — {lemma}"
        return f"{lemma} ({voice})"
    # 'Dō, I give.' / 'volō, nōlō, mālō.' / 'Fīō.'
    m = re.match(r"([A-Za-zĀ-ū]+(?:,\s*[a-zā-ū]+)*)[,.]", strip_markup(first_line))
    if m:
        head = m.group(1)
        rest = strip_markup(first_line)[m.end():].strip(" ,.")
        return f"{head} — {rest}" if rest and len(rest) < 30 else head
    return None


def build(secs):
    keep = [s for s in secs if s["part"] in TEACHABLE_PARTS]

    groups = []
    for s in keep:
        if s["opens_group"] or not groups:
            groups.append({"heading": s["heading"], "chapter": s["chapter"],
                           "part": s["part"], "secs": []})
        groups[-1]["secs"].append(s)

    topics, order = [], 0
    for g in groups:
        heading = (g["heading"] or "").strip().rstrip(".")
        if heading.upper() in SKIP_HEADINGS:
            continue
        n0 = g["secs"][0]["n"]
        first_line = next((l for l in g["secs"][0]["raw"].split("\n") if l.strip()), "")

        if n0 in TITLE_OVERRIDE:
            title = TITLE_OVERRIDE[n0]
        elif heading.upper() in FURNITURE:
            title = derive_paradigm_title(first_line) or titleise(heading)
        else:
            title = titleise(heading)

        text = clean_text("\n\n".join(s["raw"] for s in g["secs"]))
        if len(text) < 120:
            continue  # too thin to teach

        nums = [s["n"] for s in g["secs"]]
        ref = f"{nums[0]}" if len(nums) == 1 else f"{nums[0]}-{nums[-1]}"
        slug = re.sub(r"[^a-z0-9]+", "-", fold_ascii(title.lower())).strip("-")
        if len(slug) > 40:  # trim to a word boundary, never mid-word
            slug = slug[:40].rsplit("-", 1)[0]
        order += 10
        topics.append({
            "id": f"bn-{nums[0]:03d}-{slug}",
            "ref": ref,
            "title": title,
            "family": family_of(g["part"], g["chapter"], nums[0]),
            "order": order,
            "text": text,
        })
    return topics



def download(dest):
    print(f"downloading {GUTENBERG_URL}", file=sys.stderr)
    with urllib.request.urlopen(GUTENBERG_URL) as r:
        io.open(dest, "wb").write(r.read())
    return dest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="Gutenberg #15665 plain text (downloaded if omitted)")
    ap.add_argument("--out", default=os.path.join(REPO, "content", "grammar.json"))
    a = ap.parse_args()

    src = a.src or download(os.path.join(tempfile.gettempdir(), "bennett-15665.txt"))
    sections = parse(src)
    nums = [s["n"] for s in sections]
    gaps = sorted(set(range(min(nums), max(nums) + 1)) - set(nums))
    print(f"parsed §{min(nums)}-{max(nums)} ({len(sections)} sections, {len(gaps)} gaps)",
          file=sys.stderr)

    topics = build(sections)
    json.dump(topics, io.open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(topics)} topics -> {a.out}", file=sys.stderr)
    print("families: " + ", ".join(f"{k} {v}" for k, v in
          Counter(t["family"] for t in topics).items()), file=sys.stderr)
