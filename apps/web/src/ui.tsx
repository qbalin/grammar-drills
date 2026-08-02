import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  sentenceTokens,
  type Emphasis,
  type Marks,
  type Rating,
} from "@lang-tutor/core";

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
 * The hold gesture, for anything on screen that names a word.
 *
 * It lives apart from the sentence below because the vocabulary crib wants the
 * very same press: a student who opened the crib because they were stuck is the
 * student most likely to want the word kept, and until this existed the crib
 * was the one place a word could be read but not taken — the sentence answered
 * to a hold, the list of words behind it did not.
 *
 * One press at a time, so `key` says which element is under the finger.
 */
export function useHold() {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [held, setHeld] = useState<string | null>(null);

  const cancel = () => {
    clearTimeout(timer.current);
    setHeld(null);
  };
  useEffect(() => cancel, []);

  const fire = (run: () => void) => {
    cancel();
    navigator.vibrate?.(8);
    run();
  };

  return {
    /** Whether this element is the one currently held down. */
    isHeld: (key: string) => held === key,
    /** The handlers that make one element holdable. */
    hold: (key: string, run: () => void) => ({
      onPointerDown: (e: ReactPointerEvent) => {
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
        // Captured, because a scroll event does not bubble and the scroller
        // here is the answer pane, not the window.
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
        setHeld(key);
        timer.current = setTimeout(() => fire(run), HOLD_MS);
      },
      onContextMenu: (e: ReactMouseEvent) => {
        e.preventDefault();
        fire(run);
      },
    }),
  };
}

/** none → bold → italic → both → none. Four taps and the word is plain again. */
export function cycleEmphasis(current?: Emphasis): Emphasis | undefined {
  return current === undefined ? 1 : current === 3 ? undefined : ((current + 1) as Emphasis);
}

/** The classes an emphasis puts on a word, under whichever prefix. */
function emphasisClass(prefix: string, mark?: Emphasis): string {
  if (!mark) return "";
  return `${mark & 1 ? ` ${prefix}--b` : ""}${mark & 2 ? ` ${prefix}--i` : ""}`;
}

/**
 * A sentence, word by word: holdable, markable, or neither.
 *
 * **Holding** records a word. Recording one used to mean leaving the question,
 * opening a sheet and retyping a word that was already on the screen — so in
 * practice it happened for the words worth the detour and no others. Holding
 * the word itself is the whole gesture, and it works on the sentence you wrote
 * as well as the one you should have.
 *
 * The press is deliberately slow (500 ms) and dies on any real movement: the
 * answer scrolls, and a scroll that saved a vocabulary card would be worse than
 * no gesture at all. Right-click does the same thing on a desktop.
 *
 * **Marking** is the student's own emphasis on their own record, and it is a
 * mode rather than a second gesture. The two are never live together: with
 * `onMark` the hold is not wired up at all, so the press that means "save this
 * word" cannot half-fire while you are picking words out. That is the whole
 * reason marking is entered deliberately instead of living on the tap.
 *
 * The words are bare spans — no roles, no labels. Announcing a hundred and
 * twenty "Record amat" buttons would turn a sentence into a list of controls
 * for anyone using a screen reader, and the sentence is the thing they came
 * for. The gesture is an enhancement; *record a word* below stays the
 * spelled-out route, and it is a real button with a real text field.
 */
export function Sentence({
  text,
  marks,
  onHold,
  onMark,
}: {
  text: string;
  /** The emphasis the student left, by word index. */
  marks?: Marks;
  /** The held word, punctuation already stripped. Absent on the English. */
  onHold?: (word: string) => void;
  /** Marking mode: the tapped word's index. Suspends the hold while present. */
  onMark?: (index: number) => void;
}) {
  const { isHeld, hold } = useHold();

  return (
    <>
      {sentenceTokens(text).map((token, i) => {
        // Whitespace, and tokens that are all punctuation, name no word: they
        // get no gesture rather than one that lights up and quietly does
        // nothing. Bare spacing passes through as text so nothing wraps it.
        if (token.space) return token.text;
        const mark = token.word ? marks?.[token.index] : undefined;

        if (onMark && token.word) {
          return (
            <span
              key={i}
              className={`word word--markable${emphasisClass("word", mark)}`}
              data-word={token.text}
              onClick={() => onMark(token.index)}
            >
              {token.text}
            </span>
          );
        }

        if (onHold && token.word) {
          const key = String(i);
          return (
            <span
              key={i}
              className={`word${isHeld(key) ? " word--held" : ""}${emphasisClass("word", mark)}`}
              data-word={token.text}
              {...hold(key, () => onHold(token.word))}
            >
              {token.text}
            </span>
          );
        }

        // Nothing to do with this word — the English prompt, or a punctuation
        // token. `.word` is deliberately not used: it suppresses selection to
        // keep iOS's magnifier off the hold gesture, and a sentence nobody can
        // hold is a sentence that should still be selectable and copyable.
        const emphasis = emphasisClass("mark", mark);
        return emphasis ? (
          <span key={i} className={emphasis.trim()}>
            {token.text}
          </span>
        ) : (
          token.text
        );
      })}
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
