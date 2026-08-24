import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { Session } from "./session.js";
import { testProfile } from "./profile.fixture.js";
import type { ContentData, Profile, Test } from "./types.js";

/**
 * Two grammars of one language, over one set of questions.
 *
 * The whole design is in one sentence and these tests are that sentence taken
 * apart: the questions were written against one syllabus, a further grammar
 * reaches them through the crosswalk, and progress never moves. So switching
 * books changes what is drawn and what it is called, and nothing else — which
 * is what makes "shared progress" true by construction rather than by keeping
 * two stores in step.
 */

/** A second book: the primary's `tg-020` split in two, `tg-030` renamed. */
const profile: Profile = {
  ...testProfile,
  grammars: [
    {
      id: "second",
      label: "Second",
      content: "grammars/second.json",
      manifest: "grammars/second-coverage.json",
      source: { title: "Another grammar", url: "https://example.invalid/", licence: "n/a" },
      idPrefix: "sg",
      refPrefix: "¶ ",
      families: [
        { id: "forms", label: "Forms" },
        { id: "uses", label: "Uses" },
      ],
      fallbackFamily: "uses",
      grammarShape: testProfile.grammarShape,
      coverage: { topicsWithTestsPct: 50, minTestsPerTopic: 1, minQuestionsPerTopic: 1 },
    },
  ],
};

const section = (id: string, order: number, family: string, title = id) => ({
  id, ref: String(order), title, family, order, text: `text of ${id}`,
});

const test = (id: string, sectionId: string, n: number): Test => ({
  id,
  sectionId,
  questions: Array.from({ length: n }, (_, i) => ({
    prompt: `${id} prompt ${i}`,
    answer: `${id} answer ${i}`,
    kind: "translate-en-l2",
    vocab: [],
  })),
});

const data: ContentData = {
  grammar: [
    section("tg-020-nouns", 10, "nouns"),
    section("tg-030-verbs", 20, "verb-forms"),
  ],
  grammars: {
    second: [
      // Two topics of the second book teach one topic of the first: the case
      // the whole design turns on.
      section("sg-100-nouns-a", 10, "forms", "Nouns, part one"),
      section("sg-110-nouns-b", 20, "forms", "Nouns, part two"),
      section("sg-200-verbs", 30, "uses", "Verbs"),
      // And one the table reaches from nowhere.
      section("sg-300-orphan", 40, "uses", "Something the other book lacks"),
    ],
  },
  crosswalk: {
    second: {
      toPrimary: {
        "sg-100-nouns-a": ["tg-020-nouns"],
        "sg-110-nouns-b": ["tg-020-nouns"],
        "sg-200-verbs": ["tg-030-verbs"],
      },
      fromPrimary: {
        "tg-020-nouns": ["sg-100-nouns-a", "sg-110-nouns-b"],
        "tg-030-verbs": ["sg-200-verbs"],
      },
    },
  },
  tests: {
    "tg-020-nouns": [test("tg-020-nouns-t1", "tg-020-nouns", 2)],
    "tg-030-verbs": [test("tg-030-verbs-t1", "tg-030-verbs", 2)],
  },
};

const content = () => new Content(data, profile);
const session = () => new Session(content());

describe("a pack with more than one grammar", () => {
  it("keeps each book's sections, order and families apart", () => {
    const c = content();
    expect(c.grammarIds()).toEqual(["tg", "second"]);
    expect(c.primaryGrammar).toBe("tg");
    expect(c.sections().map((s) => s.id)).toEqual(["tg-020-nouns", "tg-030-verbs"]);
    expect(c.sections("second").map((s) => s.id)).toEqual([
      "sg-100-nouns-a", "sg-110-nouns-b", "sg-200-verbs", "sg-300-orphan",
    ]);
    expect(c.families("second").map((f) => f.id)).toEqual(["forms", "uses"]);
    // A book's reference is written the way that book writes it.
    expect(c.formatRef("100", "second")).toBe("¶ 100");
    expect(c.formatRef("20")).toBe("§ 20");
  });

  it("finds a section of either book from its id alone", () => {
    const c = content();
    expect(c.getSection("sg-200-verbs")?.title).toBe("Verbs");
    expect(c.grammarOf("sg-200-verbs")).toBe("second");
    expect(c.grammarOf("tg-020-nouns")).toBe("tg");
  });

  it("serves a further grammar's topic out of the primary's bank", () => {
    const c = content();
    expect(c.primaryTopicsFor("sg-100-nouns-a")).toEqual(["tg-020-nouns"]);
    expect(c.testsFor("sg-100-nouns-a").map((t) => t.id)).toEqual(["tg-020-nouns-t1"]);
    // Both halves draw on the same bank, because there is only one.
    expect(c.testsFor("sg-110-nouns-b")).toEqual(c.testsFor("sg-100-nouns-a"));
    // A topic the table does not reach has nothing behind it, and says so
    // rather than falling back to something.
    expect(c.primaryTopicsFor("sg-300-orphan")).toEqual([]);
    expect(c.testsFor("sg-300-orphan")).toEqual([]);
    expect(c.topicIds("second")).toEqual([
      "sg-100-nouns-a", "sg-110-nouns-b", "sg-200-verbs",
    ]);
  });

  it("grades the topic the question was written for, not the one it was read through", () => {
    const s = session();
    s.setGrammar("second");
    const served = s.serveTest("sg-100-nouns-a")!;
    s.beginRound("sg-100-nouns-a", served, true);

    const open = s.progress().openRound!;
    // The card belongs to the primary topic; the second book's id is kept only
    // so that picking the round back up returns to the right page.
    expect(open.sectionId).toBe("tg-020-nouns");
    expect(open.viewedAs).toBe("sg-100-nouns-a");

    // Enrolled through the second book's id, which is how the offer at the end
    // of the round reaches it — the card still lands on the primary's topic.
    s.enrolTopic("sg-100-nouns-a");
    s.gradeTopic("tg-020-nouns", 3);
    const p = s.progress();
    expect(Object.keys(p.topicCards)).toEqual(["tg-020-nouns"]);
    // Nothing anywhere is filed under a second-book id.
    expect(JSON.stringify(p)).not.toContain("sg-100");
  });

  it("files a star under the primary topic, whichever book set it", () => {
    // Stars go where everything else here goes. Set through the second book,
    // read back through the first, and nothing on disk names the second.
    const s = session();
    s.setGrammar("second");
    s.star("sg-100-nouns-a");
    expect(s.progress().starred).toEqual(["tg-020-nouns"]);
    expect(JSON.stringify(s.progress())).not.toContain("sg-100");

    s.setGrammar("tg");
    expect(s.isStarred("tg-020-nouns")).toBe(true);
    s.unstar("tg-020-nouns");
    s.setGrammar("second");
    expect(s.isStarred("sg-100-nouns-a")).toBe(false);
  });

  it("shows work done in one book when the other is opened", () => {
    const s = session();
    s.recordAttempt("tg-020-nouns", {
      prompt: "tg-020-nouns-t1 prompt 0",
      answer: "x", submitted: "x", rating: 3,
    });
    s.enrolTopic("tg-020-nouns", 4);

    s.setGrammar("second");
    const map = new Map(s.grammarMap().map((t) => [t.sectionId, t]));
    expect(map.get("sg-100-nouns-a")!.scheduled).toBe(true);
    expect(map.get("sg-100-nouns-a")!.answered).toBe(1);
    // The other book's topic that teaches nothing yet is untouched.
    expect(map.get("sg-200-verbs")!.scheduled).toBe(false);
    expect(map.get("sg-200-verbs")!.answered).toBe(0);
  });

  it("moves two topics of one book in lockstep when they teach one topic of the other", () => {
    /*
     * The documented consequence, asserted so it cannot drift into a surprise.
     * There is one bank of questions behind both halves, so there is one answer
     * to give about them; a finer one would be invented.
     */
    const s = session();
    s.setGrammar("second");
    s.gradeTopic("tg-020-nouns", 3);
    const graded = new Map(s.grammarMap().map((t) => [t.sectionId, t]));
    expect(graded.get("sg-100-nouns-a")!.due).toBe(graded.get("sg-110-nouns-b")!.due);
    expect(graded.get("sg-100-nouns-a")!.answered).toBe(
      graded.get("sg-110-nouns-b")!.answered,
    );

    // And the star with them: it is filed under the one topic they share, so
    // marking either marks both.
    s.star("sg-100-nouns-a");
    const starred = new Map(s.grammarMap().map((t) => [t.sectionId, t]));
    expect(starred.get("sg-100-nouns-a")!.starred).toBe(true);
    expect(starred.get("sg-110-nouns-b")!.starred).toBe(true);

    // And the die with it, for the same reason. Taking one half off the die
    // while the other went on being rolled would offer the same bank of
    // questions under a name the student had just refused.
    s.excludeFromRoll("sg-110-nouns-b");
    const off = new Map(s.grammarMap().map((t) => [t.sectionId, t]));
    expect(off.get("sg-100-nouns-a")!.noRoll).toBe(true);
    expect(off.get("sg-110-nouns-b")!.noRoll).toBe(true);
    expect(s.progress().noRoll).toEqual(["tg-020-nouns"]);
  });

  it("draws a topic the crosswalk does not reach as having nothing to serve", () => {
    const s = session();
    s.setGrammar("second");
    const orphan = s.grammarMap().find((t) => t.sectionId === "sg-300-orphan")!;
    expect(orphan.hasTests).toBe(false);
    expect(orphan.questions).toBe(0);
    expect(orphan.scheduled).toBe(false);
    expect(s.serveTest("sg-300-orphan")).toBeUndefined();
    // And it cannot be starred: there is no primary topic to file the mark
    // under, which is the same silence as its having no questions.
    s.star("sg-300-orphan");
    expect(s.isStarred("sg-300-orphan")).toBe(false);
    expect(s.progress().starred).toBeUndefined();
    // Nor taken off the die: with no questions behind it, the die would never
    // have rolled it in the first place.
    s.excludeFromRoll("sg-300-orphan");
    expect(s.isExcludedFromRoll("sg-300-orphan")).toBe(false);
    expect(s.progress().noRoll).toBeUndefined();
    /*
     * And it is *not* a reading page, which looks identical from here and is
     * not the same thing at all. This topic is grammar the table has not got to
     * yet — a gap somebody should close, and one X2 measures — where a reading
     * page is the book having no exercise there to begin with. Pinned so the
     * two cannot quietly become one state: collapsing them would turn every
     * unfinished row of the crosswalk into a page nobody need ever look at.
     */
    expect(orphan.readingOnly).toBe(false);
  });

  it("keeps a run on the topic it was started on when the book is switched", () => {
    // There is no cursor to follow into the wrong syllabus any more — the run
    // is filed under the section it was started on, and switching books is a
    // view change. What must not happen is the switch quietly ending it.
    const s = session();
    s.drillTopic("tg-020-nouns");
    s.setGrammar("second");
    expect(s.practiseRun()?.sectionId).toBe("tg-020-nouns");
    expect(s.next(new Date(), "explore")).toEqual({
      kind: "drill", sectionId: "tg-020-nouns",
    });
  });

  it("puts a further grammar's section into the pile by every topic it teaches, and takes it out the same way", () => {
    const wide: ContentData = {
      ...data,
      crosswalk: {
        second: {
          toPrimary: { ...data.crosswalk!.second.toPrimary, "sg-100-nouns-a": ["tg-020-nouns", "tg-030-verbs"] },
          fromPrimary: data.crosswalk!.second.fromPrimary,
        },
      },
    };
    const s = new Session(new Content(wide, profile));
    s.setGrammar("second");

    // One page of the second book teaches two topics of the first, so enrolling
    // it enrols both — the lockstep every per-topic fact here moves in. A single
    // card would leave the other half of the page silently out of the pile.
    s.enrolTopic("sg-100-nouns-a", 4);
    expect(Object.keys(s.progress().topicCards).sort()).toEqual([
      "tg-020-nouns",
      "tg-030-verbs",
    ]);
    expect(JSON.stringify(s.progress())).not.toContain("sg-100");
    expect(s.grammarMap().find((t) => t.sectionId === "sg-100-nouns-a")!.scheduled).toBe(true);

    // Both cards go, not the first one found: the section is one page to the
    // student, and a half-dismissed one would go on coming due.
    s.dismissTopic("sg-100-nouns-a");
    expect(s.progress().topicCards).toEqual({});
    expect(s.grammarMap().find((t) => t.sectionId === "sg-100-nouns-a")!.scheduled).toBe(false);
  });

  it("reads a progress file that predates any of this as the primary book", () => {
    const s = new Session(content(), {
      version: 1, frontier: null, topicCards: {}, topicMastery: {},
      vocabCards: {}, seenTests: {}, attempts: {}, newTopicsIntroduced: 0,
      updatedAt: new Date().toISOString(),
    } as never);
    expect(s.grammarId).toBe("tg");
    expect(s.grammarMap().map((t) => t.sectionId)).toEqual([
      "tg-020-nouns", "tg-030-verbs",
    ]);
  });

  it("ignores a grammar the pack does not ship", () => {
    const s = session();
    s.setGrammar("no-such-book");
    expect(s.grammarId).toBe("tg");
  });
});
