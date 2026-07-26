import type { GrammarSection } from "@latin-tutor/core";
import { Sheet } from "../ui.js";

/**
 * One grammar section, in full.
 *
 * The CLI pages this by hand because a terminal has no scrollbar; a touch
 * screen does, so the whole section simply goes in the sheet and the thumb does
 * the rest. Nothing is trimmed — what the reader cannot reach, they can never
 * learn.
 *
 * The text is preformatted monospace, and that is not a stylistic choice.
 * `parse-grammar.py` flattens Bennett's paradigm tables to one line each and
 * holds the columns apart with runs of spaces, so `amō  amās  amat` only stays
 * a table if the spaces and the line breaks both survive.
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
      <div className="grammar__scroll">
        <div className="grammar">{section.text}</div>
      </div>
    </Sheet>
  );
}
