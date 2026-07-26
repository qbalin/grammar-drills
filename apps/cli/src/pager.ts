/**
 * Line handling for the grammar pager.
 *
 * Sections run to hundreds of lines (paradigm tables especially), so the reader
 * scrolls instead of clipping. Scrolling needs to count *screen* lines, not
 * source lines, so the text is wrapped here rather than left to Ink.
 */

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
    // Split on single spaces so the double spaces holding paradigm columns
    // apart survive inside a line that does fit.
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
