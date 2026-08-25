import { describe, expect, it } from "vitest";
import { Content, Session, emptyProgress, type ContentData } from "@lang-tutor/core";
import { testProfile } from "@lang-tutor/core/testing";
import { importProgress } from "./transfer.js";

/**
 * Two sections and nothing else: what is on trial here is the filter, and the
 * filter's whole question is whether this bundle holds an id.
 */
const data: ContentData = {
  grammar: [
    {
      id: "decl1",
      ref: "20-22",
      title: "First declension",
      family: "nouns",
      text: "First-declension nouns end in -a.",
      order: 10,
    },
    {
      id: "decl2",
      ref: "23-27",
      title: "Second declension",
      family: "nouns",
      text: "Second-declension nouns end in -us.",
      order: 20,
    },
  ],
  tests: {},
};

const content = new Content(data, testProfile);

/** A file as it comes off another device: text, and whatever it happens to say. */
const file = (progress: Record<string, unknown>) =>
  importProgress(JSON.stringify({ ...emptyProgress(), ...progress }), content);

/** The file taken all the way in, which is where the fold happens. */
const opened = (progress: Record<string, unknown>) =>
  new Session(content, file(progress));

describe("importing a progress file", () => {
  it("drops the marks on topics this bundle no longer holds", () => {
    // The syllabus has been rebuilt once — every id moved from `ag-*` to `bn-*`
    // — and a mark on a topic that is gone would pin a row nothing can draw.
    const kept = file({ bookmarked: ["decl1", "ag-999-gone"] });
    expect(kept.bookmarked).toEqual(["decl1"]);
  });

  it("keeps the shortlist of a file that called it stars", () => {
    /*
     * Import forces a reload, so `Session.migrate` would fold this a moment
     * later whether or not anything here knew the old name. What it would not
     * do is filter it: the fold runs downstream of the only code that knows
     * which ids this bundle holds. Reading the old name here is what stops a
     * legacy file being laundered past the one gate it most needs to pass.
     */
    const marks = opened({ starred: ["decl2", "ag-999-gone"] });

    expect(marks.isBookmarked("decl2")).toBe(true);
    expect(marks.progress().bookmarked).toEqual(["decl2"]);
    expect((marks.progress() as { starred?: unknown }).starred).toBeUndefined();
  });

  it("loses neither name where a file has been through both builds", () => {
    const marks = opened({ bookmarked: ["decl1"], starred: ["decl2"] });
    expect(marks.progress().bookmarked).toEqual(["decl1", "decl2"]);
  });

  it("refuses a file that is not one of ours", () => {
    expect(() => importProgress(JSON.stringify({ hello: true }), content)).toThrow();
  });
});
