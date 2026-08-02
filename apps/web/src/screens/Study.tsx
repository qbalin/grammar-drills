import type { ReactNode } from "react";
import type { Question, Rating, VocabCardState } from "@lang-tutor/core";
import { GradeBar, HoldableLatin, Ring } from "../ui.js";
import { profile } from "../pack.js";

/**
 * The question, being answered.
 *
 * The loop is the CLI's, unchanged: read the English, write the Latin, see it
 * beside the reference, grade yourself. Nothing checks the answer — that is the
 * design, not an omission, and it is why no model runs here.
 *
 * The one concession to the phone is **Reveal**. Typing a full Latin sentence
 * on glass is real work, and the alternative to an escape hatch is not more
 * rigour but a skipped session. Writing stays the default and the primary
 * button; revealing is the quieter one beside it.
 */
export function Answering({
  question,
  index,
  total,
  value,
  onChange,
  onSubmit,
  onReveal,
  vocabulary,
}: {
  question: Question;
  /**
   * Where this question sits in the test, and how many it holds. Absent during
   * placement, which serves one question per probe: the counter would read
   * "1/4" on every screen — the test's size, not the run's length — and the
   * header already carries the number that means something.
   */
  index?: number;
  total?: number;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onReveal: () => void;
  /**
   * The question's words, folded away. It sits above the box rather than below
   * it because this is the screen where a beginner is stuck on a word, and a
   * crib under the fold of a phone is a crib nobody finds.
   */
  vocabulary?: ReactNode;
}) {
  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">
          {profile.ui.promptDirection}
          {total ? ` · ${(index ?? 0) + 1}/${total}` : ""}
        </p>
        <p className="prompt">{question.prompt}</p>
        {vocabulary}
        <textarea
          className="answer-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // A hardware keyboard should be able to submit; a soft one gets the
            // button, since Enter there is how you write a second line.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
          }}
          placeholder={profile.ui.webPlaceholder}
          // Mobile autocorrect mangles Latin into English words; all of these
          // are needed, and `spellCheck` alone is not enough.
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={profile.ui.answerAriaLabel}
        />
      </div>
      <div className="actions">
        <button className="btn" onClick={onReveal}>
          Reveal
        </button>
        <button className="btn btn--primary" onClick={onSubmit}>
          Submit
        </button>
      </div>
    </>
  );
}

/**
 * The answer beside the reference, and the grade.
 *
 * The two are stacked rather than diffed: a Latin sentence has several right
 * word orders, and highlighting the differences would assert a precision the
 * app does not have and the language does not want.
 *
 * Every word in both is holdable: this is the screen where you meet a word you
 * did not know, and the word is already here — asking for it to be retyped into
 * a sheet is how a vocabulary list stays empty.
 */
export function Graded({
  question,
  submitted,
  revealed,
  index,
  total,
  schedule,
  labels,
  onGrade,
  onResume,
  onRecordWord,
  onHoldWord,
  onReadGrammar,
  onMore,
  vocabulary,
  history,
}: {
  question: Question;
  submitted: string;
  /** True when the answer was shown rather than written. */
  revealed: boolean;
  /** As on `Answering`: absent during placement. */
  index?: number;
  total?: number;
  schedule?: Record<Rating, Date>;
  labels?: Record<Rating, string>;
  onGrade: (r: Rating) => void;
  /** Back to the box: Submit or Reveal was tapped too early. */
  onResume: () => void;
  onRecordWord: () => void;
  /** A word held down in either sentence. */
  onHoldWord: (word: string) => void;
  onReadGrammar: () => void;
  /**
   * Stay on this topic rather than being moved on. Absent when there is no
   * more of it to have — a topic whose bank is worked out, or a placement
   * probe, which is not a topic you are studying.
   */
  onMore?: () => void;
  /** The question's words, folded away — the same panel as while writing. */
  vocabulary?: ReactNode;
  /**
   * What was written on this topic before, folded away. Below the comparison
   * rather than above it: the reference answer is what the screen is for, and
   * this is what you reach for once you have read it.
   */
  history?: ReactNode;
}) {
  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">
          {profile.ui.promptDirection}
          {total ? ` · ${(index ?? 0) + 1}/${total}` : ""}
        </p>
        <p className="prompt">{question.prompt}</p>
        {vocabulary}

        <div className="compare">
          {!revealed && (
            <div className="compare__block">
              <div className="compare__label">You wrote</div>
              <div
                className={`compare__text${submitted.trim() ? "" : " compare__text--empty"}`}
              >
                {submitted.trim() ? (
                  <HoldableLatin text={submitted.trim()} onHold={onHoldWord} />
                ) : (
                  "nothing"
                )}
              </div>
            </div>
          )}
          <div className="compare__block compare__block--reference">
            <div className="compare__label">Reference</div>
            <div className="compare__text compare__text--reference">
              <HoldableLatin text={question.answer} onHold={onHoldWord} />
            </div>
            {question.note && <div className="note">{question.note}</div>}
          </div>
        </div>
        <p className="hint">Hold a word to save it to your vocabulary.</p>
        {history}
      </div>

      <div className="linkrow">
        <button onClick={onResume}>✎ keep writing</button>
        <button onClick={onRecordWord}>+ record a word</button>
        <button onClick={onReadGrammar}>§ grammar</button>
        {onMore && <button onClick={onMore}>↻ more of this</button>}
      </div>
      <GradeBar onGrade={onGrade} schedule={schedule} labels={labels} />
    </>
  );
}

/**
 * A vocabulary card. English on the front throughout the app: the student
 * always produces the Latin, never recognises it.
 */
export function VocabReview({
  card,
  revealed,
  schedule,
  onReveal,
  onGrade,
  onEdit,
}: {
  card: VocabCardState;
  revealed: boolean;
  schedule?: Record<Rating, Date>;
  onReveal: () => void;
  onGrade: (r: Rating) => void;
  /** A wrong citation is never more obvious than when it is being reviewed. */
  onEdit: () => void;
}) {
  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">Vocabulary · {profile.ui.sayItIn}</p>
        <p className="prompt">{card.gloss}</p>
        {revealed && (
          <div className="compare">
            <div className="compare__block compare__block--reference">
              <div className="compare__label">Citation</div>
              <div className="compare__text compare__text--reference">
                {card.citation}
              </div>
              {(card.pos || card.declension) && (
                <div className="note">
                  {[card.pos, card.gender, card.declension && `declension ${card.declension}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="linkrow">
        <button onClick={onEdit}>✎ edit this word</button>
      </div>
      {revealed ? (
        <GradeBar onGrade={onGrade} schedule={schedule} />
      ) : (
        <div className="actions">
          <button className="btn btn--primary" onClick={onReveal}>
            Show
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Nothing is due. A rest screen rather than an empty one: the work is finished,
 * which is the good outcome, and the map is right there for anyone who wants to
 * push on anyway.
 */
export function Rest({
  overall,
  nextDue,
  onOpenMap,
  onOpenSchedule,
}: {
  overall: number;
  nextDue?: Date;
  onOpenMap: () => void;
  onOpenSchedule: () => void;
}) {
  return (
    <div className="centered">
      <Ring percent={overall} />
      <h1>Nothing due.</h1>
      <p>
        {nextDue
          ? `The next topic comes back ${nextDue.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}.`
          : "Well done."}
      </p>
      <div
        className="actions"
        style={{ width: "100%", maxWidth: "18rem", flexDirection: "column" }}
      >
        <button className="btn" onClick={onOpenMap}>
          Explore the grammar map
        </button>
        <button className="btn" onClick={onOpenSchedule}>
          See what's coming
        </button>
      </div>
    </div>
  );
}

