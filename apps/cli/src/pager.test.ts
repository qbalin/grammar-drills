import { describe, expect, it } from "vitest";
import { maxScroll, positionLabel, previewWindow, scrolled, wrapLines } from "./pager.js";

describe("wrapLines", () => {
  it("keeps short lines as they are", () => {
    expect(wrapLines("one\ntwo", 20)).toEqual(["one", "two"]);
  });

  it("wraps long prose at word boundaries, losing nothing", () => {
    const lines = wrapLines("the girl loves the rose in the garden", 12);
    expect(lines.every((l) => l.length <= 12)).toBe(true);
    expect(lines.join(" ")).toBe("the girl loves the rose in the garden");
  });

  it("keeps the double spaces that hold paradigm columns apart", () => {
    expect(wrapLines("Nom.  puella  puellae", 40)).toEqual(["Nom.  puella  puellae"]);
  });

  it("hard-splits a word longer than the width rather than overflowing", () => {
    expect(wrapLines("supercalifragilistic", 8)).toEqual(["supercal", "ifragili", "stic"]);
  });

  it("keeps blank lines, so paragraph breaks survive the count", () => {
    expect(wrapLines("a\n\nb", 10)).toEqual(["a", "", "b"]);
  });
});

describe("previewWindow", () => {
  // A paradigm table and a paragraph of prose are the two extremes the map has
  // to sit between: clipped by source line they show utterly unequal amounts.
  const table = "amō\namās\namat\namāmus\namātis\namant";
  const prose = "the girl loves the rose in the garden ".repeat(6).trim();

  it("gives every section the same window, whatever its shape", () => {
    expect(previewWindow(table, 40, 5).lines).toHaveLength(5);
    expect(previewWindow(prose, 40, 5).lines).toHaveLength(5);
  });

  it("pads a section shorter than the window, so the box holds its height", () => {
    const { lines, truncated } = previewWindow("one\ntwo", 40, 5);
    expect(lines).toEqual(["one", "two", "", "", ""]);
    expect(truncated).toBe(false);
  });

  it("reports that there is more to read, and keeps the opening line", () => {
    const { lines, truncated } = previewWindow(table, 40, 5);
    expect(lines[0]).toBe("amō");
    expect(lines[4]).toBe("amātis");
    expect(truncated).toBe(true);
  });

  it("counts wrapped lines, not source lines", () => {
    // One source line, but it does not fit in five lines of forty columns.
    expect(previewWindow(prose, 40, 5).truncated).toBe(true);
    expect(previewWindow(prose, 40, 5).lines.every((l) => l.length <= 40)).toBe(true);
  });
});

describe("scrolling", () => {
  it("stops at the last full screen", () => {
    expect(maxScroll(41, 10)).toBe(31);
    expect(scrolled(28, 10, 41, 10)).toBe(31);
    expect(scrolled(0, -5, 41, 10)).toBe(0);
  });

  it("does not scroll text that already fits", () => {
    expect(scrolled(0, 5, 6, 10)).toBe(0);
  });

  it("reports the visible range", () => {
    expect(positionLabel(8, 8, 41)).toBe("lines 9–16 of 41");
    expect(positionLabel(33, 8, 41)).toBe("lines 34–41 of 41");
  });
});
