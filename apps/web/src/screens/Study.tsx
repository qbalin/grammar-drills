import { useRef } from "react";
import type { Question, Rating, VocabCardState } from "@latin-tutor/core";
import { GradeBar, MacronKeys, Ring } from "../ui.js";

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
}: {
  question: Question;
  index: number;
  total: number;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onReveal: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);

  /** Put a macron vowel where the caret is, not at the end. */
  const insert = (ch: string) => {
    const el = field.current;
    if (!el) return onChange(value + ch);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    onChange(value.slice(0, start) + ch + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">
          Translate into Latin · {index + 1}/{total}
        </p>
        <p className="prompt">{question.prompt}</p>
        <textarea
          ref={field}
          className="answer-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // A hardware keyboard should be able to submit; a soft one gets the
            // button, since Enter there is how you write a second line.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
          }}
          placeholder="write your Latin…"
          // Mobile autocorrect mangles Latin into English words; all of these
          // are needed, and `spellCheck` alone is not enough.
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Your Latin"
        />
        <MacronKeys onInsert={insert} />
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
  onReadGrammar,
}: {
  question: Question;
  submitted: string;
  /** True when the answer was shown rather than written. */
  revealed: boolean;
  index: number;
  total: number;
  schedule?: Record<Rating, Date>;
  labels?: Record<Rating, string>;
  onGrade: (r: Rating) => void;
  /** Back to the box: Submit or Reveal was tapped too early. */
  onResume: () => void;
  onRecordWord: () => void;
  onReadGrammar: () => void;
}) {
  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">
          Translate into Latin · {index + 1}/{total}
        </p>
        <p className="prompt">{question.prompt}</p>

        <div className="compare">
          {!revealed && (
            <div className="compare__block">
              <div className="compare__label">You wrote</div>
              <div
                className={`compare__text${submitted.trim() ? "" : " compare__text--empty"}`}
              >
                {submitted.trim() || "nothing"}
              </div>
            </div>
          )}
          <div className="compare__block compare__block--reference">
            <div className="compare__label">Reference</div>
            <div className="compare__text compare__text--reference">
              {question.answer}
            </div>
            {question.note && <div className="note">{question.note}</div>}
          </div>
        </div>
      </div>

      <div className="linkrow">
        <button onClick={onResume}>✎ keep writing</button>
        <button onClick={onRecordWord}>+ record a word</button>
        <button onClick={onReadGrammar}>§ grammar</button>
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
}: {
  card: VocabCardState;
  revealed: boolean;
  schedule?: Record<Rating, Date>;
  onReveal: () => void;
  onGrade: (r: Rating) => void;
}) {
  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">Vocabulary · say it in Latin</p>
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
}: {
  overall: number;
  nextDue?: Date;
  onOpenMap: () => void;
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
      <div className="actions" style={{ width: "100%", maxWidth: "18rem" }}>
        <button className="btn" onClick={onOpenMap}>
          Explore the grammar map
        </button>
      </div>
    </div>
  );
}

