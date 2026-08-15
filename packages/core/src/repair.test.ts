/**
 * The student's file is the one that cannot be recreated, and it was the one
 * thing in this repo with no validator: `parseProfile` rejects an unknown key
 * in a config somebody can retype, while progress went through
 * `JSON.parse(...) as Progress` on all three storage paths.
 */
import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { Session } from "./session.js";
import { repairProgress } from "./repair.js";
import { testProfile } from "./profile.fixture.js";
import { emptyProgress, type ContentData } from "./types.js";

const fixture: ContentData = {
  grammar: [
    { id: "ag1", ref: "1", title: "First", family: "nouns", text: "x", order: 1 },
  ],
  tests: {
    ag1: [
      {
        id: "ag1-t1",
        sectionId: "ag1",
        questions: [{ prompt: "p", answer: "a", kind: "parse", vocab: [] }],
      },
    ],
  },
  lemmas: {},
};

const open = (progress: unknown) =>
  new Session(new Content(fixture, testProfile), progress as never);

describe("repairing a progress file", () => {
  it("leaves an ordinary file completely alone", () => {
    const good = emptyProgress();
    const { progress, repaired } = repairProgress(good);
    expect(repaired).toEqual([]);
    expect(progress.topicCards).toEqual(good.topicCards);
    expect(progress.updatedAt).toBe(good.updatedAt);
  });

  it("survives the record that used to crash the first question", () => {
    // The whole reason this exists: `topicCards: null` parses, satisfies the
    // compiler through the cast, and throws inside `Object.entries` in `next()`
    // — so the app opened to a stack trace with the file still on the device.
    const session = open({ ...emptyProgress(), topicCards: null });
    expect(() => session.next(new Date())).not.toThrow();
    expect(session.repaired).toContain("topicCards");
  });

  it("costs the damaged record rather than the year", () => {
    const kept = { ...emptyProgress(), topicMastery: { ag1: 3 }, attempts: null };
    const session = open(kept);

    expect(session.repaired).toEqual(["attempts"]);
    // The mastery is still there. A file damaged in one record must not be
    // treated as a file that cannot be read at all.
    expect(session.progress().topicMastery.ag1).toBe(3);
  });

  it("drops a trail entry that is not a list, and keeps its neighbours", () => {
    const { progress, repaired } = repairProgress({
      ...emptyProgress(),
      attempts: { ag1: "not a list", ag2: [] },
    });
    expect(repaired).toEqual(["attempts.ag1"]);
    expect(progress.attempts.ag1).toBeUndefined();
    expect(progress.attempts.ag2).toEqual([]);
  });

  it("refuses an updatedAt that could win a sync it should lose", () => {
    // It decides which of two devices wins, and a non-date compares as a string
    // against real ISO timestamps — "zzz" beats every date there has ever been.
    const { progress, repaired } = repairProgress({ ...emptyProgress(), updatedAt: "zzz" });
    expect(repaired).toContain("updatedAt");
    expect(Number.isNaN(Date.parse(progress.updatedAt))).toBe(false);
  });

  it("keeps null where null is a meaning", () => {
    // No round in flight and no cursor are things a file says, not damage.
    const { repaired } = repairProgress({
      ...emptyProgress(),
      openRound: null,
      practise: null,
      bookAt: null,
    });
    expect(repaired).toEqual([]);
  });

  it("starts empty rather than throwing on something that is not a file", () => {
    for (const nonsense of [null, 42, "a string", []]) {
      const { progress, repaired } = repairProgress(nonsense);
      expect(repaired).toEqual(["the file itself"]);
      expect(progress.topicCards).toEqual({});
    }
  });
});
