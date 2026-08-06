import { describe, it, expect } from "vitest";
import { ParadigmIndex } from "./paradigm-index.js";

/**
 * The file `scripts/build-paradigms.mjs` writes: a header of interned tag
 * signatures, then one sorted line per `lemma|pos`, tab-separated because a
 * form may be two words.
 */
const FILE = [
  "nominative,singular|genitive,singular|nominative,plural|canonical",
  "amo|verb\t0:amō",
  "post scriptum|noun\t0:post scriptum",
  "puella|noun\t0:puella\t1:puellae\t2:puellae",
  "rex|noun\t0:rēx\t1:rēgis",
].join("\n");

describe("reading one word's forms out of the paradigm file", () => {
  const index = new ParadigmIndex(FILE);

  it("finds a word and gives back its forms, tagged", () => {
    expect(index.formsFor("puella", "noun")).toEqual([
      { form: "puella", tags: ["nominative", "singular"] },
      { form: "puellae", tags: ["genitive", "singular"] },
      { form: "puellae", tags: ["nominative", "plural"] },
    ]);
  });

  it("finds the first and last words, which the bisection can walk past", () => {
    expect(index.formsFor("amo", "verb")).toHaveLength(1);
    expect(index.formsFor("rex", "noun")).toHaveLength(2);
  });

  // The reason the separator is a tab: 66,000 of the reference's forms are two
  // words, and a space would take them apart.
  it("keeps a form that is two words in one piece", () => {
    expect(index.formsFor("post scriptum", "noun")).toEqual([
      { form: "post scriptum", tags: ["nominative", "singular"] },
    ]);
  });

  it("tells a word it has not got from one it has", () => {
    expect(index.formsFor("puell", "noun")).toEqual([]);
    expect(index.formsFor("puellae", "noun")).toEqual([]);
    expect(index.formsFor("puella", "verb")).toEqual([]);
    expect(index.formsFor("zzz", "noun")).toEqual([]);
  });

  // The header is inside the string being bisected, so a probe can land on it.
  // It is never a key, and must never be read as one.
  it("never returns the signature header as a word", () => {
    expect(index.formsFor("nominative,singular|genitive,singular", "")).toEqual([]);
  });

  it("skips a form whose signature the header has not got", () => {
    const short = new ParadigmIndex(["nominative", "rex|noun\t0:rēx\t9:rēgis"].join("\n"));
    expect(short.formsFor("rex", "noun")).toEqual([
      { form: "rēx", tags: ["nominative"] },
    ]);
  });

  it("survives a file with a header and nothing else", () => {
    expect(new ParadigmIndex("nominative").formsFor("rex", "noun")).toEqual([]);
    expect(new ParadigmIndex("").formsFor("rex", "noun")).toEqual([]);
  });
});
