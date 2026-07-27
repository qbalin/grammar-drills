import { describe, expect, it } from "vitest";
import {
  layoutSection,
  maxScroll,
  positionLabel,
  previewWindow,
  scrolled,
  wrapLines,
} from "./pager.js";

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

describe("layoutSection", () => {
  it("puts a blank line between blocks, so a section is not one wall", () => {
    expect(layoutSection("The girl loves the rose.\nThe farmer sees her.", 40)).toEqual([
      "The girl loves the rose.",
      "",
      "The farmer sees her.",
    ]);
  });

  it("indents a sub-point and hangs the rest of it under its own text", () => {
    const lines = layoutSection("a. An old Ablative quī occurs in this sense.", 28);
    expect(lines[0]).toBe("     a. An old Ablative quī");
    // Every continuation clears the marker rather than sliding back under it.
    expect(lines.slice(1)).toEqual(["        occurs in this", "        sense."]);
    expect(lines.every((l) => l.length <= 28)).toBe(true);
  });

  it("indents a numbered point less deeply than a lettered one", () => {
    const [numbered] = layoutSection("1. Quis, who?", 40);
    const [lettered] = layoutSection("a. Quis, who?", 40);
    expect(numbered!.search(/\S/)).toBeLessThan(lettered!.search(/\S/));
  });

  it("pads paradigm columns so the endings line up down the page", () => {
    const lines = layoutSection(
      ["Nom.  puella  puellae", "Gen.  puellae  puellārum"].join("\n"),
      40,
    );
    expect(lines).toEqual([
      "  Nom.  puella   puellae",
      "  Gen.  puellae  puellārum",
    ]);
    // The column each ending sits in is the same on every row.
    expect(lines.map((l) => l.indexOf("puella"))).toEqual([8, 8]);
  });

  it("spreads a caption over the group of columns it names", () => {
    const lines = layoutSection(
      [
        "SINGULAR  PLURAL.",
        "MASC.  FEM.  NEUT.  MASC.  FEM.  NEUT.",
        "Nom.  hīc  haec  hōc  hī  hae  haec",
      ].join("\n"),
      60,
    );
    // "PLURAL." starts where the plural forms start, not one column in.
    expect(lines[0]!.indexOf("PLURAL.")).toBe(lines[1]!.lastIndexOf("MASC."));
  });

  it("keeps a divider with the table it divides", () => {
    const lines = layoutSection(
      ["SINGULAR.", "Nom.  tussis", "PLURAL.", "Nom.  tussēs"].join("\n"),
      40,
    );
    // One block: no blank line splits the paradigm in two.
    expect(lines).toEqual(["  SINGULAR.", "  Nom.  tussis", "  PLURAL.", "  Nom.  tussēs"]);
  });

  it("leaves a table unpadded rather than pushing it off a narrow screen", () => {
    // A terminal cannot scroll sideways, so there is nowhere for overflow to go.
    const row = "Nom.  hīc  haec  hōc  hī  hae  haec";
    expect(layoutSection(row, 20).every((l) => l.length <= 20)).toBe(true);
  });
});

describe("previewWindow", () => {
  // A paradigm table and a paragraph of prose are the two extremes the map has
  // to sit between: clipped by source line they show utterly unequal amounts.
  const table = [
    "SINGULAR.",
    "1st.  amō  moneō",
    "2nd.  amās  monēs",
    "3rd.  amat  monet",
    "PLURAL.",
    "1st.  amāmus  monēmus",
  ].join("\n");
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
    expect(lines[0]).toBe("  SINGULAR.");
    expect(lines[4]).toBe("  PLURAL.");
    expect(truncated).toBe(true);
  });

  it("counts laid-out lines, not source lines", () => {
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
