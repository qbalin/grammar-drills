"""Lewis & Short -> the pack's article shape.

Builds `content/dictionaries/lewis-short.jsonl` out of Perseus's TEI, which
`scripts/build-dictionary.mjs` then folds and indexes. Split there rather than
finished here for the reason `parse.py` and `build-lemmas.mjs` are split: the
fold is `profile.json`'s and is compiled by `packages/core/src/fold.ts`, and a
second implementation of it in Python is the thing gate D2 exists to catch.

What the pack already ships answers "what is this word" in one line. This
answers what it *means* — L&S divides `fero` across five levels of sense, names
the construction each takes, and cites who wrote it. None of that survives a
gloss, which is the whole reason for a second book.

Two things about the source decide the shape of this file:

  * **The senses are explicit.** `<sense level="2" n="A.">` states a structure
    that a grammar parser has to guess at from prose. So the senses are carried
    out as records with their own `level` and marker, and nothing downstream
    runs them past `parseBlocks` — whose classifier is calibrated on Bennett and
    would flatten L&S's `A.` and `(b)` markers into paragraphs.

  * **It is entirely in Beta Code.** There is no Unicode Greek in the file; the
    14,721 Greek phrases are written `fagei=n`. Untranscoded they reach a
    student as line noise, so `scripts/lib/betacode.py` runs over every one.

Whitespace is collapsed to single spaces throughout, without exception. The
inline markup this emits shares its encoding with grammar prose, where two
spaces mean a new table column — and the source has 34,000 runs of them.

  python3 languages/latin/dict/lewis-short-parse.py --pack languages/latin
"""
import argparse, hashlib, html, io, json, os, re, sys, tempfile, urllib.request
from collections import Counter

PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(PACK))
sys.path.insert(0, os.path.join(REPO, "scripts", "lib"))
from betacode import beta_to_greek  # noqa: E402

DICT_ID = "lewis-short"

#: Perseus ships two machine-readable revisions of L&S, `perseus-eng1` and
#: `perseus-eng2`, of near-identical size. This pins **eng1**: it is the one the
#: pack's reach figures were measured against (79.0% of ranked lemmas, 97.1% of
#: the top 2,000), and two books differing by a few hundred headwords would move
#: gate Y4 for reasons nobody could see in a diff.
SOURCE_URL = (
    "https://raw.githubusercontent.com/PerseusDL/lexica/master"
    "/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng1.xml"
)
SHA256 = "ccbd2f79db1006edc607fe51227babab6872fbdaa4e925f4c1999a3b978041ee"
CACHE = os.path.join(REPO, ".cache", DICT_ID, "lat.ls.perseus-eng1.xml")

# --- markup ----------------------------------------------------------------

#: The inline encoding grammar prose uses, so one decoder serves both and a
#: source document's own markup can never become markup here. Doubled on the way
#: in, exactly as the grammar parsers double a literal bracket.
OPEN, CLOSE = "⟦", "⟧"

ENTRY = re.compile(r"<entryFree\b[^>]*>.*?</entryFree>", re.S)
ATTR = re.compile(r'\b(\w+)="([^"]*)"')
SENSE_OPEN = re.compile(r'<sense\b([^>]*)>')
GREEK = re.compile(r'<(foreign|orth)\b[^>]*lang="greek"[^>]*>(.*?)</\1>', re.S)
#: Column and page breaks. They carry nothing and would leave a stray number.
DROP = re.compile(r"<(cb|pb|figure)\b[^>]*/?>", re.S)
ITALIC = re.compile(r'<hi\b[^>]*rend="ital"[^>]*>(.*?)</hi>', re.S)
QUOTE = re.compile(r"<quote\b[^>]*>(.*?)</quote>", re.S)
TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")


def clean(fragment):
    """One stretch of TEI as a line of the pack's inline markup."""
    s = DROP.sub(" ", fragment)
    # Spaces around it, because this consumes a whole element and every other
    # element becomes a space below. Without them L&S's hybrid etymologies run
    # their two halves together — `bis` beside `<foreign>kli/nh</foreign>` came
    # out `bisκλίνη`, which reads as one word in a script that has no such word.
    s = GREEK.sub(lambda m: " " + beta_to_greek(m.group(2)) + " ", s)
    # Doubled first: a literal bracket in the source must not be read back as a
    # delimiter. The source has none today, and that is not a thing to rely on.
    s = s.replace(OPEN, OPEN * 2).replace(CLOSE, CLOSE * 2)
    s = ITALIC.sub(lambda m: OPEN + "i:" + m.group(1) + CLOSE, s)
    s = QUOTE.sub(lambda m: OPEN + "b:" + m.group(1) + CLOSE, s)
    s = TAG.sub(" ", s)
    s = html.unescape(s)
    # Every run of whitespace, to exactly one space. Two spaces mean a table
    # column downstream, and a tab would break the `key\tids` index outright.
    return WS.sub(" ", s).strip()


def attrs(chunk):
    return dict(ATTR.findall(chunk))


def split_senses(body):
    """The head of an article, then its senses in order.

    `<sense>` nests in the source. Depth is taken from the element's own `level`
    rather than from how deeply it is nested, because the two agree and the
    attribute is what the book states.
    """
    # Each sense's text runs to the next sense's open, whatever their nesting:
    # a level-2 sense sits *inside* its level-1 parent in the source, so taking
    # a sense's whole element would print its children twice.
    opens = [(m.start(), m.end(), attrs(m.group(1))) for m in SENSE_OPEN.finditer(body)]
    if not opens:
        return body, []
    head = body[: opens[0][0]]
    senses = []
    for i, (start, end, a) in enumerate(opens):
        stop = opens[i + 1][0] if i + 1 < len(opens) else len(body)
        text = clean(body[end:stop])
        if not text:
            continue
        try:
            level = int(a.get("level", "1"))
        except ValueError:
            level = 1
        senses.append({"n": (a.get("n") or "").strip(), "level": level, "text": text})
    return head, senses


def parse(source):
    articles, dropped = [], Counter()
    text = io.open(source, encoding="utf8").read()
    body = text[text.find("<entryFree ") :]
    seen = 0
    for m in ENTRY.finditer(body):
        seen += 1
        chunk = m.group(0)
        a = attrs(chunk[: chunk.find(">") + 1])
        key = (a.get("key") or "").strip()
        if not key:
            dropped["no-key"] += 1
            continue
        inner = chunk[chunk.find(">") + 1 : -len("</entryFree>")]
        head, senses = split_senses(inner)
        head = clean(head)
        if not head and not senses:
            dropped["empty"] += 1
            continue
        # Perseus discriminates same-spelled headwords with a trailing digit —
        # `sum1`, `sum2`, `sum3`. Carried as a number and stripped from the key,
        # because the key is what a lemma joins on and a lemma has no digit.
        homograph = None
        base = key
        digits = re.search(r"(\d+)$", key)
        if digits:
            homograph = int(digits.group(1))
            base = key[: digits.start()]
        # Every spelling the entry prints, so the join has more than one way in.
        # Worth 3.7 points of ranked reach and 2.2 of the top 2,000 over the key
        # alone, and it costs nothing: the orths are already in the entry.
        orths = []
        for om in re.finditer(r"<orth\b([^>]*)>(.*?)</orth>", inner, re.S):
            spelling = clean(om.group(2)).replace("-", "").strip()
            if spelling:
                orths.append(spelling)
        articles.append({
            "key": base,
            "headword": orths[0] if orths else base,
            "orths": orths,
            "senses": senses,
            "head": head,
            **({"homograph": homograph} if homograph else {}),
        })
    return articles, dropped, seen


def source_file(src):
    path = src or (CACHE if os.path.exists(CACHE) else None)
    if path is None:
        # Written into the cache rather than into a temp dir: this is a 77 MB
        # download, and a second run that silently refetched it would be a
        # surprise nobody would look for.
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        print(f"downloading {SOURCE_URL}", file=sys.stderr)
        tmp = os.path.join(tempfile.gettempdir(), f"{DICT_ID}.partial")
        with urllib.request.urlopen(SOURCE_URL) as r:
            io.open(tmp, "wb").write(r.read())
        os.replace(tmp, CACHE)
        path = CACHE
    digest = hashlib.sha256(io.open(path, "rb").read()).hexdigest()
    if digest != SHA256:
        sys.exit(
            f"{path}\n  sha256 {digest}\n  expected {SHA256}\n"
            "That is not the file this parser was written against. Delete the\n"
            "cache to refetch; if Perseus has genuinely re-released L&S,\n"
            "re-measure the reach against the new one — with\n"
            "scripts/dictionary-report.mjs — before moving this constant."
        )
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", default=PACK)
    ap.add_argument("--src")
    ap.add_argument("--out")
    a = ap.parse_args()

    out = a.out or os.path.join(a.pack, "content", "dictionaries", f"{DICT_ID}.jsonl")
    os.makedirs(os.path.dirname(out), exist_ok=True)

    articles, dropped, seen = parse(source_file(a.src))

    with io.open(out, "w", encoding="utf8") as f:
        for art in articles:
            f.write(json.dumps(art, ensure_ascii=False) + "\n")

    senses = sum(len(x["senses"]) for x in articles)
    manifest = {
        "source": {
            "title": "Lewis & Short, A Latin Dictionary (Oxford, 1879)",
            "url": SOURCE_URL,
            "licence": "CC BY-SA 4.0 (Perseus Digital Library, Tufts University)",
            "sha256": SHA256,
        },
        "entriesSeen": seen,
        "entries": len(articles),
        "senses": senses,
        "homographs": sum(1 for x in articles if x.get("homograph")),
        "dropped": dict(dropped),
    }
    io.open(
        os.path.join(os.path.dirname(out), f"{DICT_ID}-coverage.json"), "w", encoding="utf8"
    ).write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    print(
        f"{DICT_ID}: {len(articles)} articles, {senses} senses, "
        f"{sum(dropped.values())} dropped of {seen} seen -> {os.path.relpath(out, REPO)}",
        file=sys.stderr,
    )
