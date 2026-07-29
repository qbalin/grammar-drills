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
import type { GrammarStyle } from "@latin-tutor/core";
import { parseBlocks, type Block, type Row } from "@latin-tutor/core";

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
): string[] | null {
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

  const pad = " ".repeat(INDENT[1]);
  return rows.map((row) => {
    if (row.kind === "divider") return pad + row.cells[0];
    const span = row.span ?? 1;
    let col = 0;
    return (
      pad +
      row.cells
        .map((c, i) => {
          // The stub column is never part of a caption group.
          const cover = i === 0 ? 1 : span;
          const w = groupWidth(col, cover);
          col += cover;
          return c.padEnd(w);
        })
        .join(GAP)
        .trimEnd()
    );
  });
}

/** The screen lines for one block. */
function layoutBlock(block: Block, width: number): string[] {
  switch (block.kind) {
    case "para":
      return wrapLines(block.text, width);

    case "heading":
      return wrapLines(block.text, width);

    case "item": {
      const indent = INDENT[block.level];
      const head = `${" ".repeat(indent)}${block.marker} `;
      const hang = " ".repeat(head.length);
      // Wrap to what is left after the marker, then hang the rest under the
      // text so the marker stays the only thing in the left margin.
      const body = wrapLines(block.text, Math.max(8, width - head.length));
      return body.map((line, i) => (i === 0 ? head : hang) + line);
    }

    case "table":
      return (
        layoutTable(block.rows, block.columns, width) ??
        block.rows.flatMap((r) => wrapLines(r.cells.join(GAP).trimEnd(), width))
      );
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
export function layoutSection(
  text: string,
  width: number,
  style: GrammarStyle,
): string[] {
  const out: string[] = [];
  for (const block of parseBlocks(text, style)) {
    if (out.length > 0) out.push("");
    out.push(...layoutBlock(block, width));
  }
  return out;
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
  const wrapped = layoutSection(text, width, style).filter((l) => l !== "");
  const lines = wrapped.slice(0, height);
  while (lines.length < height) lines.push("");
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
