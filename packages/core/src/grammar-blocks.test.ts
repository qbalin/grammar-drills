import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testProfile } from "./profile.fixture.js";
import { parseBlocks, plainText, sectionNumbers, type Block } from "./grammar-blocks.js";
import type { GrammarSection } from "./types.js";

/** The style is the pack's; these tests are about the shapes, not the book. */
const parseBlocksStyled = (text: string) => parseBlocks(text, testProfile.grammar);

const book = (path: string): GrammarSection[] =>
  JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"));

const grammar = book("languages/latin/content/grammar.json");

/**
 * Every book either pack ships, not merely the primary of one of them.
 *
 * The round-trip below ran against Bennett alone, and Lane was shipping 283
 * nested runs whose two closing brackets read as one escaped bracket — 40
 * sections with a stray ⟧ in the middle of a sentence, in the app, unnoticed.
 * A book nobody checks is a book that quietly rots.
 */
const books: [string, GrammarSection[]][] = [
  ["Bennett", grammar],
  ["Lane", book("languages/latin/content/grammars/lane.json")],
  ["Smyth", book("languages/ancient-greek/content/grammar.json")],
];

const section = (ref: string) => {
  const s = grammar.find((g) => g.ref === ref);
  if (!s) throw new Error(`no section §${ref}`);
  return s;
};

const tables = (blocks: Block[]) =>
  blocks.filter((b): b is Extract<Block, { kind: "table" }> => b.kind === "table");

describe("parseBlocks", () => {
  it("takes each prose paragraph as one block", () => {
    expect(parseBlocksStyled("The girl loves the rose.\nThe farmer sees her.")).toEqual([
      { kind: "para", text: "The girl loves the rose." },
      { kind: "para", text: "The farmer sees her." },
    ]);
  });

  describe("the numbers the book prints", () => {
    it("gives the section number to the block that opens it", () => {
      expect(parseBlocksStyled("⟦#20⟧\nPure Latin nouns end in -a.\nThey are Feminine."))
        .toEqual([
          { kind: "para", text: "Pure Latin nouns end in -a.", num: "20" },
          { kind: "para", text: "They are Feminine." },
        ]);
    });

    it("carries it onto a paradigm, which has no sentence to lead", () => {
      const blocks = parseBlocksStyled("⟦#22⟧\nNom.  mēnsa\nGen.  mēnsae");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.kind).toBe("table");
      expect(blocks[0]!.num).toBe("22");
    });

    it("ends a paradigm, so two sections' tables are not read as one", () => {
      const blocks = parseBlocksStyled(
        "⟦#20⟧\nNom.  mēnsa\n⟦#21⟧\nNom.  hortus  bellum",
      );
      expect(blocks.map((b) => [b.kind, b.num])).toEqual([
        ["table", "20"],
        ["table", "21"],
      ]);
      expect(tables(blocks)[0]!.columns).toBe(2);
    });

    it("still shows the number of a section that is nothing but one", () => {
      expect(parseBlocksStyled("⟦#42⟧")).toEqual([{ kind: "para", text: "", num: "42" }]);
      expect(parseBlocksStyled("⟦#42⟧\n⟦#43⟧\nHeterogeneous nouns vary.")).toEqual([
        { kind: "para", text: "", num: "42" },
        { kind: "para", text: "Heterogeneous nouns vary.", num: "43" },
      ]);
    });

    it("keeps the numbers out of the plain text, newline and all", () => {
      expect(plainText("⟦#20⟧\nPure Latin nouns end in -a.")).toBe(
        "Pure Latin nouns end in -a.",
      );
      expect(sectionNumbers("⟦#20⟧\nx\n⟦#21A⟧\ny")).toEqual(["20", "21A"]);
    });
  });

  describe("the references the book linked", () => {
    it("carries the section a run points at", () => {
      expect(parseBlocksStyled("See ⟦r3:§ 3⟧, 3.")).toEqual([
        {
          kind: "para",
          text: "See § 3, 3.",
          runs: [{ text: "See " }, { text: "§ 3", ref: "3" }, { text: ", 3." }],
        },
      ]);
    });

    it("keeps the emphasis the book set inside one", () => {
      expect(parseBlocksStyled("see ⟦r103:103, ⟦b:a⟧⟧.")).toEqual([
        {
          kind: "para",
          text: "see 103, a.",
          runs: [
            { text: "see " },
            { text: "103, ", ref: "103" },
            { text: "a", b: true, ref: "103" },
            { text: "." },
          ],
        },
      ]);
    });

    it("does not run two references together", () => {
      const [block] = parseBlocksStyled("⟦r275:275⟧⟦r277:277⟧");
      expect(block!.runs).toEqual([
        { text: "275", ref: "275" },
        { text: "277", ref: "277" },
      ]);
    });

    it("reaches inside a paradigm cell, where the book cites too", () => {
      const [table] = tables(parseBlocksStyled("Gen.  meī  (see ⟦r87:§ 87⟧.)"));
      expect(table!.rows[0]!.runs![2]).toEqual([
        { text: "(see " },
        { text: "§ 87", ref: "87" },
        { text: ".)" },
      ]);
    });

    it("is nothing but its words in the plain text", () => {
      expect(plainText("See ⟦r3:§ 3⟧, 3.")).toBe("See § 3, 3.");
    });
  });

  it("separates a list marker from what it introduces", () => {
    expect(parseBlocksStyled("1. Quis, who?")).toEqual([
      { kind: "item", marker: "1.", text: "Quis, who?", level: 1 },
    ]);
    expect(parseBlocksStyled("a. An old Ablative quī occurs.")).toEqual([
      { kind: "item", marker: "a.", text: "An old Ablative quī occurs.", level: 2 },
    ]);
    expect(parseBlocksStyled("2) Both forms occur.")).toEqual([
      { kind: "item", marker: "2)", text: "Both forms occur.", level: 2 },
    ]);
  });

  it("enumerates with roman numerals as well as arabic", () => {
    expect(parseBlocksStyled("III. Consonant-Stems.")).toEqual([
      { kind: "item", marker: "III.", text: "Consonant-Stems.", level: 1 },
    ]);
  });

  // The book types these with two spaces after the numeral, which is exactly
  // the shape of a two-column paradigm row.
  it("does not mistake a wide-set roman point for a paradigm row", () => {
    expect(parseBlocksStyled("I.  Pure Consonant-Stems.")).toEqual([
      { kind: "item", marker: "I.", text: "Pure Consonant-Stems.", level: 1 },
    ]);
  });

  it("reads a note as a sub-point, not as prose", () => {
    expect(parseBlocksStyled("NOTE.—The Plural is rare.")).toEqual([
      { kind: "item", marker: "Note", text: "The Plural is rare.", level: 2 },
    ]);
  });

  // A row of cells and a numbered list item both open with "1."; only the gaps
  // between the cells tell them apart, so the table test has to come first.
  it("reads a numbered paradigm row as a table, not as a list", () => {
    const blocks = parseBlocksStyled("1.  ūnus  prīmus\n2.  duo  secundus");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("table");
  });

  it("splits a paradigm row on the gaps that hold its columns apart", () => {
    const [table] = tables(parseBlocksStyled("Nom.  puella  puellae\nGen.  puellae  puellārum"));
    expect(table!.columns).toBe(3);
    expect(table!.rows.map((r) => r.cells)).toEqual([
      ["Nom.", "puella", "puellae"],
      ["Gen.", "puellae", "puellārum"],
    ]);
  });

  it("puts a short caption over the forms, not over the case labels", () => {
    // Six words heading a seven-column table: the stub column has no caption.
    const [table] = tables(
      parseBlocksStyled(
        [
          "MASCULINE.  FEMININE.  NEUTER.  MASCULINE.  FEMININE.  NEUTER.",
          "Nom.  hīc  haec  hōc  hī  hae  haec",
        ].join("\n"),
      ),
    );
    expect(table!.columns).toBe(7);
    expect(table!.rows[0]).toEqual({
      cells: ["", "MASCULINE.", "FEMININE.", "NEUTER.", "MASCULINE.", "FEMININE.", "NEUTER."],
      kind: "head",
    });
  });

  it("puts a row of nothing but labels over the forms it names", () => {
    // Four captions over a five-column table. Read as a stub row it would sit
    // one column left, and every ending would be filed under the wrong number.
    const [table] = tables(
      parseBlocksStyled(
        [
          "SINGULAR.  PLURAL.  SINGULAR.  PLURAL.",
          "Nom.  lapis  lapidēs  mīles  mīlitēs",
        ].join("\n"),
      ),
    );
    expect(table!.rows[0]).toEqual({
      cells: ["", "SINGULAR.", "PLURAL.", "SINGULAR.", "PLURAL."],
      kind: "head",
    });
  });

  it("spreads a caption across the group of columns it names", () => {
    // Two captions over six gendered columns: three apiece. Left one-to-one,
    // "PLURAL." would sit over the feminine singular and mislabel it.
    const [table] = tables(
      parseBlocksStyled(
        [
          "SINGULAR  PLURAL.",
          "MASCULINE.  FEMININE.  NEUTER.  MASCULINE.  FEMININE.  NEUTER.",
          "Nom.  hīc  haec  hōc  hī  hae  haec",
        ].join("\n"),
      ),
    );
    expect(table!.rows[0]).toEqual({
      cells: ["", "SINGULAR", "PLURAL."],
      kind: "head",
      span: 3,
    });
    // The genders below already cover one column each, so they are untouched.
    expect(table!.rows[1]!.span).toBeUndefined();
  });

  it("still reads a stub row that has run out of forms as a stub row", () => {
    const [table] = tables(
      parseBlocksStyled(["Sing.  amō  amās  amat", "Plur.  amāmus"].join("\n")),
    );
    expect(table!.rows[1]!.cells).toEqual(["Plur.", "amāmus", "", ""]);
  });

  it("keeps a caption that opens a paradigm inside it", () => {
    const [table] = tables(parseBlocksStyled("SINGULAR.\nNom.  puella\nGen.  puellae"));
    expect(table!.rows[0]).toEqual({ cells: ["SINGULAR."], kind: "divider" });
  });

  it("keeps SINGULAR/PLURAL inside the table they divide", () => {
    // Split into two tables, each would size its columns alone and the endings
    // would stop lining up down the page — the whole point of the table.
    const [table] = tables(
      parseBlocksStyled(
        [
          "Nom.  tussis  īgnis",
          "PLURAL.",
          "Nom.  tussēs  īgnēs",
        ].join("\n"),
      ),
    );
    expect(table!.rows.map((r) => r.kind)).toEqual(["body", "divider", "body"]);
    expect(table!.rows[1]!.cells).toEqual(["PLURAL."]);
  });

  it("takes a standalone capitalised label with no paradigm under it as a heading", () => {
    expect(
      parseBlocksStyled("RELATION OF ADVERBS AND PREPOSITIONS.\nThese regularly end in -is."),
    ).toEqual([
      { kind: "heading", text: "RELATION OF ADVERBS AND PREPOSITIONS." },
      { kind: "para", text: "These regularly end in -is." },
    ]);
  });

  it("does not mistake a shouted sentence for a label", () => {
    const shout = "THIS IS A LONG RUN OF CAPITALS THAT IS REALLY A SENTENCE.";
    expect(parseBlocksStyled(shout)).toEqual([{ kind: "para", text: shout }]);
  });

  it("keeps a caption with no forms under it as a heading", () => {
    expect(parseBlocksStyled("SINGULAR.")).toEqual([{ kind: "heading", text: "SINGULAR." }]);
  });

  describe("inline emphasis", () => {
    it("classifies a line by its words, not by the markup around them", () => {
      // `⟦b:1.⟧ The first…` is a numbered point. Reading the sigils as text
      // would make it a paragraph, and the marker would land in the margin.
      expect(parseBlocksStyled("⟦b:1.⟧ The ⟦i:first⟧ declension.")).toEqual([
        {
          kind: "item",
          marker: "1.",
          text: "The first declension.",
          runs: [{ text: "The " }, { text: "first", i: true }, { text: " declension." }],
          level: 1,
        },
      ]);
    });

    it("keeps a bolded caption a divider of the table it heads", () => {
      const [table] = tables(parseBlocksStyled("⟦b:SINGULAR.⟧\nNom.  puella\nGen.  puellae"));
      expect(table!.rows[0]).toEqual({
        cells: ["SINGULAR."],
        runs: [[{ text: "SINGULAR.", b: true }]],
        kind: "divider",
      });
    });

    it("takes a row the source set across every column as a divider", () => {
      // `Hīc, this.` heads a paradigm exactly as `PLURAL.` does, but nothing
      // about the words says so — only the source's own full-width row does.
      const [table] = tables(parseBlocksStyled("⟦=⟧Hīc, this.\nNom.  hīc  haec"));
      expect(table!.rows.map((r) => r.kind)).toEqual(["divider", "body"]);
      expect(table!.rows[0]!.cells).toEqual(["Hīc, this."]);
    });

    it("gives each cell of a row the emphasis that sat in it", () => {
      const [table] = tables(parseBlocksStyled("am⟦b:ō⟧, ⟦i:I love⟧  am⟦b:āmus⟧"));
      expect(table!.rows[0]).toEqual({
        cells: ["amō, I love", "amāmus"],
        runs: [
          [{ text: "am" }, { text: "ō", b: true }, { text: ", " }, { text: "I love", i: true }],
          [{ text: "am" }, { text: "āmus", b: true }],
        ],
        kind: "body",
      });
    });

    it("carries a literal bracket through doubled", () => {
      expect(plainText("⟦⟦not markup⟧⟧")).toBe("⟦not markup⟧");
      expect(parseBlocksStyled("⟦i:a⟧ ⟦⟦b⟧⟧")).toEqual([
        { kind: "para", text: "a ⟦b⟧", runs: [{ text: "a", i: true }, { text: " ⟦b⟧" }] },
      ]);
    });

    it("leaves a pack whose source carries no emphasis untouched", () => {
      expect(parseBlocksStyled("Nom.  puella")).toEqual([
        { kind: "table", columns: 2, rows: [{ cells: ["Nom.", "puella"], kind: "body" }] },
      ]);
    });
  });

  describe("against the shipped grammar", () => {
    it("leaves no markup in the plain text of any section of any book", () => {
      for (const [name, sections] of books) {
        for (const s of sections) {
          expect(plainText(s.text), `${name} §${s.ref}`).not.toMatch(/⟦|⟧/);
        }
      }
    });

    it("loses no text from any section", () => {
      // Nothing may be dropped on the way into a block: the reader is shown
      // blocks and nothing else, so a character lost here is lost for good.
      // The one deliberate rewrite is the note marker, "NOTE.—" -> "Note".
      const strip = (t: string) =>
        t.replace(/NOTE\.?\s*(?:—\s*)?/g, "Note").replace(/\s+/g, "");
      for (const s of grammar) {
        const seen = parseBlocksStyled(s.text)
          .flatMap((b) =>
            b.kind === "table"
              ? b.rows.flatMap((r) => r.cells)
              : b.kind === "item"
                ? [b.marker, b.text]
                : [b.text],
          )
          .join(" ");
        // Against the *plain* extract: a block carries its emphasis in `runs`,
        // so the markup around a word is not part of the word.
        expect(strip(seen), `§${s.ref}`).toBe(strip(plainText(s.text)));
      }
    });

    it("gives every table rows that cover exactly its columns", () => {
      for (const s of grammar) {
        for (const t of tables(parseBlocksStyled(s.text))) {
          for (const row of t.rows) {
            if (row.kind === "divider") {
              expect(row.cells).toHaveLength(1);
              continue;
            }
            // The stub column always covers one; the rest cover `span` each.
            const covered = 1 + (row.cells.length - 1) * (row.span ?? 1);
            expect(covered, `§${s.ref}`).toBe(t.columns);
          }
        }
      }
    });

    it("reads the demonstrative paradigm as one seven-column table", () => {
      const hic = tables(parseBlocksStyled(section("87").text))[0]!;
      expect(hic.columns).toBe(7);
      expect(hic.rows.find((r) => r.cells[0] === "Nom.")!.cells).toEqual([
        "Nom.", "hīc", "haec", "hōc", "hī", "hae", "haec",
      ]);
    });

    it("holds an i-stem paradigm together across its SINGULAR/PLURAL divider", () => {
      const blocks = parseBlocksStyled(section("28-47").text);
      const tussis = tables(blocks).find((t) =>
        t.rows.some((r) => r.cells.includes("tussis")),
      )!;
      expect(tussis.rows.some((r) => r.cells.includes("tussium"))).toBe(true);
      expect(tussis.rows.filter((r) => r.kind === "divider").length).toBeGreaterThan(0);
    });

    it("finds prose, lists and tables in the section on interrogatives", () => {
      const kinds = new Set(parseBlocksStyled(section("90").text).map((b) => b.kind));
      expect(kinds).toEqual(new Set(["para", "item", "table"]));
    });
  });
});
