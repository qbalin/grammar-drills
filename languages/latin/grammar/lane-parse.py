#!/usr/bin/env python3
"""Build this pack's content/grammars/lane.json from Lane's *Latin Grammar*.

Source: George M. Lane, "A Latin Grammar for Schools and Colleges" (New York,
1898), completed by Morris H. Morgan. Project Gutenberg ebook #44653 — public
domain, text and transcription both, because #44653 is a Distributed
Proofreaders transcription rather than a scan of one.

A sibling of `parse.py`, which reads Bennett, and it imports that file rather
than restating it: the markup encoding, the `Buffer` that carries a style per
character, the table reader and `plain_len` are the same problem in both books,
and a second copy of them would be a second thing to keep in step. What is Lane's
own is here — where a topic begins, what its family is, and what its title is
when the book uses the same words twice.

Three things differ from Bennett, and the first is the reason this is cheap:

  * **No heading has to be guessed at.** `parse.py` finds Bennett's run-headings
    by their capitalisation, because Bennett's HTML does not mark them. The DP
    transcription marks Lane's hierarchy with real <h2>-<h6>, and inside the
    inflection chapters — where Lane sets a run-heading as a styled paragraph —
    with class="header". Both are read here, the second as a level below <h6>,
    which is where it sits in the book.

  * **The families are Lane's own chapters, not the pack's nine.** Measured in
    `scripts/probe-lane-grammar.py` and recorded in REVIEW.md: filing 461 Lane
    topics into the nine puts 43.8% of them in `verb-syntax`, one accordion
    holding nearly half the book. Lane's own <h3>/<h4> headings give 17 families
    of median 12 topics, which is almost exactly Bennett's own 114-over-9 shape.

  * **Titles repeat, and are qualified rather than overridden.** Bennett has 20
    headings that name their enclosing section instead of their topic, and
    `parse.py` fixes them with a hand-written table. Lane has far more — five
    topics called "Singular Cases", four called "Greek Nouns" — because its
    hierarchy is deeper, and a table of 461 entries is not a fix. They take the
    heading above them instead: "Stems in -ā-: singular cases".

Usage:
    python3 languages/latin/grammar/lane-parse.py [--src 44653-h.htm] [--out ...]

With no --src the file `scripts/lane-quotes.mjs` already caches is used, and
failing that the Gutenberg HTML is downloaded. Either way it is pinned by
SHA-256, and refused rather than warned about, for the reason `lane-quotes.mjs`
gives: Project Gutenberg re-releases ebooks in place, and this reads the same
file for a different purpose.
"""
import argparse, hashlib, io, json, os, re, sys, tempfile, urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse import SMALL_WORDS, Buffer, Reader, fold_ascii, plain_len  # noqa: E402

PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(PACK))

EBOOK = 44653
GUTENBERG_URL = f"https://www.gutenberg.org/files/{EBOOK}/{EBOOK}-h/{EBOOK}-h.htm"
#: The same constant `scripts/lane-quotes.mjs` pins, and for the same reason.
SHA256 = "485e60eb2cb1a17bcb38814621a464903d9140bc36824541d8371b17909882d2"
CACHE = os.path.join(REPO, ".cache", f"lane-{EBOOK}", f"{EBOOK}-h.htm")

#: The teachable range, mirroring `parse.py`'s TEACHABLE_PARTS.
#:
#: Lane runs §§1-2745 in four movements and two of them are wrong for this, the
#: same two Bennett's parser drops:
#:
#:   §§1-14      parts of speech — a page of definitions, no exercise in it
#:   §§15-395    sound and word formation — Bennett's Parts I and IV. Prints
#:               morphological analysis with the joints marked, `met-ū-culōsu-s`,
#:               which is not spelled as anyone wrote it.
#:   §§397-1022  inflection, and the adverb, conjunction and preposition with it
#:               — Bennett's Parts II and III. It opens at 397 and not 396
#:               because Lane sets the "C. INFLECTION." heading *after* §396,
#:               which is the last section of word formation.
#:   §§1023-2298 syntax — Bennett's Part V.
#:   §§2299-2427 the appendix: peculiarities of verbs, indirect discourse,
#:               pronouns, numerals. Syntax under another name, so it is kept.
#:   §§2428-2745 prosody and versification — Bennett's Part VI, and refused
#:               twice over for the reason `lane-quotes.mjs:78` gives.
FROM, TO = 397, 2427

#: Lane's own section marker, `<a id = "sec1174" ...>1174.</a>`. The trailing
#: quote matters: `sec1174a` is a sub-item label — the `(a.)` that opens a
#: lettered clause — and is not a section of its own.
SECTION_ID = re.compile(r"sec(\d+)$")

#: Where `class="header"` sits in the hierarchy: below <h6>, above nothing.
HEADER_LEVEL = 7


class LaneReader(Reader):
    """Lane's HTML as a token stream: headings with their level, sections, lines.

    Everything structural is inherited. What is overridden is the three places
    Lane's markup differs from Bennett's — its section anchors carry `id` rather
    than `name`, its headings are tagged rather than capitalised, and it prints
    page numbers into the body text.
    """

    def __init__(self):
        super().__init__()
        # Bennett's reader waits for the second "PART I." because the front
        # matter repeats the table of contents. Lane's front matter holds no
        # section anchors at all, so the range filter does that work instead.
        self.started = True
        self.mute = 0          # inside a page number
        self.spans = []        # whether each open <span> muted
        self.level = None      # the level of the heading being read

    # -- overrides

    def add(self, text):
        """Page numbers are set into the running text and are not part of it.

        A separate counter from `Reader.hide`, which the base class decrements on
        any `</a>` — and a page number is `<span class="pagenum"><a>vi</a></span>`,
        so sharing the counter would close it twice and unmute the book.
        """
        if self.mute:
            return
        super().add(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)

        if tag == "span":
            muted = "pagenum" in (a.get("class") or "")
            self.spans.append(muted)
            self.mute += 1 if muted else 0
            return

        if tag == "a":
            m = SECTION_ID.fullmatch(a.get("id") or "")
            if m:
                # Handled exactly as Bennett's `sect` anchor: the anchor's own
                # text is the printed section number, so it is hidden, and the
                # stop after it is eaten.
                self.flush()
                self.emit("sect", m.group(1))
                self.hide += 1
                self.eat_dot = True
                self.style_stack.append(self.style)
                return

        if tag == "p" and "header" in (a.get("class") or "").split():
            self.flush()
            self.heading = "p.header"
            self.level = HEADER_LEVEL
            self.buf = Buffer()
            return

        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.level = int(tag[1])

        super().handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "span":
            if self.spans and self.spans.pop():
                self.mute -= 1
            return
        if tag == "p" and self.heading == "p.header":
            self.close_heading()
            return
        super().handle_endtag(tag)

    def close_heading(self):
        """A heading, with the level it was set at.

        Bennett's version has to decide whether a centred line is a run-heading
        or a caption. Here the tag has already said so, and all that is left is
        to keep the level, which is what the family grouping reads.
        """
        text, self.heading = self.buf.plain(), None
        marked = self.buf.marked()
        self.buf = Buffer()
        level, self.level = self.level, None
        if not text:
            return
        if level is None:
            # A centred paragraph, which Lane uses for captions over its
            # paradigms. The base class opens one as a heading; it is prose, and
            # belongs to the section it sits in.
            self.emit("line", marked)
            return
        self.emit("head", (level, text))


# --- topics -------------------------------------------------------------------

def slugify(text, limit=40):
    slug = re.sub(r"[^a-z0-9]+", "-", fold_ascii(text.lower())).strip("-")
    if len(slug) > limit:  # trim to a word boundary, never mid-word
        slug = slug[:limit].rsplit("-", 1)[0]
    return slug


#: Lane labels its divisions in a way Bennett does not: "(A.) USE OF THE NOUN.",
#: "I. Primitive Verbs.", "(2.) TENSE.". The letter is the book's scaffolding and
#: not part of what the topic is called.
#:
#: The stop is required, and is the whole of what keeps this honest: without it
#: `[A-Za-z]{1,4}` eats the first word of anything short enough, and "USE OF THE
#: NOUN" comes out as "Noun" — two of Lane's largest families, silently renamed
#: to something the book does not call them.
DIVISION = re.compile(r"^\(?(?:[A-Za-z]|\d{1,2}|[IVXL]{1,4})\.\)?\s+(?=\S)")


def clean_title(heading):
    """A heading as a topic title, cased the way Lane set it.

    `parse.py`'s `titleise` cannot be reused here, and the two reasons are the
    same reason: Bennett's headings are words, and a third of Lane's are forms.

      * It strips a trailing hyphen along with the full stop, so `STEMS IN -ā-`
        loses the mark that says `-ā-` is a stem ending rather than a vowel.
      * It decides a heading is shouting by `not any(c.islower())`, and every one
        of those headings has lower case in it — the ending is the lowercase
        part. 22 titles came through as `STEMS IN -ā`, and one qualified pair as
        `pERFECT STEM IN -v`.

    So shouting is judged by which case most of the letters are in, and a word
    already in lower case inside a shouted heading is left exactly as it is:
    that is Lane naming a Latin form — `quī`, `-iō, -ere` — and not a word to
    re-case.
    """
    text = heading.strip()
    prev = None
    while text != prev:
        prev = text
        stripped = DIVISION.sub("", text, count=1)
        # Only if something is left: "A." on its own is the whole heading of
        # Lane's alphabetical index, and stripping it leaves nothing to name.
        if stripped.strip():
            text = stripped.strip()
    text = text.rstrip(".,— ").strip()
    letters = [c for c in text if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) <= sum(c.islower() for c in letters):
        return text
    words = []
    for i, word in enumerate(text.split()):
        if word.islower():
            words.append(word)       # a form, spelled as the book spells it
            continue
        lower = word.lower()
        if i > 0 and lower.strip("().,;:'’") in SMALL_WORDS:
            words.append(lower)
            continue
        m = re.search(r"[^\W\d_]", lower)
        words.append(lower if not m else
                     lower[: m.start()] + lower[m.start()].upper() + lower[m.start() + 1 :])
    return " ".join(words)


#: A heading that opens with one of these is not naming a topic, it is
#: continuing the heading above it: Lane's `AGREEMENT.` / `(A.) OF THE VERB.`.
#: Such a title has to take its parent or it says nothing on the map.
CONTINUATION = re.compile(
    r"^(of|with|in|by|for|to|from|as|after|before|without|and|or)\b", re.I)


def sections_of(tokens):
    """The token stream as numbered sections, each carrying the headings above it.

    Every open heading level is kept, not just the nearest one, because the
    family is the <h3>/<h4> above a topic and the title's qualifier is the level
    directly above it.
    """
    open_heads, pending = {}, None
    sections, cur = [], None
    for kind, value in tokens:
        if kind == "head":
            level, text = value
            open_heads = {k: v for k, v in open_heads.items() if k < level}
            open_heads[level] = text.strip().rstrip(".")
            pending = level
        elif kind == "sect":
            cur = {"n": int(value), "heads": dict(open_heads),
                   "opens": pending, "lines": []}
            sections.append(cur)
            pending = None
        elif kind == "line" and cur is not None:
            cur["lines"].append(value)
    for s in sections:
        s["raw"] = "\n".join(s.pop("lines"))
    return sections


#: Lane's parts are titled "PART SECOND ❧ SENTENCES"; the family is the name.
PART_HEADING = re.compile(r"^PART\s+\w+\s*[❧|]\s*")


def family_of(heads):
    """The chapter a topic sits under — Lane's own <h3>/<h4>.

    Falling back to <h5> and then to the part, because Part Second opens with
    §§1023-1097 — the sentence and its parts, then agreement — before its first
    <h3>. Ten topics sit there, and they are the introduction to the whole of
    Lane's syntax rather than an oddity to sweep into `fallbackFamily`.
    """
    for level in (4, 3, 5, 2):
        if level in heads:
            return PART_HEADING.sub("", heads[level])
    return None


def build(secs, min_chars):
    """Topics, plus an account of what happened to every source section.

    Nothing may merely disappear: a section either lands in a topic or is dropped
    for a stated reason. Where this differs from `parse.py` is what happens to a
    run too thin to stand on its own. Bennett's parser drops those, and is right
    to — they are structural stubs, headings with nothing under them. Lane's are
    a one-rule heading set immediately above the rule, so dropping them would
    take the rule with it. They are merged BACKWARD into the topic before them,
    which keeps README's promise that what the parser drops the student can never
    read.
    """
    dropped, keep = [], []
    for s in secs:
        if FROM <= s["n"] <= TO:
            keep.append(s)
        else:
            dropped.append({"n": s["n"], "reason": "part-not-teachable"})

    groups = []
    for s in keep:
        if s["opens"] is not None or not groups:
            groups.append({"heads": s["heads"], "secs": []})
        groups[-1]["secs"].append(s)

    # Merge the thin ones backward, before anything is named or numbered.
    merged = []
    for g in groups:
        text = "\n".join(s["raw"] for s in g["secs"] if s["raw"])
        if merged and plain_len(text) < min_chars:
            merged[-1]["secs"].extend(g["secs"])
            continue
        merged.append(g)
    # A leading group still under the bar has nothing to merge into.
    groups = []
    for g in merged:
        text = "\n".join(s["raw"] for s in g["secs"] if s["raw"])
        if plain_len(text) < min_chars:
            for s in g["secs"]:
                dropped.append({"n": s["n"], "reason": "below-min-length",
                                "chars": plain_len(text)})
            continue
        groups.append(g)

    # --- titles, and what to do when the book uses the same words twice --------
    #
    # Qualified with the heading above, then with the one above that, and only
    # then with the section number. A bare number is a last resort rather than
    # the rule, because "Stems in -ā-: singular cases" tells a student which
    # topic they are looking at and "Singular cases (§435)" does not.
    bases = [clean_title(g["heads"].get(g["secs"][0]["opens"], "")) or
             f"Section {g['secs'][0]['n']}" for g in groups]
    counts = Counter(bases)
    used, titles = set(), []
    for g, base in zip(groups, bases):
        heads, level = g["heads"], g["secs"][0]["opens"]
        title = base
        if counts[base] > 1 or base in used or CONTINUATION.match(base):
            for above in sorted((l for l in heads if l < level), reverse=True):
                qualifier = clean_title(heads[above])
                # A qualifier that is itself a continuation explains nothing:
                # "Of the Noun: The Adjective" names no topic either. Keep going
                # up until the book says something that stands on its own.
                if (not qualifier or CONTINUATION.match(qualifier)
                        or qualifier.lower() in base.lower()):
                    continue
                title = f"{qualifier}: {base}"
                if title not in used:
                    break
        if title in used:
            title = f"{title} (§{g['secs'][0]['n']})"
        used.add(title)
        titles.append(title)

    topics, order, assigned, labels = [], 0, {}, {}
    for g, title in zip(groups, titles):
        nums = [s["n"] for s in g["secs"]]
        n0 = nums[0]
        ref = f"{n0}" if len(nums) == 1 else f"{n0}-{nums[-1]}"
        order += 10
        topic_id = f"ln-{n0:04d}-{slugify(title)}"
        for n in nums:
            assigned[n] = topic_id
        head = family_of(g["heads"])
        family = None
        if head:
            label = clean_title(head)
            family = slugify(label, 60)
            labels.setdefault(family, label)
        topics.append({
            "id": topic_id,
            "ref": ref,
            "title": title,
            "family": family,
            "order": order,
            "text": "\n".join(s["raw"] for s in g["secs"] if s["raw"]),
        })
    return topics, assigned, dropped, labels


def source_file(src):
    path = src or (CACHE if os.path.exists(CACHE) else None)
    if path is None:
        path = os.path.join(tempfile.gettempdir(), f"lane-{EBOOK}.htm")
        print(f"downloading {GUTENBERG_URL}", file=sys.stderr)
        with urllib.request.urlopen(GUTENBERG_URL) as r:
            io.open(path, "wb").write(r.read())
    digest = hashlib.sha256(io.open(path, "rb").read()).hexdigest()
    if digest != SHA256:
        sys.exit(
            f"{path}\n  sha256 {digest}\n  expected {SHA256}\n"
            "That is not the file this parser was written against. Delete the\n"
            "cache to refetch; if Gutenberg has genuinely re-released #44653,\n"
            "re-measure the segmentation against the new one — with\n"
            "scripts/probe-lane-grammar.py — before moving this constant."
        )
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help=f"Gutenberg #{EBOOK} HTML (cached or downloaded if omitted)")
    ap.add_argument("--out", default=os.path.join(PACK, "content", "grammars", "lane.json"))
    a = ap.parse_args()

    profile = json.load(io.open(os.path.join(PACK, "profile.json"), encoding="utf8"))
    shape = next((g for g in profile.get("grammars", []) if g["id"] == "lane"), None)
    min_chars = (shape or {}).get("grammarShape", profile["grammarShape"])["minTextChars"]

    src = source_file(a.src)
    reader = LaneReader()
    reader.feed(io.open(src, encoding="utf8").read())
    reader.close()

    sections = sections_of(reader.tokens)
    nums = sorted(s["n"] for s in sections)
    print(f"parsed §{nums[0]}-{nums[-1]} ({len(sections)} sections)", file=sys.stderr)

    topics, assigned, dropped, labels = build(sections, min_chars)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(topics, io.open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(topics)} topics -> {a.out}", file=sys.stderr)

    families = Counter(t["family"] for t in topics)
    print(f"families: {len(families)}, largest "
          f"{families.most_common(1)[0][1]} ({100*families.most_common(1)[0][1]//len(topics)}%)",
          file=sys.stderr)

    lengths = sorted(plain_len(t["text"]) for t in topics)

    def pct(p):
        return lengths[min(len(lengths) - 1, int(len(lengths) * p))] if lengths else 0

    manifest = {
        "source": {"title": "Lane, A Latin Grammar for Schools and Colleges (1898)",
                   "url": GUTENBERG_URL,
                   "licence": f"public domain (Project Gutenberg #{EBOOK})"},
        "sourceSections": [str(n) for n in nums],
        "assigned": {str(k): v for k, v in sorted(assigned.items())},
        "dropped": sorted(dropped, key=lambda d: d["n"]),
        "topics": len(topics),
        # Labels as well as counts: this is the family list a profile needs, in
        # the order the book sets them, and deriving it by hand from 461 topics
        # is how one gets missed.
        "families": [{"id": f, "label": labels.get(f, f), "topics": families[f]}
                     for f in dict.fromkeys(
                         t["family"] for t in topics if t["family"])],
        "unplacedTopics": families.get(None, 0),
        "sizeChars": {"min": lengths[0] if lengths else 0, "median": pct(0.5),
                      "p90": pct(0.9), "max": lengths[-1] if lengths else 0},
    }
    out_manifest = os.path.join(os.path.dirname(a.out), "lane-coverage.json")
    json.dump(manifest, io.open(out_manifest, "w", encoding="utf8"),
              ensure_ascii=False, indent=1)
    unaccounted = set(nums) - set(assigned) - {d["n"] for d in dropped}
    print(f"accounted: {len(assigned)} assigned, {len(dropped)} dropped, "
          f"{len(unaccounted)} unaccounted -> {out_manifest}", file=sys.stderr)
