import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { parseBlocks, type Block, type GrammarSection, type Run } from "@lang-tutor/core";
import { BookmarkIcon, Sheet, TableBox } from "../ui.js";
import { profile } from "../pack.js";

/** How far a finger must travel across before it counts as a page turn. */
const SWIPE_PX = 56;
/**
 * …and how much more sideways than up-and-down. A section is a page of prose
 * that scrolls, so anything close to vertical was somebody reading, not paging.
 */
const SWIPE_RATIO = 1.5;

/** The section a gesture or an arrow key asks for; nothing at either end. */
type Turn = -1 | 1;

/**
 * The swipe, as one pair of handlers.
 *
 * Pointer events rather than touch, which is what the hold gesture in `ui.tsx`
 * already uses — but a mouse is the one pointer that does not turn pages. A
 * drag across prose with a mouse is somebody selecting a line to copy, and a
 * page turning out from under it is the whole of what they get instead. There
 * is nothing to replace: the arrows at the foot and the arrow keys page a
 * desktop perfectly well, and this is asked per event rather than per device,
 * so a laptop with a touchscreen still swipes with a finger while its mouse
 * selects.
 */
function useSwipe(onTurn: (dir: Turn) => void) {
  const from = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      // A paradigm too wide for a phone scrolls sideways inside its own box.
      // A finger that starts in one is aiming at the table, and turning the
      // page under it would put the endings it was reading out of reach.
      const table = (e.target as Element | null)?.closest?.(".gr-tablewrap");
      from.current =
        e.pointerType === "mouse" || (table && table.scrollWidth > table.clientWidth)
          ? null
          : { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const start = from.current;
      from.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
      // Left takes you forward, as it does in every book that turns this way.
      onTurn(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      from.current = null;
    },
  };
}

/**
 * One grammar section, in full, and the book it sits in.
 *
 * The CLI pages this by hand because a terminal has no scrollbar; a touch
 * screen does, so the whole section simply goes in the sheet and the thumb does
 * the rest. Nothing is trimmed — what the reader cannot reach, they can never
 * learn.
 *
 * Reading rarely stops at one section: the declensions run over several, and
 * the thing you actually wanted is often the § next door. So the sheet turns
 * pages — swipe across, tap the neighbour named at the foot, or use the arrow
 * keys — instead of making the reader close it, reopen the map and pick again.
 * Book order, the same order the map lists and study sweeps.
 *
 * Reading is also where "I should be studying this" happens, and until now the
 * sheet was a dead end: everything a topic can do lived behind the map. The →
 * in the head is the way from the page you are reading to the things you can do
 * with it.
 *
 * The section arrives as flat text with its shape stripped out (see
 * `parseBlocks`), so the structure is recovered here and rendered as real
 * elements: a paradigm becomes a table whose columns line up by layout rather
 * than by counting spaces, and a sub-point gets the hanging indent that says it
 * is subordinate to the paragraph above. Each table carries its own sideways
 * scroll, so the sheet itself only ever scrolls up and down.
 */
export function GrammarSheet({
  section,
  onClose,
  action,
  prev,
  next,
  onPage,
  onStudy,
  onBookmark,
  bookmarked,
  onFollow,
  at,
  formatRef = (r) => `${profile.grammar.refPrefix}${r}`,
}: {
  section: GrammarSection;
  onClose: () => void;
  action?: React.ReactNode;
  /** The sections either side in book order; absent at the two ends. */
  prev?: GrammarSection;
  next?: GrammarSection;
  /** Turn to a section. Without it the reader is a single page, as it was. */
  onPage?: (section: GrammarSection) => void;
  /** Open what can be done with the section on screen — quiz, study, drill. */
  onStudy?: () => void;
  /**
   * Bookmark the section being read, or take the bookmark off.
   *
   * The two go together and both are optional, so a reader mounted without them
   * is the reader as it was. Absent is also how the parent says *this* section
   * cannot carry one: a section of a further grammar the crosswalk does not
   * reach has no primary topic to file the mark under, and `Session.bookmark`
   * returns having done nothing. A control that cannot do its one job is worse
   * than no control, so there is none.
   */
  onBookmark?: () => void;
  /**
   * Whether it is bookmarked now. A prop rather than anything held here: the
   * sheet stays mounted across a page turn, so state of its own would be the
   * previous page's answer about the current page.
   */
  bookmarked?: boolean;
  /**
   * Follow a cross-reference, by the number the book printed. Without it the
   * references are set as the book set them and go nowhere, which is what a
   * pack whose source carried no links gets anyway.
   */
  onFollow?: (ref: string) => void;
  /** The numbered section to open at, when a reference asked for one. */
  at?: string;
  /**
   * How this book writes a section reference. Per book rather than per pack:
   * `refPrefix` is declared on each grammar, and a Lane page read out of the
   * primary's prefix is the primary's prefix on somebody else's numbering.
   */
  formatRef?: (ref: string) => string;
}) {
  // Which way the last turn went, so the new page comes in from the side the
  // finger left towards rather than simply appearing.
  const [turn, setTurn] = useState<Turn | 0>(0);

  const page = (to: GrammarSection | undefined, dir: Turn) => {
    if (!to || !onPage) return;
    setTurn(dir);
    onPage(to);
  };

  const swipe = useSwipe((dir) => page(dir === 1 ? next : prev, dir));

  // The same two turns from a keyboard. A sheet is modal, so the arrows are
  // free — except where something is being typed into, which is never in here
  // but is one focus restore away.
  useEffect(() => {
    if (!onPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") page(prev, -1);
      else if (e.key === "ArrowRight") page(next, 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [prev, next, onPage]);

  // Land on the section a reference asked for.
  //
  // After paint rather than in the effect proper: `Sheet` puts a newly-opened
  // page back at the top, and a parent's effects run after its children's, so
  // scrolling here directly would be undone a moment later by the reset. A
  // reference into the *same* topic changes no title, so nothing resets and
  // this is the only thing that moves the page.
  useEffect(() => {
    if (!at) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(anchor(at))?.scrollIntoView?.({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [at, section.id]);

  const ref = (s: GrammarSection) => formatRef(s.ref);

  return (
    <Sheet
      title={section.title}
      subtitle={ref(section)}
      onClose={onClose}
      // The one sheet that walks: a § followed out of the prose is a step this
      // pair can take back, and no other sheet moves that way.
      trail
      action={
        <>
          {/* The mark before the two ways onward: it is about the page you are
              on, and they are both about leaving it. */}
          {onBookmark && (
            <button
              className={`iconbtn${bookmarked ? " iconbtn--marked" : ""}`}
              onClick={onBookmark}
              aria-pressed={bookmarked}
              aria-label={
                bookmarked
                  ? `Remove bookmark from ${section.title}`
                  : `Bookmark ${section.title}`
              }
            >
              <BookmarkIcon on={!!bookmarked} />
            </button>
          )}
          {action}
          {onStudy && (
            <button
              className="iconbtn iconbtn--go"
              onClick={onStudy}
              aria-label={`Study ${section.title}`}
            >
              →
            </button>
          )}
        </>
      }
    >
      <div className="reader" {...(onPage ? swipe : {})}>
        <div
          // Remounted per section, which is what restarts the slide and what
          // drops the previous page's tables at their old sideways scroll.
          key={section.id}
          className={`grammar${turn ? ` grammar--turn${turn > 0 ? "-next" : "-prev"}` : ""}`}
        >
          {parseBlocks(section.text, profile.grammar).map((block, i) => (
            <GrammarBlock
              key={i}
              block={block}
              formatRef={formatRef}
              onFollow={onFollow}
            />
          ))}
        </div>
        {onPage && (prev || next) && (
          <nav className="pager" aria-label="Sections in book order">
            {prev ? (
              <button
                className="pager__btn"
                onClick={() => page(prev, -1)}
                aria-label={`Previous section: ${ref(prev)} ${prev.title}`}
              >
                <span className="pager__arrow" aria-hidden="true">
                  ‹
                </span>
                <span className="pager__main">
                  <span className="pager__ref">{ref(prev)}</span>
                  <span className="pager__title">{prev.title}</span>
                </span>
              </button>
            ) : (
              <span className="pager__end" />
            )}
            {next ? (
              <button
                className="pager__btn pager__btn--next"
                onClick={() => page(next, 1)}
                aria-label={`Next section: ${ref(next)} ${next.title}`}
              >
                <span className="pager__main">
                  <span className="pager__ref">{ref(next)}</span>
                  <span className="pager__title">{next.title}</span>
                </span>
                <span className="pager__arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ) : (
              <span className="pager__end" />
            )}
          </nav>
        )}
        {onPage && (prev || next) && (
          // The gesture says nothing about itself, and a reader who never
          // learns it is a reader for whom the buttons are the whole feature.
          // Which sentence is true is a fact about the pointer, so the styles
          // pick between them: a mouse does not swipe, and the keys are what
          // it has instead.
          <p className="pager__hint">
            <span className="pager__hint--touch">Swipe across to turn the page.</span>
            <span className="pager__hint--keys">Use the arrow keys to turn the page.</span>
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** The id a section number answers to, so a reference can land on it. */
const anchor = (n: string) => `gr-sec-${n}`;

/**
 * What everything below needs and none of it should have to be told twice: how
 * this book writes a section reference, and what to do when one is pressed.
 */
interface Reading {
  formatRef: (ref: string) => string;
  onFollow?: (ref: string) => void;
}

/**
 * The number the book prints where a section begins.
 *
 * A topic is a *run* of sections — `§ 20-22 First Declension` is three of them
 * — and until this the run's number reached the page only as the sheet's
 * subtitle. Inside, the boundaries were invisible: "as given in § 270" pointed
 * at something no page ever showed, and a student reading four sections of the
 * third declension could not say which of them they were in.
 *
 * Set as a lead-in because that is how the book sets it, and carrying the
 * anchor because it is also where a reference lands.
 */
function Num({ n, formatRef }: { n: string } & Pick<Reading, "formatRef">) {
  return (
    <span className="gr-num" id={anchor(n)}>
      {formatRef(n)}.
    </span>
  );
}

/**
 * Text with the emphasis the grammar set it in, and its cross-references live.
 *
 * Bennett bolds the *ending* inside each form and italicises the English
 * gloss, which is the difference between a paradigm and a list of words. Packs
 * whose source keeps none of that pass no runs and fall back to plain text.
 *
 * A run carrying `ref` is a reference the book itself hyperlinked, and it
 * becomes a button. Table cells render through here too, so `(For declension
 * see § 87.)` inside a paradigm row is as live as one in a sentence.
 */
function Runs({
  runs,
  text,
  onFollow,
}: { runs?: Run[]; text: string } & Pick<Reading, "onFollow">) {
  if (!runs) return <>{text}</>;
  return (
    <>
      {runs.map((run, i) =>
        run.ref && onFollow ? (
          <button
            key={i}
            type="button"
            className={`gr-ref ${run.b ? "gr-b" : ""} ${run.i ? "gr-i" : ""}`.trim()}
            onClick={() => onFollow(run.ref!)}
          >
            {run.text}
          </button>
        ) : run.b || run.i ? (
          <span key={i} className={`${run.b ? "gr-b" : ""} ${run.i ? "gr-i" : ""}`.trim()}>
            {run.text}
          </span>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

function GrammarBlock({
  block,
  formatRef,
  onFollow,
}: { block: Block } & Reading) {
  // The number of the section this block opens, where it opens one. Inline for
  // everything that has a sentence to lead; on its own line above a paradigm,
  // which has none — §42 is a bare number over a table in Bennett.
  const num = block.num ? <Num n={block.num} formatRef={formatRef} /> : null;

  switch (block.kind) {
    case "para":
      return (
        <p className="gr-p">
          {num}
          <Runs runs={block.runs} text={block.text} onFollow={onFollow} />
        </p>
      );

    case "heading":
      return (
        <h3 className="gr-h">
          {num}
          <Runs runs={block.runs} text={block.text} onFollow={onFollow} />
        </h3>
      );

    case "item":
      return (
        <div className={`gr-item gr-item--${block.level}`}>
          <span className="gr-marker">{block.marker}</span>
          <span>
            {num}
            <Runs runs={block.runs} text={block.text} onFollow={onFollow} />
          </span>
        </div>
      );

    case "table":
      return (
        <>
          {num && <p className="gr-p gr-p--num">{num}</p>}
          <TableBox>
            {block.rows.map((row, i) => (
              <tr key={i} className={`gr-row--${row.kind}`}>
                {row.kind === "divider" ? (
                  <td className="gr-divider" colSpan={block.columns}>
                    <Runs runs={row.runs?.[0]} text={row.cells[0]!} onFollow={onFollow} />
                  </td>
                ) : (
                  row.cells.map((cell, j) =>
                    row.kind === "head" ? (
                      // The stub column is never part of a caption group.
                      <th key={j} scope="col" colSpan={j === 0 ? 1 : (row.span ?? 1)}>
                        <Runs runs={row.runs?.[j]} text={cell} onFollow={onFollow} />
                      </th>
                    ) : (
                      <td key={j}>
                        <Runs runs={row.runs?.[j]} text={cell} onFollow={onFollow} />
                      </td>
                    ),
                  )
                )}
              </tr>
            ))}
          </TableBox>
        </>
      );
  }
}
