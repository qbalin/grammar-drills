import { useEffect, useRef, type ReactNode } from "react";
import type { Rating } from "@latin-tutor/core";

/** How long until a date, said the way a person would. */
export function until(from: Date, to: Date): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  const years = days / 365;
  return `${years < 2 ? years.toFixed(1) : Math.round(years)}y`;
}

/** How long ago, for the trail of past attempts. */
export function ago(at: string, now = new Date()): string {
  const ms = now.getTime() - new Date(at).getTime();
  if (ms < 60_000) return "just now";
  const label = until(new Date(now.getTime() - ms), now);
  return `${label} ago`;
}

/**
 * A bottom sheet. Everything secondary lives in one — the grammar, the map, a
 * topic, settings — because on a phone a sheet keeps the question underneath
 * rather than replacing it, and dismissing is a single downward thumb.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  action?: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);

  // A sheet always opens at the top of its content, even when the previous one
  // was scrolled — sections run to hundreds of lines.
  //
  // Two hazards in one line. The braces matter, because `scrollTo` resolves a
  // promise when the scroll finishes in current Chrome, and a concise arrow
  // body would hand that promise to React as the effect's cleanup. And the call
  // is optional, because jsdom does not implement `scrollTo` at all — this is a
  // courtesy, not something worth failing a render over.
  useEffect(() => {
    body.current?.scrollTo?.(0, 0);
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__inner">
          <div className="sheet__grip" />
          <div className="sheet__head">
            {subtitle && <span className="status__ref">{subtitle}</span>}
            <span className="sheet__title">{title}</span>
            {action}
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="sheet__body" ref={body}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

const GRADES: { rating: Rating; label: string }[] = [
  { rating: 1, label: "Again" },
  { rating: 2, label: "Hard" },
  { rating: 3, label: "Good" },
  { rating: 4, label: "Easy" },
];

/**
 * The four self-grades, each showing when it would bring the card back. The
 * interval is the whole reason to think about the choice.
 */
export function GradeBar({
  onGrade,
  schedule,
  labels,
}: {
  onGrade: (rating: Rating) => void;
  /** When each grade lands, from `Session.previewTopic`/`previewVocab`. */
  schedule?: Record<Rating, Date>;
  /** Placement asks a different question, so it needs different words. */
  labels?: Record<Rating, string>;
}) {
  const now = new Date();
  return (
    <div className="grades">
      {GRADES.map(({ rating, label }) => (
        <button
          key={rating}
          className={`grade grade--${rating}`}
          onClick={() => onGrade(rating)}
        >
          <span className="grade__label">{labels?.[rating] ?? label}</span>
          {schedule && (
            <span className="grade__when">{until(now, schedule[rating])}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** The vowels Latin needs and no phone keyboard offers. */
const MACRONS = ["ā", "ē", "ī", "ō", "ū", "ȳ"];

export function MacronKeys({ onInsert }: { onInsert: (ch: string) => void }) {
  return (
    <div className="macrons">
      {MACRONS.map((ch) => (
        <button
          key={ch}
          type="button"
          // Keep the keyboard up: losing focus mid-sentence to type one vowel
          // would make these worse than not having them.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(ch)}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

export function Toast({
  message,
  action,
  onAction,
}: {
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

/** Overall mastery, as a ring that fills with the syllabus. */
export function Ring({ percent }: { percent: number }) {
  const pct = Math.round(percent * 100);
  return (
    <div className="ring" style={{ ["--pct" as string]: pct }}>
      <span>{pct}%</span>
    </div>
  );
}
