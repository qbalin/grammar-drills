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
  id, ref: String(order), title, family, order, text: `⟦#${order}⟧\ntext of ${id}`,
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

describe("the numbers the book prints", () => {
  const content = new Content(data, profile);

  it("finds the topic a printed section number falls in", () => {
    expect(content.sectionByNumber("10")?.id).toBe("tg-020-nouns");
    expect(content.sectionByNumber("20")?.id).toBe("tg-030-verbs");
  });

  it("answers per book, so two books' numbering cannot collide", () => {
    // Both books print a §10, and they are different pages.
    expect(content.sectionByNumber("10", "second")?.id).toBe("sg-100-nouns-a");
    expect(content.sectionByNumber("40", "second")?.id).toBe("sg-300-orphan");
    expect(content.sectionByNumber("40")).toBeUndefined();
  });

  it("has nothing to offer for a number no page prints", () => {
    expect(content.sectionByNumber("999")).toBeUndefined();
  });

  it("finds nothing at all in content written before the numbers were carried", () => {
    const bare = new Content(
      { ...data, grammar: [{ ...data.grammar[0]!, text: "text with no markers" }] },
      profile,
    );
    expect(bare.sectionByNumber("10")).toBeUndefined();
  });
});

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

  it("puts a round read through the second book down, and back on its own page", () => {
    // Parking carries the whole round, so the page the student was reading
    // comes back with it. Without `viewedAs` surviving, picking the round up
    // would drop them into the primary book on a topic they never opened.
    const s = session();
    s.setGrammar("second");
    s.enrolTopic("sg-100-nouns-a");
    const served = s.serveTest("sg-100-nouns-a")!;
    s.beginRound("sg-100-nouns-a", served, false, "review");
    s.suspendRound();

    expect(s.progress().suspended!.review!.viewedAs).toBe("sg-100-nouns-a");
    const back = s.resumeRound("review")!;
    // Filed under the primary topic, as the card is, and read back through the
    // section it was met in.
    expect(back.sectionId).toBe("tg-020-nouns");
    expect(s.progress().openRound!.viewedAs).toBe("sg-100-nouns-a");
  });

  it("drops a round put down on a topic the other book then dismissed", () => {
    // The lockstep everything else here moves in: a dismissal through either
    // book takes the round down with the card, whichever id named it.
    const s = session();
    s.enrolTopic("tg-020-nouns");
    const served = s.serveTest("tg-020-nouns")!;
    s.beginRound("tg-020-nouns", served, false, "review");
    s.suspendRound();
    expect(s.parkedRound("review")).not.toBeNull();

    s.setGrammar("second");
    s.dismissTopic("sg-100-nouns-a");
    expect(s.parkedRound("review")).toBeNull();
  });

  it("files a bookmark under the page that carries it, not the topic it teaches", () => {
    /*
     * The one fact here that does *not* go where the rest goes. A bookmark is a
     * mark on a page, and the books are not equally good page by page — so it
     * is filed under the section's own id, and the other book knows nothing
     * about it.
     */
    const s = session();
    s.setGrammar("second");
    s.bookmark("sg-100-nouns-a");
    expect(s.progress().bookmarked).toEqual(["sg-100-nouns-a"]);
    expect(JSON.stringify(s.progress())).not.toContain("tg-020-nouns");

    s.setGrammar("tg");
    expect(s.isBookmarked("tg-020-nouns")).toBe(false);
    s.setGrammar("second");
    expect(s.isBookmarked("sg-100-nouns-a")).toBe(true);
    s.unbookmark("sg-100-nouns-a");
    expect(s.isBookmarked("sg-100-nouns-a")).toBe(false);
  });

  it("keeps each book's shelf to the marks made in it", () => {
    // What the change is for: the two books are marked apart, and the index's
    // shelf shows the book it is drawn over.
    const s = session();
    s.bookmark("tg-030-verbs");
    s.setGrammar("second");
    s.bookmark("sg-200-verbs");

    expect(s.bookmarkedTopics().map((t) => t.sectionId)).toEqual([
      "sg-200-verbs",
    ]);
    s.setGrammar("tg");
    expect(s.bookmarkedTopics().map((t) => t.sectionId)).toEqual([
      "tg-030-verbs",
    ]);
    // Both are on disk throughout; only which of them is drawn moved.
    expect(s.progress().bookmarked).toEqual(["tg-030-verbs", "sg-200-verbs"]);
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

    // The bookmark is the exception, and the contrast is the point. Everything
    // above is a fact about the bank of questions the two halves share; a
    // bookmark is a mark on a page, and these are two pages.
    s.bookmark("sg-100-nouns-a");
    const marked = new Map(s.grammarMap().map((t) => [t.sectionId, t]));
    expect(marked.get("sg-100-nouns-a")!.bookmarked).toBe(true);
    expect(marked.get("sg-110-nouns-b")!.bookmarked).toBe(false);
    expect(s.progress().bookmarked).toEqual(["sg-100-nouns-a"]);

    // The die is not the exception. Taking one half off the die while the other
    // went on being rolled would offer the same bank of questions under a name
    // the student had just refused.
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
    // It can still be bookmarked, though, and that is not the same silence: the
    // mark goes under the page's own id, and a page worth coming back to is
    // worth marking whether or not anybody wrote questions against it.
    s.bookmark("sg-300-orphan");
    expect(s.isBookmarked("sg-300-orphan")).toBe(true);
    expect(s.progress().bookmarked).toEqual(["sg-300-orphan"]);
    // It cannot be taken off the die: with no questions behind it, the die
    // would never have rolled it in the first place.
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
