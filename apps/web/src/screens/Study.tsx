import type { ReactNode } from "react";
import type {
  AttemptMarks,
  Question,
  Rating,
  VocabCardState,
} from "@lang-tutor/core";
import { GradeBar, Ring, Sentence } from "../ui.js";
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
  /** Where this question sits in the test, and how many the test holds. */
  index: number;
  total: number;
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
          {total > 0 ? ` · ${index + 1}/${total}` : ""}
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
 *
 * And every word in all three — the English too — can be picked out, which is
 * the other thing this screen is for. Very often the topic under test went
 * fine and something else in the sentence did not, and a grade cannot say
 * which. Marking is a mode, entered from the link row, so the hold keeps its
 * meaning outside it.
 */
export function Graded({
  question,
  submitted,
  revealed,
  index,
  total,
  schedule,
  marks,
  marking,
  onGrade,
  onResume,
  onRecordWord,
  onHoldWord,
  onReadGrammar,
  onToggleMarking,
  onMark,
  vocabulary,
  history,
}: {
  question: Question;
  submitted: string;
  /** True when the answer was shown rather than written. */
  revealed: boolean;
  /** As on `Answering`. */
  index: number;
  total: number;
  schedule?: Record<Rating, Date>;
  /** What has been picked out so far, riding along until the grade stores it. */
  marks: AttemptMarks;
  /** Whether a tap marks a word rather than doing nothing. */
  marking: boolean;
  onGrade: (r: Rating) => void;
  /** Back to the box: Submit or Reveal was tapped too early. */
  onResume: () => void;
  onRecordWord: () => void;
  /** A word held down in either sentence. */
  onHoldWord: (word: string) => void;
  onReadGrammar: () => void;
  onToggleMarking: () => void;
  /** A word tapped while marking: which text, and the word's index in it. */
  onMark: (field: keyof AttemptMarks, index: number) => void;
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
          {total > 0 ? ` · ${index + 1}/${total}` : ""}
        </p>
        <p className="prompt">
          <Sentence
            text={question.prompt}
            marks={marks.prompt}
            /* No hold: the prompt is the language the student already reads,
               and there is nothing there worth a vocabulary card. */
            onMark={marking ? (i) => onMark("prompt", i) : undefined}
          />
        </p>
        {vocabulary}

        <div className={`compare${marking ? " compare--marking" : ""}`}>
          {!revealed && (
            <div className="compare__block">
              <div className="compare__label">You wrote</div>
              <div
                className={`compare__text${submitted.trim() ? "" : " compare__text--empty"}`}
              >
                {submitted.trim() ? (
                  <Sentence
                    text={submitted.trim()}
                    marks={marks.submitted}
                    onHold={onHoldWord}
                    onMark={marking ? (i) => onMark("submitted", i) : undefined}
                  />
                ) : (
                  "nothing"
                )}
              </div>
            </div>
          )}
          <div className="compare__block compare__block--reference">
            <div className="compare__label">Reference</div>
            <div className="compare__text compare__text--reference">
              <Sentence
                text={question.answer}
                marks={marks.answer}
                onHold={onHoldWord}
                onMark={marking ? (i) => onMark("answer", i) : undefined}
              />
            </div>
            {question.note && <div className="note">{question.note}</div>}
          </div>
        </div>
        <p className="hint">
          {marking
            ? "Tap a word: bold, italic, struck, off."
            : "Hold a word to save it to your vocabulary."}
        </p>
        {history}
      </div>

      <div className="linkrow">
        <button onClick={onResume}>✎ keep writing</button>
        <button onClick={onRecordWord}>+ record a word</button>
        <button onClick={onReadGrammar}>§ grammar</button>
        {/* What the grade cannot say. `↻ more of this` had this slot and gave
            it up: it only ever called the drill, which the map's topic sheet
            offers by name and this screen was the second way to. */}
        <button onClick={onToggleMarking} aria-pressed={marking}>
          {marking ? "✓ done marking" : "✱ mark"}
        </button>
      </div>
      <GradeBar onGrade={onGrade} schedule={schedule} />
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
 * The book is worked out. A rest screen rather than an empty one: the work is
 * finished, which is the good outcome, and the index is right there for anyone
 * who wants to push on anyway.
 *
 * Only ever reached from exploring. Clearing the reviews throws the switch
 * back to the book rather than stopping, so "nothing due" is a thing the app
 * passes through and never a screen it leaves you on.
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
      <h1>The book is worked out.</h1>
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
          Explore the grammar index
        </button>
        <button className="btn" onClick={onOpenSchedule}>
          See what's coming
        </button>
      </div>
    </div>
  );
}

/**
 * A practice run worked out.
 *
 * The loop stops here rather than moving on. "Stay on this topic" was an
 * instruction, and sliding quietly off it is not how an instruction ends — the
 * student would find a different topic on screen and have to work out that
 * anything had happened. It is also the one moment when "what now" is a real
 * question, so it is asked, with the three answers to it.
 */
export function Practised({
  title,
  total,
  onAgain,
  onBook,
  onOpenMap,
}: {
  title: string;
  /** How many questions the bank holds — what another run would be for. */
  total: number;
  onAgain: () => void;
  onBook: () => void;
  onOpenMap: () => void;
}) {
  return (
    <div className="centered">
      <h1>All practised.</h1>
      <p>
        Every question on {title} has been through this run.
      </p>
      <div
        className="actions"
        style={{ width: "100%", maxWidth: "18rem", flexDirection: "column" }}
      >
        <button className="btn btn--primary" onClick={onAgain}>
          Practise all {total} again
        </button>
        <button className="btn" onClick={onBook}>
          Back to the book in order
        </button>
        <button className="btn btn--quiet" onClick={onOpenMap}>
          Grammar index
        </button>
      </div>
    </div>
  );
}

