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

/**
 * A stretch of text set one way.
 *
 * The grammars mean something by their type: Bennett bolds the *ending* inside
 * each form — `am`**`ō`** — and italicises the English gloss, so a paradigm
 * read without them is a list of words with nothing marking which part is the
 * lesson. Where a pack's source keeps that, it survives to here.
 */
export interface Run {
  text: string;
  b?: true;
  i?: true;
}

/** One row of a paradigm table. */
export interface Row {
  cells: string[];
  /** The same cells with their emphasis, when the pack's source carried any. */
  runs?: Run[][];
  /** `head` labels the columns, `divider` spans them ("PLURAL."). */
  kind: "head" | "body" | "divider";
  /**
   * Columns each cell covers, after the stub. `SINGULAR.  PLURAL.` over a
   * gendered declension names three columns apiece, not one. 1 unless set.
   */
  span?: number;
}

export type Block =
  | { kind: "para"; text: string; runs?: Run[] }
  | { kind: "item"; marker: string; text: string; runs?: Run[]; level: 1 | 2 }
  | { kind: "heading"; text: string; runs?: Run[] }
  | { kind: "table"; rows: Row[]; columns: number };

/** Two or more spaces between two non-spaces: a row of cells, not a sentence. */
const TABLE_ROW = /\S {2}\S/;

/*
 * Emphasis rides in the flat text as `⟦k:…⟧`, k in {b, i}.
 *
 * The extract has one job the markup must not get in the way of: two spaces
 * mean a new column, and nothing else does. So the delimiters contain no space
 * and cannot invent one. They are also asymmetric, which lets a run nest inside
 * another without an ambiguity rule, and they occur in no source the packs
 * draw on — a literal bracket that ever did would be doubled by the parser and
 * halved here.
 *
 * Everything below classifies lines by their *plain* text. A line that opens
 * `⟦b:1.⟧ The first declension` is a numbered point, and would stop looking
 * like one the moment the classifier saw the markup.
 */
const OPEN = "⟦";
const CLOSE = "⟧";
/** A row the book set across every column: a mood, a tense, a caption. */
const FULL_WIDTH = `${OPEN}=${CLOSE}`;
/**
 * Where one table ends and the next begins.
 *
 * Two tables that touch in the source — §101 sets the principal parts of `amō`
 * immediately above its conjugation — have nothing between them for the
 * classifier to notice, so without this they run together and are sized to the
 * wider of the two: four columns of principal parts pulling a two-column
 * paradigm out to arm's length. A pack that emits none loses nothing.
 */
const TABLE_END = `${OPEN}/${CLOSE}`;
/**
 * A cell with nothing in it.
 *
 * Two adjacent separators would read as one wide gap, so a row that skips a
 * column has to say so. Without it, `arceō  arcēre  arcuī  ⟦.⟧  keep off` loses
 * its empty participle column and the gloss slides under the participles of
 * every verb above it.
 */
const EMPTY_CELL = `${OPEN}.${CLOSE}`;

interface Decoded {
  plain: string;
  /** Undefined when the line carried no emphasis, which is most of them. */
  runs?: Run[];
}

function decode(line: string): Decoded {
  if (!line.includes(OPEN) && !line.includes(CLOSE)) return { plain: line };
  const runs: Run[] = [];
  const open: string[] = [];
  let plain = "";
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const run: Run = { text: buf };
    if (open.includes("b")) run.b = true;
    if (open.includes("i")) run.i = true;
    runs.push(run);
    plain += buf;
    buf = "";
  };
  for (let i = 0; i < line.length; ) {
    const c = line[i]!;
    if (c === OPEN && line[i + 1] === OPEN) {
      buf += OPEN;
      i += 2;
    } else if (line.startsWith(EMPTY_CELL, i)) {
      i += EMPTY_CELL.length;
    } else if (c === OPEN && line[i + 2] === ":" && (line[i + 1] === "b" || line[i + 1] === "i")) {
      flush();
      open.push(line[i + 1]!);
      i += 3;
    } else if (c === CLOSE && line[i + 1] === CLOSE) {
      buf += CLOSE;
      i += 2;
    } else if (c === CLOSE && open.length > 0) {
      flush();
      open.pop();
      i += 1;
    } else {
      buf += c;
      i += 1;
    }
  }
  flush();
  const styled = runs.some((r) => r.b || r.i);
  return { plain, runs: styled ? merge(runs) : undefined };
}

/** `<i>of the</i> <i>city</i>` is one italic run, not three. */
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && !!last.b === !!run.b && !!last.i === !!run.i) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

/** The runs covering `plain.slice(from, to)`, or undefined if there are none. */
function sliceRuns(runs: Run[] | undefined, from: number, to: number): Run[] | undefined {
  if (!runs) return undefined;
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const start = Math.max(from, at);
    const end = Math.min(to, at + run.text.length);
    if (end > start) out.push({ ...run, text: run.text.slice(start - at, end - at) });
    at += run.text.length;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * The extract with its emphasis dropped.
 *
 * Anything that measures a section — how long it is, how many tests it should
 * carry, what to put in a prompt — has to measure the words, not the markup
 * around them.
 */
export function plainText(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim() !== TABLE_END)
    .map((line) => {
      const body = line.startsWith(FULL_WIDTH) ? line.slice(FULL_WIDTH.length) : line;
      // Cell by cell, so a skipped column leaves its gap where it was.
      return body.split(/ {2,}/).map((cell) => decode(cell).plain).join("  ");
    })
    .join("\n");
}

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

/**
 * Split a paradigm row into its cells.
 *
 * On the line as written, before its emphasis is decoded: the markup holds no
 * spaces of its own and a cell never holds two, so the column gaps are exactly
 * where they look, and each cell can then be decoded on its own.
 */
function cellsOf(line: string): Decoded[] {
  return line.trim().split(/ {2,}/).map(decode);
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
  // Most of the full-width rows, not merely one of them. §101 sets the whole of
  // `amō` as one table: two columns of finite forms, then the infinitives and
  // participles side by side in four, and those last rows do open with `Acc.`
  // and `Abl.` Read as proof of a stub column, they would turn every finite
  // form above them into a caption for columns that are not there.
  const wide = rows.filter((r) => r.kind === "body" && r.cells.length === columns);
  const stubs = wide.filter((r) => label.test(r.cells[0]!)).length;
  const hasLabelColumn = stubs * 2 > wide.length;

  const squared = rows.map((row): Row => {
    if (row.kind === "divider") return row;
    if (row.cells.length === columns) {
      // `SINGULAR.  PLURAL.` over a two-column paradigm names its columns even
      // though it is as wide as the forms below it. Nothing but labels, and
      // nothing under a label is a label, so it can only be a caption.
      const allLabels = row.cells.every((c) => label.test(c));
      return allLabels && !hasLabelColumn ? { ...row, kind: "head" } : row;
    }
    const cells = [...row.cells];
    // Emphasis moves with the cell it belongs to, whichever way the row is
    // squared up; a cell invented here has none.
    const runs = row.runs ? [...row.runs] : undefined;
    // A short row is a caption for the form columns — missing its cell at the
    // front, not the back — unless it is a stub row that simply runs out of
    // forms. A row of nothing but labels is always a caption: `SINGULAR.
    // PLURAL. SINGULAR. PLURAL.` names four columns of a five-column table and
    // belongs over the forms, even though it opens with a word that can also
    // stub a row.
    const captions =
      hasLabelColumn && (!label.test(cells[0] ?? "") || cells.every((c) => label.test(c)));
    if (captions) {
      cells.unshift("");
      runs?.unshift([]);
    }

    // Captions that divide the form columns evenly cover a group each: two
    // over six gendered columns is singular and plural, three apiece. Anything
    // that does not divide is left one-to-one, which is where it started.
    const groups = cells.length - 1;
    if (captions && groups > 0 && (columns - 1) % groups === 0 && (columns - 1) / groups > 1) {
      return { cells, runs, kind: "head", span: (columns - 1) / groups };
    }

    while (cells.length < columns) {
      cells.push("");
      runs?.push([]);
    }
    return { cells, runs, kind: captions ? "head" : row.kind };
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
  let pending: Decoded | null = null;

  const divider = (d: Decoded): Row => ({
    cells: [d.plain],
    runs: d.runs && [d.runs],
    kind: "divider",
  });

  const closeTable = () => {
    if (pending) {
      blocks.push({ kind: "heading", text: pending.plain, runs: pending.runs });
      pending = null;
    }
    if (!table) return;
    blocks.push({ kind: "table", ...squareUp(table, label) });
    table = null;
  };

  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed === TABLE_END) {
      closeTable();
      continue;
    }
    // A row the source set across the whole table says so outright, rather
    // than being recognised by its capitals: `Hīc, this.` heads a paradigm
    // just as `PLURAL.` does, and read as prose it would split the table in
    // two — and two tables size their columns independently.
    const full = trimmed.startsWith(FULL_WIDTH);
    const line = full ? trimmed.slice(FULL_WIDTH.length).trim() : trimmed;
    if (!line) continue;

    if (!full) {
      const cells = TABLE_ROW.test(line) ? cellsOf(line) : null;
      if (cells && !isRomanPoint(cells.map((c) => c.plain))) {
        if (pending) {
          (table ??= []).push(divider(pending));
          pending = null;
        }
        (table ??= []).push({
          cells: cells.map((c) => c.plain),
          runs: cells.some((c) => c.runs)
            ? cells.map((c) => c.runs ?? [{ text: c.plain }])
            : undefined,
          kind: "body",
        });
        continue;
      }
    }

    const { plain, runs } = decode(line);

    if (full || (caps.test(plain) && plain.length <= capsMax)) {
      // Inside a paradigm, "SINGULAR." and "PLURAL." divide the rows; treated
      // as prose they would split one table into two.
      if (table) table.push(divider({ plain, runs }));
      else {
        if (pending) blocks.push({ kind: "heading", text: pending.plain, runs: pending.runs });
        pending = { plain, runs };
      }
      continue;
    }

    closeTable();

    /** An item's marker is not part of its text, so nor is the marker's type. */
    const item = (marker: string, body: string, level: 1 | 2): Block => ({
      kind: "item",
      marker,
      text: body,
      runs: sliceRuns(runs, plain.length - body.length, plain.length),
      level,
    });

    let m: RegExpMatchArray | null;
    if ((m = plain.match(NUMBERED))) {
      blocks.push(item(`${m[1]}.`, m[2]!, 1));
    } else if ((m = plain.match(ROMAN))) {
      blocks.push(item(`${m[1]}.`, m[2]!, 1));
    } else if ((m = plain.match(LETTERED))) {
      blocks.push(item(`${m[1]}.`, m[2]!, 2));
    } else if ((m = plain.match(PARENTHESISED))) {
      blocks.push(item(m[1]!, m[2]!, 2));
    } else if ((m = plain.match(NOTE))) {
      blocks.push(item("Note", m[2]!, 2));
    } else {
      blocks.push({ kind: "para", text: plain, runs });
    }
  }

  closeTable();
  return blocks;
}
