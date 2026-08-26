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
    // The nominative, so there is a word standing in the student's own wrong
    // answer and nowhere else — which is how a context learns whose sentence
    // it is when there was no press to say so.
    rosa: [{ lemma: "rosa", citation: "rosa, rosae (f)", gloss: "rose", pos: "noun", rank: 4845 }],
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

/**
 * Wait for the frame to say something, rather than for a duration. Ink renders
 * on its own schedule and a loaded machine can take longer than any fixed sleep
 * to put a keypress on screen — a `tick` before the assertion is a race that CI
 * loses now and then. Fails with the frame it gave up on.
 *
 * **It ends in a `tick`, and that is not a rounding error.** A matched frame
 * proves React rendered; it does not prove Ink has re-registered its key
 * handlers, which it does in an effect. So a caller that waits here and then
 * writes a key is writing into the gap between the two — and input that arrives
 * there is not queued, it is gone. That is `press`'s whole reason for taking
 * two waits, and every `await until(...)` followed by a `stdin.write` was the
 * same race with only the first half of the fix.
 *
 * It cost a CI failure twice: the drawer-paging test waited for "rule line 1",
 * pressed ↓ into that gap, and sat at "lines 1–9" until the next `until` gave
 * up. The commit before this one moved that test's *first* wait from a flat
 * `tick` to an `until` and left the second half racing.
 */
const until = async (frame: () => string | undefined, want: string) => {
  // Three seconds, not one. A cold GitHub runner starting a fresh worker is
  // slower than any machine this was calibrated on, and the cost of a generous
  // ceiling is nothing — it is only ever reached when the test is about to
  // fail anyway, and then it buys a real failure instead of a flake.
  for (let i = 0; i < 300; i++) {
    if (frame()?.includes(want)) return tick();
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`frame never showed ${JSON.stringify(want)}:\n\n${frame()}`);
};

/**
 * Send input, then wait until the screen it produced is ready for the next.
 *
 * Two waits, and both are needed. The frame proves React rendered; the tick
 * after it lets Ink re-register the key handlers, which it does in an effect.
 * Input arriving between those two is read by the *previous* render's handler
 * — Enter runs an `onSubmit` still closed over the empty box, so the answer
 * vanishes and the graded screen reads "your answer —", and a letter meant for
 * a text box is taken as the shortcut it was on the screen before. A fixed
 * sleep covered both on a quiet machine and lost the race on a loaded one.
 */
const press = async (
  stdin: { write(s: string): void },
  frame: () => string | undefined,
  keys: string,
  /** Something the screen those keys produce says. Defaults to the keys. */
  want = keys,
) => {
  // Re-sent if a whole second passes with no sign of it. Input that arrives
  // before Ink has registered a handler is not queued, it is gone — which is
  // what happens to the first keystrokes after `render`, whose handlers are
  // still in an unflushed mount effect. A write is synchronous into the
  // stream, so a second of silence means it was dropped rather than delayed,
  // and sending it again cannot double up.
  for (let attempt = 0; attempt < 3; attempt++) {
    stdin.write(keys);
    for (let i = 0; i < 100; i++) {
      if (frame()?.includes(want)) return tick();
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  throw new Error(`frame never showed ${JSON.stringify(want)}:\n\n${frame()}`);
};

/**
 * The same, but sent exactly once.
 *
 * `press` re-sends a key it sees no sign of, which is right for the mount race
 * it was written for and wrong for anything that counts presses: a slow frame
 * during a two-press confirm turns three sends into two deletions. By the time
 * a confirm is on screen the handlers are long registered, so waiting is all
 * that is needed.
 */
const pressOnce = async (
  stdin: { write(s: string): void },
  frame: () => string | undefined,
  keys: string,
  want = keys,
) => {
  stdin.write(keys);
  await until(frame, want);
  return tick();
};

/** What the terminal sends for Esc. */
const ESC = "";

/** The keys that reach the answer box's own handler as raw bytes. */
const CTRL_N = "";
const DOWN = "[B";
const RIGHT = "[C";

/**
 * A session already practising the first topic of its book.
 *
 * The app hands nothing over until a topic is chosen — there is no walk through
 * the book to be resumed — so a scenario about answering questions has to say
 * which questions. Every test below used to get the first topic for free from
 * the walk; this keeps each of them about the thing it is about.
 */
function studying(content: Content, progress: Progress = emptyProgress()) {
  const session = new Session(content, progress);
  const at = content.topicIds()[0];
  if (at && !session.practiseRun()) session.drillTopic(at);
  return session;
}

describe("CLI App (write → compare → self-grade)", () => {
  it("teaches, takes a written answer, records vocab, grades", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = studying(content);
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    // The first new topic: grammar drawer + English prompt + input box.
    await until(lastFrame, "The girl loves the rose.");
    expect(lastFrame()).toContain("The girl loves the rose.");
    expect(lastFrame()).toContain(testProfile.ui.promptDirection);

    // Write a Latin answer and submit it.
    await press(stdin, lastFrame, "puella rosa amat"); // rosa, not rosam
    await press(stdin, lastFrame, "\r", "your answer puella rosa amat");
    // The comparison shows the student's answer and the correct one.
    expect(lastFrame()).toContain("correct");
    expect(lastFrame()).toContain("puella rosam amat");

    // Record a word from the answer. The box has to be on screen before the
    // word is typed: in the graded phase those letters are shortcuts, and the
    // `m` of "manibus" would open the grammar index.
    await press(stdin, lastFrame, "v", "Record vocabulary");
    await press(stdin, lastFrame, "manibus");
    await press(stdin, lastFrame, "\r", "Saved: manus, manūs (f)");
    expect(session.progress().vocabCards["v-manus"]).toBeDefined();

    // Self-grade (2 = faltered). The word is due now, but practice is the
    // errand in hand, so the loop stays on the topic rather than interrupting.
    // This topic holds one question, so the run is worked out and says so.
    stdin.write("2");
    await tick();
    // The round is out of questions, and the topic is not in the pile — so the
    // loop asks rather than filing it. Nothing is scheduled until it is told to.
    expect(lastFrame()).toContain("is not in your reviews");
    expect(session.progress().topicCards["ag-decl1"]).toBeUndefined();
    stdin.write("a");
    await tick();
    expect(session.progress().topicCards["ag-decl1"]).toBeDefined();
    expect(lastFrame()).toContain("All practised");
    expect(lastFrame()).toContain("First declension nouns");

    // `x` is the CLI's switch. The word is what waits.
    stdin.write("x");
    await tick();
    expect(lastFrame()).toContain("Vocabulary review");
    // English on the front; the Latin citation is what you have to produce.
    expect(lastFrame()).toContain("hand");
    expect(lastFrame()).not.toContain("manus, manūs (f)");

    // Reveal the citation and grade it. That was the last review, so the
    // switch throws itself back to the book.
    stdin.write(" ");
    await tick();
    expect(lastFrame()).toContain("manus, manūs (f)");
    stdin.write("3");
    await tick();
    expect(lastFrame()).toContain("exploring");

    unmount();
  });

  it("opens the grammar index, walks it, and quizzes the chosen topic", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = studying(content);
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
    expect(lastFrame()).toContain("Grammar index");
    expect(lastFrame()).toContain("Nouns");
    expect(lastFrame()).toContain("Verb forms");
    expect(lastFrame()).toContain("§ 34");
    // The cursor is on the first of the two noun topics, and the bar says so.
    expect(lastFrame()).toContain("topic 1 of 2");

    // Right arrow walks one topic along the bar.
    stdin.write("\u001B[C");
    await tick();
    expect(lastFrame()).toContain("Second declension nouns");
    expect(lastFrame()).toContain("0/1 questions");

    // Down arrow jumps to the next family.
    stdin.write("\u001B[B");
    await tick();
    expect(lastFrame()).toContain("Present indicative active");

    // Enter stays on that topic and works its questions out, teaching first.
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("The present stem takes the personal endings.");
    expect(lastFrame()).toContain(testProfile.ui.promptDirection);
    expect(lastFrame()).toContain("The poet praises the queen.");

    // Grading it works the round out, and saying yes to the offer puts the
    // topic in the review pile.
    stdin.write("\r");
    await tick();
    stdin.write("3");
    await tick();
    stdin.write("a");
    await tick();
    expect(session.progress().topicCards["ag-verb-pres"]).toBeDefined();

    // And it is a run, so it says so and stays here rather than moving on.
    expect(session.practiseRun()?.sectionId).toBe("ag-verb-pres");

    unmount();
  });

  it("names every family in full and cycles through them", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = studying(content);
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
    const session = studying(content);
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
    expect(lastFrame()).toContain("Grammar index");

    stdin.write("\u001B");
    await tick();
    expect(lastFrame()).not.toContain("Grammar index");
    expect(lastFrame()).toContain("your answer");
    expect(lastFrame()).toContain("puella rosam amat");

    unmount();
  });

  it("shows the topic's earlier answers on demand, and hides them again", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = studying(content);
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
    const session = studying(content);
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
    const session = studying(content);
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
    const session = studying(content);
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

    // The grade landed and the run says it has been through the topic.
    stdin.write("a");
    await tick();
    expect(session.progress().topicCards["ag-decl1"]).toBeDefined();
    expect(lastFrame()).toContain("All practised");
    expect(lastFrame()).toContain("u undo grade");

    stdin.write("u"); // the resting screens spell it out; ^Z is for mid-answer
    await tick();

    // The question is back, exactly as it was left.
    expect(lastFrame()).toContain("First declension nouns");
    expect(lastFrame()).toContain("The girl loves the rose.");
    expect(lastFrame()).toContain("puella rosam amat");
    expect(lastFrame()).toContain("Grade taken back");
    // …and so is the engine: no card, no attempt, nothing saved.
    expect(session.progress().topicCards["ag-decl1"]).toBeUndefined();
    expect(session.attemptsFor("ag-decl1")).toHaveLength(0);
    expect(storage.saved.topicCards["ag-decl1"]).toBeUndefined();

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
    stdin.write("a");
    await tick();
    expect(session.progress().topicCards["ag-decl1"]!.reps).toBe(1);
    expect(session.attemptsFor("ag-decl1")).toHaveLength(1);
    expect(session.attemptsFor("ag-decl1")[0]).toMatchObject({ rating: 4 });

    unmount();
  });

  it("leaves the answer being written alone when there is nothing to take back", async () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = studying(content);
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
    const session = studying(content);
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={storage} />,
    );

    // A new topic teaches first, so the drawer opens at the top of the section.
    //
    // Waited on rather than slept through, and that is the fix for a CI failure
    // rather than a tidy-up. This was `await tick()` — a flat 30 ms — and the
    // keypress below then went to an ink that had not finished mounting on a
    // cold runner, so it was dropped and the drawer sat at "lines 1–9" until
    // `until` gave up a second later. The frame in the failure showed exactly
    // that: rendered, never scrolled.
    await until(lastFrame, "rule line 1");
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
    //
    // `pressOnce` rather than a bare write, and rather than `press`: the
    // handlers are registered by now (see `until`), so one send is enough — and
    // a scroll is counted, so a re-send would move the window two lines and
    // then fail on a frame that never said what the test is about.
    await pressOnce(stdin, lastFrame, DOWN, "lines 2–");
    expect(lastFrame()).toContain("rule line 2");

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
    const session = studying(content);
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
    const session = studying(content);
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
    expect(lastFrame()).not.toContain("Grammar index");
    expect(lastFrame()).toContain("rule line 1");

    for (let i = 0; i < 20; i++) {
      stdin.write("\u001B[6~");
      await tick();
    }
    expect(lastFrame()).toContain("rule line 90");

    // Esc goes back to the map, not out of it.
    stdin.write("\u001B");
    await tick();
    expect(lastFrame()).toContain("Grammar index");

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
    const session = studying(content);
    // A topic already in the pile, so there is something scheduled to look at.
    session.enrolTopic("ag-decl1", 4);
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
    const session = studying(content);
    const { lastFrame, stdin, unmount } = await answered(session, content);
    // Graded hard, so the answer is on the record. This topic holds one
    // question, so the run has been through it — the offer comes first, and
    // declining it leaves the same resting screen it always did.
    await press(stdin, lastFrame, "2", "is not in your reviews");
    await press(stdin, lastFrame, "\r", "All practised");

    // The bank is reached from the map, which opens from the resting screen
    // like anywhere else, parked on the topic just practised.
    await press(stdin, lastFrame, "m", "Grammar index");
    await pressOnce(stdin, lastFrame, "a", "All questions on");

    const frame = lastFrame()!;
    expect(frame).toContain("All questions on First declension nouns");
    expect(frame).toContain("1. The girl loves the rose.");
    expect(frame).toContain("puella rosam amat"); // the reference
    expect(frame).toContain("graded hard"); // and the attempt under it

    // Esc returns to the map rather than out of everything.
    stdin.write(ESC);
    await tick();
    expect(lastFrame()).toContain("Grammar index");

    unmount();
  });

  it("edits a recorded word without disturbing its schedule", async () => {
    const content = new Content(fixture, testProfile);
    const session = studying(content);
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
    const session = studying(content);
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

});

/**
 * The words of the question, and the map from anywhere.
 *
 * Both exist for the same student: a beginner meets a question full of words
 * nobody has taught them, and until now the only thing to do about it was to
 * submit nothing and grade yourself `again`.
 */
describe("the question's vocabulary, and the map from anywhere", () => {
  /** Opened on the first topic's question. */
  const atWork = () => {
    const content = new Content(fixture, testProfile);
    const storage = new MemoryStorage();
    const session = studying(content);
    return {
      session,
      ...render(<App session={session} content={content} storage={storage} />),
    };
  };

  /**
   * A deck with nothing chosen and nothing due, so the resting screen is
   * reachable. It used to take a whole book at the top mastery band, because
   * exploring always had a next section to hand over; nothing is handed over
   * now until a topic is picked, so having picked none is the whole of it.
   */
  const workedOut = () => {
    const content = new Content(fixture, testProfile);
    const session = new Session(content, emptyProgress());
    return {
      session,
      ...render(
        <App session={session} content={content} storage={new MemoryStorage()} />,
      ),
    };
  };

  it("shows the words behind the question on Tab, and hides them again", async () => {
    const { lastFrame, stdin, unmount } = atWork();
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
    const { lastFrame, stdin, unmount } = atWork();
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
    const { lastFrame, stdin, unmount } = atWork();
    await tick();
    stdin.write("puella ros");
    await tick();

    stdin.write(CTRL_N);
    await tick();
    expect(lastFrame()).toContain("Grammar index");

    stdin.write(ESC);
    await tick();
    expect(lastFrame()).toContain(testProfile.ui.promptDirection);
    // The `n` of ^N is swallowed on its way into the box, the way ^Z's `z` is.
    expect(lastFrame()).toContain("puella ros");
    expect(lastFrame()).not.toContain("puella rosn");
    unmount();
  });

  it("asks twice before a map quiz throws away an answer being written", async () => {
    const { lastFrame, stdin, unmount } = atWork();
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
    expect(lastFrame()).toContain("Grammar index");

    // The second goes ahead.
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("The poet praises the queen.");
    unmount();
  });

  it("forgets the warning when the cursor moves to a different topic", async () => {
    const { lastFrame, stdin, unmount } = atWork();
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
    expect(lastFrame()).toContain("Grammar index");
    unmount();
  });

  it("brings the question back with its words open when w is pressed in the map", async () => {
    const { lastFrame, stdin, unmount } = atWork();
    await tick();
    stdin.write("puella rosam amat");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("m");
    await tick();
    expect(lastFrame()).toContain("Grammar index");

    // A pane over a pane reads as a mistake; the sentence is what was wanted.
    stdin.write("w");
    await tick();
    expect(lastFrame()).toContain("Vocabulary — 3 words in this sentence");
    expect(lastFrame()).toContain("The girl loves the rose.");
    unmount();
  });

  it("closes the word list again on the next question", async () => {
    const { lastFrame, stdin, unmount } = atWork();
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
    const { lastFrame, stdin, unmount } = workedOut();
    await tick();
    expect(lastFrame()).toContain("No topic being practised");

    stdin.write("w");
    await tick();
    // A key that does nothing at all reads as a broken key.
    expect(lastFrame()).toContain("The word list belongs to a question");
    expect(lastFrame()).not.toContain("Vocabulary — ");
    unmount();
  });

  it("puts back the screen the map was opened over, even through the schedule", async () => {
    const { lastFrame, stdin, unmount } = workedOut();
    await tick();
    expect(lastFrame()).toContain("No topic being practised");

    stdin.write("m");
    await tick();
    stdin.write("s");
    await tick();
    expect(lastFrame()).toContain("Coming up");
    stdin.write(ESC);
    await tick();
    expect(lastFrame()).toContain("Grammar index");
    stdin.write(ESC);
    await tick();
    // It came from `done`, so `done` is where it goes back to — not the grading
    // bar hanging over a question that is not there.
    expect(lastFrame()).toContain("No topic being practised");
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

describe("the one way onto a topic", () => {
  const open = () => {
    const content = new Content(deep, testProfile);
    const session = studying(content);
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

  it("moves to the topic Enter was pressed on, and stays there", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    expect(lastFrame()).toContain("d1 question");

    stdin.write(CTRL_N); // the map, from the answer box
    await tick();
    stdin.write(DOWN); // down to the verbs
    await tick();
    expect(lastFrame()).toContain("Present indicative active");

    // From a half-written answer Enter costs something, so it is asked twice.
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Press Enter again");
    stdin.write("\r");
    await tick();
    expect(session.practiseRun()?.sectionId).toBe("v1");
    expect(lastFrame()).toContain("v1 question");

    // And it stays: v1 holds one question, so the run is through and says so
    // rather than reading on into v2.
    await answer(stdin);
    await press(stdin, lastFrame, "\r", "All practised");
    expect(lastFrame()).not.toContain("v2 question");
    unmount();
  });

  it("stays on a topic when the index says so, and works its run out", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    expect(lastFrame()).toContain("d1 question");

    // Enter on the index is the CLI's "Practise these": it stays put and
    // works the questions a four-question test never reached.
    stdin.write(CTRL_N);
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Press Enter again");
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("Practising “First declension nouns”");
    expect(lastFrame()).toContain("practising First declension nouns");

    // Six questions in the bank, and the run is for all of them: three rounds
    // of two, and no question served twice while any of them is untouched.
    //
    // Each round lands on the offer, because the topic is not in the pile and
    // saying no is not remembered. Declining carries straight on into the next
    // round, which is the thing to check: a student who keeps saying no still
    // gets the whole run.
    for (let round = 0; round < 3; round++) {
      await answer(stdin);
      await answer(stdin);
      await press(stdin, lastFrame, "\r", round < 2 ? "d1 question" : "All practised");
    }
    expect(session.coverage("d1")).toEqual({ answered: 6, total: 6 });
    expect(session.progress().topicCards).toEqual({});

    // Staying here was an instruction, so the loop stops and says so rather
    // than sliding onto the next topic.
    expect(lastFrame()).not.toContain("d2 question");
    unmount();
  });

  it("costs a topic one review per round of questions, not one per question", async () => {
    const { session, stdin, unmount } = open();
    await tick();
    session.enrolTopic("d1", 3); // in the pile, so a grade has a card to move
    await answer(stdin); // question 1 of the served test
    await answer(stdin); // question 2 of the same test
    expect(session.progress().topicCards.d1!.reps).toBe(2);
    unmount();
  });

  it("asks at the end of a round, and only asks when the topic is not in the pile", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();

    // Two questions is one round, and the round lands on the question.
    await answer(stdin);
    await answer(stdin);
    await until(lastFrame, "is not in your reviews");
    expect(lastFrame()).toMatch(/Press a to add it, and it comes back/);
    expect(session.progress().topicCards).toEqual({});

    // Saying yes writes the card and carries on into the next round.
    stdin.write("a");
    await tick();
    expect(session.progress().topicCards.d1).toBeDefined();

    // Which lands in its turn — and this time there is nothing to ask, so the
    // loop runs straight on rather than stopping to say what it already knows.
    await answer(stdin);
    await answer(stdin);
    expect(lastFrame()).not.toContain("is not in your reviews");
    unmount();
  });

  it("carries on without a card when the offer is declined", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    await answer(stdin);
    await answer(stdin);
    await until(lastFrame, "is not in your reviews");

    stdin.write("\r");
    await tick();
    expect(session.progress().topicCards).toEqual({});
    expect(lastFrame()).not.toContain("is not in your reviews");
    unmount();
  });

  it("puts nothing in the pile for a topic that was only answered", async () => {
    // The friction this replaced: opening the index, trying a page and
    // answering its questions used to cost a card that came due for years.
    const { session, stdin, unmount } = open();
    await tick();
    await answer(stdin);
    await answer(stdin);
    expect(session.progress().topicCards).toEqual({});
    // And the answers are still on the record — it is a schedule that is being
    // withheld, not the work.
    expect(session.everGraded("d1")).toBe(true);
    unmount();
  });

  it("bookmarks the topic under the cursor, and takes the bookmark off", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    stdin.write(CTRL_N);
    await until(lastFrame, "Grammar index");

    await press(stdin, lastFrame, "b", "Bookmarked “First declension nouns”");
    expect(session.isBookmarked("d1")).toBe(true);
    // Drawn on the bar as the student's own mark, above everything else it
    // could be saying about the topic.
    expect(lastFrame()).toContain("⚑ bookmarked");

    await press(
      stdin,
      lastFrame,
      "b",
      "Removed the bookmark from “First declension nouns”",
    );
    expect(session.isBookmarked("d1")).toBe(false);
    unmount();
  });

  it("bookmarks the section from inside the reader, where it is being read", async () => {
    /*
     * The same key on the same topic, one screen further in. The reader draws
     * the section of the topic under the cursor, so there is nothing for `b` to
     * aim at here that it was not already aiming at — which is the point: the
     * moment a page is worth coming back to is a moment spent reading it.
     */
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    stdin.write(CTRL_N);
    await until(lastFrame, "Grammar index");

    stdin.write("g");
    await until(lastFrame, "b bookmark");

    await press(stdin, lastFrame, "b", "Bookmarked “First declension nouns”");
    expect(session.isBookmarked("d1")).toBe(true);
    // And said on the page itself, not only in the flash that is about to go.
    expect(lastFrame()).toContain("⚑");
    unmount();
  });

  it("takes the topic under the cursor out of the review pile, on two presses", async () => {
    const { session, lastFrame, stdin, unmount } = open();
    await tick();
    // A round graded and added at the offer, so there is a card to lose — and
    // added through the screen rather than behind it, or the index would be
    // drawing a session it has not been told changed.
    await answer(stdin);
    await answer(stdin);
    await until(lastFrame, "is not in your reviews");
    stdin.write("a");
    await tick();
    expect(session.progress().topicCards.d1).toBeDefined();

    stdin.write(CTRL_N);
    await until(lastFrame, "Grammar index");
    // The idiom `x` already carries in the vocabulary list, and it deletes the
    // same kind of thing there: a schedule, not a syllabus.
    await pressOnce(stdin, lastFrame, "x", "Press x again to stop reviewing");
    expect(session.progress().topicCards.d1).toBeDefined();
    await pressOnce(stdin, lastFrame, "x", "is out of the review pile");
    expect(session.progress().topicCards.d1).toBeUndefined();
    // The answers stay, so practising it again does not teach it from the top.
    expect(session.everGraded("d1")).toBe(true);
    unmount();
  });

  it("refuses the dismissal on a topic that is not in the pile", async () => {
    const { lastFrame, stdin, unmount } = open();
    await tick();
    stdin.write(CTRL_N);
    await until(lastFrame, "Grammar index");
    await pressOnce(stdin, lastFrame, "x", "is not in the review pile");
    unmount();
  });
});

describe("the sentence a recorded word was met in", () => {
  /**
   * Answer the first question wrongly and reach the graded screen, so the two
   * sentences on it differ and it is possible to tell which one a word came
   * from. The reference is `puella rosam amat`; this writes `rosa` for `rosam`.
   */
  async function graded() {
    const content = new Content(fixture, testProfile);
    const session = studying(content);
    const app = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );
    await until(app.lastFrame, "The girl loves the rose.");
    await press(app.stdin, app.lastFrame, "puella rosa amat");
    await press(app.stdin, app.lastFrame, "\r", "your answer puella rosa amat");
    return { ...app, session };
  }

  /** Type a word into the recording box and look it up. */
  async function record(
    app: Awaited<ReturnType<typeof graded>>,
    form: string,
    want: string,
  ) {
    await press(app.stdin, app.lastFrame, "v", "Record vocabulary");
    await press(app.stdin, app.lastFrame, form);
    await press(app.stdin, app.lastFrame, "\r", want);
  }

  it("keeps the reference when the word stands in both", async () => {
    const app = await graded();
    await record(app, "amat", "Saved: amō");

    const [context] = app.session.vocabContexts("v-amo");
    // The reference is right by construction; the student's copy may not be.
    expect(context?.source).toBe("answer");
    expect(context?.sentence).toBe("puella rosam amat");
    expect(context?.prompt).toBe("The girl loves the rose.");
    expect(context?.index).toBe(2);
    // The page it was met on, written here though the terminal draws no link to
    // it yet: a card is one record the two surfaces share, and one that kept
    // its topic on the phone but not here would be the two of them disagreeing
    // about the same word.
    expect(context?.sectionId).toBe("ag-decl1");
    app.unmount();
  });

  it("keeps the credit with the reference, and never with their own line", async () => {
    // The same rule the phone keeps, met from the other surface: the credit is
    // a fact about the quoted line, and a sentence the student typed is theirs
    // however closely it follows the book.
    const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
    const quoted: ContentData = {
      ...fixture,
      tests: {
        ...fixture.tests,
        "ag-decl1": [
          {
            id: "ag-decl1-q1",
            sectionId: "ag-decl1",
            questions: [
              {
                prompt: "The girl loves the rose.",
                answer: "puella rosam amat",
                kind: "translate-en-la" as const,
                vocab: ["puella", "rosam", "amat"],
                source: cite,
              },
            ],
          },
        ],
      },
    };
    const content = new Content(quoted, testProfile);
    const session = studying(content);
    const app = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );
    await until(app.lastFrame, "The girl loves the rose.");
    await press(app.stdin, app.lastFrame, "puella rosa amat");
    await press(app.stdin, app.lastFrame, "\r", "your answer puella rosa amat");

    await record({ ...app, session }, "amat", "Saved: amō");
    expect(session.vocabContexts("v-amo")[0]?.attribution).toEqual(cite);

    // `rosa` stands only in what they wrote, so that is the sentence kept —
    // and Caesar's name does not go on it.
    await record({ ...app, session }, "rosa", "Saved: rosa, rosae (f)");
    expect(session.vocabContexts("v-rosa")[0]?.source).toBe("submitted");
    expect(session.vocabContexts("v-rosa")[0]?.attribution).toBeUndefined();
    app.unmount();
  });

  it("keeps what the student wrote when only that has the word", async () => {
    const app = await graded();
    await record(app, "rosa", "Saved: rosa, rosae (f)");

    const [context] = app.session.vocabContexts("v-rosa");
    expect(context?.source).toBe("submitted");
    expect(context?.sentence).toBe("puella rosa amat");
    expect(context?.index).toBe(1);
    app.unmount();
  });

  it("keeps the question for a word typed from memory", async () => {
    const app = await graded();
    // `manibus` is in neither sentence. The question is still where the word
    // was met, so it is kept — with no word picked out in it.
    await record(app, "manibus", "Saved: manus, manūs (f)");

    const [context] = app.session.vocabContexts("v-manus");
    expect(context?.sentence).toBe("puella rosam amat");
    expect(context?.index).toBeUndefined();
    app.unmount();
  });

  it("carries the sentence across the screen that asks which word it was", async () => {
    const app = await graded();
    await press(app.stdin, app.lastFrame, "v", "Record vocabulary");
    await press(app.stdin, app.lastFrame, "rosam");
    await press(app.stdin, app.lastFrame, "\r", "Which word is");
    // Two readings; the second is the flower. The sentence has to survive the
    // detour and land on whichever one is finally chosen.
    await press(app.stdin, app.lastFrame, "2", "Saved: rosa, rosae (f)");

    const [context] = app.session.vocabContexts("v-rosa");
    expect(context?.source).toBe("answer");
    expect(context?.index).toBe(1);
    app.unmount();
  });

});

describe("the sentences on a card, in the terminal", () => {
  /** A card carrying two sentences, with the list open on it. */
  async function twoSentences() {
    const content = new Content(fixture, testProfile);
    const session = studying(content);
    const id = session.recordVocab(content.lookup("manibus")[0]!);
    session.addVocabContext(id, {
      prompt: "The girl loves the rose.",
      sentence: "puella rosam amat",
      source: "answer",
      index: 1,
    });
    session.addVocabContext(id, {
      prompt: "The master frees the slave.",
      sentence: "dominus servum līberat",
      source: "submitted",
    });
    const app = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );
    // A word recorded just now is due now, so the loop opens on it rather than
    // on the book — which is where the list is reached from anyway.
    await until(app.lastFrame, "Vocabulary review");
    await press(app.stdin, app.lastFrame, "V", "Vocabulary — 1 word");
    return { ...app, session, id };
  }

  it("counts the sentences in the list, so `c` is worth pressing", async () => {
    const app = await twoSentences();
    expect(app.lastFrame()).toContain("2 kept");
    expect(app.lastFrame()).toContain("c its sentences");
    app.unmount();
  });

  it("opens them, moves one, and deletes one in two presses", async () => {
    const app = await twoSentences();
    const order = () =>
      app.session.vocabContexts(app.id).map((c) => c.sentence);

    await press(app.stdin, app.lastFrame, "c", "2 sentences");
    expect(app.lastFrame()).toContain("puella rosam amat");
    // A sentence the student wrote is labelled as such, always.
    expect(app.lastFrame()).toContain("(you wrote)");

    // `J` moves the sentence under the cursor down, where ↓ moves the cursor.
    await press(app.stdin, app.lastFrame, "J", "2 of 2");
    expect(order()).toEqual(["dominus servum līberat", "puella rosam amat"]);

    await pressOnce(app.stdin, app.lastFrame, "x", "Press x again");
    await pressOnce(app.stdin, app.lastFrame, "x", "Sentence deleted.");
    expect(order()).toEqual(["dominus servum līberat"]);
    // A sentence was deleted, not a word.
    expect(app.session.vocabCard(app.id)).toBeDefined();
    app.unmount();
  });

  it("corrects one without taking the q of a sentence for the quit key", async () => {
    const app = await twoSentences();
    await press(app.stdin, app.lastFrame, "c", "2 sentences");
    await press(app.stdin, app.lastFrame, "e", "Edit sentence");

    // Every letter belongs to the box, `q` included — without the guard this
    // would quit the app halfway through a sentence.
    await press(app.stdin, app.lastFrame, " quoque");
    await press(app.stdin, app.lastFrame, "\r", "Sentence saved.");

    expect(app.session.vocabContexts(app.id)[0]?.sentence).toBe(
      "puella rosam amat quoque",
    );
    // The picked-out word is found again in the rewritten line.
    expect(app.session.vocabContexts(app.id)[0]?.index).toBe(1);
    app.unmount();
  });
});

describe("the hint on a vocabulary card", () => {
  it("gives the English of the sentence and never the Latin", async () => {
    const content = new Content(fixture, testProfile);
    const session = studying(content);
    const id = session.recordVocab(content.lookup("manibus")[0]!);
    session.addVocabContext(id, {
      prompt: "The girl loves the rose.",
      sentence: "puella rosam amat",
      source: "answer",
      index: 1,
    });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );

    // The word recorded just now is due now, so the loop opens on it.
    await until(lastFrame, "Vocabulary review");
    expect(lastFrame()).toContain("hand");
    expect(lastFrame()).toContain("h hint");

    await press(stdin, lastFrame, "h", "The girl loves the rose.");
    // The half that cannot give the answer away, and only that half.
    expect(lastFrame()).not.toContain("puella rosam amat");
    expect(lastFrame()).not.toContain("manus, manūs (f)");
    // One sentence, one hint: the key is no longer offered.
    expect(lastFrame()).not.toContain("h hint");

    await press(stdin, lastFrame, " ", "manus, manūs (f)");
    expect(lastFrame()).toContain("where you met it");
    expect(lastFrame()).toContain("puella rosam amat");
    unmount();
  });
});

/**
 * The credit a quoted line carries, on the back of the word it taught.
 *
 * A card kept on the phone arrives here with its sentence and, where anybody
 * wrote that sentence, with the name — so the terminal draws it for the reason
 * it draws the kept sentence's own: the attribution is half of what a quoted
 * line is, and a back that dropped it left the student looking at an anonymous
 * sentence the study screen had just credited to Caesar.
 */
describe("who wrote the sentence on a vocabulary card", () => {
  const context = {
    prompt: "The girl loves the rose.",
    sentence: "puella rosam amat",
    source: "answer" as const,
    index: 1,
  };

  it("names the author and the locus under the sentence", async () => {
    const content = new Content(fixture, testProfile);
    const session = studying(content);
    const id = session.recordVocab(content.lookup("manibus")[0]!);
    session.addVocabContext(id, {
      ...context,
      attribution: { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" },
    });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );

    await until(lastFrame, "Vocabulary review");
    // Behind the reveal with the rest of the back: the front is the meaning.
    expect(lastFrame()).not.toContain("Caesar");

    await press(stdin, lastFrame, " ", "where you met it");
    expect(lastFrame()).toContain("— Caesar, de Bello Gallico i, 1");
    unmount();
  });

  it("says nothing where nobody can be credited", async () => {
    // Which is most cards: a generated sentence has no author.
    const content = new Content(fixture, testProfile);
    const session = studying(content);
    const id = session.recordVocab(content.lookup("manibus")[0]!);
    session.addVocabContext(id, context);
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );

    await until(lastFrame, "Vocabulary review");
    await press(stdin, lastFrame, " ", "where you met it");
    expect(lastFrame()).toContain("puella rosam amat");
    expect(lastFrame()).not.toContain("—");
    unmount();
  });
});

/**
 * A sentence kept on the phone, reviewed in the terminal.
 *
 * The deck lives in the progress file, so a card kept with a thumb arrives here
 * whether or not this surface has a way of making one. That is why the review
 * path is not optional: a terminal that did not know the kind would leave the
 * card due for ever, with the pile never going down and nothing else served.
 *
 * Keeping and forgetting stay on the web. Reviewing does not.
 */
describe("a sentence kept elsewhere, come round here", () => {
  const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
  const question = {
    prompt: "Gaul is divided into three parts.",
    answer: "Gallia est omnis dīvīsa in partēs trēs.",
    kind: "translate-en-la" as const,
    vocab: [],
    source: cite,
  };

  it("is served, read and graded, with its marks and its author", async () => {
    const content = new Content(fixture, testProfile);
    const session = studying(content);
    const { id } = session.keepSentence(question, "ag-decl1", {
      prompt: { 0: 1 },
      answer: { 1: 3 },
    });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );

    // Kept a moment ago, so it is due now and the loop opens on it — English
    // side up, like every card here.
    await until(lastFrame, "A sentence you kept");
    expect(lastFrame()).toContain("*Gaul*"); // the mark the student made
    // And nothing of the answer in front of the reveal.
    expect(lastFrame()).not.toContain("Gallia");

    await press(stdin, lastFrame, " ", "Gallia");
    // The attribution is the reason most of these cards exist, so it is on the
    // back rather than left behind in the question bank.
    expect(lastFrame()).toContain("Caesar");
    expect(lastFrame()).toContain("de Bello Gallico");
    // A struck word, said the one way a terminal can say it.
    expect(lastFrame()).toContain("e̶s̶t̶");

    await press(stdin, lastFrame, "3", testProfile.ui.promptDirection);
    expect(session.sentenceCard(id)!.fsrs.reps).toBe(1);
    unmount();
  });
});

/**
 * The preference lives on the deck, not on the device, so a deck set up in the
 * app arrives here already asking for quoted sentences and the terminal has to
 * honour it — in the run it serves, in what the index counts, and in the bank
 * it draws.
 */
describe("a deck that asked for quoted sentences only", () => {
  const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
  const quoted: ContentData = {
    ...fixture,
    tests: {
      ...fixture.tests,
      "ag-decl1": [
        ...fixture.tests["ag-decl1"]!,
        {
          id: "ag-decl1-q1",
          sectionId: "ag-decl1",
          questions: [
            { prompt: "Gaul is divided into three parts.", answer: "gallia est omnis dīvīsa in partēs trēs", kind: "translate-en-la" as const, vocab: [], source: cite },
          ],
        },
      ],
      "ag-verb-pres": [
        {
          id: "ag-verb-pres-q1",
          sectionId: "ag-verb-pres",
          questions: [
            { prompt: "The die is cast.", answer: "ālea iacta est", kind: "translate-en-la" as const, vocab: [], source: cite },
          ],
        },
      ],
    },
  };

  it("runs a topic on its quoted questions alone", async () => {
    const content = new Content(quoted, testProfile);
    const session = studying(content, { ...emptyProgress(), quotedOnly: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );

    // First declension holds two written questions and one quotation, and the
    // quotation is the only thing a run under the preference may serve.
    await until(lastFrame, "Gaul is divided into three parts.");
    expect(lastFrame()).not.toContain("The girl loves the rose.");

    await press(stdin, lastFrame, "gallia est omnis dīvīsa in partēs trēs");
    await press(stdin, lastFrame, "\r", "correct");
    // The one quotation is the whole run, so grading it works the run out and
    // asks whether the topic should start coming back.
    await press(stdin, lastFrame, "3", "is not in your reviews");
    await press(stdin, lastFrame, "a", "All practised");

    // And the topics it never asked about are untouched: nothing was shown, so
    // grading one would put a topic never seen into the review rotation.
    expect(session.progress().topicCards["ag-decl2"]).toBeUndefined();
    expect(session.progress().topicCards["ag-decl1"]).toBeDefined();
    unmount();
  });

  it("counts the index by what it will ask, and says which topics have none", async () => {
    const content = new Content(quoted, testProfile);
    const session = studying(content, { ...emptyProgress(), quotedOnly: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );
    await until(lastFrame, "Gaul is divided into three parts.");

    // From the answer box, where letters are letters: `^N` is the index.
    await press(stdin, lastFrame, CTRL_N, "Grammar index");
    // One of first declension's three questions is quoted, and one is what the
    // index has to say: 3 would send a student to a run of one.
    expect(lastFrame()).toContain("0/1 questions");

    // On to the second declension, which has tests and nothing quoted. The
    // index says which of the two silences that is, and will not run it.
    await pressOnce(stdin, lastFrame, RIGHT, "Second declension nouns");
    expect(lastFrame()).toContain("nothing quoted");
    expect(lastFrame()).not.toContain("no tests");
    // Twice: the first Enter is the confirm that leaving a half-written
    // answer costs it. The second is the one that gets refused.
    await pressOnce(stdin, lastFrame, "\r", "Press Enter again");
    await pressOnce(stdin, lastFrame, "\r", "Nothing quoted for");
    unmount();
  });

  it("draws the bank by what it will ask, and refuses to open an empty one", async () => {
    const content = new Content(quoted, testProfile);
    const session = studying(content, { ...emptyProgress(), quotedOnly: true });
    const { lastFrame, stdin, unmount } = render(
      <App session={session} content={content} storage={new MemoryStorage()} />,
    );
    await until(lastFrame, "Gaul is divided into three parts.");
    await press(stdin, lastFrame, CTRL_N, "Grammar index");

    // The pane is the questions this deck will be asked, so its heading and the
    // index's count are halves of the same list rather than of two.
    await pressOnce(stdin, lastFrame, "a", "All questions on");
    expect(lastFrame()).toContain("0 of 1 answered");
    expect(lastFrame()).toContain("Gaul is divided into three parts.");
    expect(lastFrame()).not.toContain("The girl loves the rose.");

    // Back to the index, on to the topic with nothing quoted: `a` would open a
    // pane explaining nothing, so it says which silence this is instead.
    await pressOnce(stdin, lastFrame, ESC, "Grammar index");
    await pressOnce(stdin, lastFrame, RIGHT, "Second declension nouns");
    await pressOnce(stdin, lastFrame, "a", "Nothing quoted for");
    unmount();
  });

  /**
   * The count is on the status line of the topic under the cursor, and the
   * cursor is on one topic at a time. So the index says where the quotations
   * are one arrow-press at a time, which for a syllabus of a hundred-odd topics
   * is the same as not saying. The bar is what is looked at, and the bar is
   * where a topic with nothing to serve has to be visible as one.
   *
   * `·` rather than the dim flag, because `░` in dim gray is already "never
   * started" — most of the bar, most of the time — and the two must not become
   * the same cell.
   */
  describe("and what the bar shows without being asked", () => {
    /**
     * `ag-decl1` keeps its quotation; `ag-verb-pres` loses the one the fixture
     * above gave it. So nouns holds one live topic and one dry one, and verb
     * forms is dry all through — the two cases the heading has to tell apart.
     */
    const oneFamilyDry: ContentData = {
      ...quoted,
      tests: { ...quoted.tests, "ag-verb-pres": fixture.tests["ag-verb-pres"]! },
    };

    it("marks the topics with nothing to serve, and says so over a whole family", async () => {
      const content = new Content(oneFamilyDry, testProfile);
      const session = studying(content, { ...emptyProgress(), quotedOnly: true });
      const { lastFrame, stdin, unmount } = render(
        <App session={session} content={content} storage={new MemoryStorage()} />,
      );
      await until(lastFrame, testProfile.ui.promptDirection);
      await press(stdin, lastFrame, CTRL_N, "Grammar index");

      // Nouns is the open family: two cells, and the second declension's is the
      // one with nothing behind it. `░` is the other one — never started, but
      // with a quotation waiting in it.
      expect(lastFrame()).toMatch(/░·/);
      // Verb forms has nothing under it at all, and its heading says so rather
      // than leaving it to be found by walking in.
      expect(lastFrame()).toMatch(/Verb forms.*nothing quoted/);
      // Nouns has one topic worth going to, and one is enough to keep it lit.
      expect(lastFrame()).not.toMatch(/Nouns.*nothing quoted/);
      unmount();
    });

    it("leaves the bar alone when the preference is off", async () => {
      const content = new Content(oneFamilyDry, testProfile);
      const session = studying(content);
      const { lastFrame, stdin, unmount } = render(
        <App session={session} content={content} storage={new MemoryStorage()} />,
      );
      await until(lastFrame, testProfile.ui.promptDirection);
      await press(stdin, lastFrame, CTRL_N, "Grammar index");

      // Every topic in the fixture has tests, so with the preference off there
      // is nothing to mark: this is about having anything to ask at all, not a
      // second opinion about quotations. Read off the bar rather than the whole
      // frame — `·` is the separator half this screen's chrome is built from.
      expect(lastFrame()).toMatch(/░░\s+topic 1 of 2/);
      expect(lastFrame()).not.toContain("no questions");
      unmount();
    });
  });
});
