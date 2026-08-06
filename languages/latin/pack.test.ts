/**
 * Pack conformance for Latin.
 *
 * These are the tests that belong to the language rather than to the engine:
 * the profile parses, the shipped syllabus matches it, and the fold does what
 * the fixtures say — including over every key of the shipped dictionary, which
 * is the set the fold actually has to get right.
 */
import { describe, it, expect } from "vitest";
import { checkConfetti } from "../../scripts/lib/confetti.mjs";
import { genderOf, glossOf, tagValue } from "../../scripts/lib/lemma-fields.mjs";
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

describe("the paradigm axes", () => {
  const axes = profile.paradigms!;

  it("lays out every part of speech the dictionary inflects", () => {
    expect(Object.keys(axes.tables).sort()).toEqual(
      ["adj", "det", "noun", "num", "pron", "verb"].sort(),
    );
  });

  // Latin's variants — syncopated perfects, archaic spellings — are all being
  // taught, so no cell prefers one over another. Greek is the pack that needs
  // these, and the difference between the two is the whole point of the field.
  it("marks no dialect, because it teaches all of them", () => {
    expect(axes.primary).toBeUndefined();
    expect(axes.secondary).toBeUndefined();
  });

  it("sets the noun out as cases against number", () => {
    const [table] = axes.tables.noun!;
    expect(table!.rows.map((r) => r.label)).toEqual([
      "Nom.", "Gen.", "Dat.", "Acc.", "Abl.", "Voc.", "Loc.",
    ]);
    expect(table!.columns.map((c) => c.label)).toEqual(["Singular", "Plural"]);
  });

  /**
   * The one rule in this block that is easy to get wrong and silent when you
   * do: a future perfect carries every tag the perfect asks for, so unless its
   * row names its tense in full it lands under the perfect and its own row
   * comes out empty. See `buildParadigm`.
   */
  it("names the future perfect in full so it does not land under the perfect", () => {
    for (const table of axes.tables.verb!) {
      const rows = table.rows.map((r) => r.tags.join(","));
      const perfect = table.rows.find((r) => r.label === "Perfect");
      const future = table.rows.find((r) => r.label === "Future perfect");
      if (!future) continue;
      expect(perfect, `${table.title} has a future perfect but no perfect`).toBeDefined();
      expect(future.tags, rows.join(" | ")).toEqual(
        expect.arrayContaining([...perfect!.tags, "future"]),
      );
    }
  });

  it("gives every verb table all six persons, or the imperative's four", () => {
    for (const table of axes.tables.verb!) {
      const persons = table.columns.map((c) => c.label);
      expect(persons.length, table.title).toBe(table.title === "Imperative" ? 4 : 6);
    }
  });

  it("is optional, so a pack that has not written one still parses", () => {
    const raw = JSON.parse(readFileSync(join(here, "profile.json"), "utf8"));
    delete raw.paradigms;
    expect(parseProfile(raw).paradigms).toBeUndefined();
  });

  it("rejects an axis that is not [tags, label]", () => {
    const raw = JSON.parse(readFileSync(join(here, "profile.json"), "utf8"));
    raw.paradigms.tables.noun[0].rows[0] = ["nominative"];
    expect(() => parseProfile(raw)).toThrow(/paradigms\.tables\.noun\[0\]\.rows\[0\]/);
  });

  it("rejects a table with rows and no columns", () => {
    const raw = JSON.parse(readFileSync(join(here, "profile.json"), "utf8"));
    raw.paradigms.tables.noun[0].columns = [];
    expect(() => parseProfile(raw)).toThrow(/needs both rows and columns/);
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

/**
 * What `build-lemmas.mjs` reads out of one dictionary entry.
 *
 * The builder itself needs a 474 MB database and runs once per pack, so it is
 * not a thing anyone can test. These three are the part of it with rules worth
 * pinning down, and they are pure. The `data` blobs below are shaped exactly
 * like the ones `ingest_dictionary.py` writes.
 */
describe("the fields a lemma record is made of", () => {
  const entry = (...senses: unknown[]) => JSON.stringify({ senses });

  it("keeps six senses, not three", () => {
    const many = entry(...Array.from({ length: 9 }, (_, i) => ({ gloss: `sense ${i}` })));
    expect(glossOf(many)).toBe(
      "sense 0; sense 1; sense 2; sense 3; sense 4; sense 5",
    );
  });

  it("skips senses with no gloss rather than joining a gap", () => {
    expect(glossOf(entry({ gloss: "a" }, { tags: ["obsolete"] }, { gloss: "b" }))).toBe("a; b");
  });

  it("treats a malformed entry as one with nothing to say", () => {
    expect(glossOf("{not json")).toBe("");
    expect(genderOf("{not json")).toBeUndefined();
    expect(tagValue("{not json", "declension-")).toBeUndefined();
  });

  // The bug this pack shipped with: gender was read from the senses alone, and
  // wiktextract writes it on the headword row far more often than on a sense.
  // `rex` is the real case — its senses carry a declension and no gender.
  it("takes a gender from the headword row when no sense carries one", () => {
    const rex = entry({ gloss: "king", tags: ["declension-3"] });
    expect(genderOf(rex)).toBeUndefined();
    expect(
      genderOf(rex, [
        { form: "rēx", tags: "canonical,masculine" },
        { form: "rēgis", tags: "genitive,singular" },
      ]),
    ).toBe("masculine");
  });

  it("prefers the sense's gender to the headword row's", () => {
    const both = entry({ gloss: "hand", tags: ["feminine"] });
    expect(genderOf(both, [{ form: "manus", tags: "canonical,masculine" }])).toBe("feminine");
  });

  it("ignores a gender on a row that is not the headword", () => {
    // An adjective's inflected rows are tagged by gender; that is agreement,
    // not the lemma's own gender, and reading it would give every adjective one.
    expect(genderOf(entry({ gloss: "good" }), [
      { form: "bona", tags: "feminine,nominative,singular" },
      { form: "bonum", tags: "neuter,nominative,singular" },
    ])).toBeUndefined();
  });

  it("reads a declension off the sense tags", () => {
    expect(tagValue(entry({ gloss: "girl", tags: ["declension-1"] }), "declension-")).toBe("1");
  });
});

/**
 * The confetti is a decoration, so the renderer is deliberately forgiving: a
 * shape it cannot find is skipped rather than thrown, because failing mid-burst
 * would be worse for a student than drawing badly. That forgiveness is only
 * safe if something else is strict, and this is it.
 */
describe("confetti", () => {
  it("names only shapes it has, paints only colours it has, and draws inside the box", async () => {
    const pack = (await import("./confetti.mjs")).default;
    expect(checkConfetti(pack, { name: "latin" })).toEqual([]);
  });

  it("throws every shape it defines", async () => {
    const pack = (await import("./confetti.mjs")).default;
    const thrown = new Set(pack.throws.flat());
    expect([...Object.keys(pack.shapes)].filter((s) => !thrown.has(s))).toEqual([]);
  });
});
