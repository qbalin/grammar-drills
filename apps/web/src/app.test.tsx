import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Content,
  Session,
  emptyProgress,
  type ContentData,
  type Progress,
} from "@lang-tutor/core";
import { testProfile } from "@lang-tutor/core/testing";
import { profile } from "./pack.js";
import { App } from "./app.js";
import { loadDictionary, loadParadigms } from "./content-loader.js";
import { SyncingStorage } from "./storage/sync.js";

// The app fetches the dictionary as soon as it is up. These tests supply it
// already in hand so the vocabulary flow can be driven without a network —
// except where the point is what happens when the fetch cannot happen at all.
const dictionary = { available: true };
// The paradigms are a second, later fetch — the file `build-paradigms.mjs`
// writes, small enough to spell out: a header of interned tag signatures, then
// one tab-separated line per `lemma|pos`.
const PARADIGMS = [
  "nominative,singular|genitive,singular|nominative,plural",
  "manus|noun\t0:manus\t1:manūs\t2:manūs",
  "rex|noun\t0:rēx\t1:rēgis",
].join("\n");
// The paradigm fetch can fail on its own — it is the largest asset and the
// last to be asked for. Flagged separately from the dictionary because the two
// failures look nothing alike to a student.
const paradigmFile = { available: true };
vi.mock("./content-loader.js", async () => {
  const { ParadigmIndex } = await import("./paradigm-index.js");
  return {
    loadDictionary: vi.fn(async () => {
      if (!dictionary.available) throw new Error("offline");
      return {} as never;
    }),
    dictionaryReady: () => dictionary.available,
    loadParadigms: vi.fn(async () => {
      if (!paradigmFile.available) throw new Error("offline");
      return new ParadigmIndex(PARADIGMS);
    }),
  };
});

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

function mount(progress?: Progress, data: ContentData = fixture) {
  const content = new Content(data, testProfile);
  const session = new Session(content, progress);
  const storage = new SyncingStorage();
  render(<App content={content} session={session} storage={storage} />);
  return { session, content, storage };
}

/** The small line above the prompt, which carries the within-test counter. */
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

/** Double-click a word, which asks what it is rather than recording it. */
async function inspectWord(word: string) {
  const span = wordSpan(word);
  if (!span) throw new Error(`no word “${word}” on screen`);
  await act(async () => {
    fireEvent.doubleClick(span);
  });
}

/**
 * Hold a word down inside one block, since the same word stands in both the
 * reference and what was written and the whole point is telling them apart.
 */
async function holdWordIn(selector: string, word: string) {
  const span = wordsIn(selector).find(
    (el) => el.dataset.word?.replace(/[^\p{Letter}]/gu, "") === word,
  );
  if (!span) throw new Error(`no word “${word}” in ${selector}`);
  fireEvent.pointerDown(span, { clientX: 20, clientY: 20 });
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

beforeEach(() => {
  localStorage.clear();
  dictionary.available = true;
  vi.unstubAllGlobals();
});

describe("the study loop", () => {
  it("counts questions through the test", async () => {
    const user = userEvent.setup();
    mount();

    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/2`);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 2/2`);
  });

  it("opens on the first topic of the book", async () => {
    const { session } = mount();

    // Its title is in the status bar and again in the section sheet that opens
    // on new ground, so scope to the bar.
    expect(document.querySelector(".status__title")?.textContent).toBe(
      "First declension",
    );
    expect(session.progress().topicCards).toEqual({});
  });

  it("shows what was written beside the reference, then grades", async () => {
    const user = userEvent.setup();
    const { session } = mount();

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

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    // Nothing was written, so nothing is reported as written.
    expect(screen.queryByText("You wrote")).toBeNull();
    expect(screen.getByText("Reference")).toBeDefined();
  });

  it("says when each grade would bring the topic back", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // A fresh card's learning steps are minutes; "Easy" jumps to days.
    expect(screen.getByRole("button", { name: /Again/ }).textContent).toMatch(/\d+m$/);
    expect(screen.getByRole("button", { name: /Easy/ }).textContent).toMatch(/\d+d$/);
  });

  it("says it in words once the round can no longer be saved", async () => {
    const user = userEvent.setup();
    mount();

    // The round is scheduled by its worst answer, so this decides it.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Again/ }));

    // On the round's second question, every grade now lands on the same day.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText(/whatever you press/)).toBeDefined();
    // Said once, rather than printed under all four — which reads as a fault.
    for (const label of [/Again/, /Hard/, /Good/, /Easy/]) {
      expect(screen.getByRole("button", { name: label }).textContent).not.toMatch(
        /\d+[mhd]$/,
      );
    }
  });

  it("rests once the book is worked out, rather than showing an empty screen", () => {
    // Every topic already at the top band, so the book has nowhere to go.
    mount({
      ...emptyProgress(),
      topicMastery: { decl1: 4, decl2: 4, pres: 4 },
    });

    expect(screen.getByText("The book is worked out.")).toBeDefined();
    // And with nothing due either, the switch has nowhere to send you.
    for (const name of ["Explore", "Review"]) {
      expect(screen.getByRole("button", { name })).toHaveProperty("disabled", true);
    }
  });
});

describe("the answer trail", () => {
  it("keeps what was written, so a topic's earlier answers can be re-read", async () => {
    const user = userEvent.setup();
    const { session } = mount();

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

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(session.attemptsFor("decl1")[0]?.submitted).toBe("");
  });

  it("folds the topic's earlier answers into the graded screen", async () => {
    const user = userEvent.setup();
    mount();

    // The em dash tells the disclosure from the grammar sheet's ↺, which is
    // labelled "Earlier answers" too and is the long way round to the same
    // thing.
    const trail = () =>
      screen.queryByRole("button", { name: /Earlier answers —/ });
    const expanded = () => trail()?.getAttribute("aria-expanded");
    const opened = () => document.querySelector("#earlier-answers");

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    // Nothing has been written on this topic before, so there is no trail yet.
    expect(trail()).toBeNull();
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    // The second question of the same topic. The answer just graded has joined
    // the trail; the question on screen has not.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(trail()?.textContent).toContain("1 on this topic");
    expect(expanded()).toBe("false");
    expect(opened()).toBeNull();

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
    expect(corrections()).toHaveLength(1);
  });

  it("marks a right answer instead of printing it back as a correction", async () => {
    const user = userEvent.setup();
    mount();

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

    // A word saved now falls due at once, so switching to the reviews leads to
    // a vocabulary card rather than a test — the branch of `advance` that
    // serves nothing and used to write nothing either.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    expect(session.vocabList()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.getByRole("button", { name: "Show" })).toBeDefined();
    expect(new SyncingStorage().read()?.openRound).toBeNull();
  });

  /** The one way out of a set that is not the switch, and it is deliberate. */
  it("hands the round over when another topic is taken up from the index", async () => {
    const user = userEvent.setup();
    mount();
    expect(topic()).toBe("First declension");

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /^Verb forms/ }));
    await user.click(screen.getByRole("button", { name: /Present indicative/ }));
    await user.click(screen.getByRole("button", { name: "Study from here" }));
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

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: /All 2 questions/ }));
    await user.click(screen.getByRole("button", { name: /The girl loves the rose/ }));

    // The question sheet leaves the correction and the prompt off every row —
    // both stand above it, once. Under the marker they come back, because a
    // row with nothing on it to mark is not a row you can mark.
    expect(document.querySelector(".attempt .attempt__answer")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Mark up this answer" })[0]!);
    expect(
      document.querySelector(".attempt--marking .attempt__answer")?.textContent,
    ).toContain("Puella rosam amat.");
  });

  it("drops the marks on a sentence that is rewritten, and keeps the rest", async () => {
    const user = userEvent.setup();
    const { session } = mount();

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

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(mark());
    await tapWord(user, ".compare__block--reference", "rosam");
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Undo last grade" }));

    expect(bold(".compare__block--reference")).toEqual(["rosam"]);
    await user.click(screen.getByRole("button", { name: /Hard/ }));
    // One attempt for the re-grade, not two, and it kept what was marked.
    const trail = session.attemptsFor("decl1");
    expect(trail).toHaveLength(1);
    expect(trail[0]!.rating).toBe(2);
    expect(trail[0]!.marks).toEqual({ answer: { 1: 1 } });
  });
});

/**
 * Taking one of the three texts off the screen.
 *
 * The reason there is a button at all: both Latin sentences are drawn a word at
 * a time so each word can be held down, and `.word` gives up text selection to
 * keep iOS's magnifier off that hold — so neither sentence can be copied by
 * hand, and the reference answer is the one a student most wants elsewhere.
 */
describe("copying the three texts", () => {
  /**
   * What the clipboard now holds.
   *
   * No stub of our own: jsdom has no clipboard, `userEvent.setup()` installs
   * one, and anything put there first would be shadowed by it — user-event
   * checks for its own brand on whatever it finds and replaces what is not its.
   * So these read back through the very stub the app wrote to, which means
   * `setup()` has to run before the click in every test here.
   */
  const clipboard = () => navigator.clipboard.readText();

  it("copies the reference answer, and says which text it took", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(
      screen.getByRole("button", { name: "Copy the reference answer" }),
    );

    // The whole sentence, not the word spans run together with the label or the
    // attribution — which is the thing the button exists to get right.
    expect(await clipboard()).toBe("Puella rosam amat.");
    await screen.findByText("The reference copied.");
  });

  it("copies what was written, as it was written", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByRole("textbox"), "Puella rosa amo.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await user.click(
      screen.getByRole("button", { name: "Copy what you wrote" }),
    );

    // Deliberately the wrong Latin: this button takes the student's own
    // sentence, and nothing on this screen corrects it.
    expect(await clipboard()).toBe("Puella rosa amo.");
    await screen.findByText("What you wrote copied.");
  });

  it("copies the question while marking, rather than marking a word", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /mark/ }));

    await user.click(screen.getByRole("button", { name: "Copy the question" }));

    expect(await clipboard()).toBe("The girl loves the rose.");
    await screen.findByText("The question copied.");
    // The button is not a word, so the tap that copied picked nothing out.
    expect(document.querySelectorAll(".prompt .word--b")).toHaveLength(0);
  });

  it("offers nothing to copy where nothing was written", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("nothing")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Copy what you wrote" }),
    ).toBeNull();
    // The other two are still there — an empty answer is not a bare screen.
    expect(
      screen.getByRole("button", { name: "Copy the reference answer" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy the question" })).toBeDefined();
  });

  it("offers nothing to copy on an answer that was revealed", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // Not hidden so much as absent: the block it would sit in is gone.
    expect(screen.queryByText("You wrote")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy what you wrote" }),
    ).toBeNull();
  });

  it("takes the quoted sentence without its attribution", async () => {
    const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
    const quoted: ContentData = {
      ...fixture,
      tests: {
        ...fixture.tests,
        decl1: [
          {
            id: "decl1-q1",
            sectionId: "decl1",
            questions: [
              {
                prompt: "Gaul is divided into three parts.",
                answer: "Gallia est omnis dīvīsa in partēs trēs.",
                kind: "translate-en-la" as const,
                vocab: [],
                source: cite,
              },
            ],
          },
        ],
      },
    };
    const user = userEvent.setup();
    mount(undefined, quoted);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // The credit is on the screen…
    expect(document.querySelector(".attribution")?.textContent).toContain(
      "Caesar",
    );
    await user.click(
      screen.getByRole("button", { name: "Copy the reference answer" }),
    );
    // …and not on the clipboard. What is wanted elsewhere is the Latin.
    expect(await clipboard()).toBe("Gallia est omnis dīvīsa in partēs trēs.");
  });

  it("says so when the clipboard refuses", async () => {
    const user = userEvent.setup(); // installs the stub this then spies on
    mount();
    const denied = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(
      screen.getByRole("button", { name: "Copy the reference answer" }),
    );

    await screen.findByText("Could not copy.");
    // `beforeEach` only unstubs globals, and the stub object outlives this test.
    denied.mockRestore();
  });
});

describe("vocabulary", () => {
  it("offers the candidates for an ambiguous form, most frequent first", async () => {
    const user = userEvent.setup();
    const { session } = mount();
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
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));

    expect(screen.getByText(/dictionary hasn't been saved/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Look up" })).toBeNull();
  });

  it("asks for the Latin from the English, and schedules the answer", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await user.click(screen.getByRole("button", { name: /Good/ }));

    // A new card is due at once, so the reviews have it — a word is a review,
    // and the book is what the other errand is for.
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText(`Vocabulary · ${profile.ui.sayItIn}`)).toBeDefined();
    expect(screen.getByText("king")).toBeDefined();
    expect(screen.queryByText("rex, rēgis")).toBeNull(); // still hidden

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("rex, rēgis")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(session.vocabCard("v-rex")?.fsrs.reps).toBe(1);
  });
});

/**
 * Everything is fetched when the app opens, not when a gesture first wants it.
 * The bytes are identical either way; what "on demand" bought was a spinner in
 * front of a student's first hold on a word, on a device that had been sitting
 * idle on wifi since it was installed.
 */
describe("fetching the content", () => {
  beforeEach(() => {
    vi.mocked(loadDictionary).mockClear();
    vi.mocked(loadParadigms).mockClear();
  });

  it("asks for the dictionary at launch, with nothing having wanted it", async () => {
    // A device that has not got it: nothing is typed, held or opened here, so
    // the only thing that can have sent this request is the launch.
    dictionary.available = false;
    mount();

    await waitFor(() => expect(loadDictionary).toHaveBeenCalled());
  });

  it("goes on to the tables once the dictionary is in hand", async () => {
    mount();

    // After the dictionary rather than beside it: the larger file and the rarer
    // gesture, which the crib must not queue behind.
    await waitFor(() => expect(loadParadigms).toHaveBeenCalled());
  });

  it("does not fetch the tables when the dictionary could not be got", async () => {
    dictionary.available = false;
    mount();

    await waitFor(() => expect(loadDictionary).toHaveBeenCalled());
    // Nothing is learned by failing at the bigger file too — the connection is
    // what is missing, and the retry below asks for both.
    expect(loadParadigms).not.toHaveBeenCalled();
  });

  it("asks again when the device comes back online", async () => {
    dictionary.available = false;
    mount();
    await waitFor(() => expect(loadDictionary).toHaveBeenCalledTimes(1));

    dictionary.available = true;
    fireEvent(window, new Event("online"));

    await waitFor(() => expect(loadParadigms).toHaveBeenCalled());
  });
});

describe("looking a word up", () => {
  it("shows the word's own table, not the model in the book", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText("Your Latin"), "regem");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await inspectWord("regem");

    const sheet = screen.getByRole("dialog", { name: "rex, rēgis" });
    expect(within(sheet).getByText("king")).toBeDefined();
    // The forms as this word inflects them, in the cells the pack declared —
    // the pack being the real one, since the app is built one language at a
    // time and `profile` is compiled in.
    expect(within(sheet).getByRole("columnheader", { name: "Singular" })).toBeDefined();
    expect(within(sheet).getByRole("rowheader", { name: "Gen." })).toBeDefined();
    expect(within(sheet).getByText("rēgis")).toBeDefined();
  });

  it("says what it knows about a word whose forms it has not got", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // `rosa` is in the dictionary and not in the paradigm file — the ordinary
    // case for a rarer word. The citation and the gloss are still the answer to
    // most of what was asked, so the sheet opens rather than nothing happening.
    await inspectWord("rosam");
    const sheet = screen.getByRole("dialog", { name: "rosa, rosae (f)" });
    expect(within(sheet).getByText("rose")).toBeDefined();
    expect(within(sheet).queryByRole("table")).toBeNull();
    // The tables arrived and this word is not in them, which is the one case
    // that earns a statement about the word itself.
    expect(within(sheet).getByText(/does not change/)).toBeDefined();
  });

  /**
   * The bug this is here to keep out: a failed fetch used to be swallowed, and
   * the sheet then read exactly like a word with no forms — telling a student
   * that `rex` does not change, which is false about every noun in Latin. The
   * app cannot say anything about the word until it has the file.
   */
  it("blames the download, not the word, when the tables do not arrive", async () => {
    const user = userEvent.setup();
    paradigmFile.available = false;
    try {
      mount();
      await user.type(screen.getByLabelText("Your Latin"), "regem");
      await user.click(screen.getByRole("button", { name: "Submit" }));

      await inspectWord("regem");
      const sheet = screen.getByRole("dialog", { name: "rex, rēgis" });
      expect(within(sheet).getByText(/Could not load the inflection tables/)).toBeDefined();
      expect(within(sheet).queryByText(/does not change/)).toBeNull();
      // And a way to ask again, since the usual cause is a moment offline.
      expect(within(sheet).getByRole("button", { name: "Try again" })).toBeDefined();
    } finally {
      paradigmFile.available = true;
    }
  });

  // Unlike the hold, nothing here is being saved, so nothing here asks first:
  // the commonest reading opens and the others are one tap away.
  it("opens an ambiguous form on its commonest reading, with the rest beside it", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText("Your Latin"), "manibus");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await inspectWord("manibus");
    expect(screen.queryByRole("dialog", { name: /Which word/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "manus, manūs (f)" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "mānis, māne" }));
    const swapped = screen.getByRole("dialog", { name: "mānis, māne" });
    // And back the way it came, by the same tap.
    expect(within(swapped).getByRole("button", { name: "manus, manūs (f)" })).toBeDefined();
  });

  it("does nothing at all for a word the dictionary has not got", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText("Your Latin"), "Puella");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    // Not the write-a-card sheet the hold offers: this gesture was a question,
    // and there is no answer to give.
    await user.click(screen.getByRole("button", { name: "Close" })); // the book
    await inspectWord("Puella");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * The word onto the clipboard, from the sheet the double-click opened.
   *
   * The block buttons take a whole sentence, and a student who has just asked
   * what one word is usually wants that word — in a note, a message, or the
   * dictionary this app is not. It cannot be lifted by hand: `.word` gives up
   * text selection to keep iOS's magnifier off the hold.
   */
  it("copies the form as it stood in the reference, not the citation", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await inspectWord("rosam");
    await user.click(screen.getByRole("button", { name: "Copy rosam" }));

    // The sheet is titled `rosa, rosae (f)` and the accusative is what was on
    // the screen. Copying the citation instead would hand back the one form the
    // student could have looked up unaided.
    expect(await navigator.clipboard.readText()).toBe("rosam");
    await screen.findByText("rosam copied.");
  });

  it("copies a form out of what was written, too", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText("Your Latin"), "regem");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    // Both sentences are double-clickable, so both are copyable: the word you
    // want is as often the one you got wrong as the one you should have used.
    await inspectWord("regem");
    await user.click(screen.getByRole("button", { name: "Copy regem" }));

    expect(await navigator.clipboard.readText()).toBe("regem");
    await screen.findByText("regem copied.");
  });

  it("leaves the hold alone — the same word still records", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.type(screen.getByLabelText("Your Latin"), "regem");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await inspectWord("regem");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await holdWord("regem");

    expect(session.vocabCard("v-rex")?.citation).toBe("rex, rēgis");
  });
});

describe("holding a word", () => {
  it("records a word held down in the reference answer", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await holdWord("rosam");

    // Straight to the card — no sheet, nothing retyped.
    expect(session.vocabCard("v-rosa")?.citation).toBe("rosa, rosae (f)");
    expect(screen.getByText("Saved rosa, rosae (f)")).toBeDefined();
  });

  it("records a word held down in what you wrote, punctuation and all", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.type(screen.getByLabelText("Your Latin"), "Puella rosam amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    // "amat." is held; the full stop is the sentence's, not the word's.
    await holdWord("amat");
    expect(session.vocabCard("v-amo")?.citation).toBe("amō, amāre, amāvī, amātum");
  });

  it("asks which word it was when the form is ambiguous", async () => {
    const user = userEvent.setup();
    const { session } = mount();
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
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = screen.getByRole("dialog", { name: "Edit word" });
    await user.click(within(sheet).getByRole("button", { name: /Delete this word/ }));
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

    expect(session.vocabCard("v-rosa")).toBeUndefined();
  });

  it("moves on to the next card when the word under review is deleted", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    // Record a word and go to the reviews: a card recorded now is due now.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("rose")).toBeDefined();

    // Delete it from under the review. Grading advances the loop; deleting used
    // to leave the phase pointing at a card the session no longer had, and the
    // body rendered nothing at all — a black screen with no way forward.
    await user.click(screen.getByRole("button", { name: /edit this word/ }));
    const sheet = screen.getByRole("dialog", { name: "Edit word" });
    await user.click(within(sheet).getByRole("button", { name: /Delete this word/ }));
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

    expect(session.vocabCard("v-rosa")).toBeUndefined();
    // The next due card is on screen, and the study body is not empty.
    expect(screen.getByLabelText("Your Latin")).toBeDefined();
    expect(document.querySelector(".prompt")?.textContent).toBeTruthy();
  });

  it("offers no macron keys — the answer box is the whole of the writing surface", () => {
    mount();
    expect(document.querySelector(".macrons")).toBeNull();
    expect(screen.queryByRole("button", { name: "ā" })).toBeNull();
  });
});

/**
 * Grade on, then record a word by typing it into *record a word*.
 *
 * The word is not in the next question's sentences, so there is nothing to hold
 * — which is the path a typed word takes: the sentence it is kept with is the
 * question that was on screen, found rather than pointed at.
 */
async function recordOnNextQuestion(
  user: ReturnType<typeof userEvent.setup>,
  form: string,
) {
  await user.click(screen.getByRole("button", { name: /Good/ }));
  await user.click(screen.getByRole("button", { name: "Reveal" }));
  await user.click(screen.getByRole("button", { name: /record a word/ }));
  await user.type(screen.getByLabelText(/Type the word/), form);
  await user.click(screen.getByRole("button", { name: "Look up" }));
}

describe("the sentence a held word was met in", () => {
  /** Submit a wrong answer, so the two blocks carry different sentences. */
  async function submitWrong(user: ReturnType<typeof userEvent.setup>) {
    const mounted = mount();
    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    return mounted;
  }

  it("keeps the reference when the word was held in the reference", async () => {
    const user = userEvent.setup();
    const { session } = await submitWrong(user);

    await holdWordIn(".compare__block--reference", "rosam");

    const [context] = session.vocabContexts("v-rosa");
    expect(context?.prompt).toBe("The girl loves the rose.");
    expect(context?.sentence).toBe("Puella rosam amat.");
    expect(context?.source).toBe("answer");
    // The word that was actually under the thumb, not merely the sentence.
    expect(context?.index).toBe(1);
  });

  it("keeps what the student wrote when the word was held there", async () => {
    const user = userEvent.setup();
    const { session } = await submitWrong(user);

    // The block that is not the reference is the one you wrote.
    await holdWordIn(".compare__block:not(.compare__block--reference)", "amat");

    const [context] = session.vocabContexts("v-amo");
    expect(context?.sentence).toBe("Puella rosa amat.");
    // Labelled, because this sentence is wrong and the card must not draw it
    // as though the book had written it.
    expect(context?.source).toBe("submitted");
  });

  it("keeps the reference sentence when a crib row is held", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.click(screen.getByRole("button", { name: /Vocabulary — / }));

    await holdCribRow("rosa, rosae (f)");

    const [context] = session.vocabContexts("v-rosa");
    expect(context?.sentence).toBe("Puella rosam amat.");
    expect(context?.source).toBe("answer");
    // The row stands for a form and not a position; the position is found.
    expect(context?.index).toBe(1);
  });

  it("carries the sentence across the sheet that asks which word it was", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.type(screen.getByLabelText("Your Latin"), "manibus");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    // Several taps stand between the press and the card. The sentence has to
    // survive them, and land on the candidate finally chosen.
    await holdWord("manibus");
    await user.click(screen.getByRole("button", { name: /mānis/ }));

    const [context] = session.vocabContexts("v-manis");
    expect(context?.sentence).toBe("manibus");
    expect(context?.source).toBe("submitted");
  });

  it("adds a second sentence to a word already saved, and says which it did", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    expect(screen.getByText("Saved rosa, rosae (f)")).toBeDefined();

    // The same word again, on the same question: one sentence, not two.
    await holdWord("rosam");
    expect(session.vocabContexts("v-rosa")).toHaveLength(1);
    expect(screen.getByText("rosa, rosae (f) is already saved")).toBeDefined();

    // Met again on a different question, and the card takes the new sentence
    // rather than the press doing nothing as it used to.
    await recordOnNextQuestion(user, "rosam");
    expect(screen.getByText("Another sentence on rosa, rosae (f)")).toBeDefined();
    expect(session.vocabContexts("v-rosa")).toHaveLength(2);
    expect(session.vocabContexts("v-rosa")[1]?.sentence).toBe(
      "Nautae procellam timēbant.",
    );
  });

  it("keeps nothing once the student has turned it off", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByLabelText(/Keep the sentence/));
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");

    // The word is still recorded — the preference is about the sentence.
    expect(session.vocabCard("v-rosa")).toBeDefined();
    expect(session.vocabContexts("v-rosa")).toEqual([]);
    expect(session.progress().keepContext).toBe(false);
  });
});

describe("a vocabulary card that remembers where the word was met", () => {
  /** Record a word with a sentence, then go and review it. */
  async function reviewOne(user: ReturnType<typeof userEvent.setup>) {
    const mounted = mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await user.click(screen.getByRole("button", { name: "Review" }));
    return mounted;
  }

  it("shows the sentence under the citation, and only once revealed", async () => {
    const user = userEvent.setup();
    await reviewOne(user);

    // The front is the meaning. The Latin is all behind Show — including the
    // sentence, which would otherwise hand over the answer.
    expect(screen.getByText("rose")).toBeDefined();
    expect(screen.queryByText("The girl loves the rose.")).toBeNull();
    expect(document.querySelector(".compare")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("rosa, rosae (f)")).toBeDefined();
    expect(screen.getByText("The girl loves the rose.")).toBeDefined();
    expect(sentences()).toContain("Puella rosam amat.");
    // The held word is picked out in the sentence it was held in.
    expect(document.querySelector(".mark--b")?.textContent).toBe("rosam");
  });

  it("offers the English of the sentence as a hint, and never the Latin", async () => {
    const user = userEvent.setup();
    await reviewOne(user);

    await user.click(screen.getByRole("button", { name: /hint/ }));
    expect(screen.getByText("The girl loves the rose.")).toBeDefined();
    // The half that cannot give the answer away, and only that half.
    expect(screen.queryByText("Puella rosam amat.")).toBeNull();
    expect(document.querySelector(".compare")).toBeNull();

    // One sentence, one hint: a button with nothing left to give is gone.
    expect(screen.queryByRole("button", { name: /hint/ })).toBeNull();
  });

  it("offers no hint at all on a card with no sentence on it", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByLabelText(/Keep the sentence/));
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await user.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.queryByRole("button", { name: /hint/ })).toBeNull();
  });
});

describe("correcting the sentences on a card", () => {
  /** One card carrying two sentences, with its edit sheet open on them. */
  async function twoSentences(user: ReturnType<typeof userEvent.setup>) {
    const mounted = mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await recordOnNextQuestion(user, "rosam");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    return mounted;
  }

  it("reorders, corrects and deletes, each as it is pressed", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    expect(session.vocabContexts("v-rosa")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = screen.getByRole("dialog", { name: "Edit word" });

    // Correct the one sentence it has.
    await user.click(within(sheet).getByRole("button", { name: /^Edit “/ }));
    const sentence = within(sheet).getByLabelText("The sentence");
    await user.clear(sentence);
    await user.type(sentence, "Puella rosam amābat.");
    await user.click(within(sheet).getByRole("button", { name: "Save sentence" }));
    expect(session.vocabContexts("v-rosa")[0]?.sentence).toBe("Puella rosam amābat.");
    // The picked-out word is found again in the rewritten line.
    expect(session.vocabContexts("v-rosa")[0]?.index).toBe(1);

    // And throwing it away takes two presses, as everything unrecoverable does.
    await user.click(within(sheet).getByRole("button", { name: /^Delete “/ }));
    await user.click(within(sheet).getByRole("button", { name: "Confirm deletion" }));
    expect(session.vocabContexts("v-rosa")).toEqual([]);
    // The word itself is untouched — this deleted a sentence, not a card.
    expect(session.vocabCard("v-rosa")).toBeDefined();
  });

  it("moves a sentence up, which is what the hint then offers first", async () => {
    const user = userEvent.setup();
    const { session } = await twoSentences(user);
    const sheet = screen.getByRole("dialog", { name: "Edit word" });
    const order = () => session.vocabContexts("v-rosa").map((c) => c.sentence);
    expect(order()).toEqual(["Puella rosam amat.", "Nautae procellam timēbant."]);

    // The second row's up arrow: one press, one place, saved as it is pressed.
    const up = within(sheet).getAllByRole("button", { name: /^Move .* up$/ });
    await user.click(up[1]!);
    expect(order()).toEqual(["Nautae procellam timēbant.", "Puella rosam amat."]);

    // And the order is the card's, not the sheet's: it survives closing it.
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(order()).toEqual(["Nautae procellam timēbant.", "Puella rosam amat."]);
  });

  it("greys the arrow that has nowhere to go", async () => {
    const user = userEvent.setup();
    await twoSentences(user);
    const sheet = screen.getByRole("dialog", { name: "Edit word" });

    // The ends say so by being off rather than by answering a press with
    // nothing — and a row that teleported to the far end would be a bug report.
    const up = within(sheet).getAllByRole("button", { name: /^Move .* up$/ });
    const down = within(sheet).getAllByRole("button", { name: /^Move .* down$/ });
    expect(up[0]).toHaveProperty("disabled", true);
    expect(down[0]).toHaveProperty("disabled", false);
    expect(up[1]).toHaveProperty("disabled", false);
    expect(down[1]).toHaveProperty("disabled", true);
  });
});

describe("the vocabulary list", () => {
  /** A word recorded, so there is something to list. */
  async function withOneWord(user: ReturnType<typeof userEvent.setup>) {
    const mounted = mount();
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

  /**
   * The two things in the app that cannot be taken back. Everything else has an
   * undo; these have a second tap instead, and it has to look like one.
   */
  describe("confirming what cannot be undone", () => {
    it("asks for the deletion rather than for the word again", async () => {
      const user = userEvent.setup();
      const { session } = await withOneWord(user);

      await user.click(screen.getByRole("button", { name: "Edit" }));
      const sheet = screen.getByRole("dialog", { name: "Edit word" });
      await user.click(within(sheet).getByRole("button", { name: /Delete this word/ }));

      // The citation used to be the confirming button's label, which reads as
      // a name rather than as a warning — and the word is already on the sheet.
      expect(screen.queryByRole("button", { name: /rosa, rosae/ })).toBeNull();
      const confirm = screen.getByRole("button", { name: "Confirm deletion" });
      expect(confirm.className).toContain("btn--danger");

      // And it can be backed out of, with the card untouched.
      await user.click(screen.getByRole("button", { name: "Keep it" }));
      expect(screen.queryByRole("button", { name: "Confirm deletion" })).toBeNull();
      expect(session.vocabCard("v-rosa")).toBeDefined();
    });

    it("says what erasing the device does before it does it", async () => {
      const user = userEvent.setup();
      const { session } = await withOneWord(user);

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(
        screen.getByRole("button", { name: "Erase progress on this device" }),
      );

      // Not "tap again" on the same button in the same place: a double tap
      // could land on that, and the words did not say what would go.
      const confirm = screen.getByRole("button", { name: "Confirm erasure" });
      expect(confirm.className).toContain("btn--danger");
      expect(
        screen.getByText(/Every grade, schedule and recorded word/),
      ).toBeDefined();

      await user.click(screen.getByRole("button", { name: "Keep it" }));
      expect(screen.queryByRole("button", { name: "Confirm erasure" })).toBeNull();
      expect(session.vocabCard("v-rosa")).toBeDefined();
    });
  });
});

describe("the schedule", () => {
  it("says what is waiting and what comes back when", async () => {
    const user = userEvent.setup();
    mount();
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

    await user.click(screen.getByRole("button", { name: "What is coming up" }));
    expect(screen.getByText(/Nothing is scheduled yet/)).toBeDefined();
  });

  describe("taking one of them now", () => {
    const prompt = () => document.querySelector(".prompt")?.textContent;
    const badge = () =>
      document.querySelector(".status__row .badge")?.textContent ?? "";
    const title = () =>
      document.querySelector(".status__title")?.textContent ?? "";

    /**
     * A deck whose reviews are all overdue. Everything is failed a week back,
     * so every card came due minutes later and has been waiting since.
     *
     * `decl1` is seeded first and so comes due first: it is what the app opens
     * on, which makes `pres` the row a tap has to reach past the scheduler for.
     */
    const waiting = (): Progress => {
      const week = new Date(Date.now() - 7 * 86_400_000);
      const seed = new Session(new Content(fixture, testProfile));
      seed.gradeTopic("decl1", 1, week);
      seed.gradeTopic("pres", 1, new Date(week.getTime() + 1000));
      seed.recordVocab(
        {
          lemma: "rosa",
          citation: "rosa, rosae (f)",
          gloss: "rose",
          pos: "noun",
          rank: 900,
        },
        week,
      );
      return seed.progress();
    };

    /** Open the sheet and hand back the dialog to look inside. */
    const openSchedule = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole("button", { name: "What is coming up" }));
      return screen.getByRole("dialog", { name: "Coming up" });
    };

    it("serves the topic whose row was tapped, not the one next in line", async () => {
      const user = userEvent.setup();
      const { session } = mount(waiting());
      // The scheduler's own pick, which is what this is stepping out of: the
      // waiting word, because words come before grammar in a review.
      expect(title()).toBe("Vocabulary");

      const sheet = await openSchedule(user);
      await user.click(
        within(sheet).getByRole("button", { name: "Review Present indicative now" }),
      );

      expect(screen.queryByRole("dialog", { name: "Coming up" })).toBeNull();
      expect(title()).toBe("Present indicative");
      expect(prompt()).toBe("The poet praises the queen.");
      // Out of turn, but still a review: the round says so and the switch agrees.
      expect(badge()).toBe("review");
      expect(session.progress().openRound?.sectionId).toBe("pres");
      expect(session.progress().openRound?.via).toBe("review");
      expect(document.querySelector(".app")?.getAttribute("data-mode")).toBe(
        "review",
      );
    });

    it("opens the word itself when a waiting word is tapped", async () => {
      const user = userEvent.setup();
      mount(waiting());

      const sheet = await openSchedule(user);
      await user.click(
        within(sheet).getByRole("button", { name: "Review rosa, rosae (f) now" }),
      );

      // The gloss is the card's question, and no grammar title stands over it.
      expect(prompt()).toBe("rose");
      expect(badge()).toBe("vocabulary");
      expect(screen.getByRole("button", { name: "Show" })).toBeDefined();
    });

    it("leaves alone what is not waiting yet", async () => {
      const user = userEvent.setup();
      mount();
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Easy/ }));

      const sheet = await openSchedule(user);
      // Days out, so there is nothing to start: the row reports and no more.
      expect(within(sheet).getByText(/First declension/)).toBeDefined();
      expect(
        within(sheet).queryByRole("button", { name: /Review First declension/ }),
      ).toBeNull();
    });

    it("says why a waiting topic with no questions cannot be started", async () => {
      const user = userEvent.setup();
      // A section the pack carries but has written nothing for. It comes due
      // like any other; it just has nothing to ask.
      const data: ContentData = {
        ...fixture,
        grammar: [
          ...fixture.grammar,
          {
            id: "quirk",
            ref: "300",
            title: "Peculiarities",
            family: "nouns",
            text: "Some nouns decline oddly.",
            order: 200,
          },
        ],
      };
      const week = new Date(Date.now() - 7 * 86_400_000);
      const seed = new Session(new Content(data, testProfile));
      // `decl1` first, so it is what the loop serves — reaching the untested
      // topic would have the loop pass it, and it would not be waiting at all.
      seed.gradeTopic("decl1", 1, week);
      seed.gradeTopic("quirk", 1, new Date(week.getTime() + 1000));

      mount(seed.progress(), data);
      const sheet = await openSchedule(user);

      expect(
        within(sheet).queryByRole("button", { name: /Review Peculiarities/ }),
      ).toBeNull();
      expect(within(sheet).getByText(/no tests written yet/)).toBeDefined();
    });

    it("carries on with the rest of the pile once that one is graded", async () => {
      const user = userEvent.setup();
      mount(waiting());

      const sheet = await openSchedule(user);
      await user.click(
        within(sheet).getByRole("button", { name: "Review Present indicative now" }),
      );
      // One question in this test, so grading it ends the round.
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));

      // Back to the pile in its own order — the jump was for one card, not a
      // new errand of its own — and that order puts the waiting word first.
      expect(title()).toBe("Vocabulary");
      expect(prompt()).toBe("rose");
      // A card names itself rather than the errand it arrived on, as it does
      // wherever else one is served.
      expect(badge()).toBe("vocabulary");
    });

    it("picks a review started this way back up after a reload", async () => {
      const user = userEvent.setup();
      mount(waiting());

      const sheet = await openSchedule(user);
      await user.click(
        within(sheet).getByRole("button", { name: "Review Present indicative now" }),
      );

      cleanup();
      mount(new SyncingStorage().read() ?? undefined);
      // The round survives only because the errand it was served on was set
      // with it: a launch opening on the reviews keeps a review round.
      expect(title()).toBe("Present indicative");
      expect(badge()).toBe("review");
    });
  });
});

describe("a section's questions", () => {
  it("lists every question with its answer, and one question's history", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    // Scoped to the map: the status bar names the same topic, and tapping it
    // opens the grammar rather than the topic sheet.
    const map = screen.getByRole("dialog", { name: "Grammar index" });
    await user.click(within(map).getByRole("button", { name: /First declension/ }));
    await user.click(screen.getByRole("button", { name: /All 2 questions/ }));

    // Both of the section's questions, whether or not they have been served.
    const list = screen.getByRole("dialog", { name: "All questions" });
    expect(within(list).getByText("Puella rosam amat.")).toBeDefined();
    expect(within(list).getByText("Nautae procellam timēbant.")).toBeDefined();
    expect(within(list).getByText(/1 answer · last hard/)).toBeDefined();
    expect(within(list).getByText("not answered yet")).toBeDefined();

    await user.click(within(list).getByRole("button", { name: /The girl loves the rose/ }));
    const one = screen.getByRole("dialog", { name: "Question" });
    expect(within(one).getByText("Your answers")).toBeDefined();
    expect(within(one).getByText("Puella rosa amat.")).toBeDefined();
    expect(within(one).getByText(/hard/)).toBeDefined();
    // The prompt is the sheet's own heading, so it is not repeated per answer.
    expect(within(one).queryByText("The girl loves the rose.")).toBeDefined();
    expect(session.attemptsForQuestion("decl1", "The girl loves the rose.")).toHaveLength(1);
  });
});

// Three taps drive the whole loop, so all three land by mistake: the word
// recorder, Submit, and a grade. None of them should be a dead end.
describe("taking things back", () => {
  it("closes a vocabulary recording opened by mistake, having saved nothing", async () => {
    const user = userEvent.setup();
    const { session } = mount();
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
    // …and so is the engine: no card, no mastery, nothing in the trail.
    expect(session.progress().topicCards.decl1).toBeUndefined();
    expect(session.progress().topicMastery.decl1).toBeUndefined();
    expect(session.attemptsFor("decl1")).toHaveLength(0);

    // One grade deep and no further: nothing older waits behind it.
    expect(screen.queryByRole("button", { name: "Undo last grade" })).toBeNull();

    // Grading again applies once, not twice.
    await user.click(screen.getByRole("button", { name: /Easy/ }));
    expect(session.progress().topicMastery.decl1).toBe(2);
    expect(session.attemptsFor("decl1")).toHaveLength(1);
    expect(session.attemptsFor("decl1")[0]?.rating).toBe(4);
  });

  it("takes back a vocabulary grade too", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    // Record a word, then go to the reviews and meet the card it created.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Review" }));
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

describe("the grammar index", () => {
  it("takes the book up at any topic, ahead of where it had got to", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    // Only the open family shows its topics; Verb forms is not the one open.
    await user.click(screen.getByRole("button", { name: /^Verb forms/ }));
    await user.click(screen.getByRole("button", { name: /Present indicative/ }));
    await user.click(screen.getByRole("button", { name: "Study from here" }));

    // Straight to a test on the chosen topic, not the one the book was at.
    expect(screen.getByText("The poet praises the queen.")).toBeDefined();
  });

  it("says what each topic is, rather than numbering it", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));

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

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /Second declension/ }));
    await user.click(screen.getByRole("button", { name: /Read §/ }));

    const sheet = screen.getByRole("dialog", { name: "Second declension" });
    expect(
      within(sheet).getByText("Second-declension nouns end in -us."),
    ).toBeDefined();
  });

  it("teaches before testing on a topic never seen", () => {
    mount();

    // The first topic is new, so its section is already open.
    const sheet = screen.getByRole("dialog", { name: "First declension" });
    expect(
      within(sheet).getByText("First-declension nouns end in -a."),
    ).toBeDefined();
  });

  it("credits the book the whole syllabus came out of, and links it", async () => {
    // Not a line of this syllabus was written here — the families, the topics
    // and the § numbers are somebody's book. The index is where that is said,
    // once, rather than under all 114 sections.
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Grammar index" }));

    const map = screen.getByRole("dialog", { name: "Grammar index" });
    const { title, url, licence } = profile.grammar.source;
    const link = within(map).getByRole("link", { name: title });
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(map).getByText(licence)).toBeDefined();

    // And not repeated on every page of the reading.
    await user.click(within(map).getByRole("button", { name: /First declension/ }));
    await user.click(screen.getByRole("button", { name: /Read §/ }));
    expect(screen.queryByRole("link", { name: title })).toBeNull();
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
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    const map = screen.getByRole("dialog", { name: "Grammar index" });
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
    expect(within(topic).getByRole("button", { name: /Practise these/ })).toBeDefined();
    expect(within(topic).getByRole("button", { name: "Book order" })).toBeDefined();
    await user.click(within(topic).getByRole("button", { name: "Study from here" }));

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
    expect(within(topic).getByRole("button", { name: "Study from here" })).toBeDefined();
    await user.click(within(topic).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Grammar index" })).toBeDefined();
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
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    const saved = new SyncingStorage().read();
    expect(saved?.topicMastery.decl1).toBe(2);
    expect(saved?.updatedAt).toBe(session.progress().updatedAt);
  });
});

/**
 * Throwing the device's copy away, and taking another one on.
 *
 * Both end the same way — write, then `location.reload()` — and the reload is
 * not the instant thing it reads as. The page is still there for one more turn
 * of the loop, long enough for the draft kept on `pagehide` to write the
 * in-memory session back over what was just written. The erase survived until
 * the reload that was meant to complete it, and the pull was replaced by the
 * page it replaced.
 */
describe("erasing and replacing what is on the device", () => {
  /** jsdom cannot navigate, and the point here is what happens before it would. */
  const stubReload = () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    return reload;
  };

  /** Leave the app on the way out, the way a browser does before unloading. */
  const leave = () => {
    fireEvent(window, new Event("pagehide"));
    fireEvent(document, new Event("visibilitychange"));
  };

  it("erases progress for good, not just until the page goes away", async () => {
    const user = userEvent.setup();
    const reload = stubReload();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(new SyncingStorage().read()).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    // Erasing asks twice, because there is no undo behind it.
    await user.click(screen.getByRole("button", { name: /Erase progress/ }));
    await user.click(screen.getByRole("button", { name: "Confirm erasure" }));
    expect(reload).toHaveBeenCalled();

    // The reload the button asked for, and everything the page says on its way
    // out. None of it may put the progress back.
    leave();
    expect(new SyncingStorage().read()).toBeNull();
  });

  it("keeps what it pulled from GitHub when the page it replaced goes away", async () => {
    const user = userEvent.setup();
    stubReload();

    // The other device's copy, as the contents API hands it over.
    const remote: Progress = {
      ...new Session(new Content(fixture, testProfile)).progress(),
      updatedAt: "2026-07-04T00:00:00.000Z",
      topicMastery: { decl2: 5 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sha: "abc", content: btoa(JSON.stringify(remote)) }),
      })),
    );

    const { storage } = mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await act(async () => {
      storage.configure({
        token: "t",
        owner: "someone",
        repo: "progress",
        path: "latin.json",
        branch: "main",
      });
    });

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Pull the copy/ }));
    });
    // A question was answered above and never pushed, so the pull says what it
    // would cost before making it. Taking the remote anyway is the errand here.
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Pull anyway" }));
    });

    leave();
    const kept = new SyncingStorage().read();
    expect(kept?.updatedAt).toBe("2026-07-04T00:00:00.000Z");
    expect(kept?.topicMastery).toEqual({ decl2: 5 });
  });

  it("says so when the pull cannot reach the repo, rather than nothing at all", async () => {
    const user = userEvent.setup();
    stubReload();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "bad token" })),
    );
    const { storage } = mount();
    await act(async () => {
      storage.configure({
        token: "t",
        owner: "someone",
        repo: "progress",
        path: "latin.json",
        branch: "main",
      });
    });

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Pull the copy/ }));
    });

    expect(document.querySelector(".toast")?.textContent).toContain(
      "Could not pull",
    );
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
    await user.click(toggle());

    // `Puella` is not in this fixture's dictionary; the sentence still needs it.
    expect(screen.getByText("Puella")).toBeDefined();
    expect(screen.getByText("not in the dictionary")).toBeDefined();
  });

  it("does not take the answer box away to show the words", async () => {
    const user = userEvent.setup();
    mount();
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
    await user.click(toggle());

    await holdCribRow("rosa, rosae (f)", () => {
      fireEvent.scroll(document.querySelector(".study__scroll")!);
    });

    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);
  });

  it("offers the card by hand when the held row is a word it has not got", async () => {
    const user = userEvent.setup();
    const { session } = mount();
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
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    // Scoped to the sheet: the status bar names the topic being studied too,
    // and tapping that opens the grammar rather than the topic sheet.
    const map = () => screen.getByRole("dialog", { name: "Grammar index" });
    const head = within(map()).queryByRole("button", { name: family });
    if (head?.getAttribute("aria-expanded") === "false") await user.click(head);
    await user.click(within(map()).getByRole("button", { name }));
  };

  it("carries the book on from the topic Study from here was tapped on", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    expect(onScreen()).toBe("First declension");

    await pickTopic(user, /Verb forms/, /Present indicative/);
    await user.click(screen.getByRole("button", { name: "Study from here" }));

    expect(onScreen()).toBe("Present indicative");
    expect(session.bookCursor()).toBe("pres");
    expect(session.practiseRun()).toBeNull();
  });

  it("puts the book back at the earliest unmastered topic on Book order", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await pickTopic(user, /Verb forms/, /Present indicative/);
    await user.click(screen.getByRole("button", { name: "Study from here" }));
    expect(onScreen()).toBe("Present indicative");

    await pickTopic(user, /Verb forms/, /Present indicative/);
    await user.click(screen.getByRole("button", { name: "Book order" }));
    expect(onScreen()).toBe("First declension");
    expect(session.bookCursor()).toBe("decl1");
    // Reading the book on is not a run, so the badge carries no count.
    expect(document.querySelector(".status__row .badge")?.textContent).toBe("new");
  });

  it("reads on one topic to the next whatever the grade", async () => {
    const user = userEvent.setup();
    mount();

    // Two questions on decl1, both graded "again", so it stays at the floor.
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Again/ }));
    }
    // Under a "first topic not yet mastered" rule this would be decl1 again,
    // for ever. The cursor steps regardless.
    expect(onScreen()).toBe("Second declension");
  });

  it("stays on a topic and works the questions a test never reached", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    // Answer one of this topic's two questions, so a run has one left.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(session.coverage("decl1")).toEqual({ answered: 1, total: 2 });

    // The graded screen's ↻ gave its slot up to marking; the topic sheet has
    // always offered the same practice by name, and it says how much is left.
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Practise these 1" }));
    expect(screen.getByText(/Practising “First declension”/)).toBeDefined();

    // A round is a whole test, so the run re-asks the answered question on the
    // way to the one it is for; the counter counts only the one it is for.
    expect(onScreen()).toBe("First declension");
    expect(document.querySelector(".status__row .badge")?.textContent).toBe("drill 0/1");

    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    expect(session.coverage("decl1")).toEqual({ answered: 2, total: 2 });
    // And having served what it was for, it stops.
    expect(screen.getByText("All practised.")).toBeDefined();
  });

  it("stops on a worked-out run rather than slipping onto the next topic", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Practise these 2" }));
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }

    // Staying here was an instruction; sliding off it is not how one ends.
    expect(screen.getByText("All practised.")).toBeDefined();
    expect(screen.queryByText("The master frees the slave.")).toBeNull();
  });

  it("offers the whole bank again once nothing on it is unanswered", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Practise these 2" }));
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }

    await user.click(screen.getByRole("button", { name: "Practise all 2 again" }));
    expect(session.practice("decl1")).toEqual({ done: 0, total: 2 });
    expect(document.querySelector(".status__row .badge")?.textContent).toBe("drill 0/2");
  });

  it("finds the way back to the book from the stop screen", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Practise these 2" }));
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }

    await user.click(screen.getByRole("button", { name: "Back to the book in order" }));
    expect(session.practiseRun()).toBeNull();
    expect(onScreen()).toBe("First declension"); // still the earliest unmastered
  });

  it("costs a topic one review per round of questions, not one per question", async () => {
    const user = userEvent.setup();
    const { session } = mount();

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

/**
 * The status bar used to name exactly one of the loop's states — `new` — so a
 * due review, a drill and a topic picked off the index were the same four
 * sentences under the same bare title, and "why am I being shown this" had no
 * answer on screen at all.
 */
describe("what is on screen, and why", () => {
  /** The round badge, which a drill carries its run's progress in. */
  const badge = () =>
    document.querySelector(".status__row .badge")?.textContent ?? "";
  const title = () => document.querySelector(".status__title")?.textContent ?? "";

  /** A deck with a topic already failed, so a review is waiting on opening. */
  const withBacklog = () => {
    const s = new Session(new Content(fixture, testProfile));
    s.gradeTopic("decl1", 1, new Date(Date.now() - 60 * 60 * 1000));
    return s.progress();
  };

  it("names new ground as new, and a card come back as a review", async () => {
    mount();
    expect(badge()).toBe("new");

    cleanup();
    mount(withBacklog());
    expect(badge()).toBe("review");
    expect(title()).toBe("First declension");
  });

  it("names a topic the book has come back to, which is neither", () => {
    // decl1 has been graded but is not due, so exploring meets it again.
    const s = new Session(new Content(fixture, testProfile));
    s.gradeTopic("decl1", 4, new Date());
    mount(s.progress());

    // Nothing is due, so the app opens on the book — at decl1, still short of
    // the top band. Met before, so neither new nor a card that fell due.
    expect(badge()).toBe("revisiting");
    expect(title()).toBe("First declension");
    // And it is not taught again: the grammar sheet is for ground never met.
    expect(screen.queryByRole("dialog", { name: "First declension" })).toBeNull();
  });

  it("says a word is on the table, rather than the topic before it", async () => {
    const user = userEvent.setup();
    mount();

    // Record a word, then go to the reviews, where its card is waiting.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Review" }));

    expect(badge()).toBe("vocabulary");
    // It used to read "§ 20-22 First declension", with a way into the grammar
    // of a topic that was not what the student was being asked about.
    expect(title()).toBe("Vocabulary");
    expect(document.querySelector(".status__ref")).toBeNull();
    // And never the citation: that is the answer being graded.
    expect(screen.queryByText("rex, rēgis")).toBeNull();
  });

  it("still says what a round was after the app has been closed and opened", async () => {
    // A deck already practising a topic, so the round served is a drill.
    const s = new Session(new Content(fixture, testProfile));
    s.drillTopic("decl1");
    mount(s.progress());

    // decl1's test holds two questions, and the run has answered neither yet.
    expect(badge()).toBe("drill 0/2");

    cleanup();
    mount(new SyncingStorage().read() ?? undefined);
    // The round is the only place this is written down: `next` says it once,
    // and a reload never asks `next` again for a round already on the table.
    expect(badge()).toBe("drill 0/2");
  });
});

describe("choosing between the reviews and the book", () => {
  const badge = () =>
    document.querySelector(".status__row .badge")?.textContent ?? "";
  const title = () => document.querySelector(".status__title")?.textContent ?? "";
  const counts = () => document.querySelector(".status__counts")?.textContent ?? "";
  const errand = () => document.querySelector(".app")?.getAttribute("data-mode");
  const pressed = (name: string) =>
    screen.getByRole("button", { name }).getAttribute("aria-pressed");

  /** Both noun topics failed an hour ago, leaving the verbs as new ground. */
  const withBacklog = () => {
    const s = new Session(new Content(fixture, testProfile));
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    s.gradeTopic("decl1", 1, hourAgo);
    s.gradeTopic("decl2", 1, hourAgo);
    return s.progress();
  };

  it("opens on the reviews when any are waiting, and on the book when none are", () => {
    mount(withBacklog());
    expect(pressed("Review")).toBe("true");
    expect(pressed("Explore")).toBe("false");
    expect(errand()).toBe("review");
    expect(badge()).toBe("review");

    cleanup();
    mount();
    expect(pressed("Explore")).toBe("true");
    expect(errand()).toBe("explore");
  });

  it("forgets which it was on across a reload", async () => {
    const user = userEvent.setup();
    mount(withBacklog());
    await user.click(screen.getByRole("button", { name: "Explore" }));
    expect(pressed("Explore")).toBe("true");

    // A pile you can see is one thing; a pile a saved preference hides from
    // you on the next launch is another. Opening puts it back in front.
    cleanup();
    mount(new SyncingStorage().read() ?? undefined);
    expect(pressed("Review")).toBe("true");
  });

  it("drops a round the errand it opens on would not have served", async () => {
    const user = userEvent.setup();
    mount(withBacklog());
    // Leave a book round on the table with the reviews still waiting.
    await user.click(screen.getByRole("button", { name: "Explore" }));
    expect(new SyncingStorage().read()?.openRound?.via).toBe("sweep");

    cleanup();
    mount(new SyncingStorage().read() ?? undefined);
    // The pile decides, so the book round is not the one picked back up: a
    // switch reading "Review" over a topic the book served would be naming
    // something that is not happening.
    expect(pressed("Review")).toBe("true");
    expect(badge()).toBe("review");
  });

  it("switches at once rather than waiting for the round to end", async () => {
    const user = userEvent.setup();
    mount(withBacklog());
    expect(title()).toBe("First declension");

    await user.click(screen.getByRole("button", { name: "Explore" }));
    // The round in flight is gone at once — not "after this one", which is
    // what the link it replaces used to mean.
    expect(errand()).toBe("explore");
    expect(new SyncingStorage().read()?.openRound?.via).toBe("sweep");

    // The book stands at the earliest topic short of the top band, which is
    // this one: failing it is exactly why it is still short.
    expect(title()).toBe("First declension");
    expect(badge()).toBe("revisiting");

    // And it reads on from there, into ground that was unreachable a moment
    // ago: everything due used to be served before anything new.
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    expect(title()).toBe("Second declension");
  });

  it("says so on every switch", async () => {
    const user = userEvent.setup();
    mount(withBacklog());

    await user.click(screen.getByRole("button", { name: "Explore" }));
    expect(document.querySelector(".toast")?.textContent).toMatch(
      /Reviews set aside/,
    );

    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(document.querySelector(".toast")?.textContent).toMatch(
      /Back to the reviews/,
    );
  });

  it("counts what is due, on either errand, and never calls it waiting", async () => {
    const user = userEvent.setup();
    mount(withBacklog());
    expect(counts()).toBe("2 due");

    await user.click(screen.getByRole("button", { name: "Explore" }));
    // It used to read "2 waiting" here — a second number for the same pile,
    // which made the switch look as though it had changed it.
    expect(counts()).toBe("2 due");
  });

  it("throws itself back to the book once the last review is graded", async () => {
    const user = userEvent.setup();
    // One topic waiting, whose test is a single question.
    const s = new Session(new Content(fixture, testProfile));
    s.gradeTopic("decl2", 1, new Date(Date.now() - 60 * 60 * 1000));
    mount(s.progress());
    expect(pressed("Review")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(pressed("Explore")).toBe("true");
    expect(document.querySelector(".toast")?.textContent).toMatch(
      /Nothing left due/,
    );
  });

  it("greys the switch out when there is nothing to review", () => {
    mount();
    expect(counts()).toBe("0 words");
    for (const name of ["Explore", "Review"]) {
      expect(screen.getByRole("button", { name })).toHaveProperty("disabled", true);
    }
  });
});

/**
 * The index is how a topic to practise gets chosen, so under the quoted-only
 * preference it has to count what that preference will actually ask. Counting
 * the whole bank sends a student to a topic of twenty questions that turns out
 * to hold no quotation, and the topic is stepped over on arrival with nothing
 * on the row having said so.
 */
describe("the index under the quoted-only preference", () => {
  const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
  /** `decl1` gains a quoted question; `decl2` and `pres` stay generated. */
  const quoted: ContentData = {
    ...fixture,
    tests: {
      ...fixture.tests,
      decl1: [
        ...fixture.tests.decl1!,
        {
          id: "decl1-q1",
          sectionId: "decl1",
          questions: [
            { prompt: "Gaul is divided into three parts.", answer: "Gallia est omnis dīvīsa in partēs trēs.", kind: "translate-en-la" as const, vocab: [], source: cite },
          ],
        },
      ],
    },
  };
  const openTopic = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    const map = screen.getByRole("dialog", { name: "Grammar index" });
    await user.click(within(map).getByRole("button", { name: name }));
  };

  it("counts a topic's row by the quoted questions alone", async () => {
    const user = userEvent.setup();
    mount({ ...emptyProgress(), quotedOnly: true }, quoted);

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    const map = screen.getByRole("dialog", { name: "Grammar index" });
    // One of first declension's three questions is quoted, and 1 is what the
    // row has to say — 3 would be an invitation to a run of one.
    expect(
      within(map).getByRole("button", { name: /First declension/ }).textContent,
    ).toMatch(/0\/1 questions answered/);
    // And said once at the top, so a preference set days ago explains itself.
    expect(within(map).getByText(/counting the quoted questions only/)).toBeDefined();
  });

  it("says which silence a topic with nothing quoted is, and will not drill it", async () => {
    const user = userEvent.setup();
    mount({ ...emptyProgress(), quotedOnly: true }, quoted);
    await openTopic(user, /Second declension/);

    // Tests were written here; none are quoted. The two are different things
    // to be told, and only this one comes back with the preference off.
    expect(screen.getByText(/nothing quoted here yet/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Nothing quoted here" }),
    ).toHaveProperty("disabled", true);
    // Studying from here is still offered: the walk starts here and reads on
    // to the next topic that has something quoted.
    expect(
      screen.getByRole("button", { name: "Study from here" }),
    ).toHaveProperty("disabled", false);
    // And the bank narrows with it: a list of the questions this deck will not
    // be asked is a list of things to revise for nothing. Worded apart from the
    // practice button above, because the two refuse different things.
    expect(
      screen.getByRole("button", { name: "Nothing quoted to read" }),
    ).toHaveProperty("disabled", true);
  });

  it("lists and counts the bank by the quoted questions alone", async () => {
    const user = userEvent.setup();
    mount({ ...emptyProgress(), quotedOnly: true }, quoted);
    await openTopic(user, /First declension/);

    // Three questions written here, one of them quoted.
    const bank = screen.getByRole("button", { name: /All 1 questions/ });
    await user.click(bank);
    const sheet = screen.getByRole("dialog", { name: "All questions" });
    expect(within(sheet).getByText("Gaul is divided into three parts.")).toBeDefined();
    expect(within(sheet).queryByText("The girl loves the rose.")).toBeNull();
  });

  /**
   * The bank read as a list is where the two kinds of sentence sit next to each
   * other, and the credit is the only thing telling them apart — without it a
   * student reading a topic through cannot see which lines are Caesar's.
   */
  it("credits the quoted questions where the bank is read", async () => {
    const user = userEvent.setup();
    mount(undefined, quoted);
    await openTopic(user, /First declension/);

    await user.click(screen.getByRole("button", { name: /All 3 questions/ }));
    const sheet = screen.getByRole("dialog", { name: "All questions" });
    const credit = within(sheet).getByText(/Caesar/);
    expect(credit.textContent).toMatch(/de Bello Gallico/);
    expect(credit.textContent).toMatch(/i, 1/);
    // The generated questions have nobody to credit, and say nothing rather
    // than saying so.
    expect(within(sheet).getAllByText(/—\s*Caesar/)).toHaveLength(1);

    // And again on the question itself, opened from that list.
    await user.click(
      within(sheet).getByRole("button", {
        name: /Gaul is divided into three parts/,
      }),
    );
    const one = screen.getByRole("dialog", { name: "Question" });
    expect(within(one).getByText(/Caesar/).textContent).toMatch(
      /de Bello Gallico/,
    );
  });

  it("leaves every count alone when the preference is off", async () => {
    const user = userEvent.setup();
    mount(undefined, quoted);
    await openTopic(user, /First declension/);

    expect(screen.getByRole("button", { name: /Practise these 3/ })).toBeDefined();
    expect(screen.queryByText(/nothing quoted here yet/)).toBeNull();
    expect(screen.getByRole("button", { name: /All 3 questions/ })).toBeDefined();
  });

  /**
   * The words on a row are true but they are the last thing on it, and a family
   * of twenty rows is scanned rather than read. Under the preference most of
   * the syllabus has nothing to serve, so the few topics that do are what the
   * index has to hand the eye — which colour can do and a sentence cannot.
   *
   * Greyed, and pointedly not disabled: what a topic with no quotation still
   * offers is reading it and starting the walk from it, both of which the last
   * commit went out of its way to leave open.
   */
  describe("and the rows it should be letting the eye skip", () => {
    const openMap = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole("button", { name: "Grammar index" }));
      return screen.getByRole("dialog", { name: "Grammar index" });
    };

    it("greys the topics with nothing to serve and leaves the rest alone", async () => {
      const user = userEvent.setup();
      mount({ ...emptyProgress(), quotedOnly: true }, quoted);
      const map = await openMap(user);

      // Second declension has tests and no quotation among them.
      expect(
        within(map).getByRole("button", { name: /Second declension/ }).className,
      ).toMatch(/\brow--empty\b/);
      // First declension has one, and one is enough to be worth going to.
      expect(
        within(map).getByRole("button", { name: /First declension/ }).className,
      ).not.toMatch(/\brow--empty\b/);
    });

    it("greys a family only when every topic under it is empty", async () => {
      const user = userEvent.setup();
      mount({ ...emptyProgress(), quotedOnly: true }, quoted);
      const map = await openMap(user);

      // Verb forms holds one topic and nothing quoted in it: nothing to open
      // the family for, and the heading is where that has to be said, because
      // the rows saying it are behind a tap.
      const verbs = within(map).getByRole("button", { name: /Verb forms/ });
      expect(verbs.className).toMatch(/\bfamily__head--empty\b/);
      expect(verbs.textContent).toMatch(/nothing quoted/);
      // Nouns holds two topics, one of them quoted. One is enough.
      const nouns = within(map).getByRole("button", { name: /Nouns/ });
      expect(nouns.className).not.toMatch(/\bfamily__head--empty\b/);
      expect(nouns.textContent).not.toMatch(/nothing quoted/);
    });

    it("says the other silence when the preference is off", async () => {
      const user = userEvent.setup();
      // Every topic in the fixture has tests, so with the preference off
      // nothing greys — which is the point: this is not a second opinion about
      // quotations, it is about whether there is anything to ask at all.
      mount(undefined, quoted);
      const map = await openMap(user);

      expect(
        within(map).getByRole("button", { name: /Second declension/ }).className,
      ).not.toMatch(/\brow--empty\b/);
      expect(
        within(map).getByRole("button", { name: /Verb forms/ }).className,
      ).not.toMatch(/\bfamily__head--empty\b/);
    });

    it("still opens a greyed row's topic", async () => {
      const user = userEvent.setup();
      mount({ ...emptyProgress(), quotedOnly: true }, quoted);
      const map = await openMap(user);
      const row = within(map).getByRole("button", { name: /Second declension/ });

      // The one thing the greying must never become. Reading the section and
      // studying from here are still on offer behind this row, and a `disabled`
      // here would take both away to save a student a tap they might want.
      expect(row).toHaveProperty("disabled", false);
      await user.click(row);
      expect(
        screen.getByRole("button", { name: "Study from here" }),
      ).toHaveProperty("disabled", false);
    });
  });

  /**
   * The order, which is a different preference from the filter and has to be
   * turnable off on its own: a student who wants the whole book still gets to
   * decide whether it arrives quoted-end-first or shuffled through.
   */
  describe("and the order the two kinds arrive in", () => {
    const openSettings = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole("button", { name: "Settings" }));
    };

    it("leads with the quotations unless a student says otherwise", async () => {
      const user = userEvent.setup();
      const { session } = mount(undefined, quoted);
      await openSettings(user);

      // Absent means on, so a deck that has never heard of this leads with the
      // quotations — which is the half a student can otherwise miss for weeks.
      expect(session.progress().quotedFirst).toBeUndefined();
      expect(
        screen.getByLabelText(/Serve attested classical quotes first/),
      ).toHaveProperty("checked", true);

      await user.click(
        screen.getByLabelText(/Serve attested classical quotes first/),
      );
      expect(session.progress().quotedFirst).toBe(false);
    });

    it("has nothing to decide while only quoted sentences are served", async () => {
      const user = userEvent.setup();
      mount({ ...emptyProgress(), quotedOnly: true }, quoted);
      await openSettings(user);

      // Disabled rather than hidden: the setting has not gone away, it just has
      // no second half to put second.
      expect(
        screen.getByLabelText(/Serve attested classical quotes first/),
      ).toHaveProperty("disabled", true);
      expect(screen.getByText(/no order to choose/)).toBeDefined();
    });
  });
});

/**
 * What happens when this device is not the only one that has been studied.
 *
 * The rule these all check is one rule: a copy that is behind never overwrites
 * one that is ahead unless a person said to. Everything else — the silence, the
 * questions, the held push — follows from where that leaves each case.
 */
describe("a device that is behind another one", () => {
  const CONFIG = {
    token: "t",
    owner: "someone",
    repo: "progress",
    path: "latin.json",
    branch: "main",
  };

  /** Sync already set up when the tab opens, as it is on a returning device. */
  const configured = () =>
    localStorage.setItem(profile.storage.webSyncKey, JSON.stringify(CONFIG));

  /** This device agreeing with GitHub as of `at`. */
  const synced = (at: string) =>
    localStorage.setItem(`${profile.storage.webSyncKey}:synced`, at);

  /**
   * The copy already on the device when the tab opens. Written to storage as
   * well as handed to the session, because what the startup check reads is the
   * device's copy rather than the session's — see `bootAt`.
   */
  const onDevice = (p: Progress): Progress => {
    localStorage.setItem(profile.storage.webProgressKey, JSON.stringify(p));
    return p;
  };

  /** A GitHub holding `remote`, recording the order of what it is asked. */
  function stubGitHub(remote: Progress | null) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { method?: string }) => {
        const method = init?.method ?? "GET";
        calls.push(method);
        if (method === "PUT") {
          return { ok: true, status: 200, json: async () => ({ content: { sha: "s2" } }) };
        }
        if (!remote) return { ok: false, status: 404 };
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: "abc", content: btoa(JSON.stringify(remote)) }),
        };
      }),
    );
    return calls;
  }

  const stubReload = () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    return reload;
  };

  /** A copy of the pack's progress, saved at `at`, with `mastery` in it. */
  const copy = (at: string, mastery: Record<string, number>): Progress => ({
    ...new Session(new Content(fixture, testProfile)).progress(),
    updatedAt: at,
    topicMastery: mastery,
  });

  it("takes the newer copy without a word when it has nothing of its own", async () => {
    const reload = stubReload();
    const remote = copy("2026-09-09T00:00:00.000Z", { decl2: 5 });
    stubGitHub(remote);

    const mine = onDevice(copy("2026-01-01T00:00:00.000Z", { decl1: 2 }));
    configured();
    synced(mine.updatedAt); // pushed, and untouched since
    await act(async () => {
      mount(mine);
    });

    // No sheet. This is the phone-then-laptop case and it is not a question.
    expect(screen.queryByRole("dialog", { name: /another device/i })).toBeNull();
    expect(new SyncingStorage().read()?.topicMastery).toEqual({ decl2: 5 });
    expect(reload).toHaveBeenCalled();
  });

  it("asks when this device has been studied since it last synced", async () => {
    stubReload();
    stubGitHub(copy("2026-09-09T00:00:00.000Z", { decl2: 5 }));

    const mine = onDevice(copy("2026-02-02T00:00:00.000Z", { decl1: 2 }));
    configured();
    synced("2026-01-01T00:00:00.000Z"); // and studied after that
    await act(async () => {
      mount(mine);
    });

    expect(
      screen.getByRole("dialog", { name: "Progress from another device" }),
    ).toBeDefined();
    // Nothing was decided on the student's behalf.
    expect(new SyncingStorage().read()?.topicMastery).toEqual({ decl1: 2 });
  });

  it("pushes nothing before it has looked at what GitHub holds", async () => {
    // The reported bug. A grade in the first seconds used to beat the startup
    // check through the four-second debounce, and the copy it committed was the
    // stale one the check was on its way to replace.
    const calls = stubGitHub(copy("2026-09-09T00:00:00.000Z", { decl2: 5 }));
    stubReload();
    configured();
    synced("2026-01-01T00:00:00.000Z"); // studied since, so nothing is adopted

    const user = userEvent.setup();
    mount(onDevice(copy("2026-02-02T00:00:00.000Z", { decl1: 2 })));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await passTime(4500); // past the four-second debounce

    // The read came first, and the stale copy never went up behind it.
    expect(calls[0]).toBe("GET");
    expect(calls).not.toContain("PUT");
  }, 10_000);

  it("holds the push when another device gets in first, and keeps the work", async () => {
    const remote = copy("2026-09-09T00:00:00.000Z", { decl2: 5 });
    stubGitHub(remote);
    const user = userEvent.setup();
    // Connected mid-session, so the gate is open and the check is not running.
    const { storage, session } = mount(copy("2026-01-01T00:00:00.000Z", { decl1: 2 }));
    await act(async () => {
      storage.configure(CONFIG);
    });

    await act(async () => {
      await storage.saveNow(session.progress());
    });

    expect(storage.currentState().kind).toBe("behind");
    // Study is untouched by it, and the question on screen is still the one
    // that was there.
    expect(screen.getByRole("button", { name: "Reveal" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText(/Another device is ahead/)).toBeDefined();
  });

  it("keeps this device's copy when that is what was chosen", async () => {
    stubReload();
    const calls = stubGitHub(copy("2026-09-09T00:00:00.000Z", { decl2: 5 }));
    const user = userEvent.setup();
    configured();
    synced("2026-01-01T00:00:00.000Z");
    await act(async () => {
      mount(onDevice(copy("2026-02-02T00:00:00.000Z", { decl1: 2 })));
    });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Keep this device" }));
    });

    // Forced past the refusal, because a person is what the refusal defers to.
    expect(calls).toContain("PUT");
    expect(new SyncingStorage().read()?.topicMastery).toEqual({ decl1: 2 });
  });

  it("warns before a pull throws away what this device has not sent", async () => {
    stubReload();
    stubGitHub(copy("2026-09-09T00:00:00.000Z", { decl2: 5 }));
    const user = userEvent.setup();
    const { storage } = mount(copy("2026-02-02T00:00:00.000Z", { decl1: 2 }));
    await act(async () => {
      storage.configure(CONFIG);
    });

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Pull the copy/ }));
    });

    expect(
      screen.getByRole("dialog", { name: "This device has unsaved progress" }),
    ).toBeDefined();
    expect(new SyncingStorage().read()?.topicMastery).toEqual({ decl1: 2 });
  });

  it("pulls without a word when there is nothing of this device's to lose", async () => {
    const reload = stubReload();
    // Nothing up there yet, so this device's push lands and the two agree.
    stubGitHub(null);
    const user = userEvent.setup();
    const { storage, session } = mount(
      onDevice(copy("2026-02-02T00:00:00.000Z", { decl1: 2 })),
    );
    await act(async () => {
      storage.configure(CONFIG);
      await storage.saveNow(session.progress());
    });

    // Then the other device studies and pushes. This one has nothing of its
    // own left, so pulling is a plain catch-up and asking about it is noise.
    stubGitHub(copy("2026-09-09T00:00:00.000Z", { decl2: 5 }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Pull the copy/ }));
    });

    expect(screen.queryByRole("dialog", { name: /unsaved progress/ })).toBeNull();
    expect(new SyncingStorage().read()?.topicMastery).toEqual({ decl2: 5 });
    expect(reload).toHaveBeenCalled();
  });

  it("asks before connecting to a repo that already holds something newer", async () => {
    stubReload();
    const calls = stubGitHub(copy("2026-09-09T00:00:00.000Z", { decl2: 5 }));
    const user = userEvent.setup();
    mount(copy("2026-02-02T00:00:00.000Z", { decl1: 2 }));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Repository owner"), "someone");
    await user.type(screen.getByLabelText("Repository name"), "progress");
    // Not exact: this label carries its explanatory hint inside it too.
    await user.type(screen.getByLabelText(/Access token/), "t");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Connect" }));
    });

    // Connecting a second device is how this happens, and pushing first would
    // erase the very progress it was being connected in order to reach.
    expect(
      screen.getByRole("dialog", { name: "That repo already has progress" }),
    ).toBeDefined();
    expect(calls).not.toContain("PUT");
  });
});
