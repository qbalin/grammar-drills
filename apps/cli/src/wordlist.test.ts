import { describe, expect, it } from "vitest";
import type { VocabWord } from "@latin-tutor/core";
import { wordListLines } from "./wordlist.js";

const paired = (english: string, citation: string, gloss = ""): VocabWord => ({
  form: "x",
  english,
  entry: { lemma: "x", citation, gloss, pos: "noun" },
  others: [],
  status: "paired",
});

const unpaired = (form: string, citation: string, gloss: string): VocabWord => ({
  form,
  entry: { lemma: form, citation, gloss, pos: "prep" },
  others: [],
  status: "unpaired",
});

const unknown = (form: string): VocabWord => ({
  form,
  others: [],
  status: "unknown",
});

const render = (lines: { english: string; latin: string }[]) =>
  lines.map((l) => `${l.english}${l.latin}`.trimEnd());

describe("wordListLines", () => {
  it("puts the English in a column and the citation beside it", () => {
    const lines = wordListLines(
      [
        paired("daughters", "filia, fīliae"),
        paired("water", "aqua, aquae (f)"),
      ],
      60,
    );
    expect(render(lines)).toEqual([
      "daughters filia, fīliae",
      "water     aqua, aquae (f)",
    ]);
  });

  it("sizes the column to the widest word, not to the widest possible word", () => {
    const lines = wordListLines([paired("led", "dūcō, dūcere")], 60);
    expect(lines[0]?.english).toBe("led ");
  });

  it("gives a word the English never said a dot and the dictionary's own gloss", () => {
    const lines = wordListLines([unpaired("ex", "ex (prep)", "out of, from")], 60);
    expect(render(lines)).toEqual(["· ex (prep)", "  out of, from"]);
    expect(lines.map((l) => l.tone)).toEqual(["citation", "gloss"]);
  });

  it("says so when the dictionary has nothing, rather than leaving the word out", () => {
    const lines = wordListLines([unknown("territī")], 60);
    expect(render(lines)).toEqual(["· territī — not in the dictionary"]);
    expect(lines[0]?.tone).toBe("missing");
  });

  it("hangs a citation too long for the pane under itself", () => {
    const lines = wordListLines(
      [paired("approaching", "appropinquō, appropinquāre, appropinquāvī, appropinquātum")],
      40,
    );
    expect(lines.length).toBeGreaterThan(1);
    // The word is said once; the wrap sits in the Latin column, not the gutter.
    expect(lines[0]?.english.trim()).toBe("approaching");
    expect(lines[1]?.english.trim()).toBe("");
    expect(lines.every((l) => l.tone === "citation")).toBe(true);
  });

  it("has nothing to lay out for a question with no words", () => {
    expect(wordListLines([], 60)).toEqual([]);
  });
});
