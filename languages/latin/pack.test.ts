/**
 * Pack conformance for Latin.
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

describe("the Latin profile", () => {
  it("parses, and names itself after its directory", () => {
    expect(profile.id).toBe("latin");
    expect(profile.l2.name).toBe("Latin");
  });

  it("keeps the nine families in book order", () => {
    expect(profile.families.map((f) => f.id)).toEqual([
      "nouns", "adj", "pron", "verb-forms", "particles",
      "noun-syntax", "adj-pron-syntax", "verb-syntax", "style",
    ]);
    // Never abbreviated: a map is for finding your way, and "Ptcl" tells a
    // student nothing about where they are.
    expect(profile.families.map((f) => f.label)).toContain("Adjective & pronoun syntax");
  });

  it("rejects a profile with a mistyped key rather than defaulting it", () => {
    const raw = JSON.parse(readFileSync(join(here, "profile.json"), "utf8"));
    raw.fallbackFamly = "style";
    expect(() => parseProfile(raw)).toThrow(/unknown key/);
  });

  it("rejects a fallback family that is not one of the families", () => {
    const raw = JSON.parse(readFileSync(join(here, "profile.json"), "utf8"));
    raw.fallbackFamily = "syntax";
    expect(() => parseProfile(raw)).toThrow(/fallbackFamily/);
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
    expect(familyLabel(profile, "particles")).toBe("Particles");
    expect(familyLabel(profile, "noun-syntax")).toBe("Noun syntax");
    for (const f of profile.families) {
      // No abbreviations: the map is read, not decoded.
      expect(f.label).toMatch(/^[A-Z][a-z-]+( [&a-z-]+)*$/);
    }
  });

  it("prefixes every section id the way the profile says", () => {
    const wrong = grammar.filter(
      (s) => !new RegExp(`^${profile.grammar.idPrefix}-\\d{3}-[a-z0-9-]+$`).test(s.id),
    );
    expect(wrong.map((s) => s.id)).toEqual([]);
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
    // Real forms as a sentence would write them, macrons and all: each has to
    // land on an entry, which is the whole job of the fold at runtime. Common
    // words only — a proper noun like `Jūlia` is absent from the dictionary by
    // design, so it would be testing coverage rather than folding.
    const written = [
      "Fīliae", "agricolae", "aquam", "altō", "puteō", "portābant",
      "servōrum", "manibus", "amāvērunt", "rēgem", "bonīs", "PVELLA",
    ];
    const missed = written.filter((w) => !map[fold(w)]);
    expect(missed).toEqual([]);
  });
});
