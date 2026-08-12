/**
 * Pack conformance for Ancient Greek.
 *
 * These are the tests that belong to the language rather than to the engine:
 * the profile parses, the shipped syllabus matches it, and the fold does what
 * the fixtures say — including over every key of the shipped dictionary, which
 * is the set the fold actually has to get right.
 */
import { describe, it, expect } from "vitest";
import { checkConfetti } from "../../scripts/lib/confetti.mjs";
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
    expect(profile.id).toBe("ancient-greek");
    expect(profile.l2.code).toBe("grc");
  });

  it("keeps the thirteen families in book order", () => {
    // This list is the order the grammar index is drawn in, and so the order a
    // student learns to look things up in. Reordering it moves the furniture.
    // `sounds` and `word-formation` are Smyth's Parts I and III: no translation
    // exercise can be written for them, and both are read all the same.
    expect(profile.families.map((f) => f.id)).toEqual([
      "sounds", "nouns", "adj", "pron", "verb-forms", "word-formation",
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
  type Entry = { lemma: string; pos: string; citation: string };

  /** The distinct entries, and the sorted form index that points into them. */
  const table = (): Entry[] =>
    JSON.parse(
      gunzipSync(readFileSync(join(here, "content", "lemmas.json.gz"))).toString("utf8"),
    );
  const formLines = (): string[] =>
    gunzipSync(readFileSync(join(here, "content", "forms.txt.gz")))
      .toString("utf8")
      .split("\n");
  const formKeys = () => formLines().map((line) => line.split("\t")[0]);

  // The dictionary's keys ARE fold output — `build-lemmas.mjs` writes a sorted
  // index of them that both apps bisect. So a fold that no longer reproduces
  // its own keys would miss every lookup while the app looked perfectly
  // healthy. Idempotence over the real key set is that check.
  it("leaves every key of the shipped dictionary unchanged", () => {
    const keys = formKeys();
    expect(keys.length).toBeGreaterThan(200_000);

    const moved: string[] = [];
    for (const key of keys) {
      if (fold(key) !== key) moved.push(key);
      if (moved.length > 5) break;
    }
    expect(moved).toEqual([]);
  });

  it("folds inflected forms as written onto the keys the dictionary holds", () => {
    const keys = new Set(formKeys());
    // Real forms as a sentence would write them, accents and all: each has to
    // land on an entry, which is the whole job of the fold at runtime.
    const written = [
      "ἀνθρώπου", "λόγοις", "ἔλυσαν", "πόλεως", "σώματα", "στρατιῶται",
      "γυναῖκα", "ἐποίησε", "βασιλέως", "ἦλθον", "οἰκίαν", "ΛΟΓΟΣ",
    ];
    const missed = written.filter((w) => !keys.has(fold(w)));
    expect(missed).toEqual([]);
  });

  it("cites a noun with its article and a verb by its principal parts", () => {
    // What citations.mjs is for: the plain headword tells a reader neither the
    // gender nor how the word declines.
    const entries = table();
    const byForm = new Map(
      formLines().map((line) => {
        const [form, ids] = line.split("\t");
        return [form, (ids ?? "").split(",").filter(Boolean).map(Number)];
      }),
    );
    const cite = (word: string) => {
      const candidates = (byForm.get(fold(word)) ?? []).map((i) => entries[i]);
      return (candidates.find((c) => c?.lemma === word) ?? candidates[0])?.citation;
    };
    expect(cite("λόγος")).toBe("ὁ λόγος, τοῦ λόγου");
    expect(cite("πόλις")).toBe("ἡ πόλις, τῆς πόλεως");
    expect(cite("δῶρον")).toBe("τὸ δῶρον, τοῦ δώρου");
    expect(cite("λύω")).toBe("λύω, λύσω, ἔλυσα, λέλυκα, λέλυμαι, ἐλύθην");
    // The positive degree, not the superlative the corpus happens to prefer.
    expect(cite("καλός")).toBe("καλός, καλή, καλόν");
  });
});

describe("the paradigm axes", () => {
  const axes = profile.paradigms!;

  it("lays out every part of speech the analyser inflects", () => {
    expect(Object.keys(axes.tables).sort()).toEqual(
      ["adj", "art", "name", "noun", "num", "pron", "verb"].sort(),
    );
  });

  it("gives the noun three numbers, because Greek has a dual", () => {
    const [table] = axes.tables.noun!;
    expect(table!.columns.map((c) => c.label)).toEqual(["Singular", "Dual", "Plural"]);
    expect(table!.rows.map((r) => r.label)).toEqual(["Nom.", "Gen.", "Dat.", "Acc.", "Voc."]);
  });

  /**
   * Morpheus tags nearly every form with the dialects it belongs to, so a
   * genitive singular arrives five ways. Without these two lists the table
   * would print all five and leave the student to guess which is the Attic
   * they are being taught — and the Attic one is usually marked too, so the
   * lists have to name both sides.
   */
  it("names the dialect it teaches and the ones it does not", () => {
    expect(axes.primary).toEqual(["attic"]);
    expect(axes.secondary).toContain("epic");
    expect(axes.secondary).toContain("doric");
    // Naming a dialect on both lists would make the rule read itself backwards.
    expect(axes.secondary!.filter((tag) => axes.primary!.includes(tag))).toEqual([]);
  });

  it("uses the analyser's own words for a person, not another language's", () => {
    // `first-person` is what the Latin pack's source writes; this one writes
    // `first`, and a column that names the wrong one silently never fills.
    for (const table of axes.tables.verb!) {
      for (const column of table.columns) {
        expect(column.tags.some((t) => t.endsWith("-person")), column.label).toBe(false);
      }
    }
  });

  it("keeps the middle and the passive apart where the analyser does", () => {
    const rows = axes.tables.verb!.flatMap((t) => t.rows.map((r) => r.tags.join(",")));
    // Present and perfect are mediopassive — one form for both voices — while
    // the future and the aorist have a passive of their own.
    expect(rows).toContain("present,indicative,mediopassive");
    expect(rows).toContain("aorist,indicative,passive");
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
    expect(checkConfetti(pack, { name: "ancient-greek" })).toEqual([]);
  });

  it("throws every shape it defines", async () => {
    const pack = (await import("./confetti.mjs")).default;
    const thrown = new Set(pack.throws.flat());
    expect([...Object.keys(pack.shapes)].filter((s) => !thrown.has(s))).toEqual([]);
  });
});
