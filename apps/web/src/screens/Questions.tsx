import type {
  AttemptMarks,
  BankedQuestion,
  GrammarSection,
} from "@lang-tutor/core";
import { Sheet, ago } from "../ui.js";
import { AttemptTrail } from "./Map.js";

/**
 * A section's whole question bank.
 *
 * The scheduler serves one test of four at a time and rotates for variety, so
 * most of what has been written for a topic is never seen twice and much of it
 * is never seen at all — a section carries up to a hundred questions. This is
 * the bank itself: every English prompt with the Latin it wants, readable as a
 * list, which is also the only way to revise a topic without being tested on it.
 *
 * "Every question" means every question the deck will ask: a student exploring
 * only quoted sentences reads the quoted ones here, for the reason
 * `Session.questionBank` sets out. So the empty list has two meanings, and says
 * which — the same pair the index words on every row.
 */

const RATING_WORD = ["", "again", "hard", "good", "easy"];

/** What has been written on this question, in a line. */
function trailLabel(q: BankedQuestion): string {
  const last = q.attempts[0];
  if (!last) return "not answered yet";
  const n = q.attempts.length;
  return `${n} ${n === 1 ? "answer" : "answers"} · last ${RATING_WORD[last.rating]}, ${ago(last.at)}`;
}

export function QuestionsSheet({
  section,
  questions,
  quotedOnly,
  onPick,
  onClose,
}: {
  section: GrammarSection;
  questions: BankedQuestion[];
  /** Whether the list is the quoted questions alone. */
  quotedOnly: boolean;
  onPick: (q: BankedQuestion) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="All questions"
      subtitle={`§ ${section.ref} · ${questions.length}`}
      onClose={onClose}
    >
      {questions.length === 0 ? (
        <p className="field__hint" style={{ marginTop: 0 }}>
          {quotedOnly
            ? `Nothing quoted has been written for “${section.title}” yet.`
            : `No tests have been written for “${section.title}” yet.`}
        </p>
      ) : (
        <div className="list">
          {questions.map((q) => (
            <button
              className="row"
              key={`${q.testId}-${q.prompt}`}
              onClick={() => onPick(q)}
            >
              <span className="row__main">
                <span className="row__title">{q.prompt}</span>
                <span className="row__answer">{q.answer}</span>
                <span className="row__sub">{trailLabel(q)}</span>
              </span>
              <span className="row__chev">›</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/**
 * One question and everything ever written on it.
 *
 * Self-grading leaves no verdict behind, so the only evidence of how a question
 * has gone is the sentences themselves — and they are worth reading in a row:
 * the same mistake three times running is the thing a grade of "hard" never
 * says out loud.
 */
export function QuestionSheet({
  question,
  section,
  onClose,
  onMark,
}: {
  question: BankedQuestion;
  section: GrammarSection;
  onClose: () => void;
  onMark?: (at: string, marks: AttemptMarks) => void;
}) {
  return (
    <Sheet title="Question" subtitle={`§ ${section.ref}`} onClose={onClose}>
      <p className="prompt" style={{ marginTop: 0 }}>
        {question.prompt}
      </p>
      <div className="compare">
        <div className="compare__block compare__block--reference">
          <div className="compare__label">Reference</div>
          <div className="compare__text compare__text--reference">
            {question.answer}
          </div>
          {question.note && <div className="note">{question.note}</div>}
        </div>
      </div>

      {question.attempts.length > 0 ? (
        <AttemptTrail
          attempts={question.attempts}
          title="Your answers"
          showPrompt={false}
          /* The reference stands above, once; repeating it under every attempt
             is noise on the one screen that already shows it. A row under the
             marker shows it anyway — there has to be something there to mark. */
          showAnswer={false}
          onMark={onMark}
        />
      ) : (
        <p className="field__hint">
          You have not answered this one yet. It comes round when the topic does.
        </p>
      )}
    </Sheet>
  );
}
