import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { parseBlocks, type Block, type GrammarSection, type Run } from "@lang-tutor/core";
import { Sheet, TableBox } from "../ui.js";
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
 * Pointer events rather than touch: the same press then works from a trackpad
 * drag, and it is what the hold gesture in `ui.tsx` already uses.
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
        table && table.scrollWidth > table.clientWidth
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

  const ref = (s: GrammarSection) => `${profile.grammar.refPrefix}${s.ref}`;

  return (
    <Sheet
      title={section.title}
      subtitle={ref(section)}
      onClose={onClose}
      action={
        <>
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
            <GrammarBlock key={i} block={block} />
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
          <p className="pager__hint">Swipe across to turn the page.</p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Text with the emphasis the grammar set it in.
 *
 * Bennett bolds the *ending* inside each form and italicises the English
 * gloss, which is the difference between a paradigm and a list of words. Packs
 * whose source keeps none of that pass no runs and fall back to plain text.
 */
function Runs({ runs, text }: { runs?: Run[]; text: string }) {
  if (!runs) return <>{text}</>;
  return (
    <>
      {runs.map((run, i) =>
        run.b || run.i ? (
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

function GrammarBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "para":
      return (
        <p className="gr-p">
          <Runs runs={block.runs} text={block.text} />
        </p>
      );

    case "heading":
      return (
        <h3 className="gr-h">
          <Runs runs={block.runs} text={block.text} />
        </h3>
      );

    case "item":
      return (
        <div className={`gr-item gr-item--${block.level}`}>
          <span className="gr-marker">{block.marker}</span>
          <span>
            <Runs runs={block.runs} text={block.text} />
          </span>
        </div>
      );

    case "table":
      return (
        <TableBox>
          {block.rows.map((row, i) => (
            <tr key={i} className={`gr-row--${row.kind}`}>
              {row.kind === "divider" ? (
                <td className="gr-divider" colSpan={block.columns}>
                  <Runs runs={row.runs?.[0]} text={row.cells[0]!} />
                </td>
              ) : (
                row.cells.map((cell, j) =>
                  row.kind === "head" ? (
                    // The stub column is never part of a caption group.
                    <th key={j} scope="col" colSpan={j === 0 ? 1 : (row.span ?? 1)}>
                      <Runs runs={row.runs?.[j]} text={cell} />
                    </th>
                  ) : (
                    <td key={j}>
                      <Runs runs={row.runs?.[j]} text={cell} />
                    </td>
                  ),
                )
              )}
            </tr>
          ))}
        </TableBox>
      );
  }
}
