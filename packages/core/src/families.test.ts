import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAMILIES, familyFull, familyLabel, familyOf } from "./families.js";
import type { GrammarSection } from "./types.js";

const grammar: GrammarSection[] = JSON.parse(
  readFileSync(new URL("../../../content/grammar.json", import.meta.url), "utf8"),
);

describe("grammar families", () => {
  it("takes the family from the content, not from the id", () => {
    expect(familyOf("nouns")).toBe("nouns");
    expect(familyOf("verb-syntax")).toBe("verb-syntax");
    // Unknown or absent families fall back rather than throwing.
    expect(familyOf("not-a-family")).toBe("style");
    expect(familyOf(undefined)).toBe("style");
  });

  it("gives every shipped section a family the map knows", () => {
    const known = new Set(FAMILIES.map((f) => f.id));
    const strays = grammar.filter((s) => !known.has(s.family as never));
    expect(strays.map((s) => `${s.id}:${s.family}`)).toEqual([]);
  });

  it("covers the whole syllabus with no section lost or double-counted", () => {
    const counts = new Map(FAMILIES.map((f) => [f.id, 0]));
    for (const s of grammar) {
      const id = familyOf(s.family);
      counts.set(id, counts.get(id)! + 1);
    }
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(grammar.length);
    // Every family is populated — an empty one would render as a dead bar.
    expect([...counts.entries()].filter(([, n]) => n === 0)).toEqual([]);
  });

  it("labels every family, short and long", () => {
    expect(familyLabel("pron")).toBe("Pron");
    expect(familyFull("pron")).toBe("Pronouns");
    for (const f of FAMILIES) {
      expect(familyLabel(f.id)).toBe(f.label);
      expect(familyFull(f.id)).toBe(f.full);
      // The map pads to the longest short label; keep them narrow.
      expect(f.label.length).toBeLessThanOrEqual(8);
    }
  });
});
