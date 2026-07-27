import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Content,
  Session,
  type LemmaEntry,
  type Progress,
  type Rating,
  type Test,
  type TopicProgress,
} from "@latin-tutor/core";
import { dictionaryReady, loadDictionary } from "./content-loader.js";
import type { SyncState, SyncConfig } from "./storage/sync.js";
import { SyncingStorage } from "./storage/sync.js";
import {
  exportProgress,
  importProgress,
  pickProgressFile,
} from "./storage/transfer.js";
import { Sheet, Toast, ago } from "./ui.js";
import { Answering, Graded, Rest, VocabReview } from "./screens/Study.js";
import { GrammarSheet } from "./screens/Grammar.js";
import { AttemptTrail, MapSheet, TopicSheet } from "./screens/Map.js";
import { QuestionSheet, QuestionsSheet } from "./screens/Questions.js";
import { ScheduleSheet } from "./screens/Schedule.js";
import { SettingsSheet } from "./screens/Settings.js";
import {
  VocabEditSheet,
  VocabListSheet,
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
  isNewTopic: boolean;
  inPlacement: boolean;
  placementIndex: number;
}

type Overlay =
  | null
  | { t: "grammar"; sectionId: string; back?: Overlay }
  | { t: "map" }
  | { t: "topic"; sectionId: string }
  | { t: "attempts"; sectionId: string }
  | { t: "questions"; sectionId: string }
  | { t: "question"; sectionId: string; prompt: string }
  | { t: "schedule" }
  | { t: "vocab-list"; back?: Overlay }
  | { t: "vocab-edit"; cardId: string; back?: Overlay }
  /** `prefill` is a word held on the question; `auto` looks it up unattended. */
  | { t: "vocab-input"; prefill?: string; auto?: boolean }
  | { t: "vocab-pick"; form: string; candidates: LemmaEntry[] }
  | { t: "settings" }
  | { t: "conflict"; remote: Progress };

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
  const [isNewTopic, setIsNewTopic] = useState(false);

  const [inPlacement, setInPlacement] = useState(false);
  const [placementList, setPlacementList] = useState<string[]>([]);
  const [placementIndex, setPlacementIndex] = useState(0);

  const [phase, setPhase] = useState<Phase>({ t: "answering" });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [toast, setToast] = useState<Flash | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictFailed, setDictFailed] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(storage.currentState());
  const [tick, setTick] = useState(0);
  const [undo, setUndo] = useState<GradeUndo | null>(null); // the last grade, takeable

  const question = test?.questions[qIndex];
  const section = sectionId ? content.getSection(sectionId) : undefined;
  const bump = () => setTick((n) => n + 1);

  const save = useCallback(() => {
    void storage.save(session.progress());
  }, [session, storage]);

  const flash = (message: string, action?: string, onAction?: () => void) =>
    setToast({ message, action, onAction });
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // The engine is mutated in place, so views derive from it on every tick.
  const families = useMemo(() => session.familyProgress(), [session, tick]);
  const overall = useMemo(() => session.overallPercent(), [session, tick]);
  const stats = useMemo(() => session.stats(), [session, tick]);

  // --- the loop ------------------------------------------------------------

  const advance = useCallback(() => {
    setInput("");
    setSubmitted("");
    const action = session.next();
    if (action.kind === "done") {
      setSectionId(null);
      setTest(null);
      setPhase({ t: "done" });
      bump();
      return;
    }
    if (action.kind === "vocab-review") {
      setPhase({ t: "vocab-review", cardId: action.cardId, revealed: false });
      bump();
      return;
    }
    const served = session.serveTest(action.sectionId);
    if (!served) {
      // A topic with no tests cannot be studied; pass it so the scheduler moves
      // on rather than offering it again forever.
      session.gradeTopic(action.sectionId, 3);
      advance();
      return;
    }
    setSectionId(action.sectionId);
    setTest(served);
    setQIndex(0);
    setIsNewTopic(action.kind === "new-topic");
    setPhase({ t: "answering" });
    // Teach before testing on new ground, exactly as the CLI does.
    setOverlay(
      action.kind === "new-topic"
        ? { t: "grammar", sectionId: action.sectionId }
        : null,
    );
    bump();
  }, [session]);

  const loadPlacement = useCallback(
    (i: number, list: string[]) => {
      const id = list[i];
      if (id === undefined) {
        session.endPlacement();
        setInPlacement(false);
        advance();
        return;
      }
      const served = session.serveTest(id);
      if (!served) return loadPlacement(i + 1, list);
      setSectionId(id);
      setTest(served);
      setQIndex(0);
      setInput("");
      setSubmitted("");
      setIsNewTopic(false);
      setOverlay(null);
      setPhase({ t: "answering" });
      bump();
    },
    [advance, session],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (session.needsPlacement()) {
      // A run already under way is resumed where it stopped; only a fresh deck
      // starts one. Placement is otherwise lost to anything that reloads the
      // page — which on a phone is most ways a session ends.
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

  const placementGrade = (rating: Rating) => {
    if (!sectionId) return;
    if (rating >= 3) {
      session.passPlacement(sectionId);
      save();
      const next = placementIndex + 1;
      if (next < placementList.length) {
        setPlacementIndex(next);
        session.advancePlacement(next);
        save();
        loadPlacement(next, placementList);
        return;
      }
    }
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
    setIsNewTopic(undo.isNewTopic);
    setInPlacement(undo.inPlacement);
    setPlacementIndex(undo.placementIndex);
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
    if (inPlacement) return placementGrade(rating);
    if (!sectionId || !question) return;
    session.recordAttempt(sectionId, {
      prompt: question.prompt,
      answer: question.answer,
      submitted,
      rating,
    });
    session.gradeTopic(sectionId, rating);
    save();
    if (test && qIndex + 1 < test.questions.length) {
      setQIndex(qIndex + 1);
      setInput("");
      setSubmitted("");
      setOverlay(null);
      setPhase({ t: "answering" });
      bump();
    } else {
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
    save();
    setSectionId(topic.sectionId);
    setTest(served);
    setQIndex(0);
    setInput("");
    setSubmitted("");
    setIsNewTopic(topic.mastery === undefined);
    setPhase({ t: "answering" });
    setOverlay(
      topic.mastery === undefined
        ? { t: "grammar", sectionId: topic.sectionId }
        : null,
    );
    bump();
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

  const lookupWord = (form: string) => {
    const candidates = content.lookup(form);
    if (candidates.length === 0) {
      // Not a verdict on the spelling: the dictionary is large but finite.
      flash(`No dictionary match for “${form.trim()}”.`);
      setOverlay(null);
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
    bump();
  };

  // --- settings ------------------------------------------------------------

  useEffect(() => storage.onStateChange(setSyncState), [storage]);

  const configureSync = (cfg: SyncConfig | null) => {
    storage.configure(cfg);
    if (cfg) void storage.saveNow(session.progress()).then(() => flash("Connected to GitHub."));
    else flash("Sync turned off.");
  };

  const adopt = (progress: Progress) => {
    storage.adopt(progress);
    // The engine holds progress by reference, so a swap means a fresh page.
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

  const schedule = sectionId ? session.previewTopic(sectionId) : undefined;
  const attempts = sectionId ? session.attemptsFor(sectionId) : [];
  const nextDue = session.nextDue();

  return (
    <div className="app">
      {/* Two rows, because three tap targets and a count leave a phone-width
          line no room for a title — and Bennett's titles run to
          "Verbs in -io of the Third Conjugation". The topic gets its own line
          and the whole width. */}
      <header className="status">
        <div className="status__row">
          {inPlacement && <span className="badge badge--placement">placement</span>}
          {!inPlacement && isNewTopic && phase.t !== "vocab-review" && (
            <span className="badge">new</span>
          )}
          {/* The count is the natural way in to the schedule: it is already
              the answer to "how much is waiting", and the sheet is the rest of
              that answer. */}
          <button
            className="status__counts"
            onClick={() => setOverlay({ t: "schedule" })}
            aria-label="What is coming up"
          >
            {stats.dueTopics + stats.dueVocab > 0
              ? `${stats.dueTopics + stats.dueVocab} due`
              : `${stats.vocab} words`}
          </button>
          <span className="status__spacer" />
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
            aria-label="Grammar map"
          >
            ▦
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
          {inPlacement ? (
            <span className="status__title">
              Placement · {placementIndex + 1} of {placementList.length}
            </span>
          ) : (
            <>
              {section && <span className="status__ref">§ {section.ref}</span>}
              <span className="status__title">{section?.title ?? "Latina"}</span>
            </>
          )}
        </div>
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
            index={qIndex}
            total={test?.questions.length ?? 0}
            value={input}
            onChange={setInput}
            onSubmit={() => {
              setSubmitted(input);
              setPhase({ t: "graded", revealed: false });
            }}
            onReveal={() => {
              setSubmitted("");
              setPhase({ t: "graded", revealed: true });
            }}
          />
        )}

        {phase.t === "graded" && question && (
          <Graded
            question={question}
            submitted={submitted}
            revealed={phase.revealed}
            index={qIndex}
            total={test?.questions.length ?? 0}
            schedule={inPlacement ? undefined : schedule}
            labels={inPlacement ? PLACEMENT_LABELS : undefined}
            onGrade={grade}
            onResume={resumeWriting}
            onRecordWord={() => openVocab()}
            onHoldWord={holdWord}
            onReadGrammar={() =>
              sectionId && setOverlay({ t: "grammar", sectionId })
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
          const sec = content.getSection(overlay.sectionId);
          if (!sec) return null;
          const trail = session.attemptsFor(overlay.sectionId);
          return (
            <GrammarSheet
              section={sec}
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
              onClose={() => setOverlay({ t: "map" })}
              onRead={() =>
                setOverlay({
                  t: "grammar",
                  sectionId: topic.sectionId,
                  back: { t: "topic", sectionId: topic.sectionId },
                })
              }
              onQuiz={() => {
                setOverlay(null);
                quizTopic(topic);
              }}
              onQuestions={() =>
                setOverlay({ t: "questions", sectionId: topic.sectionId })
              }
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
          <AttemptTrail attempts={session.attemptsFor(overlay.sectionId)} />
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
            void storage.fetchRemote().then((remote) => {
              if (remote) adopt(remote);
              else flash("Nothing saved on GitHub yet.");
            })
          }
          dictionaryReady={dictionaryReady()}
          caching={dictLoading}
          onCacheDictionary={cacheDictionary}
          onReset={() => {
            storage.clearLocal();
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
    </div>
  );
}
