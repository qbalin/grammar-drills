import { describe, expect, it } from "vitest";
import { EtymologyIndex } from "./etymology-index.js";

/**
 * The word sheet's third file, and the one that may not be there at all.
 *
 * Everything here is about the two silences answering alike: a pack that ships
 * no etymology and a word nobody has written one for both come back empty, so
 * no screen has to know which it is looking at.
 */
describe("EtymologyIndex", () => {
  // Sorted by key in code-unit order, as `build-etymology.mjs` writes it. The
  // order matters more than it looks: a bisection over an unsorted file misses
  // entries that are sitting right there.
  const FILE = [
    "amō|verb\tFrom Proto-Italic *amaō.\\nCognate with nothing much.",
    "manus|noun\tFrom Proto-Italic *manus.",
    "rosa|noun\tOf uncertain origin. · Perhaps from Ancient Greek ῥόδον.",
    "sine|prep\t",
  ].join("\n");
  const index = new EtymologyIndex(FILE);

  it("finds a word by lemma and part of speech", () => {
    expect(index.paragraphsFor("manus", "noun")).toEqual([
      "From Proto-Italic *manus.",
    ]);
  });

  it("gives the paragraphs back the way the text had them", () => {
    // The builder escapes the newlines because a line of the file is a record.
    // Reading them back is what keeps the origin and the cognates apart, which
    // is the whole shape of a Wiktionary etymology.
    expect(index.paragraphsFor("amō", "verb")).toEqual([
      "From Proto-Italic *amaō.",
      "Cognate with nothing much.",
    ]);
  });

  it("keeps both origins of a homograph, as the builder joined them", () => {
    // Two entries under one `lemma|pos` is not a defect: Wiktionary files
    // homographs that way and both are true of the word on screen.
    expect(index.paragraphsFor("rosa", "noun")).toEqual([
      "Of uncertain origin. · Perhaps from Ancient Greek ῥόδον.",
    ]);
  });

  it("says nothing about a word it does not hold", () => {
    expect(index.paragraphsFor("rex", "noun")).toEqual([]);
    // The right lemma under the wrong part of speech is a different word.
    expect(index.paragraphsFor("manus", "verb")).toEqual([]);
  });

  it("says nothing for a key whose text is empty, rather than one blank line", () => {
    expect(index.paragraphsFor("sine", "prep")).toEqual([]);
  });

  it("answers a pack that ships no etymology at all the same way", () => {
    // Greek's dictionary came out of Eulexis and carries none. This is why the
    // absence needs no flag: it reads exactly like a word nobody has got to.
    const none = new EtymologyIndex("");
    expect(none.paragraphsFor("manus", "noun")).toEqual([]);
  });
});
