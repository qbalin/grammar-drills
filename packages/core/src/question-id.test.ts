import { describe, expect, it } from "vitest";
import { questionId } from "./question-id.js";

describe("questionId", () => {
  it("is stable, and depends on both fields", () => {
    const id = questionId("The girl praises the sailor.", "Puella nautam laudat.");
    expect(id).toBe(questionId("The girl praises the sailor.", "Puella nautam laudat."));
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(questionId("The girl praises the sailor.", "Puella nautam laudāt."))
      .not.toBe(id);
    expect(questionId("The girl praises the sailors.", "Puella nautam laudat."))
      .not.toBe(id);
  });

  it("cannot be confused by moving the boundary between the fields", () => {
    // The pair is joined by a NUL rather than by anything either field could
    // hold, so no two different pairs flatten to the same string.
    expect(questionId("a b", "c")).not.toBe(questionId("a", "b c"));
    expect(questionId("a", "")).not.toBe(questionId("", "a"));
  });

  it("changes when only a diacritic changes", () => {
    // The one that would matter most if the hash folded anything: these are
    // different questions and a pack that teaches quantity must see them so.
    expect(questionId("p", "malum")).not.toBe(questionId("p", "mālum"));
  });

  it("spreads a bank the size of a real one across both lanes", () => {
    // Not a proof, a tripwire: the failure mode of two lanes sharing a base is
    // that they move together and the id is 32 bits wearing 64 bits' clothes.
    const ids = new Set<string>();
    const his = new Set<string>();
    const los = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      const id = questionId(`prompt number ${i}`, `answer number ${i}`);
      ids.add(id);
      his.add(id.slice(0, 8));
      los.add(id.slice(8));
    }
    expect(ids.size).toBe(20000);
    expect(his.size).toBeGreaterThan(19990);
    expect(los.size).toBeGreaterThan(19990);
  });
});
