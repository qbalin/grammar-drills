import { describe, expect, it } from "vitest";
import type { LemmaEntry } from "@latin-tutor/core";
import { LemmaIndex } from "./lemma-index.js";

const entries: LemmaEntry[] = [
  { lemma: "manus", citation: "manus, manūs (f)", gloss: "hand", pos: "noun", rank: 157 },
  { lemma: "mānēs", citation: "mānēs", gloss: "spirits of the dead", pos: "noun", rank: 2170 },
  { lemma: "mānis", citation: "mānis, mānis, māne", gloss: "good", pos: "adj", rank: 4091 },
  { lemma: "rex", citation: "rex, rēgis", gloss: "king", pos: "noun", rank: 88 },
  { lemma: "amō", citation: "amō, amāre", gloss: "to love", pos: "verb", rank: 42 },
];

/** Built the way the real file is: `form\tids`, sorted by code unit. */
function build(forms: Record<string, number[]>): LemmaIndex {
  const lines = Object.entries(forms)
    .map(([form, ids]) => `${form}\t${ids.join(",")}`)
    .sort();
  return new LemmaIndex(entries, lines.join("\n"));
}

const index = build({
  amauerunt: [4],
  amo: [4],
  manibus: [0, 1, 2],
  manus: [0],
  regem: [3],
  rex: [3],
  // A run of adjacent keys sharing a prefix, where an off-by-one in the
  // bisection would land on a neighbour rather than the key itself.
  reg: [3],
  rega: [3],
  regas: [3],
  regem2: [3],
});

describe("LemmaIndex", () => {
  it("resolves an ambiguous form to every candidate, most frequent first", () => {
    const hits = index.lookup("manibus");
    expect(hits.map((h) => h.lemma)).toEqual(["manus", "mānēs", "mānis"]);
  });

  it("normalizes the way the index was written", () => {
    // Macrons stripped, v -> u, j -> i, case folded — the same fold the build
    // applied to the keys, so a student can type what they saw.
    expect(index.lookup("Manibus")).toHaveLength(3);
    expect(index.lookup("amāvērunt")[0]?.lemma).toBe("amō");
    expect(index.lookup("REGEM")[0]?.citation).toBe("rex, rēgis");
  });

  it("finds every key in the index, including the first and last lines", () => {
    for (const form of ["amauerunt", "amo", "manibus", "manus", "reg", "rega", "regas", "regem", "regem2", "rex"]) {
      expect(index.lookup(form), form).not.toHaveLength(0);
    }
  });

  it("reports a miss rather than a neighbour", () => {
    expect(index.lookup("regi")).toEqual([]);
    expect(index.lookup("zzzz")).toEqual([]); // past the last line
    expect(index.lookup("aaaa")).toEqual([]); // before the first
    expect(index.lookup("man")).toEqual([]); // a prefix of a real key
    expect(index.lookup("manibusque")).toEqual([]); // a real key as its prefix
  });

  it("treats blank input as a miss", () => {
    expect(index.lookup("")).toEqual([]);
    expect(index.lookup("   ")).toEqual([]);
  });

  it("finds every key of a larger index", () => {
    // Bisection bugs hide until the blob is deep enough to need many probes.
    const forms: Record<string, number[]> = {};
    for (let i = 0; i < 5000; i++) forms[`form${i}`] = [i % entries.length];
    const big = build(forms);
    for (const form of Object.keys(forms)) {
      expect(big.lookup(form), form).toHaveLength(1);
    }
    expect(big.lookup("form")).toEqual([]);
    expect(big.lookup("form5000")).toEqual([]);
  });

  it("survives a line whose entry ids are missing from the table", () => {
    const broken = new LemmaIndex(entries, "ghost\t99");
    expect(broken.lookup("ghost")).toEqual([]);
  });
});
