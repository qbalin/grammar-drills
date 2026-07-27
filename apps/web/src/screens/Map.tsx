import { useState } from "react";
import type { Attempt, FamilyProgress, TopicProgress } from "@latin-tutor/core";
import { Ring, Sheet, ago } from "../ui.js";

/**
 * The syllabus as a map: nine families, each opening to a row per topic.
 *
 * The CLI draws fixed-width bars with a caret walking along them, which suits
 * arrow keys and a wide terminal. Neither holds here — 135 topics in one row
 * needs ~161 columns, and a thumb wants a target, not a cursor. So the families
 * become a list that expands, and each topic becomes a tappable row.
 *
 * The rows say what they are in words. They used to be a grid of squares
 * numbered 1, 2, 3… — the topic's position inside its family, so the "3" under
 * Particles and the "3" under Verb forms were different things and neither
 * matched the § numbers the rest of the app cites. The title lived in `title=`,
 * which a touch screen never shows; mastery, due and untested lived in colour,
 * a pip and a dashed border, which nothing on the page explained.
 */

/** Mastery band 1–4, or 0 for a topic never graded. */
function band(t: TopicProgress): number {
  if (t.mastery === undefined) return 0;
  return Math.min(4, Math.max(1, Math.floor(t.mastery)));
}

function masteryLabel(t: TopicProgress): string {
  if (t.mastery === undefined) return "not started";
  const pct = Math.round((((t.mastery ?? 1) - 1) / 3) * 100);
  return `${pct}% mastered${t.assumed ? " (assumed from placement)" : ""}`;
}

/** Everything about a topic's standing, in words rather than in colour. */
function topicState(t: TopicProgress): string {
  return [
    masteryLabel(t),
    t.due ? "due now" : "",
    t.hasTests ? "" : "no tests written yet",
  ]
    .filter(Boolean)
    .join(" · ");
}

function TopicRows({
  topics,
  onPick,
}: {
  topics: TopicProgress[];
  onPick: (t: TopicProgress) => void;
}) {
  return (
    <div className="list list--topics">
      {topics.map((t) => (
        <button className="row" key={t.sectionId} onClick={() => onPick(t)}>
          {/* The mastery colour is kept as a swatch, but it is now a second way
              of saying what the row already says. */}
          <span
            className={`band band--m${band(t)}${t.assumed ? " band--assumed" : ""}`}
            aria-hidden="true"
          />
          <span className="row__main">
            <span className="row__title">
              <span className="row__ref">§ {t.ref}</span>
              {t.title}
            </span>
            <span className="row__sub">{topicState(t)}</span>
          </span>
          <span className="row__chev">›</span>
        </button>
      ))}
    </div>
  );
}

export function MapSheet({
  families,
  overall,
  onClose,
  onPick,
  /** The topic being studied, so the map opens where the student is. */
  currentFamily,
}: {
  families: FamilyProgress[];
  overall: number;
  onClose: () => void;
  onPick: (t: TopicProgress) => void;
  currentFamily?: string;
}) {
  const firstStarted = families.find((f) => f.percent > 0)?.id;
  const [open, setOpen] = useState<string | null>(
    currentFamily ?? firstStarted ?? families[0]?.id ?? null,
  );
  // Counted, not quoted: a hardcoded 135 would go stale the day a topic moves.
  const total = families.reduce((n, f) => n + f.topics.length, 0);

  return (
    <Sheet title="Grammar map" onClose={onClose}>
      <div className="centered" style={{ padding: "0 0 1.2rem" }}>
        <Ring percent={overall} />
        <p>mastered across all {total} topics</p>
      </div>

      {families.map((f) => (
        <div className="family" key={f.id}>
          <button
            className="family__head"
            onClick={() => setOpen(open === f.id ? null : f.id)}
            aria-expanded={open === f.id}
          >
            <span className="family__main">
              <span className="family__name">{f.label}</span>
              {/* The percentage in words: a bare "50%" beside a bar said
                  neither what was measured nor over how much. */}
              <span className="family__sub">
                {f.topics.length} topics · {Math.round(f.percent * 100)}% mastered
              </span>
            </span>
            <span className="family__meter">
              <i style={{ width: `${Math.round(f.percent * 100)}%` }} />
            </span>
            <span className="row__chev">{open === f.id ? "▾" : "▸"}</span>
          </button>
          {open === f.id && <TopicRows topics={f.topics} onPick={onPick} />}
        </div>
      ))}
    </Sheet>
  );
}

/**
 * One topic, chosen from the map: what it is, how it has gone, and the two
 * things worth doing with it — read the grammar, or be quizzed on it now
 * regardless of what the scheduler thinks. Studying ahead is the point of
 * having a map at all.
 */
export function TopicSheet({
  topic,
  attempts,
  questionCount,
  onClose,
  onRead,
  onQuiz,
  onQuestions,
}: {
  topic: TopicProgress;
  attempts: Attempt[];
  /** How many questions have been written for the topic. */
  questionCount: number;
  onClose: () => void;
  onRead: () => void;
  onQuiz: () => void;
  onQuestions: () => void;
}) {
  return (
    <Sheet title={topic.title} subtitle={`§ ${topic.ref}`} onClose={onClose}>
      <p className="row__sub" style={{ marginTop: 0 }}>
        {topicState(topic)}
      </p>

      <div className="actions">
        <button className="btn" onClick={onRead}>
          Read § {topic.ref}
        </button>
        <button
          className="btn btn--primary"
          onClick={onQuiz}
          disabled={!topic.hasTests}
        >
          Quiz me
        </button>
      </div>
      <div className="actions">
        <button
          className="btn btn--quiet"
          onClick={onQuestions}
          disabled={questionCount === 0}
        >
          All {questionCount} questions
        </button>
      </div>

      {attempts.length > 0 && <AttemptTrail attempts={attempts} />}
    </Sheet>
  );
}

const RATING_WORD = ["", "again", "hard", "good", "easy"];

/**
 * What was written here before.
 *
 * Grading yourself leaves no record of the actual sentence, and a topic can be
 * away for months. Without this the only evidence a topic was ever studied is a
 * number on a bar.
 */
export function AttemptTrail({
  attempts,
  title = "Earlier answers",
  /** Off when every attempt answers the same question, which is then the title. */
  showPrompt = true,
}: {
  attempts: Attempt[];
  title?: string;
  showPrompt?: boolean;
}) {
  return (
    <>
      <div className="section-title">{title}</div>
      {attempts.map((a, i) => (
        <div className="attempt" key={`${a.at}-${i}`}>
          <div className="attempt__meta">
            <span>{ago(a.at)}</span>
            <span>· {RATING_WORD[a.rating]}</span>
          </div>
          {showPrompt && <div className="attempt__prompt">{a.prompt}</div>}
          <div
            className={`attempt__written${a.submitted.trim() ? "" : " attempt__written--empty"}`}
          >
            {a.submitted.trim() || "— nothing written"}
          </div>
        </div>
      ))}
    </>
  );
}
