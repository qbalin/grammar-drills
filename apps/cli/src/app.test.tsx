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
    { id: "ag-decl1", ref: "34", title: "First declension nouns", text: "First-declension nouns end in -a.", order: 10 },
    { id: "ag-decl2", ref: "35", title: "Second declension nouns", text: "Second-declension nouns end in -us.", order: 20 },
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
    expect(lastFrame()).toContain("manus, manūs (f)");

    // Reveal gloss, grade it -> advance to the second topic.
    stdin.write(" ");
    await tick();
    expect(lastFrame()).toContain("hand");
    stdin.write("3");
    await tick();
    expect(lastFrame()).toContain("Second declension nouns");
    expect(lastFrame()).toContain("The master frees the slave.");

    unmount();
  });
});
