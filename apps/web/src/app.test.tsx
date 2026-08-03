import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Content,
  Session,
  type ContentData,
  type Progress,
} from "@lang-tutor/core";
import { testProfile } from "@lang-tutor/core/testing";
import { profile } from "./pack.js";
import { App } from "./app.js";
import { SyncingStorage } from "./storage/sync.js";

// The app fetches the dictionary on demand. These tests supply it up front so
// the vocabulary flow can be driven without a network — except where the point
// is what happens when the fetch cannot happen at all.
const dictionary = { available: true };
vi.mock("./content-loader.js", () => ({
  loadDictionary: vi.fn(async () => {
    if (!dictionary.available) throw new Error("offline");
    return {} as never;
  }),
  dictionaryReady: () => dictionary.available,
}));

/**
 * The web port of `apps/cli/src/app.test.tsx`. The scenarios are the CLI's,
 * because the state machine is the CLI's — what changed is that keys became
 * buttons, so these drive the app the way a thumb would.
 */
const fixture: ContentData = {
  grammar: [
    { id: "decl1", ref: "20-22", title: "First declension", family: "nouns", text: "First-declension nouns end in -a.", order: 10 },
    { id: "decl2", ref: "23-27", title: "Second declension", family: "nouns", text: "Second-declension nouns end in -us.", order: 20 },
    { id: "pres", ref: "174", title: "Present indicative", family: "verb-forms", text: "The present stem takes the personal endings.", order: 130 },
  ],
  tests: {
    decl1: [
      {
        id: "decl1-t1",
        sectionId: "decl1",
        questions: [
          { prompt: "The girl loves the rose.", answer: "Puella rosam amat.", kind: "translate-en-la", vocab: [] },
          { prompt: "The sailors feared the storm.", answer: "Nautae procellam timēbant.", kind: "translate-en-la", vocab: [] },
        ],
      },
    ],
    decl2: [
      {
        id: "decl2-t1",
        sectionId: "decl2",
        questions: [
          { prompt: "The master frees the slave.", answer: "Dominus servum līberat.", kind: "translate-en-la", vocab: [] },
        ],
      },
    ],
    pres: [
      {
        id: "pres-t1",
        sectionId: "pres",
        questions: [
          { prompt: "The poet praises the queen.", answer: "Poēta rēgīnam laudat.", kind: "translate-en-la", vocab: [] },
        ],
      },
    ],
  },
  lemmas: {
    manibus: [
      { lemma: "manus", citation: "manus, manūs (f)", gloss: "hand", pos: "noun", rank: 157 },
      { lemma: "mānis", citation: "mānis, māne", gloss: "good", pos: "adj", rank: 4091 },
    ],
    regem: [{ lemma: "rex", citation: "rex, rēgis", gloss: "king", pos: "noun", rank: 88 }],
    // Words that appear in the answers above, so they can be held down there.
    rosam: [{ lemma: "rosa", citation: "rosa, rosae (f)", gloss: "rose", pos: "noun", rank: 900 }],
    amat: [
      { lemma: "amō", citation: "amō, amāre, amāvī, amātum", gloss: "to love", pos: "verb", rank: 125 },
    ],
  },
};

function mount(progress?: Progress) {
  const content = new Content(fixture, testProfile);
  const session = new Session(content, progress);
  const storage = new SyncingStorage();
  render(<App content={content} session={session} storage={storage} />);
  return { session, content, storage };
}

/** True while the placement probes are still running. */
const inPlacement = () => document.querySelector(".badge--placement") !== null;

/**
 * The small line above the prompt, which carries the within-test counter.
 * Scoped inside the scroller, because placement adds an eyebrow of its own
 * above it ("translate as far as you can").
 */
const eyebrow = () =>
  document.querySelector(".study__scroll .eyebrow")?.textContent ?? "";

/**
 * The Latin sentences on screen, written and reference.
 *
 * Both are rendered a word at a time so each can be held down and recorded, so
 * no single element holds the whole sentence and `getByText` cannot see it.
 */
const sentences = () =>
  // `Array.from`, not a spread: the DOM lib here is the non-iterable one.
  Array.from(document.querySelectorAll(".compare__text")).map((el) =>
    el.textContent?.trim(),
  );

/** The span carrying one word of a sentence on screen. */
const wordSpan = (word: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(".word")).find(
    (el) => el.dataset.word?.replace(/[^\p{Letter}]/gu, "") === word,
  );

/**
 * The word spans of one block on screen — the reference, what you wrote, a row
 * of the trail — since the same word can stand in more than one of them.
 */
const wordsIn = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`${selector} .word`));

/** Tap a word of one block, which is how a word is marked. */
const tapWord = async (
  user: ReturnType<typeof userEvent.setup>,
  selector: string,
  word: string,
) => {
  const span = wordsIn(selector).find(
    (el) => el.dataset.word?.replace(/[^\p{Letter}]/gu, "") === word,
  );
  if (!span) throw new Error(`no word “${word}” in ${selector}`);
  await user.click(span);
};

/**
 * A finger crossing the grammar reader, which is how its pages turn.
 *
 * jsdom has no `PointerEvent`, so a fired `pointerdown` carries no coordinates
 * and every swipe would measure `NaN`. A `MouseEvent` under the pointer event's
 * name is what React listens for anyway, and it does carry them.
 */
function swipe(from: number, to: number) {
  const reader = document.querySelector(".reader");
  if (!reader) throw new Error("no grammar reader on screen");
  fireEvent(reader, new MouseEvent("pointerdown", { clientX: from, clientY: 100, bubbles: true }));
  fireEvent(reader, new MouseEvent("pointerup", { clientX: to, clientY: 100, bubbles: true }));
}

/** Let real time pass, since the hold is timed rather than counted. */
const passTime = (ms: number) =>
  act(() => new Promise((resolve) => setTimeout(resolve, ms)));

/** Hold a word down long enough to record it. */
async function holdWord(word: string, then?: () => void) {
  const span = wordSpan(word);
  if (!span) throw new Error(`no word “${word}” on screen`);
  fireEvent.pointerDown(span, { clientX: 20, clientY: 20 });
  then?.();
  await passTime(700);
}

/** Hold down the crib row that carries this text, long enough to record it. */
async function holdCribRow(text: string, then?: () => void) {
  const row = Array.from(document.querySelectorAll<HTMLElement>(".crib-row")).find(
    (el) => el.textContent?.includes(text),
  );
  if (!row) throw new Error(`no vocabulary row reading “${text}”`);
  fireEvent.pointerDown(row, { clientX: 20, clientY: 20 });
  then?.();
  await passTime(700);
}

/** Study past the placement probes, so the tests start on ordinary ground. */
async function skipPlacement(user: ReturnType<typeof userEvent.setup>) {
  while (inPlacement()) {
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /No idea/ }));
  }
}

beforeEach(() => {
  localStorage.clear();
  dictionary.available = true;
  vi.unstubAllGlobals();
});

describe("the study loop", () => {
  it("carries on past a failed area, then starts study at the beginning", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    expect(inPlacement()).toBe(true);
    expect(screen.getByText(/Placement · Nouns/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /No idea/ }));

    // Failing the nouns settles them at their start and asks about the verbs
    // instead of stopping: not knowing one area says nothing about the others.
    expect(session.progress().placementDone).toBe(false);
    expect(screen.getByText(/Placement · Verb forms/)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /No idea/ }));
    expect(session.progress().placementDone).toBe(true);
    expect(session.progress().knownSections).toEqual([]);
    // Study begins at the first topic. Its title is in the status bar and again
    // in the section sheet that opens on new ground, so scope to the bar.
    expect(document.querySelector(".status__title")?.textContent).toBe(
      "First declension",
    );
    // What was written on a probe is kept, the way the CLI has always kept it.
    expect(session.attemptsFor("decl1")).toHaveLength(1);
  });

  it("counts questions through the test, and not at all during placement", async () => {
    const user = userEvent.setup();
    mount();

    // Placement serves one question per probe and starts each at index 0, so a
    // within-test counter here could only ever read "1/4" — the size of the
    // test it was drawn from, which is not a number about the run. The status
    // bar's "area N of M" is the one that means something.
    expect(inPlacement()).toBe(true);
    expect(eyebrow()).toBe(profile.ui.promptDirection);
    expect(eyebrow()).not.toMatch(/\d+\/\d+/);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(eyebrow()).not.toMatch(/\d+\/\d+/);
    expect(screen.getByText(/Placement · Nouns · area 1 of/)).toBeDefined();

    await user.click(screen.getByRole("button", { name: /No idea/ }));
    await skipPlacement(user);

    // Ordinary study does carry the counter, and it advances through the test.
    expect(inPlacement()).toBe(false);
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/2`);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 2/2`);
  });

  it("stays in placement while a word is recorded, and resumes it after a reload", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    // Pass the first probe, so placement is genuinely mid-run. Passing narrows
    // within the same area rather than moving on to the next.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Knew it/ }));
    expect(screen.getByText(/Placement · Nouns, narrowing/)).toBeDefined();

    // Recording a word is an aside, not an exit: the probe is still on screen.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(session.vocabCard("v-rex")).toBeDefined();
    expect(inPlacement()).toBe(true);
    expect(screen.getByText(/Placement · Nouns, narrowing/)).toBeDefined();

    // And the run itself outlives the page: passing a probe fills knownSections,
    // which used to make a reload look like a finished placement.
    cleanup();
    mount(new SyncingStorage().read() ?? undefined);
    expect(inPlacement()).toBe(true);
    expect(screen.getByText(/Placement · Nouns, narrowing/)).toBeDefined();
  });

  it("takes an area's topics as known up to its passed probe, and no further", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    // Pass the nouns probe, then miss the one narrowing above it.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Knew it/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /No idea/ }));

    expect(session.progress().knownSections).toEqual(["decl1"]);
    // The nouns resume above the probe that passed; the verbs, asked about
    // separately, claim nothing at all.
    expect(session.progress().frontiers).toEqual({ nouns: "decl2" });
  });

  it("shows what was written beside the reference, then grades", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    // Deliberately wrong: the app must show it as written, not correct it.
    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amo.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    // Both halves of the comparison, and no automatic verdict on either.
    expect(screen.getByText("You wrote")).toBeDefined();
    expect(screen.getByText("Reference")).toBeDefined();
    expect(sentences()).toEqual(["Puella rosa amo.", "Puella rosam amat."]);

    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(session.progress().topicMastery.decl1).toBe(2);
  });

  it("advances through a test's questions before moving on", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    expect(screen.getByText(`${profile.ui.promptDirection} · 1/2`)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // Same topic, next question — not a jump to the next topic.
    expect(screen.getByText(`${profile.ui.promptDirection} · 2/2`)).toBeDefined();
    expect(screen.getByText("The sailors feared the storm.")).toBeDefined();
  });

  it("reveals the reference without inventing an answer", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    // Nothing was written, so nothing is reported as written.
    expect(screen.queryByText("You wrote")).toBeNull();
    expect(screen.getByText("Reference")).toBeDefined();
  });

  it("says when each grade would bring the topic back", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // A fresh card's learning steps are minutes; "Easy" jumps to days.
    expect(screen.getByRole("button", { name: /Again/ }).textContent).toMatch(/\d+m$/);
    expect(screen.getByRole("button", { name: /Easy/ }).textContent).toMatch(/\d+d$/);
  });

  it("rests when nothing is due, rather than showing an empty screen", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    // Grade every topic; the scheduler then has nothing left to serve today.
    for (let i = 0; i < 4; i++) {
      if (!screen.queryByRole("button", { name: "Reveal" })) break;
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Easy/ }));
    }
    expect(screen.getByText("Nothing due.")).toBeDefined();
  });
});

describe("the answer trail", () => {
  it("keeps what was written, so a topic's earlier answers can be re-read", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    const [attempt] = session.attemptsFor("decl1");
    expect(attempt?.submitted).toBe("Puella rosa amat.");
    expect(attempt?.rating).toBe(2);
    expect(attempt?.prompt).toBe("The girl loves the rose.");
  });

  it("records a revealed answer as nothing written, not as a right answer", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(session.attemptsFor("decl1")[0]?.submitted).toBe("");
  });

  it("folds the topic's earlier answers into the graded screen", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    // The em dash tells the disclosure from the grammar sheet's ↺, which is
    // labelled "Earlier answers" too and is the long way round to the same
    // thing.
    const trail = () =>
      screen.queryByRole("button", { name: /Earlier answers —/ });
    const expanded = () => trail()?.getAttribute("aria-expanded");
    const opened = () => document.querySelector("#earlier-answers");

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    // One already: the placement probe was answered on this topic.
    expect(trail()?.textContent).toContain("1 on this topic");
    expect(expanded()).toBe("false");
    expect(opened()).toBeNull();
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    // The second question of the same topic. The answer just graded has joined
    // the trail; the question on screen has not.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(trail()?.textContent).toContain("2 on this topic");
    expect(expanded()).toBe("false");

    await user.click(trail()!);
    expect(expanded()).toBe("true");
    expect(opened()!.textContent).toContain("Puella rosa amat.");
    expect(opened()!.textContent).toContain("The girl loves the rose.");
    expect(opened()!.textContent).toContain("hard");
    expect(opened()!.textContent).not.toContain("The sailors feared the storm.");

    // And it folds itself away again rather than following the student on.
    await user.click(screen.getByRole("button", { name: /keep writing/ }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(expanded()).toBe("false");
  });

  /**
   * A trail of your own sentences with nothing to read them against says you
   * answered, not how — which is the whole reason to open it weeks later.
   */
  it("puts the correction beside what was written, and only where it differs", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    // The second question of the same topic, with the first now in the trail.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Earlier answers —/ }));
    const trail = () => document.querySelector("#earlier-answers")!;
    const corrections = () =>
      Array.from(trail().querySelectorAll(".attempt__answer")).map((el) =>
        el.textContent?.replace(/^correct/, "").trim(),
      );

    expect(trail().textContent).toContain("Puella rosa amat.");
    // Which is not the sentence Latin wanted, and now the trail says so.
    expect(corrections()).toContain("Puella rosam amat.");
    // The placement probe was revealed rather than answered; nothing written
    // is not a right answer, so it is corrected too.
    expect(trail().textContent).toContain("— nothing written");
    expect(corrections()).toHaveLength(2);
  });

  it("marks a right answer instead of printing it back as a correction", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    // Right, through the pack's fold and the same word split the crib uses:
    // the capital and the full stop belong to the sentence, not the answer.
    await user.type(screen.getByLabelText("Your Latin"), "puella rosam amat");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Earlier answers —/ }));
    const trail = document.querySelector("#earlier-answers")!;

    const right = Array.from(trail.querySelectorAll(".attempt")).filter((el) =>
      el.textContent?.includes("puella rosam amat"),
    );
    expect(right).toHaveLength(1);
    expect(right[0]!.querySelector(".attempt__matched")?.textContent).toBe(
      "· matched",
    );
    // The reference is the sentence above it; the trail does not say it twice.
    expect(right[0]!.querySelector(".attempt__answer")).toBeNull();
  });

  it("does not carry the trail across to another topic's answers", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    // Finish first declension, so its two attempts are on the record.
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }

    // Second declension is new ground: its own trail is empty.
    expect(document.querySelector(".status__title")?.textContent).toBe(
      "Second declension",
    );
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.queryByRole("button", { name: /Earlier answers/ })).toBeNull();
  });
});

/**
 * A phone does not close an app so much as take it away, and a test used to
 * live entirely in the screen's own state. Closing it on question two came
 * back at question one of a different test on a different topic: the first
 * grade had rescheduled the card, so nothing was due and the scheduler went
 * looking for new ground.
 */
describe("picking a test back up", () => {
  /** What a reload is, from the app's side: unmount, re-read the device. */
  const reopen = () => {
    cleanup();
    return mount(new SyncingStorage().read() ?? undefined);
  };
  const prompt = () => document.querySelector(".prompt")?.textContent;
  const topic = () => document.querySelector(".status__title")?.textContent;

  it("comes back to the same question of the same test", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    // decl1's test holds two questions. Answer the first.
    expect(eyebrow()).toContain("· 1/2");
    const first = prompt();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(eyebrow()).toContain("· 2/2");
    const second = prompt();
    expect(second).not.toBe(first);

    const seen = [...(session.progress().seenTests.decl1 ?? [])];
    reopen();

    expect(eyebrow()).toContain("· 2/2");
    expect(prompt()).toBe(second);
    expect(topic()).toBe("First declension");
    // Re-serving would re-roll the test and record it a second time; the round
    // names its test, and the test is found rather than chosen again.
    expect(new SyncingStorage().read()?.seenTests.decl1).toEqual(seen);
  });

  it("brings back the sentence being written, not just the question", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa");
    // The draft is debounced while typing and flushed when the app goes away,
    // which on a phone is the only moment there is.
    fireEvent(window, new Event("pagehide"));
    reopen();

    expect(screen.getByLabelText("Your Latin")).toHaveProperty(
      "value",
      "Puella rosa",
    );
  });

  it("comes back to the graded screen when the answer was already in", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /mark/ }));
    await tapWord(user, ".compare__block--reference", "rosam");
    fireEvent(window, new Event("pagehide"));
    reopen();

    // The comparison, what was written, and the words picked out before the
    // grade — none of which had anywhere to live until the round did.
    expect(sentences()).toContain("Puella rosa amat.");
    expect(screen.getByRole("button", { name: /Good/ })).toBeDefined();
    expect(
      document.querySelectorAll(".compare__block--reference .word--b").length,
    ).toBe(1);
  });

  it("does not pick up a round whose last question was graded", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    // The finished round was let go of and the next topic took the table —
    // on disk, not merely in memory. A round is only ever written by the
    // branch that serves a test, so letting go has to be written too.
    expect(topic()).toBe("Second declension");
    expect(new SyncingStorage().read()?.openRound).toMatchObject({
      sectionId: "decl2",
      answered: 0,
    });

    reopen();
    expect(topic()).toBe("Second declension");
    expect(eyebrow()).toContain("· 1/1");
  });

  it("writes the round down when study moves on to a word instead", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    // A word saved now falls due before the next topic does, so finishing the
    // round leads to a vocabulary card rather than another test — the branch
    // of `advance` that serves nothing and used to write nothing either.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    expect(session.vocabList()).toHaveLength(1);
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: /Good/ }));
      if (screen.queryByRole("button", { name: "Reveal" })) {
        await user.click(screen.getByRole("button", { name: "Reveal" }));
      }
    }
    // A vocabulary card, not another test — so nothing served, and nothing
    // would have been written without saying so on the way out.
    expect(screen.getByRole("button", { name: "Show" })).toBeDefined();
    expect(new SyncingStorage().read()?.openRound).toBeNull();
  });

  /** The one way out of a set, and the reason it has to be deliberate. */
  it("hands the round over when another topic is quizzed from the map", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    expect(topic()).toBe("First declension");

    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    await user.click(screen.getByRole("button", { name: /^Verb forms/ }));
    await user.click(screen.getByRole("button", { name: /Present indicative/ }));
    await user.click(screen.getByRole("button", { name: "Quiz me" }));
    expect(topic()).toBe("Present indicative");

    reopen();
    expect(topic()).toBe("Present indicative");
    expect(prompt()).toBe("The poet praises the queen.");
  });
});

/**
 * The grade says the topic went badly. It never says which word, and very
 * often the topic under test was fine and something else in the sentence was
 * not — which is the thing worth finding again months later.
 */
describe("marking up an answer", () => {
  const mark = () => screen.getByRole("button", { name: /mark|done marking/ });
  /** The words shown bold in one block, marked or read-only alike. */
  const bold = (selector: string) =>
    Array.from(
      document.querySelectorAll(`${selector} .word--b, ${selector} .mark--b`),
    ).map((el) => el.textContent);

  it("keeps the words picked out on the attempt the grade records", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(mark());

    await tapWord(user, ".compare__block--reference", "rosam");
    await tapWord(user, ".prompt", "rose");
    await tapWord(user, ".prompt", "rose"); // once more: bold becomes italic
    await user.click(mark()); // done

    // On screen while it is still the question in hand.
    expect(bold(".compare__block--reference")).toEqual(["rosam"]);
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    const [attempt] = session.attemptsFor("decl1");
    expect(attempt?.marks).toEqual({ answer: { 1: 1 }, prompt: { 4: 2 } });
  });

  it("cycles a word back to plain in four taps, and stores nothing for it", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(mark());
    for (const _ of [0, 1, 2, 3]) {
      await tapWord(user, ".compare__block--reference", "rosam");
    }
    expect(bold(".compare__block--reference")).toEqual([]);
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // Nothing picked out is nothing stored, so an attempt nobody marked reads
    // on disk exactly as it did before marking existed.
    expect(session.attemptsFor("decl1")[0]!.marks).toBeUndefined();
  });

  it("suspends the hold while marking, so a press cannot half-save a word", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(mark());
    await holdWord("rosam");
    expect(session.vocabList()).toHaveLength(0);

    // And it comes straight back when the mode ends.
    await user.click(mark());
    await holdWord("rosam");
    expect(session.vocabList().map((c) => c.citation)).toEqual(["rosa, rosae (f)"]);
  });

  it("shows an earlier answer's marks wherever the trail is", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(mark());
    await tapWord(user, ".compare__block--reference", "rosam");
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    // The next question of the same topic, with the marked answer behind it.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Earlier answers —/ }));
    expect(bold("#earlier-answers .attempt__answer")).toEqual(["rosam"]);
    expect(session.attemptsFor("decl1")[0]!.marks).toEqual({ answer: { 1: 1 } });
  });

  /**
   * The point of being able to mark a recorded answer at all: a trail written
   * before this existed has none, and it is the old ones that are worth it.
   */
  it("marks an answer already on the record, and saves it as it goes", async () => {
    const user = userEvent.setup();
    const { session, storage } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));
    expect(session.attemptsFor("decl1")[0]!.marks).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Earlier answers —/ }));
    const row = () => document.querySelectorAll("#earlier-answers .attempt")[0]!;
    await user.click(
      within(row() as HTMLElement).getByRole("button", { name: "Mark up this answer" }),
    );
    await tapWord(user, ".attempt--marking .attempt__written", "rosa");

    expect(bold(".attempt--marking .attempt__written")).toEqual(["rosa"]);
    const [attempt] = session.attemptsFor("decl1");
    expect(attempt!.marks).toEqual({ submitted: { 1: 1 } });
    // Straight to disk: the app commits on every action, and this is one.
    expect(storage.read()?.attempts.decl1?.at(-1)?.marks).toEqual({
      submitted: { 1: 1 },
    });
  });

  it("shows the reference under the marker on the sheet that hides it", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: /All 2 questions/ }));
    await user.click(screen.getByRole("button", { name: /The girl loves the rose/ }));

    // The question sheet leaves the correction and the prompt off every row —
    // both stand above it, once. Under the marker they come back, because a
    // row with nothing on it to mark is not a row you can mark.
    expect(document.querySelector(".attempt .attempt__answer")).toBeNull();
    // Two rows: the placement probe answered this question too.
    await user.click(screen.getAllByRole("button", { name: "Mark up this answer" })[0]!);
    expect(
      document.querySelector(".attempt--marking .attempt__answer")?.textContent,
    ).toContain("Puella rosam amat.");
  });

  it("drops the marks on a sentence that is rewritten, and keeps the rest", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(mark());
    await tapWord(user, ".compare__block--reference", "rosam");
    await tapWord(user, ".compare__block:not(.compare__block--reference)", "rosa");
    await user.click(mark());

    // Submit came too early; the answer is rewritten.
    await user.click(screen.getByRole("button", { name: /keep writing/ }));
    await user.clear(screen.getByLabelText("Your Latin"));
    await user.type(screen.getByLabelText("Your Latin"), "Puella rosam amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // The reference did not change, so its marks stand. What you wrote did,
    // and its marks named positions in a sentence that no longer exists.
    expect(session.attemptsFor("decl1")[0]!.marks).toEqual({ answer: { 1: 1 } });
  });

  it("keeps the marks through taking a grade back", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(mark());
    await tapWord(user, ".compare__block--reference", "rosam");
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Undo last grade" }));

    expect(bold(".compare__block--reference")).toEqual(["rosam"]);
    await user.click(screen.getByRole("button", { name: /Hard/ }));
    // One attempt for the re-grade, not two, and it kept what was marked.
    const trail = session.attemptsFor("decl1");
    expect(trail).toHaveLength(2); // the placement probe, and this one
    expect(trail[0]!.rating).toBe(2);
    expect(trail[0]!.marks).toEqual({ answer: { 1: 1 } });
  });
});

describe("vocabulary", () => {
  it("offers the candidates for an ambiguous form, most frequent first", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "manibus");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    const options = screen.getAllByRole("button", { name: /manus|mānis/ });
    expect(options[0]!.textContent).toContain("manus, manūs (f)");

    await user.click(options[0]!);
    expect(session.vocabCard("v-manus")?.citation).toBe("manus, manūs (f)");
  });

  it("saves a unambiguous word without asking", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(session.vocabCard("v-rex")?.citation).toBe("rex, rēgis");
    expect(screen.getByText("Saved rex, rēgis")).toBeDefined();
  });

  it("offers the card by hand when the dictionary has not got the word", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "notaword");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    // Not a toast and a shrug: the word the student asked to keep is still on
    // the table, with the form already filled in as the citation.
    const sheet = screen.getByRole("dialog", { name: "Write the card yourself" });
    expect(within(sheet).getByLabelText("Citation")).toHaveProperty(
      "value",
      "notaword",
    );

    await user.type(within(sheet).getByLabelText("Meaning"), "a word I met");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(session.vocabCard("v-notaword")?.gloss).toBe("a word I met");
    expect(screen.getByText("Saved notaword")).toBeDefined();
  });

  it("refuses a card with either side blank", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "notaword");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    const sheet = screen.getByRole("dialog", { name: "Write the card yourself" });
    const save = () => within(sheet).getByRole("button", { name: "Save" });
    // The citation arrives filled and the meaning empty, so the card is
    // half-written from the start and cannot be saved.
    expect(save()).toHaveProperty("disabled", true);
    expect(
      within(sheet).getByText(/Both sides are needed/),
    ).toBeDefined();

    // Whitespace is not text: a space in the meaning leaves it just as blank.
    await user.type(within(sheet).getByLabelText("Meaning"), "   ");
    expect(save()).toHaveProperty("disabled", true);

    // And emptying the other side is refused on the same terms.
    await user.type(within(sheet).getByLabelText("Meaning"), "hand");
    expect(save()).toHaveProperty("disabled", false);
    await user.clear(within(sheet).getByLabelText("Citation"));
    expect(save()).toHaveProperty("disabled", true);

    // Submitting past the disabled button changes nothing either.
    fireEvent.submit(sheet.querySelector("form")!);
    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);
  });

  it("refuses to blank a side of a word that already exists", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const sheet = screen.getByRole("dialog", { name: "Edit word" });
    await user.clear(within(sheet).getByLabelText("Meaning"));
    expect(within(sheet).getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.submit(sheet.querySelector("form")!);
    expect(session.vocabCard("v-rex")?.gloss).toBe("king");
  });

  it("says the dictionary is missing rather than blaming the spelling", async () => {
    // Offline, on a device that never downloaded it. Reporting "no match" here
    // would tell the student their Latin was wrong when nothing was consulted.
    dictionary.available = false;
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));

    expect(screen.getByText(/dictionary hasn't been saved/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Look up" })).toBeNull();
  });

  it("asks for the Latin from the English, and schedules the answer", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    // Finish the topic's two questions; only then does the loop move on.
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // A new vocabulary card is due at once, so it comes up next.
    expect(screen.getByText(`Vocabulary · ${profile.ui.sayItIn}`)).toBeDefined();
    expect(screen.getByText("king")).toBeDefined();
    expect(screen.queryByText("rex, rēgis")).toBeNull(); // still hidden

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("rex, rēgis")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(session.vocabCard("v-rex")?.fsrs.reps).toBe(1);
  });
});

describe("holding a word", () => {
  it("records a word held down in the reference answer", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await holdWord("rosam");

    // Straight to the card — no sheet, nothing retyped.
    expect(session.vocabCard("v-rosa")?.citation).toBe("rosa, rosae (f)");
    expect(screen.getByText("Saved rosa, rosae (f)")).toBeDefined();
  });

  it("records a word held down in what you wrote, punctuation and all", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.type(screen.getByLabelText("Your Latin"), "Puella rosam amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    // "amat." is held; the full stop is the sentence's, not the word's.
    await holdWord("amat");
    expect(session.vocabCard("v-amo")?.citation).toBe("amō, amāre, amāvī, amātum");
  });

  it("asks which word it was when the form is ambiguous", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.type(screen.getByLabelText("Your Latin"), "manibus");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await holdWord("manibus");
    expect(screen.getByRole("dialog", { name: /Which word/ })).toBeDefined();
    await user.click(screen.getByRole("button", { name: /mānis/ }));
    expect(session.vocabCard("v-manis")).toBeDefined();
  });

  it("does not record a word when the press was the start of a scroll", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // A page that moves under the finger settles it: the press was a scroll,
    // and a scroll that silently saved a card would be worse than no gesture.
    await holdWord("rosam", () => {
      fireEvent.scroll(document.querySelector(".study__scroll")!);
    });

    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);
  });

  it("leads from the confirmation to the card, for a press that grabbed the wrong word", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = screen.getByRole("dialog", { name: "Edit word" });
    await user.click(within(sheet).getByRole("button", { name: /Delete this word/ }));
    await user.click(screen.getByRole("button", { name: /Delete “rosa, rosae \(f\)”/ }));

    expect(session.vocabCard("v-rosa")).toBeUndefined();
  });

  it("moves on to the next card when the word under review is deleted", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    // Record a word, then work through the rest of the test: a card recorded
    // now is due now, so the loop serves it as soon as the questions run out.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    for (let i = 0; i < 6 && !screen.queryByText("rose"); i++) {
      const reveal = screen.queryByRole("button", { name: "Reveal" });
      if (reveal) await user.click(reveal);
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    expect(screen.getByText("rose")).toBeDefined();

    // Delete it from under the review. Grading advances the loop; deleting used
    // to leave the phase pointing at a card the session no longer had, and the
    // body rendered nothing at all — a black screen with no way forward.
    await user.click(screen.getByRole("button", { name: /edit this word/ }));
    const sheet = screen.getByRole("dialog", { name: "Edit word" });
    await user.click(within(sheet).getByRole("button", { name: /Delete this word/ }));
    await user.click(screen.getByRole("button", { name: /Delete “rosa, rosae \(f\)”/ }));

    expect(session.vocabCard("v-rosa")).toBeUndefined();
    // The next due card is on screen, and the study body is not empty.
    expect(screen.getByLabelText("Your Latin")).toBeDefined();
    expect(document.querySelector(".prompt")?.textContent).toBeTruthy();
  });

  it("offers no macron keys — the answer box is the whole of the writing surface", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    expect(document.querySelector(".macrons")).toBeNull();
    expect(screen.queryByRole("button", { name: "ā" })).toBeNull();
  });
});

describe("the vocabulary list", () => {
  /** A word recorded, so there is something to list. */
  async function withOneWord(user: ReturnType<typeof userEvent.setup>) {
    const mounted = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    return mounted;
  }

  it("edits a word's citation and meaning without disturbing its schedule", async () => {
    const user = userEvent.setup();
    const { session } = await withOneWord(user);
    session.gradeVocab("v-rosa", 3);
    const scheduled = session.vocabCard("v-rosa")!.fsrs.due;

    await user.click(screen.getByRole("button", { name: "What is coming up" }));
    await user.click(screen.getByRole("button", { name: /All 1 word/ }));
    await user.click(screen.getByRole("button", { name: /rosa, rosae/ }));

    const citation = screen.getByLabelText("Citation");
    await user.clear(citation);
    await user.type(citation, "rosa, rosae (f), first declension");
    await user.clear(screen.getByLabelText("Meaning"));
    await user.type(screen.getByLabelText("Meaning"), "a rose");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const card = session.vocabCard("v-rosa")!;
    expect(card.citation).toBe("rosa, rosae (f), first declension");
    expect(card.gloss).toBe("a rose");
    // The edit is not a review: the card keeps its place in the queue.
    expect(card.fsrs.due).toBe(scheduled);
    expect(card.fsrs.reps).toBe(1);
    // And it is back on the list it was opened from.
    expect(screen.getByRole("dialog", { name: "Vocabulary" })).toBeDefined();
  });

  it("reaches the list from Settings too, so a word can be fixed at any time", async () => {
    const user = userEvent.setup();
    await withOneWord(user);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "1 word" }));
    expect(screen.getByRole("dialog", { name: "Vocabulary" })).toBeDefined();
    expect(screen.getByText("rosa, rosae (f)")).toBeDefined();
  });
});

describe("the schedule", () => {
  it("says what is waiting and what comes back when", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Easy/ }));

    await user.click(screen.getByRole("button", { name: "What is coming up" }));
    const sheet = screen.getByRole("dialog", { name: "Coming up" });
    // The topic just graded easy is days out, under a day of its own.
    expect(within(sheet).getByText(/First declension/)).toBeDefined();
    expect(within(sheet).getByText(/^in \d+d$/)).toBeDefined();
  });

  it("says so plainly when nothing is scheduled", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "What is coming up" }));
    expect(screen.getByText(/Nothing is scheduled yet/)).toBeDefined();
  });
});

describe("a section's questions", () => {
  it("lists every question with its answer, and one question's history", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    // Scoped to the map: the status bar names the same topic, and tapping it
    // opens the grammar rather than the topic sheet.
    const map = screen.getByRole("dialog", { name: "Grammar map" });
    await user.click(within(map).getByRole("button", { name: /First declension/ }));
    await user.click(screen.getByRole("button", { name: /All 2 questions/ }));

    // Both of the section's questions, whether or not they have been served.
    const list = screen.getByRole("dialog", { name: "All questions" });
    expect(within(list).getByText("Puella rosam amat.")).toBeDefined();
    expect(within(list).getByText("Nautae procellam timēbant.")).toBeDefined();
    // Two: the placement probe asked this same question first, and what was
    // written on it is kept.
    expect(within(list).getByText(/2 answers · last hard/)).toBeDefined();
    expect(within(list).getByText("not answered yet")).toBeDefined();

    await user.click(within(list).getByRole("button", { name: /The girl loves the rose/ }));
    const one = screen.getByRole("dialog", { name: "Question" });
    expect(within(one).getByText("Your answers")).toBeDefined();
    expect(within(one).getByText("Puella rosa amat.")).toBeDefined();
    expect(within(one).getByText(/hard/)).toBeDefined();
    // The prompt is the sheet's own heading, so it is not repeated per answer.
    expect(within(one).queryByText("The girl loves the rose.")).toBeDefined();
    expect(session.attemptsForQuestion("decl1", "The girl loves the rose.")).toHaveLength(2);
  });
});

// Three taps drive the whole loop, so all three land by mistake: the word
// recorder, Submit, and a grade. None of them should be a dead end.
describe("taking things back", () => {
  it("closes a vocabulary recording opened by mistake, having saved nothing", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(screen.getByRole("button", { name: /record a word/ }));
    expect(screen.getByRole("dialog", { name: "Record a word" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Record a word" })).toBeNull();
    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);
    // Back on the question, with the grades still waiting.
    expect(screen.getByRole("button", { name: /Good/ })).toBeDefined();
  });

  it("goes back to the box when Submit came too early, the answer intact", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa"); // half-written
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("You wrote")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /keep writing/ }));
    const field = screen.getByLabelText("Your Latin") as HTMLTextAreaElement;
    expect(field.value).toBe("Puella rosa");

    await user.type(field, "m amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    // Written and reference, now the same sentence.
    expect(sentences()).toEqual(["Puella rosam amat.", "Puella rosam amat."]);
    // Nothing was graded on the way, so nothing was written down.
    expect(session.progress().topicCards.decl1).toBeUndefined();
  });

  it("takes back a grade given by mistake, schedule and trail with it", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosam amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Again/ })); // meant Easy

    // The grade landed and the next question is up.
    expect(session.progress().topicMastery.decl1).toBe(1);
    expect(screen.getByText(`${profile.ui.promptDirection} · 2/2`)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Undo last grade" }));

    // The question is back as it was left…
    expect(screen.getByText(`${profile.ui.promptDirection} · 1/2`)).toBeDefined();
    expect(screen.getByText("The girl loves the rose.")).toBeDefined();
    expect(screen.getByText("You wrote")).toBeDefined();
    expect(sentences()).toEqual(["Puella rosam amat.", "Puella rosam amat."]);
    // …and so is the engine: no card, no mastery, and the trail back to the
    // one answer placement left on this topic before study began.
    expect(session.progress().topicCards.decl1).toBeUndefined();
    expect(session.progress().topicMastery.decl1).toBeUndefined();
    expect(session.attemptsFor("decl1")).toHaveLength(1);

    // One grade deep and no further: nothing older waits behind it.
    expect(screen.queryByRole("button", { name: "Undo last grade" })).toBeNull();

    // Grading again applies once, not twice.
    await user.click(screen.getByRole("button", { name: /Easy/ }));
    expect(session.progress().topicMastery.decl1).toBe(2);
    expect(session.attemptsFor("decl1")).toHaveLength(2);
    expect(session.attemptsFor("decl1")[0]?.rating).toBe(4);
  });

  it("takes back a vocabulary grade too", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    // Record a word, finish the topic, and meet the card it created.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(screen.getByText(`Vocabulary · ${profile.ui.sayItIn}`)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: /Again/ }));
    expect(session.vocabCard("v-rex")?.fsrs.reps).toBe(1);

    await user.click(screen.getByRole("button", { name: "Undo last grade" }));
    expect(screen.getByText(`Vocabulary · ${profile.ui.sayItIn}`)).toBeDefined();
    expect(screen.getByText("rex, rēgis")).toBeDefined(); // still revealed
    expect(session.vocabCard("v-rex")?.fsrs.reps).toBe(0);
  });
});

describe("the topic in the status bar", () => {
  it("opens the grammar while the question is still unanswered", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    // A new topic teaches first, so close what it opened and get to the box.
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Your Latin")).toBeDefined();

    // The screen you are stuck on is the one you are writing on, and until now
    // the topic's name there was the only thing to reach for and did nothing.
    await user.click(
      screen.getByRole("button", { name: "Read the grammar for First declension" }),
    );
    const sheet = screen.getByRole("dialog", { name: "First declension" });
    expect(within(sheet).getByText(/First-declension nouns end in -a/)).toBeDefined();
    expect(within(sheet).getByText("§ 20-22")).toBeDefined();

    // Closing goes back to the question, with what was written still there.
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Your Latin")).toBeDefined();
  });

  it("returns to the sheet it was opened over", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Close" }));

    // Opened over the schedule, closing the grammar restores the schedule
    // rather than dropping the student back on the question.
    await user.click(screen.getByRole("button", { name: "What is coming up" }));
    expect(screen.getByRole("dialog", { name: "Coming up" })).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "Read the grammar for First declension" }),
    );
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Coming up" })).toBeDefined();
  });
});

describe("the grammar map", () => {
  it("quizzes any topic on demand, ahead of the scheduler", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    // Only the open family shows its topics; Verb forms is not the one open.
    await user.click(screen.getByRole("button", { name: /^Verb forms/ }));
    await user.click(screen.getByRole("button", { name: /Present indicative/ }));
    await user.click(screen.getByRole("button", { name: "Quiz me" }));

    // Straight to a test on the chosen topic, not the one the scheduler wanted.
    expect(screen.getByText("The poet praises the queen.")).toBeDefined();
  });

  it("says what each topic is, rather than numbering it", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Grammar map" }));

    // Each topic is a row carrying Bennett's § reference, its title and where
    // the student stands on it — not a square labelled with its position.
    expect(
      screen.getByRole("button", { name: /§ 23-27\s*Second declension\s*not started/ }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2" })).toBeNull();

    // The family says what its own percentage is a percentage of.
    expect(screen.getByRole("button", { name: /^Nouns 2 topics · \d+% mastered/ })).toBeDefined();
  });

  it("reads a section in full from the map", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    await user.click(screen.getByRole("button", { name: /Second declension/ }));
    await user.click(screen.getByRole("button", { name: /Read §/ }));

    const sheet = screen.getByRole("dialog", { name: "Second declension" });
    expect(
      within(sheet).getByText("Second-declension nouns end in -us."),
    ).toBeDefined();
  });

  it("teaches before testing on a topic never seen", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    // The first topic is new, so its section is already open.
    const sheet = screen.getByRole("dialog", { name: "First declension" });
    expect(
      within(sheet).getByText("First-declension nouns end in -a."),
    ).toBeDefined();
  });
});

/**
 * The section you opened is rarely the whole of what you wanted to read, and
 * the § next door used to cost a close, a map and another pick. So the reader
 * pages, and what it lands on can be studied without leaving it.
 */
describe("reading on", () => {
  /** Open the map on First declension and read it. */
  async function read(user: ReturnType<typeof userEvent.setup>) {
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    const map = screen.getByRole("dialog", { name: "Grammar map" });
    await user.click(within(map).getByRole("button", { name: /First declension/ }));
    await user.click(screen.getByRole("button", { name: /Read §/ }));
  }

  it("swipes on to the next section of the book, and studies it from there", async () => {
    const user = userEvent.setup();
    mount();
    await read(user);
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();

    swipe(240, 100);
    const sheet = screen.getByRole("dialog", { name: "Second declension" });
    expect(
      within(sheet).getByText("Second-declension nouns end in -us."),
    ).toBeDefined();

    // The arrow is what turns reading a section into studying it: everything
    // the map offers on a topic, reached from the page itself.
    await user.click(screen.getByRole("button", { name: "Study Second declension" }));
    const topic = screen.getByRole("dialog", { name: "Second declension" });
    expect(within(topic).getByRole("button", { name: "Study from here" })).toBeDefined();
    expect(within(topic).getByRole("button", { name: /Practise these/ })).toBeDefined();
    await user.click(within(topic).getByRole("button", { name: "Quiz me" }));

    expect(screen.getByText("The master frees the slave.")).toBeDefined();
  });

  it("goes back the way it came, page by page", async () => {
    const user = userEvent.setup();
    mount();
    await read(user);

    swipe(240, 100); // on to Second declension
    swipe(100, 240); // and back to where the reading started
    expect(
      within(screen.getByRole("dialog", { name: "First declension" })).getByText(
        "First-declension nouns end in -a.",
      ),
    ).toBeDefined();

    // Paging away and asking what can be done with the new section stacks:
    // closing is the page it was asked from, not the map two steps back.
    swipe(240, 100);
    await user.click(screen.getByRole("button", { name: "Study Second declension" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: /Previous section: § 20-22 First declension/ }),
    ).toBeDefined();

    // And under the reading, still, the topic and the map it was opened from.
    await user.click(screen.getByRole("button", { name: "Close" }));
    const topic = screen.getByRole("dialog", { name: "First declension" });
    expect(within(topic).getByRole("button", { name: "Quiz me" })).toBeDefined();
    await user.click(within(topic).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Grammar map" })).toBeDefined();
  });
});

/**
 * Sync is silent by design — debounced, retried, and reported in Settings
 * rather than in the way. The floppy is the one thing it says out loud, and it
 * says it for a moment.
 */
describe("saving to the cloud", () => {
  const floppy = () => document.querySelector(".floppy");

  /** A GitHub that has no file yet, and whose commit finishes when we say. */
  function stubGitHub() {
    let finish: (() => void) | undefined;
    const put = { ok: true, status: 200, json: async () => ({ content: { sha: "s2" } }) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { method?: string }) => {
        if (init?.method !== "PUT") return { ok: false, status: 404 };
        await new Promise<void>((resolve) => (finish = resolve));
        return put;
      }),
    );
    return () => finish?.();
  }

  const CONFIG = {
    token: "t",
    owner: "someone",
    repo: "progress",
    path: "latin.json",
    branch: "main",
  };

  it("shows a floppy while the push is in flight, then takes it away", async () => {
    const commit = stubGitHub();
    const { session, storage } = mount();

    // Nothing is said while sync is off, which is every device by default.
    expect(floppy()).toBeNull();

    await act(async () => {
      storage.configure(CONFIG);
    });
    expect(floppy()).toBeNull();

    // A push, held open at the commit.
    let pushed: Promise<void>;
    await act(async () => {
      pushed = storage.saveNow(session.progress());
    });
    expect(floppy()).not.toBeNull();
    // Decoration only: it never takes a tap, and it is not read out.
    expect(floppy()?.getAttribute("aria-hidden")).toBe("true");

    await act(async () => {
      commit();
      await pushed;
    });
    // It fades rather than vanishing, so it is still there for a moment.
    expect(floppy()?.className).toContain("floppy--out");
    await passTime(900);
    expect(floppy()).toBeNull();
  });

  it("says nothing when the push fails — Settings reports that", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "nope" })),
    );
    const { session, storage } = mount();
    await act(async () => {
      storage.configure(CONFIG);
    });
    await act(async () => {
      await storage.saveNow(session.progress());
    });

    // The push is over, failed. The floppy is on its way out rather than
    // sitting on screen claiming a save that did not happen.
    await passTime(900);
    expect(floppy()).toBeNull();
    // And the question was never interrupted by it.
    expect(screen.getByRole("button", { name: "Reveal" })).toBeDefined();
  });
});

describe("progress", () => {
  it("survives a reload through local storage", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    const saved = new SyncingStorage().read();
    expect(saved?.topicMastery.decl1).toBe(2);
    expect(saved?.updatedAt).toBe(session.progress().updatedAt);
  });
});

/**
 * The words behind the question.
 *
 * The sentences are drawn from frequency ranks 400–6000, so a beginner meets
 * words nobody has taught them. This is the way out that is not "submit nothing
 * and grade yourself again".
 */
describe("the question's vocabulary", () => {
  const toggle = () => screen.getByRole("button", { name: /Vocabulary/ });

  it("stays folded away until it is asked for, on the answering screen", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);

    // Counted from the sentence, so the number is honest before any lookup.
    expect(toggle().textContent).toContain("3 words");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("rosa, rosae (f)")).toBeNull();

    await user.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    // The prompt's own English against the Latin in its dictionary form.
    expect(screen.getByText("rose")).toBeDefined();
    expect(screen.getByText("rosa, rosae (f)")).toBeDefined();
    expect(screen.getByText("amō, amāre, amāvī, amātum")).toBeDefined();

    await user.click(toggle());
    expect(screen.queryByText("rosa, rosae (f)")).toBeNull();
  });

  it("names a word the dictionary has not got rather than leaving it out", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    await user.click(toggle());

    // `Puella` is not in this fixture's dictionary; the sentence still needs it.
    expect(screen.getByText("Puella")).toBeDefined();
    expect(screen.getByText("not in the dictionary")).toBeDefined();
  });

  it("does not take the answer box away to show the words", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    const box = screen.getByLabelText("Your Latin");
    await user.type(box, "Puella ros");
    await user.click(toggle());

    // Opened in place, above the box — the half-written answer is still there.
    expect(screen.getByText("rosa, rosae (f)")).toBeDefined();
    expect((screen.getByLabelText("Your Latin") as HTMLTextAreaElement).value).toBe(
      "Puella ros",
    );
  });

  it("is still open after submitting, and closed on the next question", async () => {
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    await user.click(toggle());
    expect(screen.getByText("rosa, rosae (f)")).toBeDefined();

    // Submitting is the same sentence, so the crib stays where it was put.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("rosa, rosae (f)")).toBeDefined();

    // Grading moves to a new sentence, and the last one's crib is not it.
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("records a word held down in the list, without asking which word it was", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(toggle());

    await holdCribRow("rosa, rosae (f)");

    // The crib is the lookup, so by the time a row is on screen there is
    // nothing left to disambiguate — the row names the entry it found.
    expect(screen.queryByRole("dialog", { name: /Which word/ })).toBeNull();
    expect(session.vocabCard("v-rosa")?.citation).toBe("rosa, rosae (f)");
    expect(screen.getByText("Saved rosa, rosae (f)")).toBeDefined();
  });

  it("stops at a scroll, so reading the list past the fold saves nothing", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(toggle());

    await holdCribRow("rosa, rosae (f)", () => {
      fireEvent.scroll(document.querySelector(".study__scroll")!);
    });

    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);
  });

  it("offers the card by hand when the held row is a word it has not got", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(toggle());

    await holdCribRow("not in the dictionary");

    // The crib is where a word is most obviously missing, so it is the likeliest
    // place to want to write one — the same sheet as from the lookup box.
    const sheet = screen.getByRole("dialog", { name: "Write the card yourself" });
    expect(within(sheet).getByLabelText("Citation")).toHaveProperty(
      "value",
      "Puella",
    );
    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);
  });

  it("says the dictionary is missing rather than calling every word unknown", async () => {
    dictionary.available = false;
    const user = userEvent.setup();
    mount();
    await skipPlacement(user);
    await user.click(toggle());

    expect(
      screen.getByText(/dictionary hasn’t been saved to this device/),
    ).toBeDefined();
  });
});

describe("the three ways to move through the book", () => {
  /** The topic the status bar says is being studied. */
  const onScreen = () =>
    document.querySelector(".status__title")?.textContent ?? "";

  /** Open the map, expand a family, and pick a topic's row inside it. */
  const pickTopic = async (
    user: ReturnType<typeof userEvent.setup>,
    family: RegExp,
    name: RegExp,
  ) => {
    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    await user.click(screen.getByRole("button", { name: family }));
    await user.click(screen.getByRole("button", { name }));
  };

  it("quizzes a topic without moving where study is", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    await pickTopic(user, /Verb forms/, /Present indicative/);
    await user.click(screen.getByRole("button", { name: "Quiz me" }));
    expect(onScreen()).toBe("Present indicative");

    // "Quiz me" is a look ahead and leaves nothing behind on purpose.
    expect(session.progress().frontiers).toEqual({});
    expect(session.focusState()).toEqual({ kind: "sweep" });
  });

  it("carries study on from the topic Study from here was tapped on", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    expect(onScreen()).toBe("First declension");

    await pickTopic(user, /Verb forms/, /Present indicative/);
    await user.click(screen.getByRole("button", { name: "Study from here" }));

    expect(session.progress().frontiers).toEqual({ "verb-forms": "pres" });
    expect(onScreen()).toBe("Present indicative");
    expect(screen.getByText("on Verb forms")).toBeDefined();

    // The way out is on screen beside it, and it goes back to the book.
    await user.click(screen.getByRole("button", { name: "back to the book" }));
    expect(session.focusState()).toEqual({ kind: "sweep" });
  });

  it("stays on a topic and works the questions a test never reached", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    // One of this topic's two questions has been answered, by the probe.
    expect(session.coverage("decl1")).toEqual({ answered: 1, total: 2 });
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    // The graded screen's ↻ gave its slot up to marking; the topic sheet has
    // always offered the same drill by name, and it says how much is left.
    // Nouns is the family being studied, so the map opens on it already.
    await user.click(screen.getByRole("button", { name: "Grammar map" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Practise these 1" }));
    expect(screen.getByText(/Staying on “First declension”/)).toBeDefined();

    // The sheet closes onto the question that was on the table; the drill
    // takes over when the round ends.
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(onScreen()).toBe("First declension");
    // The one question nobody had answered is the one it serves.
    expect(screen.getByText("The sailors feared the storm.")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(session.coverage("decl1")).toEqual({ answered: 2, total: 2 });
    // Nothing left to practise, so the drill lets go and the book resumes.
    expect(session.focusState()).toEqual({ kind: "sweep" });
    expect(onScreen()).toBe("Second declension");
  });

  it("costs a topic one review per round of questions, not one per question", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);

    // decl1's test holds two questions; both are one round.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(session.progress().topicCards.decl1!.reps).toBe(1);
    // Mastery still counts every question answered.
    expect(session.progress().topicMastery.decl1).toBe(3);
  });
});
