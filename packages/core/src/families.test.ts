import { describe, expect, it } from "vitest";
import { familyLabel, familyOf } from "./families.js";
import { testProfile } from "./profile.fixture.js";

/**
 * The engine's half of families: that a section's family comes from the
 * content, and that anything unrecognised lands somewhere rather than
 * throwing. Which families a language actually has, and whether the shipped
 * syllabus fills them all, is the pack's business and is tested there.
 */
describe("grammar families", () => {
  it("takes the family from the content, not from the id", () => {
    expect(familyOf(testProfile, "nouns")).toBe("nouns");
    expect(familyOf(testProfile, "verb-syntax")).toBe("verb-syntax");
    // Unknown or absent families fall back rather than throwing.
    expect(familyOf(testProfile, "not-a-family")).toBe(testProfile.fallbackFamily);
    expect(familyOf(testProfile, undefined)).toBe(testProfile.fallbackFamily);
  });

  it("labels a family as the profile names it, and an unknown one as itself", () => {
    for (const f of testProfile.families) {
      expect(familyLabel(testProfile, f.id)).toBe(f.label);
    }
    expect(familyLabel(testProfile, "not-a-family")).toBe("not-a-family");
  });

  it("follows a different pack's families without knowing anything about them", () => {
    // The point of the exercise: swap the list and the same functions answer
    // for a language the engine has never heard of.
    const greekish = {
      ...testProfile,
      families: [
        { id: "accidence", label: "Accidence" },
        { id: "syntax-cases", label: "Syntax of the cases" },
      ],
      fallbackFamily: "syntax-cases",
    };
    expect(familyOf(greekish, "accidence")).toBe("accidence");
    expect(familyOf(greekish, "nouns")).toBe("syntax-cases");
    expect(familyLabel(greekish, "syntax-cases")).toBe("Syntax of the cases");
  });
});
