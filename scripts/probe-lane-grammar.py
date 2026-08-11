#!/usr/bin/env python3
"""Would Lane's grammar segment into a syllabus a student could navigate?

This answers one question and then gets thrown away, or kept as the record of
why the answer was what it was — the same standing as `scripts/probe-quotes.mjs`.
It is deliberately not part of the build: no gate reads it and nothing ships
from it. Run it before writing any of the pipeline it is meant to justify.

    python3 scripts/probe-lane-grammar.py [--pack languages/latin] [--src <htm>]
      --families      print the family list the segmentation would draw
      --sample <n>    print n topics with their first line of prose

Python rather than `.mjs`, unlike every other script here, because what it is
prototyping is a parser that has to be Python: `languages/latin/grammar/parse.py`
reads Bennett, and Lane's would be its sibling, sharing its markup and its
HTMLParser. A probe written in the other language would have proved the wrong
thing works.

`scripts/lane-quotes.mjs` already reads this book, but for SENTENCES, and only
Part Second. A syllabus needs PROSE, over the whole teachable range, grouped into
topics that clear `profile.grammarShape`. Whether the second is possible does not
follow from the first, which is why this exists.
"""
import argparse, bisect, csv, json, os, re, statistics, sys
from collections import Counter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ap = argparse.ArgumentParser()
ap.add_argument("--pack", default=os.path.join("languages", "latin"))
ap.add_argument("--src")
ap.add_argument("--families", action="store_true")
ap.add_argument("--sample", type=int, default=0)
args = ap.parse_args()

PACK = args.pack if os.path.isabs(args.pack) else os.path.join(REPO, args.pack)
SRC = args.src or os.path.join(REPO, ".cache", "lane-44653", "44653-h.htm")
if not os.path.exists(SRC):
    sys.exit(
        f"No Lane source at {SRC}.\n"
        "`node --import tsx scripts/lane-quotes.mjs --pack languages/latin` fetches\n"
        "and pins it, or pass one with --src."
    )
html = open(SRC, encoding="utf8").read()

profile = json.load(open(os.path.join(PACK, "profile.json"), encoding="utf8"))
SHAPE = profile["grammarShape"]

# --- reading the markup -------------------------------------------------------
#
# Flat text only. The real parser keeps Bennett's ⟦b:…⟧ markup so that
# `grammar-blocks.ts` can find the paradigms, and `plain_len` strips it back off
# again before measuring — so a flat extract is what the thresholds are about
# anyway, and the probe does not have to reimplement the encoder to measure.
ENT = re.compile(r"&([a-zA-Z#0-9]+);")
NAMES = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "#39": "'",
         "nbsp": " ", "mdash": "—", "ndash": "–", "rsquo": "’", "lsquo": "‘",
         "ldquo": "“", "rdquo": "”", "hellip": "…", "aelig": "æ", "oelig": "œ"}


def flat(x):
    x = re.sub(r"<[^>]+>", "", x)
    x = ENT.sub(lambda m: NAMES.get(m.group(1).lower(), " "), x)
    return re.sub(r"\s+", " ", x).strip()


#: Lane's own section marker, as `lane-quotes.mjs` reads it.
marks = [(int(m.group(1)), m.start()) for m in re.finditer(r'<a id\s*=\s*"sec(\d+)"', html)]
pos = [p for _, p in marks]


def section_at(i):
    j = bisect.bisect_right(pos, i) - 1
    return marks[j][0] if j >= 0 else 0


# --- where a topic begins -----------------------------------------------------
#
# Bennett's parser takes a topic to be a run of sections under one run-heading,
# and finds those headings by their capitalisation. Lane needs no such guess: the
# Distributed Proofreaders transcription marks its hierarchy with real <h2>-<h6>,
# and inside the inflection chapters — where Lane sets a run-heading as a styled
# paragraph rather than a heading — with class="header". Both are read here, the
# second as a level below <h6>, because that is where it sits in the book.
HEADER = 7

BOUNDS = []
for lvl in (2, 3, 4, 5, 6):
    for m in re.finditer(r"<h%d\b[^>]*>[\s\S]*?</h%d>" % (lvl, lvl), html):
        BOUNDS.append((m.start(), lvl, flat(m.group(0))))
for m in re.finditer(r'<(\w+)[^>]*class\s*=\s*"[^"]*\bheader\b[^"]*"[^>]*>[\s\S]*?</\1>', html):
    BOUNDS.append((m.start(), HEADER, flat(m.group(0))))
BOUNDS.sort()

# The enclosing heading at every shallower level, kept per boundary: this is
# Lane's own table of contents, and the candidate family list.
ancestors = {}
_stack = {}
for _at, _lvl, _title in BOUNDS:
    _stack = {k: v for k, v in _stack.items() if k < _lvl}
    ancestors[_at] = dict(_stack)
    _stack[_lvl] = _title

# --- the teachable range ------------------------------------------------------
#
# Mirrors `parse.py`'s TEACHABLE_PARTS, which keeps inflections, particles and
# syntax and drops the rest. Lane's four movements map onto Bennett's six parts
# like this:
#
#   §§1-14      parts of speech — a page of definitions, no exercise in it
#   §§15-395    sound and word formation — Bennett's dropped Parts I and IV
#   §§396-1022  inflection, and the adverb/conjunction/preposition with it
#               — Bennett's Parts II and III
#   §§1023-2298 syntax — Bennett's Part V
#   §§2299-2427 the appendix: peculiarities of verbs, indirect discourse,
#               pronouns, numerals. Syntax under another name, so it is kept.
#   §§2428-2745 prosody and versification — Bennett's dropped Part VI, and
#               refused twice over for the reason `lane-quotes.mjs:78` gives.
FROM, TO = 396, 2427


def segment():
    """Topics, one per boundary, each running to the next boundary.

    A run too short to stand on its own is merged BACKWARD into the topic before
    it rather than dropped. Bennett's parser drops its below-min-length groups,
    which is right there — they are structural stubs, headings with nothing under
    them. Here they are Lane setting a one-rule heading immediately above the
    rule, and dropping them would take the rule with it. README states the
    principle the merge is keeping: what the parser drops, the student can never
    read.
    """
    raw = []
    for i, (at, lvl, title) in enumerate(BOUNDS):
        first = section_at(at)
        if not (FROM <= first <= TO):
            continue
        end = BOUNDS[i + 1][0] if i + 1 < len(BOUNDS) else len(html)
        raw.append({"from": first, "to": max(first, section_at(end - 1)),
                    "level": lvl, "title": title, "anc": ancestors[at],
                    "text": flat(html[at:end])})
    out = []
    for t in raw:
        if out and (len(t["text"]) < SHAPE["minTextChars"]
                    or len(out[-1]["text"]) < SHAPE["minTextChars"]):
            out[-1]["to"] = t["to"]
            out[-1]["text"] += " " + t["text"]
        else:
            out.append(dict(t))
    return [t for t in out if len(t["text"]) >= SHAPE["minTextChars"]]


def family_of(t):
    """The nearest enclosing <h3> or <h4> — Lane's own chapter."""
    for lvl in (4, 3):
        if lvl in t["anc"]:
            return t["anc"][lvl]
    return t["title"] if t["level"] in (3, 4) else "(none)"


topics = segment()
sizes = sorted(len(t["text"]) for t in topics)
median = statistics.median(sizes)
p90 = sizes[int(len(sizes) * 0.9)]
families = Counter(family_of(t) for t in topics)
share = 100 * families.most_common(1)[0][1] / len(topics)


def gate(name, ok, got, want):
    print(f"  {'pass' if ok else 'FAIL'}  {name:<22} {got:<22} want {want}")


print(f"Lane §§{FROM}-{TO}, segmented at its own headings\n")
print(f"  {len(topics)} topics from {len(BOUNDS)} boundaries "
      f"({sum(sizes)//1024} KB of prose)\n")
print("against this pack's grammarShape, which is Bennett's:")
gate("G1 topic count", SHAPE["minTopics"] <= len(topics) <= SHAPE["maxTopics"],
     str(len(topics)), f"{SHAPE['minTopics']}-{SHAPE['maxTopics']}")
gate("G2 min chars", sizes[0] >= SHAPE["minTextChars"], str(sizes[0]),
     f">= {SHAPE['minTextChars']}")
gate("G2 max chars", sizes[-1] <= SHAPE["maxTextChars"], str(sizes[-1]),
     f"<= {SHAPE['maxTextChars']}")
gate("G3 median chars", SHAPE["medianTextCharsRange"][0] <= median <= SHAPE["medianTextCharsRange"][1],
     f"{median:.0f}", f"{SHAPE['medianTextCharsRange'][0]}-{SHAPE['medianTextCharsRange'][1]}")
gate("G3 p90 chars", p90 <= SHAPE["p90TextCharsMax"], str(p90),
     f"<= {SHAPE['p90TextCharsMax']}")
gate("G4 family share", share <= SHAPE["maxFamilySharePct"],
     f"{share:.1f}% of {len(families)}", f"<= {SHAPE['maxFamilySharePct']}%")

# --- what the existing cross-reference map reaches ---------------------------
print()
tsv = os.path.join(PACK, "grammar", "lane-topics.tsv")
if not os.path.exists(tsv):
    print(f"no {tsv}; skipping the map coverage")
    sys.exit(0)

mapped = {}
with open(tsv, encoding="utf8") as f:
    rows = csv.reader(f, delimiter="\t")
    next(rows)
    for row in rows:
        if row and row[0].strip():
            mapped[int(row[0])] = [x for x in (row[1] if len(row) > 1 else "").split(",") if x.strip()]

bennett = json.load(open(os.path.join(PACK, "content", "grammar.json"), encoding="utf8"))
bn_ids = {s["id"] for s in bennett}
covered = sorted(mapped)
print(f"lane-topics.tsv: {len(mapped)} rows, §{covered[0]}-{covered[-1]}")
for label, group in (
    ("inflection §396-1022", [t for t in topics if t["from"] <= 1022]),
    ("syntax §1023-2427", [t for t in topics if t["from"] > 1022]),
):
    hit = sum(1 for t in group
              if any(mapped.get(n) for n in range(t["from"], t["to"] + 1)))
    print(f"  {label:<22} {len(group):>4} topics, {hit:>4} reach a Bennett topic "
          f"({100*hit//max(1,len(group))}%)")
reached = {i for t in topics for n in range(t["from"], t["to"] + 1)
           for i in mapped.get(n, [])} & bn_ids
print(f"  Bennett topics reached      {len(reached)}/{len(bennett)}")
unreached = Counter(s.get("family") for s in bennett if s["id"] not in reached)
print(f"  unreached, by family        "
      + ", ".join(f"{f} {n}" for f, n in unreached.most_common()))

if args.families:
    print(f"\n--- the {len(families)} families Lane's own <h3>/<h4> would draw ---")
    for f, n in families.most_common():
        print(f"  {n:>4}  {f[:72]}")

if args.sample:
    print(f"\n--- {args.sample} topics ---")
    step = max(1, len(topics) // args.sample)
    for t in topics[::step][: args.sample]:
        print(f"  §{t['from']}-{t['to']:<5} h{t['level']} {len(t['text']):>6}ch  "
              f"{t['title'][:44]:<44} | {t['text'][:60]}")
