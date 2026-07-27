import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import {
  Content,
  Session,
  emptyProgress,
  type ContentData,
  type Progress,
  type StorageAdapter,
} from "@latin-tutor/core";
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
    const content = new Content(fixture);
    const storage = new MemoryStorage();
    const session = new Session(content, undefined);
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    // Placement runs first on a fresh deck.
    await tick();
    expect(lastFrame()).toContain("Placement 1/");
    expect(lastFrame()).toContain("The girl loves the rose.");
    stdin.write("nesciō"); // "I don't know"
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("correct");
    // Grade 1 = don't know it yet -> placement ends, study starts here.
    stdin.write("1");
    await tick();
    expect(session.progress().placementDone).toBe(true);

    // Now the first new topic: grammar drawer + English prompt + input box.
    expect(lastFrame()).toContain("First declension nouns");
    expect(lastFrame()).toContain("The girl loves the rose.");
    expect(lastFrame()).toContain("Translate into Latin");

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
    const content = new Content(fixture);
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
    expect(lastFrame()).toContain("Translate into Latin");
    expect(lastFrame()).toContain("The poet praises the queen.");

    // Grading it creates the card and starts its mastery score.
    stdin.write("\r");
    await tick();
    stdin.write("3");
    await tick();
    expect(session.progress().topicMastery["ag-verb-pres"]).toBe(2);

    unmount();
  });

  it("names every family in full and cycles through them", async () => {
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(longFixture);
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
    const drawer = lastFrame()!.split("Translate into Latin")[0]!;
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
    const content = new Content(shapesFixture);
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
    const content = new Content(longFixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
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
    const content = new Content(fixture);
    const storage = new MemoryStorage();
    const session = new Session(content, undefined);
    const first = render(<App session={session} content={content} storage={storage} />);

    await tick();
    expect(first.lastFrame()).toContain("Placement 1/");
    // Pass the first probe, so the run is genuinely under way.
    first.stdin.write("\r");
    await tick();
    first.stdin.write("3");
    await tick();
    expect(first.lastFrame()).toContain("Placement 2/");

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
    expect(first.lastFrame()).toContain("Placement 2/");
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
    expect(second.lastFrame()).toContain("Placement 2/");
    second.unmount();
  });
});
