import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  sentenceTokens,
  type Emphasis,
  type Marks,
  type QuestionSource,
  type Rating,
} from "@lang-tutor/core";
import { profile } from "./pack.js";

/**
 * Who a sentence is quoted from, wherever one is drawn.
 *
 * One rendering, because a citation written out in every screen that draws a
 * quoted line is as many chances for one of them to be the odd one out — the
 * answer under study, the question bank, a kept sentence, the list of them, and
 * now the back of a vocabulary card. The em dash, the italic work and the bare
 * locus are the same everywhere by construction rather than by everybody
 * remembering.
 *
 * Nothing at all where nobody can be credited, which is most questions: a
 * generated sentence has no author, and the absence is the honest encoding of
 * that rather than a gap to be filled with the pack's name.
 */
export function Attribution({ source }: { source?: QuestionSource }) {
  if (!source) return null;
  // A span rather than a div, because one of the five places is a list row and
  // a button may not contain a div. The stylesheet gives it `display: block`, so
  // it stacks under the sentence wherever it is drawn.
  return (
    <span className="attribution">
      — {source.author}, <cite>{source.work}</cite>
      {source.locus ? ` ${source.locus}` : ""}
    </span>
  );
}

/**
 * What marks an element as holding the language being learnt.
 *
 * The document is `lang="en"` — the prompts are English and so is every word of
 * chrome — and until this, so was everything else on the page by inheritance:
 * the reference answers, the grammar sections, the paradigm tables, the
 * dictionary entries. A screen reader therefore read Ἑλληνικά in an English
 * voice, which for Greek is not an accent but noise, and browsers applied
 * English hyphenation and font fallback to both packs.
 *
 * `profile.l2` has declared `code`, `script` and `direction` from the start, and
 * `packages/core/src/pack.ts` validates `direction` against `ltr`/`rtl`. Nothing
 * read any of the three. This is that contract finally being kept — and it is
 * what makes `direction` mean something before a right-to-left pack discovers it
 * the hard way.
 *
 * Attributes rather than a wrapper component, so no element is added and no
 * selector moves. `dir` only when it differs from the document's: writing
 * `dir="ltr"` on every Latin sentence is noise that says nothing.
 */
export const l2Attrs: { lang: string; dir?: "ltr" | "rtl" } = {
  lang: profile.l2.code,
  ...(profile.l2.direction === "rtl" ? { dir: "rtl" as const } : {}),
};

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

/**
 * How long until a date, in full words — for a screen with room for them.
 *
 * Beside `until` rather than a flag on it, and the two are not one function.
 * `until` is read four times at once under four grade buttons on a phone-width
 * row, where `9d` is the whole point and "in 9 days" would not fit; this is read
 * once on a card with nothing else on it, where `9d` reads like a receipt. Two
 * jobs, two shapes, and the compact one is load-bearing where it stands.
 *
 * A tail rather than a sentence, because two screens now want it under
 * different verbs: a topic already in the pile *comes back* in nine days, and
 * one being offered *would come back* in nine days. One ladder of thresholds,
 * so the offer and the promise can never round differently — which they would
 * be seen to do, since the offer is on screen one tap before the promise.
 */
export function interval(to: Date, from = new Date()): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
  if (minutes < 2) return "in a moment";
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "in an hour" : `in ${hours} hours`;
  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  if (days < 60) return `in ${weeks} weeks`;
  const months = Math.round(days / 30);
  if (months < 24) return `in ${months} months`;
  return `in ${Math.round(days / 365)} years`;
}

/** When a topic that is in the pile comes back. */
export function comesBack(to: Date, from = new Date()): string {
  return `Back ${interval(to, from)}`;
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
  trail: trailed = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  action?: ReactNode;
  /** Draw ↩ and ↪. The reader asks for them; nothing else does. */
  trail?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const trail = useContext(TrailContext);

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

  /**
   * Make `aria-modal` true.
   *
   * It has said so since this component was written, and it was not: nothing
   * was focused when a sheet opened, Tab walked straight out of it into the
   * study screen underneath, and closing left focus on `<body>` so the next Tab
   * started again from the top of the document. A student reading the grammar
   * with a keyboard was tabbing through a question they could not see.
   *
   * Three things, in the order they matter. **Focus goes in** — to the panel
   * itself rather than to the first control, because the first control is the
   * close button and a sheet that opens by announcing "Close" has buried its own
   * contents. `tabIndex={-1}` makes it focusable without putting it in the tab
   * order. **Focus stays in**, wrapping at both ends. **Focus goes back** to
   * whatever opened the sheet, which is the whole reason a person can find their
   * place again; and only if that element is still on the page, since the
   * gesture that opened a sheet is sometimes the last thing a screen does.
   *
   * Two sheets focus a field of their own on open — recording a word, writing a
   * card — and they still win: their effect runs after this one.
   */
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus?.();
    return () => {
      if (opener?.isConnected) opener.focus?.();
    };
  }, []);

  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panel.current) return;
    const stops = panel.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    // Leaving by the front goes to the back and the other way about. The panel
    // itself is `tabindex="-1"` so it is never one of the stops, which is what
    // makes the first Tab out of it land on `first` rather than nowhere.
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__inner" ref={panel} tabIndex={-1} onKeyDown={trap}>
          <div className="sheet__grip" />
          {/*
            Two rows: what can be pressed, and then what is being read. Sharing
            one line, the title took whatever the controls left it, and a
            grammar section's title is the longest in the app. The status bar
            answers the same question the same way.
          */}
          <div className="sheet__head">
            <div className="sheet__bar">
              {trailed && (
                <span className="sheet__trail">
                  <button
                    className="iconbtn iconbtn--trail"
                    onClick={trail.back}
                    disabled={!trail.back}
                    aria-label="Back"
                  >
                    ↩
                  </button>
                  <button
                    className="iconbtn iconbtn--trail"
                    onClick={trail.forward}
                    disabled={!trail.forward}
                    aria-label="Forward"
                  >
                    ↪
                  </button>
                </span>
              )}
              <span className="sheet__acts">
                {action}
                <button className="iconbtn" onClick={onClose} aria-label="Close">
                  ✕
                </button>
              </span>
            </div>
            {/* Reference then title, which is how the status bar names a topic. */}
            <div className="sheet__name">
              {subtitle && <span className="status__ref">{subtitle}</span>}
              <span className="sheet__title">{title}</span>
            </div>
          </div>
          <div className="sheet__body" ref={body}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Where the reader has been, and where they were before they went back.
 *
 * The *trail* is the app's: a § followed out of one topic, a word inspected, a
 * topic opened off the map — every step is recorded, whichever sheet took it,
 * which is why this is a context and none of the seventeen places `Sheet` is
 * rendered from has to know it is part of one. The *arrows* are the grammar
 * reader's alone, asked for with `trail` on the sheet that wants them. Settings
 * is not somewhere a reader walks back through, and a pair of arrows over it
 * only offers to undo a decision they do not undo.
 *
 * Not the same thing as ✕, which closes *this* sheet and reveals what it was
 * over. They usually agree; where they do not, ↩ is the one that answers "how
 * did I get here" and ✕ is the one that answers "what was I doing". So ↩ stops
 * at the first sheet of an excursion: leaving the book is the other one's job.
 */
export interface Trail {
  back?: () => void;
  forward?: () => void;
}

const TrailContext = createContext<Trail>({});

export function TrailProvider({ value, children }: { value: Trail; children: ReactNode }) {
  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}

/**
 * The box a paradigm is set in.
 *
 * A seven-column paradigm cannot fit a phone, and the fix is never to reflow
 * it — the endings lined up in a column *are* the lesson. So the table scrolls
 * sideways inside its own box, leaving the page itself scrolling only up and
 * down. The class is load-bearing beyond the styling: the grammar reader's
 * page-turn swipe refuses to start inside a `.gr-tablewrap` that has somewhere
 * to scroll, so a finger dragged across a wide table moves the table.
 */
export function TableBox({ children }: { children: ReactNode }) {
  return (
    <div className="gr-tablewrap">
      <table className="gr-table">
        <tbody>{children}</tbody>
      </table>
    </div>
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
 *
 * A round is scheduled by its worst answer, so once `again` has been given the
 * four intervals are one interval, and printing it under every button reads as
 * a bug rather than as the truth. `settled` replaces the four with a single
 * line saying what is now fixed — the grades still do their other work, since
 * the answer trail records every one of them either way.
 */
export function GradeBar({
  onGrade,
  schedule,
  settled,
}: {
  onGrade: (rating: Rating) => void;
  /** When each grade lands, from `Session.previewTopic`/`previewVocab`. */
  schedule?: Record<Rating, Date>;
  /** Whether every grade now brings the topic back at the same time. */
  settled?: boolean;
}) {
  const now = new Date();
  const showWhen = schedule && !settled;

  /**
   * 1–4 grade, which is how the CLI has always done it.
   *
   * Grading is the most repeated action in the app — four times a round, every
   * round — and on the web it needed a mouse or a thumb. The terminal drives
   * the identical loop entirely from the keyboard, so a desktop student was
   * getting the worse of two interfaces to the same engine.
   *
   * Live only while the bar is on screen, because the handler is this
   * component's: there is no phase to check and no way for it to fire over a
   * question that is not yet answered.
   *
   * Three things it declines. A modifier, so `⌘1` still switches browser tabs.
   * A text field, so a `3` typed into an answer or a repo name is a `3`. And an
   * open sheet — the grade bar is still mounted underneath one, and reading the
   * grammar is not a moment to be one keystroke from scheduling the topic.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const at = document.activeElement;
      if (at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement) return;
      if (at instanceof HTMLElement && at.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      const rating = Number(e.key);
      if (!Number.isInteger(rating) || rating < 1 || rating > 4) return;
      e.preventDefault();
      onGrade(rating as Rating);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onGrade]);
  // A fragment rather than a wrapper: `.grades` is a flex child of `.study`,
  // and boxing it would put a block between them for one line of text.
  return (
    <>
      {settled && schedule && (
        <p className="grades__settled">
          Back in {until(now, schedule[1])} whatever you press — the round is
          graded by its weakest answer.
        </p>
      )}
      <div className="grades" data-settled={settled ? "" : undefined}>
        {GRADES.map(({ rating, label }) => (
          <button
            key={rating}
            className={`grade grade--${rating}`}
            // Announced rather than printed. The four buttons already carry a
            // label and an interval on a phone-width row, and a third line of
            // digits would be for the one reader who cannot see them anyway.
            aria-keyshortcuts={String(rating)}
            onClick={() => onGrade(rating)}
          >
            <span className="grade__label">{label}</span>
            {showWhen && (
              <span className="grade__when">{until(now, schedule[rating])}</span>
            )}
          </button>
        ))}
      </div>
    </>
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

/** none → bold → italic → struck → none. Four taps and the word is plain again. */
export function cycleEmphasis(current?: Emphasis): Emphasis | undefined {
  return current === undefined ? 1 : current === 3 ? undefined : ((current + 1) as Emphasis);
}

/**
 * The class suffix each emphasis puts on a word, indexed by `Emphasis`.
 *
 * A lookup rather than bit flags. Flags made 3 mean "1 and 2 together", which
 * is a distinction nobody draws while studying and a fourth tap to get back
 * from; struck is a third thing to say — *not this word* — and the app could
 * not say it at all.
 */
const EMPHASIS = ["", "b", "i", "s"];

/** The classes an emphasis puts on a word, under whichever prefix. */
function emphasisClass(prefix: string, mark?: Emphasis): string {
  return mark ? ` ${prefix}--${EMPHASIS[mark]}` : "";
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
 * **Double-clicking** asks the word what it is: its citation, its gender, and
 * its own declension or conjugation rather than the model exemplar in the book.
 * It costs nothing to sit beside the hold, because each of a double-click's two
 * quick presses ends in a `pointerup` well inside those 500 ms, and that is
 * what cancels a hold. Nothing is saved and nothing is changed, so unlike the
 * hold it needs no confirmation and no way back.
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
  onInspect,
  onMark,
}: {
  text: string;
  /** The emphasis the student left, by word index. */
  marks?: Marks;
  /**
   * The held word, punctuation already stripped, and where it stands among the
   * sentence's words. The index rides along because a vocabulary card keeps the
   * sentence the word was met in and draws that word picked out in it, and the
   * word alone cannot say which `rosam` of two was the one under the thumb.
   */
  onHold?: (word: string, index: number) => void;
  /** The double-clicked word, punctuation stripped. Rides along with the hold. */
  onInspect?: (word: string) => void;
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
              {...hold(key, () => onHold(token.word, token.index))}
              onDoubleClick={onInspect ? () => onInspect(token.word) : undefined}
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

/**
 * A dictionary citation's tag, split off from the words it stands after.
 *
 * A citation is *almost* a sentence — `rosa, rosae (f)`, `sum, esse, fuī` — and
 * the difference is the tail. `(f)` is a gender, `(pron)` a part of speech, and
 * neither is a word of the language: `stripPunctuation` would hand `f` to the
 * dictionary, which for Latin answers `filius, fīliī (m) — a son`. So a tag left
 * holdable would not merely fail to do anything; it would confidently do the
 * wrong thing, which is worse than the gesture not being there.
 *
 * The split is by index rather than by capture, so `head + tag` is the string
 * that came in and the spacing `Sentence` reproduces is the citation's own.
 *
 * A tag is one language's habit and not a fact about citations: Greek's ninety
 * thousand carry none at all — `εἰμί, ἔσομαι`, `ἵημι, ἥσω, ἧκα, εἷκα` — and
 * there this is a no-op with every token a real word. Which is why it is written
 * as a shape rather than as a list of the abbreviations one pack happens to
 * print.
 */
export function splitCitation(text: string): { head: string; tag: string } {
  const tag = text.match(/\([^()]*\)\s*$/);
  return tag?.index === undefined
    ? { head: text, tag: "" }
    : { head: text.slice(0, tag.index), tag: text.slice(tag.index) };
}

/**
 * A citation, word by word, on the same two gestures a sentence answers to.
 *
 * The back of a vocabulary card drew this line as plain text while the sentences
 * under it were fully holdable — so `rosae` could be asked what it is two inches
 * below the citation and not in it. A citation is where the oblique form a card
 * is filed under is actually printed, which makes it a likely place to want the
 * question asked.
 *
 * No marks and no marking mode. A card is not an attempt, and a citation is the
 * dictionary's line rather than anybody's answer, so there is nowhere for a
 * student's emphasis on it to live.
 */
export function Citation({
  text,
  onHold,
  onInspect,
}: {
  text: string;
  /** A word held down: record it. No index rides along — see the tag above. */
  onHold?: (word: string) => void;
  /** A word double-clicked: look it up rather than record it. */
  onInspect?: (word: string) => void;
}) {
  const { head, tag } = splitCitation(text);
  return (
    <>
      <Sentence
        text={head}
        onHold={onHold && ((word) => onHold(word))}
        onInspect={onInspect}
      />
      {tag}
    </>
  );
}

/**
 * The copy button a text carries when the text cannot be lifted by hand.
 *
 * It earns its place because most of what it stands beside cannot be copied by
 * hand at all: the words of both sentences are `.word` spans, and `.word` gives
 * up text selection so that iOS's magnifier stays off the 500 ms hold. That
 * trade is the right one for the hold and it left the reference answer readable
 * but un-liftable — and the reference answer is exactly what you want in a note,
 * a dictionary or a message.
 *
 * The glyph is the same everywhere and the label says copy *what*, because
 * several controls all announced as "copy" are identical controls to anyone who
 * cannot see which block each one stands in. On the graded screen the *what* is
 * the block — "the reference answer"; in the inspect sheet it is the word
 * itself, so that sheet's button announces as "Copy rosam". `❐` is a Dingbat,
 * the block `✎ ✱ ✕ ✓` already ship from, rather than the more conventional `⧉`
 * from a mathematical block that phone fonts cover less reliably.
 */
export function CopyButton({
  what,
  onCopy,
}: {
  what: string;
  onCopy: () => void;
}) {
  return (
    <button className="copybtn" onClick={onCopy} aria-label={`Copy ${what}`}>
      ❐ copy
    </button>
  );
}

/**
 * The page of the book a line came off, as a press.
 *
 * It sits under a sentence, where the attribution sits, because it says the
 * same kind of thing about the same line: `— Cicero, Tusc. 2.13` names who
 * wrote it and this names where the grammar teaches it. A card that has come
 * round is exactly when a student wants the rule back, and until this the two
 * card screens were the only ones in the app with no way into the book — the
 * status bar deliberately prints `Vocabulary` there rather than a topic.
 *
 * **Two strings, resolved by the caller.** This file has no `Content` and must
 * not grow one: the section has to be looked up, checked to still exist, and
 * printed with its own book's `§` — all three of which are the app's job, and
 * the second of which decides whether this is drawn at all.
 *
 * The ref and the title are separate spans, as they are on the status bar, so
 * `§ 20-22` can be dimmed against the name without either being a second
 * button. Announced by the title alone: a screen reader given "§ 20-22" has
 * been told a number, where a student is owed the name of the page.
 */
export function TopicLink({
  label,
  title,
  onOpen,
}: {
  label: string;
  title: string;
  onOpen: () => void;
}) {
  return (
    <button
      className="topiclink"
      onClick={onOpen}
      aria-label={`Read the grammar for ${title}`}
    >
      <span className="topiclink__ref">{label}</span>
      <span className="topiclink__title">{title}</span>
    </button>
  );
}

/**
 * The bookmark, filled when it is set and drawn in outline when it is not.
 *
 * The one drawing in this app, and it is one under protest: every other icon
 * here is a character, which is why they all take the type's own colour and
 * weight without being told to. There is no character for this. Unicode's
 * nearest filled-and-hollow pair is a flag, and a flag says something else —
 * this is a page marked to come back to, in a book, and the shape a reader
 * knows for that is the ribbon.
 *
 * `currentColor` on the fill and the stroke, so it takes `--gold` where it is a
 * marker and `--text-dim` where it is a control, exactly as a glyph would; and
 * `aria-hidden`, because in all three of its homes the label is beside it or on
 * the button around it.
 */
export function BookmarkIcon({ on }: { on: boolean }) {
  return (
    <svg className="bookmark" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 2h8v12l-4-3-4 3z"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
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
