"""Beta Code -> polytonic Greek, for the dictionary parsers.

Perseus's lexica are entirely in Beta Code — the ASCII transliteration the TLG
settled on in the 1970s. There is no Unicode Greek anywhere in them: Lewis &
Short writes `<foreign lang="greek">fagei=n</foreign>`, and LSJ goes further and
writes its *headwords* that way too, `key="a)nh/nwr"`. So this is not a display
nicety for one book. For Latin it decides whether a quarter of the articles read
as Greek or as line noise; for Greek it decides whether the headwords join to
the pack's lemmas at all, which are Unicode.

Written here rather than taken from `scripts/reference/greek.py`, which already
has one, for two reasons. That table is loaded out of `betunicode_gr.csv` inside
the Eulexis download — 90 MB, uncommitted, and a build step that needs it could
not run in CI. And it is Eulexis's, which is GPLv3; this repo's committed content
is not. The mapping below is the published Beta Code standard, which is a fact
about an encoding rather than anybody's work.

Composition rather than a lookup table of finished characters: a base letter
plus combining marks, normalised to NFC at the end. A table of the ~1,400 legal
precomposed forms would be a table to get wrong in 1,400 places.
"""
import re
import sys
import unicodedata

# --- the alphabet ----------------------------------------------------------

LETTERS = {
    "a": "α", "b": "β", "g": "γ", "d": "δ", "e": "ε", "z": "ζ", "h": "η",
    "q": "θ", "i": "ι", "k": "κ", "l": "λ", "m": "μ", "n": "ν", "c": "ξ",
    "o": "ο", "p": "π", "r": "ρ", "s": "σ", "t": "τ", "u": "υ", "f": "φ",
    "x": "χ", "y": "ψ", "w": "ω",
    # Archaic letters that survive in citations of inscriptions and numerals.
    "v": "ϝ", "j": "ϳ",
}

# `s1` σ, `s2` ς, `s3` ϲ — the explicit forms, which override the positional
# rule below. Beta Code lets a text say "medial sigma here" and mean it.
SIGMAS = {"1": "σ", "2": "ς", "3": "ϲ"}

# --- the marks -------------------------------------------------------------
#
# All of these are combining, and all but the iota subscript sit at combining
# class 230, so within a class Unicode keeps the order they are written in. The
# order below is the one NFC expects: breathing or diaeresis, then accent, then
# the subscript at class 240.
BREATHING = {")": "̓", "(": "̔"}   # psili, dasia
ACCENT = {"/": "́", "\\": "̀", "=": "͂"}  # oxia, varia, perispomeni
DIAERESIS = {"+": "̈"}
SUBSCRIPT = {"|": "ͅ"}                  # ypogegrammeni

MARKS = {**BREATHING, **ACCENT, **DIAERESIS, **SUBSCRIPT}
# The order marks are emitted in, whatever order they were written in.
ORDER = [DIAERESIS, BREATHING, ACCENT, SUBSCRIPT]

_TOKEN = re.compile(r"(\*)?([a-zA-Z])([0-9]?)((?:[)(/\\=+|])*)")


def _compose(letter, marks, capital):
    """One letter and its marks, as NFC."""
    ordered = "".join(
        group[m] for group in ORDER for m in sorted(marks) if m in group
    )
    return unicodedata.normalize("NFC", (letter.upper() if capital else letter) + ordered)


def to_unicode(text):
    """Convert one run of Beta Code to polytonic Greek.

    Anything that is not Beta Code — punctuation, digits, spaces, and the stray
    Latin word an editor left in — is passed through untouched, because these
    strings are quoted inside articles and are not all Greek.
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        m = _TOKEN.match(text, i)
        if not m:
            out.append(text[i])
            i += 1
            continue
        star, letter, digit, written = m.groups()
        base = LETTERS.get(letter.lower())
        if base is None:
            out.append(text[i])
            i += 1
            continue
        # A capital is written `*` first, and its marks may come either before
        # the `*` — the TLG's own order, `*)/W` — or after the letter. Both are
        # in the wild, and the regex above has already taken the trailing ones;
        # the leading ones were consumed by the previous iteration's `written`,
        # so they are handed forward here.
        marks = set(written)
        capital = star is not None
        if letter.lower() == "s":
            if digit:
                glyph = SIGMAS[digit]
            else:
                # Final sigma is positional: a sigma is final when what follows
                # is not another letter of the word.
                after = m.end()
                nxt = text[after] if after < n else ""
                glyph = "σ" if (nxt.isalpha() or nxt == "*") else "ς"
            out.append(glyph.upper() if capital else glyph)
            i = m.end()
            continue
        out.append(_compose(base, marks, capital))
        i = m.end()
    return "".join(out)


# A capital carries its diacritics *before* its letter — `*)/W`, not `*W)/` —
# which is the one place Beta Code's order differs from the lowercase case.
# Straightened by a pre-pass rather than handled in the loop: moved behind the
# letter, a capital reads exactly like a lowercase one and there is one path
# through the transcoder instead of two. Both orders occur, so both are matched.
_LEADING = re.compile(r"\*((?:[)(/\\=+|])+)([a-zA-Z])")
_LEADING_ALT = re.compile(r"((?:[)(/\\=+|])+)\*([a-zA-Z])")


def normalize_capitals(text):
    text = _LEADING.sub(lambda m: "*" + m.group(2) + m.group(1), text)
    return _LEADING_ALT.sub(lambda m: "*" + m.group(2) + m.group(1), text)


def beta_to_greek(text):
    """The whole conversion: capitals straightened, then transcoded."""
    return to_unicode(normalize_capitals(text))


# --- self-check ------------------------------------------------------------
#
# Run this file directly and it proves itself or exits non-zero. Kept in the
# module because the fixtures are the specification: every one of them is a
# string taken out of the two lexica this is written for.
FIXTURES = [
    ("lo/gos", "λόγος"),
    ("a)nh/nwr", "ἀνήνωρ"),
    ("fagei=n", "φαγεῖν"),
    ("mhxanh/", "μηχανή"),
    ("e(/qen", "ἕθεν"),
    ("e)qi/zw", "ἐθίζω"),
    ("ta/lanton", "τάλαντον"),
    ("a)lfo/s", "ἀλφός"),
    ("th=| boulh=|", "τῇ βουλῇ"),
    ("*)/Wr", "Ὤρ"),
    ("*(ellhnikh/", "Ἑλληνική"),
    ("proi+/sthmi", "προΐστημι"),
    ("s2", "ς"),
    ("lo/gos kai/", "λόγος καί"),
]

if __name__ == "__main__":
    bad = 0
    for beta, want in FIXTURES:
        got = beta_to_greek(beta)
        if unicodedata.normalize("NFC", got) != unicodedata.normalize("NFC", want):
            print(f"  {beta!r}\n    got  {got!r}\n    want {want!r}", file=sys.stderr)
            bad += 1
    if bad:
        sys.exit(f"betacode: {bad} of {len(FIXTURES)} fixtures failed")
    print(f"betacode: {len(FIXTURES)} fixtures pass")
