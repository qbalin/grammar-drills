import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Content,
  Session,
  questionVocabulary,
  type AttemptMarks,
  type LemmaEntry,
  type Progress,
  type Rating,
  type RoundVia,
  type Test,
  type TopicProgress,
  type VocabWord,
} from "@lang-tutor/core";
import { dictionaryReady, loadDictionary } from "./content-loader.js";
import { useConfetti } from "./confetti/Confetti.js";
import { profile } from "./pack.js";
import type { SyncState, SyncConfig } from "./storage/sync.js";
import { SyncingStorage } from "./storage/sync.js";
import {
  exportProgress,
  importProgress,
  pickProgressFile,
} from "./storage/transfer.js";
import { Sheet, Toast, ago, cycleEmphasis } from "./ui.js";
import { Answering, Graded, Rest, VocabReview } from "./screens/Study.js";
import { GrammarSheet } from "./screens/Grammar.js";
import {
  AttemptTrail,
  EarlierAnswers,
  MapSheet,
  TopicSheet,
} from "./screens/Map.js";
import { QuestionSheet, QuestionsSheet } from "./screens/Questions.js";
import { ScheduleSheet } from "./screens/Schedule.js";
import { SettingsSheet } from "./screens/Settings.js";
import { QuestionVocabulary } from "./screens/Vocabulary.js";
import {
  VocabEditSheet,
  VocabListSheet,
  VocabNewSheet,
  VocabPickSheet,
  VocabSheet,
} from "./screens/Vocab.js";

/**
 * The quiz loop, ported from `apps/cli/src/app.tsx`.
 *
 * The state machine is the CLI's — placement, answer, compare, grade, advance —
 * with two changes the medium forces. Its single `Phase` union splits in two:
 * a `Phase` for where the loop is, and an `Overlay` for what is layered over
 * it, because a sheet on a phone covers the question rather than replacing it.
 * And the CLI's key handling becomes buttons.
 */

type Phase =
  | { t: "answering" }
  | { t: "graded"; revealed: boolean }
  | { t: "vocab-review"; cardId: string; revealed: boolean }
  | { t: "done" };

/**
 * Everything needed to put the last grade back: the engine's state before it
 * was applied, and the screen it was given on. A grade is one tap and it
 * schedules a topic for months, so the most recent one is always takeable.
 */
interface GradeUndo {
  progress: Progress;
  phase: Phase;
  sectionId: string | null;
  test: Test | null;
  qIndex: number;
  submitted: string;
  marks: AttemptMarks;
  via: RoundVia | null;
  inPlacement: boolean;
}

type Overlay =
  | null
  | { t: "grammar"; sectionId: string; back?: Overlay }
  | { t: "map" }
  | { t: "topic"; sectionId: string; back?: Overlay }
  | { t: "attempts"; sectionId: string }
  | { t: "questions"; sectionId: string }
  | { t: "question"; sectionId: string; prompt: string }
  | { t: "schedule" }
  | { t: "vocab-list"; back?: Overlay }
  | { t: "vocab-edit"; cardId: string; back?: Overlay }
  /** `prefill` is a word held on the question; `auto` looks it up unattended. */
  | { t: "vocab-input"; prefill?: string; auto?: boolean }
  | { t: "vocab-pick"; form: string; candidates: LemmaEntry[] }
  /** A word the dictionary has not got, being written out by hand. */
  | { t: "vocab-new"; form: string }
  | { t: "settings" }
  | { t: "conflict"; remote: Progress };

/** Whether anything at all has been picked out, across the three texts. */
function hasMarks(marks: AttemptMarks): boolean {
  return Object.values(marks).some((m) => m && Object.keys(m).length > 0);
}

/** A toast, with the one action that undoes what it is announcing. */
interface Flash {
  message: string;
  action?: string;
  onAction?: () => void;
}

interface Props {
  content: Content;
  session: Session;
  storage: SyncingStorage;
}

/**
 * How long the floppy lingers once the push is done — long enough for a push
 * that took milliseconds to have been seen at all, short enough that it is gone
 * before the next answer. Matches the `.floppy--out` fade in the stylesheet.
 */
const FLOPPY_FADE_MS = 700;

/** Placement asks whether you already knew it, not how it felt. */
const PLACEMENT_LABELS: Record<Rating, string> = {
  1: "No idea",
  2: "Shaky",
  3: "Knew it",
  4: "Easily",
};

export function App({ content, session, storage }: Props) {
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [qIndex, setQIndex] = useState(0);
  // Why the round on the table was served, which is the only thing the screen
  // cannot work out for itself. `next` says it once and would forget it; the
  // round carries it across a reload.
  const [via, setVia] = useState<RoundVia | null>(null);

  // The run itself lives in progress — which probe, which family, what has
  // passed — so this is only whether the loop is driving it.
  const [inPlacement, setInPlacement] = useState(false);

  const [phase, setPhase] = useState<Phase>({ t: "answering" });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");
  // What has been picked out on the question in hand. It rides here rather
  // than in the trail because the attempt it belongs to has not been recorded
  // yet: the grade is what writes it.
  const [marks, setMarks] = useState<AttemptMarks>({});
  const [marking, setMarking] = useState(false);
  const [toast, setToast] = useState<Flash | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictFailed, setDictFailed] = useState(false);
  const [showVocab, setShowVocab] = useState(false); // the question's word list
  const [showTrail, setShowTrail] = useState(false); // this topic's earlier answers
  const [syncState, setSyncState] = useState<SyncState>(storage.currentState());
  const [tick, setTick] = useState(0);
  const [undo, setUndo] = useState<GradeUndo | null>(null); // the last grade, takeable

  const question = test?.questions[qIndex];
  const section = sectionId ? content.getSection(sectionId) : undefined;
  const bump = () => setTick((n) => n + 1);

  const save = useCallback(() => {
    void storage.save(session.progress());
  }, [session, storage]);

  /**
   * Keep the answer in flight on the device.
   *
   * Local only, and not through `save`: this fires as fast as a thumb types,
   * and a keystroke is not something the mirror needs. Placement is left out —
   * it serves one sentence per probe and resumes by probe, so there is no
   * round to hang a draft on.
   */
  const keepDraft = useCallback(() => {
    if (inPlacement || phase.t === "vocab-review" || phase.t === "done") return;
    session.setDraft({
      input,
      ...(phase.t === "graded"
        ? { graded: { submitted, revealed: phase.revealed } }
        : {}),
      ...(hasMarks(marks) ? { marks } : {}),
    });
    storage.saveLocal(session.progress());
  }, [inPlacement, phase, input, submitted, marks, session, storage]);

  // Typing is debounced, because the whole file is rewritten each time. Being
  // hidden is not: on a phone that is the moment the app is taken away, and
  // there may be no later one.
  useEffect(() => {
    const id = setTimeout(keepDraft, 400);
    const onHide = () => {
      if (document.visibilityState === "hidden") keepDraft();
    };
    addEventListener("visibilitychange", onHide);
    addEventListener("pagehide", keepDraft);
    return () => {
      clearTimeout(id);
      removeEventListener("visibilitychange", onHide);
      removeEventListener("pagehide", keepDraft);
    };
  }, [keepDraft]);

  const flash = (message: string, action?: string, onAction?: () => void) =>
    setToast({ message, action, onAction });
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // The book in order, which is what the grammar reader pages through. It is
  // the content rather than the progress, so no tick touches it.
  const sections = useMemo(() => content.sections(), [content]);

  // The engine is mutated in place, so views derive from it on every tick.
  const families = useMemo(() => session.familyProgress(), [session, tick]);
  const overall = useMemo(() => session.overallPercent(), [session, tick]);
  const stats = useMemo(() => session.stats(), [session, tick]);
  const placement = useMemo(
    () => (inPlacement ? session.placementProgress() : undefined),
    [session, tick, inPlacement],
  );
  const focus = useMemo(() => session.focusState(), [session, tick]);
  // What the focus is called on screen, and nothing at all for the sweep.
  //
  // It says what it governs, because it governs less than it looks like it
  // does: a focus steers where *new* topics come from and reviews arrive from
  // wherever they are due, so "on Verb forms" over a first-declension review
  // was a fair reading of a chip that was describing something else entirely.
  const focusLabel = useMemo(() => {
    if (focus.kind === "family") {
      return `new topics from ${content.familyLabel(content.familyOf(focus.id))}`;
    }
    if (focus.kind === "topic") {
      const { answered, total } = session.coverage(focus.sectionId);
      const title = content.getSection(focus.sectionId)?.title ?? "this topic";
      return `staying on ${title} · ${answered}/${total}`;
    }
    return null;
  }, [focus, session, tick, content]);
  const exploring = useMemo(() => session.exploring(), [session, tick]);
  const held = useMemo(() => session.exploringHeld(), [session, tick]);
  // Whether there is anything left to explore towards: a topic never graded
  // that has questions to ask. Read off the family bars, which are computed
  // for the map anyway.
  const newGround = useMemo(
    () => families.some((f) => f.topics.some((t) => t.mastery === undefined && t.hasTests)),
    [families],
  );

  // The words behind the question on screen. `dictLoading` is a dependency on
  // purpose: everything looked up before the fetch landed resolved to nothing,
  // and those rows must not be the ones kept.
  const vocabulary = useMemo(
    () => (question ? questionVocabulary(content, question) : []),
    [question, content, dictLoading],
  );
  // One reset covering every way a new question arrives — advancing, grading,
  // quizzing from the map, taking a grade back — rather than one line in each.
  // Submitting is not one of them: that is the same sentence, so a list opened
  // while writing is still open beside the answer.
  useEffect(() => setShowVocab(false), [question?.prompt, sectionId]);
  // The trail folds away on the same terms, and additionally on submitting:
  // it is a thing to consult once the reference answer is up, not a panel to
  // find already open on the next question of the same topic.
  useEffect(() => setShowTrail(false), [question?.prompt, sectionId, phase.t]);
  // Marking ends with the screen it was entered on. What was marked survives —
  // it is in `marks` until the grade writes it — but leaving the mode open
  // would mean a hold that silently does nothing on the next question.
  useEffect(() => setMarking(false), [question?.prompt, sectionId, phase.t]);

  // --- the loop ------------------------------------------------------------

  const advance = useCallback(() => {
    setInput("");
    setSubmitted("");
    setMarks({});
    // Whatever was in flight is behind us by definition — this is the one
    // place study moves on of its own accord.
    session.endRound();
    const action = session.next();
    if (action.kind === "done") {
      setSectionId(null);
      setTest(null);
      setPhase({ t: "done" });
      // Saved on the way out of every branch, not only the one that serves a
      // test: letting go of the round is itself the thing worth writing down.
      save();
      bump();
      return;
    }
    if (action.kind === "vocab-review") {
      // The topic behind us is not what is on screen: a word is. Letting the
      // section stand here is what used to put a grammar title, its reference
      // and a way into its prose above a vocabulary card.
      setVia(null);
      setPhase({ t: "vocab-review", cardId: action.cardId, revealed: false });
      save();
      bump();
      return;
    }
    // A drill is asking for the rest of a topic, so it wants the questions it
    // has not met rather than whichever test the rotation comes to next.
    const served = session.serveTest(
      action.sectionId,
      action.kind === "drill" ? { prefer: "unanswered" } : undefined,
    );
    if (!served) {
      // A topic with no tests cannot be studied; pass it so the scheduler moves
      // on rather than offering it again forever.
      session.gradeTopic(action.sectionId, 3);
      advance();
      return;
    }
    const asked: RoundVia =
      action.kind === "new-topic"
        ? "new"
        : action.kind === "drill"
          ? "drill"
          : "review";
    const isNew = asked === "new";
    setSectionId(action.sectionId);
    setTest(served);
    setQIndex(0);
    setVia(asked);
    setPhase({ t: "answering" });
    // Teach before testing on new ground, exactly as the CLI does.
    setOverlay(isNew ? { t: "grammar", sectionId: action.sectionId } : null);
    // The round is on the table from here, and saved right away: the session
    // this protects against is the one that ends without another grade in it.
    session.beginRound(action.sectionId, served, isNew, asked);
    save();
    bump();
  }, [session, save]);

  const loadPlacement = useCallback(
    (id: string) => {
      const served = session.serveTest(id);
      if (!served) {
        // No test for this probe — take it as unanswered and ask the next.
        const next = session.answerPlacement(false);
        if (next) return loadPlacement(next.probe);
        setInPlacement(false);
        advance();
        return;
      }
      setSectionId(id);
      setTest(served);
      setQIndex(0);
      setInput("");
      setSubmitted("");
      setMarks({});
      setVia(null);
      setOverlay(null);
      setPhase({ t: "answering" });
      bump();
    },
    [advance, session],
  );

  // The net under `removeVocab`, not a substitute for it: a card under review
  // can also vanish because a sync adopted another device's progress. The
  // review body draws nothing for a card the session cannot find, so heal the
  // phase rather than leave an empty screen behind it.
  useEffect(() => {
    if (phase.t === "vocab-review" && !session.vocabCard(phase.cardId)) advance();
  }, [phase, session, advance, tick]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (session.needsPlacement()) {
      // A run already under way is resumed where it stopped; only a fresh deck
      // starts one. Placement is otherwise lost to anything that reloads the
      // page — which on a phone is most ways a session ends.
      const run = session.placementState() ?? session.beginPlacement();
      if (run) {
        setInPlacement(true);
        loadPlacement(run.probe);
        return;
      }
      session.endPlacement();
    }
    // A test on the table is picked back up exactly where it was left. Without
    // this, closing the app on question two of four came back at question one
    // of a different test on a different topic — the first grade had already
    // rescheduled the card, so `next` found nothing due and went looking for
    // new ground. A set is left deliberately, from the map, or not at all.
    const open = session.resumableRound();
    if (open) {
      setSectionId(open.sectionId);
      setTest(open.test);
      setQIndex(open.qIndex);
      setVia(open.via);
      // The badge comes back but the grammar sheet does not: it was opened
      // when the topic was served, and being taught the same section again on
      // every reload is not teaching.
      setInput(open.draft?.input ?? "");
      const graded = open.draft?.graded;
      setSubmitted(graded?.submitted ?? "");
      setMarks(open.draft?.marks ?? {});
      setPhase(
        graded ? { t: "graded", revealed: graded.revealed } : { t: "answering" },
      );
      bump();
      return;
    }
    advance();
  }, [advance, loadPlacement, session]);

  // Notice progress from another device, and ask rather than pick a winner.
  useEffect(() => {
    if (!storage.currentConfig()) return;
    void storage
      .fetchRemote()
      .then((remote) => {
        const local = session.progress();
        if (remote && remote.updatedAt > local.updatedAt) {
          setOverlay({ t: "conflict", remote });
        }
      })
      .catch(() => {
        /* reported through the sync state in Settings */
      });
  }, [session, storage]);

  /**
   * The reward. It comes at the end of a round of questions rather than on a
   * count of answers: a burst that arrives mid-topic interrupts, and one that
   * arrives as the last question of a test is graded marks something the
   * student actually finished.
   */
  const { canvas: confettiCanvas, fire: fireConfetti } = useConfetti();

  /**
   * A probe answered. Failing settles that one family and moves to the next
   * rather than ending the test — knowing the declensions and not the verbs is
   * a thing the placement has to be able to hear.
   */
  const placementGrade = (rating: Rating) => {
    if (!sectionId) return;
    const next = session.answerPlacement(rating >= 3);
    save();
    if (next) {
      loadPlacement(next.probe);
      return;
    }
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
    marks,
    via,
    inPlacement,
  });

  /**
   * Take back the grade just given: the question comes back as it was left,
   * and the engine returns to the state it was in before — schedule, mastery,
   * attempt trail, placement position.
   */
  const undoGrade = () => {
    if (!undo) return;
    navigator.vibrate?.(8);
    session.restore(undo.progress);
    save();
    setSectionId(undo.sectionId);
    setTest(undo.test);
    setQIndex(undo.qIndex);
    setSubmitted(undo.submitted);
    // The words picked out come back with the sentence they were picked out
    // of: re-grading should not cost the student the marking they just did.
    setMarks(undo.marks);
    setVia(undo.via);
    setInPlacement(undo.inPlacement);
    setInput("");
    setOverlay(null);
    setUndo(null); // one step back, no further
    setPhase(undo.phase);
    flash("Grade taken back — grade it again.");
    bump();
  };

  /** Back to the answer box: Submit (or Reveal) came too early. */
  const resumeWriting = () => {
    // The box keeps what was typed; after an undo it is empty and the answer
    // is in `submitted`.
    setInput((v) => v || submitted);
    setPhase({ t: "answering" });
  };

  const grade = (rating: Rating) => {
    // A small confirmation that the tap landed, where the hardware offers one.
    navigator.vibrate?.(8);
    // Taken before anything is written, so the undo covers the recorded answer
    // as well as the schedule — re-grading then leaves one attempt, not two.
    setUndo(takeUndo(phase));
    // Kept before the grade is applied, so it covers placement too: what you
    // wrote on a topic is worth having whichever pass it was written in. The
    // CLI has always done this; the web app used to return first and lose it.
    if (sectionId && question) {
      session.recordAttempt(sectionId, {
        prompt: question.prompt,
        answer: question.answer,
        submitted,
        rating,
        // Only when there is something to keep, so an unmarked attempt reads
        // on disk exactly as it did before marking existed.
        ...(hasMarks(marks) ? { marks } : {}),
      });
    }
    if (inPlacement) return placementGrade(rating);
    if (!sectionId || !question) return;
    // The test's id names the round, so its four questions cost the topic one
    // review rather than four — graded by the worst of them.
    session.gradeTopic(sectionId, rating, new Date(), test?.id);
    save();
    if (test && qIndex + 1 < test.questions.length) {
      setQIndex(qIndex + 1);
      setInput("");
      setSubmitted("");
      setMarks({});
      setOverlay(null);
      setPhase({ t: "answering" });
      bump();
    } else {
      // The round is done. Fired on the last question whatever it was graded:
      // the student who pressed "again" four times is the one working hardest,
      // and this is for finishing, not for being right.
      fireConfetti();
      advance();
    }
  };

  const gradeVocab = (cardId: string, rating: Rating) => {
    navigator.vibrate?.(8);
    setUndo(takeUndo(phase));
    session.gradeVocab(cardId, rating);
    save();
    advance();
  };

  /** Serve a test on any topic, now — the reason the map is worth having. */
  const quizTopic = (topic: TopicProgress) => {
    const served = session.serveTest(topic.sectionId);
    if (!served) return flash(`No tests written for “${topic.title}” yet.`);
    // Choosing a topic from the map is the deliberate way out of a round, and
    // the only one: this is what replaces whatever was on the table.
    // New to the student and asked for off the map are both true of a topic
    // never studied: the first decides whether to teach it first, the second is
    // what the badge says, and collapsing them would lose one or the other.
    session.beginRound(
      topic.sectionId,
      served,
      topic.mastery === undefined,
      "quiz",
    );
    save();
    setSectionId(topic.sectionId);
    setTest(served);
    setQIndex(0);
    setInput("");
    setSubmitted("");
    setMarks({});
    setVia("quiz");
    setPhase({ t: "answering" });
    setOverlay(
      topic.mastery === undefined
        ? { t: "grammar", sectionId: topic.sectionId }
        : null,
    );
    bump();
  };

  /**
   * Take the syllabus up from a chosen topic: its family resumes there and
   * becomes what new topics are drawn from.
   *
   * "Quiz me" is a look ahead and leaves nothing behind on purpose. This is the
   * other thing the map is for, and the one that used to be impossible:
   * knowing your declensions and wanting to start at the verbs, rather than
   * being handed chapter one again after every jump.
   */
  const studyFrom = (topic: TopicProgress) => {
    session.studyFrom(topic.sectionId);
    if (inPlacement) {
      session.endPlacement();
      setInPlacement(false);
    }
    save();
    setOverlay(null);
    advance();
    flash(`Studying from “${topic.title}”.`);
  };

  /**
   * Set the backlog aside and go and learn something, or pick it back up.
   *
   * Mid-round the questions on the table were asked and are not thrown away —
   * the switch takes over when the round ends, the same rule the drill follows.
   * Anywhere else there is nothing to finish, so it takes effect at once.
   */
  const holdReviews = (on: boolean) => {
    session.setExploring(on);
    // Read after the switch: until it is thrown, nothing is being held.
    const waiting = session.exploringHeld();
    save();
    const midRound =
      test !== null && (phase.t === "answering" || phase.t === "graded");
    if (midRound) bump();
    else advance();
    flash(
      on
        ? midRound
          ? "Reviews set aside — new ground after this round."
          : `Reviews set aside. ${waiting} waiting.`
        : midRound
          ? "Back to the reviews after this round."
          : "Back to the reviews.",
    );
  };

  /**
   * Stay on a topic and work the rest of its questions. Four questions do not
   * sweep a bank of twenty-odd, so doing well on a test and being moved
   * straight on is not the same as having the topic.
   */
  const drillTopic = (topic: TopicProgress) => {
    const { answered, total } = session.coverage(topic.sectionId);
    if (answered >= total) {
      return flash(`Every question on “${topic.title}” has been answered.`);
    }
    session.drillTopic(topic.sectionId);
    save();
    setOverlay(null);
    // Mid-round the questions on the table were asked and are not thrown away;
    // the drill takes over when the round ends.
    if (topic.sectionId !== sectionId) advance();
    else bump();
    flash(`Staying on “${topic.title}” — ${total - answered} more to go.`);
  };

  // --- vocabulary ----------------------------------------------------------

  /** Fetch the dictionary if this device has not got it yet. */
  const ensureDictionary = useCallback(() => {
    if (dictionaryReady()) return;
    setDictLoading(true);
    void loadDictionary()
      // Remembered rather than only flashed: with no dictionary a lookup would
      // come back empty, and "no match" would blame the student's spelling for
      // a download that never happened.
      .then(() => {
        setDictFailed(false);
        // The moment a dictionary is in memory is the only moment cards saved
        // against an older one can be brought up to its citations.
        if (session.refreshCitations() > 0) {
          save();
          bump();
        }
      })
      .catch(() => setDictFailed(true))
      .finally(() => setDictLoading(false));
  }, [save, session]);

  const openVocab = (prefill?: string, auto = false) => {
    setOverlay({ t: "vocab-input", prefill, auto });
    ensureDictionary();
  };

  /**
   * Show or hide the words behind the question.
   *
   * The dictionary is ~930 KB and is fetched only when something asks for it —
   * an explicit open, never a prefetch, because most questions are answered
   * without ever wanting this.
   */
  const toggleVocab = () => {
    if (!showVocab) ensureDictionary();
    setShowVocab((open) => !open);
  };

  /**
   * Asks `dictionaryReady()` rather than reading `dictFailed`, which is false
   * until a fetch has actually failed — so a device that has never fetched at
   * all would otherwise be reported as ready and every word as unknown.
   */
  const dictStatus = dictLoading
    ? "loading"
    : dictionaryReady()
      ? "ready"
      : "unavailable";

  const lookupWord = (form: string) => {
    const candidates = content.lookup(form);
    if (candidates.length === 0) {
      // Not a verdict on the spelling: the dictionary is large but finite, and
      // a miss is most often a name or a form it cannot cut. The student has
      // already said this word is worth keeping, so the card is offered by hand
      // rather than the word being dropped with a toast.
      setOverlay({ t: "vocab-new", form: form.trim() });
      return;
    }
    if (candidates.length === 1) return saveWord(candidates[0]!);
    setOverlay({ t: "vocab-pick", form: form.trim(), candidates });
  };

  /**
   * A word held down in the answer or the reference. The gesture is cheap, so
   * the way back has to be cheap too: the toast that confirms the save is also
   * the way into the card, where it can be corrected or deleted.
   */
  const holdWord = (word: string) => {
    if (dictionaryReady()) return lookupWord(word);
    // Nothing to look up against yet — the sheet takes the word and fetches.
    openVocab(word, true);
  };

  /**
   * A word tapped while marking the question in hand.
   *
   * It only reaches the file when the grade does — the attempt does not exist
   * until then, and a mark has nowhere to live without one. Which is also why
   * marking is offered before grading rather than after: this is the screen
   * where you can see what you got wrong.
   */
  const markHere = (field: keyof AttemptMarks, index: number) =>
    setMarks((was) => {
      const of = was[field] ?? {};
      const next = cycleEmphasis(of[index]);
      const { [index]: _cleared, ...rest } = of;
      return { ...was, [field]: next ? { ...rest, [index]: next } : rest };
    });

  /**
   * A word tapped in the trail, on an attempt already on the record — the only
   * way an answer written before marking existed ever gets any.
   *
   * Curried by section because all four surfaces that show a trail have their
   * own, and an attempt is found within one.
   */
  const markPast = (id: string) => (at: string, next: AttemptMarks) => {
    session.markAttempt(id, at, next);
    save();
    bump();
  };

  /**
   * A row held down in the vocabulary crib.
   *
   * The crib has already done the lookup — that is what it is showing — so the
   * entry it found is the one to save, and no pick sheet is needed even for a
   * form several words share: the row names one of them, and it is the one on
   * screen. A row with nothing found falls back to the ordinary hold, which
   * either says so or fetches the dictionary the row is missing.
   */
  const holdCribWord = (word: VocabWord) =>
    word.entry ? saveWord(word.entry) : holdWord(word.form);

  const saveWord = (entry: LemmaEntry) => {
    const id = session.recordVocab(entry);
    save();
    setOverlay(null);
    flash(`Saved ${entry.citation}`, "Edit", () =>
      setOverlay({ t: "vocab-edit", cardId: id }),
    );
    bump();
  };

  const editVocab = (cardId: string, patch: { citation: string; gloss: string }) => {
    session.updateVocab(cardId, patch);
    save();
    bump();
  };

  const removeVocab = (cardId: string) => {
    session.deleteVocab(cardId);
    save();
    flash("Word deleted.");
    // Deleting the card that is being reviewed leaves the phase pointing at
    // something the session no longer has, and the review body renders nothing
    // for a card it cannot find — an empty screen with no grade bar and no way
    // on. Grading advances the loop; deleting has to as well.
    if (phase.t === "vocab-review" && phase.cardId === cardId) advance();
    else bump();
  };

  // --- settings ------------------------------------------------------------

  useEffect(() => storage.onStateChange(setSyncState), [storage]);

  /**
   * The floppy disk: a push to the cloud, shown while it happens and for a
   * moment after.
   *
   * Sync is deliberately silent — it is debounced, it retries, and a failure is
   * reported in Settings rather than interrupting the question. But silent also
   * meant invisible, and a student who has just connected a repo has no way to
   * see that anything ever leaves the device. This is that reassurance and
   * nothing more: it appears, it goes, it is never in the way and never takes a
   * tap. The failure it does not report is still Settings' to report.
   *
   * Two stages, so leaving is a fade rather than a disappearance — an element
   * that unmounts cannot animate its own exit.
   */
  const [floppy, setFloppy] = useState<"in" | "out" | null>(null);
  useEffect(() => {
    if (syncState.kind === "pushing") {
      setFloppy("in");
      return;
    }
    // The push is over, however it ended. Fade what is showing and then drop
    // it. `floppy` is deliberately not a dependency: the fade is itself a
    // change to it, and re-running here would cancel the timer that is the
    // other half of the fade.
    setFloppy((showing) => (showing === "in" ? "out" : showing));
    const id = setTimeout(() => setFloppy(null), FLOPPY_FADE_MS);
    return () => clearTimeout(id);
  }, [syncState]);

  const configureSync = (cfg: SyncConfig | null) => {
    storage.configure(cfg);
    if (cfg) void storage.saveNow(session.progress()).then(() => flash("Connected to GitHub."));
    else flash("Sync turned off.");
  };

  const adopt = (progress: Progress) => {
    storage.adopt(progress);
    // The engine holds progress by reference, so a swap means a fresh page —
    // and nothing of this one's may be written on the way out, or the draft
    // kept on `pagehide` puts the replaced progress straight back.
    storage.seal();
    location.reload();
  };

  const doImport = async () => {
    const raw = await pickProgressFile();
    if (!raw) return;
    try {
      adopt(importProgress(raw, content));
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const cacheDictionary = () => {
    setDictLoading(true);
    void loadDictionary()
      .then(() => {
        setDictFailed(false);
        if (session.refreshCitations() > 0) {
          save();
          bump();
        }
        flash("Dictionary saved for offline use.");
      })
      .catch(() => {
        setDictFailed(true);
        flash("Could not fetch the dictionary — are you offline?");
      })
      .finally(() => setDictLoading(false));
  };

  // --- render --------------------------------------------------------------

  /**
   * What is on screen and why, in one word. Every state of the loop has one:
   * the badge was the only thing that ever named a mode, it named exactly one
   * of them, and a due review, a drill and a topic picked off the map were left
   * looking identical.
   */
  const mode = inPlacement
    ? "placement"
    : phase.t === "vocab-review"
      ? "vocab"
      : phase.t === "done"
        ? null // nothing is being worked on; the app's own name stands here
        : via;
  const modeLabel: Record<string, string> = {
    placement: "placement",
    review: "review",
    new: "new",
    drill: "drill",
    quiz: "quiz",
    vocab: "vocabulary",
  };

  const schedule = sectionId ? session.previewTopic(sectionId) : undefined;
  // Read on the graded screen, where the grade has not been given yet — so the
  // attempt being made is not among these, and every row is an earlier one.
  const attempts = sectionId ? session.attemptsFor(sectionId) : [];
  const nextDue = session.nextDue();

  return (
    // The mode reaches the stylesheet here: reviewing and exploring are
    // different enough errands to be worth telling apart from across the room,
    // and a colour does that before any word is read.
    <div className="app" data-mode={exploring ? "explore" : (mode ?? "rest")}>
      {/* Two rows, because three tap targets and a count leave a phone-width
          line no room for a title — and Bennett's titles run to
          "Verbs in -io of the Third Conjugation". The topic gets its own line
          and the whole width. */}
      <header className="status">
        <div className="status__row">
          {mode && (
            <span className={`badge badge--${mode}`}>{modeLabel[mode]}</span>
          )}
          {/* The count is the natural way in to the schedule: it is already
              the answer to "how much is waiting", and the sheet is the rest of
              that answer. */}
          <button
            className="status__counts"
            onClick={() => setOverlay({ t: "schedule" })}
            aria-label="What is coming up"
          >
            {exploring
              ? `${held} waiting`
              : stats.dueTopics + stats.dueVocab > 0
                ? `${stats.dueTopics + stats.dueVocab} due`
                : `${stats.vocab} words`}
          </button>
          <span className="status__spacer" />
          {/* Decoration, and hidden from screen readers on purpose: it says
              nothing that is not already in Settings, and announcing every
              push would talk over the question. */}
          {floppy && (
            <span className={`floppy floppy--${floppy}`} aria-hidden="true">
              💾
            </span>
          )}
          {/* Offered only while there is a grade to take back, and on whatever
              screen the grade landed you on. */}
          {undo && (
            <button
              className="iconbtn"
              onClick={undoGrade}
              aria-label="Undo last grade"
            >
              ↺
            </button>
          )}
          <button
            className="iconbtn"
            onClick={() => setOverlay({ t: "map" })}
            aria-label="Grammar index"
          >
            📖
          </button>
          <button
            className="iconbtn"
            onClick={() => setOverlay({ t: "settings" })}
            aria-label="Settings"
          >
            ⋯
          </button>
        </div>
        <div className="status__row">
          {inPlacement && placement ? (
            <span className="status__title">
              Placement · {content.familyLabel(placement.family)}
              {placement.narrowing ? ", narrowing" : ""} · area{" "}
              {placement.done + 1} of {placement.families}
            </span>
          ) : mode === "vocab" ? (
            // A word is on screen, so the topic studied before it is not what
            // this line is about — and its prose is not what a student reaching
            // for help here wants. It says what is being worked on and stops
            // there: the word itself is the answer being graded, and printing
            // it above the gloss would give the card away.
            <span className="status__title">Vocabulary</span>
          ) : section ? (
            // The way in to the grammar while the question is still on screen.
            // The graded view has always had its `§ grammar` link, but the
            // screen you are stuck on is the one you are writing on, and there
            // the topic's name was the only thing to reach for and did nothing.
            <button
              className="status__topic"
              onClick={() =>
                setOverlay({ t: "grammar", sectionId: section.id, back: overlay })
              }
              aria-label={`Read the grammar for ${section.title}`}
            >
              <span className="status__ref">{content.formatRef(section.ref)}</span>
              <span className="status__title">{section.title}</span>
            </button>
          ) : (
            <span className="status__title">{profile.ui.appName}</span>
          )}
        </div>
        {/* The row of standing states, each with its way out beside it: a mode
            you cannot see how to leave is a trap, not a feature. At most one at
            a time — the backlog being held is the louder of the two and takes
            the row, carrying the focus along inside its own label.

            The plain sweep through the book still says nothing: it is not a
            mode. But a review being served, with ground left to explore, is
            the one state that gets a way out without a chip — it is the
            default, and it was also the one nobody could see past. */}
        {!inPlacement && exploring ? (
          <div className="status__row status__focus">
            <span className="badge badge--focus">
              exploring{focusLabel ? ` · ${focusLabel}` : ""}
            </span>
            <button className="linkbtn" onClick={() => holdReviews(false)}>
              back to reviews
            </button>
          </div>
        ) : !inPlacement && focusLabel ? (
          <div className="status__row status__focus">
            <span className="badge badge--focus">{focusLabel}</span>
            <button
              className="linkbtn"
              onClick={() => {
                session.setFocus({ kind: "sweep" });
                save();
                bump();
                flash("Back to the book in order.");
              }}
            >
              back to the book
            </button>
          </div>
        ) : !inPlacement && (mode === "review" || mode === "vocab") && newGround ? (
          <div className="status__row status__focus">
            <button className="linkbtn" onClick={() => holdReviews(true)}>
              set these aside and explore
            </button>
          </div>
        ) : null}
      </header>

      <div className="study">
        {inPlacement && phase.t === "answering" && (
          <p className="eyebrow" style={{ color: "var(--amber)" }}>
            Translate as far as you can — this only finds where to start you.
          </p>
        )}

        {phase.t === "answering" && question && (
          <Answering
            question={question}
            index={inPlacement ? undefined : qIndex}
            total={inPlacement ? undefined : test?.questions.length ?? 0}
            value={input}
            onChange={setInput}
            onSubmit={() => {
              // Marks on the reference and the prompt outlive a rewrite — the
              // question has not changed. Marks on your own sentence do not:
              // they name positions in a sentence that no longer exists.
              if (input !== submitted) {
                setMarks(({ submitted: _stale, ...rest }) => rest);
              }
              setSubmitted(input);
              setPhase({ t: "graded", revealed: false });
            }}
            onReveal={() => {
              setSubmitted("");
              setMarks(({ submitted: _stale, ...rest }) => rest);
              setPhase({ t: "graded", revealed: true });
            }}
            vocabulary={
              <QuestionVocabulary
                words={vocabulary}
                open={showVocab}
                status={dictStatus}
                onToggle={toggleVocab}
                onHold={holdCribWord}
              />
            }
          />
        )}

        {phase.t === "graded" && question && (
          <Graded
            question={question}
            submitted={submitted}
            revealed={phase.revealed}
            index={inPlacement ? undefined : qIndex}
            total={inPlacement ? undefined : test?.questions.length ?? 0}
            schedule={inPlacement ? undefined : schedule}
            labels={inPlacement ? PLACEMENT_LABELS : undefined}
            marks={marks}
            marking={marking}
            onGrade={grade}
            onResume={resumeWriting}
            onRecordWord={() => openVocab()}
            onHoldWord={holdWord}
            onReadGrammar={() =>
              sectionId && setOverlay({ t: "grammar", sectionId })
            }
            onToggleMarking={() => setMarking((on) => !on)}
            onMark={markHere}
            vocabulary={
              <QuestionVocabulary
                words={vocabulary}
                open={showVocab}
                status={dictStatus}
                onToggle={toggleVocab}
                onHold={holdCribWord}
              />
            }
            history={
              <EarlierAnswers
                attempts={attempts}
                open={showTrail}
                onToggle={() => setShowTrail((open) => !open)}
                onMark={sectionId ? markPast(sectionId) : undefined}
              />
            }
          />
        )}

        {phase.t === "vocab-review" &&
          (() => {
            const card = session.vocabCard(phase.cardId);
            if (!card) return null;
            return (
              <VocabReview
                card={card}
                revealed={phase.revealed}
                schedule={session.previewVocab(phase.cardId)}
                onReveal={() => setPhase({ ...phase, revealed: true })}
                onGrade={(r) => gradeVocab(phase.cardId, r)}
                onEdit={() => setOverlay({ t: "vocab-edit", cardId: phase.cardId })}
              />
            );
          })()}

        {phase.t === "done" && (
          <Rest
            overall={overall}
            nextDue={nextDue}
            onOpenMap={() => setOverlay({ t: "map" })}
            onOpenSchedule={() => setOverlay({ t: "schedule" })}
          />
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          action={toast.action}
          onAction={() => {
            setToast(null);
            toast.onAction?.();
          }}
        />
      )}

      {overlay?.t === "grammar" &&
        (() => {
          const at = sections.findIndex((s) => s.id === overlay.sectionId);
          const sec = sections[at];
          if (!sec) return null;
          const trail = session.attemptsFor(overlay.sectionId);
          return (
            <GrammarSheet
              section={sec}
              prev={sections[at - 1]}
              next={sections[at + 1]}
              // Paging keeps whatever the sheet was opened over: reading on is
              // still reading, so it must not cost the way back.
              onPage={(to) => setOverlay({ ...overlay, sectionId: to.id })}
              onStudy={() =>
                setOverlay(
                  // Straight back when the topic sheet is what opened this
                  // page. Once the reader has paged away it is a different
                  // topic, and that one is pushed on top.
                  overlay.back?.t === "topic" &&
                    overlay.back.sectionId === sec.id
                    ? overlay.back
                    : { t: "topic", sectionId: sec.id, back: overlay },
                )
              }
              onClose={() => setOverlay(overlay.back ?? null)}
              action={
                trail.length > 0 ? (
                  <button
                    className="iconbtn"
                    aria-label="Earlier answers"
                    onClick={() =>
                      setOverlay({ t: "attempts", sectionId: overlay.sectionId })
                    }
                  >
                    ↺
                  </button>
                ) : undefined
              }
            />
          );
        })()}

      {overlay?.t === "map" && (
        <MapSheet
          families={families}
          overall={overall}
          currentFamily={
            families.find((f) =>
              f.topics.some((t) => t.sectionId === sectionId),
            )?.id
          }
          onClose={() => setOverlay(null)}
          onPick={(t) => setOverlay({ t: "topic", sectionId: t.sectionId })}
        />
      )}

      {overlay?.t === "topic" &&
        (() => {
          const topic = families
            .flatMap((f) => f.topics)
            .find((t) => t.sectionId === overlay.sectionId);
          if (!topic) return null;
          return (
            <TopicSheet
              topic={topic}
              attempts={session.attemptsFor(topic.sectionId)}
              questionCount={content.questionsFor(topic.sectionId).length}
              // The map is where a topic is normally chosen, and where closing
              // one goes back to — unless it was opened from the page being
              // read, which is then what lies underneath.
              onClose={() => setOverlay(overlay.back ?? { t: "map" })}
              onRead={() =>
                setOverlay({ t: "grammar", sectionId: topic.sectionId, back: overlay })
              }
              onQuiz={() => {
                setOverlay(null);
                quizTopic(topic);
              }}
              onStudyFrom={() => studyFrom(topic)}
              onDrill={() => drillTopic(topic)}
              onQuestions={() =>
                setOverlay({ t: "questions", sectionId: topic.sectionId })
              }
              onMark={markPast(topic.sectionId)}
            />
          );
        })()}

      {overlay?.t === "questions" &&
        (() => {
          const sec = content.getSection(overlay.sectionId);
          if (!sec) return null;
          return (
            <QuestionsSheet
              section={sec}
              questions={session.questionBank(overlay.sectionId)}
              onClose={() => setOverlay({ t: "topic", sectionId: overlay.sectionId })}
              onPick={(q) =>
                setOverlay({
                  t: "question",
                  sectionId: overlay.sectionId,
                  prompt: q.prompt,
                })
              }
            />
          );
        })()}

      {overlay?.t === "question" &&
        (() => {
          const sec = content.getSection(overlay.sectionId);
          const question = session
            .questionBank(overlay.sectionId)
            .find((q) => q.prompt === overlay.prompt);
          if (!sec || !question) return null;
          return (
            <QuestionSheet
              section={sec}
              question={question}
              onClose={() =>
                setOverlay({ t: "questions", sectionId: overlay.sectionId })
              }
              onMark={markPast(overlay.sectionId)}
            />
          );
        })()}

      {overlay?.t === "schedule" && (
        <ScheduleSheet
          entries={session.upcoming()}
          vocabCount={stats.vocab}
          onClose={() => setOverlay(null)}
          onOpenVocab={() =>
            setOverlay({ t: "vocab-list", back: { t: "schedule" } })
          }
        />
      )}

      {overlay?.t === "vocab-list" && (
        <VocabListSheet
          cards={session.vocabList()}
          onClose={() => setOverlay(overlay.back ?? null)}
          onPick={(card) =>
            setOverlay({ t: "vocab-edit", cardId: card.id, back: overlay })
          }
        />
      )}

      {overlay?.t === "vocab-edit" &&
        (() => {
          const card = session.vocabCard(overlay.cardId);
          // Deleted from underneath, or edited from a toast after an undo.
          if (!card) return null;
          const back = overlay.back ?? null;
          return (
            <VocabEditSheet
              card={card}
              onSave={(patch) => {
                editVocab(card.id, patch);
                setOverlay(back);
                flash(`Saved ${patch.citation.trim()}`);
              }}
              onDelete={() => {
                removeVocab(card.id);
                setOverlay(back);
              }}
              onClose={() => setOverlay(back)}
            />
          );
        })()}

      {overlay?.t === "attempts" && (
        <Sheet
          title="Earlier answers"
          subtitle={content.getSection(overlay.sectionId)?.title}
          onClose={() => setOverlay({ t: "grammar", sectionId: overlay.sectionId })}
        >
          <AttemptTrail
            attempts={session.attemptsFor(overlay.sectionId)}
            onMark={markPast(overlay.sectionId)}
          />
        </Sheet>
      )}

      {overlay?.t === "vocab-input" && (
        <VocabSheet
          status={
            dictLoading ? "loading" : dictFailed ? "unavailable" : "ready"
          }
          initialForm={overlay.prefill}
          autoLookup={overlay.auto}
          onLookup={lookupWord}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.t === "vocab-new" && (
        <VocabNewSheet
          form={overlay.form}
          // Written by hand, so there is no lemma to speak of: the form as it
          // was met is the word's identity, which is what dedupes the card.
          onSave={({ citation, gloss }) =>
            saveWord({
              lemma: overlay.form,
              citation: citation.trim(),
              gloss: gloss.trim(),
              pos: "",
            })
          }
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.t === "vocab-pick" && (
        <VocabPickSheet
          form={overlay.form}
          candidates={overlay.candidates}
          onPick={saveWord}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.t === "settings" && (
        <SettingsSheet
          config={storage.currentConfig()}
          state={syncState}
          onConfigure={configureSync}
          onExport={() => exportProgress(session.progress())}
          onImport={() => void doImport()}
          onPull={() =>
            void storage
              .fetchRemote()
              .then((remote) => {
                if (remote) adopt(remote);
                else flash("Nothing saved on GitHub yet.");
              })
              // A pull that cannot reach the repo used to reject into nothing:
              // the sheet's status line changed and the button appeared to do
              // nothing at all, which is indistinguishable from a pull that
              // found no change to make. Say so.
              .catch((err: unknown) =>
                flash(
                  err instanceof Error
                    ? `Could not pull: ${err.message}`
                    : "Could not pull from GitHub.",
                ),
              )
          }
          dictionaryReady={dictionaryReady()}
          caching={dictLoading}
          onCacheDictionary={cacheDictionary}
          vocabCount={stats.vocab}
          onOpenVocab={() =>
            setOverlay({ t: "vocab-list", back: { t: "settings" } })
          }
          onReset={() => {
            storage.clearLocal();
            // Erasing and then reloading is two steps, and the draft kept on
            // the way out lands between them. Seal, or the erase is undone by
            // the very reload meant to finish it.
            storage.seal();
            location.reload();
          }}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.t === "conflict" && (
        <Sheet
          title="Progress from another device"
          onClose={() => setOverlay(null)}
        >
          <p className="field__hint" style={{ marginTop: 0 }}>
            The copy on GitHub was saved {ago(overlay.remote.updatedAt)}, which
            is newer than this device's. Only one can be kept.
          </p>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                void storage.saveNow(session.progress());
                setOverlay(null);
                flash("Kept this device's progress.");
              }}
            >
              Keep this device
            </button>
            <button
              className="btn btn--primary"
              onClick={() => adopt(overlay.remote)}
            >
              Use the newer one
            </button>
          </div>
          {attempts.length === 0 && null}
        </Sheet>
      )}
      {/* Last, so it lies over every sheet, and inert: it never takes a tap. */}
      {confettiCanvas}
    </div>
  );
}
