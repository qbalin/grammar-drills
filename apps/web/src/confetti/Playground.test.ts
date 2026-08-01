import { describe, expect, it } from "vitest";
import { AUTHOR, isAuthor } from "./Playground.js";

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
