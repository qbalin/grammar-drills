import { describe, expect, it } from "vitest";
import { PackError, parseProfile } from "./pack.js";
import { testProfile } from "./profile.fixture.js";

/**
 * A pack may ship more than one grammar of the same language.
 *
 * The engine does not read them yet — the offline gates do, so that a second
 * book is held to the same standard as the first while it is being built. What
 * is tested here is only that the profile says so unambiguously: a pack with one
 * book must stay exactly as valid as it was, and a pack with two must not be
 * able to describe them in a way that silently merges them.
 */
const raw = () => JSON.parse(JSON.stringify(testProfile)) as Record<string, unknown>;

const second = {
  id: "second",
  label: "Second",
  content: "grammars/second.json",
  manifest: "grammars/second-coverage.json",
  source: { title: "Someone, A Grammar", url: "https://example.invalid", licence: "public domain" },
  idPrefix: "sg",
  refPrefix: "§ ",
  families: [
    { id: "one", label: "One" },
    { id: "two", label: "Two" },
  ],
  fallbackFamily: "two",
  grammarShape: {
    minTopics: 300,
    maxTopics: 600,
    minTextChars: 120,
    maxTextChars: 24000,
    medianTextCharsRange: [400, 4000],
    p90TextCharsMax: 8000,
    maxFamilySharePct: 45,
  },
  coverage: {
    topicsWithTestsPct: 51,
    minTestsPerTopic: 6,
    minQuestionsPerTopic: 16,
  },
};

describe("profile: further grammars", () => {
  it("parses a pack that declares none, and leaves the field absent", () => {
    // The default that cannot be forgotten: saying nothing is one grammar.
    const parsed = parseProfile(raw());
    expect(parsed.grammars).toBeUndefined();
  });

  it("carries a second grammar with its own families and shape", () => {
    const parsed = parseProfile({ ...raw(), grammars: [second] });
    expect(parsed.grammars).toHaveLength(1);
    const [g] = parsed.grammars!;
    expect(g.id).toBe("second");
    expect(g.idPrefix).toBe("sg");
    expect(g.families.map((f) => f.id)).toEqual(["one", "two"]);
    // Not the primary's: a shape gate is calibrated against one book.
    expect(g.grammarShape.maxTopics).toBe(600);
    expect(parsed.grammarShape.maxTopics).toBe(testProfile.grammarShape.maxTopics);
    // The primary is untouched by the presence of a second.
    expect(parsed.families).toEqual(testProfile.families);
  });

  it("refuses a second grammar that shares the primary's id prefix", () => {
    // Sharing one would make two books' section ids collide, and the collision
    // is silent: every id still looks well-formed and names the wrong book.
    const clash = { ...second, idPrefix: testProfile.grammar.idPrefix };
    expect(() => parseProfile({ ...raw(), grammars: [clash] })).toThrow(PackError);
    expect(() => parseProfile({ ...raw(), grammars: [clash] })).toThrow(/idPrefix/);
  });

  it("refuses two further grammars that share a prefix with each other", () => {
    const other = { ...second, id: "third", content: "grammars/third.json" };
    expect(() => parseProfile({ ...raw(), grammars: [second, other] })).toThrow(/idPrefix/);
  });

  it("holds a second grammar's families to the same rules as the primary's", () => {
    const stray = { ...second, fallbackFamily: "not-a-family" };
    expect(() => parseProfile({ ...raw(), grammars: [stray] })).toThrow(/fallbackFamily/);

    const dup = { ...second, families: [{ id: "one", label: "One" }, { id: "one", label: "Uno" }] };
    expect(() => parseProfile({ ...raw(), grammars: [dup] })).toThrow(/duplicate id/);

    const none = { ...second, families: [], fallbackFamily: "one" };
    expect(() => parseProfile({ ...raw(), grammars: [none] })).toThrow(/at least one family/);
  });

  it("names the offending path when a further grammar is malformed", () => {
    const { refPrefix, ...missing } = second;
    expect(() => parseProfile({ ...raw(), grammars: [missing] })).toThrow(
      /profile\.grammars\[0\]\.refPrefix: missing/,
    );
    const unknown = { ...second, colour: "blue" };
    expect(() => parseProfile({ ...raw(), grammars: [unknown] })).toThrow(
      /profile\.grammars\[0\]\.colour: unknown key/,
    );
    const badRange = { ...second, grammarShape: { ...second.grammarShape, medianTextCharsRange: [400] } };
    expect(() => parseProfile({ ...raw(), grammars: [badRange] })).toThrow(
      /profile\.grammars\[0\]\.grammarShape\.medianTextCharsRange/,
    );
  });

  it("still checks the primary's own median range, which now shares the code", () => {
    const broken = raw();
    (broken.grammarShape as Record<string, unknown>).medianTextCharsRange = [400, "wide"];
    expect(() => parseProfile(broken)).toThrow(/profile\.grammarShape\.medianTextCharsRange/);
  });
});
