import { describe, expect, it } from "vitest";
import { layersOf, shade, shapesOf, type ConfettiPack } from "./shapes.js";

const pack: ConfettiPack = {
  palette: { blood: "#a3121b", gold: "#e8c98a" },
  shapes: {
    scutum: [
      ["blood", "M0 0 L1 1 Z"],
      ["gold", "M2 2 L3 3 Z"],
    ],
    old: "M4 4 L5 5 Z",
    typo: [["nosuchpaint", "M6 6 Z"]],
  },
  throws: [["scutum"], ["scutum", "old"]],
  colors: ["#e8c98a"],
};

describe("layersOf", () => {
  it("resolves each layer's paint through the palette, in painting order", () => {
    expect(layersOf(pack.shapes.scutum, pack)).toEqual([
      { d: "M0 0 L1 1 Z", fill: "#a3121b" },
      { d: "M2 2 L3 3 Z", fill: "#e8c98a" },
    ]);
  });

  /** The old set has to keep rendering, or there is nothing to compare against. */
  it("reads a bare path as one layer that takes the piece's tint", () => {
    expect(layersOf(pack.shapes.old, pack)).toEqual([{ d: "M4 4 L5 5 Z", fill: null }]);
  });

  it("falls back to the piece's tint when a paint name is unknown", () => {
    expect(layersOf(pack.shapes.typo, pack)).toEqual([{ d: "M6 6 Z", fill: null }]);
  });

  it("has nothing to say about a shape that is not there", () => {
    expect(layersOf(undefined, pack)).toEqual([]);
    expect(layersOf(pack.shapes.missing, pack)).toEqual([]);
  });

  it("skips a malformed layer rather than drawing a hole where it was", () => {
    const broken = [["gold"], ["gold", ""], ["gold", "M7 7 Z"]] as [string, string][];
    expect(layersOf(broken, pack)).toEqual([{ d: "M7 7 Z", fill: "#e8c98a" }]);
  });
});

describe("shapesOf", () => {
  it("gives one entry per shape the group names", () => {
    expect(shapesOf(["scutum", "old"], pack)).toHaveLength(2);
  });

  /**
   * A name with no shape behind it used to vanish silently and take its share
   * of the burst with it. It still cannot throw, but the pack tests now fail
   * before it ships.
   */
  it("drops a name with no shape behind it", () => {
    expect(shapesOf(["scutum", "gone"], pack)).toHaveLength(1);
    expect(shapesOf(["gone"], pack)).toEqual([]);
  });
});

describe("shade", () => {
  it("leaves a colour alone at 1", () => {
    expect(shade("#a3121b", 1)).toBe("#a3121b");
  });

  it("moves toward white above 1 and toward black below", () => {
    expect(shade("#808080", 1.5)).toBe("#c0c0c0");
    expect(shade("#808080", 0.5)).toBe("#404040");
  });

  /** The two ends have to survive, or a black glaze would never catch light. */
  it("still lightens near-black and still darkens near-white", () => {
    expect(shade("#000000", 1.08)).not.toBe("#000000");
    expect(shade("#ffffff", 0.92)).not.toBe("#ffffff");
  });

  it("clamps rather than wrapping when pushed past either end", () => {
    expect(shade("#808080", 9)).toBe("#ffffff");
    expect(shade("#808080", -9)).toBe("#000000");
  });

  it("expands the three-digit form", () => {
    expect(shade("#abc", 1)).toBe("#aabbcc");
  });

  it("hands back anything it cannot read", () => {
    for (const bad of ["", "red", "#12", "#12345"]) expect(shade(bad, 1.2)).toBe(bad);
  });
});
