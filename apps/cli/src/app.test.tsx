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
    expect(lastFrame()).toContain("Verbs");
    expect(lastFrame()).toContain("§ 34");

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
    // ellipsis standing in for text it will not show.
    expect(lastFrame()).toContain("of 90");
    const drawer = lastFrame()!.split("Translate into Latin")[0]!;
    expect(drawer).not.toContain("…");

    // One line down, mid-answer: the window moves on.
    stdin.write("\u001B[B");
    await tick();
    expect(lastFrame()).toContain("rule line 2");
    expect(lastFrame()).toContain("lines 2–");

    // Paging reaches the end of the section.
    for (let i = 0; i < 20; i++) {
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
