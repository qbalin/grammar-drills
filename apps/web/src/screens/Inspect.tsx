import { buildParadigm, type LemmaEntry, type TaggedForm } from "@lang-tutor/core";
import { profile } from "../pack.js";
import { Sheet, Spinner, TableBox } from "../ui.js";

/**
 * What a word is, when you ask it directly.
 *
 * The grammar shows one noun of each declension and expects the student to see
 * that theirs follows it. That works until it doesn't — until the word is
 * irregular, or defective, or the student simply cannot tell which model it
 * belongs to, which is most of the time and exactly when the question comes up.
 * So a word can be asked for its own table.
 *
 * The layout is the pack's (`profile.paradigms`), read here rather than baked
 * in: which features are rows and which are columns is the language's business.
 */
export function InspectSheet({
  form,
  entry,
  others,
  forms,
  loading,
  onPick,
  onClose,
}: {
  /** The word as it stood in the sentence, which is what was double-clicked. */
  form: string;
  entry: LemmaEntry;
  /** The other readings of the same form; empty when it is unambiguous. */
  others: LemmaEntry[];
  /** This entry's tagged forms, or undefined until they arrive. */
  forms?: TaggedForm[];
  loading: boolean;
  onPick: (entry: LemmaEntry) => void;
  onClose: () => void;
}) {
  const blocks = profile.paradigms?.[entry.pos];
  const paradigm = forms && blocks ? buildParadigm(forms, blocks) : undefined;

  return (
    <Sheet title={entry.citation} subtitle={form} onClose={onClose}>
      <p className="gr-p">{entry.gloss}</p>
      <p className="field__hint">
        {[entry.pos, entry.gender, entry.declension && `declension ${entry.declension}`]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {others.length > 0 && (
        <div className="inspect__others">
          {/* The form is ambiguous and the commonest reading is showing. No
              dialog in the way: this is a look, not a decision, and the other
              readings are one tap each. */}
          <p className="field__hint">Also read as:</p>
          {others.map((other) => (
            <button
              className="chip"
              key={`${other.lemma}|${other.pos}`}
              onClick={() => onPick(other)}
            >
              {other.citation}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="field__hint">
          <Spinner /> Fetching the tables — this happens once.
        </p>
      )}

      {paradigm?.tables.map((table, i) => (
        <div key={i}>
          {table.title && <h3 className="gr-h">{table.title}</h3>}
          <TableBox>
            <tr className="gr-row--head">
              <th scope="col" />
              {table.columns.map((column, j) => (
                <th key={j} scope="col">
                  {column}
                </th>
              ))}
            </tr>
            {table.rows.map((row, j) => (
              <tr key={j} className="gr-row--body">
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, k) => (
                  // Two forms in one cell is the ordinary case, not an error:
                  // `amāvistī` and its syncopated `amāstī` are both the perfect
                  // second singular, and a grammar prints both.
                  <td key={k}>{cell.join(" · ") || "—"}</td>
                ))}
              </tr>
            ))}
          </TableBox>
        </div>
      ))}

      {paradigm && paradigm.other.length > 0 && (
        <>
          <h3 className="gr-h">Other forms</h3>
          <div className="list">
            {paradigm.other.map((other, i) => (
              <div className="row row--static" key={i}>
                <span className="row__main">
                  <span className="row__title">{other.form}</span>
                  <span className="row__sub">{other.tags.join(", ")}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Indeclinable, or a word the tables were never built for. Saying so is
          better than an empty sheet that reads as a failure. */}
      {!loading && !paradigm?.tables.length && !paradigm?.other.length && (
        <p className="field__hint">
          {blocks
            ? "No inflected forms — this word does not change."
            : "No tables are built for this part of speech."}
        </p>
      )}
    </Sheet>
  );
}
