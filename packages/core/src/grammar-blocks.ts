import type { GrammarStyle } from "./pack.js";

/**
 * Structure recovered from a grammar section's flat text.
 *
 * A pack's grammar parser emits one block per line: `clean_text` joins each
 * prose paragraph into a single line, and leaves each paradigm row on its own,
 * with cells held apart by exactly two spaces. What it does *not* keep is the
 * shape — the source indentation is stripped, the column gaps are all collapsed
 * to that same two spaces, and the blank lines between paragraphs are gone. So
 * a reader given the raw text has prose, sub-points and declension tables all
 * looking identical.
 *
 * This puts the shape back by classifying each line. Both readers share it: the
 * web app renders the blocks as elements, the CLI as padded text lines. Nothing
 * here knows about either — no DOM, no Ink, no widths.
 */

/** One row of a paradigm table. */
export interface Row {
  cells: string[];
  /** `head` labels the columns, `divider` spans them ("PLURAL."). */
  kind: "head" | "body" | "divider";
  /**
   * Columns each cell covers, after the stub. `SINGULAR.  PLURAL.` over a
   * gendered declension names three columns apiece, not one. 1 unless set.
   */
  span?: number;
}

export type Block =
  | { kind: "para"; text: string }
  | { kind: "item"; marker: string; text: string; level: 1 | 2 }
  | { kind: "heading"; text: string }
  | { kind: "table"; rows: Row[]; columns: number };

/** Two or more spaces between two non-spaces: a row of cells, not a sentence. */
const TABLE_ROW = /\S {2}\S/;

/**
 * The book's own typography, compiled from the pack's profile: what a heading
 * line looks like and which words stub a paradigm row. Both are conventions of
 * the source grammar rather than facts about the engine — Greek headings are
 * set in Greek capitals and its rows are stubbed by Greek case names.
 */
interface Typography {
  caps: RegExp;
  capsMax: number;
  label: RegExp;
}

const compiled = new WeakMap<GrammarStyle, Typography>();

function typography(style: GrammarStyle): Typography {
  const hit = compiled.get(style);
  if (hit) return hit;
  const made: Typography = {
    caps: new RegExp(style.headingPattern, style.headingFlags),
    capsMax: style.headingMaxLength,
    // Anchored and case-insensitive here rather than in the profile, so a pack
    // supplies a plain word list and cannot get the anchoring wrong.
    label: new RegExp(
      `^(${style.paradigmLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\.?$`,
      "i",
    ),
  };
  compiled.set(style, made);
  return made;
}

const NUMBERED = /^(\d+)\.\s+(.*)$/;
const LETTERED = /^([a-z])\.\s+(.*)$/;
const ROMAN = /^([IVXL]+)\.\s+(.*)$/;
const PARENTHESISED = /^(\d+\))\s+(.*)$/;
const NOTE = /^(NOTE\.?|Note\.?)\s*(?:—\s*)?(.*)$/;

/*
 * The stub column of a paradigm — case names, numbers, persons — comes from
 * `profile.grammar.paradigmLabels`. Their presence is what tells a short row
 * whether it is missing a cell at the *front* (a column caption, which sits
 * over the forms) or at the back.
 *
 * A pack's list should leave the genders out. `MASC. FEM. NEUT.` heads the
 * columns of a declension; it never stubs a row, and counting it as a stub is
 * what would shunt the caption one column to the left of the forms it names.
 */

/** Split a paradigm row into its cells. */
function cellsOf(line: string): string[] {
  return line.trim().split(/ {2,}/);
}

/**
 * `I.  Pure Consonant-Stems.` — an enumerated point that happens to be typed
 * with two spaces after the numeral, which is otherwise exactly the shape of a
 * two-column paradigm row. A roman numeral never stubs a paradigm, so the pair
 * can be told apart; without this the list is set as a table and its one long
 * cell is held on a single unwrapped line.
 */
function isRomanPoint(cells: string[]): boolean {
  return cells.length === 2 && /^[IVXL]+\.$/.test(cells[0]!);
}

/**
 * Square up a table's ragged rows and decide which are headings.
 *
 * Bennett's captions routinely carry fewer cells than the forms below them: a
 * seven-column demonstrative table (§87) is headed by six words, because the
 * case-label column has no caption. Prepending the missing cell is what puts
 * `MASCULINE. FEMININE. NEUTER.` over the forms rather than one column to their
 * left. Where the guess is wrong the cell still lands in the table, so the row
 * is never less readable than the run-on line it replaces.
 */
function squareUp(rows: Row[], label: RegExp): { rows: Row[]; columns: number } {
  const columns = Math.max(...rows.map((r) => r.cells.length));
  const hasLabelColumn = rows.some(
    (r) => r.kind === "body" && r.cells.length === columns && label.test(r.cells[0]!),
  );

  const squared = rows.map((row): Row => {
    if (row.kind === "divider" || row.cells.length === columns) return row;
    const cells = [...row.cells];
    // A short row is a caption for the form columns — missing its cell at the
    // front, not the back — unless it is a stub row that simply runs out of
    // forms. A row of nothing but labels is always a caption: `SINGULAR.
    // PLURAL. SINGULAR. PLURAL.` names four columns of a five-column table and
    // belongs over the forms, even though it opens with a word that can also
    // stub a row.
    const captions =
      hasLabelColumn && (!label.test(cells[0] ?? "") || cells.every((c) => label.test(c)));
    if (captions) cells.unshift("");

    // Captions that divide the form columns evenly cover a group each: two
    // over six gendered columns is singular and plural, three apiece. Anything
    // that does not divide is left one-to-one, which is where it started.
    const groups = cells.length - 1;
    if (captions && groups > 0 && (columns - 1) % groups === 0 && (columns - 1) / groups > 1) {
      return { cells, kind: "head", span: (columns - 1) / groups };
    }

    while (cells.length < columns) cells.push("");
    return { cells, kind: captions ? "head" : row.kind };
  });

  return { rows: squared, columns };
}

/**
 * Split a section's text into blocks.
 *
 * Order matters: a paradigm row is recognised before anything else, because
 * `1.  ūnus  prīmus` is a table row and `1. The first declension...` is a list
 * item, and only the cell gaps tell them apart.
 */
export function parseBlocks(text: string, style: GrammarStyle): Block[] {
  const { caps, capsMax, label } = typography(style);
  const blocks: Block[] = [];
  let table: Row[] | null = null;
  // A caption is only a divider once forms turn up under it; until then it
  // could equally be a heading standing on its own.
  let pending: string | null = null;

  const closeTable = () => {
    if (pending) {
      blocks.push({ kind: "heading", text: pending });
      pending = null;
    }
    if (!table) return;
    blocks.push({ kind: "table", ...squareUp(table, label) });
    table = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const cells = TABLE_ROW.test(line) ? cellsOf(line) : null;
    if (cells && !isRomanPoint(cells)) {
      if (pending) {
        (table ??= []).push({ cells: [pending], kind: "divider" });
        pending = null;
      }
      (table ??= []).push({ cells, kind: "body" });
      continue;
    }

    if (caps.test(line) && line.length <= capsMax) {
      // Inside a paradigm, "SINGULAR." and "PLURAL." divide the rows; treated
      // as prose they would split one table into two, and two tables size their
      // columns independently — the alignment this exists to fix.
      if (table) table.push({ cells: [line], kind: "divider" });
      else {
        if (pending) blocks.push({ kind: "heading", text: pending });
        pending = line;
      }
      continue;
    }

    closeTable();

    let m: RegExpMatchArray | null;
    if ((m = line.match(NUMBERED))) {
      blocks.push({ kind: "item", marker: `${m[1]}.`, text: m[2]!, level: 1 });
    } else if ((m = line.match(ROMAN))) {
      blocks.push({ kind: "item", marker: `${m[1]}.`, text: m[2]!, level: 1 });
    } else if ((m = line.match(LETTERED))) {
      blocks.push({ kind: "item", marker: `${m[1]}.`, text: m[2]!, level: 2 });
    } else if ((m = line.match(PARENTHESISED))) {
      blocks.push({ kind: "item", marker: m[1]!, text: m[2]!, level: 2 });
    } else if ((m = line.match(NOTE))) {
      blocks.push({ kind: "item", marker: "Note", text: m[2]!, level: 2 });
    } else {
      blocks.push({ kind: "para", text: line });
    }
  }

  closeTable();
  return blocks;
}
