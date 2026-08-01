import { describe, expect, it } from "vitest";
import { AUTHOR, asDefaults, isAuthor, loadBench } from "./Playground.js";
import { DEFAULTS } from "./Confetti.js";

/**
 * The gate is weak on purpose — there is nothing behind it worth guarding —
 * but it still has to be closed for everyone who is not the author, because a
 * debugging bench in a student's Settings is clutter they cannot explain.
 */
describe("isAuthor", () => {
  it("opens for the author, however it was typed", () => {
    for (const owner of [AUTHOR, "QBalin", "  qbalin  ", "QBALIN"]) {
      expect(isAuthor(owner)).toBe(true);
    }
  });

  it("stays shut for everyone else", () => {
    for (const owner of [
      undefined,
      null,
      "",
      "   ",
      "someone-else",
      "qbalin2",
      "notqbalin",
      "qbali",
    ]) {
      expect(isAuthor(owner)).toBe(false);
    }
  });
});

/**
 * A tuning session is worth keeping across the reload that follows editing a
 * path, but not at the cost of a burst that will not fire because something
 * unreadable got into storage.
 */
describe("loadBench", () => {
  it("starts from the shipped defaults with nothing stored", () => {
    expect(loadBench(() => null)).toEqual(DEFAULTS);
  });

  it("takes back the values it wrote", () => {
    const tuned = { ...DEFAULTS, size: 21, originY: 0.4 };
    expect(loadBench(() => JSON.stringify(tuned))).toEqual(tuned);
  });

  it("keeps the default for a knob that was not stored, and drops one that no longer exists", () => {
    const loaded = loadBench(() => JSON.stringify({ size: 21, gone: 5 }));
    expect(loaded.size).toBe(21);
    expect(loaded.pieces).toBe(DEFAULTS.pieces);
    expect(loaded).not.toHaveProperty("gone");
  });

  it("falls back rather than throwing on anything unreadable", () => {
    for (const raw of ["", "{", "null", '"a string"', '{"size":"wide"}']) {
      expect(loadBench(() => raw).size).toBe(DEFAULTS.size);
    }
  });
});

describe("asDefaults", () => {
  it("writes a block that reads back as the settings it was given", () => {
    const tuned = { ...DEFAULTS, size: 21 };
    const source = asDefaults(tuned);
    expect(source).toContain("size: 21,");
    // What is copied has to be pasteable over the real declaration, so it has
    // to name every knob and be spelled the way the source spells it.
    for (const key of Object.keys(DEFAULTS)) expect(source).toContain(`${key}:`);
    expect(source.startsWith("export const DEFAULTS = {")).toBe(true);
  });
});
