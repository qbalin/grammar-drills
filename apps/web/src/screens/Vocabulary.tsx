import type { VocabWord } from "@lang-tutor/core";
import { Spinner, useHold } from "../ui.js";

/**
 * The words behind the question, folded away until asked for.
 *
 * A disclosure rather than a sheet: a sheet would cover the answer box, and the
 * moment this is wanted is the moment the student is mid-sentence and stuck. It
 * opens in place, above the box, and the box stays reachable underneath.
 *
 * It is a crib, not a reveal — the English of the prompt against the Latin in
 * its dictionary form, in the prompt's order. Which word goes where, and in
 * which case, is still the exercise.
 *
 * A row can be held down to record the word, on the same terms as a word in the
 * sentence: this is where a student meets the word they did not know, so it is
 * the likeliest place to want it kept. The row is the target rather than the
 * citation alone, because a citation is `rosa, rosae (f)` — three tokens and a
 * comma — and asking a thumb to land on one of them would be asking it to pick
 * a word out of a dictionary entry. The row already stands for exactly one
 * word, so the whole row takes the press.
 */
export function QuestionVocabulary({
  words,
  open,
  status,
  onToggle,
  onHold,
}: {
  words: VocabWord[];
  open: boolean;
  /** Whether the dictionary is on this device yet, and if not, why. */
  status: "ready" | "loading" | "unavailable";
  onToggle: () => void;
  /** A row held down: record the word it stands for. */
  onHold: (word: VocabWord) => void;
}) {
  const { isHeld, hold } = useHold();
  if (words.length === 0) return null;
  return (
    <div className="crib">
      <button
        className="crib__toggle"
        aria-expanded={open}
        aria-controls="question-vocabulary"
        onClick={onToggle}
      >
        <span className="crib__caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {/* Counted from the sentence itself, so the honest number is on screen
            before the dictionary has finished downloading. */}
        Vocabulary — {words.length} {words.length === 1 ? "word" : "words"}
      </button>
      {open && (
        <div className="crib__list" id="question-vocabulary">
          {status === "loading" ? (
            <div className="crib__status">
              <Spinner />
              <p>Fetching the dictionary — this happens once.</p>
            </div>
          ) : status === "unavailable" ? (
            // Without this the lookups would all come back empty and every word
            // would read "not in the dictionary" — blaming the words for a
            // download that never happened.
            <div className="crib__status">
              <p>
                The dictionary hasn’t been saved to this device yet, and it
                can’t be fetched right now. The words are below without it.
              </p>
            </div>
          ) : null}
          {status !== "loading" &&
            words.map((word) => (
              <div
                className={`crib-row${isHeld(word.form) ? " crib-row--held" : ""}`}
                key={word.form}
                {...hold(word.form, () => onHold(word))}
              >
                <span
                  className={`crib-row__english${
                    word.english ? "" : " crib-row__english--none"
                  }`}
                >
                  {/* A dot, not a blank: the row is deliberately unpaired, and a
                      blank column would read as a rendering fault. */}
                  {word.english ?? "·"}
                </span>
                <span className="crib-row__latin">
                  {word.entry ? (
                    <>
                      <span className="crib-row__citation">{word.entry.citation}</span>
                      {/* Only where the prompt named nothing. Where it did, its
                          own word is the gloss, and printing both doubles the
                          list for no extra meaning. */}
                      {word.status !== "paired" && (
                        <span className="crib-row__gloss">{word.entry.gloss}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="crib-row__citation">{word.form}</span>
                      <span className="crib-row__missing">not in the dictionary</span>
                    </>
                  )}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
