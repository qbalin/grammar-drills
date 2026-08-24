/**
 * Line handling for the grammar pager.
 *
 * Sections run to hundreds of lines (paradigm tables especially), so the reader
 * scrolls instead of clipping. Scrolling needs to count *screen* lines, not
 * source lines, so the text is laid out here rather than left to Ink.
 *
 * `layoutSection` is the entry point: it gives a section its shape back — lists
 * indented, paradigm columns padded to a common width, blocks separated — and
 * returns the finished screen lines. `wrapLines` underneath it is pure wrapping
 * and knows nothing about structure.
 */
import type { GrammarStyle } from "@lang-tutor/core";
import { parseBlocks, type Block, type Row, type Run } from "@lang-tutor/core";

/**
 * One screen line, in the pieces the grammar set it in.
 *
 * Everything here lays out the *plain* text and carries the emphasis along for
 * the ride: a column is as wide as its widest word, and a word is no wider for
 * being bold. `layoutSection` drops the styling again for callers that only
 * want strings, so the two can never disagree about where a line breaks.
 */
export type RichLine = Run[];

const plainOf = (line: RichLine): string => line.map((r) => r.text).join("");
const spacer = (n: number): Run[] => (n > 0 ? [{ text: " ".repeat(n) }] : []);

/** A cell's emphasis, or the cell itself where the pack's source had none. */
function cellRuns(row: Row, i: number): Run[] {
  const runs = row.runs?.[i];
  return runs && runs.length > 0 ? runs : [{ text: row.cells[i] ?? "" }];
}

function trimEndRuns(line: RichLine): RichLine {
  const out = line.map((r) => ({ ...r }));
  while (out.length > 0) {
    const last = out[out.length - 1]!;
    last.text = last.text.replace(/\s+$/, "");
    if (last.text !== "") break;
    out.pop();
  }
  return out;
}

/**
 * `wrapLines`, but keeping each piece's emphasis.
 *
 * The break points come from `wrapLines` itself rather than from a second
 * implementation of the same rules: every line it returns is a contiguous
 * stretch of the text it was given, so walking them in order is enough to find
 * where each one sat and which runs cover it.
 */
export function wrapRuns(runs: RichLine, width: number): RichLine[] {
  const text = plainOf(runs);
  const out: RichLine[] = [];
  let at = 0;
  for (const piece of wrapLines(text, width)) {
    const from = text.indexOf(piece, at);
    const to = from + piece.length;
    at = to;
    const line: Run[] = [];
    let cursor = 0;
    for (const run of runs) {
      const start = Math.max(from, cursor);
      const end = Math.min(to, cursor + run.text.length);
      if (end > start) line.push({ ...run, text: run.text.slice(start - cursor, end - cursor) });
      cursor += run.text.length;
    }
    out.push(line);
  }
  return out;
}

/** Wrap `text` to `width` columns; the result is one entry per screen line. */
export function wrapLines(text: string, width: number): string[] {
  const w = Math.max(8, Math.floor(width));
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.length <= w) {
      out.push(line);
      continue;
    }
    // Split on single spaces, so any run of spaces already placed by the table
    // layout survives inside a line that does fit.
    let cur = "";
    for (const word of line.split(" ")) {
      const candidate = cur === "" ? word : `${cur} ${word}`;
      if (candidate.length <= w) {
        cur = candidate;
        continue;
      }
      if (cur !== "") {
        out.push(cur.trimEnd());
        cur = "";
      }
      let rest = word;
      while (rest.length > w) {
        out.push(rest.slice(0, w));
        rest = rest.slice(w);
      }
      cur = rest;
    }
    out.push(cur.trimEnd());
  }
  return out;
}

/** Indent, in columns, for a list item of each level. */
const INDENT = { 1: 2, 2: 5 } as const;
/** Gap between paradigm columns — the same two spaces the extract used. */
const GAP = "  ";

/**
 * Lay a paradigm out as columns of equal width.
 *
 * Returns null when the padded table would not fit `width`. A terminal cannot
 * scroll sideways, so there is nowhere for the overflow to go, and padding it
 * anyway would push the last column off the screen entirely — worse than the
 * unaligned row it replaced. In that case the caller falls back to the raw
 * cells, which is exactly today's behaviour.
 */
function layoutTable(
  rows: readonly Row[],
  columns: number,
  width: number,
): RichLine[] | null {
  // Only rows that occupy one column each can set a column's width; a caption
  // covering three of them says nothing about how wide any one of them is.
  const plain = rows.filter((r) => r.kind !== "divider" && (r.span ?? 1) === 1);
  const widths = Array.from({ length: columns }, (_, i) =>
    Math.max(0, ...plain.map((r) => (r.cells[i] ?? "").length)),
  );
  const total = widths.reduce((a, b) => a + b, 0) + GAP.length * (columns - 1) + INDENT[1];
  if (total > width) return null;

  /** Columns `from`..`from + span - 1` laid end to end, gaps included. */
  const groupWidth = (from: number, span: number) =>
    widths.slice(from, from + span).reduce((a, b) => a + b, 0) + GAP.length * (span - 1);

  const pad: Run = { text: " ".repeat(INDENT[1]) };
  return rows.map((row) => {
    if (row.kind === "divider") return [pad, ...cellRuns(row, 0)];
    const span = row.span ?? 1;
    let col = 0;
    const line: Run[] = [pad];
    row.cells.forEach((cell, i) => {
      // The stub column is never part of a caption group.
      const cover = i === 0 ? 1 : span;
      const w = groupWidth(col, cover);
      col += cover;
      if (i > 0) line.push({ text: GAP });
      line.push(...cellRuns(row, i), ...spacer(w - cell.length));
    });
    return trimEndRuns(line);
  });
}

/** The rows of a table that will not fit, one cell after another. */
function rawRow(row: Row): RichLine {
  const line: Run[] = [];
  row.cells.forEach((_, i) => {
    if (i > 0) line.push({ text: GAP });
    line.push(...cellRuns(row, i));
  });
  return trimEndRuns(line);
}

/**
 * The screen lines for one block.
 *
 * `refPrefix` is how the book writes a section reference, and it is here for
 * the number a block may open a section with: a topic is a *run* of sections,
 * and until the runs were marked the pager showed four of them as one wall of
 * prose with nothing saying where §21 began.
 */
function layoutBlock(block: Block, width: number, refPrefix: string): RichLine[] {
  // Bold, as the book prints it, and with a space after: a lead-in to the
  // sentence it opens rather than a line of its own.
  const num: Run[] = block.num
    ? [{ text: `${refPrefix}${block.num}.`, b: true }, { text: " " }]
    : [];
  const lead = (runs?: Run[], text = ""): Run[] => [...num, ...(runs ?? [{ text }])];

  switch (block.kind) {
    case "para":
      return wrapRuns(lead(block.runs, block.text), width);

    case "heading":
      return wrapRuns(lead(block.runs, block.text), width);

    case "item": {
      const indent = INDENT[block.level];
      const head = `${" ".repeat(indent)}${block.marker} `;
      const hang = " ".repeat(head.length);
      // Wrap to what is left after the marker, then hang the rest under the
      // text so the marker stays the only thing in the left margin.
      const body = wrapRuns(lead(block.runs, block.text), Math.max(8, width - head.length));
      return body.map((line, i) => [{ text: i === 0 ? head : hang }, ...line]);
    }

    case "table": {
      const rows =
        layoutTable(block.rows, block.columns, width) ??
        block.rows.flatMap((r) => wrapRuns(rawRow(r), width));
      // A paradigm has no sentence to lead, so the number stands over it.
      return num.length ? [trimEndRuns(num), ...rows] : rows;
    }
  }
}

/**
 * A section laid out for a `width`-column terminal, one entry per screen line.
 *
 * The text extract arrives with its shape stripped (see `parseBlocks`), so this
 * puts it back: sub-points indented under what they qualify, paradigm columns
 * padded so the endings line up down the page, and a blank line between blocks
 * so a section reads as prose and tables rather than one unbroken wall.
 */
export function layoutRichSection(
  text: string,
  width: number,
  style: GrammarStyle,
): RichLine[] {
  const out: RichLine[] = [];
  for (const block of parseBlocks(text, style)) {
    if (out.length > 0) out.push([]);
    out.push(...layoutBlock(block, width, style.refPrefix));
  }
  return out;
}

/** The same lines as strings, for callers with nothing to style them with. */
export function layoutSection(
  text: string,
  width: number,
  style: GrammarStyle,
): string[] {
  return layoutRichSection(text, width, style).map(plainOf);
}

/**
 * The opening `height` screen lines of `text`, padded to exactly that many.
 *
 * Clipping by source line shows wildly unequal amounts of a section — five
 * lines of a paradigm table is a handful of words, five lines of prose is a
 * paragraph — and leaves the surrounding box changing height as the cursor
 * moves. Laying the section out first makes a line a line, so every section
 * gets the same window and the map holds still.
 *
 * It is the reader's layout — indented points, aligned paradigm columns — but
 * with the blank lines between blocks dropped. The window here is two or three
 * lines on a short terminal, and spending half of them on air would leave the
 * map showing almost nothing. Breathing room is for reading; a taste needs to
 * be dense.
 */
export function previewWindow(
  text: string,
  width: number,
  height: number,
  style: GrammarStyle,
): { lines: string[]; truncated: boolean } {
  const window = previewRichWindow(text, width, height, style);
  return { lines: window.lines.map(plainOf), truncated: window.truncated };
}

/** `previewWindow`, keeping the emphasis for a caller that can show it. */
export function previewRichWindow(
  text: string,
  width: number,
  height: number,
  style: GrammarStyle,
): { lines: RichLine[]; truncated: boolean } {
  const wrapped = layoutRichSection(text, width, style).filter((l) => plainOf(l) !== "");
  const lines = wrapped.slice(0, height);
  while (lines.length < height) lines.push([]);
  return { lines, truncated: wrapped.length > height };
}

/** Largest scroll offset that still fills the viewport. */
export function maxScroll(lineCount: number, height: number): number {
  return Math.max(0, lineCount - height);
}

/** Clamp `scroll + delta` to the scrollable range. */
export function scrolled(
  scroll: number,
  delta: number,
  lineCount: number,
  height: number,
): number {
  return Math.max(0, Math.min(maxScroll(lineCount, height), scroll + delta));
}

/** "lines 9–16 of 41" — tells the reader there is more, and where they are. */
export function positionLabel(scroll: number, height: number, lineCount: number): string {
  const last = Math.min(lineCount, scroll + height);
  return `lines ${scroll + 1}–${last} of ${lineCount}`;
}
