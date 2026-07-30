import { parseBlocks, type Block, type GrammarSection, type Run } from "@lang-tutor/core";
import { Sheet } from "../ui.js";
import { profile } from "../pack.js";

/**
 * One grammar section, in full.
 *
 * The CLI pages this by hand because a terminal has no scrollbar; a touch
 * screen does, so the whole section simply goes in the sheet and the thumb does
 * the rest. Nothing is trimmed — what the reader cannot reach, they can never
 * learn.
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
}: {
  section: GrammarSection;
  onClose: () => void;
  action?: React.ReactNode;
}) {
  return (
    <Sheet
      title={section.title}
      subtitle={`§ ${section.ref}`}
      onClose={onClose}
      action={action}
    >
      <div className="grammar">
        {parseBlocks(section.text, profile.grammar).map((block, i) => (
          <GrammarBlock key={i} block={block} />
        ))}
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
        // A seven-column paradigm cannot fit a phone, and the fix is never to
        // reflow it — the endings lined up in a column *are* the lesson. So the
        // table scrolls sideways inside its own box, leaving the page itself
        // scrolling only up and down.
        <div className="gr-tablewrap">
          <table className="gr-table">
            <tbody>
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
            </tbody>
          </table>
        </div>
      );
  }
}
