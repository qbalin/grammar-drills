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
    const kept = { ...emptyProgress(), starred: ["ag1"], attempts: null };
    const session = open(kept);

    expect(session.repaired).toEqual(["attempts"]);
    // The star is still there. A file damaged in one record must not be treated
    // as a file that cannot be read at all.
    expect(session.isStarred("ag1")).toBe(true);
  });

  it("puts back a star list that is not a list, and drops what is not an id", () => {
    // It is the one field here that is an array, so it is the one that would
    // take `.includes` on something that has no such method.
    const notAList = repairProgress({ ...emptyProgress(), starred: "ag1" });
    expect(notAList.repaired).toEqual(["starred"]);
    expect(notAList.progress.starred).toEqual([]);

    const mixed = repairProgress({ ...emptyProgress(), starred: ["ag1", 7, null] });
    expect(mixed.repaired).toEqual(["starred"]);
    expect(mixed.progress.starred).toEqual(["ag1"]);
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
    // No round in flight and nothing being practised are things a file says,
    // not damage.
    const { repaired } = repairProgress({
      ...emptyProgress(),
      openRound: null,
      practise: null,
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

/**
 * The trap the deck's progress *getter* exists for.
 *
 * `VocabDeck` was lifted out of `Session`, and the obvious way to give it the
 * cards is to hand it `p.vocabCards` at construction. That is wrong in exactly
 * one place and silently: `restore()` replaces the whole progress object for an
 * undo, so a deck holding the old record goes on reading and writing the object
 * the undo threw away. Both are real objects, neither read throws, and the
 * symptom is a word that comes back from the dead one grade later.
 */
describe("the vocabulary deck after an undo", () => {
  const built = () => new Session(new Content(fixture, testProfile));
  const word = {
    lemma: "rosa",
    citation: "rosa, rosae (f)",
    gloss: "rose",
    pos: "noun",
  };

  it("reads the restored cards, not the ones the undo discarded", () => {
    const session = built();
    const clean = session.snapshot();
    const id = session.recordVocab(word as never);
    expect(session.vocabCard(id)).toBeDefined();

    session.restore(clean);

    // Through the deck, which is what a caller actually asks.
    expect(session.vocabCard(id)).toBeUndefined();
    expect(session.vocabList()).toHaveLength(0);
  });

  it("writes into the restored cards, so a re-record survives the save", () => {
    const session = built();
    const clean = session.snapshot();
    session.recordVocab(word as never);
    session.restore(clean);

    const id = session.recordVocab(word as never);
    // The card has to be in the progress that will actually be written out, not
    // in a detached record only the deck can see.
    expect(session.progress().vocabCards[id]).toBeDefined();
  });
});
