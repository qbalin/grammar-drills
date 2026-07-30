#!/usr/bin/env python3
"""Build this pack's content/grammar.json from Bennett's *New Latin Grammar*.

Source: Charles E. Bennett, "New Latin Grammar" (Boston, 1908), Project
Gutenberg ebook #15665 — public domain, "almost no restrictions whatsoever".

The book's own run-headings define the topics: a topic is a run of consecutive
numbered sections sharing one heading. Parts I (sounds/accent/quantity), IV
(word formation) and VI (prosody) are dropped — none of them can carry an
English->Latin translation exercise — leaving Parts II (inflections),
III (particles) and V (syntax).

This reads the **HTML** edition, not the plain text one. In the plain text the
paradigms are fixed-width column layouts whose cells wrap across physical
lines, so a reader downstream cannot tell a wrapped cell from a new row: the
correlatives table in §140 arrives with its first heading cut down to
"RELATIVE AND" and its continuation lines loose between four fragments of what
is one table. The HTML has real <table>/<tr>/<td>, so a row is a row and a cell
is a cell; it also has the <b>/<i> that carry the book's meaning — Bennett
bolds the *ending* inside each form (am**ō**) and italicises the English gloss,
and the plain text keeps neither.

Usage:
    python3 languages/latin/grammar/parse.py [--src bennett.htm] [--out .../content/grammar.json]

With no --src the Gutenberg HTML is downloaded to a temporary file.
"""
import argparse, io, json, os, re, sys, tempfile, unicodedata, urllib.request
from collections import Counter
from html.parser import HTMLParser

GUTENBERG_URL = "https://www.gutenberg.org/files/15665/15665-h/15665-h.htm"
PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PART = re.compile(r"^PART ([IVX]+)\.?$")
CHAPTER = re.compile(r"^CHAPTER ([IVXL]+)\.\s*[—-]+\s*(.+)$")
# The index of cited passages; everything from there on is apparatus.
END_OF_BODY = re.compile(r"^INDEX OF THE SOURCES\b")


# --- inline markup ----------------------------------------------------------
#
# The extract is a flat string — one line per paragraph, one line per paradigm
# row, cells held apart by exactly two spaces. Emphasis has to survive inside
# that without introducing a space (which would invent a column) and without
# hiding the shape of a line from the classifier that reads it back.
#
# So a styled run is written ⟦k:text⟧ with k in {b, i}. Neither bracket occurs
# anywhere in either shipped pack, both are non-space, and the pair is
# asymmetric, so runs nest without an ambiguity rule. A literal bracket in a
# source book is doubled here and halved by the decoder.
OPEN, CLOSE = "⟦", "⟧"
#: A row line that spans every column — a caption or a mood/tense divider that
#: the book set across the whole table. Marked explicitly rather than guessed
#: from its capitalisation, so `Hīc, this.` stays inside the paradigm it heads
#: instead of splitting it in two.
FULL_WIDTH = OPEN + "=" + CLOSE
#: Where one table ends. Two tables that touch — §101 sets the principal parts
#: of `amō` immediately above its conjugation — would otherwise run together
#: into one, and be sized to the wider of the two: four columns of principal
#: parts pulling a two-column paradigm out to arm's length.
TABLE_END = OPEN + "/" + CLOSE
#: A cell with nothing in it. Two separators in a row would read as one wide
#: gap, so a row that skips a column has to say so: without this, `arceō arcēre
#: arcuī <empty> keep off` loses its participle column and the gloss slides
#: under the participles of every verb above it.
EMPTY_CELL = OPEN + "." + CLOSE

STYLE_ORDER = ("b", "i")
TAG_STYLE = {"b": "b", "strong": "b", "i": "i", "em": "i"}


def escape(text):
    return text.replace(OPEN, OPEN * 2).replace(CLOSE, CLOSE * 2)


def plain_len(text):
    """How much grammar a topic holds, counted in words rather than markup."""
    n, i = 0, 0
    while i < len(text):
        if text[i : i + 2] in (OPEN * 2, CLOSE * 2):   # an escaped bracket
            n, i = n + 1, i + 2
        elif text[i : i + 3] in (FULL_WIDTH, TABLE_END, EMPTY_CELL):
            i += 3
        elif text[i] == OPEN and text[i + 2 : i + 3] == ":":
            i += 3
        elif text[i] == CLOSE:
            i += 1
        else:
            n, i = n + 1, i + 1
    return n


class Buffer:
    """Characters with a style set apiece, collected until a block ends.

    Held per character rather than per fragment because the whitespace between
    two tags has to collapse the same way as whitespace inside one: `am<b>ō</b>`
    is `amō`, and `<i>x</i>\\n<i>y</i>` is one italic run, not two with a plain
    space wedged between them.
    """

    def __init__(self):
        self.chars = []
        self.styles = []

    def add(self, text, style):
        self.chars.extend(text)
        self.styles.extend([style] * len(text))

    def upper_from(self, mark):
        """Small caps: `R` + `ELATIVE AND` is one word, not two."""
        for i in range(mark, len(self.chars)):
            self.chars[i] = self.chars[i].upper()

    def __len__(self):
        return len(self.chars)

    def _normalised(self):
        """Whitespace collapsed to single spaces, ends trimmed, styles kept."""
        chars, styles = [], []
        for c, s in zip(self.chars, self.styles):
            if c.isspace() or c == "\xa0":
                if chars and chars[-1] != " ":
                    chars.append(" ")
                    styles.append(None)
                continue
            chars.append(c)
            styles.append(s)
        while chars and chars[-1] == " ":
            chars.pop()
            styles.pop()
        # A space between two runs of the same style belongs to that style, so
        # `<i>of the</i> <i>city</i>` stays one run.
        for i, c in enumerate(chars):
            if c != " ":
                continue
            before = styles[i - 1] if i > 0 else frozenset()
            after = styles[i + 1] if i + 1 < len(chars) else frozenset()
            styles[i] = (before or frozenset()) & (after or frozenset())
        return chars, styles

    def plain(self):
        return "".join(self._normalised()[0])

    def marked(self):
        """The same text with its styled runs wrapped in ⟦k:…⟧."""
        chars, styles = self._normalised()
        out, i = [], 0
        while i < len(chars):
            style = styles[i]
            j = i
            while j < len(chars) and styles[j] == style:
                j += 1
            text = escape("".join(chars[i:j]))
            for kind in reversed(STYLE_ORDER):
                if kind in style:
                    text = f"{OPEN}{kind}:{text}{CLOSE}"
            out.append(text)
            i = j
        return "".join(out)


# --- the reader -------------------------------------------------------------

HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
#: Tags that end a line. A cell is not a line, so inside one these only start a
#: new fragment (see `Reader.flush`).
BLOCK_TAGS = {"p", "div", "blockquote", "table", "tr", "td", "br", "hr", "li",
              "ol", "ul", "center"} | HEADING_TAGS
VOID_TAGS = {"br", "hr", "img"}


class Reader(HTMLParser):
    """Bennett's HTML as a token stream: parts, chapters, headings, sections,
    lines.

    A line is one paragraph or one table row. Everything the student never sees
    — footnote markers, the front-matter contents, the indices — is dropped
    here rather than filtered later, so `tokens` is exactly the book's body.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tokens = []
        self.buf = Buffer()
        self.style = frozenset()
        self.style_stack = []
        self.sc_marks = []
        self.started = False
        self.finished = False
        self.eat_dot = False
        self.hide = 0            # inside a footnote reference
        self.heading = None      # tag name while a heading is open
        # Table state. Rows are held until </table> because a row's meaning
        # depends on the width of the widest row in its table.
        self.table = None
        self.row = None
        self.cell = None
        self.cell_span = 1

    # -- helpers

    def emit(self, kind, value):
        if self.started and not self.finished:
            self.tokens.append((kind, value))

    def flush(self):
        """End the current block: a fragment inside a cell, a line outside."""
        if self.cell is not None:
            if len(self.cell[-1]):
                self.cell.append(Buffer())
            return
        text = self.buf.marked()
        self.buf = Buffer()
        if text:
            self.emit("line", text)

    def add(self, text):
        if self.hide:
            return
        if self.eat_dot:
            stripped = text.lstrip()
            if stripped.startswith("."):
                text = stripped[1:]
                self.eat_dot = False
            elif stripped:
                self.eat_dot = False
        target = self.cell[-1] if self.cell is not None else self.buf
        target.add(text, self.style)

    def push_style(self, kind):
        self.style_stack.append(self.style)
        self.style = self.style | {kind}

    # -- HTMLParser hooks

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in VOID_TAGS:
            self.handle_startendtag(tag, attrs)
            return

        if tag == "a":
            name = a.get("name", "")
            if name.startswith("NtA_"):
                self.hide += 1
                self.style_stack.append(self.style)
                return
            m = re.fullmatch(r"sect(\d+[A-Z]?)", name)
            if m:
                self.flush()
                self.emit("sect", m.group(1))
                self.hide += 1
                self.eat_dot = True
                self.style_stack.append(self.style)
                return
            self.style_stack.append(self.style)
            return

        if tag == "font":
            self.style_stack.append(self.style)
            target = self.cell[-1] if self.cell is not None else self.buf
            self.sc_marks.append(len(target) if a.get("class") == "sc" else None)
            return

        if tag in TAG_STYLE:
            self.push_style(TAG_STYLE[tag])
            return

        if tag in HEADING_TAGS:
            self.flush()
            self.heading = tag
            self.buf = Buffer()
            return

        if tag == "table":
            self.flush()
            self.table = []
            return

        if tag == "tr" and self.table is not None:
            self.row = []
            return

        if tag == "td" and self.row is not None:
            self.cell = [Buffer()]
            self.cell_span = int(a.get("colspan", 1) or 1)
            return

        if tag in BLOCK_TAGS:
            self.flush()
            # A paragraph of the front-matter contents is a link list, not text.
            if tag == "p" and a.get("class") == "center":
                self.heading = "p.center"
                self.buf = Buffer()

    def handle_startendtag(self, tag, attrs):
        if tag == "br":
            if self.cell is not None:
                if len(self.cell[-1]):
                    self.cell.append(Buffer())
            elif self.heading is None:
                self.flush()
            return
        if tag in BLOCK_TAGS:
            self.flush()

    def handle_endtag(self, tag):
        if tag in ("a", "font") or tag in TAG_STYLE:
            if tag == "font" and self.sc_marks:
                mark = self.sc_marks.pop()
                if mark is not None:
                    target = self.cell[-1] if self.cell is not None else self.buf
                    target.upper_from(mark)
            if tag == "a" and self.hide:
                self.hide -= 1
            if self.style_stack:
                self.style = self.style_stack.pop()
            return

        if tag in HEADING_TAGS or (tag == "p" and self.heading == "p.center"):
            if self.heading is not None:
                self.close_heading()
                return

        if tag == "td" and self.cell is not None:
            frags = [b.marked() for b in self.cell]
            self.row.append((self.cell_span, [f for f in frags if f]))
            self.cell = None
            return

        if tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
            return

        if tag == "table" and self.table is not None:
            self.close_table()
            return

        if tag in BLOCK_TAGS:
            self.flush()

    def handle_data(self, data):
        self.add(data)

    # -- the two structures that need the whole element

    def close_heading(self):
        text, self.heading = self.buf.plain(), None
        marked = self.buf.marked()
        self.buf = Buffer()
        if not text:
            return

        m = PART.match(text)
        if m:
            # The front matter repeats the whole table of contents; the body
            # begins at the second "PART I."
            if m.group(1) == "I" and not self.started:
                self.started = True
                self.tokens.clear()
            self.emit("part", m.group(1))
            return
        if END_OF_BODY.match(text):
            self.finished = True
            return
        m = CHAPTER.match(text)
        if m:
            self.emit("chap", m.group(2).strip())
            return
        if is_heading(text):
            self.emit("head", text)
        else:
            # A mixed-case centred line ("Natural Gender.") is a caption, not a
            # run-heading: it belongs to the section it sits in.
            self.emit("line", marked)

    def close_table(self):
        rows, self.table = self.table, None
        if not rows:
            return
        self.emit_rows(rows)
        self.emit("line", TABLE_END)

    def emit_rows(self, rows):
        columns = max((sum(span for span, _ in row) for row in rows), default=1)
        for row in rows:
            if len(row) == 1 and columns > 1 and row[0][0] == columns:
                # A row the book set across the whole table: a mood, a tense, a
                # caption. Two spaces between its own fragments, so a caption
                # and its gloss still read as two columns.
                text = "  ".join(row[0][1])
                if text:
                    self.emit("line", FULL_WIDTH + text)
                continue
            # Fragments within one cell are a line break inside the cell, not a
            # column: joining them with a single space keeps them in the cell.
            cells = [" ".join(frags) for _, frags in row]
            spans = [span for span, _ in row]
            # A row whose cells are all the same width is its own grid — every
            # finite form of `amō` is set two units wide in a four-unit table,
            # and it means two columns, not four. A row that mixes widths is
            # filling the table's grid, and the columns it steps over have to
            # be kept: `arceō arcēre arcuī(×2) keep off` puts the gloss in the
            # fifth column, not the fourth.
            if len(set(spans)) > 1:
                cells = [c for cell, span in zip(cells, spans)
                         for c in [cell] + [""] * (span - 1)]
            # A trailing empty cell is a spacer and says nothing; an interior
            # one is a column this row skips, and has to keep its place.
            while cells and not cells[-1]:
                cells.pop()
            if any(cells):
                self.emit("line", "  ".join(c or EMPTY_CELL for c in cells))


# --- topics -----------------------------------------------------------------

TEACHABLE_PARTS = {"II", "III", "V"}

#: Single words that label a paradigm rather than open a topic.
LABELS = {"SINGULAR", "PLURAL", "SING", "PLUR", "MASC", "FEM", "NEUT"}


def is_heading(text):
    """A run-heading: the book sets those in capitals.

    Testing for the absence of lower case rather than for membership of a
    character class is what admits `FIRST (OR Ā-) CONJUGATION.` — the
    parentheses are the only reason the old rule rejected it, and rejecting it
    merged five conjugation topics into their neighbours.
    """
    body = text.strip()
    if len(body) < 4 or body.rstrip(".") in LABELS:
        return False
    if not any(c.isupper() for c in body):
        return False
    return not any(c.islower() for c in body)


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

# Groups whose heading names the section it sits under rather than the topic.
TITLE_OVERRIDE = {
    130: "Volō, nōlō, mālō",
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


SMALL_WORDS = {"of", "the", "and", "with", "in", "to", "a", "an", "or", "by", "for"}


def titleise(heading):
    """A heading as a topic title.

    The HTML sets some headings in capitals and some in mixed case. Only the
    capitals need re-casing; lower-casing `Cum` or `Ā-` on the way past would
    make the title say something the book does not.
    """
    heading = re.sub(r"^[IVX]+\.\s*", "", heading)       # "IV. DEMONSTRATIVE..."
    heading = re.sub(r"^[A-E]\.\s*", "", heading)        # "A. HORTATORY..."
    heading = heading.strip().rstrip(".,-— ").strip()
    if any(c.islower() for c in heading):
        return heading
    words = []
    for i, word in enumerate(heading.split()):
        lower = word.lower()
        if i > 0 and lower.strip("().,;:'’") in SMALL_WORDS:
            words.append(lower)
            continue
        # Capitalise the first *letter*, which may sit behind a bracket.
        m = re.search(r"[^\W\d_]", lower)
        words.append(lower if not m else lower[: m.start()] + lower[m.start()].upper() + lower[m.start() + 1 :])
    return " ".join(words)


def sections_of(tokens):
    """The token stream as numbered sections, each carrying its context."""
    part = chapter = heading = pending = None
    sections, cur = [], None
    for kind, value in tokens:
        if kind == "part":
            part, chapter, heading, pending = value, None, None, None
        elif kind == "chap":
            chapter, heading, pending = value, None, None
        elif kind == "head":
            # A heading covers a run of sections, so it carries forward until
            # the next one; `opens_group` marks where a run starts.
            heading = pending = value.strip().rstrip(".")
        elif kind == "sect":
            cur = {
                "n": value,
                "part": part,
                "chapter": chapter,
                "heading": heading,
                "opens_group": pending is not None,
                "lines": [],
            }
            sections.append(cur)
            pending = None
        elif kind == "line" and cur is not None:
            cur["lines"].append(value)
    for s in sections:
        s["raw"] = "\n".join(s.pop("lines"))
    return sections


def numeric(n):
    """§222A is a section of its own in the book; it belongs to §222's topic."""
    return int(re.match(r"\d+", n).group(0))


def build(secs):
    """Topics, plus an account of what happened to every source section.

    Nothing may merely disappear. A section either lands in a topic or is
    dropped for a stated reason: what the parser silently discards, the student
    can never read, and without the account there is no way to tell the two
    apart from the outside.
    """
    dropped, keep = [], []
    for s in secs:
        if s["part"] in TEACHABLE_PARTS:
            keep.append(s)
        else:
            # Sounds, word-formation and prosody: none of them can carry a
            # translation exercise.
            dropped.append({"n": s["n"], "reason": "part-not-teachable",
                            "part": s["part"]})

    groups = []
    for s in keep:
        if s["opens_group"] or not groups:
            groups.append({"heading": s["heading"], "chapter": s["chapter"],
                           "part": s["part"], "secs": []})
        groups[-1]["secs"].append(s)

    topics, order = [], 0
    assigned = {}
    for g in groups:
        heading = (g["heading"] or "").strip().rstrip(".")
        if heading.upper() in SKIP_HEADINGS:
            for s in g["secs"]:
                dropped.append({"n": s["n"], "reason": "structural-heading",
                                "heading": heading})
            continue
        n0 = numeric(g["secs"][0]["n"])
        title = TITLE_OVERRIDE.get(n0) or titleise(heading)

        text = "\n".join(s["raw"] for s in g["secs"] if s["raw"])
        if plain_len(text) < 120:
            # Too thin to teach — but say so, rather than letting it vanish.
            for s in g["secs"]:
                dropped.append({"n": s["n"], "reason": "below-min-length",
                                "chars": plain_len(text)})
            continue

        nums = [s["n"] for s in g["secs"]]
        ref = f"{nums[0]}" if len(nums) == 1 else f"{nums[0]}-{nums[-1]}"
        slug = re.sub(r"[^a-z0-9]+", "-", fold_ascii(title.lower())).strip("-")
        if len(slug) > 40:  # trim to a word boundary, never mid-word
            slug = slug[:40].rsplit("-", 1)[0]
        order += 10
        topic_id = f"bn-{n0:03d}-{slug}"
        for n in nums:
            assigned[n] = topic_id
        topics.append({
            "id": topic_id,
            "ref": ref,
            "title": title,
            "family": family_of(g["part"], g["chapter"], n0),
            "order": order,
            "text": text,
        })
    return topics, assigned, dropped


def parse(src):
    reader = Reader()
    reader.feed(io.open(src, encoding="iso-8859-1").read())
    reader.close()
    return sections_of(reader.tokens)


def download(dest):
    print(f"downloading {GUTENBERG_URL}", file=sys.stderr)
    with urllib.request.urlopen(GUTENBERG_URL) as r:
        io.open(dest, "wb").write(r.read())
    return dest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="Gutenberg #15665 HTML (downloaded if omitted)")
    ap.add_argument(
        "--out",
        default=os.path.join(PACK, "content", "grammar.json"),
    )
    a = ap.parse_args()

    src = a.src or download(os.path.join(tempfile.gettempdir(), "bennett-15665.htm"))
    sections = parse(src)
    nums = [s["n"] for s in sections]
    ints = sorted(numeric(n) for n in nums)
    gaps = sorted(set(range(ints[0], ints[-1] + 1)) - set(ints))
    print(f"parsed §{ints[0]}-{ints[-1]} ({len(sections)} sections, {len(gaps)} gaps)",
          file=sys.stderr)

    topics, assigned, dropped = build(sections)
    json.dump(topics, io.open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(topics)} topics -> {a.out}", file=sys.stderr)
    print("families: " + ", ".join(f"{k} {v}" for k, v in
          Counter(t["family"] for t in topics).items()), file=sys.stderr)

    # The account of every source section. `grammar-report.mjs` checks that it
    # balances; a section that is neither assigned nor dropped is a parser bug.
    lengths = sorted(plain_len(t["text"]) for t in topics)
    def pct(p):
        return lengths[min(len(lengths) - 1, int(len(lengths) * p))] if lengths else 0
    manifest = {
        "source": {"title": "Bennett, New Latin Grammar (1908)",
                   "url": GUTENBERG_URL,
                   "licence": "public domain (Project Gutenberg #15665)"},
        "sourceSections": nums,
        "assigned": dict(sorted(assigned.items(), key=lambda kv: numeric(kv[0]))),
        "dropped": sorted(dropped, key=lambda d: numeric(d["n"])),
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
