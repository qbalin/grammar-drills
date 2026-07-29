/**
 * Pack conformance for Ancient Greek.
 *
 * These are the tests that belong to the language rather than to the engine:
 * the profile parses, the shipped syllabus matches it, and the fold does what
 * the fixtures say — including over every key of the shipped dictionary, which
 * is the set the fold actually has to get right.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileFold,
  familyLabel,
  familyOf,
  parseProfile,
  profileHash,
  type GrammarSection,
} from "@lang-tutor/core";

const here = fileURLToPath(new URL(".", import.meta.url));
const profile = parseProfile(JSON.parse(readFileSync(join(here, "profile.json"), "utf8")));
const fixtures = JSON.parse(readFileSync(join(here, "fold.fixtures.json"), "utf8"));
const fold = compileFold(profile.fold);
const grammar: GrammarSection[] = JSON.parse(
  readFileSync(join(here, "content", "grammar.json"), "utf8"),
);

describe("the Greek profile", () => {
  it("parses, and names itself after its directory", () => {
    expect(profile.id).toBe("greek");
    expect(profile.l2.code).toBe("grc");
  });

  it("keeps the eleven families in book order", () => {
    // Permanent: a saved placement stores a family's index, so reordering this
    // list resumes an old run against the wrong one.
    expect(profile.families.map((f) => f.id)).toEqual([
      "nouns", "adj", "pron", "verb-forms",
      "sentence-syntax", "adj-pron-syntax", "case-syntax", "verb-syntax",
      "clause-syntax", "particles", "style",
    ]);
  });

  it("names the dual, and does not name an ablative Greek does not have", () => {
    const labels = profile.grammar.paradigmLabels;
    expect(labels).toContain("dual");
    expect(labels).not.toContain("abl");
  });

  it("keeps its storage keys clear of every other pack's", () => {
    // Two packs served from one origin share localStorage, so an overlap here
    // is two languages writing over each other's progress.
    const latin = parseProfile(
      JSON.parse(readFileSync(join(here, "..", "latin", "profile.json"), "utf8")),
    );
    for (const key of Object.keys(profile.storage) as Array<keyof typeof profile.storage>) {
      expect(profile.storage[key]).not.toBe(latin.storage[key]);
    }
  });

  it("rejects a profile with a mistyped key rather than defaulting it", () => {
    const raw = JSON.parse(readFileSync(join(here, "profile.json"), "utf8"));
    raw.fallbackFamly = "style";
    expect(() => parseProfile(raw)).toThrow(/unknown key/);
  });
});

describe("the shipped syllabus against the profile", () => {
  it("gives every section a family the map knows", () => {
    const known = new Set(profile.families.map((f) => f.id));
    const strays = grammar.filter((s) => !known.has(s.family ?? ""));
    expect(strays.map((s) => `${s.id}:${s.family}`)).toEqual([]);
  });

  it("covers the whole syllabus with no section lost or double-counted", () => {
    const counts = new Map(profile.families.map((f) => [f.id, 0]));
    for (const s of grammar) {
      const id = familyOf(profile, s.family);
      counts.set(id, counts.get(id)! + 1);
    }
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(grammar.length);
    // An empty family would render as a dead bar on the map.
    expect([...counts.entries()].filter(([, n]) => n === 0)).toEqual([]);
  });

  it("names every family in words a student would recognise", () => {
    expect(familyLabel(profile, "pron")).toBe("Pronouns");
    expect(familyLabel(profile, "case-syntax")).toBe("Cases & prepositions");
    for (const f of profile.families) {
      // No abbreviations: the map is read, not decoded.
      expect(f.label).toMatch(/^[A-Z][a-z-]+([ ,]+[&a-z-]+)*$/);
    }
  });

  it("prefixes every section id the way the profile says", () => {
    // Three digits is the floor, not the width: Smyth runs to § 3048.
    const wrong = grammar.filter(
      (s) => !new RegExp(`^${profile.grammar.idPrefix}-\\d{3,}-[a-z0-9-]+$`).test(s.id),
    );
    expect(wrong.map((s) => s.id)).toEqual([]);
  });

  it("keeps every title its own, so the map can be navigated", () => {
    const titles = grammar.map((s) => s.title.toLowerCase());
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
  });
});

describe("the fold", () => {
  it.each(fixtures.equal as Array<[string, string]>)(
    "folds %s and %s together",
    (a, b) => {
      expect(fold(a)).toBe(fold(b));
    },
  );

  it.each(fixtures.differ as Array<[string, string]>)(
    "keeps %s and %s apart",
    (a, b) => {
      expect(fold(a)).not.toBe(fold(b));
    },
  );

  it("folds final sigma onto medial, wherever the word sat", () => {
    // Without the ς -> σ map a word would compare unequal to itself depending
    // on its position in the sentence, because lowercasing ΛΟΓΟΣ yields ς.
    expect(fold("ΛΟΓΟΣ")).toBe(fold("λόγος"));
    expect(fold("λόγος")).toBe(fold("λογοσ"));
  });

  it("is idempotent — folding a folded form changes nothing", () => {
    for (const [a] of fixtures.equal as Array<[string, string]>) {
      expect(fold(fold(a))).toBe(fold(a));
    }
  });

  it("has a stable digest, so a changed fold invalidates a built bundle", () => {
    expect(profileHash(profile.fold)).toBe(profileHash(profile.fold));
    const loosened = { ...profile.fold, map: [] as Array<[string, string]> };
    expect(profileHash(loosened)).not.toBe(profileHash(profile.fold));
  });
});

describe("the fold against the shipped dictionary", () => {
  // The dictionary's keys ARE fold output — `build-web-content.mjs` writes a
  // sorted index of them that the web app bisects. So a fold that no longer
  // reproduces its own keys would miss every lookup while the app looked
  // perfectly healthy. Idempotence over the real key set is that check.
  it("leaves every key of the shipped dictionary unchanged", () => {
    const raw = gunzipSync(readFileSync(join(here, "content", "lemmas.json.gz"))).toString("utf8");
    const keys = Object.keys(JSON.parse(raw) as Record<string, unknown>);
    expect(keys.length).toBeGreaterThan(200_000);

    const moved: string[] = [];
    for (const key of keys) {
      if (fold(key) !== key) moved.push(key);
      if (moved.length > 5) break;
    }
    expect(moved).toEqual([]);
  });

  it("folds inflected forms as written onto the keys the dictionary holds", () => {
    const raw = gunzipSync(readFileSync(join(here, "content", "lemmas.json.gz"))).toString("utf8");
    const map = JSON.parse(raw) as Record<string, unknown[]>;
    // Real forms as a sentence would write them, accents and all: each has to
    // land on an entry, which is the whole job of the fold at runtime.
    const written = [
      "ἀνθρώπου", "λόγοις", "ἔλυσαν", "πόλεως", "σώματα", "στρατιῶται",
      "γυναῖκα", "ἐποίησε", "βασιλέως", "ἦλθον", "οἰκίαν", "ΛΟΓΟΣ",
    ];
    const missed = written.filter((w) => !map[fold(w)]);
    expect(missed).toEqual([]);
  });

  it("cites a noun with its article and a verb by its principal parts", () => {
    // What citations.mjs is for: the plain headword tells a reader neither the
    // gender nor how the word declines.
    const raw = gunzipSync(readFileSync(join(here, "content", "lemmas.json.gz"))).toString("utf8");
    const map = JSON.parse(raw) as Record<string, Array<{ lemma: string; citation: string }>>;
    const cite = (word: string) => {
      const candidates = map[fold(word)] ?? [];
      return (candidates.find((c) => c.lemma === word) ?? candidates[0])?.citation;
    };
    expect(cite("λόγος")).toBe("ὁ λόγος, τοῦ λόγου");
    expect(cite("πόλις")).toBe("ἡ πόλις, τῆς πόλεως");
    expect(cite("δῶρον")).toBe("τὸ δῶρον, τοῦ δώρου");
    expect(cite("λύω")).toBe("λύω, λύσω, ἔλυσα, λέλυκα, λέλυμαι, ἐλύθην");
    // The positive degree, not the superlative the corpus happens to prefer.
    expect(cite("καλός")).toBe("καλός, καλή, καλόν");
  });
});
