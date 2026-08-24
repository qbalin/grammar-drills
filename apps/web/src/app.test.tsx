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
  type Profile,
  type Progress,
} from "@lang-tutor/core";
import { testProfile } from "@lang-tutor/core/testing";
import { profile } from "./pack.js";
import { App } from "./app.js";
import {
  loadDictionary,
  loadParadigms,
  prefetchGrammarBooks,
} from "./content-loader.js";
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
/**
 * The etymologies, which arrive with the dictionary rather than after it — one
 * `lemma|pos \t <text>` line per word, sorted, newlines escaped. Only one of
 * the fixture's words has one, which is the ordinary state of the real file.
 */
const ETYMOLOGY = [
  "manus|noun\tFrom Proto-Italic *manus.\\nCognate with Old English mund.",
].join("\n");
/** A pack whose dictionary carries no etymology at all, as Greek's does not. */
const etymologyFile = { available: true };
/** The pack's further books, which are fetched at launch and nothing else. */
const books = { available: true };
/**
 * The burst, as a spy. Its own module is tested where it can be — the canvas
 * cannot be, since jsdom has no `Path2D` — and what these scenarios are about
 * is *which* register fires and *when*, which is the app's decision and not the
 * canvas's.
 */
const fireConfetti = vi.fn();
vi.mock("./confetti/Confetti.js", () => ({
  useConfetti: () => ({ canvas: null, fire: fireConfetti }),
}));

vi.mock("./content-loader.js", async () => {
  const { ParadigmIndex } = await import("./paradigm-index.js");
  const { EtymologyIndex } = await import("./etymology-index.js");
  return {
    loadDictionary: vi.fn(async () => {
      if (!dictionary.available) throw new Error("offline");
      return {} as never;
    }),
    dictionaryReady: () => dictionary.available,
    // Never a promise: it is the empty index until the dictionary lands, and
    // the empty index answers exactly as a word with no etymology does.
    etymology: () =>
      new EtymologyIndex(etymologyFile.available ? ETYMOLOGY : ""),
    loadParadigms: vi.fn(async () => {
      if (!paradigmFile.available) throw new Error("offline");
      return new ParadigmIndex(PARADIGMS);
    }),
    loadGrammarBook: vi.fn(async () => {}),
    // Fetched at launch and never parsed, so a spy is the whole of it: there is
    // no index to hand back and nothing on screen to check it by.
    prefetchGrammarBooks: vi.fn(async () => {
      if (!books.available) throw new Error("offline");
    }),
    // The further dictionaries. The fixture pack declares none, so the app's
    // own guard returns before either of these does anything — they are here
    // because a mocked module replaces the whole of it, and a missing export is
    // a crash rather than a default.
    loadDictionaries: vi.fn(async () => {}),
    dictionariesReady: () => true,
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

function mount(
  progress?: Progress,
  data: ContentData = fixture,
  // Only the tests that add a family to the fixture pass one — a pack's family
  // list is its book's table of contents, so content and profile move together.
  profile: Profile = testProfile,
  /**
   * The topic to arrive already practising, or `null` to arrive with nothing
   * chosen.
   *
   * The app hands nothing over until a topic is picked — there is no walk
   * through the book to be resumed — so a scenario about answering questions
   * has to say which questions. Defaulting to the first teachable topic is what
   * every one of these used to get for free, and it keeps each test about the
   * thing it is about. `null` is for the handful whose subject *is* the empty
   * screen.
   */
  practise: string | null | undefined = undefined,
) {
  const content = new Content(data, profile);
  const session = new Session(content, progress);
  const at = practise === undefined ? content.topicIds()[0] : practise;
  if (at && !session.practiseRun()) session.drillTopic(at);
  const storage = new SyncingStorage();
  render(<App content={content} session={session} storage={storage} />);
  return { session, content, storage };
}

/**
 * A progress file with a topic already in the review pile.
 *
 * A round does not enrol the topic it was answered on — the landing asks, and
 * the student answers — so a scenario that wants a *scheduled* topic has to say
 * so. Every test whose subject is the card, the schedule or a dismissal starts
 * from this; the ones whose subject is the offer deliberately do not.
 */
function enrolled(id = "decl1", rating: 1 | 2 | 3 | 4 = 3): Progress {
  const s = new Session(new Content(fixture, testProfile));
  s.enrolTopic(id, rating);
  return s.progress();
}

/**
 * Past the card the loop now stands still on when a round is worked out.
 *
 * A round no longer runs straight into the next question, so every scenario
 * that crosses a round boundary meets this in between. A no-op where there is
 * no card, so it can follow any grade without the caller having to know whether
 * that grade happened to be the round's last.
 *
 * "Not now" is the same button under the name the offer gives it, on a topic
 * that is not in the review pile — declining is how you carry on there, and a
 * scenario that is not about the offer should be able to cross it without
 * knowing which of the two it is meeting.
 */
async function carryOn(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.queryByRole("button", {
    name: /Keep going|Carry on|Not now/,
  });
  if (button) await user.click(button);
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
  etymologyFile.available = true;
  fireConfetti.mockClear();
  vi.unstubAllGlobals();
  // The storage-failure tests below spy on `Storage.prototype`, and a spy that
  // outlived its test would break every test after it in a way that reads as a
  // failure of whatever ran next. Only `spyOn` spies are touched: the module
  // factories above are `vi.mock` and are not restorable.
  vi.restoreAllMocks();
  // Every test shares one jsdom document and therefore one history. The app
  // marks its own entries so Back knows what is its to pop, and a mark left by
  // the previous test would be read as this one's. There is no way to truncate
  // the stack, but the current entry's state can be cleared, which is what the
  // app actually reads.
  history.replaceState(null, "");
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
    // The grade reaches the record and nothing else — there is no score for it
    // to move, and it does not put the topic in the pile either: that is asked
    // for at the end of the round rather than taken from an answer.
    expect(session.attemptsFor("decl1")).toHaveLength(1);
    expect(session.progress().topicCards).toEqual({});
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

  it("stops on the round it finished rather than sliding onto the next question", async () => {
    const user = userEvent.setup();
    mount(enrolled());

    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }

    // The topic just worked on is what is named, and the next topic's first
    // question is not on screen behind it. The burst used to fire here and
    // `advance` in the same breath, so what erupted was the next prompt.
    expect(screen.getByRole("heading", { name: "First declension" })).toBeDefined();
    expect(screen.queryByText("The master frees the slave.")).toBeNull();
    expect(screen.getByText(/^Back /)).toBeDefined();
  });

  describe("the offer a round lands on", () => {
    /** Answer both of decl1's questions, which is one whole round. */
    const workARound = async (user: ReturnType<typeof userEvent.setup>) => {
      for (const _ of [0, 1]) {
        await user.click(screen.getByRole("button", { name: "Reveal" }));
        await user.click(screen.getByRole("button", { name: /Good/ }));
      }
    };

    it("asks rather than announcing, and says what saying yes would buy", async () => {
      const user = userEvent.setup();
      const { session } = mount();
      await workARound(user);

      expect(screen.getByRole("heading", { name: "First declension" })).toBeDefined();
      expect(screen.getByText(/It is not in your reviews\./)).toBeDefined();
      // A date, not a vague promise: the same interval the grade button that
      // reached this screen was labelled with.
      expect(screen.getByText(/comes back (in|tomorrow)/)).toBeDefined();
      expect(screen.queryByText(/^Back /)).toBeNull();
      expect(session.progress().topicCards).toEqual({});
    });

    it("writes the card on yes, and honours the interval it quoted", async () => {
      const user = userEvent.setup();
      const { session } = mount();
      await workARound(user);

      const offered = screen.getByText(/It is not in your reviews\./).textContent!;
      await user.click(screen.getByRole("button", { name: "Add to my reviews" }));

      // The card exists, and the same card is now reported rather than offered
      // — the tap does not navigate, so the answer is read where it was given.
      expect(session.progress().topicCards.decl1).toBeDefined();
      const back = screen.getByText(/^Back /).textContent!;
      expect(offered).toContain(back.replace(/^Back /, ""));
      expect(screen.queryByRole("button", { name: "Add to my reviews" })).toBeNull();
      expect(screen.getByRole("button", { name: "Keep going" })).toBeDefined();
    });

    it("leaves nothing behind on no, and asks again next round", async () => {
      const user = userEvent.setup();
      const { session } = mount();
      await workARound(user);
      await user.click(screen.getByRole("button", { name: "Not now" }));
      expect(session.progress().topicCards).toEqual({});

      // decl1 holds one test of two questions, so the run is worked out — and
      // that screen asks too. Saying no is not a state: nothing was written, so
      // nothing remembers it, and the answer may well have changed by now.
      expect(screen.getByRole("heading", { name: "All practised." })).toBeDefined();
      expect(screen.getByRole("button", { name: "Add to my reviews" })).toBeDefined();
    });

    it("puts an unanswered offer back after a reload", async () => {
      const user = userEvent.setup();
      mount();
      await workARound(user);
      expect(screen.getByText(/It is not in your reviews\./)).toBeDefined();

      // Closing the app on the question rather than answering it. Letting the
      // offer lapse would decide it by default, which is the thing being
      // removed — so the round is still on disk and the launch asks again.
      cleanup();
      const { session } = mount(new SyncingStorage().read() ?? undefined);
      expect(screen.getByText(/It is not in your reviews\./)).toBeDefined();
      await user.click(screen.getByRole("button", { name: "Add to my reviews" }));
      expect(session.progress().topicCards.decl1).toBeDefined();
    });

    it("takes the enrolment back with the grade that reached it", async () => {
      const user = userEvent.setup();
      const { session } = mount();
      await workARound(user);
      await user.click(screen.getByRole("button", { name: "Add to my reviews" }));
      expect(session.progress().topicCards.decl1).toBeDefined();

      // The snapshot predates the round's last grade, and the enrolment was
      // priced off that grade — so undoing it takes the card with it rather
      // than leaving a card behind that nothing on screen asked for.
      await user.click(screen.getByRole("button", { name: "Undo last grade" }));
      expect(session.progress().topicCards.decl1).toBeUndefined();
    });

    it("says nothing about the pile on a topic already in it", async () => {
      const user = userEvent.setup();
      mount(enrolled());
      await workARound(user);
      expect(screen.getByText(/^Back /)).toBeDefined();
      expect(screen.queryByRole("button", { name: "Add to my reviews" })).toBeNull();
      expect(screen.queryByText(/It is not in your reviews\./)).toBeNull();
    });
  });

  it("says where the topic has got to, and never how it was graded", async () => {
    const user = userEvent.setup();
    mount(enrolled());

    // One right and one wrong, so a card that reported the round would have
    // something to report. Nothing on it may.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Again/ }));

    // The topic, and when it comes back. Nothing else.
    expect(screen.getByRole("heading", { name: "First declension" })).toBeDefined();
    expect(screen.getByText(/^Back /)).toBeDefined();
    // No score, no accuracy, no count of what was right. The four mastery cells
    // that used to stand here are gone with the score behind them.
    expect(document.querySelector(".landed__mastery")).toBeNull();
    expect(screen.queryByText(/\d\s*(of|\/)\s*\d/)).toBeNull();
    expect(screen.queryByText(/right|correct|wrong|mastered/i)).toBeNull();
  });

  it("carries on from the card, and stops on it without going anywhere", async () => {
    const user = userEvent.setup();
    mount(enrolled());

    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }

    // Stopping opens the schedule over the card rather than navigating: there
    // is no session to end, and what somebody stopping wants is the dates.
    await user.click(screen.getByRole("button", { name: "Stop here" }));
    expect(screen.getByRole("dialog", { name: /Coming up/ })).toBeDefined();
    await user.click(screen.getByRole("button", { name: /^Close/ }));
    expect(screen.getByRole("heading", { name: "First declension" })).toBeDefined();

    // Carrying on stays on the topic that was chosen. The run has been through
    // this topic's whole bank, so what comes next is the run saying so — not
    // another topic's first question.
    await user.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.getByRole("heading", { name: "All practised." })).toBeDefined();
    expect(screen.queryByText("The master frees the slave.")).toBeNull();
  });

  it("lands the same way on a round picked back up at its last question", async () => {
    const user = userEvent.setup();
    // The round is resumable, so what the card reports cannot be held in the
    // screen's own state: nothing here ever saw the first grade.
    const s = new Session(new Content(fixture, testProfile));
    // In the pile before the round opens, so `cardBefore` snapshots the card
    // rather than its absence — and so the landing reports a date rather than
    // offering one, which is what this test is about.
    s.enrolTopic("decl1", 3);
    s.beginRound("decl1", fixture.tests.decl1![0]!, true, "new");
    s.gradeTopic("decl1", 3, new Date(), "decl1-t1");
    mount(s.progress());

    expect(eyebrow()).toContain("\u00b7 2/2");
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(screen.getByRole("heading", { name: "First declension" })).toBeDefined();
    expect(screen.getByText(/^Back /)).toBeDefined();
  });

  it("never lands on a vocabulary card, which is not a round", async () => {
    const user = userEvent.setup();
    mount();

    // A word, with a topic still due behind it, so there is somewhere to go.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("rose")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(screen.queryByRole("button", { name: "Keep going" })).toBeNull();
  });

  it("asks for a topic rather than picking one, when nothing is chosen", async () => {
    const user = userEvent.setup();
    // Nothing chosen and nothing due. The app used to walk a cursor through the
    // book from here, so it always had a question to hand over; it has none,
    // and the honest screen is the one that asks which topic.
    mount(undefined, fixture, testProfile, null);

    expect(screen.getByRole("heading", { name: "Pick a topic." })).toBeDefined();
    // And with nothing due either, the switch has nowhere to send you.
    for (const name of ["Explore", "Review"]) {
      expect(screen.getByRole("button", { name })).toHaveProperty("disabled", true);
    }

    // The index leads, because it is the answer rather than a consolation.
    // (The header carries one of its own, so this is the screen's.)
    await user.click(
      within(document.querySelector(".centered")!).getByRole("button", {
        name: "Grammar index",
      }),
    );
    expect(screen.getByRole("dialog", { name: /Grammar index/ })).toBeDefined();
  });
});

/**
 * The burst had one register and fired on every round — about every four
 * questions, which is a cadence rather than a surprise. It has a top end now,
 * and what it is kept for is the rarest thing a pack can offer: the first line
 * a student ever answers by an author they have not read before.
 */
describe("the rarer burst", () => {
  /** The same fixture, with decl1's first question quoting somebody. */
  const quoting: ContentData = {
    ...fixture,
    tests: {
      ...fixture.tests,
      decl1: [
        {
          ...fixture.tests.decl1![0]!,
          questions: fixture.tests.decl1![0]!.questions.map((q, i) =>
            i === 0
              ? { ...q, source: { author: "Cicero", work: "de Officiis" } }
              : q,
          ),
        },
      ],
    },
  };

  const finish = async (user: ReturnType<typeof userEvent.setup>) => {
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
  };

  it("throws the ordinary burst for an ordinary round, over the card", async () => {
    const user = userEvent.setup();
    mount();
    await finish(user);

    expect(fireConfetti).toHaveBeenCalledTimes(1);
    expect(fireConfetti).toHaveBeenCalledWith("round");
    // Over the card, not over the next prompt: the round it is for is still
    // the thing on screen, which is the whole of the change.
    expect(screen.getByRole("heading", { name: "First declension" })).toBeDefined();
  });

  it("throws the rarer one, and names it, the first time an author is met", async () => {
    const user = userEvent.setup();
    mount(undefined, quoting);
    await finish(user);

    expect(fireConfetti).toHaveBeenCalledWith("milestone");
    // In words as well as in confetti. A burst says something happened without
    // saying what, and for a reader who asked for reduced motion there is no
    // burst at all — the line is what they get.
    expect(screen.getByText("Your first line of Cicero.")).toBeDefined();
  });

  it("says nothing the second time the same author comes round", async () => {
    const user = userEvent.setup();
    // The trail already holds an answer to the quoted question, which is how a
    // student who has been reading Cicero for a year is not congratulated.
    const progress = emptyProgress();
    progress.attempts = {
      decl1: [
        {
          prompt: "The girl loves the rose.",
          answer: "Puella rosam amat.",
          submitted: "Puella rosam amat.",
          rating: 3,
          at: new Date().toISOString(),
        },
      ],
    };
    mount(progress, quoting);
    await finish(user);

    expect(fireConfetti).toHaveBeenCalledWith("round");
    expect(screen.queryByText(/first line of/)).toBeNull();
  });

  it("throws nothing at all for the pile clearing", async () => {
    const user = userEvent.setup();
    mount();

    // A word, alone in the pile, graded. Nothing was finished — a card is one
    // question — and the pile emptying is the one event a student can watch
    // approach, with the count in the bar telling them how far off it is.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(screen.getByRole("button", { name: "Show" }));
    fireConfetti.mockClear();
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(screen.getByText("The pile is clear.")).toBeDefined();
    expect(fireConfetti).not.toHaveBeenCalled();
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
    const { session } = mount();

    // Finish first declension, so its two attempts are on the record.
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    await carryOn(user);

    // Second declension is new ground: its own trail is empty. Reached by
    // choosing it, which is the only way onto a topic there is.
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 23-27\s*Second declension/ }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Second declension" }))
        .getByRole("button", { name: /^Practise/ }),
    );
    expect(session.practiseRun()?.sectionId).toBe("decl2");
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
    await carryOn(user);
    // The finished round was let go of and a fresh one took the table — on
    // disk, not merely in memory. A round is only ever written by the branch
    // that serves a test, so letting go has to be written too.
    await user.click(screen.getByRole("button", { name: "Practise all 2 again" }));
    expect(topic()).toBe("First declension");
    expect(new SyncingStorage().read()?.openRound).toMatchObject({
      sectionId: "decl1",
      answered: 0,
    });

    reopen();
    expect(topic()).toBe("First declension");
    expect(eyebrow()).toContain("· 1/2");
  });

  it("puts a round left on the card between rounds down, rather than resuming it", async () => {
    const user = userEvent.setup();
    mount(enrolled());

    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    // Closing the app on the card rather than tapping through it. The round is
    // still on disk with every question graded — it is let go of by the tap —
    // so the launch has to be the thing that notices there is nothing to resume.
    expect(new SyncingStorage().read()?.openRound).toMatchObject({
      sectionId: "decl1",
      answered: 2,
    });

    reopen();
    // Not back on the card, and not back on a question already graded: the card
    // is a moment, not state worth persisting, and the grade behind it is safe.
    // The run is worked out, so what the launch lands on is the run saying so.
    expect(screen.getByRole("heading", { name: "All practised." })).toBeDefined();
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
    await user.click(screen.getByRole("button", { name: /^Practise/ }));
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

  /**
   * Following a § out of one topic and back again.
   *
   * The two halves of one feature: the reference is only worth pressing if
   * there is a way back, and the way back is the app's trail rather than the
   * reader's — a page turned is as much a step as a reference followed.
   */
  const linked: ContentData = {
    ...fixture,
    grammar: [
      { ...fixture.grammar[0]!, text: "⟦#20⟧\nFirst-declension nouns end in -a; see ⟦r23:§ 23⟧." },
      { ...fixture.grammar[1]!, text: "⟦#23⟧\nSecond-declension nouns end in -us." },
      fixture.grammar[2]!,
    ],
  };

  it("follows a reference to the topic that holds the section it names", async () => {
    const user = userEvent.setup();
    mount(undefined, linked);

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Read § 20-22" }));
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "§ 23" }));
    expect(screen.getByRole("dialog", { name: "Second declension" })).toBeDefined();
  });

  it("walks the trail back and forward again, however each step was taken", async () => {
    const user = userEvent.setup();
    mount(undefined, linked);

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Read § 20-22" }));
    await user.click(screen.getByRole("button", { name: "§ 23" }));

    // Back over the reference…
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();
    // …and forward over it again, which is the half no ✕ can do.
    await user.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByRole("dialog", { name: "Second declension" })).toBeDefined();

    // A page turned is a step too: the reader should not have to know which of
    // the ways of moving the app counted.
    await user.click(screen.getByRole("button", { name: /Previous section/ }));
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "Second declension" })).toBeDefined();
  });

  it("has nowhere to go forward to until something has been gone back over", async () => {
    const user = userEvent.setup();
    // Nothing being practised, so the reader is not already open: a round on
    // fresh ground teaches before it tests, and that page is a step like any
    // other.
    mount(undefined, linked, testProfile, null);

    // The empty screen offers the index twice, as a word and as a glyph.
    await user.click(screen.getAllByRole("button", { name: "Grammar index" })[0]!);
    expect(screen.getByRole("button", { name: "Forward" })).toHaveProperty("disabled", true);

    // The first sheet opened is itself a step, so back from it is the screen it
    // was opened over — the same place ✕ leads, by the other road.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
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
 * A trail is where a student reads the correction of an answer they got wrong,
 * which is the moment a word in it is worth keeping — and until now it was the
 * one place a sentence could be compared but not used.
 *
 * The thing all of this has to get right is *which* sentence: an attempt carries
 * its own copy of what was on the screen at the time, and the question in hand
 * while the trail is open is somebody else's.
 */
describe("holding a word in the trail", () => {
  /** One answer on the record, with the trail open under the next question. */
  async function trailOpen(user: ReturnType<typeof userEvent.setup>) {
    const mounted = mount();
    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Earlier answers —/ }));
    return mounted;
  }

  /** The same answer on the record, read from the topic sheet instead. */
  async function trailInSheet(user: ReturnType<typeof userEvent.setup>) {
    const mounted = await trailOpen(user);
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    const map = screen.getByRole("dialog", { name: "Grammar index" });
    await user.click(within(map).getByRole("button", { name: /First declension/ }));
    return mounted;
  }

  it("keeps the sentence the attempt was written against, not the one in hand", async () => {
    const user = userEvent.setup();
    const { session } = await trailOpen(user);
    // The screen underneath is on the storm; the trail is on the rose.
    expect(screen.getByText("The sailors feared the storm.")).toBeDefined();

    await holdWordIn("#earlier-answers .attempt__answer", "rosam");

    expect(session.vocabContexts("v-rosa")).toEqual([
      expect.objectContaining({
        prompt: "The girl loves the rose.",
        sentence: "Puella rosam amat.",
        source: "answer",
        index: 1,
      }),
    ]);
  });

  it("files a word held in what was written as the student's own", async () => {
    const user = userEvent.setup();
    const { session } = await trailOpen(user);

    await holdWordIn("#earlier-answers .attempt__written", "amat");

    // Labelled `submitted`, because that sentence may be wrong and a card that
    // drew a mistake as a model would teach it back.
    expect(session.vocabContexts("v-amo")).toEqual([
      expect.objectContaining({
        sentence: "Puella rosa amat.",
        source: "submitted",
        index: 2,
      }),
    ]);
  });

  it("offers no hold on the English", async () => {
    const user = userEvent.setup();
    await trailOpen(user);
    // The prompt is the language the student already reads, so it takes the
    // plain branch and carries no `.word` spans at all.
    expect(wordsIn("#earlier-answers .attempt__prompt")).toHaveLength(0);
  });

  it("suspends the hold on the row being marked, and on that row alone", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    // Two answers on one topic, so there are two rows to tell apart.
    await user.type(screen.getByLabelText("Your Latin"), "Puella rosa amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));
    await user.type(screen.getByLabelText("Your Latin"), "Nautae procellam timēbant.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Hard/ }));
    await carryOn(user);
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    const map = screen.getByRole("dialog", { name: "Grammar index" });
    await user.click(within(map).getByRole("button", { name: /First declension/ }));

    // The rose row, whichever way round the trail is drawn.
    const rose = Array.from(document.querySelectorAll<HTMLElement>(".attempt")).find(
      (el) => el.textContent?.includes("Puella rosa amat."),
    )!;
    await user.click(within(rose).getByRole("button", { name: "Mark up this answer" }));
    await holdWordIn(".attempt--marking .attempt__answer", "rosam");
    expect(session.vocabList()).toHaveLength(0);

    // The other row never entered the mode, so its press still means save —
    // here by offering the card by hand, since the fixture has no `procellam`.
    // Its written line, not its correction: that answer matched, and a right
    // answer is marked and left alone rather than printed twice.
    await holdWordIn(".attempt:not(.attempt--marking) .attempt__written", "procellam");
    const written = screen.getByRole("dialog", { name: "Write the card yourself" });
    await user.click(within(written).getByRole("button", { name: "Close" }));

    // And the marked row's press comes straight back when the mode ends.
    await user.click(within(rose).getByRole("button", { name: "Done marking this answer" }));
    await holdWordIn(".attempt__answer", "rosam");
    expect(session.vocabList().map((c) => c.citation)).toEqual(["rosa, rosae (f)"]);
  });

  it("leaves the sheet the word was held in open", async () => {
    const user = userEvent.setup();
    const { session } = await trailInSheet(user);

    await holdWordIn(".attempt__answer", "rosam");

    // The card is saved and the page it was read on is still the page on
    // screen: taking a word must not cost the topic being read.
    expect(session.vocabCard("v-rosa")).toBeDefined();
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();
  });

  it("comes back to that sheet from the sheet a gesture raised over it", async () => {
    const user = userEvent.setup();
    await trailInSheet(user);

    // A form the dictionary has not got: the card is offered by hand, over the
    // topic sheet rather than instead of it.
    await holdWordIn(".attempt__answer", "Puella");
    const written = screen.getByRole("dialog", { name: "Write the card yourself" });
    await user.click(within(written).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();

    // And the same for a look, which commits nothing at all.
    await inspectWord("rosam");
    const sheet = screen.getByRole("dialog", { name: "rosa, rosae (f)" });
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();
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
    vi.mocked(prefetchGrammarBooks).mockClear();
    books.available = true;
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

  /*
   * The pack's further books used to be fetched by the switch that opened them
   * and cached by nothing at all — so a student who had read the whole app onto
   * their device, and could see Lane offered in the switcher, met "could not
   * open Lane" the one time it mattered. They come down at launch now, with
   * everything else.
   */
  it("takes the further books at launch too, after the tables", async () => {
    mount();

    await waitFor(() => expect(prefetchGrammarBooks).toHaveBeenCalled());
    // Last of the three: the file a student may never open must not delay the
    // one every gesture wants.
    expect(vi.mocked(loadParadigms).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prefetchGrammarBooks).mock.invocationCallOrder[0],
    );
  });

  it("does not fetch the books when the dictionary could not be got", async () => {
    dictionary.available = false;
    mount();

    await waitFor(() => expect(loadDictionary).toHaveBeenCalled());
    expect(prefetchGrammarBooks).not.toHaveBeenCalled();
  });

  /*
   * A book that would not come down is the one link in the chain with nothing
   * to say: the switch raises its own toast if it is ever reached with no
   * connection, and a launch that announced a book nobody has asked for would
   * be a warning about a screen the student is not on.
   */
  it("carries on quietly when a book cannot be fetched", async () => {
    books.available = false;
    mount();

    await waitFor(() => expect(prefetchGrammarBooks).toHaveBeenCalled());
    expect(screen.queryByText(/Could not open/)).toBeNull();
  });

  /*
   * "Everything is on this device" is the sentence a student checks before
   * getting on a plane, so it has to wait for everything. It used to be said on
   * the strength of the dictionary alone, with the tables and the books still
   * in the air behind it.
   */
  it("says everything is here once everything is, and names the books", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(prefetchGrammarBooks).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText(/Everything is on this device/)).toBeDefined();
    expect(screen.getByText(/Lane beside it/)).toBeDefined();
  });

  /*
   * The state the three-way copy could not reach until the books existed: the
   * dictionary in hand, and not everything here. Whatever the screen says then
   * must not be about the dictionary, which the student is looking words up
   * with — so what is missing goes unnamed and the button fetches whichever of
   * the three it was.
   */
  it("does not say it while a book is still missing, and blames nothing", async () => {
    books.available = false;
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(prefetchGrammarBooks).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByText(/Everything is on this device/)).toBeNull();
    expect(screen.getByText(/has not got all of it yet/)).toBeDefined();
    // The old copy read "The dictionary is another 4.4 MB … this device has not
    // managed it yet", with the dictionary sitting in memory as it said so.
    expect(screen.queryByText(/The dictionary is another/)).toBeNull();
  });
});

describe("looking a word up", () => {
  /**
   * Where the word came from, which the sheet could always have said.
   *
   * The dump the dictionary was built out of carries an etymology on every
   * entry, and the ingest read past it. It is folded away rather than printed:
   * it is prose of no fixed length, and the tables are what most double-clicks
   * are after, so a paragraph between the gloss and the endings would push the
   * endings off a phone.
   */
  describe("the etymology", () => {
    it("is folded away under the gloss, and opens to its paragraphs", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(screen.getByLabelText("Your Latin"), "manibus");
      await user.click(screen.getByRole("button", { name: "Submit" }));

      await inspectWord("manibus");
      const sheet = screen.getByRole("dialog", { name: "manus, manūs (f)" });
      const toggle = within(sheet).getByRole("button", { name: /Etymology/ });
      // Closed: the prose is an answer to a question the student has not asked
      // yet, and the tables are the one they usually have.
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(within(sheet).queryByText(/Proto-Italic/)).toBeNull();

      await user.click(toggle);
      // Two paragraphs, because the file's escaped newlines are read back as
      // the breaks they were — the origin, then the cognates.
      expect(within(sheet).getByText("From Proto-Italic *manus.")).toBeDefined();
      expect(within(sheet).getByText("Cognate with Old English mund.")).toBeDefined();
    });

    it("says nothing at all about a word it has none for", async () => {
      // Most words of any pack, so a line reading "no etymology recorded" would
      // be a defect reported on every second lookup.
      const user = userEvent.setup();
      mount();
      await user.click(screen.getByRole("button", { name: "Reveal" }));

      await inspectWord("rosam");
      const sheet = screen.getByRole("dialog", { name: "rosa, rosae (f)" });
      expect(within(sheet).queryByRole("button", { name: /Etymology/ })).toBeNull();
    });

    it("says the same nothing in a pack that ships no etymologies", async () => {
      // Greek's dictionary came out of Eulexis, which has none. The file is
      // simply absent, the index is empty, and no screen learns about it.
      etymologyFile.available = false;
      const user = userEvent.setup();
      mount();
      await user.type(screen.getByLabelText("Your Latin"), "manibus");
      await user.click(screen.getByRole("button", { name: "Submit" }));

      await inspectWord("manibus");
      const sheet = screen.getByRole("dialog", { name: "manus, manūs (f)" });
      expect(within(sheet).queryByRole("button", { name: /Etymology/ })).toBeNull();
      // And the rest of the sheet is untouched by its absence.
      expect(within(sheet).getByText("hand")).toBeDefined();
    });

    it("closes again when another reading of the same form is picked", async () => {
      // A different word, so the paragraph on screen is the previous word's
      // answer under the new word's name.
      const user = userEvent.setup();
      mount();
      await user.type(screen.getByLabelText("Your Latin"), "manibus");
      await user.click(screen.getByRole("button", { name: "Submit" }));

      await inspectWord("manibus");
      await user.click(screen.getByRole("button", { name: /Etymology/ }));
      expect(screen.getByText("From Proto-Italic *manus.")).toBeDefined();

      await user.click(screen.getByRole("button", { name: "mānis, māne" }));
      expect(screen.queryByText("From Proto-Italic *manus.")).toBeNull();
    });
  });

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
    // Somewhere to be, and the study body is not empty — which is the defect
    // this is about. Where that is, is the round the word called the student
    // away from: the pile is empty once the card is gone, so the loop turns
    // back to exploring and finds the round it had put down still waiting, on
    // the question it was left on rather than on a fresh one.
    expect(document.querySelector(".prompt")?.textContent).toBeTruthy();
    expect(eyebrow()).toContain("\u00b7 1/2");
    expect(screen.getByRole("button", { name: /keep writing/ })).toBeDefined();
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
    // The held word is picked out in the sentence it was held in — `.word--b`
    // now that the sentence is holdable in its own right, which is the same
    // rule in the stylesheet as the `.mark--b` it wore while it was plain.
    expect(document.querySelector(".word--b")?.textContent).toBe("rosam");
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

  /**
   * A line kept because of one word is still a line, full of others. These are
   * about the *other* words in it: the card the gesture writes is theirs, and
   * the sentence it keeps is the one the card being reviewed was holding — not
   * whatever question happens to be underneath the review.
   */
  it("records a neighbour of the word, keeping the sentence the card held", async () => {
    const user = userEvent.setup();
    const { session } = await reviewOne(user);
    await user.click(screen.getByRole("button", { name: "Show" }));

    await holdWordIn(".compare__block--reference", "amat");

    // The card is the held word's, and its sentence is the reviewed card's —
    // prompt, source and position all as they stood when `rosam` was taken.
    expect(session.vocabCard("v-amo")?.citation).toBe("amō, amāre, amāvī, amātum");
    expect(session.vocabContexts("v-amo")).toEqual([
      expect.objectContaining({
        prompt: "The girl loves the rose.",
        sentence: "Puella rosam amat.",
        source: "answer",
        index: 2,
      }),
    ]);
  });

  it("does not double the sentence when the card's own word is held", async () => {
    const user = userEvent.setup();
    const { session } = await reviewOne(user);
    await user.click(screen.getByRole("button", { name: "Show" }));

    await holdWordIn(".compare__block--reference", "rosam");

    // The same line folds to the same context, so there is nothing to add and
    // the toast says so rather than looking like a press that missed.
    expect(session.vocabContexts("v-rosa")).toHaveLength(1);
    expect(screen.getByText(/rosa, rosae \(f\) is already saved/)).toBeDefined();
  });

  it("looks a word up from the back of a card, without grading it", async () => {
    const user = userEvent.setup();
    const { session } = await reviewOne(user);
    await user.click(screen.getByRole("button", { name: "Show" }));

    await inspectWord("amat");
    const sheet = screen.getByRole("dialog", { name: "amō, amāre, amāvī, amātum" });
    expect(within(sheet).getByText("to love")).toBeDefined();

    // Nothing was saved and nothing was graded: closing comes back to the card.
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.getByText(`Vocabulary · ${profile.ui.sayItIn}`)).toBeDefined();
    expect(session.vocabCard("v-amo")).toBeUndefined();
    expect(session.vocabCard("v-rosa")?.fsrs.reps).toBe(0);
  });

  it("copies the sentence a card kept, and not the English with it", async () => {
    const user = userEvent.setup();
    await reviewOne(user);
    await user.click(screen.getByRole("button", { name: "Show" }));

    // Named by its text rather than by its block: a card keeps up to eight
    // sentences, and several can be labelled the same way.
    await user.click(
      screen.getByRole("button", { name: "Copy the sentence “Puella rosam amat.”" }),
    );
    expect(await navigator.clipboard.readText()).toBe("Puella rosam amat.");
  });

  it("says how the gestures work, only where there is a sentence to use them on", async () => {
    const user = userEvent.setup();
    await reviewOne(user);
    // Behind Show with the sentences, since that is what it is about.
    expect(screen.queryByText(/Hold a word to save it/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText(/Hold a word to save it/)).toBeDefined();
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

/**
 * How much arrives at a sitting.
 *
 * Four sentences on one topic is a real reason to put the phone down, and the
 * choice a student was being offered was four or none. The cap only ever takes
 * questions out — a round is still one test, still one review of the topic.
 */
describe("how many questions a round is for", () => {
  const openSettings = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Settings" }));
  };

  /** The length picker's buttons, by the label each one wears. */
  const lengths = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>(".lengths__pick"));

  it("is the whole test until somebody says otherwise", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/2`);

    await openSettings(user);
    expect(session.progress().questionsPerRound).toBeUndefined();
    // Absent on disk *and* shown as the choice in force, which is the pair a
    // default has to keep: a file that never touched this must read exactly as
    // it did before the setting existed.
    expect(lengths().find((b) => b.textContent === "All")?.ariaPressed).toBe("true");
  });

  it("is written down, and leaves the round in flight where it was", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await openSettings(user);
    await user.click(lengths().find((b) => b.textContent === "1")!);
    expect(session.progress().questionsPerRound).toBe(1);
    expect(lengths().find((b) => b.textContent === "1")?.ariaPressed).toBe("true");
    await user.click(screen.getByRole("button", { name: "Close" }));

    // The round already on the table keeps the length it opened with. Moving a
    // finish line somebody is running at is not what a preference is for, and
    // the window was written on the round when the round was served.
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/2`);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 2/2`);
  });

  it("ends the round after that one question, and it still costs one review", async () => {
    const user = userEvent.setup();
    // Already in the review pile, so the landing is the ordinary one rather
    // than the offer to add the topic — what is being watched here is where the
    // round stops, not what it asks afterwards.
    const { session } = mount({ ...enrolled(), questionsPerRound: 1 });

    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/1`);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // One question in and the round has landed — where without the window it
    // would have gone on to a second the student never asked to be shown.
    expect(screen.getByRole("button", { name: /Keep going|Carry on/ })).toBeDefined();
    // Two reps: the one enrolling the topic bought, and this round's. A short
    // round costs exactly what a whole one does, which is the point of the round
    // being the unit rather than the question.
    expect(session.progress().topicCards.decl1!.reps).toBe(2);
  });

  it("hands over the half it stopped short of next time", async () => {
    const user = userEvent.setup();
    mount({ ...emptyProgress(), questionsPerRound: 1 });

    const first = document.querySelector(".prompt")?.textContent;
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await carryOn(user);

    // Nothing is lost by a short round: the topic's other sentence is what the
    // next one opens on, which is the promise the test cycle already makes for
    // whole tests, kept here question by question.
    expect(document.querySelector(".prompt")?.textContent).not.toBe(first);
  });
});

/**
 * Keeping a sentence.
 *
 * The app studies grammar topics, and a sentence arrives because its topic came
 * round. Some of them are worth more than that — the ones quoted out of an
 * ancient author above all — and until this the only thing to do about one was
 * hope the shuffle brought it back.
 */
describe("keeping a sentence", () => {
  const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
  /** A topic whose only test is one quoted line, so the round opens on it. */
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
              note: "Predicate adjective.",
              source: cite,
            },
          ],
        },
      ],
    },
  };

  const keep = () => screen.getByRole("button", { name: /keep this sentence/ });

  it("keeps the question whole, with whoever it is quoted from", async () => {
    const user = userEvent.setup();
    const { session } = mount(undefined, quoted);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(keep());

    const card = session.sentenceList()[0]!;
    expect(card.prompt).toBe("Gaul is divided into three parts.");
    expect(card.answer).toBe("Gallia est omnis dīvīsa in partēs trēs.");
    // The attribution is the whole reason most of these cards will exist.
    expect(card.source).toEqual(cite);
    expect(card.note).toBe("Predicate adjective.");
  });

  it("says the press landed, rather than going quiet", async () => {
    const user = userEvent.setup();
    mount(undefined, quoted);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(keep());

    // Disabled rather than gone: the row does not reflow under a thumb, and a
    // student who presses again is told they already have it.
    const kept = screen.getByRole("button", { name: /sentence kept/ });
    expect(kept).toHaveProperty("disabled", true);
    expect(screen.getByText(/Sentence kept/)).toBeDefined();
  });

  it("takes the marks as they stood, and not what was written", async () => {
    const user = userEvent.setup();
    const { session } = mount(undefined, quoted);
    await user.type(screen.getByLabelText("Your Latin"), "Gallia est divisa.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await user.click(screen.getByRole("button", { name: /✱ mark/ }));
    await tapWord(user, ".prompt", "Gaul");
    await tapWord(user, ".compare__block--reference", "Gallia");
    await tapWord(user, ".compare__block--reference", "Gallia"); // bold → italic
    // Something picked out in what the student wrote, which the card must not
    // keep: that sentence is not on the card, so an emphasis over it would be
    // an emphasis over nothing.
    await tapWord(user, ".compare__block:not(.compare__block--reference)", "divisa");
    await user.click(screen.getByRole("button", { name: /done marking/ }));
    await user.click(keep());

    const card = session.sentenceList()[0]!;
    expect(card.marks).toEqual({ prompt: { 0: 1 }, answer: { 0: 2 } });
  });

  it("comes back for review, with the marks and the attribution on it", async () => {
    const user = userEvent.setup();
    const { session } = mount(undefined, quoted);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(keep());
    // Over to the pile: a card kept a moment ago is due now, and nothing else
    // is, so the only thing the reviews can hand over is this one — English
    // side up, like every card in this app.
    await user.click(screen.getByRole("button", { name: "Review" }));

    expect(document.querySelector(".prompt")?.textContent).toBe(
      "Gaul is divided into three parts.",
    );
    expect(document.querySelector(".status__title")?.textContent).toBe(
      "A sentence you kept",
    );
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("de Bello Gallico")).toBeDefined();
    expect(screen.getByText(/Predicate adjective/)).toBeDefined();

    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(session.sentenceList()[0]!.fsrs.reps).toBe(1);
  });

  it("cannot be reported as an empty pile while it is due", async () => {
    // The regression this exists for: every screen that asked "is anything
    // waiting" used to add up the kinds of card it knew about, so a third kind
    // would have been invisible to all of them at once.
    const user = userEvent.setup();
    mount(undefined, quoted);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(keep());
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(document.querySelector(".status__counts")?.textContent).toMatch(/1 due/);
    expect(screen.queryByText("The pile is clear.")).toBeNull();
  });

  it("is listed, and forgetting one can be taken back", async () => {
    const user = userEvent.setup();
    const { session } = mount(undefined, quoted);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(keep());

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "1 sentence" }));
    const sheet = screen.getByRole("dialog", { name: "Sentences" });
    expect(within(sheet).getByText("de Bello Gallico")).toBeDefined();

    await user.click(within(sheet).getByRole("button", { name: /forget this one/ }));
    await user.click(
      within(sheet).getByRole("button", { name: "Confirm — forget it" }),
    );
    expect(session.sentenceList()).toHaveLength(0);

    // A month of reviews behind one press is a press that needs a way back.
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(session.sentenceList()).toHaveLength(1);
  });
});

describe("the schedule", () => {
  it("says what is waiting and what comes back when", async () => {
    const user = userEvent.setup();
    mount(enrolled());
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
      seed.enrolTopic("decl1", 1, week);
      seed.enrolTopic("pres", 1, new Date(week.getTime() + 1000));
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
      mount(enrolled());
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
      seed.enrolTopic("decl1", 1, week);
      seed.enrolTopic("quirk", 1, new Date(week.getTime() + 1000));

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
      await carryOn(user);

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
    // A word at a time, since the trail's Latin is holdable — so the line is
    // read off the block rather than looked up as one piece of text.
    expect(
      one.querySelector(".attempt__written")?.textContent,
    ).toBe("Puella rosa amat.");
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

  it("takes you back off the card the round landed on", async () => {
    const user = userEvent.setup();
    const { session } = mount(enrolled());

    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    expect(screen.getByRole("button", { name: "Keep going" })).toBeDefined();

    // The ↺ is already offered here — it is drawn on whatever screen the grade
    // landed on, so the card needed no wiring of its own.
    await user.click(screen.getByRole("button", { name: "Undo last grade" }));

    // The question comes back with its grade untaken, and so does the round.
    expect(screen.getByText("The sailors feared the storm.")).toBeDefined();
    expect(screen.getByRole("button", { name: /Good/ })).toBeDefined();
    expect(session.progress().openRound).toMatchObject({
      sectionId: "decl1",
      answered: 1,
    });
    expect(session.landedRound()).toBeNull();
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
    const { session } = mount(enrolled());

    await user.type(screen.getByLabelText("Your Latin"), "Puella rosam amat.");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: /Again/ })); // meant Easy

    // The grade landed and the next question is up.
    const failed = session.progress().topicCards.decl1!.due;
    expect(screen.getByText(`${profile.ui.promptDirection} · 2/2`)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Undo last grade" }));

    // The question is back as it was left…
    expect(screen.getByText(`${profile.ui.promptDirection} · 1/2`)).toBeDefined();
    expect(screen.getByText("The girl loves the rose.")).toBeDefined();
    expect(screen.getByText("You wrote")).toBeDefined();
    expect(sentences()).toEqual(["Puella rosam amat.", "Puella rosam amat."]);
    // …and so is the engine: the card is back where it stood, nothing in the trail.
    expect(session.progress().topicCards.decl1!.due).not.toBe(failed);
    expect(session.attemptsFor("decl1")).toHaveLength(0);

    // One grade deep and no further: nothing older waits behind it.
    expect(screen.queryByRole("button", { name: "Undo last grade" })).toBeNull();

    // Grading again applies once, not twice — on top of the enrolment, which
    // is the card's first rep.
    await user.click(screen.getByRole("button", { name: /Easy/ }));
    expect(session.progress().topicCards.decl1!.reps).toBe(2);
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
  it("takes up any topic, whatever was being studied before", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    // Only the open family shows its topics; Verb forms is not the one open.
    await user.click(screen.getByRole("button", { name: /^Verb forms/ }));
    await user.click(screen.getByRole("button", { name: /Present indicative/ }));
    await user.click(screen.getByRole("button", { name: /^Practise/ }));

    // Straight to a test on the chosen topic, not the one in hand.
    expect(screen.getByText("The poet praises the queen.")).toBeDefined();
  });

  it("says what each topic is, rather than numbering it", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));

    // Each topic is a row carrying Bennett's § reference, its title and how
    // much of its bank has been met — not a square labelled with its position,
    // and not a score. There is no "% mastered" anywhere on this sheet.
    expect(
      screen.getByRole("button", {
        name: /§ 23-27\s*Second declension\s*0\/1 questions answered/,
      }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2" })).toBeNull();
    expect(screen.queryByText(/mastered/i)).toBeNull();

    // The family counts the topics under it, and says nothing about them.
    expect(screen.getByRole("button", { name: /^Nouns\s+2 topics/ })).toBeDefined();
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
    expect(within(topic).getByRole("button", { name: /Read § 23-27/ })).toBeDefined();
    await user.click(within(topic).getByRole("button", { name: /^Practise/ }));

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
    expect(within(topic).getByRole("button", { name: /^Practise/ })).toBeDefined();
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
    const { session } = mount(enrolled());
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    const saved = new SyncingStorage().read();
    expect(saved?.topicCards.decl1).toBeDefined();
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
      starred: ["decl2"],
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
    expect(kept?.starred).toEqual(["decl2"]);
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

describe("the one way onto a topic", () => {
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

  it("moves to a topic only when one is chosen, and stays there", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    expect(onScreen()).toBe("First declension");

    await pickTopic(user, /Verb forms/, /Present indicative/);
    await user.click(screen.getByRole("button", { name: /Practise/ }));

    expect(onScreen()).toBe("Present indicative");
    expect(session.practiseRun()?.sectionId).toBe("pres");
  });

  it("stays on the topic whatever the grade, rather than reading on", async () => {
    const user = userEvent.setup();
    mount();

    // decl1's whole bank is two questions, both graded "again". A walk through
    // the book stepped on after every round — so the topic going worst was the
    // one you were moved off. Staying is the whole point of a run.
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Again/ }));
    }
    await carryOn(user);
    expect(screen.queryByText("The master frees the slave.")).toBeNull();
    expect(screen.getByRole("heading", { name: "All practised." })).toBeDefined();
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
    await carryOn(user);
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

    await carryOn(user);
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

    await carryOn(user);
    await user.click(screen.getByRole("button", { name: "Practise all 2 again" }));
    expect(session.practice("decl1")).toEqual({ done: 0, total: 2 });
    expect(document.querySelector(".status__row .badge")?.textContent).toBe("drill 0/2");
  });

  it("leaves a worked-out run only by picking another topic", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    await user.click(screen.getByRole("button", { name: "Practise these 2" }));
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }

    await carryOn(user);
    // The stop screen's second answer is the index, because there is nowhere
    // else to be sent — "back to the book in order" named a walk that is gone.
    await user.click(screen.getByRole("button", { name: "Pick another topic" }));
    const map = screen.getByRole("dialog", { name: "Grammar index" });
    const verbs = within(map).getByRole("button", { name: /Verb forms/ });
    if (verbs.getAttribute("aria-expanded") === "false") await user.click(verbs);
    await user.click(within(map).getByRole("button", { name: /Present indicative/ }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Present indicative" }))
        .getByRole("button", { name: /^Practise/ }),
    );
    expect(session.practiseRun()?.sectionId).toBe("pres");
    expect(onScreen()).toBe("Present indicative");
  });

  it("costs a topic one review per round of questions, not one per question", async () => {
    const user = userEvent.setup();
    // Already in the pile, so the round has a card to move: the enrolment is
    // the first rep, and the whole round is the second.
    const { session } = mount(enrolled());

    // decl1's test holds two questions; both are one round.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    expect(session.progress().topicCards.decl1!.reps).toBe(2);
  });

  it("costs a topic nothing at all until it is added to the reviews", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // Two questions answered and on the record, and the pile still empty.
    expect(session.attemptsFor("decl1")).toHaveLength(2);
    expect(session.progress().topicCards).toEqual({});
  });

  it("stars a topic from its sheet, and pins it above the families", async () => {
    const user = userEvent.setup();
    const { session } = mount();

    await pickTopic(user, /Verb forms/, /Present indicative/);
    await user.click(screen.getByRole("button", { name: "☆ Star this topic" }));
    expect(session.isStarred("pres")).toBe(true);

    // Pinned at the top of the index, out of the family it lives in — a
    // shortlist that has to be assembled by scrolling is not one.
    await user.click(screen.getByRole("button", { name: /^Close/ }));
    const map = screen.getByRole("dialog", { name: "Grammar index" });
    const shelf = within(map).getByText("★ Starred").closest(".family")!;
    expect(
      within(shelf as HTMLElement).getByRole("button", { name: /Present indicative/ }),
    ).toBeDefined();

    // And it comes off again from the same button, taking the shelf with it.
    await user.click(
      within(shelf as HTMLElement).getByRole("button", { name: /Present indicative/ }),
    );
    await user.click(screen.getByRole("button", { name: "★ Starred" }));
    expect(session.isStarred("pres")).toBe(false);
    await user.click(screen.getByRole("button", { name: /^Close/ }));
    expect(
      within(screen.getByRole("dialog", { name: "Grammar index" }))
        .queryByText("★ Starred"),
    ).toBeNull();
  });

  it("offers no shelf at all until something is starred", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Grammar index" }));
    expect(screen.queryByText("★ Starred")).toBeNull();
  });

  /**
   * The other way onto a topic, and the only one the student does not steer.
   *
   * The index is still where a topic is *chosen*; this is for the evening when
   * choosing is the part standing in the way. So it does the whole of what
   * picking a row and pressing Practise does — same run, same explore mode —
   * and the only thing it adds is a way to refuse the answer.
   */
  describe("the die", () => {
    const die = () => screen.getByRole("button", { name: "Roll a topic to study" });

    /** A deck with some topics already off the die, and nothing being studied. */
    const withNoRoll = (...off: string[]) => {
      const s = new Session(new Content(fixture, testProfile));
      for (const id of off) s.excludeFromRoll(id);
      return mount(s.progress(), fixture, testProfile, null);
    };

    it("hands over a topic to practise, and names it with a way to refuse", async () => {
      const user = userEvent.setup();
      const { session } = mount(undefined, fixture, testProfile, null);

      await user.click(die());

      // A rolled topic is entered exactly as a chosen one is: a run in flight,
      // in explore, with the status bar naming it.
      const run = session.practiseRun();
      expect(run).not.toBeNull();
      expect(onScreen()).toBe(
        session.grammarMap().find((t) => t.sectionId === run!.sectionId)!.title,
      );
      expect(screen.getByRole("button", { name: "roll again" })).toBeDefined();
    });

    it("does not cost the review it called you away from", async () => {
      /*
       * The bug this was reported as, end to end. Two questions into a review,
       * tap the die: leaving is fine and always was, but coming back served a
       * different test of a different topic and there was no way to say where
       * you had been.
       *
       * Two topics in the pile, so the switch is live either way and the round
       * coming back cannot be an accident of there being nothing else to serve.
       */
      const user = userEvent.setup();
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const s = new Session(new Content(fixture, testProfile));
      s.enrolTopic("decl1", 1, hourAgo);
      s.enrolTopic("pres", 1, new Date(hourAgo.getTime() + 1000));
      mount(s.progress(), fixture, testProfile, null);

      const topic = onScreen();
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
      const where = eyebrow();
      // Half a sentence in the box and never submitted, inside the 400ms the
      // draft-keeper waits: the tap has to write it down on the way out.
      await user.type(screen.getByLabelText("Your Latin"), "puella");

      await user.click(die());
      // Leaving is fine and always was; the die is doing its job here.
      expect(onScreen()).not.toBe(topic);

      await user.click(screen.getByRole("button", { name: "Review" }));
      expect(onScreen()).toBe(topic);
      expect(eyebrow()).toBe(where);
      expect((screen.getByLabelText("Your Latin") as HTMLTextAreaElement).value).toBe(
        "puella",
      );
    });

    it("keeps the switch live over a review that was put down", async () => {
      /*
       * The case that would leave the round unreachable, and it is the one the
       * bug was hit in: the round's own first grade is what reschedules its
       * card, so answering one question of the last topic due empties the pile.
       * Both halves of the switch grey out on an empty pile — so without this
       * the way back to the round is dimmed by the round's own progress.
       */
      const user = userEvent.setup();
      const s = new Session(new Content(fixture, testProfile));
      s.enrolTopic("decl1", 1, new Date(Date.now() - 60 * 60 * 1000));
      mount(s.progress(), fixture, testProfile, null);

      const topic = onScreen();
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
      await user.click(die());

      // Nothing is due any more, and Review is still somewhere to go.
      expect(document.querySelector(".status__counts")?.textContent).not.toContain("due");
      const review = screen.getByRole("button", { name: "Review" }) as HTMLButtonElement;
      expect(review.disabled).toBe(false);
      await user.click(review);
      expect(onScreen()).toBe(topic);
    });

    it("keeps the run it rolled when the review is gone back to and left again", async () => {
      // Both slots at once: the review the die left, and the run the die began.
      const user = userEvent.setup();
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const s = new Session(new Content(fixture, testProfile));
      s.enrolTopic("decl1", 1, hourAgo);
      s.enrolTopic("pres", 1, new Date(hourAgo.getTime() + 1000));
      mount(s.progress(), fixture, testProfile, null);

      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
      await user.click(die());

      const rolled = onScreen();
      // The sentence being written is what tells a resumed round from a freshly
      // served one here: both would be on the rolled topic, since the run in
      // flight is what `next` would name anyway.
      await user.type(screen.getByLabelText("Your Latin"), "temptabam");

      await user.click(screen.getByRole("button", { name: "Review" }));
      await user.click(screen.getByRole("button", { name: "Explore" }));
      expect(onScreen()).toBe(rolled);
      expect((screen.getByLabelText("Your Latin") as HTMLTextAreaElement).value).toBe(
        "temptabam",
      );
    });

    it("rolls something else when the answer is refused", async () => {
      // The refusal has to be worth making: a die that can hand back what is
      // already on screen reads as a broken button rather than as a coincidence.
      const user = userEvent.setup();
      mount(undefined, fixture, testProfile, null);

      await user.click(die());
      const first = onScreen();
      await user.click(screen.getByRole("button", { name: "roll again" }));
      expect(onScreen()).not.toBe(first);
    });

    it("never rolls a topic that has been taken off it", async () => {
      const user = userEvent.setup();
      const { session } = withNoRoll("decl1", "pres");

      for (let i = 0; i < 8; i += 1) {
        await user.click(die());
        expect(session.practiseRun()?.sectionId).toBe("decl2");
      }
    });

    it("says so rather than doing nothing when every topic is off it", async () => {
      const user = userEvent.setup();
      const { session } = withNoRoll("decl1", "decl2", "pres");

      await user.click(die());
      expect(session.practiseRun()).toBeNull();
      expect(screen.getByText(/Nothing to roll/)).toBeDefined();
    });

    it("takes a topic off the die from its sheet, and says so on its row", async () => {
      const user = userEvent.setup();
      const { session } = mount();

      await pickTopic(user, /Verb forms/, /Present indicative/);
      await user.click(screen.getByRole("button", { name: "Never roll this" }));
      expect(session.isExcludedFromRoll("pres")).toBe(true);

      // The button is its own undo — no arming, because nothing was deleted.
      const back = screen.getByRole("button", { name: "✓ Off the die" });
      expect(back.getAttribute("aria-pressed")).toBe("true");

      // And the index says why the topic stopped coming up, where somebody
      // would go looking for it.
      await user.click(screen.getByRole("button", { name: /^Close/ }));
      const map = () => screen.getByRole("dialog", { name: "Grammar index" });
      await user.click(within(map()).getByRole("button", { name: /Verb forms/ }));
      const row = () =>
        within(map()).getByRole("button", { name: /Present indicative/ });
      expect(row().textContent).toContain("off the die");

      await user.click(row());
      await user.click(screen.getByRole("button", { name: "✓ Off the die" }));
      expect(session.isExcludedFromRoll("pres")).toBe(false);
    });

    it("offers no toggle on a page there is nothing to roll for", async () => {
      // A topic with no questions is one the die already skips, so offering to
      // exclude it would be offering to change nothing.
      const user = userEvent.setup();
      const withEmpty: ContentData = {
        ...fixture,
        grammar: [
          ...fixture.grammar,
          { id: "sounds", ref: "1", title: "Sounds", family: "nouns", text: "...", order: 1, readingOnly: true },
        ],
      };
      mount(undefined, withEmpty, testProfile);

      await pickTopic(user, /Nouns/, /Sounds/);
      expect(screen.queryByRole("button", { name: /Never roll this/ })).toBeNull();
    });
  });

  it("offers no dismissal on the topic sheet, wherever the topic stands", async () => {
    /*
     * It used to, at the foot under a "Reviews" heading and behind two presses,
     * and the graded screen offered it as well. Two surfaces for one decision,
     * and this was the wrong one: a sheet opened in order to *start* something
     * ended with a way to stop. The round is where a topic proves it is not
     * what you need, so the round is where the offer lives — see the describe
     * below, which is the whole of the feature now.
     *
     * Checked on a topic in the pile *and* on one scheduled for later, because
     * "scheduled for next month" is exactly the topic somebody is looking at
     * when they decide they have had enough of it, and it was the case the old
     * offer went out of its way to cover.
     */
    const user = userEvent.setup();
    const { session } = mount(enrolled());

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(session.progress().topicCards.decl1).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: /§ 20-22\s*First declension/ }));
    expect(
      screen.queryByRole("button", { name: /stop reviewing/i }),
    ).toBeNull();
    expect(screen.queryByText("Reviews")).toBeNull();
  });

  /**
   * The other way to dismiss, and the one that matters most.
   *
   * A topic proves it is not what you need *while you are being asked about
   * it*, so the link sits beside the grades — the same place `✎ edit this word`
   * sits on a vocabulary card. Everything about it lives in the app rather than
   * in the engine: the two-press arming, its reset, and getting off the round
   * the deleted card was under.
   */
  describe("stopping a review from the round itself", () => {
    /**
     * A deck with one topic failed an hour ago, so a review opens on it — and
     * with no topic chosen, so what is behind the review is the empty table
     * rather than a run these scenarios never asked for.
     */
    const withReview = () => {
      const s = new Session(new Content(fixture, testProfile));
      s.enrolTopic("decl1", 1, new Date(Date.now() - 60 * 60 * 1000));
      mount(s.progress(), fixture, testProfile, null);
      return s;
    };

    it("takes two presses, and the first only says what the second will do", async () => {
      const user = userEvent.setup();
      const s = withReview();
      await user.click(screen.getByRole("button", { name: "Reveal" }));

      await user.click(screen.getByRole("button", { name: /stop reviewing this/ }));
      // Armed, and nothing done: a deletion behind one tap beside four grade
      // buttons is a deletion given by mistake.
      expect(s.progress().topicCards.decl1).toBeDefined();
      const armed = screen.getByRole("button", { name: /⊘ confirm/ });
      expect(armed).toBeDefined();
      // And it says so in more than words. It stands in a row of five links all
      // drawn the same, where a changed label alone is the one thing a thumb on
      // its way to a grade button will not read.
      expect(armed.className).toContain("linkrow__armed");
      expect(armed.getAttribute("aria-pressed")).toBe("true");

      await user.click(screen.getByRole("button", { name: /⊘ confirm/ }));
      expect(s.progress().topicCards.decl1).toBeUndefined();
    });

    it("gets off the round, so the questions left cannot rebuild the card", async () => {
      /*
       * The bug this exists for. `gradeTopic` rewinds a topic's card to
       * `cardBefore` and re-rates it on every grade of a round, so a dismissal
       * taken on question one and then carried on from would be undone by
       * question two — silently, by the student doing nothing unusual.
       */
      const user = userEvent.setup();
      const s = withReview();
      expect(eyebrow()).toContain("· 1/2"); // two questions in this round

      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /stop reviewing this/ }));
      await user.click(screen.getByRole("button", { name: /⊘ confirm/ }));

      // The round went with the card, and the loop moved on rather than leaving
      // the next question of a topic that is no longer being reviewed.
      expect(s.progress().openRound).toBeNull();
      expect(s.progress().topicCards.decl1).toBeUndefined();
      // Nothing was due but that topic, so there is nothing left to review.
      expect(screen.getByRole("heading", { name: "Pick a topic." })).toBeDefined();
      expect(document.querySelector(".status__counts")?.textContent).not.toMatch(/due/);
      expect(screen.getByRole("button", { name: "Review" })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("is not offered on a run of practice, where there is no pile to leave", async () => {
      // The topic was chosen a moment ago; the way out is choosing another.
      const user = userEvent.setup();
      mount();
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      expect(document.querySelector(".status__row .badge")?.textContent).toBe("drill 0/2");
      expect(screen.queryByRole("button", { name: /stop reviewing this/ })).toBeNull();
    });

    it("disarms when the question changes, so the second press cannot land elsewhere", async () => {
      // The first press names a topic. A press still armed on the next question
      // would take *that* topic out of the pile, which is nobody's intent.
      const user = userEvent.setup();
      const s = withReview();
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /stop reviewing this/ }));
      expect(
        screen.getByRole("button", { name: /⊘ confirm/ }),
      ).toBeDefined();

      // On to question two of the round, which disarms it.
      await user.click(screen.getByRole("button", { name: /Good/ }));
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      expect(screen.getByRole("button", { name: /stop reviewing this/ })).toBeDefined();
      expect(
        screen.queryByRole("button", { name: /⊘ confirm/ }),
      ).toBeNull();
      expect(s.progress().topicCards.decl1).toBeDefined();
    });
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
    s.enrolTopic("decl1", 1, new Date(Date.now() - 60 * 60 * 1000));
    return s.progress();
  };

  it("names a run of practice a drill, and a card come back a review", async () => {
    mount();
    expect(badge()).toBe("drill 0/2");

    cleanup();
    mount(withBacklog());
    expect(badge()).toBe("review");
    expect(title()).toBe("First declension");
  });

  it("says the same thing on familiar ground as on new, since the reason is the same", () => {
    /*
     * `new` and `revisiting` were the badges for the book's walk arriving at a
     * topic for the first time and coming back round to one already graded.
     * Neither is a reason any more — a topic is on screen because somebody
     * asked for it — so both rounds say `drill`. Whether the ground is new is
     * still a live question, and it is answered by the grammar being shown.
     */
    const s = new Session(new Content(fixture, testProfile));
    // Answered yesterday, so the run opened on mount is over what is left.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    s.recordAttempt(
      "decl1",
      {
        prompt: "The girl loves the rose.",
        answer: "Puella rosam amat.",
        submitted: "Puella rosam amat.",
        rating: 4,
      },
      yesterday,
    );
    s.enrolTopic("decl1", 4, yesterday);
    mount(s.progress());

    expect(badge()).toBe("drill 0/1");
    expect(title()).toBe("First declension");
    // Not taught again: the grammar sheet is for ground never met.
    expect(screen.queryByRole("dialog", { name: "First declension" })).toBeNull();
  });

  it("still teaches before testing on a topic never answered", () => {
    mount();
    expect(badge()).toBe("drill 0/2");
    // The badge says why the round is here; the open sheet says the ground is
    // new. Two different facts, and they were run together while one value
    // carried both.
    expect(screen.getByRole("dialog", { name: "First declension" })).toBeDefined();
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
    s.enrolTopic("decl1", 1, hourAgo);
    s.enrolTopic("decl2", 1, hourAgo);
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
    // Leave a practice round on the table with the reviews still waiting.
    await user.click(screen.getByRole("button", { name: "Explore" }));
    expect(new SyncingStorage().read()?.openRound?.via).toBe("drill");

    cleanup();
    mount(new SyncingStorage().read() ?? undefined);
    // The pile decides, so the practice round is not the one picked back up: a
    // switch reading "Review" over a topic a run served would be naming
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
    expect(new SyncingStorage().read()?.openRound?.via).toBe("drill");

    // And it lands on the topic the run is for, which is the one chosen —
    // not on whatever the pile happened to be holding.
    expect(title()).toBe("First declension");
    expect(badge()).toBe("drill 0/2");

    // Working it through is reachable at once, where everything due used to be
    // served before anything else.
    for (const _ of [0, 1]) {
      await user.click(screen.getByRole("button", { name: "Reveal" }));
      await user.click(screen.getByRole("button", { name: /Good/ }));
    }
    await carryOn(user);
    expect(screen.getByRole("heading", { name: "All practised." })).toBeDefined();
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

  it("throws itself back to the book once the card between rounds is dismissed", async () => {
    const user = userEvent.setup();
    // One topic waiting, whose test is a single question.
    const s = new Session(new Content(fixture, testProfile));
    s.enrolTopic("decl2", 1, new Date(Date.now() - 60 * 60 * 1000));
    mount(s.progress());
    expect(pressed("Review")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));

    // The switch is not thrown underneath the moment. It used to be, with a
    // toast over the next question saying so, which is the pile emptying
    // reported for 2.6 seconds on a screen that had already moved on.
    //
    // One card, not two: the round that finished and the pile that emptied are
    // the same moment, so the head is still the topic and the clearing is a
    // line under it.
    expect(screen.getByText("And that was the last thing waiting.")).toBeDefined();
    expect(document.querySelector(".toast")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Carry on" }));
    expect(pressed("Explore")).toBe("true");
  });

  it("throws the switch for a route into the loop that is not a grade", async () => {
    const user = userEvent.setup();
    mount();

    // Record a word — a card recorded now is due now — and go and review it.
    // It is the only thing waiting.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("rose")).toBeDefined();

    // Then delete it out from under the review rather than grading it. The
    // pile empties without a grade, which is the case the switch's own branch
    // is still there for: it lands on no card, because nothing was finished.
    await user.click(screen.getByRole("button", { name: /edit this word/ }));
    const sheet = screen.getByRole("dialog", { name: "Edit word" });
    await user.click(within(sheet).getByRole("button", { name: /Delete this word/ }));
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

    expect(screen.queryByText("The pile is clear.")).toBeNull();
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
    // Reading it is still offered: a page with no quotation on it is still a
    // page, and reading is the one thing every page can do.
    expect(
      screen.getByRole("button", { name: /Read § 23-27/ }),
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
      // starring it are still on offer behind this row, and a `disabled` here
      // would take both away to save a student a tap they might want.
      expect(row).toHaveProperty("disabled", false);
      await user.click(row);
      expect(
        screen.getByRole("button", { name: /Read § 23-27/ }),
      ).toHaveProperty("disabled", false);
      expect(
        screen.getByRole("button", { name: "☆ Star this topic" }),
      ).toHaveProperty("disabled", false);
    });
  });

  /**
   * The reviews, which the preference used to be exempt from.
   *
   * A card comes due on a topic rather than on a sentence — the round it was
   * built from is spent, and the topic hands over whatever is next in its
   * cycle — so there is nothing about a review that has to be generated. What
   * there is instead is a floor: a due card that is never served stays due,
   * and a pile that cannot go down is not a schedule.
   */
  describe("and the reviews it narrows too", () => {
    const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000);

    it("brings a due topic back on its quotation", async () => {
      const s = new Session(new Content(quoted, testProfile));
      s.enrolTopic("decl1", 1, hourAgo());
      // The cycle is left standing past the quotation, which is the only
      // position that tells the filter from the order: unnarrowed, the next
      // test here is the written one. Narrowed, the cycle is one test long,
      // rolls, and comes back to Caesar.
      mount(
        {
          ...s.progress(),
          quotedOnly: true,
          testCycles: { decl1: { seed: 1, at: 1 } },
        },
        quoted,
      );

      expect(screen.getByText("Gaul is divided into three parts.")).toBeDefined();
      expect(screen.queryByText("The girl loves the rose.")).toBeNull();
    });

    it("brings one with nothing quoted back all the same", async () => {
      const s = new Session(new Content(quoted, testProfile));
      s.enrolTopic("decl2", 1, hourAgo());
      mount({ ...s.progress(), quotedOnly: true }, quoted);

      // Second declension has tests and no quotation among them. The walk
      // steps over such a topic and loses nothing by it — it is still there
      // when the preference goes off. A review that stepped over it would
      // leave this card due for ever, and the loop naming it for ever.
      expect(screen.getByText("The master frees the slave.")).toBeDefined();
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

  /**
   * A copy of the pack's progress, saved at `at`, with `starred` in it.
   *
   * The stars are only a marker here — one field whose value says which copy
   * this is, so an assertion can name the one that survived. Any per-topic
   * field would do; this is the one that is a plain list and reads clearly in
   * an expectation.
   */
  const copy = (at: string, starred: string[]): Progress => ({
    ...new Session(new Content(fixture, testProfile)).progress(),
    updatedAt: at,
    starred,
  });

  it("takes the newer copy without a word when it has nothing of its own", async () => {
    const reload = stubReload();
    const remote = copy("2026-09-09T00:00:00.000Z", ["decl2"]);
    stubGitHub(remote);

    const mine = onDevice(copy("2026-01-01T00:00:00.000Z", ["decl1"]));
    configured();
    synced(mine.updatedAt); // pushed, and untouched since
    await act(async () => {
      mount(mine);
    });

    // No sheet. This is the phone-then-laptop case and it is not a question.
    expect(screen.queryByRole("dialog", { name: /another device/i })).toBeNull();
    expect(new SyncingStorage().read()?.starred).toEqual(["decl2"]);
    expect(reload).toHaveBeenCalled();
  });

  it("asks when this device has been studied since it last synced", async () => {
    stubReload();
    stubGitHub(copy("2026-09-09T00:00:00.000Z", ["decl2"]));

    const mine = onDevice(copy("2026-02-02T00:00:00.000Z", ["decl1"]));
    configured();
    synced("2026-01-01T00:00:00.000Z"); // and studied after that
    await act(async () => {
      mount(mine);
    });

    expect(
      screen.getByRole("dialog", { name: "Progress from another device" }),
    ).toBeDefined();
    // Nothing was decided on the student's behalf.
    expect(new SyncingStorage().read()?.starred).toEqual(["decl1"]);
  });

  it("pushes nothing before it has looked at what GitHub holds", async () => {
    // The reported bug. A grade in the first seconds used to beat the startup
    // check through the four-second debounce, and the copy it committed was the
    // stale one the check was on its way to replace.
    const calls = stubGitHub(copy("2026-09-09T00:00:00.000Z", ["decl2"]));
    stubReload();
    configured();
    synced("2026-01-01T00:00:00.000Z"); // studied since, so nothing is adopted

    const user = userEvent.setup();
    mount(onDevice(copy("2026-02-02T00:00:00.000Z", ["decl1"])));
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    await passTime(4500); // past the four-second debounce

    // The read came first, and the stale copy never went up behind it.
    expect(calls[0]).toBe("GET");
    expect(calls).not.toContain("PUT");
  }, 10_000);

  it("holds the push when another device gets in first, and keeps the work", async () => {
    const remote = copy("2026-09-09T00:00:00.000Z", ["decl2"]);
    stubGitHub(remote);
    const user = userEvent.setup();
    // Connected mid-session, so the gate is open and the check is not running.
    const { storage, session } = mount(copy("2026-01-01T00:00:00.000Z", ["decl1"]));
    await act(async () => {
      storage.configure(CONFIG);
    });

    await act(async () => {
      await storage.saveNow(session.progress());
    });

    expect(storage.currentState().kind).toBe("behind");
    // Study is untouched by it: the question on screen is still the one that
    // was there, underneath the sheet.
    expect(screen.getByRole("button", { name: "Reveal" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText(/Another device is ahead/)).toBeDefined();
  });

  it("asks about a device that gets ahead mid-session, not only at startup", async () => {
    // The startup check runs once and a session runs for an hour, so the phone
    // being studied at half past is a question this app has to be able to ask
    // after it has opened. It was reported as a line of text in Settings, which
    // is to say not reported: the one moment there was something to ask about
    // was the one moment nothing was asked.
    stubGitHub(copy("2026-09-09T00:00:00.000Z", ["decl2"]));
    const { storage, session } = mount(copy("2026-01-01T00:00:00.000Z", ["decl1"]));
    await act(async () => {
      storage.configure(CONFIG);
    });

    await act(async () => {
      await storage.saveNow(session.progress());
    });

    expect(
      screen.getByRole("dialog", { name: "Progress from another device" }),
    ).toBeDefined();
    // And it is the same two answers as at startup, over the same copy.
    expect(screen.getByRole("button", { name: "Use the newer one" })).toBeDefined();
    expect(new SyncingStorage().read()?.starred).toEqual(["decl1"]);
  });

  it("keeps this device's copy when that is what was chosen", async () => {
    stubReload();
    const calls = stubGitHub(copy("2026-09-09T00:00:00.000Z", ["decl2"]));
    const user = userEvent.setup();
    configured();
    synced("2026-01-01T00:00:00.000Z");
    await act(async () => {
      mount(onDevice(copy("2026-02-02T00:00:00.000Z", ["decl1"])));
    });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Keep this device" }));
    });

    // Forced past the refusal, because a person is what the refusal defers to.
    expect(calls).toContain("PUT");
    expect(new SyncingStorage().read()?.starred).toEqual(["decl1"]);
  });

  it("warns before a pull throws away what this device has not sent", async () => {
    stubReload();
    stubGitHub(copy("2026-09-09T00:00:00.000Z", ["decl2"]));
    const user = userEvent.setup();
    const { storage } = mount(copy("2026-02-02T00:00:00.000Z", ["decl1"]));
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
    expect(new SyncingStorage().read()?.starred).toEqual(["decl1"]);
  });

  it("pulls without a word when there is nothing of this device's to lose", async () => {
    const reload = stubReload();
    // Nothing up there yet, so this device's push lands and the two agree.
    stubGitHub(null);
    const user = userEvent.setup();
    const { storage, session } = mount(
      onDevice(copy("2026-02-02T00:00:00.000Z", ["decl1"])),
    );
    await act(async () => {
      storage.configure(CONFIG);
      await storage.saveNow(session.progress());
    });

    // Then the other device studies and pushes. This one has nothing of its
    // own left, so pulling is a plain catch-up and asking about it is noise.
    stubGitHub(copy("2026-09-09T00:00:00.000Z", ["decl2"]));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Pull the copy/ }));
    });

    expect(screen.queryByRole("dialog", { name: /unsaved progress/ })).toBeNull();
    expect(new SyncingStorage().read()?.starred).toEqual(["decl2"]);
    expect(reload).toHaveBeenCalled();
  });

  it("asks before connecting to a repo that already holds something newer", async () => {
    stubReload();
    const calls = stubGitHub(copy("2026-09-09T00:00:00.000Z", ["decl2"]));
    const user = userEvent.setup();
    mount(copy("2026-02-02T00:00:00.000Z", ["decl1"]));

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

/**
 * The pages the book sets no exercise on.
 *
 * A pack ships all of Bennett and all of Lane, prosody and word formation with
 * the rest, because what a student cannot reach they can never read. Those pages
 * are in the index and in the reader like any other; what changes is that the
 * index says so, and that nothing offers to drill them.
 */
describe("a section the book sets no exercise on", () => {
  /** The fixture plus a page of prosody, in a family of its own. */
  const withReading: ContentData = {
    ...fixture,
    grammar: [
      ...fixture.grammar,
      {
        id: "metre",
        ref: "360-361",
        title: "The dactylic hexameter",
        family: "prosody",
        text: "Six feet, of which the fifth is a dactyl.",
        order: 900,
        readingOnly: true,
      },
    ],
  };
  const readingProfile = {
    ...testProfile,
    families: [...testProfile.families, { id: "prosody", label: "Prosody" }],
  };

  const openMap = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    return screen.getByRole("dialog", { name: "Grammar index" });
  };

  it("says it is a page to read, not a topic nobody has written for", async () => {
    const user = userEvent.setup();
    mount(undefined, withReading, readingProfile);
    const map = await openMap(user);

    await user.click(within(map).getByRole("button", { name: /Prosody/ }));
    const row = within(map).getByRole("button", {
      name: /The dactylic hexameter/,
    });
    expect(row.textContent).toMatch(/reading only/);
    // The other two silences are defects or preferences and would send a reader
    // looking for something to do about them. This one is the book.
    expect(row.textContent).not.toMatch(/no tests written yet/);
    expect(row.textContent).not.toMatch(/not started/);
  });

  it("says a family is reading only rather than counting it as unstudied", async () => {
    const user = userEvent.setup();
    mount(undefined, withReading, readingProfile);
    const map = await openMap(user);

    const heading = within(map).getByRole("button", { name: /Prosody/ });
    expect(heading.textContent).toMatch(/reading only/);
    // Nor is anything about it waiting: there is nothing here to be due.
    expect(heading.textContent).not.toMatch(/due/);
  });

  it("still opens it, and offers reading as the thing to do", async () => {
    const user = userEvent.setup();
    mount(undefined, withReading, readingProfile);
    const map = await openMap(user);

    await user.click(within(map).getByRole("button", { name: /Prosody/ }));
    const row = within(map).getByRole("button", {
      name: /The dactylic hexameter/,
    });
    // Never disabled — the whole point of shipping the page is that it opens.
    expect(row).toHaveProperty("disabled", false);
    await user.click(row);

    expect(
      screen.getByRole("button", { name: "Read § 360-361" }),
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("button", { name: "No exercise here" }),
    ).toHaveProperty("disabled", true);
  });

  it("reads, and pages back to the section before it", async () => {
    const user = userEvent.setup();
    mount(undefined, withReading, readingProfile);
    const map = await openMap(user);

    await user.click(within(map).getByRole("button", { name: /Prosody/ }));
    await user.click(
      within(map).getByRole("button", { name: /The dactylic hexameter/ }),
    );
    await user.click(screen.getByRole("button", { name: "Read § 360-361" }));

    const sheet = screen.getByRole("dialog", { name: /dactylic hexameter/ });
    expect(within(sheet).getByText(/Six feet/)).toBeDefined();
    // In book order with everything else, which is what makes it reachable by
    // paging as well as by the index.
    expect(
      within(sheet).getByRole("button", { name: /Previous section/ }),
    ).toBeDefined();
  });

  it("leaves everything a student has actually done exactly where it was", async () => {
    const graded = new Session(new Content(fixture, testProfile));
    graded.enrolTopic("decl1", 4, new Date());

    const before = new Session(new Content(fixture, testProfile));
    before.restore(graded.snapshot());
    const after = new Session(new Content(withReading, readingProfile));
    after.restore(graded.snapshot());

    // The regression this exists for: shipping the rest of the book must not
    // move anything about the student. There is no figure left for it to move,
    // so what is checked is the pile and the answers themselves.
    expect(after.progress().topicCards).toEqual(before.progress().topicCards);
    expect(after.stats().dueTopics).toBe(before.stats().dueTopics);
    // And the reading page brings nothing of its own into either count.
    const page = after.grammarMap().find((t) => t.sectionId === "metre")!;
    expect(page.scheduled).toBe(false);
    expect(page.questions).toBe(0);
  });
});

/**
 * The two ways this device's own copy fails, on screen.
 *
 * Both were silent, and both cost a student everything. The adapter's own tests
 * (`storage/local.test.ts`) cover what it does; these cover what is *said*,
 * which is the half that was missing — a full device that keeps grading is
 * indistinguishable from a working one until the reload.
 */
describe("when the device cannot keep the progress", () => {
  it("says so, once, however many grades follow", async () => {
    const user = userEvent.setup();
    mount();
    // Only now: mounting has to be able to write, or there is nothing to lose.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(screen.getByText(/out of room/)).toBeDefined();

    // A second grade must not raise it again. The condition does not clear on
    // its own, so once-per-save would be a toast per question — the app
    // shouting exactly where it needs to be heard the first time.
    await carryOn(user);
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(screen.getAllByText(/out of room/)).toHaveLength(1);
  });

  it("offers the export, which is the one thing that still works", async () => {
    const user = userEvent.setup();
    mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    // It builds the file in memory and hands it to the browser, needing none of
    // the room that has just run out.
    expect(screen.getByRole("button", { name: "Export" })).toBeDefined();
  });

  it("says nothing at all while the writes are landing", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(screen.queryByText(/out of room/)).toBeNull();
  });
});

describe("a file this device could not read", () => {
  it("is offered back rather than written over", async () => {
    // What the adapter left behind when it gave up at startup.
    localStorage.setItem(`${profile.storage.webProgressKey}:corrupt`, "{half a fi");
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText(/could not be read/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Download the damaged file" }),
    ).toBeDefined();
  });

  it("goes away when discarded, and takes the notice with it", async () => {
    localStorage.setItem(`${profile.storage.webProgressKey}:corrupt`, "{half a fi");
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Discard it" }));

    expect(screen.queryByText(/could not be read/)).toBeNull();
    expect(
      localStorage.getItem(`${profile.storage.webProgressKey}:corrupt`),
    ).toBeNull();
  });

  it("is not mentioned on a device where nothing went wrong", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });
});

/**
 * The language being learnt, marked as such.
 *
 * `<html lang>` names the *prompt* language — the chrome and the questions are
 * English — so until this every Latin and Greek string on the page inherited it.
 * A screen reader read Ἑλληνικά in an English voice, which for Greek is noise
 * rather than an accent.
 */
describe("marking the target language", () => {
  const l2 = () => profile.l2.code;

  it("marks the reference answer and what the student wrote", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // `Array.from`, not a spread: the DOM lib here is the non-iterable one —
    // the same reason `sentences()` above does it.
    const blocks = Array.from(document.querySelectorAll(".compare__text"));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(block.getAttribute("lang")).toBe(l2());
  });

  it("leaves the English prompt alone", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // The prompt is the one sentence on this screen that is not the language
    // being learnt, and inheriting from <html> is exactly right for it.
    const prompt = document.querySelector(".study__prompt, .prompt");
    if (prompt) expect(prompt.closest("[lang]")?.getAttribute("lang")).not.toBe(l2());
  });

  it("does not mark the English half of the crib", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: /Vocabulary — / }));

    const english = document.querySelector(".crib-row__english");
    const target = document.querySelector(".crib-row__citation");
    expect(target?.getAttribute("lang")).toBe(l2());
    expect(english?.closest("[lang]")?.getAttribute("lang")).not.toBe(l2());
  });
});

/**
 * `aria-modal="true"` made true.
 *
 * The attribute has been on the shared `Sheet` since it was written, and none
 * of what it promises was implemented: nothing took focus, Tab walked out into
 * the study screen underneath, and closing dropped focus on `<body>`.
 */
describe("a sheet as a modal", () => {
  const openIndex = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    return screen.getByRole("dialog");
  };

  it("takes focus when it opens, and the panel rather than its close button", async () => {
    const user = userEvent.setup();
    mount();
    const sheet = await openIndex(user);

    // The panel. Opening by announcing "Close" would bury the contents.
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).not.toBe("Close");
  });

  it("keeps Tab inside it", async () => {
    const user = userEvent.setup();
    mount();
    const sheet = await openIndex(user);

    for (let i = 0; i < 25; i++) {
      await user.tab();
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
  });

  it("gives focus back to whatever opened it", async () => {
    const user = userEvent.setup();
    mount();
    const opener = screen.getByRole("button", { name: "Grammar index" });
    opener.focus();
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Close" }));

    // Without this the next Tab starts again from the top of the document, and
    // a student has to walk back to where they were.
    expect(document.activeElement).toBe(opener);
  });
});

/**
 * The loop from the keyboard.
 *
 * The CLI drives this identical loop entirely from the keyboard; the web app
 * had three keys — Cmd+Enter, Escape, and the reader's arrows — so grading, the
 * most repeated action in the app, needed a mouse or a thumb.
 */
describe("grading from the keyboard", () => {
  it("grades on 1 to 4", async () => {
    const user = userEvent.setup();
    mount();
    // A topic never graded opens its grammar first, and the key is deliberately
    // inert underneath a sheet — see the last case in this block.
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/2`);
    await user.keyboard("3");
    await carryOn(user);
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 2/2`);
  });

  it("says which key each button answers to", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    for (const [i, name] of ["Again", "Hard", "Good", "Easy"].entries()) {
      const button = screen.getByRole("button", { name: new RegExp(name) });
      expect(button.getAttribute("aria-keyshortcuts")).toBe(String(i + 1));
    }
  });

  it("leaves a digit typed into the answer alone", async () => {
    const user = userEvent.setup();
    mount();
    const box = screen.getByRole("textbox");
    await user.click(box);
    await user.keyboard("3");

    // Still writing, and the 3 is in the sentence rather than on the schedule.
    expect((box as HTMLTextAreaElement).value).toContain("3");
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/2`);
  });

  it("does not grade underneath an open sheet", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Close" }));
    // Revealed, so the grade bar and its handler are genuinely mounted — the
    // point of the guard, not the absence of a bar. Then read the grammar over
    // the top of it, which is what a stuck student does.
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByRole("button", { name: /Good/ })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Grammar index" }));

    await user.keyboard("3");

    // Reading the grammar is not a moment to be one keystroke from scheduling.
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(eyebrow()).toBe(`${profile.ui.promptDirection} · 1/2`);
  });
});

/**
 * Finding a topic by name.
 *
 * Greek ships 485 topics behind eleven family headings, so reaching one meant
 * knowing which family it lives under and scrolling to it.
 */
describe("the grammar index filter", () => {
  const openIndex = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    return screen.getByRole("dialog");
  };

  it("reaches a topic whose family is not the open one", async () => {
    const user = userEvent.setup();
    mount();
    const sheet = await openIndex(user);

    // The index opens on the family being studied — nouns — so a verb-forms
    // topic is exactly what was unreachable without knowing where to look.
    expect(within(sheet).queryByText("Present indicative")).toBeNull();

    await user.type(within(sheet).getByLabelText("Find a topic"), "present");
    expect(within(sheet).getByText("Present indicative")).toBeDefined();
    // And only it: the families it walked past are not still on screen.
    expect(within(sheet).queryByText("First declension")).toBeNull();
  });

  it("finds a section by its §, which is what a reference gives you", async () => {
    const user = userEvent.setup();
    mount();
    const sheet = await openIndex(user);

    await user.type(within(sheet).getByLabelText("Find a topic"), "174");
    expect(within(sheet).getByText("Present indicative")).toBeDefined();
    expect(within(sheet).queryByText("First declension")).toBeNull();
  });

  it("says so when nothing matches, rather than showing an empty book", async () => {
    const user = userEvent.setup();
    mount();
    const sheet = await openIndex(user);

    await user.type(within(sheet).getByLabelText("Find a topic"), "qqqzzz");
    expect(within(sheet).getByText(/Nothing matches/)).toBeDefined();
  });

  it("puts the families back when the box is cleared", async () => {
    const user = userEvent.setup();
    mount();
    const sheet = await openIndex(user);
    const box = within(sheet).getByLabelText("Find a topic");

    await user.type(box, "declension");
    expect(within(sheet).queryByText(/topics ·/)).toBeNull();
    await user.clear(box);
    // The family headings carry "N topics · M% mastered"; their return is how
    // the index says it is whole again.
    expect(within(sheet).getAllByText(/topics/).length).toBeGreaterThan(0);
  });
});

/**
 * The system Back button.
 *
 * There was no History API use anywhere, so on Android in an installed
 * standalone PWA the Back gesture closed the app rather than the sheet that was
 * over the question.
 */
describe("closing a sheet with Back", () => {
  /** Past the sheet a never-graded topic opens by itself, to a settled state. */
  const settle = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  };

  /** What the browser does on Back: pop the entry, then tell the page. */
  const pressBack = async () => {
    await act(async () => {
      history.back();
      // jsdom's `back()` does not dispatch the event on its own here.
      dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    });
  };

  /*
   * Asserted on `history.state`, not `history.length`. Every test in this file
   * shares one jsdom document, so the length has run into the hundreds by the
   * time these run and a `pushState` on a stack that has been walked backwards
   * replaces the forward entries instead of growing it. The state is the thing
   * that actually decides whether Back has something of ours to pop.
   */
  const marked = () => Boolean((history.state as { sheet?: boolean } | null)?.sheet);

  it("marks an entry as its own when a sheet opens", async () => {
    const user = userEvent.setup();
    mount();
    await settle(user);
    expect(marked()).toBe(false);

    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    expect(marked()).toBe(true);
  });

  it("closes the sheet rather than leaving the app", async () => {
    const user = userEvent.setup();
    mount();
    await settle(user);
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    expect(screen.getByRole("dialog")).toBeDefined();

    await pressBack();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("takes its entry back when the sheet is closed the ordinary way", async () => {
    const user = userEvent.setup();
    mount();
    await settle(user);
    await user.click(screen.getByRole("button", { name: "Grammar index" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    // Otherwise every sheet opened in a session leaves a dead entry behind, and
    // Back has to be pressed once per sheet ever opened before the app yields.
    await waitFor(() => expect(marked()).toBe(false));
  });

  it("does not pop an entry it never pushed", async () => {
    const user = userEvent.setup();
    mount();
    await settle(user);
    expect(marked()).toBe(false);

    // A close with nothing of ours behind it must not call `history.back()` —
    // that is the same bug from the other side: it would leave the app.
    await pressBack();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(marked()).toBe(false);
  });
});

/**
 * The one destructive single press that had no way back.
 *
 * A grade has an undo; deleting a word flashed "Word deleted." and that was the
 * whole of it, on a card the student may have spent a month of reviews on.
 */
describe("taking a deleted word back", () => {
  const deleteFirstWord = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    await holdWord("rosam");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: /1 word/ }));
    await user.click(screen.getByRole("button", { name: /rosa, rosae/ }));
    await user.click(screen.getByRole("button", { name: "Delete this word" }));
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  };

  it("offers the undo, and puts the card back with its schedule", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await deleteFirstWord(user);

    expect(session.vocabCard("v-rosa")).toBeUndefined();
    const before = screen.getByRole("button", { name: "Undo" });
    await user.click(before);

    const back = session.vocabCard("v-rosa");
    expect(back).toBeDefined();
    // The same card, not a fresh one: its id, its citation and the sentence it
    // was met in all come back, which is the whole point of putting the card
    // back rather than re-recording the word.
    expect(back?.citation).toBe("rosa, rosae (f)");
    expect(session.vocabContexts("v-rosa")).toHaveLength(1);
  });

  it("says so, so the press is not mistaken for having done nothing", async () => {
    const user = userEvent.setup();
    mount();
    await deleteFirstWord(user);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Word put back.")).toBeDefined();
  });

  it("leaves a word re-recorded by hand alone", async () => {
    const user = userEvent.setup();
    const { session } = mount();
    await deleteFirstWord(user);

    // The student says what they want before the toast is answered. The undo
    // must not overwrite that with the older copy.
    session.recordVocab({
      lemma: "rosa",
      citation: "rosa — my own note",
      gloss: "rose",
      pos: "noun",
    } as never);
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(session.vocabCard("v-rosa")?.citation).toBe("rosa — my own note");
  });
});
