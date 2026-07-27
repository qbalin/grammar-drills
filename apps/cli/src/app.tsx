import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { layoutSection, positionLabel, previewWindow, scrolled } from "./pager.js";
import {
  attemptLines,
  questionBankLines,
  scheduleLines,
  type HistoryLine,
} from "./history.js";
import {
  Content,
  Session,
  type FamilyProgress,
  type LemmaEntry,
  type Progress,
  type Question,
  type Rating,
  type StorageAdapter,
  type Test,
  type TopicProgress,
  type VocabCardState,
} from "@latin-tutor/core";

interface Props {
  session: Session;
  content: Content;
  storage: StorageAdapter;
}

/** Where a pane was opened from, so Esc goes back where it came from. */
type Origin = "graded" | "done";

type Phase =
  | { t: "answering" }
  | { t: "graded" }
  | { t: "vocab-input" }
  | { t: "vocab-pick"; form: string; candidates: LemmaEntry[] }
  | { t: "vocab-review-front"; cardId: string }
  | { t: "vocab-review-back"; cardId: string }
  | { t: "vocab-list"; from: Origin }
  | { t: "vocab-edit"; cardId: string; from: Origin; field: "citation" | "gloss" }
  | { t: "map"; from: Origin }
  | { t: "read"; from: Origin } // a section read in full, from the map
  | { t: "bank"; from: Origin } // every question of the topic under the cursor
  | { t: "schedule"; from: Origin | "map" }
  | { t: "done" };

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
  isNewTopic: boolean;
  inPlacement: boolean;
  placementIndex: number;
}

export function App({ session, content, storage }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [isNewTopic, setIsNewTopic] = useState(false);

  const [inPlacement, setInPlacement] = useState(false);
  const [placementList, setPlacementList] = useState<string[]>([]);
  const [placementIndex, setPlacementIndex] = useState(0);

  const [phase, setPhase] = useState<Phase>({ t: "answering" });
  const [showGrammar, setShowGrammar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState(""); // current typed answer / vocab form
  const [submitted, setSubmitted] = useState(""); // the answer the student submitted
  const [flash, setFlash] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [mapIndex, setMapIndex] = useState(0);
  const [vocabIndex, setVocabIndex] = useState(0); // cursor in the vocabulary list
  const [draft, setDraft] = useState({ citation: "", gloss: "" }); // the card being edited
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  // The grammar map: families in display order, and the same topics flattened
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
    () => layoutSection(section?.text ?? "", paneWidth),
    [section?.text, paneWidth],
  );
  const readerLines = useMemo(
    () => layoutSection(mapSection?.text ?? "", paneWidth),
    [mapSection?.text, paneWidth],
  );
  // The map's taste of the section under the cursor: the same window for every
  // topic, so browsing shows each one equally and the map does not jump. What
  // varies is the terminal, not the topic — a short one gets a shorter taste
  // rather than a map that runs off the screen.
  const previewLines = Math.max(2, Math.min(PREVIEW_LINES, rows - MAP_CHROME_LINES));
  const mapPreview = useMemo(
    () => previewWindow(mapSection?.text ?? "", paneWidth, previewLines),
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
    () => attemptLines(attempts, paneWidth),
    [attempts, paneWidth],
  );

  // The topic under the map cursor, as its whole question bank.
  const bankLines = useMemo(() => {
    const id = mapTopics[mapIndex]?.sectionId;
    return id ? questionBankLines(session.questionBank(id), paneWidth) : [];
    // `tick` is in here because an answer graded since is part of the bank.
  }, [mapTopics, mapIndex, paneWidth, session, tick]);

  const scheduleAll = useMemo(() => session.upcoming(), [session, tick]);
  const schedLines = useMemo(
    () => scheduleLines(scheduleAll, paneWidth),
    [scheduleAll, paneWidth],
  );

  const vocab = useMemo(() => session.vocabList(), [session, tick]);

  // Whatever the pane is showing, show it from the top.
  useEffect(
    () => setScroll(0),
    [sectionId, showGrammar, showHistory, mapIndex, phase.t],
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

  const advance = () => {
    setFlash(null);
    setShowGrammar(false);
    setShowHistory(false);
    setInput("");
    setSubmitted("");
    const action = session.next();
    if (action.kind === "done") {
      setPhase({ t: "done" });
      return;
    }
    if (action.kind === "vocab-review") {
      setPhase({ t: "vocab-review-front", cardId: action.cardId });
      return;
    }
    const t = session.serveTest(action.sectionId);
    if (!t) {
      session.gradeTopic(action.sectionId, 3);
      advance();
      return;
    }
    setSectionId(action.sectionId);
    setTest(t);
    setQIndex(0);
    setIsNewTopic(action.kind === "new-topic");
    setShowGrammar(action.kind === "new-topic"); // teach first on a new topic
    setPhase({ t: "answering" });
    setTick((n) => n + 1);
  };

  const loadPlacement = (i: number, list: string[]) => {
    const id = list[i]!;
    const t = session.serveTest(id);
    if (!t) {
      // no test for this topic — skip it
      if (i + 1 < list.length) return loadPlacement(i + 1, list);
      session.endPlacement();
      setInPlacement(false);
      advance();
      return;
    }
    setSectionId(id);
    setTest(t);
    setQIndex(0);
    setInput("");
    setSubmitted("");
    setShowGrammar(false);
    setShowHistory(false);
    setIsNewTopic(false);
    setPhase({ t: "answering" });
    setTick((n) => n + 1);
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The whole dictionary is in memory here, so this is the cheapest place to
    // bring cards saved against older citations up to the shipped ones.
    if (session.refreshCitations() > 0) save();
    if (session.needsPlacement()) {
      // A run already under way is resumed where it stopped; only a fresh deck
      // starts one. Without this, a placement interrupted by closing the
      // terminal is simply lost — and study restarts at chapter one.
      const run = session.placementState() ?? session.beginPlacement();
      if (run.topics.length > 0) {
        setInPlacement(true);
        setPlacementList(run.topics);
        setPlacementIndex(run.index);
        loadPlacement(run.index, run.topics);
        return;
      }
      session.endPlacement();
    }
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAnswer = (value: string) => {
    setSubmitted(value);
    setPhase({ t: "graded" });
  };

  const placementGrade = (rating: Rating) => {
    if (!sectionId) return;
    if (rating >= 3) {
      session.passPlacement(sectionId);
      save();
      const ni = placementIndex + 1;
      if (ni < placementList.length) {
        setPlacementIndex(ni);
        session.advancePlacement(ni);
        save();
        loadPlacement(ni, placementList);
        return;
      }
    }
    // failed (1–2) or passed the last probe — placement is done
    session.endPlacement();
    save();
    setInPlacement(false);
    advance();
  };

  /** Everything a grade is about to overwrite, so it can be put back. */
  const takeUndo = (from: Phase): GradeUndo => ({
    progress: session.snapshot(),
    phase: from,
    sectionId,
    test,
    qIndex,
    submitted,
    isNewTopic,
    inPlacement,
    placementIndex,
  });

  const gradeAndContinue = (rating: Rating) => {
    // Taken before anything is written, so the undo covers the recorded answer
    // as well as the schedule — re-grading then leaves one attempt, not two.
    setUndo(takeUndo({ t: "graded" }));
    // Kept before the grade is applied, so it covers placement too: what you
    // wrote on a topic is worth having whichever pass it was written in.
    if (sectionId && question) {
      session.recordAttempt(sectionId, {
        prompt: question.prompt,
        answer: question.answer,
        submitted: submitted.trim(),
        rating,
      });
    }
    if (inPlacement) return placementGrade(rating);
    if (!sectionId) return;
    session.gradeTopic(sectionId, rating);
    save();
    setTick((n) => n + 1);
    if (test && qIndex + 1 < test.questions.length) {
      setQIndex(qIndex + 1);
      setShowGrammar(false);
      setShowHistory(false);
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
   * schedule, mastery, attempt trail, placement position.
   */
  const undoGrade = () => {
    if (!undo) return;
    session.restore(undo.progress);
    save();
    setSectionId(undo.sectionId);
    setTest(undo.test);
    setQIndex(undo.qIndex);
    setSubmitted(undo.submitted);
    setIsNewTopic(undo.isNewTopic);
    setInPlacement(undo.inPlacement);
    setPlacementIndex(undo.placementIndex);
    setInput("");
    setShowGrammar(false);
    setShowHistory(false);
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
    if (candidates.length === 1) {
      session.recordVocab(candidates[0]!);
      save();
      // The word count in the status bar, and the vocabulary list itself, are
      // derived from the engine on every tick — so a new card has to bump it.
      setTick((n) => n + 1);
      setFlash(`Saved: ${candidates[0]!.citation}`);
      setPhase({ t: "graded" });
      return;
    }
    setPhase({ t: "vocab-pick", form, candidates });
  };

  /** Open the grammar map, parked on the current topic (or the first unstudied one). */
  const openMap = (from: "graded" | "done") => {
    let i = mapTopics.findIndex((t) => t.sectionId === sectionId);
    if (i < 0) i = mapTopics.findIndex((t) => t.mastery === undefined);
    setMapIndex(i < 0 ? 0 : i);
    setFlash(null);
    setPhase({ t: "map", from });
  };

  /** Open the schedule of what is coming back. */
  const openSchedule = (from: Origin | "map") => {
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

  /** Serve a test on the topic under the cursor and quiz it right now. */
  const quizSelected = () => {
    const target = mapTopics[mapIndex];
    if (!target) return;
    const t = session.serveTest(target.sectionId);
    if (!t) {
      setFlash(`No tests for “${target.title}” yet.`);
      return;
    }
    save();
    const fresh = target.mastery === undefined;
    setFlash(null);
    setSectionId(target.sectionId);
    setTest(t);
    setQIndex(0);
    setInput("");
    setSubmitted("");
    setIsNewTopic(fresh);
    setShowGrammar(fresh); // teach the rule first when it's new ground
    setShowHistory(false);
    setPhase({ t: "answering" });
    setTick((n) => n + 1);
  };

  useInput((ch, key) => {
    // While typing (answering / vocab-input) the TextInput owns the keys —
    // except the arrows, which it ignores, so they can page the drawer.
    if (phase.t === "answering") {
      if (key.escape) setShowGrammar((s) => !s); // peek at grammar mid-answer
      // ^Z rather than a letter: every letter here goes into the answer. It
      // reaches back past this question to the grade that opened it.
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

    if (ch === "q") {
      save();
      exit();
      return;
    }

    switch (phase.t) {
      case "graded": {
        if (showGrammar && handleScrollKey(key, drawerLines.length, drawerHeight)) break;
        if (showHistory && handleScrollKey(key, historyLines.length, drawerHeight)) break;
        if (ch >= "1" && ch <= "4") gradeAndContinue(Number(ch) as Rating);
        // The two panes share the screen with the question: opening one closes
        // the other rather than squeezing both.
        else if (ch === "g") {
          setShowHistory(false);
          setShowGrammar((s) => !s);
        } else if (ch === "h" && attempts.length > 0) {
          setShowGrammar(false);
          setShowHistory((s) => !s);
        } else if (ch === "m" && !inPlacement) openMap("graded");
        else if (ch === "s") openSchedule("graded");
        else if (ch === "V") openVocabList("graded");
        else if (ch === "u") undoSubmit(); // Enter came too early
        else if (ch === "v") {
          setInput("");
          setPhase({ t: "vocab-input" });
        }
        break;
      }
      case "map": {
        if (key.leftArrow) setMapIndex((i) => Math.max(0, i - 1));
        else if (key.rightArrow)
          setMapIndex((i) => Math.min(mapTopics.length - 1, i + 1));
        else if (key.upArrow) jumpFamily(-1);
        else if (key.downArrow) jumpFamily(1);
        else if (key.return) quizSelected();
        else if (ch === "g") setPhase({ t: "read", from: phase.from });
        else if (ch === "a") setPhase({ t: "bank", from: phase.from });
        else if (ch === "s") openSchedule("map");
        else if (key.escape || ch === "m") setPhase({ t: phase.from });
        break;
      }
      case "read": {
        if (handleScrollKey(key, readerLines.length, readerHeight)) break;
        if (key.escape || ch === "g" || ch === "m") setPhase({ t: "map", from: phase.from });
        break;
      }
      case "bank": {
        if (handleScrollKey(key, bankLines.length, readerHeight)) break;
        if (key.escape || ch === "a" || ch === "m") {
          setPhase({ t: "map", from: phase.from });
        }
        break;
      }
      case "schedule": {
        if (handleScrollKey(key, schedLines.length, readerHeight)) break;
        if (key.escape || ch === "s") {
          setPhase(phase.from === "map" ? { t: "map", from: "graded" } : { t: phase.from });
        }
        break;
      }
      case "vocab-list": {
        if (vocab.length === 0) {
          if (key.escape || ch === "V") setPhase({ t: phase.from });
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
        } else if (key.escape || ch === "V") {
          setConfirmDelete(false);
          setFlash(null);
          setPhase({ t: phase.from });
        }
        break;
      }
      case "vocab-pick": {
        if (ch >= "1" && ch <= String(Math.min(9, phase.candidates.length))) {
          const chosen = phase.candidates[Number(ch) - 1];
          if (chosen) {
            session.recordVocab(chosen);
            save();
            setTick((n) => n + 1);
            setFlash(`Saved: ${chosen.citation}`);
          }
          setPhase({ t: "graded" });
        } else if (key.escape) {
          setPhase({ t: "graded" });
        }
        break;
      }
      case "vocab-review-front": {
        if (key.return || ch === " ")
          setPhase({ t: "vocab-review-back", cardId: phase.cardId });
        // A grade can advance straight into a vocabulary card; the way back to
        // it has to be here too.
        else if (ch === "u") undoGrade();
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
        break;
      }
      case "done": {
        if (ch === "m") openMap("done");
        else if (ch === "s") openSchedule("done");
        else if (ch === "V") openVocabList("done");
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

  return (
    <Box flexDirection="column" paddingX={1}>
      <StatusBar
        stats={stats}
        section={
          inPlacement
            ? `Placement ${placementIndex + 1}/${placementList.length}`
            : section?.title ?? "—"
        }
        isNew={isNewTopic && !phase.t.startsWith("vocab-review")}
        placement={inPlacement}
      />

      {inPlacement && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Placement — translate as far as you can. Grade 3–4 if you knew it, 1–2 to start there.
          </Text>
        </Box>
      )}

      {phase.t === "map" && mapTopics[mapIndex] && (
        <GrammarMap
          families={families}
          cursor={mapIndex}
          overall={overall}
          topic={mapTopics[mapIndex]!}
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
          heading={`All questions on ${mapSection.title} — ${
            content.questionsFor(mapSection.id).length
          }, with your answers`}
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
        <VocabList cards={vocab} cursor={vocabIndex} height={readerHeight} />
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

      {(phase.t === "answering" || phase.t === "graded") && question && (
        <QuestionView
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
        <VocabReview card={session.vocabCard(phase.cardId)} reveal={phase.t === "vocab-review-back"} />
      )}

      {phase.t === "done" && (
        <Box marginTop={1}>
          <Text color="green">
            ✓ Nothing due right now. Well done — press m to explore the grammar map, or Enter to
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
        phase={phase.t}
        placement={inPlacement}
        paging={
          (showGrammar && drawerLines.length > drawerHeight) ||
          (showHistory && historyLines.length > drawerHeight)
        }
        history={attempts.length > 0}
        undo={undo !== null}
      />
    </Box>
  );
}

function StatusBar({
  stats,
  section,
  isNew,
  placement,
}: {
  stats: { dueTopics: number; dueVocab: number; topics: number; vocab: number };
  section: string;
  isNew: boolean;
  placement?: boolean;
}) {
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Text>
        <Text color="magenta" bold>
          Latina
        </Text>{" "}
        · {isNew ? <Text color="green">new: </Text> : null}
        <Text bold color={placement ? "yellow" : undefined}>
          {section}
        </Text>
      </Text>
      <Text dimColor>
        topics {stats.topics} (due {stats.dueTopics}) · vocab {stats.vocab} (due {stats.dueVocab})
      </Text>
    </Box>
  );
}

// --- grammar map ------------------------------------------------------------

/** Mastery as a 0–1 fraction; an ungraded topic reads as 0. */
function masteryFraction(t: TopicProgress): number {
  return ((t.mastery ?? 1) - 1) / 3;
}

/** One cell of a bar: how far along the topic is, at a glance. */
function cellStyle(t: TopicProgress): { glyph: string; color: string; dim: boolean } {
  if (t.mastery === undefined) return { glyph: "░", color: "gray", dim: true };
  const level = Math.floor(t.mastery);
  if (level >= 4) return { glyph: "█", color: "green", dim: t.assumed };
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
 */
function FamilyList({
  families,
  selected,
  cursorInFamily,
}: {
  families: FamilyProgress[];
  selected: string;
  cursorInFamily: number;
}) {
  const width = Math.max(...families.map((f) => f.label.length));
  return (
    <Box flexDirection="column">
      {families.map((f) => {
        // The whole line is styled when selected, not the name alone: a
        // highlight on the first column only reads as half-applied.
        const on = f.id === selected;
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
                {summaryGlyphs(f.percent)}
              </Text>
              <Text bold={on} color={on ? "cyan" : undefined} dimColor={!on}>
                {` ${String(Math.round(f.percent * 100)).padStart(3)}%  ${String(f.topics.length).padStart(2)} topic${f.topics.length === 1 ? "" : "s"}`}
              </Text>
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
  preview,
}: {
  families: FamilyProgress[];
  cursor: number;
  overall: number;
  topic: TopicProgress;
  /** The same count of pre-wrapped lines for every topic, and whether more follows. */
  preview: { lines: string[]; truncated: boolean };
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
      : `${Math.round(masteryFraction(topic) * 100)}% mastered${topic.assumed ? " (assumed)" : ""}`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="magenta">
          Grammar map
        </Text>
        <Text dimColor>{Math.round(overall * 100)}% mastered overall</Text>
      </Box>

      {/* The selected family needs no separate heading line: it is the
          highlighted line of the list, with its bar under its own name. */}
      <FamilyList
        families={families}
        selected={selected.id}
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
          {topic.due ? <Text color="yellow"> · due</Text> : null}
          {!topic.hasTests ? <Text dimColor> · no tests</Text> : null}
        </Text>
      </Box>
      {/* Pre-wrapped and padded to a fixed height: every topic shows the same
          amount of its section, and the box below does not shift as the cursor
          moves. `g` opens the whole section in the reader. */}
      {preview.lines.map((line, i) => (
        <Text key={i}>{line === "" ? " " : line}</Text>
      ))}
      <Text dimColor>
        {preview.truncated ? `press g to read § ${topic.ref} in full` : `all of § ${topic.ref}`}
      </Text>
    </Box>
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
  lines: string[];
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
        <Text key={scroll + i}>{line === "" ? " " : line}</Text>
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
}: {
  cards: VocabCardState[];
  cursor: number;
  height: number;
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
        {cursor + 1} of {cards.length}
      </Text>
      {visible.map((card) => {
        const on = cards[cursor]?.id === card.id;
        const due = new Date(card.fsrs.due).getTime();
        return (
          <Box key={card.id}>
            <Text color={on ? "cyan" : undefined} bold={on}>
              {`${on ? "▸ " : "  "}${card.citation}`}
            </Text>
            <Text dimColor>{`  ${card.gloss}`}</Text>
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
  question,
  index,
  total,
  graded,
  submitted,
  input,
  onChange,
  onSubmit,
}: {
  question: Question;
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
        Translate into Latin · {index + 1}/{total}
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
            placeholder="type your Latin, then Enter…"
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
        </Box>
      )}
    </Box>
  );
}

function VocabReview({
  card,
  reveal,
}: {
  card: { citation: string; gloss: string } | undefined;
  reveal: boolean;
}) {
  if (!card) return null;
  // English on the front: the student produces the Latin, as everywhere else.
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Vocabulary review · say it in Latin</Text>
      <Box marginTop={1}>
        <Text bold>{card.gloss}</Text>
      </Box>
      {reveal && (
        <Box marginTop={1}>
          <Text color="magenta" bold>
            → {card.citation}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function HintBar({
  phase,
  placement,
  paging,
  history,
  undo,
}: {
  phase: Phase["t"];
  placement?: boolean;
  /** An open pane has more lines than fit. */
  paging?: boolean;
  /** There is something in the topic's answer trail to show. */
  history?: boolean;
  /** A grade was just given and can still be taken back. */
  undo?: boolean;
}) {
  const scrollHint = paging ? " · ↑↓ scroll" : "";
  // Only offered once the topic has a trail: `h` does nothing before that.
  const historyHint = history ? " · h earlier" : "";
  // Offered only while there is a grade to take back, on every screen a grade
  // can land you on.
  const undoHint = undo ? " · u undo grade" : "";
  const hint =
    phase === "answering"
      ? `type your Latin · Enter submit · Esc grammar${undo ? " · ^Z undo grade" : ""}${scrollHint}`
      : phase === "map"
        ? "← → topic · ↑ ↓ family · g read section · a all questions · s schedule · Enter quiz me · Esc close"
        : phase === "read"
          ? "↑ ↓ scroll · PgUp/PgDn page · Esc back to map · q quit"
        : phase === "bank"
          ? "↑ ↓ scroll · PgUp/PgDn page · Esc back to map · q quit"
        : phase === "schedule"
          ? "↑ ↓ scroll · PgUp/PgDn page · Esc close · q quit"
        : phase === "vocab-list"
          ? "↑ ↓ word · Enter edit · x delete · Esc close · q quit"
        : phase === "vocab-edit"
          ? "type · Tab switch field · Enter save · Esc cancel"
        : phase === "graded"
        ? placement
          ? "3–4 you knew it (continue) · 1–2 start here · u keep typing · v vocab"
          : `1–4 self-grade (1 again · 4 easy) · u keep typing · v vocab · V words · g grammar${historyHint}${scrollHint} · m map · s schedule · q quit`
        : phase === "vocab-review-front"
          ? `Space/Enter reveal${undoHint} · q quit`
          : phase === "vocab-review-back"
            ? `1–4 self-grade${undoHint} · q quit`
            : phase === "vocab-input"
              ? "Enter to look up the word · Esc cancel"
              : phase === "vocab-pick"
                ? "1–9 choose · Esc cancel"
                : `m grammar map · s schedule · V words${undoHint} · Enter exit`;
  return (
    <Box marginTop={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
