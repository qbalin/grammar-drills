import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import {
  layoutRichSection,
  positionLabel,
  previewRichWindow,
  scrolled,
  type RichLine,
} from "./pager.js";
import {
  attemptLines,
  questionBankLines,
  scheduleLines,
  type HistoryLine,
} from "./history.js";
import { wordListLines, type WordListLine } from "./wordlist.js";
import {
  Content,
  MAX_CONTEXTS,
  Session,
  locateWord,
  questionVocabulary,
  sentenceTokens,
  type Profile,
  type FamilyProgress,
  type LemmaEntry,
  type Mode,
  type NewVocabContext,
  type Progress,
  type Question,
  type Rating,
  type RoundVia,
  type StorageAdapter,
  type Test,
  type TopicProgress,
  type VocabCardState,
  type VocabContext,
} from "@lang-tutor/core";

interface Props {
  session: Session;
  content: Content;
  storage: StorageAdapter;
}

/**
 * The screen a pane will put back when it closes: the whole phase that opened
 * it, one level deep.
 *
 * It is every screen the study loop can rest on, because the map is reachable
 * from all of them — the way the web app's map button sits in the header of
 * every screen rather than on two of them. Panes are deliberately *not* in this
 * union: a map drawn over a map has nothing to show, so `m` closes rather than
 * stacks, and the type says so instead of leaving the key handler to remember.
 */
type Origin =
  | { t: "answering" }
  | { t: "graded" }
  | { t: "vocab-review-front"; cardId: string }
  | { t: "vocab-review-back"; cardId: string }
  | { t: "done" };

/** The map, named so the schedule can say it came from one and go back to it. */
interface MapPhase {
  t: "map";
  from: Origin;
}

type Phase =
  | { t: "answering" }
  | { t: "graded" }
  | { t: "vocab-input" }
  /**
   * `context` is the sentence the word was met in, riding along because the
   * pick sheet stands between a keypress and a saved card — the terminal's
   * version of the same several-taps-later problem the phone has.
   */
  | {
      t: "vocab-pick";
      form: string;
      candidates: LemmaEntry[];
      context?: NewVocabContext;
    }
  | { t: "vocab-review-front"; cardId: string }
  | { t: "vocab-review-back"; cardId: string }
  | { t: "vocab-list"; from: Origin }
  | { t: "vocab-edit"; cardId: string; from: Origin; field: "citation" | "gloss" }
  /** The sentences one card has kept, being reordered or corrected. */
  | { t: "vocab-contexts"; cardId: string; from: Origin }
  | {
      t: "context-edit";
      cardId: string;
      at: string;
      from: Origin;
      field: "prompt" | "sentence";
    }
  | MapPhase
  | { t: "read"; from: Origin } // a section read in full, from the map
  | { t: "bank"; from: Origin } // every question of the topic under the cursor
  | { t: "schedule"; from: Origin | MapPhase }
  /** A practice run worked out; the loop has stopped here on purpose. */
  | { t: "practised"; sectionId: string }
  | { t: "done" };

/** The screen under a pane, following a schedule that was opened from the map. */
function originOf(from: Origin | MapPhase): Origin {
  return from.t === "map" ? from.from : from;
}

/** Whether a question is on screen there — the only place a word list belongs. */
function hasQuestion(from: Origin): boolean {
  return from.t === "answering" || from.t === "graded";
}

/**
 * Everything needed to put the last grade back: the engine's state before it
 * was applied, and the screen it was given on. Self-grading is a keypress, and
 * a mistyped one otherwise schedules a topic for months with no way back — so
 * one grade, the most recent, is always takeable.
 */
interface GradeUndo {
  progress: Progress;
  /** The screen the grade was given on — a question, or a vocabulary card. */
  phase: Phase;
  sectionId: string | null;
  test: Test | null;
  qIndex: number;
  submitted: string;
  via: RoundVia | null;
  /** Which errand it was given on — the grade may be the one that ended it. */
  mode: Mode;
}

export function App({ session, content, storage }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [qIndex, setQIndex] = useState(0);
  // Why the round on the table was served. `next` says it once and the screen
  // would otherwise keep only "was it new", leaving a due review, a drill and a
  // topic the book has come back to looking identical.
  const [via, setVia] = useState<RoundVia | null>(null);

  /**
   * Which errand this is. Never written to the file: a pile of reviews is
   * exactly the thing a saved preference should not be able to hide, so every
   * launch opens on them whenever there are any.
   */
  const [mode, setMode] = useState<Mode>(() => {
    const { dueTopics, dueVocab } = session.stats();
    return dueTopics + dueVocab > 0 ? "review" : "explore";
  });

  const [phase, setPhase] = useState<Phase>({ t: "answering" });
  const [showGrammar, setShowGrammar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showVocab, setShowVocab] = useState(false); // the question's word list
  // Enter and f on the map both act at once, which from a half-written answer
  // costs something, so they are asked for twice. Which of the two is waiting,
  // so the second press does what the warning named.
  const [confirmMap, setConfirmMap] = useState<null | "practise" | "study">(null);
  const [input, setInput] = useState(""); // current typed answer / vocab form
  const [submitted, setSubmitted] = useState(""); // the answer the student submitted
  const [flash, setFlash] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [mapIndex, setMapIndex] = useState(0);
  const [vocabIndex, setVocabIndex] = useState(0); // cursor in the vocabulary list
  const [draft, setDraft] = useState({ citation: "", gloss: "" }); // the card being edited
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hinted, setHinted] = useState(0); // context prompts asked for on this card
  const [contextIndex, setContextIndex] = useState(0); // cursor among a card's sentences
  const [contextDraft, setContextDraft] = useState({ prompt: "", sentence: "" });
  // Its own confirm, not the word list's: a half-armed `x` carried across from
  // one screen to the other would delete on the first press over here.
  const [confirmContextDelete, setConfirmContextDelete] = useState(false);
  const [scroll, setScroll] = useState(0); // first visible line of the grammar pane
  const [undo, setUndo] = useState<GradeUndo | null>(null); // the last grade, takeable
  // ^Z reaches the answer box as a plain "z", and the box's own key handler
  // runs after this component's — so the character is dropped on its way in.
  const swallowInput = useRef<string | null>(null);

  const question: Question | undefined = test?.questions[qIndex];
  const section = sectionId ? content.getSection(sectionId) : undefined;

  // Sections run long, so grammar is paged. The text is wrapped here, to the
  // real terminal width, so a scroll step moves exactly one screen line.
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const paneWidth = Math.max(24, cols - 7); // app padding + border + pane padding
  // The drawer shares the screen with the question; the reader owns it.
  const drawerHeight = Math.max(4, Math.min(18, rows - 15));
  const readerHeight = Math.max(6, rows - 9);

  // The grammar index: families in display order, and the same topics flattened
  // so the cursor can walk straight across family boundaries.
  const families = useMemo(() => session.familyProgress(), [tick, session]);
  const mapTopics = useMemo(() => families.flatMap((f) => f.topics), [families]);
  const overall = useMemo(() => session.overallPercent(), [tick, session]);
  const familyStarts = useMemo(() => {
    const starts: number[] = [];
    let n = 0;
    for (const f of families) {
      starts.push(n);
      n += f.topics.length;
    }
    return starts;
  }, [families]);

  const mapSection = useMemo(() => {
    const id = mapTopics[mapIndex]?.sectionId;
    return id ? content.getSection(id) : undefined;
  }, [mapTopics, mapIndex, content]);

  // Two panes can be reading: the drawer (the topic being drilled) and the
  // reader (the topic under the map cursor). Only one is on screen at a time.
  const drawerLines = useMemo(
    () => layoutRichSection(section?.text ?? "", paneWidth, content.profile.grammar),
    [section?.text, paneWidth],
  );
  const readerLines = useMemo(
    () => layoutRichSection(mapSection?.text ?? "", paneWidth, content.profile.grammar),
    [mapSection?.text, paneWidth],
  );
  // The map's taste of the section under the cursor: the same window for every
  // topic, so browsing shows each one equally and the map does not jump. What
  // varies is the terminal, not the topic — a short one gets a shorter taste
  // rather than a map that runs off the screen.
  const previewLines = Math.max(2, Math.min(PREVIEW_LINES, rows - MAP_CHROME_LINES));
  const mapPreview = useMemo(
    () =>
      previewRichWindow(mapSection?.text ?? "", paneWidth, previewLines, content.profile.grammar),
    [mapSection?.text, paneWidth, previewLines],
  );

  // What was written on this topic before. Read after the answer is on screen,
  // never while it is still being typed: earlier attempts hold reference
  // answers, and the same question comes round again.
  const attempts = useMemo(
    () => (sectionId ? session.attemptsFor(sectionId) : []),
    [sectionId, tick, session],
  );
  const historyLines = useMemo(
    () => attemptLines(attempts, paneWidth, content.fold),
    [attempts, paneWidth],
  );

  // The topic under the map cursor, as its whole question bank.
  const bank = useMemo(() => {
    const id = mapTopics[mapIndex]?.sectionId;
    return id ? session.questionBank(id) : [];
    // `tick` is in here because an answer graded since is part of the bank.
  }, [mapTopics, mapIndex, session, tick]);
  const bankLines = useMemo(
    () => questionBankLines(bank, paneWidth, content.fold),
    [bank, paneWidth],
  );

  const scheduleAll = useMemo(() => session.upcoming(), [session, tick]);
  const schedLines = useMemo(
    () => scheduleLines(scheduleAll, paneWidth),
    [scheduleAll, paneWidth],
  );

  const vocab = useMemo(() => session.vocabList(), [session, tick]);

  // The words of the question on screen: the English the prompt used against the
  // Latin it wants, in its dictionary form. Built for every question and shown
  // for none of them until asked for.
  const vocabulary = useMemo(
    () => (question ? questionVocabulary(content, question) : []),
    [question, content],
  );
  const wordLines = useMemo(
    () => wordListLines(vocabulary, paneWidth),
    [vocabulary, paneWidth],
  );
  // Words, not screen lines: a citation that wrapped is still one word.
  const wordCount = vocabulary.length;

  // Whatever the pane is showing, show it from the top.
  useEffect(
    () => setScroll(0),
    [sectionId, showGrammar, showHistory, showVocab, mapIndex, phase.t],
  );

  const save = () => {
    void storage.save(session.progress()).catch(() => {});
  };

  /** Move the visible window of whichever pane is open. */
  const scrollPane = (lineCount: number, height: number, delta: number) => {
    setScroll((s) => scrolled(s, delta, lineCount, height));
  };

  /** Arrow/page keys for a pane; true if the key was a scroll key. */
  const handleScrollKey = (
    key: { upArrow: boolean; downArrow: boolean; pageUp: boolean; pageDown: boolean },
    lineCount: number,
    height: number,
  ): boolean => {
    const page = Math.max(1, height - 1);
    if (key.downArrow) scrollPane(lineCount, height, 1);
    else if (key.upArrow) scrollPane(lineCount, height, -1);
    else if (key.pageDown) scrollPane(lineCount, height, page);
    else if (key.pageUp) scrollPane(lineCount, height, -page);
    else return false;
    return true;
  };

  /** Text arriving from the answer box, less anything ^Z left behind. */
  const changeInput = (value: string) => {
    const forced = swallowInput.current;
    swallowInput.current = null;
    setInput(forced ?? value);
  };

  /**
   * Move on to whatever the errand has next. `asked` defaults to the errand in
   * hand; switching passes the new one, since `mode` has not re-rendered yet
   * at the point the switch calls this.
   */
  const advance = (
    asked: Mode = mode,
    // The book reads on when a round it served ends, whatever the grade was
    // and whether or not the round was finished. Read off this screen's own
    // `via` rather than the saved round, since the CLI grades per test and
    // never opens one. False on the recursive calls below: the round that
    // ended has already been stepped past by the first of them.
    stepBook = via === "new" || via === "sweep",
  ) => {
    setFlash(null);
    setShowGrammar(false);
    setShowHistory(false);
    setShowVocab(false);
    setInput("");
    setSubmitted("");

    if (stepBook && sectionId === session.bookCursor()) session.advanceCursor();

    const action = session.next(new Date(), asked);
    if (action.kind === "done" && asked === "review") {
      // The pile is cleared, so Review is no longer somewhere to be.
      setMode("explore");
      setFlash("Nothing left due — back to the book.");
      advance("explore", false);
      return;
    }
    if (action.kind === "done") {
      setPhase({ t: "done" });
      return;
    }
    if (action.kind === "practised") {
      setVia(null);
      setSectionId(action.sectionId);
      setPhase({ t: "practised", sectionId: action.sectionId });
      return;
    }
    if (action.kind === "vocab-review") {
      // A word is on screen, not the topic before it.
      setVia(null);
      // The next card is a different word: its hints are not this one's, and a
      // count carried over would open it half-helped.
      setHinted(0);
      setPhase({ t: "vocab-review-front", cardId: action.cardId });
      return;
    }
    // The quoted-only preference travels with the deck, so a deck set up on
    // the phone arrives here already asking for it. The two errands that go
    // looking for something new take it whole, and a topic it empties is
    // stepped over below; a review takes it with a floor under it, falling
    // back to the whole cycle on a topic with nothing quoted rather than
    // leaving a due card with nothing to come back on.
    const quotedOnly =
      session.quotedOnly() &&
      (action.kind === "new-topic" || action.kind === "drill");
    // A practice run serves out of its own set; everything else rotates.
    const t =
      action.kind === "drill"
        ? session.servePractice(action.sectionId)
        : action.kind === "topic-review"
          ? session.serveReview(action.sectionId)
          : session.serveTest(action.sectionId, quotedOnly);
    if (!t) {
      // A topic nothing was written for is passed so the loop moves on. A
      // topic whose tests the preference filtered out is stepped over instead:
      // nothing was shown, so grading it would put a topic never seen into the
      // review rotation, and leave it missing when the preference goes off.
      if (!(quotedOnly && session.hasTests(action.sectionId))) {
        session.gradeTopic(action.sectionId, 3);
      }
      if (action.kind === "new-topic") session.advanceCursor();
      advance(asked, false);
      return;
    }
    // Never met is not the same as never mastered: the book comes back to
    // topics it has already taught, and teaching those again is not teaching.
    const fresh = !session.everGraded(action.sectionId);
    setSectionId(action.sectionId);
    setTest(t);
    setQIndex(0);
    setVia(
      action.kind === "drill"
        ? "drill"
        : action.kind === "topic-review"
          ? "review"
          : fresh
            ? "new"
            : "sweep",
    );
    setShowGrammar(fresh); // teach first on ground never met
    setPhase({ t: "answering" });
    setTick((n) => n + 1);
  };

  // A word can be deleted from the vocabulary pane while the card underneath is
  // the one being reviewed — `phase.from` then points at a card the session no
  // longer has, and escaping back to it draws an empty pane. Heal the phase
  // rather than leave the student on a card that is gone.
  useEffect(() => {
    if (
      (phase.t === "vocab-review-front" || phase.t === "vocab-review-back") &&
      !session.vocabCard(phase.cardId)
    ) {
      advance();
    }
  }, [phase, session, tick]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The whole dictionary is in memory here, so this is the cheapest place to
    // bring cards saved against older citations up to the shipped ones.
    if (session.refreshCitations() > 0) save();
    advance();
    // Deliberately empty: this runs once, at startup. It carried an
    // `eslint-disable-next-line react-hooks/exhaustive-deps` for years, and
    // there is no eslint in this repo — no config, no dependency, nothing that
    // reads it — so the directive suppressed nothing and only implied a rule
    // was being enforced somewhere. Said in words instead, which is what it was
    // trying to say.
  }, []);

  const submitAnswer = (value: string) => {
    setSubmitted(value);
    setPhase({ t: "graded" });
  };

  /** Everything a grade is about to overwrite, so it can be put back. */
  const takeUndo = (from: Phase): GradeUndo => ({
    progress: session.snapshot(),
    phase: from,
    sectionId,
    test,
    qIndex,
    submitted,
    via,
    mode,
  });

  const gradeAndContinue = (rating: Rating) => {
    // Taken before anything is written, so the undo covers the recorded answer
    // as well as the schedule — re-grading then leaves one attempt, not two.
    setUndo(takeUndo({ t: "graded" }));
    // Kept before the grade is applied: what you wrote on a topic is worth
    // having whichever errand it was written on.
    if (sectionId && question) {
      session.recordAttempt(sectionId, {
        prompt: question.prompt,
        answer: question.answer,
        submitted: submitted.trim(),
        rating,
      });
    }
    if (!sectionId) return;
    // The test's id names the round, so its four questions cost the topic one
    // review rather than four — graded by the worst of them.
    session.gradeTopic(sectionId, rating, new Date(), test?.id);
    save();
    setTick((n) => n + 1);
    if (test && qIndex + 1 < test.questions.length) {
      setQIndex(qIndex + 1);
      setShowGrammar(false);
      setShowHistory(false);
      setShowVocab(false);
      setFlash(null);
      setInput("");
      setSubmitted("");
      setPhase({ t: "answering" });
    } else {
      advance();
    }
  };

  /**
   * Take back the grade just given. The question it was given on comes back,
   * answer and all, and the engine returns to the state it was in before —
   * schedule, mastery, attempt trail, book cursor. The errand comes back too:
   * the grade may be the one that emptied the pile and threw the switch.
   */
  const undoGrade = () => {
    if (!undo) return;
    session.restore(undo.progress);
    save();
    setSectionId(undo.sectionId);
    setTest(undo.test);
    setQIndex(undo.qIndex);
    setSubmitted(undo.submitted);
    setVia(undo.via);
    setMode(undo.mode);
    setInput("");
    setShowGrammar(false);
    setShowHistory(false);
    setShowVocab(false);
    setUndo(null); // one step back, no further
    setFlash("Grade taken back — grade it again.");
    setPhase(undo.phase);
    setTick((n) => n + 1);
  };

  /** Take back the answer just submitted: back to the box, text and all. */
  const undoSubmit = () => {
    setInput(submitted);
    setShowHistory(false);
    setFlash(null);
    setPhase({ t: "answering" });
  };

  /**
   * The sentence a word just recorded was met in.
   *
   * There is no hold gesture here — the word is typed — so which of the two
   * sentences it came from is worked out rather than pointed at, by the same
   * function the phone uses for its own typed word. The reference wins a tie,
   * being right by construction; a word in neither was typed from memory, and
   * the question on screen is still where it was met, so it is kept without a
   * word picked out in it.
   */
  const contextFor = (form: string): NewVocabContext | undefined => {
    if (!question || !session.keepsContext()) return undefined;
    const site = locateWord(
      form,
      { answer: question.answer, submitted: submitted.trim() },
      content.fold,
    );
    const sentence =
      site?.source === "submitted" ? submitted.trim() : question.answer;
    if (!sentence) return undefined;
    return {
      prompt: question.prompt,
      sentence,
      source: site?.source ?? "answer",
      ...(site ? { index: site.index } : {}),
    };
  };

  /** Save a word and the sentence with it, and say which of the two happened. */
  const keepWord = (entry: LemmaEntry, context?: NewVocabContext) => {
    const known = session.vocabCard(session.vocabIdFor(entry)) !== undefined;
    const id = session.recordVocab(entry);
    const kept = context ? session.addVocabContext(id, context) : "off";
    save();
    // The word count in the status bar, and the vocabulary list itself, are
    // derived from the engine on every tick — so a new card has to bump it.
    setTick((n) => n + 1);
    setFlash(
      kept === "full"
        ? `${entry.citation} already keeps ${MAX_CONTEXTS} sentences.`
        : known
          ? kept === "added"
            ? `Another sentence on ${entry.citation}`
            : `Already saved: ${entry.citation}`
          : `Saved: ${entry.citation}`,
    );
  };

  const recordForm = (form: string) => {
    setInput("");
    // Enter on an empty box is the other way out of a recording opened by
    // mistake; there is nothing to look up.
    if (form.trim() === "") {
      setPhase({ t: "graded" });
      return;
    }
    const candidates = content.lookup(form);
    if (candidates.length === 0) {
      setFlash(`No dictionary match for “${form}”.`);
      setPhase({ t: "graded" });
      return;
    }
    const context = contextFor(form);
    if (candidates.length === 1) {
      keepWord(candidates[0]!, context);
      setPhase({ t: "graded" });
      return;
    }
    setPhase({ t: "vocab-pick", form, candidates, context });
  };

  /** Open the grammar index, parked on the current topic (or the first unstudied one). */
  const openMap = (from: Origin) => {
    let i = mapTopics.findIndex((t) => t.sectionId === sectionId);
    if (i < 0) i = mapTopics.findIndex((t) => t.mastery === undefined);
    setMapIndex(i < 0 ? 0 : i);
    setFlash(null);
    setConfirmMap(null);
    setPhase({ t: "map", from });
  };

  /**
   * Close the pane and put the question back with its word list open.
   *
   * `w` inside the map is pressed by someone who has lost the thread of the
   * sentence, and the sentence is what they need back — not a pane drawn over a
   * pane. Where there is no question at all the key still says something rather
   * than quietly doing nothing.
   */
  const showWordsFor = (from: Origin) => {
    if (!hasQuestion(from)) {
      setFlash("The word list belongs to a question — press w while one is on screen.");
      return;
    }
    setShowGrammar(false);
    setShowHistory(false);
    setShowVocab(true);
    setFlash(null);
    setPhase(from);
  };

  /** Open the schedule of what is coming back. */
  const openSchedule = (from: Origin | MapPhase) => {
    setFlash(null);
    setPhase({ t: "schedule", from });
  };

  /** Open the vocabulary list, parked on its first card. */
  const openVocabList = (from: Origin) => {
    setFlash(null);
    setConfirmDelete(false);
    setVocabIndex(0);
    setPhase({ t: "vocab-list", from });
  };

  /**
   * Save the card being edited. Both fields are kept whichever one was being
   * typed when Enter landed: the two are one edit, not two.
   */
  const saveVocabEdit = (cardId: string, from: Origin) => {
    session.updateVocab(cardId, draft);
    save();
    setTick((n) => n + 1);
    setFlash(`Saved ${draft.citation.trim()}.`);
    setPhase({ t: "vocab-list", from });
  };

  /** The same, for one of a card's sentences: both boxes are one edit. */
  const saveContextEdit = (cardId: string, at: string, from: Origin) => {
    session.updateVocabContext(cardId, at, contextDraft);
    save();
    setTick((n) => n + 1);
    setFlash("Sentence saved.");
    setPhase({ t: "vocab-contexts", cardId, from });
  };

  /**
   * Jump the cursor to the first topic of the previous/next non-empty family,
   * wrapping round the ends — the list is a cycle, so ↑ ↓ never dead-ends.
   */
  const jumpFamily = (dir: -1 | 1) => {
    setMapIndex((i) => {
      const n = families.length;
      let current = 0;
      for (let k = 0; k < familyStarts.length; k++) {
        if (families[k]!.topics.length > 0 && familyStarts[k]! <= i) current = k;
      }
      for (let step = 1; step <= n; step++) {
        const k = (((current + dir * step) % n) + n) % n;
        if (k !== current && families[k]!.topics.length > 0) return familyStarts[k]!;
      }
      return i; // no other family has any topics
    });
  };

  /**
   * Which silence a topic is in, if it is in one.
   *
   * Three of them now, and they are three different things to be told. The book
   * sets no exercise on this page at all; or nothing has been written for it
   * yet; or nothing was written that this deck has asked to be served — and
   * only the last comes back when the preference goes off. Written once because
   * the two keys that refuse to open on a silent topic, Enter for a run and `a`
   * for the list, must not drift into wording it differently.
   */
  const silence = (target: TopicProgress): string | null => {
    if (target.readingOnly) return `“${target.title}” is a page to read; it has no exercise.`;
    if (!target.hasTests) return `No tests for “${target.title}” yet.`;
    if (target.questions === 0) return `Nothing quoted for “${target.title}” yet.`;
    return null;
  };

  /**
   * Stay on the topic under the cursor and work a run of its questions out.
   *
   * From the graded screen or from `done` nothing is lost. From a half-written
   * answer it throws that answer away, so it asks first — the two-press idiom
   * `x` already uses in the vocabulary list.
   */
  const practiseSelected = (from: Origin) => {
    const target = mapTopics[mapIndex];
    if (!target) return;
    if (from.t === "answering" && confirmMap !== "practise") {
      setConfirmMap("practise");
      setFlash(
        `Press Enter again to leave the answer you are writing and practise “${target.title}”.`,
      );
      return;
    }
    const quiet = silence(target);
    if (quiet) {
      setFlash(quiet);
      return;
    }
    session.drillTopic(target.sectionId);
    setConfirmMap(null);
    save();
    setMode("explore");
    advance("explore");
    const run = session.practice(target.sectionId);
    setFlash(`Practising “${target.title}” — ${run?.total ?? 0} to go.`);
  };

  /**
   * Take the book up at the topic under the cursor and read on from there.
   *
   * The thing a student wants from the index that used to be impossible:
   * knowing your declensions and wanting to start at the verbs, rather than
   * being handed chapter one again after every jump.
   */
  const studySelected = (from: Origin) => {
    const target = mapTopics[mapIndex];
    if (!target) return;
    if (from.t === "answering" && confirmMap !== "study") {
      setConfirmMap("study");
      setFlash(
        `Press f again to leave the answer you are writing and study from “${target.title}”.`,
      );
      return;
    }
    session.studyFrom(target.sectionId);
    setConfirmMap(null);
    save();
    setFlash(null);
    setMode("explore");
    advance("explore");
  };

  /** Read the book in order again, from the earliest thing short of mastery. */
  const bookOrder = () => {
    session.bookOrder();
    save();
    setMode("explore");
    advance("explore");
    setFlash("Back to the book in order.");
  };

  /**
   * Change errand — at once, mid-round and all. A pile you can see is a pile
   * you can put down now; nothing is lost by it but the sentence being
   * written, since every grade already given has been applied to the card.
   */
  const chooseMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    advance(next);
    setFlash(
      next === "review"
        ? `Back to the reviews — ${dueNow} waiting.`
        : "Reviews set aside — back to the book.",
    );
  };

  useInput((ch, key) => {
    // While typing (answering / vocab-input) the TextInput owns the keys —
    // except the arrows, which it ignores, so they can page the drawer.
    if (phase.t === "answering") {
      if (key.escape) {
        setShowVocab(false);
        setShowGrammar((s) => !s); // peek at grammar mid-answer
      }
      // Tab rather than a letter: every letter here goes into the answer. The
      // answer box ignores Tab outright, so unlike the chords below there is
      // nothing to swallow on the way in.
      else if (key.tab) {
        setShowGrammar(false);
        setShowVocab((s) => !s);
      }
      // ^N for the map, and this one does need swallowing: the box lets through
      // only the arrows, ^C and Tab, and appends everything else.
      else if (key.ctrl && ch === "n") {
        swallowInput.current = input; // the half-written answer stays as it is
        openMap({ t: "answering" });
      }
      // ^Z rather than a letter, for the same reason. It reaches back past this
      // question to the grade that opened it.
      else if (key.ctrl && ch === "z") {
        if (undo) {
          swallowInput.current = ""; // leaving the box; it starts empty next time
          undoGrade();
        } else {
          swallowInput.current = input; // stay put, text untouched
          setFlash("Nothing to take back.");
        }
      } else if (showGrammar) {
        handleScrollKey(key, drawerLines.length, drawerHeight);
      } else if (showVocab) {
        handleScrollKey(key, wordLines.length, drawerHeight);
      }
      return;
    }
    if (phase.t === "vocab-input") {
      // The one key the text box leaves alone — and the way out of a recording
      // opened by a stray `v`.
      if (key.escape) setPhase({ t: "graded" });
      return;
    }
    // Editing a card is two text boxes; every letter belongs to them. This must
    // return before `q` below, or typing a citation would quit the app.
    if (phase.t === "vocab-edit") {
      if (key.escape) setPhase({ t: "vocab-list", from: phase.from });
      else if (key.tab) {
        setPhase({
          ...phase,
          field: phase.field === "citation" ? "gloss" : "citation",
        });
      }
      return;
    }
    // And correcting a sentence is two more, for the same reason: a sentence
    // with a `q` in it would otherwise quit the app halfway through being typed.
    if (phase.t === "context-edit") {
      if (key.escape) {
        setPhase({ t: "vocab-contexts", cardId: phase.cardId, from: phase.from });
      } else if (key.tab) {
        setPhase({
          ...phase,
          field: phase.field === "prompt" ? "sentence" : "prompt",
        });
      }
      return;
    }

    if (ch === "q") {
      save();
      exit();
      return;
    }

    switch (phase.t) {
      case "graded": {
        if (showGrammar && handleScrollKey(key, drawerLines.length, drawerHeight)) break;
        if (showHistory && handleScrollKey(key, historyLines.length, drawerHeight)) break;
        if (showVocab && handleScrollKey(key, wordLines.length, drawerHeight)) break;
        if (ch >= "1" && ch <= "4") gradeAndContinue(Number(ch) as Rating);
        // The three panes share the screen with the question: opening one closes
        // the others rather than squeezing all of them.
        else if (ch === "g") {
          setShowHistory(false);
          setShowVocab(false);
          setShowGrammar((s) => !s);
        } else if (ch === "h" && attempts.length > 0) {
          setShowGrammar(false);
          setShowVocab(false);
          setShowHistory((s) => !s);
        } else if (ch === "w") {
          setShowGrammar(false);
          setShowHistory(false);
          setShowVocab((s) => !s);
        } else if (ch === "m") openMap({ t: "graded" });
        else if (ch === "x") chooseMode(mode === "review" ? "explore" : "review");
        else if (ch === "b") bookOrder(); // back to the book in order
        else if (ch === "s") openSchedule({ t: "graded" });
        else if (ch === "V") openVocabList({ t: "graded" });
        else if (ch === "u") undoSubmit(); // Enter came too early
        else if (ch === "v") {
          setInput("");
          setPhase({ t: "vocab-input" });
        }
        break;
      }
      case "map": {
        // Any move renames the topic the warning was about, so the warning goes.
        if (key.leftArrow) {
          setConfirmMap(null);
          setMapIndex((i) => Math.max(0, i - 1));
        } else if (key.rightArrow) {
          setConfirmMap(null);
          setMapIndex((i) => Math.min(mapTopics.length - 1, i + 1));
        } else if (key.upArrow) {
          setConfirmMap(null);
          jumpFamily(-1);
        } else if (key.downArrow) {
          setConfirmMap(null);
          jumpFamily(1);
        } else if (key.return) practiseSelected(phase.from);
        else if (ch === "f") studySelected(phase.from);
        else if (ch === "g") setPhase({ t: "read", from: phase.from });
        else if (ch === "a") {
          // The pane draws the bank the deck will actually ask, so a topic with
          // nothing in it opens on an empty list that explains nothing. Refused
          // in the words Enter refuses a run of nothing in.
          const target = mapTopics[mapIndex];
          const quiet = target ? silence(target) : null;
          if (quiet) setFlash(quiet);
          else setPhase({ t: "bank", from: phase.from });
        }
        else if (ch === "s") openSchedule(phase);
        else if (ch === "w") showWordsFor(phase.from);
        else if (key.escape || ch === "m") {
          setConfirmMap(null);
          setPhase(phase.from);
        }
        break;
      }
      case "read": {
        if (handleScrollKey(key, readerLines.length, readerHeight)) break;
        if (ch === "w") showWordsFor(phase.from);
        else if (key.escape || ch === "g" || ch === "m") {
          setPhase({ t: "map", from: phase.from });
        }
        break;
      }
      case "bank": {
        if (handleScrollKey(key, bankLines.length, readerHeight)) break;
        if (ch === "w") showWordsFor(phase.from);
        else if (key.escape || ch === "a" || ch === "m") {
          setPhase({ t: "map", from: phase.from });
        }
        break;
      }
      case "schedule": {
        if (handleScrollKey(key, schedLines.length, readerHeight)) break;
        // The map it came from is remembered whole, so closing the schedule puts
        // back the map *and* the screen that map was opened over.
        if (ch === "m") openMap(originOf(phase.from));
        else if (ch === "w") showWordsFor(originOf(phase.from));
        else if (key.escape || ch === "s") setPhase(phase.from);
        break;
      }
      case "vocab-list": {
        if (vocab.length === 0) {
          if (ch === "m") openMap(phase.from);
          else if (ch === "w") showWordsFor(phase.from);
          else if (key.escape || ch === "V") setPhase(phase.from);
          break;
        }
        if (key.upArrow) setVocabIndex((i) => Math.max(0, i - 1));
        else if (key.downArrow)
          setVocabIndex((i) => Math.min(vocab.length - 1, i + 1));
        else if (key.return || ch === "e") {
          const card = vocab[vocabIndex];
          if (card) {
            setDraft({ citation: card.citation, gloss: card.gloss });
            setConfirmDelete(false);
            setPhase({ t: "vocab-edit", cardId: card.id, from: phase.from, field: "citation" });
          }
        } else if (ch === "x") {
          const card = vocab[vocabIndex];
          if (!card) break;
          // Two presses, because one press of the wrong key would otherwise
          // throw away a word and everything the schedule knows about it.
          if (confirmDelete) {
            session.deleteVocab(card.id);
            save();
            setConfirmDelete(false);
            setVocabIndex((i) => Math.max(0, Math.min(i, vocab.length - 2)));
            setFlash(`Deleted ${card.citation}.`);
            setTick((n) => n + 1);
          } else {
            setConfirmDelete(true);
            setFlash(`Press x again to delete ${card.citation}.`);
          }
        } else if (ch === "c") {
          const card = vocab[vocabIndex];
          if (!card) break;
          setConfirmDelete(false);
          setContextIndex(0);
          setConfirmContextDelete(false);
          setFlash(null);
          setPhase({ t: "vocab-contexts", cardId: card.id, from: phase.from });
        } else if (ch === "a") {
          // The standing preference, kept with the deck rather than with this
          // machine, so it holds on the phone too. The vocabulary list is where
          // it lives because the terminal has no settings screen and this is
          // the vocabulary's own.
          const on = !session.keepsContext();
          session.setKeepContext(on);
          save();
          setTick((n) => n + 1);
          setFlash(
            on
              ? "Recording a word will keep the sentence it was met in."
              : "Recording a word will keep the word alone.",
          );
        } else if (ch === "m") {
          setConfirmDelete(false);
          openMap(phase.from);
        } else if (ch === "w") {
          setConfirmDelete(false);
          showWordsFor(phase.from);
        } else if (key.escape || ch === "V") {
          setConfirmDelete(false);
          setFlash(null);
          setPhase(phase.from);
        }
        break;
      }
      case "vocab-contexts": {
        const held = session.vocabContexts(phase.cardId);
        const here = held[contextIndex];
        if (key.upArrow) {
          setConfirmContextDelete(false);
          setContextIndex((i) => Math.max(0, i - 1));
        } else if (key.downArrow) {
          setConfirmContextDelete(false);
          setContextIndex((i) => Math.min(held.length - 1, i + 1));
        } else if ((ch === "K" || ch === "J") && here) {
          // Uppercase, as `V` already is: the cursor keys move the cursor and
          // these move the sentence under it, which are different things and
          // read as different keys.
          const by = ch === "K" ? -1 : 1;
          session.moveVocabContext(phase.cardId, here.at, by);
          save();
          setTick((n) => n + 1);
          setContextIndex((i) => Math.max(0, Math.min(held.length - 1, i + by)));
        } else if ((key.return || ch === "e") && here) {
          setContextDraft({ prompt: here.prompt, sentence: here.sentence });
          setConfirmContextDelete(false);
          setPhase({
            t: "context-edit",
            cardId: phase.cardId,
            at: here.at,
            from: phase.from,
            field: "sentence",
          });
        } else if (ch === "x" && here) {
          // Two presses, as everywhere a press throws something away.
          if (confirmContextDelete) {
            session.deleteVocabContext(phase.cardId, here.at);
            save();
            setConfirmContextDelete(false);
            setContextIndex((i) => Math.max(0, Math.min(i, held.length - 2)));
            setFlash("Sentence deleted.");
            setTick((n) => n + 1);
          } else {
            setConfirmContextDelete(true);
            setFlash("Press x again to delete this sentence.");
          }
        } else if (ch === "m") {
          setConfirmContextDelete(false);
          openMap(phase.from);
        } else if (ch === "w") {
          setConfirmContextDelete(false);
          showWordsFor(phase.from);
        } else if (key.escape || ch === "c") {
          setConfirmContextDelete(false);
          setFlash(null);
          setPhase({ t: "vocab-list", from: phase.from });
        }
        break;
      }
      case "vocab-pick": {
        if (ch >= "1" && ch <= String(Math.min(9, phase.candidates.length))) {
          const chosen = phase.candidates[Number(ch) - 1];
          if (chosen) keepWord(chosen, phase.context);
          setPhase({ t: "graded" });
        } else if (key.escape) {
          setPhase({ t: "graded" });
        }
        break;
      }
      case "vocab-review-front": {
        if (key.return || ch === " ")
          setPhase({ t: "vocab-review-back", cardId: phase.cardId });
        // One more of the sentence's English halves, and never its Latin: the
        // reminder of which line this was is usually the whole of what was
        // missing, and it costs none of the answer.
        else if (ch === "h") {
          setHinted((n) =>
            Math.min(n + 1, session.vocabContexts(phase.cardId).length),
          );
        }
        // A grade can advance straight into a vocabulary card; the way back to
        // it has to be here too.
        else if (ch === "u") undoGrade();
        else if (ch === "m") openMap(phase);
        else if (ch === "s") openSchedule(phase);
        else if (ch === "V") openVocabList(phase);
        else if (ch === "w") showWordsFor(phase);
        break;
      }
      case "vocab-review-back": {
        if (ch >= "1" && ch <= "4") {
          setUndo(takeUndo(phase));
          session.gradeVocab(phase.cardId, Number(ch) as Rating);
          save();
          setTick((n) => n + 1);
          advance();
        } else if (ch === "u") undoGrade();
        else if (ch === "m") openMap(phase);
        else if (ch === "s") openSchedule(phase);
        else if (ch === "V") openVocabList(phase);
        else if (ch === "w") showWordsFor(phase);
        break;
      }
      case "done": {
        if (ch === "m") openMap({ t: "done" });
        else if (ch === "s") openSchedule({ t: "done" });
        else if (ch === "V") openVocabList({ t: "done" });
        else if (ch === "w") showWordsFor({ t: "done" });
        else if (ch === "u") undoGrade();
        else if (key.return || ch === " ") {
          save();
          exit();
        }
        break;
      }
    }
  });

  const stats = useMemo(() => session.stats(), [tick, session]);
  const dueNow = stats.dueTopics + stats.dueVocab;
  const coverageHere = useMemo(
    () => (sectionId ? session.coverage(sectionId) : null),
    [sectionId, tick, session],
  );
  // The run of practice under way, and nothing at all when the book is simply
  // being read — the line above already names the topic the book is on.
  const focusLabel = useMemo(() => {
    const run = session.practiseRun();
    if (!run) return null;
    const progress = session.practice(run.sectionId);
    const title = content.getSection(run.sectionId)?.title ?? "this topic";
    return progress
      ? `practising ${title} · ${progress.done}/${progress.total} questions`
      : null;
  }, [tick, session, content]);

  /** What is on screen and why, in one word — not which errand it is on. */
  const badge = phase.t.startsWith("vocab-review") ? "vocab" : via;

  return (
    <Box flexDirection="column" paddingX={1}>
      <StatusBar
        appName={content.profile.ui.appName}
        stats={stats}
        section={
          // The ref belongs beside the title here as it does on the web: it
          // is how you find the topic in the book, and the grammar drawer
          // (Esc) was the only place it appeared.
          // A word is on screen, so the topic studied before it is not what
          // this line is about. The citation is the answer being graded, so
          // it says what is being worked on and stops there.
          phase.t.startsWith("vocab-review")
            ? "Vocabulary"
            : section
              ? `${content.formatRef(section.ref)} ${section.title}`
              : "—"
        }
        mode={badge}
        errand={mode}
        focus={mode === "explore" ? focusLabel : null}
      />

      {phase.t === "map" && mapTopics[mapIndex] && (
        <GrammarMap
          families={families}
          cursor={mapIndex}
          overall={overall}
          topic={mapTopics[mapIndex]!}
          quotedOnly={session.quotedOnly()}
          preview={mapPreview}
        />
      )}

      {phase.t === "read" && mapSection && (
        <GrammarPane
          lines={readerLines}
          scroll={scroll}
          height={readerHeight}
          refLabel={mapSection.ref}
          title={mapSection.title}
        />
      )}

      {phase.t === "bank" && mapSection && (
        <HistoryPane
          lines={bankLines}
          scroll={scroll}
          height={readerHeight}
          // How much of the bank has actually been met, not just how big it
          // is: the gap between the two is the reason to stay on a topic.
          // Counted off the same list the pane is drawing rather than out of
          // `coverage`, which is now belt and braces rather than load-bearing:
          // the bank narrows with the preference exactly as `coverage` does, so
          // the pane and the index agree by construction. Counting the list
          // actually on the screen is what keeps them agreeing.
          heading={`All questions on ${mapSection.title} — ${
            bank.filter((q) => q.attempts.length > 0).length
          } of ${bank.length} answered`}
        />
      )}

      {phase.t === "schedule" && (
        <HistoryPane
          lines={schedLines}
          scroll={scroll}
          height={readerHeight}
          heading={`Coming up — ${scheduleAll.length} scheduled, ${
            scheduleAll.filter((e) => e.overdue).length
          } waiting`}
        />
      )}

      {phase.t === "vocab-list" && (
        <VocabList
          cards={vocab}
          cursor={vocabIndex}
          height={readerHeight}
          keeping={session.keepsContext()}
        />
      )}

      {phase.t === "vocab-edit" && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
          <Text color="gray">Edit word — Tab switches field, Enter saves</Text>
          <Box marginTop={1}>
            <Text color={phase.field === "citation" ? "cyan" : undefined}>
              {phase.field === "citation" ? "▸ " : "  "}citation
            </Text>
            <Text> </Text>
            {phase.field === "citation" ? (
              <TextInput
                value={draft.citation}
                onChange={(citation) => setDraft((d) => ({ ...d, citation }))}
                onSubmit={() => saveVocabEdit(phase.cardId, phase.from)}
              />
            ) : (
              <Text>{draft.citation}</Text>
            )}
          </Box>
          <Box>
            <Text color={phase.field === "gloss" ? "cyan" : undefined}>
              {phase.field === "gloss" ? "▸ " : "  "}meaning {"  "}
            </Text>
            {phase.field === "gloss" ? (
              <TextInput
                value={draft.gloss}
                onChange={(gloss) => setDraft((d) => ({ ...d, gloss }))}
                onSubmit={() => saveVocabEdit(phase.cardId, phase.from)}
              />
            ) : (
              <Text>{draft.gloss}</Text>
            )}
          </Box>
          <Text dimColor>
            The citation is what you are asked to produce; the meaning is the prompt.
          </Text>
        </Box>
      )}

      {phase.t === "vocab-contexts" && (
        <ContextList
          card={session.vocabCard(phase.cardId)}
          cursor={contextIndex}
          height={readerHeight}
        />
      )}

      {phase.t === "context-edit" && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
          <Text color="gray">Edit sentence — Tab switches field, Enter saves</Text>
          <Box marginTop={1}>
            <Text color={phase.field === "prompt" ? "cyan" : undefined}>
              {phase.field === "prompt" ? "▸ " : "  "}question {"  "}
            </Text>
            {phase.field === "prompt" ? (
              <TextInput
                value={contextDraft.prompt}
                onChange={(prompt) => setContextDraft((d) => ({ ...d, prompt }))}
                onSubmit={() => saveContextEdit(phase.cardId, phase.at, phase.from)}
              />
            ) : (
              <Text>{contextDraft.prompt}</Text>
            )}
          </Box>
          <Box>
            <Text color={phase.field === "sentence" ? "cyan" : undefined}>
              {phase.field === "sentence" ? "▸ " : "  "}sentence {"  "}
            </Text>
            {phase.field === "sentence" ? (
              <TextInput
                value={contextDraft.sentence}
                onChange={(sentence) => setContextDraft((d) => ({ ...d, sentence }))}
                onSubmit={() => saveContextEdit(phase.cardId, phase.at, phase.from)}
              />
            ) : (
              <Text>{contextDraft.sentence}</Text>
            )}
          </Box>
          <Text dimColor>
            Whether the sentence is the reference or your own is not editable —
            rewriting your words does not make them the book's.
          </Text>
        </Box>
      )}

      {showGrammar && section && phase.t !== "map" && phase.t !== "read" && (
        <GrammarPane
          lines={drawerLines}
          scroll={scroll}
          height={drawerHeight}
          refLabel={section.ref}
          title={section.title}
        />
      )}

      {showHistory && phase.t === "graded" && (
        <HistoryPane
          lines={historyLines}
          scroll={scroll}
          height={drawerHeight}
          heading={`Earlier on ${section?.title ?? "this topic"} — ${attempts.length} ${
            attempts.length === 1 ? "answer" : "answers"
          }, newest first`}
        />
      )}

      {showVocab && question && (phase.t === "answering" || phase.t === "graded") && (
        <WordListPane
          lines={wordLines}
          scroll={scroll}
          height={drawerHeight}
          heading={`Vocabulary — ${wordCount} ${
            wordCount === 1 ? "word" : "words"
          } in this sentence`}
        />
      )}

      {(phase.t === "answering" || phase.t === "graded") && question && (
        <QuestionView
          ui={content.profile.ui}
          question={question}
          index={qIndex}
          total={test?.questions.length ?? 0}
          graded={phase.t === "graded"}
          submitted={submitted}
          input={input}
          onChange={changeInput}
          onSubmit={submitAnswer}
        />
      )}

      {phase.t === "vocab-input" && (
        <Box marginTop={1} flexDirection="column">
          <Text>Record vocabulary — type the word as it appeared:</Text>
          <Box>
            <Text color="cyan">▸ </Text>
            <TextInput value={input} onChange={setInput} onSubmit={recordForm} />
          </Box>
          <Text dimColor>(the dictionary headword is built for you)</Text>
        </Box>
      )}

      {phase.t === "vocab-pick" && (
        <Box marginTop={1} flexDirection="column">
          <Text>Which word is “{phase.form}”? (most frequent first)</Text>
          {phase.candidates.slice(0, 9).map((c, i) => (
            <Text key={c.lemma + c.pos}>
              <Text color="yellow">{i + 1}</Text> {c.citation} — {c.gloss}
            </Text>
          ))}
          <Text dimColor>Esc to cancel</Text>
        </Box>
      )}

      {(phase.t === "vocab-review-front" || phase.t === "vocab-review-back") && (
        <VocabReview
          ui={content.profile.ui}
          card={session.vocabCard(phase.cardId)}
          reveal={phase.t === "vocab-review-back"}
          hinted={hinted}
        />
      )}

      {phase.t === "practised" && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">
            ✓ All practised — every question on “{section?.title ?? "this topic"}” has been
            through this run.
          </Text>
          <Text dimColor>
            Enter on this topic in the index (m) practises it again; b goes back to the book.
          </Text>
        </Box>
      )}

      {phase.t === "done" && (
        <Box marginTop={1}>
          <Text color="green">
            ✓ The book is worked out. Well done — press m to read the grammar index, or Enter to
            exit.
          </Text>
        </Box>
      )}

      {flash && (
        <Box marginTop={1}>
          <Text color="green">{flash}</Text>
        </Box>
      )}

      <HintBar
        ui={content.profile.ui}
        phase={phase.t}
        paging={
          (showGrammar && drawerLines.length > drawerHeight) ||
          (showHistory && historyLines.length > drawerHeight) ||
          (showVocab && wordLines.length > drawerHeight)
        }
        history={attempts.length > 0}
        words={question !== undefined}
        // The map's Enter throws away an answer being written, and the hint
        // says so before the key is pressed rather than after.
        practiseCosts={phase.t === "map" && phase.from.t === "answering"}
        undo={undo !== null}
        book={coverageHere !== null}
        contexts={(vocab[vocabIndex]?.contexts?.length ?? 0) > 0}
        canHint={
          phase.t === "vocab-review-front" &&
          hinted < session.vocabContexts(phase.cardId).length
        }
        keeping={session.keepsContext()}
        // Greyed out with nothing due, the way the web app greys its switch.
        errand={dueNow > 0 ? mode : null}
      />
    </Box>
  );
}

/** The colour each mode is named in; reviewing is the quiet default. */
const MODE_COLOUR: Record<string, string | undefined> = {
  review: undefined,
  new: "green",
  drill: "cyan",
  quiz: "magenta",
  vocab: undefined,
};

function StatusBar({
  appName,
  stats,
  section,
  mode,
  errand,
  focus,
}: {
  appName: string;
  stats: { dueTopics: number; dueVocab: number; topics: number; vocab: number };
  section: string;
  /** What is on screen and why: `review`, `new`, `drill`, `sweep`, `vocab`. */
  mode?: string | null;
  /** Which of the two errands this is — the CLI's answer to the web switch. */
  errand: Mode;
  /** What exploring is doing, or null for the plain book in order. */
  focus?: string | null;
}) {
  return (
    // The standing state takes a line of its own, as it does on the web and
    // for the same reason: "Verbs in -io of the Third Conjugation" and a
    // sentence saying where new topics come from do not share a terminal
    // width, and what got cut was always the end of the line.
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text color="magenta" bold>
            {appName}
          </Text>{" "}
          ·{" "}
          {mode ? (
            <Text color={MODE_COLOUR[mode]} dimColor={!MODE_COLOUR[mode]}>
              {mode}:{" "}
            </Text>
          ) : null}
          <Text bold>{section}</Text>
        </Text>
        <Text dimColor>
          topics {stats.topics} (due {stats.dueTopics}) · vocab {stats.vocab} (due{" "}
          {stats.dueVocab})
        </Text>
      </Box>
      <Text color="cyan">
        {errand === "review" ? "reviewing" : "exploring"}
        {focus ? ` · ${focus}` : ""}
      </Text>
    </Box>
  );
}

// --- grammar index ------------------------------------------------------------

/** Mastery as a 0–1 fraction; an ungraded topic reads as 0. */
function masteryFraction(t: TopicProgress): number {
  return ((t.mastery ?? 1) - 1) / 3;
}

/**
 * One cell of a bar: how far along the topic is, at a glance.
 *
 * The empty test comes first, and the order is the point. `questions` is the
 * narrowed count, so under the quoted-only preference a topic mastered on
 * *generated* questions has a mastery to draw and nothing left to serve; asked
 * in the other order it would draw as a solid green cell on a bar whose whole
 * job is now to show where the quotations are.
 *
 * A glyph of its own rather than the dim flag, because "never started" is
 * already `░` in dim gray — most of the map, most of the time — and dimming an
 * empty topic on top of that would make the two cells the same. There is no
 * legend: a cell is explained by moving the cursor onto it, and the status line
 * under the bar already says `no tests` or `nothing quoted`.
 */
function cellStyle(t: TopicProgress): { glyph: string; color: string; dim: boolean } {
  if (t.questions === 0) return { glyph: "·", color: "gray", dim: true };
  if (t.mastery === undefined) return { glyph: "░", color: "gray", dim: true };
  const level = Math.floor(t.mastery);
  if (level >= 4) return { glyph: "█", color: "green", dim: false };
  if (level >= 3) return { glyph: "▓", color: "cyan", dim: false };
  if (level >= 2) return { glyph: "▒", color: "yellow", dim: false };
  return { glyph: "░", color: "yellow", dim: false };
}

/** Screen lines of a section the map previews — the same for every topic. */
const PREVIEW_LINES = 5;
/** Everything in the map pane that is not the preview, in screen lines. */
const MAP_CHROME_LINES = 24;
/** Cells in a family's fixed-width summary bar. */
const SUMMARY_CELLS = 6;
/** Indent of the selected family's per-topic bar, so it sits under the name. */
const BAR_INDENT = 4;

function summaryGlyphs(percent: number): string {
  const filled = Math.round(percent * SUMMARY_CELLS);
  return "\u2588".repeat(filled) + "\u2591".repeat(SUMMARY_CELLS - filled);
}

/**
 * The families one per line, the selected one expanded into a cell per topic
 * beneath its own name.
 *
 * One line each is what makes `↑ ↓` legible: laid out three-to-a-row, "down"
 * moved sideways two times out of three. It also leaves room for the names in
 * full, which no three-column grid does. One cell per topic for all 135 at once
 * would need ~161 columns, so the per-topic detail stays with the selected
 * family alone (`FamilyBar`) — and exactly one family is ever expanded, so the
 * block's height never changes as the cursor walks.
 *
 * A family with nothing under it for exploring to serve says so in words rather
 * than in dimness, which is the opposite way round from the bar below it. The
 * dim flag is already spoken for here: every unselected line is dim and the
 * selected one is bold cyan, so dimming an empty family would say nothing on
 * eight lines out of nine and fight the cursor on the ninth. The cells in
 * `FamilyBar` have no such job, which is why they can carry it in a glyph.
 */
function FamilyList({
  families,
  selected,
  quotedOnly,
  cursorInFamily,
}: {
  families: FamilyProgress[];
  selected: string;
  /** Whether "nothing here" means nothing quoted or nothing written at all. */
  quotedOnly: boolean;
  cursorInFamily: number;
}) {
  const width = Math.max(...families.map((f) => f.label.length));
  return (
    <Box flexDirection="column">
      {families.map((f) => {
        // The whole line is styled when selected, not the name alone: a
        // highlight on the first column only reads as half-applied.
        const on = f.id === selected;
        // Only when there is nothing under it at all: one topic with a
        // quotation in it is a reason to walk into the family, and a heading
        // that wrote the family off would hide the very topic this is for. A
        // family holding no topics at all is a different thing, and the
        // "0 topics" already on the line is what says it.
        const empty =
          f.topics.length > 0 && f.topics.every((t) => t.questions === 0);
        // A family the book sets no exercise anywhere in. Its glyphs can never
        // fill, so it shows none: an empty bar beside Prosody reports a failure
        // that never happened.
        const reading =
          f.topics.length > 0 && f.topics.every((t) => t.readingOnly);
        return (
          <Box key={f.id} flexDirection="column">
            <Box>
              <Text bold={on} color={on ? "cyan" : undefined} dimColor={!on}>
                {`${on ? "▸" : " "} ${f.label.padEnd(width)}  `}
              </Text>
              <Text
                bold={on}
                color={f.percent > 0 ? "green" : "gray"}
                dimColor={!on && f.percent === 0}
              >
                {reading ? " ".repeat(SUMMARY_CELLS) : summaryGlyphs(f.percent)}
              </Text>
              <Text bold={on} color={on ? "cyan" : undefined} dimColor={!on}>
                {reading
                  ? `       ${String(f.topics.length).padStart(2)} topic${f.topics.length === 1 ? "" : "s"}`
                  : ` ${String(Math.round(f.percent * 100)).padStart(3)}%  ${String(f.topics.length).padStart(2)} topic${f.topics.length === 1 ? "" : "s"}`}
              </Text>
              {empty && (
                <Text dimColor>
                  {reading
                    ? "  · reading only"
                    : quotedOnly
                      ? "  · nothing quoted"
                      : "  · no questions"}
                </Text>
              )}
            </Box>
            {on && f.topics.length > 0 && (
              <FamilyBar family={f} cursorInFamily={cursorInFamily} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * The selected family in full: one cell per topic, with the cursor caret and,
 * beside it, a count that says what it is counting.
 */
function FamilyBar({
  family,
  cursorInFamily,
}: {
  family: FamilyProgress;
  cursorInFamily: number;
}) {
  const indent = " ".repeat(BAR_INDENT);
  return (
    <Box flexDirection="column">
      <Box>
        <Text>{indent}</Text>
        {family.topics.map((t, i) => {
          const s = cellStyle(t);
          const cursor = i === cursorInFamily;
          return (
            <Text
              key={t.sectionId}
              color={s.color}
              // Never dim the cell under the cursor: inverse over dim gray is
              // invisible in most terminals, and dim gray is every topic not
              // yet started \u2014 which is most of the map, most of the time.
              dimColor={s.dim && !cursor}
              inverse={cursor}
              bold={cursor}
            >
              {s.glyph}
            </Text>
          );
        })}
        <Text dimColor>{`  topic ${cursorInFamily + 1} of ${family.topics.length}`}</Text>
      </Box>
      <Text color="cyan">{indent + " ".repeat(Math.max(0, cursorInFamily)) + "\u25b2"}</Text>
    </Box>
  );
}

function GrammarMap({
  families,
  cursor,
  overall,
  topic,
  quotedOnly,
  preview,
}: {
  families: FamilyProgress[];
  cursor: number;
  overall: number;
  topic: TopicProgress;
  /** Whether the counts below are the quoted questions alone. */
  quotedOnly: boolean;
  /** The same count of pre-wrapped lines for every topic, and whether more follows. */
  preview: { lines: RichLine[]; truncated: boolean };
}) {
  // Locate the cursor: which family it falls in, and where inside that family.
  let offset = 0;
  let selected = families[0]!;
  let inFamily = 0;
  for (const f of families) {
    if (f.topics.length === 0) continue;
    if (cursor < offset + f.topics.length) {
      selected = f;
      inFamily = cursor - offset;
      break;
    }
    offset += f.topics.length;
  }

  const mastery =
    topic.mastery === undefined
      ? "not started"
      : `${Math.round(masteryFraction(topic) * 100)}% mastered`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="magenta">
          Grammar index
        </Text>
        <Text dimColor>{Math.round(overall * 100)}% mastered overall</Text>
      </Box>

      {/* The selected family needs no separate heading line: it is the
          highlighted line of the list, with its bar under its own name. */}
      <FamilyList
        families={families}
        selected={selected.id}
        quotedOnly={quotedOnly}
        cursorInFamily={inFamily}
      />

      {/* Title and status go on separate lines: together they outrun the pane
          for a third of the syllabus, and a header that wraps for some topics
          and not others shifts everything below it as the cursor moves. */}
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="gray">§ {topic.ref} </Text>
          <Text bold>{topic.title}</Text>
        </Text>
        <Text>
          <Text dimColor>{mastery}</Text>
          {/* A topic is not finished when its mastery is: four questions do
              not sweep a bank of twenty-odd, and this is where that shows. */}
          {topic.questions > 0 ? (
            <Text dimColor>
              {" "}
              · {topic.answered}/{topic.questions} questions
            </Text>
          ) : null}
          {topic.due ? <Text color="yellow"> · due</Text> : null}
          {topic.frontier ? <Text color="cyan"> · resumes here</Text> : null}
          {/* Three silences, and which one this is decides whether the topic is
              coming back: the book sets no exercise here at all, or nothing was
              written here yet, or nothing quoted was. */}
          {topic.readingOnly ? <Text dimColor> · reading only</Text> : null}
          {!topic.readingOnly && !topic.hasTests ? (
            <Text dimColor> · no tests</Text>
          ) : null}
          {topic.hasTests && quotedOnly && topic.questions === 0 ? (
            <Text dimColor> · nothing quoted</Text>
          ) : null}
        </Text>
      </Box>
      {/* Pre-wrapped and padded to a fixed height: every topic shows the same
          amount of its section, and the box below does not shift as the cursor
          moves. `g` opens the whole section in the reader. */}
      {preview.lines.map((line, i) => (
        <Text key={i}>{line.length === 0 ? " " : <Styled line={line} />}</Text>
      ))}
      <Text dimColor>
        {preview.truncated ? `press g to read § ${topic.ref} in full` : `all of § ${topic.ref}`}
      </Text>
    </Box>
  );
}

/**
 * One laid-out line, with the emphasis the grammar set it in.
 *
 * Bennett bolds the *ending* inside each form and italicises the English
 * gloss; a terminal can show both, and without them a paradigm is a list of
 * words with nothing marking which part is the lesson.
 */
function Styled({ line }: { line: RichLine }) {
  return (
    <>
      {line.map((run, i) => (
        <Text key={i} bold={run.b} italic={run.i}>
          {run.text}
        </Text>
      ))}
    </>
  );
}

/**
 * A window onto one grammar section. Sections run to hundreds of lines, so the
 * pane shows `height` of them at `scroll` and the reader pages through the
 * rest — nothing in the section is out of reach.
 */
function GrammarPane({
  lines,
  scroll,
  height,
  refLabel,
  title,
}: {
  lines: RichLine[];
  scroll: number;
  height: number;
  refLabel: string;
  title: string;
}) {
  const visible = lines.slice(scroll, scroll + height);
  const more = lines.length > height;
  const atEnd = scroll + height >= lines.length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">
        § {refLabel} — {title}
      </Text>
      {/* Pre-wrapped: one entry per screen line, so the count drives scrolling. */}
      {visible.map((line, i) => (
        <Text key={scroll + i}>{line.length === 0 ? " " : <Styled line={line} />}</Text>
      ))}
      {more && (
        <Text dimColor>
          {positionLabel(scroll, height, lines.length)}
          {atEnd ? " · end" : " · ↑↓ scroll, PgUp/PgDn page"}
        </Text>
      )}
    </Box>
  );
}

/**
 * Pre-toned lines in a scrolling window: the topic's earlier answers, a
 * section's whole question bank, or the schedule. All three are documents rather
 * than lists — read top to bottom, longer than the screen — so all three get the
 * grammar pane's treatment, and the caller supplies the heading.
 */
function HistoryPane({
  lines,
  scroll,
  height,
  heading,
}: {
  lines: HistoryLine[];
  scroll: number;
  height: number;
  heading: string;
}) {
  const visible = lines.slice(scroll, scroll + height);
  const more = lines.length > height;
  const atEnd = scroll + height >= lines.length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">{heading}</Text>
      {visible.map((line, i) => (
        <Text
          key={scroll + i}
          dimColor={line.tone === "meta"}
          color={
            line.tone === "yours" ? "yellow" : line.tone === "correct" ? "green" : undefined
          }
        >
          {line.text === "" ? " " : line.text}
        </Text>
      ))}
      {more && (
        <Text dimColor>
          {positionLabel(scroll, height, lines.length)}
          {atEnd ? " · end" : " · ↑↓ scroll, PgUp/PgDn page"}
        </Text>
      )}
    </Box>
  );
}

/**
 * The words of the question on screen, in two columns.
 *
 * It has the reading panes' shape — a scrolling window under a heading — but not
 * their rendering: a `HistoryLine` carries one tone for a whole line, and here
 * the English half and the Latin half are always coloured differently. The
 * English is dim because it is the part the student can already read; the
 * citation is green, the colour a right answer has everywhere else in the app,
 * because it is the form they are being asked to produce.
 */
function WordListPane({
  lines,
  scroll,
  height,
  heading,
}: {
  lines: WordListLine[];
  scroll: number;
  height: number;
  heading: string;
}) {
  const visible = lines.slice(scroll, scroll + height);
  const more = lines.length > height;
  const atEnd = scroll + height >= lines.length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">{heading}</Text>
      {visible.map((line, i) => (
        <Text key={scroll + i}>
          <Text dimColor>{line.english}</Text>
          <Text
            color={line.tone === "citation" ? "green" : undefined}
            dimColor={line.tone !== "citation"}
          >
            {line.latin}
          </Text>
        </Text>
      ))}
      {more && (
        <Text dimColor>
          {positionLabel(scroll, height, lines.length)}
          {atEnd ? " · end" : " · ↑↓ scroll, PgUp/PgDn page"}
        </Text>
      )}
    </Box>
  );
}

/**
 * Every word recorded, one per line, with a cursor.
 *
 * A list rather than a pager because the point is to *pick* one: until this
 * existed a card could only be created and reviewed, so a word saved against the
 * wrong candidate stayed wrong forever. The window follows the cursor, since a
 * vocabulary outgrows a terminal early.
 */
function VocabList({
  cards,
  cursor,
  height,
  keeping,
}: {
  cards: VocabCardState[];
  cursor: number;
  height: number;
  /** Whether recording a word currently keeps its sentence too. */
  keeping: boolean;
}) {
  if (cards.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text color="gray">Vocabulary — nothing recorded yet</Text>
        <Text dimColor>Press v while an answer is on screen to record a word.</Text>
      </Box>
    );
  }
  // Keep the cursor in view without letting the window run off either end.
  const rows = Math.max(1, height - 2);
  const start = Math.max(0, Math.min(cursor - Math.floor(rows / 2), cards.length - rows));
  const visible = cards.slice(Math.max(0, start), Math.max(0, start) + rows);
  const now = Date.now();

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">
        Vocabulary — {cards.length} {cards.length === 1 ? "word" : "words"}, word{" "}
        {cursor + 1} of {cards.length} · keeping sentences: {keeping ? "on" : "off"}
      </Text>
      {visible.map((card) => {
        const on = cards[cursor]?.id === card.id;
        const due = new Date(card.fsrs.due).getTime();
        const kept = card.contexts?.length ?? 0;
        return (
          <Box key={card.id}>
            <Text color={on ? "cyan" : undefined} bold={on}>
              {`${on ? "▸ " : "  "}${card.citation}`}
            </Text>
            <Text dimColor>{`  ${card.gloss}`}</Text>
            {/* So `c` is discoverable: a key nobody knows about is a key
                nobody presses. */}
            <Text dimColor>{kept > 0 ? `  · ${kept} kept` : ""}</Text>
            <Text color={due <= now ? "yellow" : undefined} dimColor={due > now}>
              {due <= now ? "  · due" : ""}
            </Text>
          </Box>
        );
      })}
      {cards.length > rows && (
        <Text dimColor>{positionLabel(Math.max(0, start), rows, cards.length)}</Text>
      )}
    </Box>
  );
}

function QuestionView({
  ui,
  question,
  index,
  total,
  graded,
  submitted,
  input,
  onChange,
  onSubmit,
}: {
  ui: Profile["ui"];
  question: Question;
  /** Where this question sits in the test, and how many the test holds. */
  index: number;
  total: number;
  graded: boolean;
  submitted: string;
  input: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text dimColor>
        {ui.promptDirection}
        {total > 0 ? ` · ${index + 1}/${total}` : ""}
      </Text>
      <Box marginTop={1}>
        <Text bold>{question.prompt}</Text>
      </Box>

      {!graded ? (
        <Box marginTop={1}>
          <Text color="cyan">✎ </Text>
          <TextInput
            value={input}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={ui.cliPlaceholder}
          />
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text dimColor>your answer </Text>
            <Text color="yellow">{submitted.trim() || "—"}</Text>
          </Text>
          <Text>
            <Text dimColor>correct     </Text>
            <Text color="green">{question.answer}</Text>
          </Text>
          {question.note && <Text dimColor>{question.note}</Text>}
          {question.source && (
            <Text dimColor>
              {"            "}— {question.source.author}, {question.source.work}
              {question.source.locus ? ` ${question.source.locus}` : ""}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * One sentence of a card, with the word that was picked out drawn bold.
 *
 * `sentenceTokens` rather than a split of its own: the index was written down
 * on the phone against that cut of the line, and a second way of numbering a
 * sentence's words would light up the wrong one here.
 */
function ContextSentence({ context }: { context: VocabContext }) {
  return (
    <Text>
      {sentenceTokens(context.sentence).map((token, i) =>
        !token.space && token.index === context.index ? (
          <Text key={i} bold color="yellow">
            {token.text}
          </Text>
        ) : (
          <Text key={i}>{token.text}</Text>
        ),
      )}
    </Text>
  );
}

/**
 * A vocabulary card.
 *
 * English on the front: the student produces the Latin, as everywhere else. The
 * back carries the sentences the word was met in under the citation — the line
 * it was read in is usually the reason it stuck, and the card used to throw it
 * away. Three at most, because a review card that scrolls is a review card with
 * its grades off the bottom of the screen.
 *
 * `hinted` is how many of those sentences' *English* halves have been asked for
 * in front of the reveal. The English cannot give the answer away, so it is
 * free to be a hint; the Latin stays behind the reveal with the citation.
 */
function VocabReview({
  ui,
  card,
  reveal,
  hinted,
}: {
  ui: Profile["ui"];
  card: VocabCardState | undefined;
  reveal: boolean;
  /** How many context prompts the student has asked to see. */
  hinted: number;
}) {
  if (!card) return null;
  const contexts = card.contexts ?? [];
  const shown = contexts.slice(0, 3);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Vocabulary review · {ui.sayItIn}</Text>
      <Box marginTop={1}>
        <Text bold>{card.gloss}</Text>
      </Box>
      {!reveal &&
        contexts.slice(0, hinted).map((c) => (
          <Text key={c.at} dimColor>
            {c.prompt}
          </Text>
        ))}
      {reveal && (
        <>
          <Box marginTop={1}>
            <Text color="magenta" bold>
              → {card.citation}
            </Text>
          </Box>
          {shown.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>where you met it</Text>
              {shown.map((c) => (
                <Box key={c.at} flexDirection="column" marginTop={1}>
                  <Text dimColor>
                    {c.prompt}
                    {/* Never dropped: a sentence the student wrote may be
                        wrong, and a card that drew it as the reference would
                        teach the mistake back to the person who made it. */}
                    {c.source === "submitted" ? "  (you wrote)" : ""}
                  </Text>
                  <ContextSentence context={c} />
                </Box>
              ))}
              {contexts.length > shown.length && (
                <Text dimColor>
                  {`… and ${contexts.length - shown.length} more (V, then c)`}
                </Text>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

/**
 * The sentences one card has kept, as a pane over the vocabulary list.
 *
 * The order is the student's and is what the card back reads in, so the first
 * row is also the one the hint offers first — which is the whole reason moving
 * a row is worth a key.
 */
function ContextList({
  card,
  cursor,
  height,
}: {
  card: VocabCardState | undefined;
  cursor: number;
  height: number;
}) {
  const contexts = card?.contexts ?? [];
  if (!card || contexts.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text color="gray">{card ? card.citation : "Word"} — no sentences kept</Text>
        <Text dimColor>
          Press v while an answer is on screen and the sentence comes with the word.
        </Text>
      </Box>
    );
  }
  // Two lines to a sentence, so half as many fit as in a list of words.
  const rows = Math.max(1, Math.floor((height - 2) / 2));
  const start = Math.max(0, Math.min(cursor - Math.floor(rows / 2), contexts.length - rows));
  const visible = contexts.slice(Math.max(0, start), Math.max(0, start) + rows);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">
        {card.citation} — {contexts.length}{" "}
        {contexts.length === 1 ? "sentence" : "sentences"}, {cursor + 1} of{" "}
        {contexts.length}
      </Text>
      {visible.map((c) => {
        const on = contexts[cursor]?.at === c.at;
        return (
          <Box key={c.at} flexDirection="column" marginTop={1}>
            <Text color={on ? "cyan" : undefined} bold={on}>
              {`${on ? "▸ " : "  "}${c.prompt}`}
              <Text dimColor>{c.source === "submitted" ? "  (you wrote)" : ""}</Text>
            </Text>
            <Box paddingLeft={2}>
              <ContextSentence context={c} />
            </Box>
          </Box>
        );
      })}
      {contexts.length > rows && (
        <Text dimColor>{positionLabel(Math.max(0, start), rows, contexts.length)}</Text>
      )}
    </Box>
  );
}

function HintBar({
  ui,
  phase,
  paging,
  history,
  words,
  practiseCosts,
  undo,
  book,
  contexts,
  canHint,
  keeping,
  errand,
}: {
  ui: Profile["ui"];
  phase: Phase["t"];
  /** An open pane has more lines than fit. */
  paging?: boolean;
  /** There is something in the topic's answer trail to show. */
  history?: boolean;
  /** A question is on screen, so it has a word list to offer. */
  words?: boolean;
  /** Enter on the index would throw away an answer being written. */
  practiseCosts?: boolean;
  /** A grade was just given and can still be taken back. */
  undo?: boolean;
  /** A topic is on screen, so `b` has a book to send you back to. */
  book?: boolean;
  /** The card under the cursor has sentences, so `c` has something to open. */
  contexts?: boolean;
  /** The card under review still has a hint left to give. */
  canHint?: boolean;
  /** Whether recording a word currently keeps its sentence too. */
  keeping?: boolean;
  /** The errand `x` would leave, or null when there is nothing to switch to. */
  errand?: Mode | null;
}) {
  const scrollHint = paging ? " · ↑↓ scroll" : "";
  // Only offered once the topic has a trail: `h` does nothing before that.
  const historyHint = history ? " · h earlier" : "";
  // Offered only where there is a question to have words for, the same way `h`
  // waits for a trail. A key that is advertised has to do something.
  const wordsHint = words ? " · w words here" : "";
  // Offered only while there is a grade to take back, on every screen a grade
  // can land you on.
  const undoHint = undo ? " · u undo grade" : "";
  // Offered only where it would do something: `b` needs a topic on screen to
  // be leaving, and `x` needs something due to switch to.
  const bookHint = book ? " · b back to the book" : "";
  // Both offered only where they would do something, the same way `h` waits for
  // a trail: a key that is advertised has to do something.
  const contextsHint = contexts ? " · c its sentences" : "";
  const hintHint = canHint ? " · h hint" : "";
  const errandHint =
    errand === "review"
      ? " · x explore"
      : errand === "explore"
        ? " · x review"
        : "";
  const practiseHint = practiseCosts
    ? "Enter practise this · f study from here (both leave this behind)"
    : "Enter practise this · f study from here";
  const hint =
    phase === "answering"
      ? `${ui.cliHint} · Enter submit · Esc grammar · Tab words · ^N index${undo ? " · ^Z undo grade" : ""}${scrollHint}`
      : phase === "map"
        ? `← → topic · ↑ ↓ family · g read section · a all questions · s schedule${wordsHint} · ${practiseHint} · Esc close`
        : phase === "read"
          ? `↑ ↓ scroll · PgUp/PgDn page${wordsHint} · Esc back to the index · q quit`
        : phase === "bank"
          ? `↑ ↓ scroll · PgUp/PgDn page${wordsHint} · Esc back to the index · q quit`
        : phase === "schedule"
          ? `↑ ↓ scroll · PgUp/PgDn page · m index${wordsHint} · Esc close · q quit`
        : phase === "vocab-list"
          ? `↑ ↓ word · Enter edit${contextsHint} · a keep sentences: ${
              keeping ? "on" : "off"
            } · x delete · m index${wordsHint} · Esc close · q quit`
        : phase === "vocab-contexts"
          ? `↑ ↓ sentence · K J move it · e edit · x delete · m index${wordsHint} · Esc back · q quit`
        : phase === "vocab-edit" || phase === "context-edit"
          ? "type · Tab switch field · Enter save · Esc cancel"
        : phase === "graded"
        ? `1–4 self-grade (1 again · 4 easy) · u keep typing${wordsHint}${bookHint}${errandHint} · v record a word · V my words · g grammar${historyHint}${scrollHint} · m index · s schedule · q quit`
        : phase === "vocab-review-front"
          ? `Space/Enter reveal${hintHint}${undoHint} · m index · q quit`
          : phase === "vocab-review-back"
            ? `1–4 self-grade${undoHint} · m index · q quit`
            : phase === "vocab-input"
              ? "Enter to look up the word · Esc cancel"
              : phase === "vocab-pick"
                ? "1–9 choose · Esc cancel"
                : phase === "practised"
                  ? `m grammar index${bookHint}${errandHint} · V my words · Enter exit`
                  : `m grammar index · s schedule · V my words${undoHint} · Enter exit`;
  return (
    <Box marginTop={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
