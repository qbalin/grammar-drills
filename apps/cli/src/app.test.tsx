import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import {
  Content,
  Session,
  emptyProgress,
  type ContentData,
  type Progress,
  type StorageAdapter,
} from "@lang-tutor/core";
import { testProfile } from "@lang-tutor/core/testing";
import { App } from "./app.js";

const fixture: ContentData = {
  grammar: [
    { id: "ag-decl1", ref: "34", title: "First declension nouns", family: "nouns", text: "First-declension nouns end in -a.", order: 10 },
    { id: "ag-decl2", ref: "35", title: "Second declension nouns", family: "nouns", text: "Second-declension nouns end in -us.", order: 20 },
    { id: "ag-verb-pres", ref: "174", title: "Present indicative active", family: "verb-forms", text: "The present stem takes the personal endings.", order: 130 },
  ],
  tests: {
    "ag-decl1": [
      {
        id: "ag-decl1-t1",
        sectionId: "ag-decl1",
        questions: [
          { prompt: "The girl loves the rose.", answer: "puella rosam amat", kind: "translate-en-la", vocab: ["puella", "rosam", "amat"] },
        ],
      },
    ],
    "ag-decl2": [
      {
        id: "ag-decl2-t1",
        sectionId: "ag-decl2",
        questions: [
          { prompt: "The master frees the slave.", answer: "dominus servum līberat", kind: "translate-en-la", vocab: ["dominus", "servum", "līberat"] },
        ],
      },
    ],
    "ag-verb-pres": [
      {
        id: "ag-verb-pres-t1",
        sectionId: "ag-verb-pres",
        questions: [
          { prompt: "The poet praises the queen.", answer: "poēta rēgīnam laudat", kind: "translate-en-la", vocab: ["poēta", "rēgīnam", "laudat"] },
        ],
      },
    ],
  },
  lemmas: {
    manibus: [{ lemma: "manus", citation: "manus, manūs (f)", gloss: "hand", pos: "noun", rank: 157 }],
    // Enough of a dictionary for the first topic's question to have a word list.
    // `rosam` carries a second reading so the crib has an ambiguity to resolve:
    // the prompt says "rose", so the flower must beat the more frequent verb.
    puella: [{ lemma: "puella", citation: "puella, puellae (f)", gloss: "girl, lass, maiden", pos: "noun", rank: 638 }],
    rosam: [
      { lemma: "rodo", citation: "rōdō, rōdere, rōsī, rōsum", gloss: "to gnaw, nibble at", pos: "verb", rank: 900 },
      { lemma: "rosa", citation: "rosa, rosae (f)", gloss: "rose", pos: "noun", rank: 4845 },
    ],
    amat: [{ lemma: "amō", citation: "amō, amāre, amāvī, amātum", gloss: "to love; to like", pos: "verb", rank: 125 }],
  },
};

class MemoryStorage implements StorageAdapter {
  saved: Progress = emptyProgress();
  describe() {
    return "memory";
  }
  async load() {
    return null;
  }
  async save(p: Progress) {
    this.saved = p;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 30));

/** What the terminal sends for Esc. */
const ESC = "";

describe("CLI App (write → compare → self-grade)", () => {
  it("runs placement, then teaches, takes a written answer, records vocab, grades", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, undefined);
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    // Placement runs first on a fresh deck.
    await tick();
    expect(lastFrame()).toContain("Placement 1/");
    expect(lastFrame()).toContain("The girl loves the rose.");
    // No within-test counter here: placement serves one question per probe and
    // starts each at index 0, so the counter could only ever read "1 of the
    // test's size". "Placement 1/" above is the number that means something.
    expect(lastFrame()).toContain(testProfile.ui.promptDirection);
    expect(lastFrame()).not.toMatch(
      new RegExp(`${testProfile.ui.promptDirection} · \\d+/\\d+`),
    );
    stdin.write("nesciō"); // "I don't know"
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("correct");
    // Grade 1 = don't know it yet. The nouns settle at their start, and the
    // test moves on to the next area rather than stopping: not knowing one
    // part of the grammar says nothing about the others.
    stdin.write("1");
    await tick();
    expect(session.progress().placementDone).toBe(false);
    expect(lastFrame()).toContain("Verb forms");
    expect(lastFrame()).toContain("The poet praises the queen.");

    // Fail that one too, and the run is out of areas to ask about.
    stdin.write("\r");
    await tick();
    stdin.write("1");
    await tick();
    expect(session.progress().placementDone).toBe(true);
    // Nothing was claimed as known, so study begins at chapter one.
    expect(session.progress().knownSections).toEqual([]);

    // Now the first new topic: grammar drawer + English prompt + input box.
    expect(lastFrame()).toContain("First declension nouns");
    expect(lastFrame()).toContain("The girl loves the rose.");
    expect(lastFrame()).toContain(testProfile.ui.promptDirection);

    // Write a Latin answer and submit it.
    stdin.write("puella rosa amat"); // deliberately imperfect (rosa vs rosam)
    await tick();
    stdin.write("\r");
    await tick();
    // The comparison shows the student's answer and the correct one.
    expect(lastFrame()).toContain("your answer");
    expect(lastFrame()).toContain("puella rosa amat");
    expect(lastFrame()).toContain("correct");
    expect(lastFrame()).toContain("puella rosam amat");

    // Record a word from the answer.
    stdin.write("v");
    await tick();
    stdin.write("manibus");
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Saved: manus, manūs (f)");
    expect(session.progress().vocabCards["v-manus"]).toBeDefined();

    // Self-grade (2 = faltered) -> vocab is now due, so a vocab review follows.
    stdin.write("2");
    await tick();
    expect(session.progress().topicCards["ag-decl1"]).toBeDefined();
    expect(lastFrame()).toContain("Vocabulary review");
    // English on the front; the Latin citation is what you have to produce.
    expect(lastFrame()).toContain("hand");
    expect(lastFrame()).not.toContain("manus, manūs (f)");

    // Reveal the citation, grade it -> advance to the second topic.
    stdin.write(" ");
    await tick();
    expect(lastFrame()).toContain("manus, manūs (f)");
    stdin.write("3");
    await tick();
    expect(lastFrame()).toContain("Second declension nouns");
    expect(lastFrame()).toContain("The master frees the slave.");

    unmount();
  });

  it("opens the grammar map, walks it, and quizzes the chosen topic", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    // Straight into the first new topic; answer it to reach the graded screen.
    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("correct");

    // `m` opens the map, parked on the topic being studied (§ 34).
    stdin.write("m");
    await tick();
    expect(lastFrame()).toContain("Grammar map");
    expect(lastFrame()).toContain("Nouns");
    expect(lastFrame()).toContain("Verb forms");
    expect(lastFrame()).toContain("§ 34");
    // The cursor is on the first of the two noun topics, and the bar says so.
    expect(lastFrame()).toContain("topic 1 of 2");

    // Right arrow walks one topic along the bar.
    stdin.write("\u001B[C");
    await tick();
    expect(lastFrame()).toContain("Second declension nouns");
    expect(lastFrame()).toContain("not started");

    // Down arrow jumps to the next family.
    stdin.write("\u001B[B");
    await tick();
    expect(lastFrame()).toContain("Present indicative active");

    // Enter quizzes that topic immediately, teaching the rule first.
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("The present stem takes the personal endings.");
    expect(lastFrame()).toContain(testProfile.ui.promptDirection);
    expect(lastFrame()).toContain("The poet praises the queen.");

    // Grading it creates the card and starts its mastery score.
    stdin.write("\r");
    await tick();
    stdin.write("3");
    await tick();
    expect(session.progress().topicMastery["ag-verb-pres"]).toBe(2);

    // Enter is a look ahead and leaves nothing behind, so the loop picks up
    // where it was. `f` is the key that moves your place — see below.
    expect(lastFrame()).toContain("The girl loves the rose.");
    expect(session.progress().frontiers).toEqual({});

    unmount();
  });

  it("names every family in full and cycles through them", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("m");
    await tick();

    // Every family is on screen, one per line, said the way a student would
    // say it — no "Ptcl", no "A-syntax".
    for (const name of [
      "Nouns",
      "Adjectives & adverbs",
      "Pronouns",
      "Verb forms",
      "Particles",
      "Noun syntax",
      "Adjective & pronoun syntax",
      "Verb syntax",
      "Word-order & style",
    ]) {
      expect(lastFrame()).toContain(name);
    }

    // Up from the first populated family wraps round to the last one, rather
    // than dead-ending. (The fixture populates nouns and verb-forms only.)
    stdin.write("\u001B[A");
    await tick();
    expect(lastFrame()).toContain("Present indicative active");

    // And down from there comes back to the first.
    stdin.write("\u001B[B");
    await tick();
    expect(lastFrame()).toContain("First declension nouns");

    unmount();
  });

  it("escapes the map back to the question", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("m");
    await tick();
    expect(lastFrame()).toContain("Grammar map");

    stdin.write("\u001B");
    await tick();
    expect(lastFrame()).not.toContain("Grammar map");
    expect(lastFrame()).toContain("your answer");
    expect(lastFrame()).toContain("puella rosam amat");

    unmount();
  });

  it("shows the topic's earlier answers on demand, and hides them again", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    // A run at this topic three days ago, before this session started.
    session.recordAttempt(
      "ag-decl1",
      {
        prompt: "The queen praises the sailor.",
        answer: "rēgīna nautam laudat",
        submitted: "rēgīna nauta laudat",
        rating: 2,
      },
      new Date(Date.now() - 3 * 86_400_000),
    );

    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    // Not in the way until it is asked for — but the hint says it is there.
    expect(lastFrame()).not.toContain("Earlier on");
    expect(lastFrame()).toContain("h earlier");

    stdin.write("h");
    await tick();
    const frame = lastFrame()!;
    expect(frame).toContain("Earlier on First declension nouns — 1 answer");
    expect(frame).toContain("3 days ago · graded hard");
    expect(frame).toContain("The queen praises the sailor.");
    expect(frame).toContain("you     rēgīna nauta laudat");
    expect(frame).toContain("correct rēgīna nautam laudat");
    // The question it belongs to is still on screen underneath.
    expect(frame).toContain("The girl loves the rose.");

    // The grammar drawer takes the same space, so opening it closes this.
    stdin.write("g");
    await tick();
    expect(lastFrame()).not.toContain("Earlier on");
    expect(lastFrame()).toContain("First-declension nouns end in -a.");

    stdin.write("h");
    await tick();
    expect(lastFrame()).toContain("Earlier on");
    stdin.write("h");
    await tick();
    expect(lastFrame()).not.toContain("Earlier on");

    // Grading adds this answer to the trail, for the next time the topic comes up.
    stdin.write("3");
    await tick();
    const trail = session.attemptsFor("ag-decl1");
    expect(trail).toHaveLength(2);
    expect(trail[0]).toMatchObject({
      prompt: "The girl loves the rose.",
      answer: "puella rosam amat",
      submitted: "puella rosam amat",
      rating: 3,
    });
    expect(storage.saved.attempts["ag-decl1"]).toHaveLength(2);

    unmount();
  });

  // --- taking things back ---------------------------------------------------
  //
  // Three keypresses drive the whole loop, so all three are pressed by mistake:
  // `v` into a recording you did not want, Enter before the answer is finished,
  // and a self-grade on the wrong number. None of them should be a dead end.

  it("escapes a vocabulary recording opened by mistake", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();

    stdin.write("v");
    await tick();
    expect(lastFrame()).toContain("Record vocabulary");
    expect(lastFrame()).toContain("Esc cancel");

    stdin.write("\u001B");
    await tick();
    expect(lastFrame()).not.toContain("Record vocabulary");
    // Back on the answer, with nothing recorded.
    expect(lastFrame()).toContain("your answer");
    expect(lastFrame()).toContain("puella rosam amat");
    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);

    // Enter on an empty box is the other way out, and no more an error.
    stdin.write("v");
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).not.toContain("Record vocabulary");
    expect(lastFrame()).not.toContain("No dictionary match");

    unmount();
  });

  it("goes back to the answer box when Enter came too early", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosa"); // still being written
    await tick();
    stdin.write("\r"); // …and submitted by accident
    await tick();
    expect(lastFrame()).toContain("your answer");
    expect(lastFrame()).toContain("u keep typing");

    stdin.write("u");
    await tick();
    // Back to typing, the half-written answer intact and the cursor after it.
    expect(lastFrame()).not.toContain("your answer");
    expect(lastFrame()).toContain("puella rosa");
    expect(lastFrame()).toContain("Enter submit");

    stdin.write("m amat");
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("your answer");
    expect(lastFrame()).toContain("puella rosam amat");
    // Nothing was graded on the way, so nothing was written down.
    expect(session.progress().topicCards["ag-decl1"]).toBeUndefined();

    unmount();
  });

  it("takes back a self-grade given by mistake, schedule and trail with it", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("1"); // meant 4
    await tick();

    // The grade landed and the next topic is up.
    expect(session.progress().topicMastery["ag-decl1"]).toBe(1);
    expect(lastFrame()).toContain("Second declension nouns");
    expect(lastFrame()).toContain("^Z undo grade");

    stdin.write("\u001A"); // ^Z
    await tick();

    // The question is back, exactly as it was left.
    expect(lastFrame()).toContain("First declension nouns");
    expect(lastFrame()).toContain("The girl loves the rose.");
    expect(lastFrame()).toContain("puella rosam amat");
    expect(lastFrame()).toContain("Grade taken back");
    // …and so is the engine: no card, no mastery, no attempt, nothing saved.
    expect(session.progress().topicCards["ag-decl1"]).toBeUndefined();
    expect(session.progress().topicMastery["ag-decl1"]).toBeUndefined();
    expect(session.attemptsFor("ag-decl1")).toHaveLength(0);
    expect(storage.saved.topicMastery["ag-decl1"]).toBeUndefined();

    // One grade deep and no further: with that one taken back, there is
    // nothing older waiting behind it.
    stdin.write("u"); // back to the box…
    await tick();
    stdin.write("\u001A");
    await tick();
    expect(lastFrame()).toContain("Nothing to take back");

    // Re-submit and grade it properly: the grade applies once, not twice.
    stdin.write("\r");
    await tick();
    stdin.write("4");
    await tick();
    expect(session.progress().topicMastery["ag-decl1"]).toBe(2);
    expect(session.attemptsFor("ag-decl1")).toHaveLength(1);
    expect(session.attemptsFor("ag-decl1")[0]).toMatchObject({ rating: 4 });

    unmount();
  });

  it("leaves the answer being written alone when there is nothing to take back", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam");
    await tick();
    stdin.write("\u001A"); // ^Z reaches the box as a plain "z"
    await tick();
    expect(lastFrame()).toContain("Nothing to take back");

    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("puella rosam");
    expect(lastFrame()).not.toContain("puella rosamz");

    unmount();
  });

  // Bennett's sections run to hundreds of lines. Every one of them has to be
  // readable: no clipping, no ellipsis standing in for the rest of the rule.
  const longText = Array.from({ length: 90 }, (_, i) => `rule line ${i + 1}`).join("\n");
  const longFixture: ContentData = {
    ...fixture,
    grammar: [{ ...fixture.grammar[0]!, text: longText }, ...fixture.grammar.slice(1)],
  };

  it("pages the grammar drawer through a long section, ellipsis-free", async () => {
    const content = new Content(longFixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    // A new topic teaches first, so the drawer opens at the top of the section.
    await tick();
    expect(lastFrame()).toContain("rule line 1");
    expect(lastFrame()).not.toContain("rule line 90");
    // The drawer says where the reader is, and never trails off into an
    // ellipsis standing in for text it will not show. The count is of screen
    // lines, which the blank lines between blocks put above the 90 source ones.
    const total = Number(lastFrame()!.match(/of (\d+)/)![1]);
    expect(total).toBeGreaterThanOrEqual(90);
    const drawer = lastFrame()!.split(testProfile.ui.promptDirection)[0]!;
    expect(drawer).not.toContain("…");

    // One line down, mid-answer: the window moves on.
    stdin.write("\u001B[B");
    await tick();
    expect(lastFrame()).toContain("rule line 2");
    expect(lastFrame()).toContain("lines 2–");

    // Paging reaches the end of the section — however many pages that takes.
    for (let i = 0; i < total && !lastFrame()!.includes("· end"); i++) {
      stdin.write("\u001B[6~");
      await tick();
    }
    expect(lastFrame()).toContain("rule line 90");
    expect(lastFrame()).toContain("end");

    // Paging never runs off the bottom.
    stdin.write("\u001B[6~");
    await tick();
    expect(lastFrame()).toContain("rule line 90");

    unmount();
  });

  // Browsing the map should show each topic's section on the same terms. The
  // three sections here are the shapes the syllabus actually holds: a paradigm
  // table of many short lines, an unbroken paragraph of prose, and a one-liner.
  const shapesFixture: ContentData = {
    ...fixture,
    grammar: [
      { ...fixture.grammar[0]!, text: "amō\namās\namat\namāmus\namātis\namant\namābam" },
      { ...fixture.grammar[1]!, text: "the girl loves the rose in the garden ".repeat(40).trim() },
      { ...fixture.grammar[2]!, text: "Deponent verbs are passive in form." },
    ],
  };

  it("gives every topic the same window on its section as the cursor moves", async () => {
    const content = new Content(shapesFixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("m");
    await tick();

    const heights: number[] = [];
    const previews: string[] = [];
    for (let i = 0; i < shapesFixture.grammar.length; i++) {
      const frame = lastFrame()!;
      heights.push(frame.split("\n").length);
      previews.push(frame);
      stdin.write("\u001B[C"); // → next topic
      await tick();
    }

    // The cursor really moved: each topic showed its own section.
    expect(previews[0]).toContain("amās");
    expect(previews[1]).toContain("the girl loves the rose");
    expect(previews[2]).toContain("Deponent verbs are passive in form.");

    // Nothing below the preview shifted on the way — the table does not get a
    // handful of words where the prose gets a paragraph.
    expect(new Set(heights).size).toBe(1);

    // The one-liner is shown whole, and says so rather than promising more.
    expect(previews[2]).toContain("all of § 174");
    expect(previews[2]).not.toContain("read § 174 in full");
    // The long ones point at the reader.
    expect(previews[0]).toContain("read § 34 in full");
    expect(previews[1]).toContain("read § 35 in full");

    unmount();
  });

  it("reads the section under the map cursor in full", async () => {
    const content = new Content(longFixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("m");
    await tick();
    // The map previews the section and says where the rest of it is.
    expect(lastFrame()).toContain("read § 34 in full");

    stdin.write("g");
    await tick();
    expect(lastFrame()).not.toContain("Grammar map");
    expect(lastFrame()).toContain("rule line 1");

    for (let i = 0; i < 20; i++) {
      stdin.write("\u001B[6~");
      await tick();
    }
    expect(lastFrame()).toContain("rule line 90");

    // Esc goes back to the map, not out of it.
    stdin.write("\u001B");
    await tick();
    expect(lastFrame()).toContain("Grammar map");

    unmount();
  });
});

describe("the schedule, the question bank and the vocabulary list", () => {
  /** Study up to the compare screen, which is where every extra key lives. */
  async function answered(session: Session, content: Content) {
    const storage = new MemoryStorage();
    const rendered = render(
      <App session={session} content={content} storage={storage} />,
    );
    await tick();
    rendered.stdin.write("puella rosam amat");
    await tick();
    rendered.stdin.write("\r");
    await tick();
    return { ...rendered, storage };
  }

  it("shows what is coming back, and closes again", async () => {
    const content = new Content(fixture, testProfile);
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    // A topic already graded easy, so there is something scheduled to look at.
    session.gradeTopic("ag-decl1", 4);
    const { lastFrame, stdin, unmount } = await answered(session, content);

    stdin.write("s");
    await tick();

    const frame = lastFrame()!;
    expect(frame).toContain("Coming up");
    expect(frame).toContain("First declension nouns");
    expect(frame).toMatch(/in \d+ days|tomorrow/);

    stdin.write(ESC);
    await tick();
    expect(lastFrame()).not.toContain("Coming up");

    unmount();
  });

  it("lists every question of a topic with its answer and what was written", async () => {
    const content = new Content(fixture, testProfile);
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = await answered(session, content);
    // Graded hard, so the answer is on the record; the loop then moves to the
    // next topic, and answering it brings the map key back within reach.
    stdin.write("2");
    await tick();
    stdin.write("dominus servum līberat");
    await tick();
    stdin.write("\r");
    await tick();

    // The bank is reached from the map: left one topic, back to the first.
    stdin.write("m");
    await tick();
    stdin.write("[D");
    await tick();
    stdin.write("a");
    await tick();

    const frame = lastFrame()!;
    expect(frame).toContain("All questions on First declension nouns");
    expect(frame).toContain("1. The girl loves the rose.");
    expect(frame).toContain("puella rosam amat"); // the reference
    expect(frame).toContain("graded hard"); // and the attempt under it

    // Esc returns to the map rather than out of everything.
    stdin.write(ESC);
    await tick();
    expect(lastFrame()).toContain("Grammar map");

    unmount();
  });

  it("edits a recorded word without disturbing its schedule", async () => {
    const content = new Content(fixture, testProfile);
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = await answered(session, content);

    // Record a word, then open the list of them.
    stdin.write("v");
    await tick();
    stdin.write("manibus");
    await tick();
    stdin.write("\r");
    await tick();
    session.gradeVocab("v-manus", 3);
    const scheduled = session.vocabCard("v-manus")!.fsrs.due;

    stdin.write("V");
    await tick();
    expect(lastFrame()).toContain("Vocabulary — 1 word");
    expect(lastFrame()).toContain("manus, manūs (f)");

    stdin.write("\r"); // edit the word under the cursor
    await tick();
    expect(lastFrame()).toContain("Edit word");
    // The citation field opens holding what is there; append to it.
    stdin.write(", 4th declension");
    await tick();
    stdin.write("\r");
    await tick();

    const card = session.vocabCard("v-manus")!;
    expect(card.citation).toBe("manus, manūs (f), 4th declension");
    expect(card.gloss).toBe("hand");
    // An edit is not a review: the card keeps its place in the queue.
    expect(card.fsrs.due).toBe(scheduled);
    expect(card.fsrs.reps).toBe(1);
    expect(lastFrame()).toContain("Saved manus, manūs (f), 4th declension.");

    unmount();
  });

  it("takes two presses to delete a word", async () => {
    const content = new Content(fixture, testProfile);
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    const { lastFrame, stdin, unmount } = await answered(session, content);
    stdin.write("v");
    await tick();
    stdin.write("manibus");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("V");
    await tick();

    stdin.write("x");
    await tick();
    // One press asks; the word is still there.
    expect(lastFrame()).toContain("Press x again to delete manus, manūs (f).");
    expect(session.vocabCard("v-manus")).toBeDefined();

    stdin.write("x");
    await tick();
    expect(session.vocabCard("v-manus")).toBeUndefined();
    expect(lastFrame()).toContain("Deleted manus, manūs (f).");

    unmount();
  });

  it("keeps placement when a word is recorded, and resumes it after a restart", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, undefined);
    const first = render(<App session={session} content={content} storage={storage} />);

    await tick();
    expect(first.lastFrame()).toContain("Placement 1/");
    // Pass the first probe, so the run is genuinely under way. Passing narrows
    // within the same family rather than moving to the next.
    first.stdin.write("\r");
    await tick();
    first.stdin.write("3");
    await tick();
    expect(first.lastFrame()).toContain("Nouns, narrowing");

    // Recording a word is an aside, not an exit.
    first.stdin.write("\r");
    await tick();
    first.stdin.write("v");
    await tick();
    first.stdin.write("manibus");
    await tick();
    first.stdin.write("\r");
    await tick();
    expect(session.vocabCard("v-manus")).toBeDefined();
    expect(first.lastFrame()).toContain("Nouns, narrowing");
    first.unmount();

    // And the run outlives the process: passing a probe fills knownSections,
    // which used to make a restart look like a finished placement.
    const reopened = new Session(
      content,
      JSON.parse(JSON.stringify(session.progress())),
    );
    const second = render(
      <App session={reopened} content={content} storage={storage} />,
    );
    await tick();
    expect(second.lastFrame()).toContain("Nouns, narrowing");
    second.unmount();
  });
});

/** The keys that reach the answer box's own handler as raw bytes. */
const CTRL_N = "";
const DOWN = "[B";
const RIGHT = "[C";

/**
 * The words of the question, and the map from anywhere.
 *
 * Both exist for the same student: a beginner meets a question full of words
 * nobody has taught them, and until now the only thing to do about it was to
 * submit nothing and grade yourself `again`.
 */
describe("the question's vocabulary, and the map from anywhere", () => {
  /** Straight past placement, into the first topic's question. */
  const studying = () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    return {
      session,
      ...render(<App session={session} content={content} storage={storage} />),
    };
  };

  it("shows the words behind the question on Tab, and hides them again", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    expect(lastFrame()).toContain("The girl loves the rose.");
    // Hidden until asked for: that is the whole point of the feature.
    expect(lastFrame()).not.toContain("Vocabulary — ");

    stdin.write("\t");
    await tick();
    expect(lastFrame()).toContain("Vocabulary — 3 words in this sentence");
    // The English the prompt used, beside the Latin in its dictionary form.
    expect(lastFrame()).toContain("girl");
    expect(lastFrame()).toContain("puella, puellae (f)");
    expect(lastFrame()).toContain("amō, amāre, amāvī, amātum");
    // The prompt says "rose", so the flower beats the more frequent verb.
    expect(lastFrame()).toContain("rosa, rosae (f)");
    expect(lastFrame()).not.toContain("rōdō, rōdere");

    stdin.write("\t");
    await tick();
    expect(lastFrame()).not.toContain("Vocabulary — ");
    unmount();
  });

  it("leaves the half-written answer alone while the words are consulted", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    stdin.write("puella ros");
    await tick();
    stdin.write("\t");
    await tick();
    // Tab reaches this component and never the answer box, so no tab character
    // lands in the answer.
    expect(lastFrame()).toContain("puella ros");
    stdin.write("am amat");
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("puella rosam amat");
    unmount();
  });

  it("opens the map mid-answer on ^N and gives the answer back untouched", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    stdin.write("puella ros");
    await tick();

    stdin.write(CTRL_N);
    await tick();
    expect(lastFrame()).toContain("Grammar map");

    stdin.write(ESC);
    await tick();
    expect(lastFrame()).toContain(testProfile.ui.promptDirection);
    // The `n` of ^N is swallowed on its way into the box, the way ^Z's `z` is.
    expect(lastFrame()).toContain("puella ros");
    expect(lastFrame()).not.toContain("puella rosn");
    unmount();
  });

  it("asks twice before a map quiz throws away an answer being written", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    stdin.write("puella ros");
    await tick();
    stdin.write(CTRL_N);
    await tick();
    stdin.write(DOWN); // to a topic that is not the one being answered
    await tick();
    expect(lastFrame()).toContain("Present indicative active");

    // The first Enter warns and serves nothing.
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Press Enter again to leave the answer you are writing");
    expect(lastFrame()).toContain("Grammar map");

    // The second goes ahead.
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("The poet praises the queen.");
    unmount();
  });

  it("forgets the warning when the cursor moves to a different topic", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    stdin.write("puella ros");
    await tick();
    stdin.write(CTRL_N);
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Press Enter again");

    // The warning named a topic; moving renames it, so it is asked again.
    stdin.write(RIGHT);
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Press Enter again");
    expect(lastFrame()).toContain("Grammar map");
    unmount();
  });

  it("reaches the map during placement, and ends the run rather than lying about it", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = new Session(content, undefined);
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );
    await tick();
    expect(lastFrame()).toContain("Placement 1/");

    // Until now `m` was suppressed for the whole of placement.
    stdin.write(CTRL_N);
    await tick();
    expect(lastFrame()).toContain("Grammar map");

    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Press Enter again to stop the placement test");
    stdin.write("\r");
    await tick();
    // The badge cannot go on saying "placement" over a topic that was never a
    // probe — the next grade would be scored as one.
    expect(lastFrame()).not.toContain("Placement 1/");
    expect(session.progress().placementDone).toBe(true);
    unmount();
  });

  it("brings the question back with its words open when w is pressed in the map", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("m");
    await tick();
    expect(lastFrame()).toContain("Grammar map");

    // A pane over a pane reads as a mistake; the sentence is what was wanted.
    stdin.write("w");
    await tick();
    expect(lastFrame()).toContain("Vocabulary — 3 words in this sentence");
    expect(lastFrame()).toContain("The girl loves the rose.");
    unmount();
  });

  it("closes the word list again on the next question", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("w");
    await tick();
    expect(lastFrame()).toContain("Vocabulary — ");

    stdin.write("3");
    await tick();
    // A new question is a new sentence, and the crib for the last one is not it.
    expect(lastFrame()).not.toContain("Vocabulary — ");
    unmount();
  });

  it("says so rather than doing nothing where there is no question to have words for", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    // Grade the whole deck out, to the screen with no question on it.
    stdin.write("puella rosam amat");
    await tick();
    for (const key of ["\r", "3", "\r", "3", "\r", "3"]) {
      stdin.write(key);
      await tick();
    }
    expect(lastFrame()).toContain("Nothing due");

    stdin.write("w");
    await tick();
    // A key that does nothing at all reads as a broken key.
    expect(lastFrame()).toContain("The word list belongs to a question");
    expect(lastFrame()).not.toContain("Vocabulary — ");
    unmount();
  });

  it("puts back the screen the map was opened over, even through the schedule", async () => {
    const { lastFrame, stdin, unmount } = studying();
    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("3"); // grade on through to the end of the deck
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("3");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("3");
    await tick();
    expect(lastFrame()).toContain("Nothing due");

    stdin.write("m");
    await tick();
    stdin.write("s");
    await tick();
    expect(lastFrame()).toContain("Coming up");
    stdin.write(ESC);
    await tick();
    expect(lastFrame()).toContain("Grammar map");
    stdin.write(ESC);
    await tick();
    // It came from `done`, so `done` is where it goes back to — not the grading
    // bar hanging over a question that is not there.
    expect(lastFrame()).toContain("Nothing due");
    expect(lastFrame()).not.toContain("self-grade");
    unmount();
  });
});

/**
 * A syllabus with room to move in: two noun topics, two verb ones, and a bank
 * on the first noun topic that four questions cannot exhaust.
 */
const deep: ContentData = {
  grammar: [
    { id: "d1", ref: "34", title: "First declension nouns", family: "nouns", text: "-a.", order: 10 },
    { id: "d2", ref: "35", title: "Second declension nouns", family: "nouns", text: "-us.", order: 20 },
    { id: "v1", ref: "174", title: "Present indicative active", family: "verb-forms", text: "The present stem.", order: 130 },
    { id: "v2", ref: "180", title: "Imperfect indicative active", family: "verb-forms", text: "The imperfect stem.", order: 140 },
  ],
  tests: {
    d1: [1, 2, 3].map((n) => ({
      id: `d1-t${n}`,
      sectionId: "d1",
      questions: [
        { prompt: `d1 question ${n}a`, answer: "aa", kind: "translate-en-la" as const, vocab: [] },
        { prompt: `d1 question ${n}b`, answer: "bb", kind: "translate-en-la" as const, vocab: [] },
      ],
    })),
    d2: [{ id: "d2-t1", sectionId: "d2", questions: [{ prompt: "d2 question", answer: "cc", kind: "translate-en-la" as const, vocab: [] }] }],
    v1: [{ id: "v1-t1", sectionId: "v1", questions: [{ prompt: "v1 question", answer: "dd", kind: "translate-en-la" as const, vocab: [] }] }],
    v2: [{ id: "v2-t1", sectionId: "v2", questions: [{ prompt: "v2 question", answer: "ee", kind: "translate-en-la" as const, vocab: [] }] }],
  },
};

describe("the three ways to move through the book", () => {
  const open = () => {
    const content = new Content(deep, testProfile);
    const session = new Session(content, { ...emptyProgress(), placementDone: true });
    return {
      session,
      ...render(<App session={session} content={content} storage={new MemoryStorage()} />),
    };
  };

  /** Answer whatever is on screen and grade it. */
  const answer = async (stdin: { write(s: string): void }, rating = "3") => {
    stdin.write("\r");
    await tick();
    stdin.write(rating);
    await tick();
  };

  it("carries on from the topic f was pressed on, not from the beginning", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    // The sweep starts at chapter one, as it always has.
    expect(lastFrame()).toContain("d1 question");

    stdin.write(CTRL_N); // the map, from the answer box
    await tick();
    stdin.write(DOWN); // down to the verbs
    await tick();
    expect(lastFrame()).toContain("Present indicative active");

    // From a half-written answer `f` costs something, so it is asked twice —
    // the idiom Enter already uses.
    stdin.write("f");
    await tick();
    expect(lastFrame()).toContain("Press f again");
    stdin.write("f");
    await tick();
    expect(session.progress().frontiers).toEqual({ "verb-forms": "v1" });
    expect(lastFrame()).toContain("v1 question");
    expect(lastFrame()).toContain("on Verb forms");

    // The bug this fixes: the next topic used to be the first of the book.
    await answer(stdin);
    expect(lastFrame()).toContain("v2 question");

    // Only when the area is worked out does the sweep pick the rest up.
    await answer(stdin);
    expect(lastFrame()).toContain("d1 question");
    expect(lastFrame()).not.toContain("on Verb forms");
    unmount();
  });

  it("stays on a topic when . says so, and works its bank out", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    expect(lastFrame()).toContain("d1 question");

    // Answer, and say "not yet" before grading. The round in hand is not
    // thrown away: the second question of the test still comes.
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain(". more of this topic");
    stdin.write(".");
    await tick();
    expect(lastFrame()).toContain("Staying on “First declension nouns”");
    stdin.write("3");
    await tick();
    expect(lastFrame()).toContain("d1 question");
    expect(lastFrame()).toContain("on First declension nouns");

    // Six questions in the bank, one answered: five more sweep it out, and no
    // question is served twice while any of the bank is untouched.
    const asked = new Set<string>();
    for (let i = 0; i < 5; i++) {
      asked.add((lastFrame() ?? "").match(/d1 question \d[ab]/)?.[0] ?? "");
      await answer(stdin);
    }
    expect(asked.size).toBe(5);
    expect(session.coverage("d1")).toEqual({ answered: 6, total: 6 });

    // Nothing left to practise, so the drill lets go and the book resumes.
    expect(lastFrame()).toContain("d2 question");
    expect(lastFrame()).not.toContain("on First declension nouns");
    unmount();
  });

  it("costs a topic one review per round of questions, not one per question", async () => {
    const { session, stdin, unmount } = open();
    await tick();
    await answer(stdin); // question 1 of the served test
    await answer(stdin); // question 2 of the same test
    expect(session.progress().topicCards.d1!.reps).toBe(1);
    // Mastery still counts every question answered.
    expect(session.progress().topicMastery.d1).toBe(3);
    unmount();
  });
});
