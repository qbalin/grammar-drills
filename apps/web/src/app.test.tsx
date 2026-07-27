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
} from "@latin-tutor/core";
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
  const content = new Content(fixture);
  const session = new Session(content, progress);
  const storage = new SyncingStorage();
  render(<App content={content} session={session} storage={storage} />);
  return { session, content };
}

/** True while the placement probes are still running. */
const inPlacement = () => document.querySelector(".badge--placement") !== null;

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
});

describe("the study loop", () => {
  it("opens on placement, and a failed probe starts study at the beginning", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    expect(inPlacement()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /No idea/ }));

    // Failing the first probe ends placement and leaves nothing assumed known.
    expect(session.progress().placementDone).toBe(true);
    expect(session.progress().knownSections).toEqual([]);
    // Study begins at the first topic. Its title is in the status bar and again
    // in the section sheet that opens on new ground, so scope to the bar.
    expect(document.querySelector(".status__title")?.textContent).toBe(
      "First declension",
    );
  });

  it("stays in placement while a word is recorded, and resumes it after a reload", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    // Pass the first probe, so placement is genuinely mid-run.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Knew it/ }));
    expect(screen.getByText(/Placement · 2 of/)).toBeDefined();

    // Recording a word is an aside, not an exit: the probe is still on screen.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(session.vocabCard("v-rex")).toBeDefined();
    expect(inPlacement()).toBe(true);
    expect(screen.getByText(/Placement · 2 of/)).toBeDefined();

    // And the run itself outlives the page: passing a probe fills knownSections,
    // which used to make a reload look like a finished placement.
    cleanup();
    mount(new SyncingStorage().read() ?? undefined);
    expect(inPlacement()).toBe(true);
    expect(screen.getByText(/Placement · 2 of/)).toBeDefined();
  });

  it("takes topics as known up to a passed placement probe", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    // "Knew it" on the first probe passes it and everything before it.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Knew it/ }));

    expect(session.progress().knownSections).toContain("decl1");
    expect(session.progress().frontier).toBe("decl1");
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

    expect(screen.getByText("Translate into Latin · 1/2")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // Same topic, next question — not a jump to the next topic.
    expect(screen.getByText("Translate into Latin · 2/2")).toBeDefined();
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

  it("treats a dictionary miss as a note, not a rejection", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await skipPlacement(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "notaword");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(screen.getByText(/No dictionary match/)).toBeDefined();
    // The grading buttons are still there: nothing was blocked.
    expect(screen.getByRole("button", { name: /Good/ })).toBeDefined();
    expect(Object.keys(session.progress().vocabCards)).toHaveLength(0);
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
    expect(screen.getByText("Vocabulary · say it in Latin")).toBeDefined();
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
    await user.click(screen.getByRole("button", { name: /First declension/ }));
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
    expect(screen.getByText("Translate into Latin · 2/2")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Undo last grade" }));

    // The question is back as it was left…
    expect(screen.getByText("Translate into Latin · 1/2")).toBeDefined();
    expect(screen.getByText("The girl loves the rose.")).toBeDefined();
    expect(screen.getByText("You wrote")).toBeDefined();
    expect(sentences()).toEqual(["Puella rosam amat.", "Puella rosam amat."]);
    // …and so is the engine: no card, no mastery, no attempt.
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
    await skipPlacement(user);

    // Record a word, finish the topic, and meet the card it created.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /record a word/ }));
    await user.type(screen.getByRole("textbox"), "regem");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(screen.getByText("Vocabulary · say it in Latin")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: /Again/ }));
    expect(session.vocabCard("v-rex")?.fsrs.reps).toBe(1);

    await user.click(screen.getByRole("button", { name: "Undo last grade" }));
    expect(screen.getByText("Vocabulary · say it in Latin")).toBeDefined();
    expect(screen.getByText("rex, rēgis")).toBeDefined(); // still revealed
    expect(session.vocabCard("v-rex")?.fsrs.reps).toBe(0);
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
