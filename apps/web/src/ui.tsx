import { useEffect, useRef, useState, type ReactNode } from "react";
import { stripPunctuation, type Rating } from "@lang-tutor/core";

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

/** How long a word must be held before it is taken as "record this". */
const HOLD_MS = 500;
/** A press that wanders this far was the start of a scroll, not a hold. */
const SLOP_PX = 10;

/**
 * Latin with every word holdable.
 *
 * Recording a word used to mean leaving the question, opening a sheet and
 * retyping a word that was already on the screen — so in practice it happened
 * for the words worth the detour and no others. Holding the word itself is the
 * whole gesture, and it works on the sentence you wrote as well as the one you
 * should have.
 *
 * The press is deliberately slow (500 ms) and dies on any real movement: the
 * answer scrolls, and a scroll that saved a vocabulary card would be worse than
 * no gesture at all. Right-click does the same thing on a desktop.
 *
 * The words are bare spans — no roles, no labels. Announcing a hundred and
 * twenty "Record amat" buttons would turn a Latin sentence into a list of
 * controls for anyone using a screen reader, and the sentence is the thing they
 * came for. The gesture is an enhancement; *record a word* below stays the
 * spelled-out route, and it is a real button with a real text field.
 */
export function HoldableLatin({
  text,
  onHold,
}: {
  text: string;
  /** The held word, punctuation already stripped. */
  onHold: (word: string) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [held, setHeld] = useState<number | null>(null);

  const cancel = () => {
    clearTimeout(timer.current);
    setHeld(null);
  };
  useEffect(() => cancel, []);

  const fire = (raw: string) => {
    cancel();
    // Latin words arrive wearing the sentence's punctuation: `amat.`, `«rosam»`.
    // Cut the same way the vocabulary crib cuts them, so a word you can hold is
    // always a word the crib listed.
    const word = stripPunctuation(raw);
    if (!word) return;
    navigator.vibrate?.(8);
    onHold(word);
  };

  // Split on whitespace but keep it, so the sentence's own spacing survives.
  const tokens = text.split(/(\s+)/);

  return (
    <>
      {tokens.map((token, i) =>
        /^\s+$/.test(token) || token === "" ? (
          token
        ) : (
          <span
            key={i}
            className={`word${held === i ? " word--held" : ""}`}
            data-word={token}
            onPointerDown={(e) => {
              const from = { x: e.clientX, y: e.clientY };
              // A finger that travels was aiming past the word, not at it.
              const move = (m: PointerEvent) => {
                if (
                  Math.abs(m.clientX - from.x) > SLOP_PX ||
                  Math.abs(m.clientY - from.y) > SLOP_PX
                ) {
                  cancel();
                }
              };
              // And a page that moves under the finger settles it outright.
              // Captured, because a scroll event does not bubble and the
              // scroller here is the answer pane, not the window.
              const scrolled = () => cancel();
              addEventListener("pointermove", move);
              addEventListener("scroll", scrolled, true);
              // Whatever ends the press, the listeners go with it.
              const done = () => {
                removeEventListener("pointermove", move);
                removeEventListener("scroll", scrolled, true);
                cancel();
              };
              addEventListener("pointerup", done, { once: true });
              addEventListener("pointercancel", done, { once: true });
              setHeld(i);
              timer.current = setTimeout(() => fire(token), HOLD_MS);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              fire(token);
            }}
          >
            {token}
          </span>
        ),
      )}
    </>
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
