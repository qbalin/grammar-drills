"""Ancient Greek: Beta Code, folding, and morphology.

Shared by ingest_dictionary_greek.py and ingest_frequency.py. One module rather
than two copies because the dictionary and the frequency list are joined on
their normalized columns: keyed under two normalisations that differ by even one
character, every join silently misses and both halves still look healthy.

The fold here must stay byte-identical to the pack's `profile.fold`
(languages/ancient-greek/profile.json), which is compiled by
packages/core/src/fold.ts. That file applies its steps in a fixed order — trim,
lowercase, decompose, strip, map, recompose — and `greek_fold` repeats it
exactly. Reordering the steps here breaks the invariant that gate D2 checks.
"""
import csv
import os
import re
import unicodedata

# The Eulexis data, which is a 90 MB download rather than anything committed;
# see this directory's README for where to get it. `--data` overrides.
DATA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    ".cache", "eulexis")

# --- folding ---------------------------------------------------------------

# Accents, breathings and the iota subscript are all editorial for a tutor: a
# student typing on a plain keyboard gets them wrong long before they get the
# word wrong. ͂ (perispomeni) and ͅ (ypogegrammeni) sit outside the
# combining-diacritics block and have to be named separately.
_STRIP = re.compile("[\u0300-\u036f\u0342\u0345]")


def greek_fold(word: str) -> str:
    """What counts as the same Greek word. Mirrors profile.fold variant A.

    Python's str.lower() maps Σ to σ everywhere; JavaScript's toLowerCase()
    applies the Unicode Final_Sigma rule and yields ς word-finally. The ς -> σ
    map is what makes the two agree, so it is not optional.
    """
    s = unicodedata.normalize("NFD", word.strip().lower())
    s = _STRIP.sub("", s)
    s = s.replace("ς", "σ")
    return unicodedata.normalize("NFC", s)


# --- Beta Code -------------------------------------------------------------

# Eulexis marks vowel quantity that is not part of the printed word: a macron
# on a long alpha, a breve on a short one. Both are apparatus, and the fold
# would drop them anyway.
_QUANTITY = re.compile(r"[_^]")
# LSJ distinguishes homonyms with a trailing digit — ai)re/w1, ai)re/w2.
_HOMONYM = re.compile(r"\d+$")


# Typographic variants the table also lists for keys we need as plain letters:
# medial beta, lunate sigma, the micro sign, and final sigma, which is decided
# by position rather than by the letter it was written with.
_VARIANTS = "ϐϲµς"


def load_betacode(path=None):
    """The Beta Code -> Unicode table Eulexis ships, as a longest-match list.

    The file is ordered most-decorated-first and gives some keys more than one
    reading — `b` is both β and the medial ϐ, `s` is σ, ς and lunate ϲ. Variant
    glyphs are dropped and the first surviving reading of a key wins.
    """
    path = path or os.path.join(DATA, "betunicode_gr.csv")
    table = {}
    with open(path, encoding="utf-8") as fh:
        for row in csv.reader(fh, delimiter="\t"):
            if len(row) < 3 or not row[0] or row[0].startswith(" !"):
                continue
            if row[2] in _VARIANTS:
                continue
            table.setdefault(row[0], row[2])
    # Longest key first, so `*)/a|` is never pre-empted by `*` or `a`.
    return table, sorted(table, key=len, reverse=True)


_TABLE = None


def beta_to_unicode(beta: str) -> str:
    """Convert one Beta Code word to printed polytonic Greek, NFC."""
    global _TABLE
    if _TABLE is None:
        _TABLE = load_betacode()
    table, keys = _TABLE

    s = _HOMONYM.sub("", _QUANTITY.sub("", beta))
    out, i = [], 0
    while i < len(s):
        for key in keys:
            if s.startswith(key, i):
                out.append(table[key])
                i += len(key)
                break
        else:
            # Apostrophes, hyphens and anything the table does not name pass
            # through: they are punctuation of the citation, not letters.
            out.append(s[i])
            i += 1
    word = unicodedata.normalize("NFC", "".join(out))
    return _final_sigma(word)


_SIGMA_FINAL = re.compile("\u03c3(?![\u0370-\u03ff\u1f00-\u1fff])")


def _final_sigma(word: str) -> str:
    """σ at the end of a word is written ς. The table cannot know position."""
    return _SIGMA_FINAL.sub("ς", word)


# --- morphology ------------------------------------------------------------

# Eulexis's morphology vocabulary, spelled out. Tags are what citations.mjs
# and the coverage gates read, and Appendix A requires them lowercase and
# alphabetically sorted, so the values here are the canonical spellings.
MORPH = {
    "sg": ["singular"], "pl": ["plural"], "dual": ["dual"],
    "1st": ["first"], "2nd": ["second"], "3rd": ["third"],
    "nom": ["nominative"], "gen": ["genitive"], "dat": ["dative"],
    "acc": ["accusative"], "voc": ["vocative"],
    "masc": ["masculine"], "fem": ["feminine"], "neut": ["neuter"],
    "pres": ["present"], "imperf": ["imperfect"], "fut": ["future"],
    "aor": ["aorist"], "perf": ["perfect"], "plup": ["pluperfect"],
    "futperf": ["future-perfect"],
    "act": ["active"], "mid": ["middle"], "pass": ["passive"],
    "mp": ["mediopassive"],
    "ind": ["indicative"], "subj": ["subjunctive"], "opt": ["optative"],
    "imperat": ["imperative"], "inf": ["infinitive"], "part": ["participle"],
    "comp": ["comparative"], "superl": ["superlative"],
    "irreg_comp": ["comparative", "irregular"],
    "irreg_superl": ["superlative", "irregular"],
    "indeclform": ["indeclinable"], "indecl": ["indeclinable"],
    "adverbial": ["adverbial"], "adverb": ["adverb"],
    "prep": ["preposition"], "conj": ["conjunction"],
    "particle": ["particle"], "numeral": ["numeral"],
    "exclam": ["exclamation"], "interrog": ["interrogative"],
    "proclitic": ["proclitic"], "enclitic": ["enclitic"],
    "parad_form": ["paradigm-form"], "nu_movable": ["nu-movable"],
    "a_priv": ["alpha-privative"], "iota_intens": ["iota-intensive"],
    "contr": ["contracted"], "expletive": ["expletive"],
    "geog_name": ["geographic"], "alphabetic": ["letter-name"],
    # Dialect and register, kept so a citation can prefer the plain Attic form.
    "attic": ["attic"], "epic": ["epic"], "doric": ["doric"],
    "ionic": ["ionic"], "aeolic": ["aeolic"], "homeric": ["homeric"],
    "poetic": ["poetic"], "prose": ["prose"],
}

DIALECTS = {"attic", "epic", "doric", "ionic", "aeolic", "homeric", "poetic",
            "prose"}
CASES = {"nominative", "genitive", "dative", "accusative", "vocative"}
GENDERS = {"masculine", "feminine", "neuter"}
MOODS = {"indicative", "subjunctive", "optative", "imperative", "infinitive",
         "participle"}
TENSES = {"present", "imperfect", "future", "aorist", "perfect", "pluperfect",
          "future-perfect"}


def parse_morph(desc: str):
    """'aor ind act 3rd sg (doric)' -> a sorted tag tuple, plus unknown tokens.

    Slashed tokens are Eulexis's ambiguity notation: `nom/voc sg` is one form
    that is either nominative or vocative, so both tags go on. Unknown tokens
    are returned rather than dropped — a vocabulary that has grown a new token
    should be a visible failure, not a quietly untagged row.
    """
    tags, unknown = set(), []
    for token in desc.replace("(", " ").replace(")", " ").split():
        for part in token.split("/"):
            if not part:
                continue
            mapped = MORPH.get(part)
            if mapped is None:
                unknown.append(part)
            else:
                tags.update(mapped)
    return tuple(sorted(tags)), unknown


# Closed classes morphology alone cannot separate: the article and the
# pronouns inflect for all three genders exactly as adjectives do.
CLOSED_CLASS = {
    "ὁ": "art",
    "ἐγώ": "pron", "σύ": "pron", "ἡμεῖς": "pron", "ὑμεῖς": "pron",
    "ἕ": "pron", "σφεῖς": "pron", "οὗ": "pron", "μιν": "pron", "νιν": "pron",
    "αὐτός": "pron", "οὗτος": "pron", "ὅδε": "pron", "ἐκεῖνος": "pron",
    "ὅς": "pron", "ὅστις": "pron", "τις": "pron", "τίς": "pron",
    "ἀλλήλων": "pron", "ἐμαυτοῦ": "pron", "σεαυτοῦ": "pron", "ἑαυτοῦ": "pron",
    "ὅσος": "pron", "οἷος": "pron", "τοιοῦτος": "pron", "τοσοῦτος": "pron",
    "ποῖος": "pron", "πόσος": "pron", "ἀμφότερος": "pron", "ἕκαστος": "pron",
    "ἄλλος": "pron", "οὐδείς": "pron", "μηδείς": "pron",
}


def pos_of(lemma: str, tag_sets) -> str:
    """The part of speech a lemma's own analyses imply.

    Order matters: a closed class first, then verbs by mood or tense, then the
    indeclinables by their own label, and only then the nominals — where the
    signal is gender. Greek adjectives inflect through all three genders and
    nouns do not, so a lemma showing neuter beside masculine or feminine is an
    adjective.
    """
    if lemma in CLOSED_CLASS:
        return CLOSED_CLASS[lemma]

    tags = set()
    for t in tag_sets:
        tags.update(t)

    if tags & MOODS or tags & TENSES:
        return "verb"
    for label, pos in (("preposition", "prep"), ("conjunction", "conj"),
                       ("numeral", "num"), ("particle", "particle"),
                       ("interrogative", "pron"), ("exclamation", "particle")):
        if label in tags:
            return pos

    # Declined before adverbial: almost every adjective also lists an adverb in
    # -ως under the same lemma, and reading that first turns καλός into an
    # adverb. A word that inflects for case is a nominal whatever else it does.
    if tags & CASES:
        if tags & {"comparative", "superlative"}:
            return "adj"
        if "neuter" in tags and tags & {"masculine", "feminine"}:
            return "adj"
        return "name" if _is_proper(lemma) else "noun"
    if "adverb" in tags or "adverbial" in tags:
        return "adv"
    return "particle"


def _is_proper(lemma: str) -> bool:
    """A capitalised headword. Greek has letter case, so this is a real signal."""
    for ch in unicodedata.normalize("NFD", lemma):
        if ch.isalpha():
            return ch.isupper()
    return False


def gender_of(counts) -> str:
    """A noun's gender, for the article a citation prints in front of it.

    Takes how often each gender was seen across the lemma's analyses rather
    than the first one found: a stray ambiguous parse should not outvote the
    paradigm.
    """
    seen = [g for g in GENDERS if counts.get(g)]
    if not seen:
        return ""
    if counts.get("masculine") and counts.get("feminine") and not counts.get("neuter"):
        # ὁ/ἡ θεός: one noun, two genders, and the citation says so.
        return "common"
    return max(seen, key=lambda g: counts[g])
