#!/usr/bin/env python3
"""Build this pack's content/grammar.json from Smyth's *Greek Grammar*.

Source: Herbert Weir Smyth, "A Greek Grammar for Colleges" (New York, 1920) —
the text is public domain; the digitization is the Perseus Project's TEI, which
is CC BY-SA and is redistributed by the Alpheios project as one file.

The book's own structure defines the topics: a topic is a run of consecutive
numbered sections under one heading. Part I (letters, sounds, accent) and
Part III (word formation) are dropped, because neither can carry an
English->Greek translation exercise, as is the appendix's catalogue of verbs;
that leaves Part II (inflection) and Part IV (syntax).

Usage:
    python3 languages/greek/grammar/parse.py [--src smyth.xml] [--out .../content/grammar.json]

With no --src the TEI is downloaded to a temporary file.

Note on the edition: CCEL also publishes Smyth, but only Parts I and II —
sections 1-573. A pack built on it would teach the forms and no syntax at all.
"""
import argparse, io, json, os, re, sys, tempfile, unicodedata, urllib.request
import xml.etree.ElementTree as ET
from collections import Counter

TEI_URL = ("https://raw.githubusercontent.com/alpheios-project/grammar-smyth/"
           "master/src/smyth_eng_u.xml")
PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Smyth numbers his sections 1-3048. Dialect supplements repeat the number of
# the section they annotate with a "D" ("3 D"), so they are that section's
# text rather than a section of their own.
NUMBERED = re.compile(r"^(\d+)$")
DIALECT = re.compile(r"^(\d+)\s*D$")


def parse(src):
    """Every numbered section, in book order, with its heading and text."""
    root = ET.parse(src).getroot()
    parents = {child: parent for parent in root.iter() for child in parent}

    def heading_of(node):
        """The nearest enclosing division that gives itself a title."""
        while node is not None:
            head = node.find("head")
            if head is not None and node.get("type") != "smythp":
                return node, " ".join("".join(head.itertext()).split())
            node = parents.get(node)
        return None, None

    sections, current = [], None
    for node in root.iter():
        if node.get("type") != "smythp":
            continue
        n = (node.get("n") or "").strip()
        if DIALECT.match(n):
            # Smyth's dialect note on the section just read.
            if current is not None:
                current["nodes"].append(node)
            continue
        if not NUMBERED.match(n):
            continue
        owner, heading = heading_of(parents.get(node))
        chapter, chapter_head = heading_of(parents.get(owner)) if owner is not None \
            else (None, None)
        current = {"n": int(n), "owner": owner, "heading": heading,
                   "chapter": chapter_head, "nodes": [node],
                   "lead": lead_of(node)}
        sections.append(current)
    return sections


def lead_of(node):
    """The bolded phrase Smyth opens a section with — its own name for it.

    '<emph rend="bold">Parts of Speech</emph>.—Greek has...' names the topic
    better than the chapter heading above it does, and it is what titles the
    pieces of a chapter too long to ship as one.
    """
    for emph in node.iter("emph"):
        if emph.get("rend") != "bold":
            continue
        text = " ".join("".join(emph.itertext()).split()).strip(" .—:,")
        # Long enough to be a name, short enough not to be the sentence.
        if 3 <= len(text) <= 60 and re.search(r"[A-Za-z]", text):
            return text
        return None
    return None


# --- text ------------------------------------------------------------------

def cell_text(node):
    """One table cell, on one line and with its internal spacing collapsed.

    Cells are joined with exactly two spaces and that is the only thing telling
    the reader's table parser where a column begins, so a cell may not contain
    a double space of its own.
    """
    return " ".join("".join(node.itertext()).split())


def render(node, lines):
    """Flatten one element into lines: prose joined, paradigm rows kept apart.

    Smyth's paradigms are TEI tables, but they are wrapped in the paragraph
    that introduces them, so a renderer that reads a <p> whole flattens every
    declension in the book into one unreadable line. Anything holding a table
    is walked; only elements with no table under them are joined.
    """
    if node.tag == "table":
        for row in node.iter("row"):
            cells = [cell_text(c) for c in row.findall("cell")]
            while cells and not cells[-1]:
                cells.pop()
            if any(cells):
                # Exactly two spaces: that gap is the only thing telling the
                # reader's table parser where one column ends and the next
                # begins.
                lines.append("  ".join(cells))
        return

    if node.find(".//table") is None:
        text = " ".join("".join(node.itertext()).split())
        if text:
            lines.append(text)
        return

    buffer = [node.text or ""]

    def flush():
        text = " ".join("".join(buffer).split())
        if text:
            lines.append(text)
        buffer.clear()

    for child in node:
        if child.tag == "table" or child.find(".//table") is not None:
            flush()
            render(child, lines)
        else:
            buffer.append("".join(child.itertext()))
        buffer.append(child.tail or "")
    flush()


def section_text(section):
    lines = []
    for node in section["nodes"]:
        render(node, lines)
    return "\n".join(l for l in lines if l.strip())


# --- the syllabus ----------------------------------------------------------

# Smyth's own parts and chapters, collapsed into display families. The
# boundaries are his: 286 is where SUBSTANTIVES turns to ADJECTIVES, 355 where
# NUMERALS turns to VERBS, and so on down Part IV's chapter list.
def family_of(n):
    if n <= 285:
        return "nouns"                    # declension and the substantives
    if n <= 324:
        return "adj"                      # adjectives, participles, comparison
    if n <= 340:
        return "pron"
    if n <= 354:
        return "adj"                      # adverbs and numerals
    if n <= 821:
        return "verb-forms"
    if n <= 1017:
        return "sentence-syntax"          # subject, predicate, the concords
    if n <= 1278:
        return "adj-pron-syntax"          # adjectives, adverbs, article, pronouns
    if n <= 1702:
        return "case-syntax"              # the cases and the prepositions
    if n <= 2152:
        return "verb-syntax"              # voice, tense, mood, verbals
    if n <= 2768:
        return "clause-syntax"            # coordination through negatives
    if n <= 3003:
        return "particles"
    return "style"                        # grammatical and rhetorical figures


# Parts that cannot carry a translation exercise, with the reason recorded.
def dropped_part(n):
    if n <= 188:
        return "part-not-teachable"       # letters, sounds, syllables, accent
    if 822 <= n <= 899:
        return "part-not-teachable"       # formation of words
    return None

# Headings that divide the book rather than name a topic. Only the parts and
# the appendix belong here: Smyth's chapter headings — PRONOUNS, SUBSTANTIVES,
# THE CASES — name real topics, and skipping them empties whole families.
SKIP_HEADINGS = {
    "PART I: LETTERS, SOUNDS, SYLLABLES, ACCENT", "PART II: INFLECTION",
    "PART III: FORMATION OF WORDS", "PART IV: SYNTAX",
    "APPENDIX: LIST OF VERBS", "INFLECTION",
}

# Smyth reuses his accidence headings for the syntax chapters, and a duplicate
# title is a map the student cannot navigate. Keyed by the topic's first
# section, which is what makes each of them unique.
TITLE_OVERRIDE = {
    1018: "Syntax of adjectives",
    1094: "Syntax of adverbs",
    1099: "The article: origin and development",
    1190: "Syntax of pronouns",
    1279: "The cases: general",
    1636: "Syntax of prepositions",
    1703: "The verb: voices",
    1966: "Verbal nouns: the infinitive",
    2039: "Syntax of the participle",
    2769: "Syntax of the particles",
}


def fold_ascii(text):
    """Strip diacritics so a slug stays readable rather than losing letters."""
    return "".join(c for c in unicodedata.normalize("NFD", text)
                   if not unicodedata.combining(c))


SMALL = {"of", "the", "and", "with", "in", "to", "a", "an", "or", "by", "for"}


def titleise(heading):
    heading = re.sub(r"\s*\(\d[\d\-–, ]*\)\s*$", "", heading)   # "(2193-2487)"
    heading = re.sub(r"^(?:[IVXL]+|[A-E]|\d+)\.\s*", "", heading)
    heading = heading.strip().rstrip(",-—: ").strip()
    if not heading:
        return heading
    words = heading.split()
    # Smyth sets his headings in capitals but writes his Greek in Greek; only
    # the words that are shouting should be lowered.
    out = []
    for i, w in enumerate(words):
        lowered = w.lower() if w.isupper() and re.search(r"[A-Za-z]", w) else w
        if i == 0:
            out.append(lowered[:1].upper() + lowered[1:])
        else:
            out.append(lowered if lowered in SMALL else lowered)
    title = " ".join(out)
    return title[:1].upper() + title[1:]


# Smyth titles a good many of his topics with the Greek word itself — Γάρ, Μέν,
# ὥστε — and a slug built by dropping everything but [a-z0-9] leaves those with
# no slug at all. Romanising keeps the id both readable and its own.
ROMAN = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "e",
    "θ": "th", "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x",
    "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "u",
    "φ": "ph", "χ": "ch", "ψ": "ps", "ω": "o",
}


def romanise(text):
    stripped = fold_ascii(text.lower())
    return "".join(ROMAN.get(c, c) for c in stripped)


def slugify(title):
    slug = re.sub(r"[^a-z0-9]+", "-", romanise(title)).strip("-")
    if len(slug) > 40:
        slug = slug[:40].rsplit("-", 1)[0]
    return slug


def build(sections, min_chars, max_chars):
    """Topics, plus an account of what happened to every source section.

    Nothing may merely disappear: a section is either assigned to a topic or
    dropped for a stated reason, and grammar-report checks the two add up.
    What the parser silently discards, the student can never read.
    """
    dropped, keep = [], []
    for s in sections:
        reason = dropped_part(s["n"])
        if reason:
            dropped.append({"n": s["n"], "reason": reason})
        else:
            keep.append(s)

    groups = []
    for s in keep:
        # A run is broken by a new heading, and also by a family boundary: the
        # chapters that span one are the ones whose halves belong on different
        # parts of the map.
        same = (groups and groups[-1]["owner"] is s["owner"]
                and family_of(groups[-1]["secs"][0]["n"]) == family_of(s["n"]))
        if not same:
            groups.append({"owner": s["owner"], "heading": s["heading"],
                           "secs": []})
        groups[-1]["secs"].append(s)

    topics, order, assigned = [], 0, {}
    used = {}
    for g in groups:
        heading = (g["heading"] or "").strip()
        nums = [s["n"] for s in g["secs"]]
        if heading.upper().rstrip(".") in SKIP_HEADINGS and nums[0] not in TITLE_OVERRIDE:
            for n in nums:
                dropped.append({"n": n, "reason": "structural-heading",
                                "heading": heading})
            continue

        base = TITLE_OVERRIDE.get(nums[0]) or titleise(heading)
        if not base:
            for n in nums:
                dropped.append({"n": n, "reason": "untitled-run"})
            continue

        for piece in split_run(g["secs"], max_chars):
            piece_nums = [s["n"] for s in piece]
            text = "\n".join(section_text(s) for s in piece).strip()
            if len(text) < min_chars:
                for n in piece_nums:
                    dropped.append({"n": n, "reason": "below-min-length",
                                    "chars": len(text)})
                continue

            title = base
            if len(piece) != len(g["secs"]):
                # A chapter shipped in pieces: name each after what Smyth calls
                # the section it opens with, so the map reads as his own
                # sequence rather than as "Figures (3)". Where he names it
                # nothing, the section number is at least a real address.
                title = (titleise(piece[0]["lead"] or "")
                         or f"{base} (§ {piece_nums[0]})")
            title = distinct(title, piece[0], used)

            order += 10
            topic_id = f"sm-{piece_nums[0]:03d}-{slugify(title)}"
            for n in piece_nums:
                assigned[n] = topic_id
            topics.append({
                "id": topic_id,
                "ref": str(piece_nums[0]) if len(piece_nums) == 1
                       else f"{piece_nums[0]}-{piece_nums[-1]}",
                "title": title,
                "family": family_of(piece_nums[0]),
                "order": order,
                "text": text,
            })
    return topics, assigned, dropped


def split_run(secs, max_chars):
    """Break a run too long to read into consecutive pieces at section breaks.

    Smyth's syntax chapters run to tens of thousands of characters under a
    single heading. Shipped whole they are a wall no set of questions can
    cover; the section boundaries are his own and are the only honest place to
    cut, so a piece grows until the next section would take it over the limit.
    """
    sizes = [(s, len(section_text(s))) for s in secs]
    total = sum(size for _, size in sizes)
    if total <= max_chars:
        return [secs]
    pieces, current, running = [], [], 0
    for s, size in sizes:
        if current and running + size > max_chars:
            pieces.append(current)
            current, running = [], 0
        current.append(s)
        running += size
    if current:
        pieces.append(current)
    return pieces


def distinct(title, section, used):
    """Keep every title its own. Smyth reuses his accidence headings for the
    syntax chapters, and two topics under one name is a map with no way back."""
    if title not in used:
        used[title] = section["n"]
        return title
    chapter = titleise(section.get("chapter") or "")
    for candidate in (f"{title} ({chapter.lower()})" if chapter else None,
                      f"{title} (§ {section['n']})"):
        if candidate and candidate not in used:
            used[candidate] = section["n"]
            return candidate
    return f"{title} (§ {section['n']})"


def download(dest):
    print(f"downloading {TEI_URL}", file=sys.stderr)
    with urllib.request.urlopen(TEI_URL) as r:
        io.open(dest, "wb").write(r.read())
    return dest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="Smyth TEI XML (downloaded if omitted)")
    ap.add_argument("--out", default=os.path.join(PACK, "content", "grammar.json"))
    ap.add_argument("--min-chars", type=int, default=120)
    ap.add_argument("--max-chars", type=int, default=12000,
                    help="a run longer than this is shipped in pieces")
    a = ap.parse_args()

    src = a.src or download(os.path.join(tempfile.gettempdir(), "smyth_eng_u.xml"))
    sections = parse(src)
    nums = [s["n"] for s in sections]
    gaps = sorted(set(range(min(nums), max(nums) + 1)) - set(nums))
    print(f"parsed §{min(nums)}-{max(nums)} ({len(sections)} sections, "
          f"{len(gaps)} gaps)", file=sys.stderr)

    topics, assigned, dropped = build(sections, a.min_chars, a.max_chars)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(topics, io.open(a.out, "w", encoding="utf8"),
              ensure_ascii=False, indent=1)
    print(f"{len(topics)} topics -> {a.out}", file=sys.stderr)
    print("families: " + ", ".join(f"{k} {v}" for k, v in
          sorted(Counter(t["family"] for t in topics).items())), file=sys.stderr)

    lengths = sorted(len(t["text"]) for t in topics)

    def pct(p):
        return lengths[min(len(lengths) - 1, int(len(lengths) * p))] if lengths else 0

    manifest = {
        "source": {"title": "Smyth, A Greek Grammar for Colleges (1920)",
                   "url": TEI_URL,
                   "licence": "text public domain (1920); Perseus Project "
                              "digitization CC BY-SA 3.0"},
        "sourceSections": nums,
        "assigned": {str(k): v for k, v in sorted(assigned.items())},
        "dropped": sorted(dropped, key=lambda d: d["n"]),
        "topics": len(topics),
        "families": dict(Counter(t["family"] for t in topics)),
        "sizeChars": {"min": lengths[0] if lengths else 0, "median": pct(0.5),
                      "p90": pct(0.9), "max": lengths[-1] if lengths else 0},
    }
    out_manifest = os.path.join(os.path.dirname(a.out), "grammar-coverage.json")
    json.dump(manifest, io.open(out_manifest, "w", encoding="utf8"),
              ensure_ascii=False, indent=1)
    unaccounted = set(nums) - set(assigned) - {d["n"] for d in dropped}
    print(f"accounted: {len(assigned)} assigned, {len(dropped)} dropped, "
          f"{len(unaccounted)} unaccounted -> {out_manifest}", file=sys.stderr)
