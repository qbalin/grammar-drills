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
    const kept = { ...emptyProgress(), bookmarked: ["ag1"], attempts: null };
    const session = open(kept);

    expect(session.repaired).toEqual(["attempts"]);
    // The mark is still there. A file damaged in one record must not be treated
    // as a file that cannot be read at all.
    expect(session.isBookmarked("ag1")).toBe(true);
  });

  it("puts back a bookmark list that is not a list, and drops what is not an id", () => {
    // One of the fields here that are arrays, so one of the ones that would
    // take `.includes` on something that has no such method.
    const notAList = repairProgress({ ...emptyProgress(), bookmarked: "ag1" });
    expect(notAList.repaired).toEqual(["bookmarked"]);
    expect(notAList.progress.bookmarked).toEqual([]);

    const mixed = repairProgress({ ...emptyProgress(), bookmarked: ["ag1", 7, null] });
    expect(mixed.repaired).toEqual(["bookmarked"]);
    expect(mixed.progress.bookmarked).toEqual(["ag1"]);
  });

  it("holds the bookmarks' old name to the same shape as the new one", () => {
    /*
     * `starred` is checked here rather than where it is folded, because repair
     * runs first and `{ ...empty, ...raw }` would otherwise hand the migration
     * a number to call `.filter` on. Without this the fold is one damaged file
     * away from the crash the whole module exists to prevent.
     */
    const notAList = repairProgress({ ...emptyProgress(), starred: 3 });
    expect(notAList.repaired).toEqual(["starred"]);
    expect((notAList.progress as { starred?: unknown }).starred).toEqual([]);

    const mixed = repairProgress({ ...emptyProgress(), starred: ["ag1", null] });
    expect(mixed.repaired).toEqual(["starred"]);
    expect((mixed.progress as { starred?: unknown }).starred).toEqual(["ag1"]);
  });

  it("repairs the die's exclusions on the same terms as the bookmarks", () => {
    // The second list, and it takes `.includes` on the first roll rather than
    // on the first bookmark lookup — a different screen, the same crash.
    const notAList = repairProgress({ ...emptyProgress(), noRoll: 3 });
    expect(notAList.repaired).toEqual(["noRoll"]);
    expect(notAList.progress.noRoll).toEqual([]);

    const mixed = repairProgress({ ...emptyProgress(), noRoll: [null, "ag2"] });
    expect(mixed.repaired).toEqual(["noRoll"]);
    expect(mixed.progress.noRoll).toEqual(["ag2"]);

    // A file that has never excluded anything carries no field, and repairing
    // it must not invent one.
    expect(repairProgress(emptyProgress()).progress.noRoll).toBeUndefined();
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

  it("repairs the rounds put down, container and slot separately", () => {
    // A wrong-typed container costs both slots; a wrong-typed slot costs only
    // its own. Deleted rather than nulled, because absence is the meaning here
    // — unlike `openRound`, where `null` is a value the engine writes.
    const whole = repairProgress({ ...emptyProgress(), suspended: 7 });
    expect(whole.repaired).toContain("suspended");
    expect(whole.progress.suspended).toBeUndefined();

    const slot = repairProgress({
      ...emptyProgress(),
      suspended: { review: 7, explore: { answered: 0 } },
    });
    expect(slot.repaired).toContain("suspended.review");
    expect(slot.progress.suspended!.review).toBeUndefined();
    expect(slot.progress.suspended!.explore).toBeDefined();
  });

  it("leaves a file that has never put a round down alone", () => {
    const { progress, repaired } = repairProgress(emptyProgress());
    expect(repaired).toEqual([]);
    expect(progress.suspended).toBeUndefined();
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
