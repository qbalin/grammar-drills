/**
 * Laying tagged forms out in a grid.
 *
 * The tag vocabulary in here is a real one — it is what the reference actually
 * writes — but nothing in `paradigm.ts` knows it, and these fixtures are the
 * pack's side of the contract standing in for a pack.
 */
import { describe, it, expect } from "vitest";
import { buildParadigm, type ParadigmBlock, type TaggedForm } from "./paradigm.js";

const CASES: ParadigmBlock = {
  rows: [
    { tags: ["nominative"], label: "Nom." },
    { tags: ["genitive"], label: "Gen." },
    { tags: ["dative"], label: "Dat." },
    { tags: ["locative"], label: "Loc." },
  ],
  columns: [
    { tags: ["singular"], label: "Sing." },
    { tags: ["plural"], label: "Plur." },
  ],
};

const form = (text: string, ...tags: string[]): TaggedForm => ({ form: text, tags });

describe("laying a word's forms out", () => {
  it("puts each form where its tags say", () => {
    const { tables } = buildParadigm(
      [
        form("puella", "nominative", "singular"),
        form("puellae", "genitive", "singular"),
        form("puellae", "nominative", "plural"),
      ],
      [CASES],
    );
    expect(tables).toHaveLength(1);
    expect(tables[0]!.columns).toEqual(["Sing.", "Plur."]);
    expect(tables[0]!.rows).toEqual([
      { label: "Nom.", cells: [["puella"], ["puellae"]] },
      { label: "Gen.", cells: [["puellae"], []] },
    ]);
  });

  // Most Latin nouns have no locative and most Greek words are never written
  // in the dual; an empty line reads as a gap in the word, not the language.
  it("drops a row and a column nothing landed in", () => {
    const { tables } = buildParadigm([form("domī", "locative", "singular")], [CASES]);
    expect(tables[0]!.rows).toEqual([{ label: "Loc.", cells: [["domī"]] }]);
    expect(tables[0]!.columns).toEqual(["Sing."]);
  });

  // One dative plural serving three genders is three equally good claims, and
  // a grammar book prints it under all three.
  it("prints a form once per cell when the cell tags tie", () => {
    const genders: ParadigmBlock = {
      rows: [{ tags: ["dative"], label: "Dat." }],
      columns: [
        { tags: ["masculine", "plural"], label: "M. plur." },
        { tags: ["feminine", "plural"], label: "F. plur." },
        { tags: ["neuter", "plural"], label: "N. plur." },
      ],
    };
    const { tables, other } = buildParadigm(
      [form("bonīs", "dative", "feminine", "masculine", "neuter", "plural")],
      [genders],
    );
    expect(tables[0]!.rows[0]!.cells).toEqual([["bonīs"], ["bonīs"], ["bonīs"]]);
    expect(other).toEqual([]);
  });

  // The failure this rule exists to prevent: `{active, future, indicative,
  // perfect, …}` carries every tag the perfect cell asks for, so a plain subset
  // test would file the future perfect under the perfect and leave its own row
  // empty.
  it("gives a form to the most specific cell that claims it", () => {
    const tenses: ParadigmBlock = {
      rows: [
        { tags: ["perfect", "indicative"], label: "Perfect" },
        { tags: ["future", "perfect", "indicative"], label: "Future perfect" },
      ],
      columns: [{ tags: ["third-person", "singular"], label: "3 sing." }],
    };
    const { tables } = buildParadigm(
      [
        form("amāvit", "perfect", "indicative", "third-person", "singular"),
        form("amāverit", "future", "perfect", "indicative", "third-person", "singular"),
      ],
      [tenses],
    );
    expect(tables[0]!.rows).toEqual([
      { label: "Perfect", cells: [["amāvit"]] },
      { label: "Future perfect", cells: [["amāverit"]] },
    ]);
  });

  it("keeps two spellings of one cell side by side", () => {
    const { tables } = buildParadigm(
      [
        form("amāvistī", "perfect", "singular"),
        form("amāstī", "perfect", "singular", "syncopated"),
      ],
      [
        {
          rows: [{ tags: ["perfect"], label: "Perfect" }],
          columns: [{ tags: ["singular"], label: "Sing." }],
        },
      ],
    );
    expect(tables[0]!.rows[0]!.cells[0]).toEqual(["amāvistī", "amāstī"]);
  });

  it("does not print the same spelling twice in one cell", () => {
    const { tables } = buildParadigm(
      [form("rēgēs", "nominative", "plural"), form("rēgēs", "nominative", "plural")],
      [CASES],
    );
    expect(tables[0]!.columns).toEqual(["Plur."]);
    expect(tables[0]!.rows).toEqual([{ label: "Nom.", cells: [["rēgēs"]] }]);
  });

  /**
   * Greek writes one cell several ways and marks all but one as some dialect,
   * so a genitive singular that should read `βασιλέως` offers five spellings.
   * The standard one is often marked too — it is simply marked once where its
   * rivals are marked twice — which is why this counts rather than excludes.
   */
  it("keeps a cell's least-marked spellings and drops the rest", () => {
    const cell = [
      { tags: ["genitive"], label: "Gen." },
    ];
    const columns = [{ tags: ["singular"], label: "Sing." }];
    const { tables } = buildParadigm(
      [
        form("βασιλέος", "genitive", "singular", "epic", "ionic"),
        form("βασιλέως", "genitive", "singular", "ionic"),
        form("βασιλῆος", "genitive", "singular", "epic", "ionic"),
      ],
      [{ rows: cell, columns }],
      { secondary: ["aeolic", "doric", "epic", "ionic"] },
    );
    expect(tables[0]!.rows[0]!.cells[0]).toEqual(["βασιλέως"]);
  });

  // Two marks apiece, and the tie is broken by the one that is Attic — which
  // is what this pack teaches and the other is not.
  it("prefers the variety being taught when the marks are level", () => {
    const { tables } = buildParadigm(
      [
        form("τᾶς", "genitive", "singular", "aeolic", "doric"),
        form("τῆς", "genitive", "singular", "attic", "epic", "ionic"),
      ],
      [{ rows: [{ tags: ["genitive"], label: "Gen." }], columns: [{ tags: ["singular"], label: "Sing." }] }],
      { primary: ["attic"], secondary: ["aeolic", "doric", "epic", "ionic"] },
    );
    expect(tables[0]!.rows[0]!.cells[0]).toEqual(["τῆς"]);
  });

  it("keeps every spelling when the pack marks no tag as secondary", () => {
    const { tables } = buildParadigm(
      [
        form("amāvistī", "genitive", "singular"),
        form("amāstī", "genitive", "singular", "syncopated"),
      ],
      [CASES],
    );
    expect(tables[0]!.rows[0]!.cells[0]).toEqual(["amāvistī", "amāstī"]);
  });

  it("hands back what fit no cell rather than dropping it", () => {
    const { tables, other } = buildParadigm(
      [
        form("puella", "nominative", "singular"),
        form("melior", "comparative"),
        form("bene", "adverb"),
      ],
      [CASES],
    );
    expect(tables[0]!.rows).toHaveLength(1);
    expect(other.map((f) => f.form)).toEqual(["melior", "bene"]);
  });

  it("skips a whole table nothing landed in", () => {
    const empty: ParadigmBlock = {
      title: "Imperative",
      rows: [{ tags: ["imperative"], label: "Present" }],
      columns: [{ tags: ["singular"], label: "2 sing." }],
    };
    const { tables } = buildParadigm([form("puella", "nominative", "singular")], [
      { ...CASES, title: "Cases" },
      empty,
    ]);
    expect(tables.map((t) => t.title)).toEqual(["Cases"]);
  });

  it("has nothing to say about a word with no forms, or a pack with no axes", () => {
    expect(buildParadigm([], [CASES])).toEqual({ tables: [], other: [] });
    const loose = [form("nihil", "indeclinable")];
    expect(buildParadigm(loose, [])).toEqual({ tables: [], other: loose });
  });
});
