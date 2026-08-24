import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Content,
  MAX_CONTEXTS,
  Session,
  locateWord,
  questionVocabulary,
  words,
  type Attempt,
  type AttemptMarks,
  type LemmaEntry,
  type Mode,
  type NewVocabContext,
  type Progress,
  type Rating,
  type RoundVia,
  type ScheduleEntry,
  type Test,
  type TopicProgress,
  type VocabContext,
  type VocabWord,
} from "@lang-tutor/core";
import {
  dictionariesReady,
  dictionaryReady,
  etymology,
  loadDictionaries,
  loadDictionary,
  loadGrammarBook,
  loadParadigms,
  prefetchGrammarBooks,
} from "./content-loader.js";
import type { ParadigmIndex } from "./paradigm-index.js";
import { useConfetti } from "./confetti/Confetti.js";
import { profile } from "./pack.js";
import type { SyncState, SyncConfig } from "./storage/sync.js";
import { SyncingStorage } from "./storage/sync.js";
import {
  exportProgress,
  exportSalvaged,
  importProgress,
  pickProgressFile,
} from "./storage/transfer.js";
import {
  readStorage,
  requestPersistence,
  type StorageReport,
} from "./storage/quota.js";
import { Sheet, Toast, ago, cycleEmphasis } from "./ui.js";
import {
  Answering,
  Graded,
  Landed,
  Practised,
  Rest,
  SentenceReview,
  VocabReview,
} from "./screens/Study.js";
import { GrammarSheet } from "./screens/Grammar.js";
import { InspectSheet } from "./screens/Inspect.js";
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
import { SentenceListSheet } from "./screens/Sentences.js";

/**
 * The quiz loop, ported from `apps/cli/src/app.tsx`.
 *
 * The state machine is the CLI's — answer, compare, grade, advance — with two
 * changes the medium forces. Its single `Phase` union splits in two:
 * a `Phase` for where the loop is, and an `Overlay` for what is layered over
 * it, because a sheet on a phone covers the question rather than replacing it.
 * And the CLI's key handling becomes buttons.
 */

type Phase =
  | { t: "answering" }
  | { t: "graded"; revealed: boolean }
  | { t: "vocab-review"; cardId: string; revealed: boolean }
  | { t: "sentence-review"; cardId: string; revealed: boolean }
  /** A practice run worked out; the loop has stopped here on purpose. */
  | { t: "practised"; sectionId: string }
  /**
   * A moment to stand still in, between the last grade of a round and the next
   * question.
   *
   * The loop used to fire the burst and advance in the same breath, so the
   * confetti played over the *next* prompt and the round that earned it was
   * already gone. It lands here instead and waits for one tap.
   *
   * One arm rather than two, because a round that both finishes and empties the
   * pile is one moment: two cards to dismiss in a row is what a student meets on
   * the commonest way to end a session.
   */
  | {
      t: "landed";
      round?: {
        sectionId: string;
        /** The section it was read in, when that is another book's page. */
        viewedAs?: string;
        due: Date;
        /** False while the card is only on offer — see `Landed`. */
        scheduled: boolean;
      };
      /** The last thing waiting went with this grade. */
      cleared: boolean;
      /** An author met for the first time, named on the card. */
      met?: string;
    }
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
  /** Which errand it was given on — the grade may be the one that ended it. */
  mode: Mode;
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
  | { t: "sentence-list"; back?: Overlay }
  | { t: "vocab-edit"; cardId: string; back?: Overlay }
  /**
   * `prefill` is a word held on the question; `auto` looks it up unattended.
   *
   * `context` is the sentence the word was held in, riding along on the three
   * overlays that stand between a press and a saved card. It travels on the
   * overlay rather than in a ref beside it because every path out of an overlay
   * — Esc, the backdrop, another overlay opening over it — replaces this value,
   * where a ref would have to be cleared on each of them. Miss one and the
   * *next* word saved quietly gets the previous word's sentence: a wrong card
   * that looks entirely right.
   *
   * `back` is what the gesture was made over, on these four for the same reason
   * `grammar` and `topic` carry it: they are opened by a press rather than
   * navigated to, and a press now lands in the attempt trail, which is drawn
   * inside three sheets. Without it, holding a word while reading a topic would
   * answer by closing the topic. Absent on the study screen and a card's back,
   * where there was nothing underneath — which is every press written before
   * the trail had the gesture.
   */
  | {
      t: "vocab-input";
      prefill?: string;
      auto?: boolean;
      context?: NewVocabContext;
      back?: Overlay;
    }
  | {
      t: "vocab-pick";
      form: string;
      candidates: LemmaEntry[];
      context?: NewVocabContext;
      back?: Overlay;
    }
  /** A word the dictionary has not got, being written out by hand. */
  | { t: "vocab-new"; form: string; context?: NewVocabContext; back?: Overlay }
  /**
   * A word double-clicked to be looked at. `entry` is the reading being shown
   * and `others` the rest, tappable — a look is not a decision, so an
   * ambiguous form opens on its commonest reading rather than on a picker.
   */
  | {
      t: "inspect";
      form: string;
      entry: LemmaEntry;
      others: LemmaEntry[];
      back?: Overlay;
    }
  | { t: "settings" }
  /** Both copies moved since they last agreed; only a person can choose. */
  | { t: "conflict"; remote: Progress }
  /** A deliberate push that would land on top of a newer copy. */
  | { t: "overwrite"; remote: Progress }
  /** A deliberate pull that would discard what this device has not sent. */
  | { t: "discard"; remote: Progress };

/** Whether anything at all has been picked out, across the three texts. */
function hasMarks(marks: AttemptMarks): boolean {
  return Object.values(marks).some((m) => m && Object.keys(m).length > 0);
}

/**
 * What a word gesture was made over, and what finishing it comes back to.
 *
 * Flattened rather than stacked: a pick sheet raised from the input sheet comes
 * back to the sheet the word was *held* in, not to the input sheet. `back`
 * records where the student was standing, and everything between the press and
 * the saved card is one gesture — a way back into the middle of it would be an
 * offer to do half the thing again.
 */
function under(open: Overlay): Overlay {
  if (!open) return open;
  switch (open.t) {
    case "vocab-input":
    case "vocab-pick":
    case "vocab-new":
    case "inspect":
      return open.back ?? null;
    default:
      return open;
  }
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

/** What each of the graded screen's three texts is called once it is copied. */
const COPIED: Record<keyof AttemptMarks, string> = {
  prompt: "The question",
  submitted: "What you wrote",
  answer: "The reference",
};

export function App({ content, session, storage }: Props) {
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [qIndex, setQIndex] = useState(0);
  // Why the round on the table was served, which is the only thing the screen
  // cannot work out for itself. `next` says it once and would forget it; the
  // round carries it across a reload.
  const [via, setVia] = useState<RoundVia | null>(null);

  /**
   * Which errand this is.
   *
   * Not read from the file and never written to it: a pile of reviews is
   * exactly the thing a saved preference should not be able to hide, so the
   * app opens on them whenever there are any and on the book when there are
   * not. The explore sub-mode is remembered; which of the two you are on is a
   * decision about this sitting.
   */
  const [mode, setMode] = useState<Mode>(() => {
    return session.stats().due > 0 ? "review" : "explore";
  });

  const [phase, setPhase] = useState<Phase>({ t: "answering" });
  const [overlay, setOverlay] = useState<Overlay>(null);

  /*
   * The system Back button closes the sheet instead of leaving the app.
   *
   * There was no History API use anywhere — `pushState`, `popstate` and
   * `history.` appeared nowhere outside `location.reload()` — so on Android, in
   * an installed standalone PWA with seventeen kinds of bottom sheet, the Back
   * gesture closed **the app**. A student reading a grammar section made the one
   * gesture their phone has for "go back" and lost the question they were on.
   *
   * Derived from the overlay state rather than wired into the closes. There are
   * forty-four `setOverlay` call sites; threading a history call through each
   * would work until the forty-fifth, and the one that forgot would be a Back
   * press that did nothing. This watches instead, so a new sheet is covered by
   * existing.
   *
   * **One entry while any sheet is open, not one per sheet.** A few sheets nest
   * — a word inspected from inside the trail — and `under()` returns the parent
   * when ✕ is pressed. Back does not walk that stack: it closes the lot. That
   * is a real difference from ✕ and it is the trade taken deliberately, because
   * a history stack reconciled against a nesting depth is where this kind of
   * code goes wrong, and "Back dismisses the modal" is what the platform means
   * anyway.
   *
   * `pushed` is what keeps it honest in the other direction: without it, a close
   * with no entry of ours behind it would call `history.back()` and leave the
   * app — the exact bug being fixed, arrived at from the other side.
   */
  const pushed = useRef(false);
  const fromPop = useRef(false);

  useEffect(() => {
    const onPop = () => {
      // Our entry is already gone by the time this runs, so nothing here may
      // pop again; `fromPop` tells the effect below the same thing.
      if (!pushed.current) return;
      pushed.current = false;
      fromPop.current = true;
      setOverlay(null);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (fromPop.current) {
      fromPop.current = false;
      return;
    }
    if (overlay && !pushed.current) {
      pushed.current = true;
      history.pushState({ sheet: true }, "");
    } else if (!overlay && pushed.current) {
      pushed.current = false;
      history.back();
    }
  }, [overlay]);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");
  // What has been picked out on the question in hand. It rides here rather
  // than in the trail because the attempt it belongs to has not been recorded
  // yet: the grade is what writes it.
  const [marks, setMarks] = useState<AttemptMarks>({});
  const [marking, setMarking] = useState(false);
  // Whether the dismissal on the graded screen has had its first press. Not
  // persisted and not on the round: it is armed for the screen it was pressed
  // on and nothing else.
  const [dismissing, setDismissing] = useState(false);
  /**
   * The kept sentence one press from being forgotten, by card id.
   *
   * An id rather than a flag, so arming one card and then moving to another
   * cannot leave the second armed — the same hazard `dismissing` disarms
   * against when the question changes, said in the shape this screen has.
   */
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [toast, setToast] = useState<Flash | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictFailed, setDictFailed] = useState(false);
  const [paradigms, setParadigms] = useState<ParadigmIndex>();
  const [paradigmsLoading, setParadigmsLoading] = useState(false);
  const [paradigmsFailed, setParadigmsFailed] = useState(false);
  // The pack's further books, which have no index to be the proof they arrived
  // — nothing is parsed until one is opened — so their fetch is remembered
  // instead. Settings is the only thing that asks: it is what stands behind
  // "everything is on this device", and a pack with no further books has this
  // the moment the prefetch runs. `booksLoading` is the same story a step
  // earlier: without it the download's last few seconds are a window in which
  // nothing is loading and not everything is here, and the screen has to
  // describe that state as a failure.
  const [booksReady, setBooksReady] = useState(false);
  const [booksLoading, setBooksLoading] = useState(false);
  // The further dictionaries, tracked apart from the books because they arrive
  // after them and Settings describes the wait as one thing.
  const [lexicaLoading, setLexicaLoading] = useState(false);
  // What the browser says about the space this app is holding, for the panel in
  // Settings. Read when that sheet opens rather than kept live: it is a figure
  // to look at when you go looking, and asking on every render would be a
  // storage call per keystroke.
  const [space, setSpace] = useState<StorageReport>({
    persisted: false,
    usage: null,
  });
  const [showVocab, setShowVocab] = useState(false); // the question's word list
  const [showTrail, setShowTrail] = useState(false); // this topic's earlier answers
  const [syncState, setSyncState] = useState<SyncState>(storage.currentState());
  const [tick, setTick] = useState(0);
  const [undo, setUndo] = useState<GradeUndo | null>(null); // the last grade, takeable

  /*
   * A file this device could not read, kept rather than written over.
   *
   * Read once at mount rather than on every render: it is set at startup by
   * `LocalStorageAdapter.read`, before any of this exists, and the only thing
   * that changes it afterwards is the student discarding it.
   */
  const [salvaged, setSalvaged] = useState<string | null>(() => storage.salvaged());

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
   * and a keystroke is not something the mirror needs. The screens with no
   * sentence on them have nothing to keep.
   */
  const keepDraft = useCallback(() => {
    if (phase.t !== "answering" && phase.t !== "graded") return;
    session.setDraft({
      input,
      ...(phase.t === "graded"
        ? { graded: { submitted, revealed: phase.revealed } }
        : {}),
      ...(hasMarks(marks) ? { marks } : {}),
    });
    storage.saveLocal(session.progress());
  }, [phase, input, submitted, marks, session, storage]);

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

  /*
   * The book a page belongs to, in order — what the grammar reader pages
   * through.
   *
   * Keyed on the section rather than on which book is open, because the two
   * come apart: following "also explained at" from a topic of one grammar opens
   * a page of another, and a student comparing two explanations has not asked
   * to change syllabus. Read out of the open book's list, that page is not in
   * it, and the reader rendered nothing at all.
   */
  const sectionsFor = useCallback(
    (sectionId: string) => content.sections(content.grammarOf(sectionId)),
    [content, tick],
  );

  /*
   * Opening a different grammar of the same language.
   *
   * The fetch is the only slow part and it happens once per book: nothing is
   * migrated and nothing recomputed, because nothing moved — the cards and the
   * answers stay filed under the topics the questions were written for, and
   * this changes which book is drawn over them. A failure leaves the student on
   * the book they were already reading, which is the one state that is always
   * safe to be in.
   */
  const [switching, setSwitching] = useState<string | null>(null);
  /*
   * Read off the profile rather than off `Content`, which only knows the books
   * it has actually been handed. The switch has to offer one before it is
   * fetched, or it could never be fetched.
   */
  const books = useMemo(
    () => [
      { id: content.primaryGrammar, label: content.grammarLabel(content.primaryGrammar) },
      ...(content.profile.grammars ?? []).map((g) => ({ id: g.id, label: g.label })),
    ],
    [content],
  );
  const switchGrammar = useCallback(
    (id: string) => {
      if (id === session.grammarId || switching) return;
      void (async () => {
        setSwitching(id);
        try {
          await loadGrammarBook(content, id);
          session.setGrammar(id);
          save();
          bump();
        } catch (err) {
          setToast({
            message: `Could not open ${content.grammarLabel(id)} — ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
        } finally {
          setSwitching(null);
        }
      })();
    },
    [content, session, switching],
  );

  /*
   * The same grammar point as the pack's other books put it.
   *
   * Off the crosswalk, which is already loaded for whichever books have been
   * opened — so this fills in as they are, and a book never opened contributes
   * nothing rather than blocking on a fetch. `topicsTeaching` wants a topic of
   * the primary grammar, so a section of a further book is resolved back
   * through its own before it is asked.
   */
  const elsewhereFor = useCallback(
    (sectionId: string) =>
      content
        .grammarIds()
        .filter((id) => id !== content.grammarOf(sectionId))
        .map((id) => ({
          grammarId: id,
          label: content.grammarLabel(id),
          sections: [
            ...new Set(
              content
                .primaryTopicsFor(sectionId)
                .flatMap((primary) => content.topicsTeaching(primary, id)),
            ),
          ]
            .map((otherId) => content.getSection(otherId))
            .filter((s) => s !== undefined)
            .map((s) => ({
              sectionId: s.id,
              ref: content.formatRef(s.ref, id),
              title: s.title,
            })),
        }))
        .filter((book) => book.sections.length > 0),
    [content, tick],
  );

  // The engine is mutated in place, so views derive from it on every tick.
  const families = useMemo(() => session.familyProgress(), [session, tick]);
  const starred = useMemo(() => session.starredTopics(), [session, tick]);
  const stats = useMemo(() => session.stats(), [session, tick]);
  const dueNow = stats.due;
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
  // A half-given dismissal ends with its screen too, and it is the one of these
  // that would be dangerous to leave armed: the first press names a topic, and
  // the second press on a different one would take that one out of the pile.
  useEffect(() => setDismissing(false), [question?.prompt, sectionId, phase.t]);
  // And a half-given forgetting, for the same reason on the other screen: the
  // card under it is the card the second press would forget.
  useEffect(() => setForgetting(null), [phase.t]);

  // --- the loop ------------------------------------------------------------

  /**
   * Put down whatever round is in flight, and clear the sentence with it.
   *
   * Shared by the two ways study leaves a round behind — the loop moving on of
   * its own accord, and a card chosen off the schedule — so what "leaving"
   * costs cannot come to mean two things.
   *
   * It used to step a cursor through the book here, so ending a round the book
   * had served also moved the book on. Nothing moves on now: a run stays on the
   * topic it was started on until the student picks another.
   */
  const leaveRound = useCallback(() => {
    setInput("");
    setSubmitted("");
    setMarks({});
    session.endRound();
  }, [session]);

  /**
   * Move on to whatever the errand has next.
   *
   * `asked` defaults to the errand in hand, so an ordinary "carry on" is still
   * a bare `advance()`. Switching passes the new errand explicitly, because
   * `mode` will not have re-rendered yet at the point the switch calls this.
   */
  const advance = useCallback(
    (asked: Mode = mode) => {
      // Whatever was in flight is behind us by definition — this is the one
      // place study moves on of its own accord.
      leaveRound();
      const action = session.next(new Date(), asked);

      if (action.kind === "done" && asked === "review") {
        // The pile is cleared, so Review is no longer somewhere to be. The
        // switch throws itself rather than leaving the student on a rest
        // screen beside a book they could be reading.
        //
        // Still here, and still right, for every way into `advance` that is not
        // a grade — a sync that adopted another device's cleared pile, a card
        // deleted out from under a review, a launch onto an empty one. The
        // grade that empties the pile no longer reaches this: it lands on a
        // card of its own, and a switch thrown silently underneath a moment
        // would be the app talking over it.
        setMode("explore");
        flash("Nothing left due.");
        advance("explore");
        return;
      }
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
      if (action.kind === "practised") {
        setSectionId(action.sectionId);
        setTest(null);
        setVia(null);
        setPhase({ t: "practised", sectionId: action.sectionId });
        save();
        bump();
        return;
      }
      if (action.kind === "sentence-review") {
        // As with a word: the topic behind us is not what is on screen. A
        // sentence card carries its own provenance and does not want a grammar
        // title, a reference and a way into the prose standing over it.
        setVia(null);
        setPhase({ t: "sentence-review", cardId: action.cardId, revealed: false });
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

      // The preference binds both errands that serve a sentence, and binds them
      // differently. A practice run takes it whole: the student chose the
      // topic, and `TopicSheet` will not offer a run on one the preference
      // empties. A review takes it with a floor under it — `serveReview` asks
      // for a quotation and falls back to the topic's whole cycle rather than
      // leave a due card with nothing to come back on.
      const quotedOnly = session.quotedOnly() && action.kind === "drill";
      // A practice run serves out of its own set; a review rotates.
      const served =
        action.kind === "drill"
          ? session.servePractice(action.sectionId)
          : session.serveReview(action.sectionId);
      // A topic with nothing servable takes a pass-over grade so the loop can move
    // past it. That used to schedule the topic as a side effect; it no longer
    // can, because a grade writes nothing for a topic with no card. A pass-over
    // on a *review* still moves the card it was picked for — `next("review")`
    // only ever names topics that already have one.
    if (!served) {
        // A topic with no tests cannot be studied; pass it so the loop moves on
        // rather than offering it again forever. But a topic with tests the
        // preference filtered out is a different thing: nothing was shown, so
        // nothing was learned, and grading it would put a topic the student has
        // never seen into the review rotation as though they had passed it.
        // Step over it and leave the card alone, so turning the preference off
        // finds the topic still waiting.
        if (!(quotedOnly && session.hasTests(action.sectionId))) {
          session.gradeTopic(action.sectionId, 3);
        }
        advance(asked);
        return;
      }
      /*
       * Whether to teach before testing, and it is not the same question as
       * what the badge says. Never *answered* rather than never mastered: a
       * topic can be come back to after a dismissal or after years, and
       * teaching those again is not teaching.
       */
      const fresh = !session.everGraded(action.sectionId);
      // Two reasons a round can be on screen, because there are two errands.
      // `"new"` was a third — the book's walk arriving somewhere for the first
      // time — and it is not a reason any more: a topic is on screen because
      // somebody asked for it, whether or not they have been here before.
      const via: RoundVia = action.kind === "topic-review" ? "review" : "drill";
      setSectionId(action.sectionId);
      setTest(served);
      setQIndex(0);
      setVia(via);
      setPhase({ t: "answering" });
      // Teach before testing on new ground, exactly as the CLI does.
      setOverlay(fresh ? { t: "grammar", sectionId: action.sectionId } : null);
      // The round is on the table from here, and saved right away: the session
      // this protects against is the one that ends without another grade in it.
      session.beginRound(action.sectionId, served, fresh, via);
      save();
      bump();
    },
    [session, save, mode, leaveRound],
  );

  // The net under `removeVocab`, not a substitute for it: a card under review
  // can also vanish because a sync adopted another device's progress. The
  // review body draws nothing for a card the session cannot find, so heal the
  // phase rather than leave an empty screen behind it.
  useEffect(() => {
    if (phase.t === "vocab-review" && !session.vocabCard(phase.cardId)) advance();
    if (phase.t === "sentence-review" && !session.sentenceCard(phase.cardId)) {
      advance();
    }
  }, [phase, session, advance, tick]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // A test on the table is picked back up exactly where it was left. Without
    // this, closing the app on question two of four came back at question one
    // of a different test on a different topic — the first grade had already
    // rescheduled the card, so `next` found nothing due and went looking for
    // new ground. A set is left deliberately, from the map, or not at all.
    //
    // Only a round belonging to the errand this launch opens on, though. Which
    // errand that is has already been decided by what is waiting, and a switch
    // reading "Review" over a topic the book served would be naming something
    // that is not happening. The round costs nothing to drop: its card is
    // already at exactly one rep, which is what the round was for.
    const open = session.resumableRound();
    if (open && (open.via === "review") === (mode === "review")) {
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
    /*
     * An offer that was never answered comes back rather than lapsing.
     *
     * A finished round is not resumable, so before this it fell straight
     * through to `advance()` and the landing was simply lost — which cost
     * nothing when the landing only announced a date. It costs the whole
     * feature now: letting the offer lapse decides it by default, and the
     * default is precisely what is being removed. `worst` is on the round and
     * the round is on disk, so the same question can be asked again with the
     * same number under it.
     *
     * Guarded on `!scheduled`. A landing on a topic already in the pile has
     * nothing to ask, so it keeps falling through exactly as it always did.
     */
    const landed = session.landedRound();
    if (landed && !landed.scheduled) {
      setPhase({
        t: "landed",
        round: {
          sectionId: landed.sectionId,
          ...(landed.viewedAs ? { viewedAs: landed.viewedAs } : {}),
          due: landed.due,
          scheduled: false,
        },
        // Not recoverable, and claiming it would be a small lie: what was left
        // in the pile at the time of the round is not written down anywhere.
        cleared: false,
      });
      bump();
      return;
    }
    advance();
  }, [advance, session, mode]);

  /*
   * Notice progress from another device before this one can push over it.
   *
   * Two devices being out of step is not an incident, it is how the app is
   * used: study on the phone, open the laptop the next morning. So the check
   * resolves that case itself, silently, and keeps the question for the one
   * case where a person is genuinely needed — both copies moved since they last
   * agreed, and taking either one throws work away.
   *
   * Until this has answered, nothing is pushed: the gate inside the storage is
   * what makes "fetch before push" true rather than merely likely.
   */
  useEffect(() => {
    if (!storage.currentConfig()) return;
    void storage.checkRemote().then((found) => {
      if (found.kind === "adopt") adoptRemote(found.remote);
      else if (found.kind === "diverged") setOverlay({ t: "conflict", remote: found.remote });
    });
  }, [session, storage]);

  /**
   * The reward. It comes at the end of a round of questions rather than on a
   * count of answers: a burst that arrives mid-topic interrupts, and one that
   * arrives as the last question of a test is graded marks something the
   * student actually finished.
   */
  const { canvas: confettiCanvas, fire: fireConfetti } = useConfetti();

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
    mode,
  });

  /**
   * Take back the grade just given: the question comes back as it was left,
   * and the engine returns to the state it was in before — schedule, attempt
   * trail, the run in flight. The errand comes back too: the grade may be the
   * one that emptied the pile and threw the switch.
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
    setMode(undo.mode);
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
    // Asked before the attempt is written, or the answer being given is itself
    // what proves the author already met.
    const met = question ? session.meetAuthor(question) : undefined;
    // Kept before the grade is applied: what you wrote on a topic is worth
    // having whichever errand it was written on. The CLI has always done this;
    // the web app used to return first and lose it.
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
    if (!sectionId || !question) return;
    // The test's id names the round, so all its questions cost the topic one
    // review rather than one apiece — graded by the worst of them, and however
    // many of them the round was asked to be for.
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
      /*
       * The round is done, and this is where the loop stops.
       *
       * The burst fires over *this* card rather than over the next prompt,
       * which is where it used to land: `advance()` was called in the same
       * breath and had already served the next question. Fired on the last
       * question whatever it was graded — the student who pressed "again" four
       * times is the one working hardest, and this is for finishing.
       *
       * The round is deliberately not ended here. `leaveRound()` — which
       * `advance` calls first thing — is what "Keep going" and "Not now" both
       * mean. A student who closes the app on this card loses nothing, but not
       * for the reason it used to: the round is still on file with its `worst`,
       * and the launch path reads `landedRound()` before falling through to
       * `advance`, so an offer that was never answered is put back rather than
       * quietly dropped. Dropping it would decide the question by default, and
       * the default is the thing being removed.
       */
      const landed = session.landedRound();
      // Asked after the grade, so the topic just rescheduled is not counted:
      // even `again` goes to a learning step of minutes, which is not due now.
      const cleared = mode === "review" && session.stats().due === 0;
      // Whoever the round met, wherever in it they were met — a first meeting
      // on question two is still the news when the round lands on question four.
      const author = landed?.met[0] ?? met;
      setPhase({
        t: "landed",
        ...(landed
          ? {
              round: {
                sectionId: landed.sectionId,
                ...(landed.viewedAs ? { viewedAs: landed.viewedAs } : {}),
                due: landed.due,
                scheduled: landed.scheduled,
              },
            }
          : {}),
        cleared,
        ...(author ? { met: author } : {}),
      });
      // Nothing on this screen is a question, so the header stops naming one —
      // the same thing `advance`'s `done` branch does, and for the same reason.
      setSectionId(null);
      setTest(null);
      setInput("");
      setSubmitted("");
      setMarks({});
      setOverlay(null);
      /*
       * The pile emptying is not what earns a burst, and this is the one place
       * that had to be decided rather than inherited. It is the single event in
       * this app a student can watch approach — the status bar counts down to
       * it, one grade at a time — and an Easter egg that arrives on schedule is
       * a progress bar. A round that both finishes and clears still bursts, for
       * the round, exactly as it would have anyway.
       */
      fireConfetti(author ? "milestone" : "round");
      save();
      bump();
    }
  };

  const gradeVocab = (cardId: string, rating: Rating) => {
    navigator.vibrate?.(8);
    setUndo(takeUndo(phase));
    session.gradeVocab(cardId, rating);
    save();
    // A word has no round behind it, so there is nothing to land on — unless
    // this was the last thing waiting, which is a moment whichever kind of card
    // ended it. No burst: see `grade`.
    if (mode === "review" && session.stats().due === 0) {
      setPhase({ t: "landed", cleared: true });
      setSectionId(null);
      setTest(null);
      save();
      bump();
      return;
    }
    advance();
  };

  /**
   * Change errand.
   *
   * At once, mid-round and all. A link that took effect at the end of the
   * round was the old behaviour, and it made the choice feel like a request:
   * the point of a switch is that a pile you can see is a pile you can put
   * down now. Nothing is lost by it — every grade in the round has already
   * been applied to the card, one rep's worth — except the sentence being
   * written, which is the price of the switch being immediate.
   */
  const chooseMode = (next: Mode) => {
    if (next === mode) return;
    navigator.vibrate?.(8);
    setMode(next);
    advance(next);
    flash(
      next === "review"
        ? `Back to the reviews — ${dueNow} waiting.`
        : "Reviews set aside.",
    );
  };

  /**
   * Stay on a topic and work a run of its questions out.
   *
   * The one way onto a topic, and the whole of what studying is when nothing is
   * due. A run stays where it was started until another topic is chosen, which
   * is the point: four questions do not sweep a bank of twenty-odd, so doing
   * well on a test and being moved straight on was never the same as having the
   * topic.
   *
   * A swept bank is not a reason to refuse: asking again is asking for the
   * whole thing a second time, which is what a second run is.
   */
  const drillTopic = (topic: TopicProgress, again?: () => void) => {
    session.drillTopic(topic.sectionId);
    save();
    setOverlay(null);
    setMode("explore");
    advance("explore");
    const run = session.practice(topic.sectionId);
    // `again` is the die's, and the toast is where it belongs: the moment a
    // rolled topic is wrong for today is the moment its name appears, and the
    // announcement is already on screen with nothing else to say.
    flash(
      `Practising “${topic.title}” — ${run?.total ?? 0} to go.`,
      again && "roll again",
      again,
    );
  };

  /**
   * Let the die choose the topic.
   *
   * Choosing is the whole of how a run begins here, and that is right when
   * there is a topic in mind. When there is not — which is most evenings — it is
   * four taps and a decision standing between a student and the thing they
   * opened the app to do. So one tap chooses, weighted towards what they have
   * answered least (`Session.rollTopic`), and a roll they do not like costs one
   * more tap on the toast rather than a trip back to the index.
   *
   * It goes through `drillTopic` unchanged: a rolled topic is entered exactly
   * as a chosen one is, so there is no second way onto a topic to keep in step.
   */
  const rollTopic = (refused?: string) => {
    navigator.vibrate?.(8);
    /*
     * Whatever is on screen is passed as the one to avoid: a die that hands
     * back the topic already open has done nothing visible, and the student
     * reads that as a broken button rather than as a coincidence.
     *
     * `refused` is what the toast's own roll passes, and it has to be passed
     * rather than read off `sectionId`. The toast holds the handler from the
     * render that raised it, so its `sectionId` is what was on screen *before*
     * that roll landed — one render behind, and behind by exactly the topic
     * being refused.
     */
    const rolled = session.rollTopic(
      Math.random,
      new Date(),
      refused ?? sectionId ?? undefined,
    );
    if (!rolled) {
      flash("Nothing to roll — every topic with questions is off the die.");
      return;
    }
    drillTopic(rolled, () => rollTopic(rolled.sectionId));
  };

  /** Take a topic off the die, or put it back. */
  const toggleRoll = (topic: TopicProgress) => {
    navigator.vibrate?.(8);
    const off = session.isExcludedFromRoll(topic.sectionId);
    if (off) session.allowInRoll(topic.sectionId);
    else session.excludeFromRoll(topic.sectionId);
    save();
    bump();
    flash(
      off
        ? `“${topic.title}” is back on the die.`
        : `The die will skip “${topic.title}”.`,
    );
  };

  /** Mark a topic to come back to, or take the mark off. */
  const toggleStar = (topic: TopicProgress) => {
    navigator.vibrate?.(8);
    const on = session.isStarred(topic.sectionId);
    if (on) session.unstar(topic.sectionId);
    else session.star(topic.sectionId);
    save();
    bump();
    flash(on ? `Unstarred “${topic.title}”.` : `Starred “${topic.title}”.`);
  };

  /**
   * Put a topic into the review pile, because the offer was accepted.
   *
   * `dismissTopic` read backwards, and the only way a topic gets a card now.
   * It deliberately does not navigate: the card it was tapped on stays put and
   * turns from a question into the ordinary landing, so the interval the offer
   * quoted is still on screen underneath the answer. Moving on is the next tap,
   * and it is the same one it always was.
   *
   * `session.enrolTopic` files under the primary topics the section teaches, so
   * this is handed whatever the round was filed under rather than the page it
   * was read through — a further grammar's section teaching two primary topics
   * enrols both, which is the lockstep everything else here moves in.
   */
  const enrolTopic = (target: string, title: string) => {
    navigator.vibrate?.(8);
    session.enrolTopic(target);
    save();
    // Read the date back off the engine rather than keeping the offer's: the
    // two agree to the second, and the one on disk is the one that is true.
    const landed = session.landedRound();
    setPhase((p) =>
      p.t === "landed" && p.round
        ? {
            ...p,
            round: {
              ...p.round,
              scheduled: true,
              due: landed?.due ?? p.round.due,
            },
          }
        : p,
    );
    bump();
    flash(`“${title}” is in your reviews.`);
  };

  /**
   * Take a topic out of the review pile, from wherever it was asked for.
   *
   * The grammar half of `removeVocab`, and it has to do the same two things:
   * write the deletion, and get off the round the deleted thing was under. A
   * dismissal taken mid-review would otherwise be undone by that round's next
   * grade, which rebuilds the card from what it stood at before the round.
   */
  const dismissTopic = (target: string, title: string) => {
    // Whether the round in flight was this topic's is the engine's answer, not
    // a string comparison here: `target` may be a further grammar's section and
    // the round is filed under the primary topic it teaches.
    const had = session.progress().openRound !== null;
    session.dismissTopic(target);
    const took = had && session.progress().openRound === null;
    save();
    flash(`“${title}” is out of the review pile.`);
    if (took) advance();
    else bump();
  };

  /**
   * Take one card off the schedule now, rather than whichever the pile hands
   * over next.
   *
   * The list of what is waiting was a list and nothing else: the only way in to
   * any of it was the Review switch, which serves the card that came due
   * earliest. Two topics and a word waiting, and the one you had come back for
   * was three grades away.
   *
   * This is still a review — the card is due, its round is graded like any
   * other, and the errand goes with it, because a round shown as a review under
   * an "Explore" switch would be naming something that is not happening.
   */
  const reviewNow = (entry: ScheduleEntry) => {
    navigator.vibrate?.(8);
    leaveRound();
    setOverlay(null);
    const wasExploring = mode === "explore";
    setMode("review");

    if (entry.kind === "sentence") {
      // As with a word, and for its reason: no topic stands behind a kept
      // sentence, and the last one left standing would put a grammar title
      // over a card that is not about it.
      setSectionId(null);
      setTest(null);
      setVia(null);
      setPhase({ t: "sentence-review", cardId: entry.id, revealed: false });
    } else if (entry.kind === "vocab") {
      // No topic stands behind a word: letting the last one stay would put a
      // grammar title and its prose above a vocabulary card.
      setSectionId(null);
      setTest(null);
      setVia(null);
      setPhase({ t: "vocab-review", cardId: entry.id, revealed: false });
    } else {
      // Narrowed by the quoted-only preference exactly as the loop's own
      // reviews are, floor and all: the same card reached from the pile and
      // from the queue must come back on the same kind of question.
      const served = session.serveReview(entry.id);
      // The sheet only offers rows it can serve, so this is the pack having
      // changed underneath. Nothing happens rather than a blank round — and,
      // unlike the loop's own pass, no grade is invented for it.
      if (!served) return;
      // Derived rather than assumed false. A card cannot come due without
      // having been graded, so this will not fire — but the loop teaches
      // before testing on ground it has not covered, and a round that is
      // served here should not be the one exception.
      const fresh = !session.everGraded(entry.id);
      setSectionId(entry.id);
      setTest(served);
      setQIndex(0);
      setVia("review");
      setPhase({ t: "answering" });
      setOverlay(fresh ? { t: "grammar", sectionId: entry.id } : null);
      session.beginRound(entry.id, served, fresh, "review");
    }

    save();
    bump();
    // Only when the errand changed under the student, and in the switch's own
    // words. What was tapped is on screen with its title in the header, so
    // naming it again would be the toast telling you what you can see.
    if (wasExploring) flash(`Back to the reviews — ${dueNow} waiting.`);
  };

  // --- vocabulary ----------------------------------------------------------

  /**
   * Fetch the dictionary if this device has not got it yet, and say whether it
   * is now in hand.
   *
   * The answer is what callers with something to do next need — the prefetch
   * decides whether to go on to the paradigms by it, and Settings says whether
   * the download worked — so the failure is reported here rather than thrown:
   * every caller wants to carry on, and none of them wants a rejection.
   *
   * `bump` is left out of the dependencies deliberately. It is rebuilt every
   * render, and naming it would rebuild this — and so the prefetch effect
   * below — every render too. All it does is set a counter, and any version of
   * it does that.
   */
  const ensureDictionary = useCallback(async (): Promise<boolean> => {
    if (dictionaryReady()) return true;
    setDictLoading(true);
    try {
      await loadDictionary();
      setDictFailed(false);
      // The moment a dictionary is in memory is the only moment cards saved
      // against an older one can be brought up to its citations.
      if (session.refreshCitations() > 0) {
        save();
        bump();
      }
      return true;
    } catch {
      // Remembered rather than only flashed: with no dictionary a lookup would
      // come back empty, and "no match" would blame the student's spelling for
      // a download that never happened.
      setDictFailed(true);
      return false;
    } finally {
      setDictLoading(false);
    }
  }, [save, session]);

  /**
   * Fetch the paradigms if this device has not got them yet.
   *
   * Kept apart from the dictionary and asked for later: it is larger than the
   * dictionary's two files together and only this one gesture wants it, so the
   * crib is not made to pay for a table nobody opened.
   *
   * A failure is quiet but not silent. It used to be swallowed, and the sheet
   * then read exactly like a word that has no forms — telling a student that
   * `frater` does not change, which is a plain falsehood about a noun with a
   * full paradigm. The sheet is told instead, and can offer the fetch again.
   */
  const ensureParadigms = useCallback((): Promise<void> => {
    if (paradigms) return Promise.resolve();
    setParadigmsFailed(false);
    setParadigmsLoading(true);
    // The promise is handed back as well as acted on, for the one caller that
    // has something to say when the fetch is over: Settings reads the space in
    // use, and reading it while the largest file was still coming down reported
    // a figure short by the paradigms.
    return loadParadigms()
      .then(setParadigms)
      .catch(() => setParadigmsFailed(true))
      .finally(() => setParadigmsLoading(false));
  }, [paradigms]);

  /**
   * Fetch the pack's further books if this device has not got them, and
   * remember that it now has.
   *
   * Quiet on failure by design — see the prefetch below — but not invisible:
   * `booksLoading` is what keeps Settings from describing the seconds while
   * they are arriving as a download that did not happen.
   */
  const ensureBooks = useCallback(async (): Promise<void> => {
    if (booksReady) return;
    setBooksLoading(true);
    try {
      await prefetchGrammarBooks();
      setBooksReady(true);
    } catch {
      // Nothing to say here; the switch speaks for itself if it is ever
      // reached with no connection and no book.
    } finally {
      setBooksLoading(false);
    }
  }, [booksReady]);

  /**
   * Fetch the pack's further dictionaries if this device has not got them.
   *
   * Quiet on failure like the books, and for a stronger reason: a missing
   * lexicon costs a student nothing they can see. The sheet still shows the
   * citation, the gloss and the paradigm, and the article is what it would have
   * had *besides* those — so the honest thing is to show the sheet without it
   * rather than to raise a toast about a book nobody asked for.
   */
  const ensureLexica = useCallback(async (): Promise<void> => {
    if (dictionariesReady()) return;
    setLexicaLoading(true);
    try {
      await loadDictionaries(content);
      bump();
    } catch {
      // Nothing to say. See above.
    } finally {
      setLexicaLoading(false);
    }
    // `bump` is left out for the reason `ensureDictionary` leaves it out: it is
    // rebuilt every render, and naming it here would rebuild this, and so the
    // prefetch effect below, every render too — which fetches the dictionary
    // again on each one. All it does is set a counter.
  }, [content]);

  /**
   * Fetch everything this device has not got, as soon as it is up.
   *
   * The dictionary and the paradigms used to be fetched by the gesture that
   * first wanted them, which meant a student's first hold on a word bought them
   * a spinner instead of a headword. The bytes are the same bytes either way —
   * the only thing "on demand" ever saved was space on a device belonging to
   * someone who had already chosen to install a language tutor. So they are
   * fetched here instead, and the crib's spinner is left in place for the
   * narrow window where a student is faster than the download.
   *
   * In order rather than at once: the dictionary is what nearly every gesture
   * wants, the paradigms are what one of them does, and the pack's further
   * books are what a student may never open — so the common case does not queue
   * behind the rare one on a phone's connection. And through
   * `ensureDictionary`, not `loadDictionary`, so that a prefetch and a tap
   * share one path — the citation refresh and the failed-state flag are that
   * function's business and would otherwise have to be remembered twice. It
   * does mean both indexes are built at boot rather than on first use, which
   * costs a moment of a phone's CPU to save every later gesture its wait.
   *
   * The books are fetched and not parsed, which is why they are the one link
   * with nothing to report. A failure here costs a student nothing until they
   * switch books with no connection, and the switch already says so in its own
   * words — where a toast raised now would be about a book nobody has named.
   *
   * A failure stops the chain: it is nearly always the whole network being
   * absent, and there is nothing to learn from failing to fetch the larger file
   * as well. `online` brings them all back. Running twice is safe — the loader
   * hands back its in-flight promise and both `ensure` functions return early
   * once their file is in memory — which is what makes the retry, and React's
   * double-mounted effects in development, harmless. The books' own fetch is
   * the exception and does not need to be: a repeat is served by the cache the
   * first one filled.
   */
  const prefetchContent = useCallback(() => {
    void ensureDictionary().then(async (got) => {
      if (!got) return;
      await ensureParadigms();
      await ensureBooks();
      // Last, and deliberately: Lewis & Short is larger than everything above
      // it put together, and it is the only one of them a student can do
      // without — every other gesture already has what it needs by here.
      await ensureLexica();
    });
  }, [ensureDictionary, ensureParadigms, ensureBooks, ensureLexica]);

  useEffect(() => {
    prefetchContent();
    window.addEventListener("online", prefetchContent);
    return () => window.removeEventListener("online", prefetchContent);
  }, [prefetchContent]);

  const openVocab = (
    prefill?: string,
    auto = false,
    context?: NewVocabContext,
  ) => {
    setOverlay((open) => ({
      t: "vocab-input",
      prefill,
      auto,
      context,
      back: under(open),
    }));
    void ensureDictionary();
  };

  /**
   * The one place a context is made, whichever sentence it came out of — the
   * question being answered, a line a card has already kept, or an answer on the
   * record.
   *
   * The preference is read here as an early-out and not as the decision:
   * `Session.addVocabContext` checks it too, deliberately, so that the phone and
   * the terminal cannot drift apart on it. What the check buys *here* is that a
   * sentence never rides onto an overlay to be shown back to a student who asked
   * not to keep any.
   *
   * An index that is absent or below zero means nothing was pointed at, and the
   * field is left off rather than written as −1.
   */
  const contextOf = (
    prompt: string,
    sentence: string,
    source: "answer" | "submitted",
    index?: number,
  ): NewVocabContext | undefined => {
    if (!session.keepsContext() || !sentence) return undefined;
    return {
      prompt,
      sentence,
      source,
      ...(index === undefined || index < 0 ? {} : { index }),
    };
  };

  /**
   * The sentence a word was just held in, ready to be kept with it.
   *
   * Built here rather than in the screen because it is the card's business and
   * not the question's, and undefined the moment there is nothing honest to
   * build: no question on screen, the preference turned off, or — on a revealed
   * answer — no sentence of the student's own to point at.
   */
  const contextFor = (
    where: "answer" | "submitted",
    index?: number,
  ): NewVocabContext | undefined =>
    question
      ? contextOf(
          question.prompt,
          where === "answer" ? question.answer : submitted.trim(),
          where,
          index,
        )
      : undefined;

  /**
   * Show or hide the words behind the question.
   *
   * `ensureDictionary` is still called on the way open, even though the launch
   * has already asked for it: a student can be quicker than the download, and
   * on that one occasion this is what puts the crib's spinner up rather than
   * a word list that reports every word unknown.
   */
  const toggleVocab = () => {
    if (!showVocab) void ensureDictionary();
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

  const lookupWord = (form: string, context?: NewVocabContext) => {
    const candidates = content.lookup(form);
    if (candidates.length === 0) {
      // Not a verdict on the spelling: the dictionary is large but finite, and
      // a miss is most often a name or a form it cannot cut. The student has
      // already said this word is worth keeping, so the card is offered by hand
      // rather than the word being dropped with a toast.
      setOverlay((open) => ({
        t: "vocab-new",
        form: form.trim(),
        context,
        back: under(open),
      }));
      return;
    }
    if (candidates.length === 1) return saveWord(candidates[0]!, context);
    setOverlay((open) => ({
      t: "vocab-pick",
      form: form.trim(),
      candidates,
      context,
      back: under(open),
    }));
  };

  /**
   * The tail every hold shares. The three gestures below differ only in which
   * sentence they can honestly name, and that is settled before this runs.
   */
  const takeWord = (word: string, context?: NewVocabContext) => {
    if (dictionaryReady()) return lookupWord(word, context);
    // Nothing to look up against yet — the sheet takes the word and fetches.
    // The sentence goes with it, so the download does not cost the context.
    openVocab(word, true, context);
  };

  /**
   * A word held down in the answer or the reference. The gesture is cheap, so
   * the way back has to be cheap too: the toast that confirms the save is also
   * the way into the card, where it can be corrected or deleted.
   */
  const holdWord = (word: string, where: "answer" | "submitted", index?: number) =>
    takeWord(word, contextFor(where, index));

  /**
   * A word held down in a sentence some *other* card has already kept.
   *
   * The card that gets written is the held word's and never the one being
   * reviewed, and the sentence goes across unchanged — so a word first met in
   * the line about the soldiers is filed under that same line, which is the
   * whole reason a card keeps one. Holding the reviewed card's own word finds
   * the context already there and says so rather than doubling it.
   *
   * The context arrives built rather than being derived from `question`: there
   * is no question on screen here at all, and the line is a record the app made
   * earlier rather than anything the student is answering now.
   */
  const holdSavedWord = (word: string, kept: VocabContext, index: number) =>
    takeWord(word, contextOf(kept.prompt, kept.sentence, kept.source, index));

  /**
   * A word held down in an answer already on the record.
   *
   * The attempt's own reference, not the question's answer today: a pack's
   * questions are regenerated under a trail that can be months old, which is why
   * an attempt carries its own copy of what it was shown. `.trim()` because the
   * trail draws the trimmed line, and the card has to keep the sentence that was
   * actually on the screen.
   */
  const holdPastWord = (
    word: string,
    attempt: Attempt,
    where: "answer" | "submitted",
    index: number,
  ) =>
    takeWord(
      word,
      contextOf(
        attempt.prompt,
        where === "answer" ? attempt.answer : attempt.submitted.trim(),
        where,
        index,
      ),
    );

  /**
   * A word typed into *record a word* rather than pointed at.
   *
   * There is no press to say which sentence it came from, so the question is
   * asked of the two sentences themselves — the same question the terminal has
   * to ask, answered by the same function, so the two surfaces cannot disagree
   * about which line a word was met in.
   */
  const typedWordContext = (form: string): NewVocabContext | undefined => {
    if (!question) return undefined;
    const site = locateWord(
      form,
      { answer: question.answer, submitted: submitted.trim() },
      content.fold,
    );
    return contextFor(site?.source ?? "answer", site?.index);
  };

  /**
   * A word double-clicked, to be looked at rather than saved.
   *
   * Nothing here commits anything, so nothing here asks. A form the dictionary
   * has not got opens no sheet at all: an inspection with nothing to show is
   * more confusing than a gesture that quietly did nothing, and the hold is
   * still there for a word worth writing out by hand.
   */
  const inspectWord = (word: string) => {
    ensureParadigms();
    const open = () => {
      const [entry, ...others] = content.lookup(word);
      if (!entry) return;
      // The functional form is load-bearing here and not a style: on a cold
      // device this runs after the download below, and an `overlay` read when
      // the word was double-clicked would by then name a sheet that has closed.
      setOverlay((was) => ({
        t: "inspect",
        form: word.trim(),
        entry,
        others,
        back: under(was),
      }));
    };
    if (dictionaryReady()) return open();
    // Nothing to look up against yet. `content.lookup` is synchronous and
    // would come back empty, so the first double-click on a fresh device
    // would quietly do nothing — which is indistinguishable from the gesture
    // not existing. Wait for the download this one time instead.
    void ensureDictionary().then((got) => {
      if (got) open();
    });
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
   * Anything the screen offers to copy, and what to call it once it is copied.
   *
   * `writeText` is called in the tap itself with nothing awaited in front of
   * it, because Safari allows the write only while the gesture is still fresh.
   * There is no `execCommand` fallback: the app is served over https and
   * localhost, where the API is there, and the case left over — a dev build
   * reached over plain http on a LAN address, to try the gestures on a real
   * phone — is told so rather than answered with a hidden textarea that would
   * then live in the DOM for everyone.
   *
   * Both callers come through here rather than each writing their own, so that
   * the gesture-freshness rule and the two failure messages have one home.
   */
  const copyToClipboard = (text: string, what: string) => {
    // Not `navigator.clipboard?.writeText(…)`: optional chaining would carry
    // past the failure handler too, and a browser without the API would answer
    // a press with nothing at all.
    if (!navigator.clipboard) {
      flash("This page cannot reach the clipboard.");
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => flash(`${what} copied.`),
      () => flash("Could not copy."),
    );
  };

  /**
   * One of the graded screen's three texts onto the clipboard.
   *
   * Which text is named rather than handed over, exactly as a mark is: the
   * screen has one word for each of its three texts, and this is the one place
   * they are turned back into strings.
   */
  const copyText = (field: keyof AttemptMarks) => {
    if (!question) return;
    const text =
      field === "prompt"
        ? question.prompt
        : field === "answer"
          ? question.answer
          : submitted.trim();
    copyToClipboard(text, COPIED[field]);
  };

  /**
   * A single word onto the clipboard, from the sheet it was double-clicked open
   * in — the inflected form as it stood, which is what the app has and the
   * dictionary or message being pasted into has not.
   *
   * It names itself in the flash, because unlike the three texts it has no
   * standing name: `rosam copied.` says which of the sentence's words went,
   * which a fixed "The word copied." could not.
   */
  const copyForm = (form: string) => copyToClipboard(form, form);

  /**
   * One sentence a card has kept, off the back of that card.
   *
   * The L2 alone: the English above it and the citation beside it stay on the
   * screen and off the clipboard, the same rule the reference answer's button
   * follows. `COPIED` is reused rather than reworded, because a card's block *is*
   * the graded screen's block kept — the sentence was labelled "Reference" or
   * "You wrote" when it was taken, and it says the same thing here.
   */
  const copyKept = (kept: VocabContext) =>
    copyToClipboard(kept.sentence, COPIED[kept.source]);

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
  const holdCribWord = (word: VocabWord) => {
    // The row stands for a form, not for a position, so the position is found:
    // the crib is built out of the reference answer's own words, so the form is
    // in there, and its first occurrence is the one the crib's dedupe kept.
    const index = question
      ? words(question.answer).findIndex(
          (w) => content.fold(w) === content.fold(word.form),
        )
      : -1;
    const context = contextFor("answer", index);
    return word.entry
      ? saveWord(word.entry, context)
      : holdWord(word.form, "answer", index);
  };

  /**
   * A row double-clicked in the crib. Same reasoning as the hold above: the
   * row is already the answer to "which word is this", so it opens on its own
   * entry with the readings it set aside offered beside it.
   */
  const inspectCribWord = (word: VocabWord) => {
    if (!word.entry) return;
    ensureParadigms();
    setOverlay((was) => ({
      t: "inspect",
      form: word.form,
      entry: word.entry!,
      others: word.others,
      back: under(was),
    }));
  };

  const saveWord = (entry: LemmaEntry, context?: NewVocabContext) => {
    // Asked before recording, because afterwards every word is one you had.
    const known = session.vocabCard(session.vocabIdFor(entry)) !== undefined;
    // And read before closing, for the same reason: what the gesture was made
    // over is the one thing finishing it is about to overwrite. A hold in the
    // trail happens while a sheet is open, and taking a word must not cost the
    // page it was read on.
    const back = under(overlay);
    const id = session.recordVocab(entry);
    const kept = context ? session.addVocabContext(id, context) : "off";
    save();
    setOverlay(back);
    // A hold on a word already saved used to do nothing at all, and if it goes
    // on looking like nothing the student will take the append for a miss. So
    // the toast says which of the several things actually happened.
    flash(
      kept === "full"
        ? `${entry.citation} already keeps ${MAX_CONTEXTS} sentences`
        : known
          ? kept === "added"
            ? `Another sentence on ${entry.citation}`
            : `${entry.citation} is already saved`
          : `Saved ${entry.citation}`,
      "Edit",
      () => setOverlay({ t: "vocab-edit", cardId: id, back }),
    );
    bump();
  };

  const moveContext = (cardId: string, at: string, dir: -1 | 1) => {
    session.moveVocabContext(cardId, at, dir);
    save();
    bump();
  };

  const editContext = (
    cardId: string,
    at: string,
    patch: { prompt: string; sentence: string },
  ) => {
    session.updateVocabContext(cardId, at, patch);
    save();
    bump();
  };

  const removeContext = (cardId: string, at: string) => {
    session.deleteVocabContext(cardId, at);
    save();
    bump();
  };

  const toggleKeepContext = () => {
    session.setKeepContext(!session.keepsContext());
    save();
    bump();
  };

  const toggleQuotedOnly = () => {
    session.setQuotedOnly(!session.quotedOnly());
    save();
    bump();
  };

  const toggleQuotedFirst = () => {
    session.setQuotedFirst(!session.quotedFirst());
    save();
    bump();
  };

  /*
   * How many questions a round is for. Not a toggle, so it takes the value
   * rather than flipping one — 0 is "however many the test holds", which is
   * what the setting reads as when nobody has touched it.
   *
   * A round in flight keeps the length it opened with: the window is written on
   * the round, and this only decides the next one. Changing the setting on
   * question two of four and watching the round end at question two would be
   * the app moving a finish line the student was already running at.
   */
  const setRoundLength = (n: number) => {
    session.setQuestionsPerRound(n);
    save();
    bump();
  };

  const editVocab = (cardId: string, patch: { citation: string; gloss: string }) => {
    session.updateVocab(cardId, patch);
    save();
    bump();
  };

  const removeVocab = (cardId: string) => {
    // Read before it goes: this is the card the undo puts back, and after the
    // delete there is nothing left to ask for it with.
    const deleted = session.vocabCard(cardId);
    session.deleteVocab(cardId);
    save();
    /*
     * The only destructive single press in the app that had no way back.
     * A grade has an undo, a word did not — it flashed "Word deleted." and that
     * was the whole of it, on a card the student may have spent a month's
     * reviews on.
     *
     * One card is put back rather than a whole snapshot restored, which is what
     * the grade undo does. The toast lasts 2.6 seconds and a question can be
     * answered inside it; a snapshot would take that grade back as well.
     *
     * The loop is not rewound. Deleting the card under review advances past it,
     * and a card put back afterwards is back in the deck rather than back on
     * the screen — which is the honest thing for it to be, since the schedule
     * has already moved on.
     */
    flash(
      "Word deleted.",
      deleted && "Undo",
      deleted &&
        (() => {
          session.restoreVocab(deleted);
          save();
          bump();
          flash("Word put back.");
        }),
    );
    // Deleting the card that is being reviewed leaves the phase pointing at
    // something the session no longer has, and the review body renders nothing
    // for a card it cannot find — an empty screen with no grade bar and no way
    // on. Grading advances the loop; deleting has to as well.
    if (phase.t === "vocab-review" && phase.cardId === cardId) advance();
    else bump();
  };

  // --- kept sentences ------------------------------------------------------

  /**
   * Keep the question on screen as a card of its own.
   *
   * The marks ride along exactly as they stand — the ones made in this sitting,
   * before the grade has stored them — minus what the student wrote, which the
   * card does not draw. A card is a copy of a moment, so a second press months
   * later changes nothing, and the toast says which of the two happened rather
   * than flashing "kept" over a press that did nothing.
   */
  const keepSentence = () => {
    if (!question || !sectionId) return;
    const { outcome } = session.keepSentence(question, sectionId, {
      ...(marks.prompt ? { prompt: marks.prompt } : {}),
      ...(marks.answer ? { answer: marks.answer } : {}),
    });
    save();
    bump();
    flash(
      outcome === "kept"
        ? "Sentence kept — it comes back for review."
        : "You already have that one.",
      "See it",
      () => setOverlay({ t: "sentence-list", back: under(overlay) }),
    );
  };

  const gradeSentence = (cardId: string, rating: Rating) => {
    navigator.vibrate?.(8);
    setUndo(takeUndo(phase));
    session.gradeSentence(cardId, rating);
    save();
    // A sentence has no round behind it, so there is nothing to land on —
    // unless this was the last thing waiting, which is a moment whichever kind
    // of card ended it. No burst, for the reason `grade` gives.
    if (mode === "review" && session.stats().due === 0) {
      setPhase({ t: "landed", cleared: true });
      setSectionId(null);
      setTest(null);
      save();
      bump();
      return;
    }
    advance();
  };

  /**
   * Forget a kept sentence, with a way back — `removeVocab`'s bargain exactly,
   * and for its reasons: one card put back rather than a whole snapshot, and
   * the loop advanced rather than rewound.
   */
  const forgetSentence = (cardId: string) => {
    const deleted = session.sentenceCard(cardId);
    session.deleteSentence(cardId);
    save();
    flash(
      "Sentence forgotten.",
      deleted && "Undo",
      deleted &&
        (() => {
          session.restoreSentence(deleted);
          save();
          bump();
          flash("Sentence put back.");
        }),
    );
    if (phase.t === "sentence-review" && phase.cardId === cardId) advance();
    else bump();
  };

  // --- settings ------------------------------------------------------------

  useEffect(() => storage.onStateChange(setSyncState), [storage]);

  /**
   * The device stopped being able to keep the progress, and says so.
   *
   * The one thing in this app that is worth interrupting a question for. A
   * full device does not announce itself: every grade still lands, the loop
   * still moves, and the whole session goes on the next reload. Sync is where
   * a failure is normally reported quietly, but that is a mirror most students
   * never set up — so this is said out loud, once, wherever they are.
   *
   * Export is the action because it is the one that works: it builds the file
   * in memory and hands it to the browser, needing none of the room that has
   * just run out.
   */
  useEffect(
    () =>
      storage.onLocalFailure(() =>
        flash(
          "This device is out of room — your progress is no longer being saved.",
          "Export",
          () => exportProgress(session.progress()),
        ),
      ),
    [storage, session],
  );

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

  /**
   * Point sync at a repo, and push this device's copy to it.
   *
   * This is the deliberate overwrite, so it is allowed to win — but not
   * silently. Connecting to a repo that already holds a newer copy is how a
   * second device gets set up, and pushing first would erase the very progress
   * the person was connecting in order to reach.
   */
  const configureSync = (cfg: SyncConfig | null) => {
    storage.configure(cfg);
    if (!cfg) {
      flash("Sync turned off.");
      return;
    }
    void storage
      .fetchRemote()
      .catch(() => null)
      .then((remote) => {
        const local = session.progress();
        if (remote && remote.updatedAt > local.updatedAt) {
          setOverlay({ t: "overwrite", remote });
          return;
        }
        return storage.saveNow(local).then(() => flash("Connected to GitHub."));
      });
  };

  const adopt = (progress: Progress, opts: { synced?: boolean } = {}) => {
    storage.adopt(progress, opts);
    // The engine holds progress by reference, so a swap means a fresh page —
    // and nothing of this one's may be written on the way out, or the draft
    // kept on `pagehide` puts the replaced progress straight back.
    storage.seal();
    location.reload();
  };

  /**
   * Take the copy GitHub holds. Marked as synced, because after this the two
   * agree — without which the next session would count the adopted copy as
   * work of this device's and refuse to catch up again.
   */
  const adoptRemote = (progress: Progress) => adopt(progress, { synced: true });

  const doImport = async () => {
    const raw = await pickProgressFile();
    if (!raw) return;
    try {
      adopt(importProgress(raw, content));
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  // --- space on this device -------------------------------------------------

  const refreshSpace = useCallback(() => {
    void readStorage().then(setSpace);
  }, []);

  // Read when Settings opens, and again when it is on screen and a download
  // finishes, so the figure is never one the student has watched go stale.
  useEffect(() => {
    if (overlay?.t === "settings") refreshSpace();
  }, [overlay?.t, refreshSpace]);

  /**
   * Ask to be exempt from eviction, in answer to a press.
   *
   * The same request goes out silently at launch where the browser grants it
   * without asking. This is the other branch: a browser that wants a permission
   * dialog gets to raise one here, where a student has just pressed the button
   * that means *keep this*.
   */
  const askPersistence = () => {
    void requestPersistence().then((granted) => {
      refreshSpace();
      flash(
        granted
          ? "This device will keep the download."
          : "Your browser would not promise to keep it.",
      );
    });
  };

  /**
   * The offline download, asked for by hand.
   *
   * It is no longer the ordinary way to the dictionary — the launch already
   * fetches it. What is left is the launch that happened on a train: this is
   * the way back for a student who watched that fail and has since found a
   * signal, which is why the button says so only when it has something to
   * retry.
   *
   * It fetches what the launch would have, in the same order, and waits for all
   * of it before saying so. It used to announce the download and read the space
   * in use while the paradigms and the books were still arriving — a figure
   * short by the largest file of the three, printed under the words "saved to
   * this device", on the one screen a student opens to check exactly that.
   */
  const cacheContent = () => {
    void ensureDictionary().then(async (got) => {
      if (got) {
        await ensureParadigms();
        await ensureBooks();
      }
      flash(
        got
          ? "Saved to this device for offline use."
          : "Could not fetch it — are you offline?",
      );
      refreshSpace();
    });
  };

  // --- render --------------------------------------------------------------

  /**
   * What is on screen and why, in one word.
   *
   * Not the errand — the switch says that. This is the round: a due review, a
   * topic the book has just reached and one it has come back to are three
   * different things happening under "Explore" and "Review", and were left
   * looking identical.
   */
  const badge =
    phase.t === "vocab-review"
      ? "vocab"
      : phase.t === "sentence-review"
        ? "sentence"
        : phase.t === "done" || phase.t === "practised" || phase.t === "landed"
          ? null // nothing is being worked on; the app's own name stands here
          : via;
  const badgeLabel: Record<string, string> = {
    review: "review",
    new: "new",
    drill: "drill",
    vocab: "vocabulary",
    sentence: "kept",
  };
  // How far through a run of practice you are, said where the round is already
  // named. It used to be a chip of its own reading "practising <topic> · 2/5",
  // which spent a whole row repeating the title the row below carries. Only a
  // drill has a run behind it, so only a drill counts.
  const runProgress =
    badge === "drill" && sectionId ? session.practice(sectionId) : null;

  // The round has to be named, or the four buttons preview the stored card —
  // which the round's earlier grades have already moved, and which the next
  // grade rewinds past. Unnamed, they promise intervals the round cannot reach.
  const schedule = sectionId
    ? session.previewTopic(sectionId, new Date(), test?.id)
    : undefined;
  // Once `again` has been given the round is settled at its worst, so all four
  // buttons bring the topic back at the same moment. True, but four identical
  // numbers read as a fault, so the bar says it in words instead.
  const roundSettled =
    sectionId && test ? session.roundWorst(sectionId, test.id) === 1 : false;
  // Read on the graded screen, where the grade has not been given yet — so the
  // attempt being made is not among these, and every row is an earlier one.
  const attempts = sectionId ? session.attemptsFor(sectionId) : [];
  const nextDue = session.nextDue();

  return (
    // The errand reaches the stylesheet here: reviewing and exploring are
    // different enough to be worth telling apart from across the room, and a
    // colour does that before any word is read.
    <div className="app" data-mode={mode}>
      {/* Two rows, because the switch, the round's badge and four tap targets
          leave a phone-width line no room for a title — and Bennett's titles
          run to "Verbs in -io of the Third Conjugation". The topic gets the
          second line, sharing it only with the count, which is short and
          right-aligned and leaves the title everything else. */}
      <header className="status">
        <div className="status__row">
          {/* The two errands, both always on screen. Three links used to say
              the same two things one at a time — "set these aside and
              explore", "back to reviews", "back to the book" — so whichever
              state you were not in was invisible, and the one you were in
              looked like the only one there was.

              Both halves grey out together when nothing is due: with no pile
              to go back to, Review is not a place to be, and dimming the pair
              says so better than a live button that would bounce straight
              back. */}
          <div className="modes" role="group" aria-label="What to study">
            <button
              className="modes__pick"
              aria-pressed={mode === "explore"}
              disabled={dueNow === 0}
              onClick={() => chooseMode("explore")}
            >
              Explore
            </button>
            <button
              className="modes__pick"
              aria-pressed={mode === "review"}
              disabled={dueNow === 0}
              onClick={() => chooseMode("review")}
            >
              Review
            </button>
          </div>
          {badge && (
            <span className={`badge badge--${badge}`}>
              {badgeLabel[badge]}
              {runProgress ? ` ${runProgress.done}/${runProgress.total}` : ""}
            </span>
          )}
          <span className="status__spacer" />
          {/* The tools travel together, and closed up: each is a tap target
              with its own margin around the glyph, so the row's gap between
              them was width spent twice. On a 375px phone that width is the
              difference between the switch fitting on this line and not. */}
          <div className="status__tools">
            {/* Decoration, and hidden from screen readers on purpose: it says
                nothing that is not already in Settings, and announcing every
                push would talk over the question. */}
            {floppy && (
              <span className={`floppy floppy--${floppy}`} aria-hidden="true">
                💾
              </span>
            )}
            {/* Offered only while there is a grade to take back, and on
                whatever screen the grade landed you on. */}
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
            {/* Beside the index, because it answers the same question the
                index does — what shall I study — and answers it for you. The
                pair is the whole of how a run begins: pick one, or be handed
                one. */}
            <button
              className="iconbtn"
              onClick={() => rollTopic()}
              aria-label="Roll a topic to study"
            >
              🎲
            </button>
            <button
              className="iconbtn"
              onClick={() => setOverlay({ t: "settings" })}
              aria-label="Settings"
            >
              ⋯
            </button>
          </div>
        </div>
        <div className="status__row">
          {badge === "vocab" || badge === "sentence" ? (
            // A word is on screen, so the topic studied before it is not what
            // this line is about — and its prose is not what a student reaching
            // for help here wants. It says what is being worked on and stops
            // there: the word itself is the answer being graded, and printing
            // it above the gloss would give the card away.
            <span className="status__title">
              {badge === "vocab" ? "Vocabulary" : "A sentence you kept"}
            </span>
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
          {/* The count is the natural way in to the schedule: it is already
              the answer to "how much is waiting", and the sheet is the rest of
              that answer. It sits at the end of this line rather than the one
              above because the switch took that line's spare width, and the
              title has ellipsis to give where the count has none. */}
          <button
            className="status__counts"
            onClick={() => setOverlay({ t: "schedule" })}
            aria-label="What is coming up"
          >
            {/* What is due is what is due, on either errand. It used to read
                "N waiting" while exploring, which was a second number for the
                same pile and made the switch look like it had changed it. */}
            {dueNow > 0 ? `${dueNow} due` : `${stats.vocab} words`}
          </button>
        </div>
      </header>

      {/*
        * What just happened, for a reader who cannot see it happen.
        *
        * Answering → graded → landed replaces the whole `.study` subtree, and
        * it did so silently: the only live region in the app was the toast, so
        * a screen reader gave no sign that submitting had produced anything.
        * The student's own answer and the reference are both on screen at that
        * point and both are readable — what was missing was any signal to go
        * and read them.
        *
        * `polite` rather than `assertive`, because none of this interrupts
        * anything; and one short line rather than the screen's contents, since
        * the contents are in the document and announcing them twice is worse
        * than announcing them once.
        */}
      <p className="visually-hidden" role="status">
        {phase.t === "graded"
          ? "Answer shown beside the reference. Grade yourself 1 to 4."
          : phase.t === "landed"
            ? "Round finished."
            : phase.t === "answering"
              ? `Question ${qIndex + 1} of ${test?.questions.length ?? 0}.`
              : ""}
      </p>

      <div className="study">
        {phase.t === "answering" && question && (
          <Answering
            question={question}
            index={qIndex}
            total={test?.questions.length ?? 0}
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
                onInspect={inspectCribWord}
              />
            }
          />
        )}

        {phase.t === "graded" && question && (
          <Graded
            question={question}
            submitted={submitted}
            revealed={phase.revealed}
            index={qIndex}
            total={test?.questions.length ?? 0}
            schedule={schedule}
            settled={roundSettled}
            marks={marks}
            marking={marking}
            onGrade={grade}
            onResume={resumeWriting}
            onRecordWord={() => openVocab()}
            onHoldWord={holdWord}
            onInspectWord={inspectWord}
            onReadGrammar={() =>
              sectionId && setOverlay({ t: "grammar", sectionId })
            }
            onToggleMarking={() => setMarking((on) => !on)}
            onKeepSentence={keepSentence}
            kept={session.hasSentence(question.prompt, question.answer)}
            // Only on a review: this is the moment the topic has just shown it
            // is not what the student needs. On a run they chose the topic a
            // moment ago, and the way out is choosing another.
            onDismiss={
              via === "review" && sectionId
                ? () => {
                    if (!dismissing) {
                      setDismissing(true);
                      return;
                    }
                    setDismissing(false);
                    dismissTopic(
                      sectionId,
                      content.getSection(sectionId)?.title ?? "This topic",
                    );
                  }
                : undefined
            }
            dismissing={dismissing}
            onMark={markHere}
            onCopy={copyText}
            vocabulary={
              <QuestionVocabulary
                words={vocabulary}
                open={showVocab}
                status={dictStatus}
                onToggle={toggleVocab}
                onHold={holdCribWord}
                onInspect={inspectCribWord}
              />
            }
            history={
              <EarlierAnswers
                attempts={attempts}
                open={showTrail}
                onToggle={() => setShowTrail((open) => !open)}
                onMark={sectionId ? markPast(sectionId) : undefined}
                onHoldWord={holdPastWord}
                onInspectWord={inspectWord}
              />
            }
          />
        )}

        {phase.t === "sentence-review" &&
          (() => {
            const card = session.sentenceCard(phase.cardId);
            if (!card) return null;
            return (
              <SentenceReview
                card={card}
                revealed={phase.revealed}
                schedule={session.previewSentence(phase.cardId)}
                onReveal={() => setPhase({ ...phase, revealed: true })}
                onGrade={(r) => gradeSentence(phase.cardId, r)}
                onForget={() => {
                  if (forgetting !== phase.cardId) {
                    setForgetting(phase.cardId);
                    return;
                  }
                  setForgetting(null);
                  forgetSentence(phase.cardId);
                }}
                forgetting={forgetting === phase.cardId}
                /* The card's own sentence is what a word held here was met in,
                   so the vocabulary card it makes keeps that line — the same
                   bargain the graded screen strikes with its reference. */
                onHoldWord={(word, i) =>
                  takeWord(
                    word,
                    contextOf(card.prompt, card.answer, "answer", i),
                  )
                }
                onInspectWord={inspectWord}
                onCopy={() => copyToClipboard(card.answer, COPIED.answer)}
              />
            );
          })()}

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
                onHoldWord={holdSavedWord}
                onInspectWord={inspectWord}
                onCopy={copyKept}
              />
            );
          })()}

        {phase.t === "practised" &&
          (() => {
            const at = phase.sectionId;
            return (
              <Practised
                title={content.getSection(at)?.title ?? "this topic"}
                // What the run was for, not what the topic holds: under the
                // quoted-only preference a drill is over the quoted questions,
                // and reporting the whole bank would credit the student with
                // questions the run never showed them.
                total={session.coverage(at).total}
                scheduled={session.isScheduled(at)}
                // Previewed with no round named, which is the truth here: this
                // screen is reached through `advance`, which ends the round
                // first, so `enrolTopic` falls back to the same 3 this asks
                // for. The two agree by construction rather than by luck, and
                // `core.test.ts` holds them to it.
                due={session.previewTopic(at)[3]}
                onEnrol={() => enrolTopic(at, content.getSection(at)?.title ?? "this topic")}
                onAgain={() => {
                  session.drillTopic(at);
                  save();
                  advance("explore");
                }}
                onOpenMap={() => setOverlay({ t: "map" })}
              />
            );
          })()}

        {phase.t === "landed" && (
          <Landed
            title={
              phase.round
                ? // Named as the page it was read on, which is what the student
                  // was looking at — a further grammar's section, when they
                  // reached the questions through one.
                  (content.getSection(
                    phase.round.viewedAs ?? phase.round.sectionId,
                  )?.title ?? "this topic")
                : undefined
            }
            round={phase.round}
            cleared={phase.cleared}
            met={phase.met}
            nextDue={nextDue}
            onEnrol={
              phase.round
                ? // The topic the round was filed under, never the page it was
                  // reached through: `enrolTopic` maps that back out to every
                  // primary topic the page teaches, and handing it `viewedAs`
                  // would enrol a topic this round never touched.
                  () =>
                    enrolTopic(
                      phase.round!.sectionId,
                      content.getSection(
                        phase.round!.viewedAs ?? phase.round!.sectionId,
                      )?.title ?? "this topic",
                    )
                : undefined
            }
            onKeepGoing={() => {
              if (phase.cleared) {
                // The pile is empty, so Review is no longer somewhere to be —
                // the same conclusion `advance` draws for every other route,
                // drawn on a tap here instead of behind one.
                setMode("explore");
                advance("explore");
              } else {
                advance();
              }
            }}
            onStop={() => setOverlay({ t: "schedule" })}
          />
        )}

        {phase.t === "done" && (
          <Rest
            dueNow={dueNow}
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
          const sections = sectionsFor(overlay.sectionId);
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
          starred={starred}
          quotedOnly={session.quotedOnly()}
          currentFamily={
            families.find((f) =>
              f.topics.some((t) => t.sectionId === sectionId),
            )?.id
          }
          onClose={() => setOverlay(null)}
          onPick={(t) => setOverlay({ t: "topic", sectionId: t.sectionId })}
          books={books}
          grammarId={session.grammarId}
          onGrammar={switchGrammar}
          switching={switching}
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
              quotedOnly={session.quotedOnly()}
              // The map is where a topic is normally chosen, and where closing
              // one goes back to — unless it was opened from the page being
              // read, which is then what lies underneath.
              onClose={() => setOverlay(overlay.back ?? { t: "map" })}
              onRead={() =>
                setOverlay({ t: "grammar", sectionId: topic.sectionId, back: overlay })
              }
              onDrill={() => drillTopic(topic)}
              onQuestions={() =>
                setOverlay({ t: "questions", sectionId: topic.sectionId })
              }
              onStar={() => toggleStar(topic)}
              onToggleRoll={() => toggleRoll(topic)}
              onMark={markPast(topic.sectionId)}
              onHoldWord={holdPastWord}
              onInspectWord={inspectWord}
              elsewhere={elsewhereFor(topic.sectionId)}
              onElsewhere={(_book, sectionId) => {
                // Reading, not switching: the other book's page opens over the
                // topic sheet and closing it comes straight back. A student
                // comparing two explanations has not asked to change syllabus.
                setOverlay({ t: "grammar", sectionId, back: overlay });
              }}
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
              quotedOnly={session.quotedOnly()}
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
              onHoldWord={holdPastWord}
              onInspectWord={inspectWord}
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
          sentenceCount={stats.sentences}
          onOpenSentences={() =>
            setOverlay({ t: "sentence-list", back: { t: "schedule" } })
          }
          onStart={reviewNow}
          // Asked before the quoted-only preference narrows anything: what is
          // missing from a topic with no tests is content, not a choice the
          // student made, and the two want different words on the row.
          hasTests={(id) => session.hasTests(id)}
        />
      )}

      {overlay?.t === "sentence-list" && (
        <SentenceListSheet
          cards={session.sentenceList()}
          onClose={() => setOverlay(overlay.back ?? null)}
          onForget={(card) => forgetSentence(card.id)}
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
              onMoveContext={(at, dir) => moveContext(card.id, at, dir)}
              onEditContext={(at, patch) => editContext(card.id, at, patch)}
              onDeleteContext={(at) => removeContext(card.id, at)}
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
            onHoldWord={holdPastWord}
            onInspectWord={inspectWord}
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
          // A word held on the question arrives with the sentence it was held
          // in; one typed into the box has to be found in the sentences first.
          onLookup={(form) =>
            lookupWord(form, overlay.context ?? typedWordContext(form))
          }
          onClose={() => setOverlay(overlay.back ?? null)}
        />
      )}

      {overlay?.t === "vocab-new" && (
        <VocabNewSheet
          form={overlay.form}
          // Written by hand, so there is no lemma to speak of: the form as it
          // was met is the word's identity, which is what dedupes the card.
          onSave={({ citation, gloss }) =>
            saveWord(
              {
                lemma: overlay.form,
                citation: citation.trim(),
                gloss: gloss.trim(),
                pos: "",
              },
              overlay.context,
            )
          }
          onClose={() => setOverlay(overlay.back ?? null)}
        />
      )}

      {overlay?.t === "vocab-pick" && (
        <VocabPickSheet
          form={overlay.form}
          candidates={overlay.candidates}
          onPick={(entry) => saveWord(entry, overlay.context)}
          onClose={() => setOverlay(overlay.back ?? null)}
        />
      )}

      {overlay?.t === "inspect" && (
        <InspectSheet
          form={overlay.form}
          entry={overlay.entry}
          // Read at render rather than carried on the overlay: the etymologies
          // arrive with the dictionary, and a sheet opened while that was still
          // in flight would otherwise hold the empty answer for as long as it
          // stayed open. The index answers the same way before and after — with
          // nothing — so there is no state here to keep in step.
          origin={etymology().paragraphsFor(overlay.entry.lemma, overlay.entry.pos)}
          others={overlay.others}
          forms={paradigms?.formsFor(overlay.entry.lemma, overlay.entry.pos)}
          // Asked per dictionary rather than merged, so each keeps its own name
          // and its own attribution — two lexica disagreeing about a word is
          // the reason to ship a second one, and a merged list would hide it.
          lexica={(profile.dictionaries ?? []).map((d) => ({
            id: d.id,
            label: d.label,
            licence: d.source.licence,
            articles: content.articlesFor(overlay.form, d.id),
          }))}
          loading={paradigmsLoading}
          failed={paradigmsFailed}
          onRetry={ensureParadigms}
          // Switching readings keeps the one showing among the others, so the
          // way back is the same tap that got here.
          onPick={(entry) =>
            setOverlay({
              t: "inspect",
              form: overlay.form,
              entry,
              others: [overlay.entry, ...overlay.others.filter((o) => o !== entry)],
              // Carried across: switching reading is a look at the same word,
              // and it must not cost the page the word was looked up from.
              back: overlay.back,
            })
          }
          onCopy={() => copyForm(overlay.form)}
          onClose={() => setOverlay(overlay.back ?? null)}
        />
      )}

      {overlay?.t === "settings" && (
        <SettingsSheet
          config={storage.currentConfig()}
          state={syncState}
          onConfigure={configureSync}
          onExport={() => exportProgress(session.progress())}
          onImport={() => void doImport()}
          salvaged={salvaged !== null}
          onExportSalvaged={() => salvaged && exportSalvaged(salvaged)}
          onDropSalvaged={() => {
            storage.dropSalvaged();
            setSalvaged(null);
            flash("Damaged file discarded.");
          }}
          onPull={() =>
            void storage
              .fetchRemote()
              .then((remote) => {
                if (!remote) {
                  flash("Nothing saved on GitHub yet.");
                  return;
                }
                // A pull replaces this device's copy wholesale, so what it can
                // destroy is whatever this device has not sent — whichever copy
                // happens to be the newer one. When there is none of that, the
                // pull is a plain catch-up and asking about it is noise.
                if (storage.hasUnpushed(session.progress())) {
                  setOverlay({ t: "discard", remote });
                  return;
                }
                if (remote.updatedAt === session.progress().updatedAt) {
                  flash("Already up to date.");
                  return;
                }
                adoptRemote(remote);
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
          // Not the dictionary alone, which is what this used to be and what
          // made "everything is on this device" a claim the app could make
          // while two files of it were still in the air. All three, and the
          // student is told so while any of them is still coming.
          offlineReady={dictionaryReady() && paradigms !== undefined && booksReady}
          dictionaryFailed={dictFailed}
          caching={dictLoading || paradigmsLoading || booksLoading || lexicaLoading}
          onCacheDictionary={cacheContent}
          space={space}
          onPersist={askPersistence}
          vocabCount={stats.vocab}
          onOpenVocab={() =>
            setOverlay({ t: "vocab-list", back: { t: "settings" } })
          }
          sentenceCount={stats.sentences}
          onOpenSentences={() =>
            setOverlay({ t: "sentence-list", back: { t: "settings" } })
          }
          keepContext={session.keepsContext()}
          onKeepContext={toggleKeepContext}
          quotedOnly={session.quotedOnly()}
          onQuotedOnly={toggleQuotedOnly}
          quotedFirst={session.quotedFirst()}
          onQuotedFirst={toggleQuotedFirst}
          questionsPerRound={session.questionsPerRound()}
          onQuestionsPerRound={setRoundLength}
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
            The copy on GitHub was saved {ago(overlay.remote.updatedAt)}, and
            this device has been studied since it last synced. Only one can be
            kept.
          </p>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                // Forced: the refusal in `GitHubStorage` exists to stop this
                // happening by accident, and this is the accident's opposite.
                void storage.saveNow(session.progress(), { force: true });
                setOverlay(null);
                flash("Kept this device's progress.");
              }}
            >
              Keep this device
            </button>
            <button
              className="btn btn--primary"
              onClick={() => adoptRemote(overlay.remote)}
            >
              Use the newer one
            </button>
          </div>
        </Sheet>
      )}

      {overlay?.t === "overwrite" && (
        <Sheet title="That repo already has progress" onClose={() => setOverlay(null)}>
          <p className="field__hint" style={{ marginTop: 0 }}>
            The copy on GitHub was saved {ago(overlay.remote.updatedAt)}, which
            is newer than this device's. Saving now replaces it.
          </p>
          <div className="actions">
            <button className="btn" onClick={() => adoptRemote(overlay.remote)}>
              Use the copy on GitHub
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                void storage
                  .saveNow(session.progress(), { force: true })
                  .then(() => flash("Connected to GitHub."));
                setOverlay(null);
              }}
            >
              Replace it with this device's
            </button>
          </div>
        </Sheet>
      )}

      {overlay?.t === "discard" && (
        <Sheet title="This device has unsaved progress" onClose={() => setOverlay(null)}>
          <p className="field__hint" style={{ marginTop: 0 }}>
            This device has been studied since it last synced, and pulling
            replaces its copy with the one on GitHub, saved{" "}
            {ago(overlay.remote.updatedAt)}. That work would be lost.
          </p>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                void storage
                  .saveNow(session.progress(), { force: true })
                  .then(() => flash("Pushed this device's progress instead."));
                setOverlay(null);
              }}
            >
              Push this device's instead
            </button>
            <button
              className="btn btn--primary"
              onClick={() => adoptRemote(overlay.remote)}
            >
              Pull anyway
            </button>
          </div>
        </Sheet>
      )}
      {/* Last, so it lies over every sheet, and inert: it never takes a tap. */}
      {confettiCanvas}
    </div>
  );
}
