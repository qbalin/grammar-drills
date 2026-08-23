import { useState } from "react";
import type { SentenceCardState } from "@lang-tutor/core";
import { Sentence, Sheet, l2Attrs, until } from "../ui.js";
import { fold } from "../pack.js";

/**
 * The sentences a student has kept, and the way to forget one.
 *
 * Beside the vocabulary list and shaped like it, with two differences that are
 * both about what the two decks are. The rows lead with the L2 rather than with
 * a headword, because a kept sentence has no headword and is recognised by its
 * own words. And the order is the deck's — newest first — rather than
 * alphabetical, because a dictionary has an order to be read in and a
 * commonplace book has none.
 *
 * There is no edit sheet, and that is the deck's design rather than a gap: a
 * card is a copy of a question at the moment it was kept, marks and all, and
 * something that could be corrected afterwards would be a different promise.
 * Forgetting it and keeping it again is how to say the other thing.
 */
export function SentenceListSheet({
  cards,
  now = new Date(),
  onForget,
  onClose,
}: {
  cards: SentenceCardState[];
  now?: Date;
  onForget: (card: SentenceCardState) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const needle = fold(filter);
  const plain = filter.trim().toLowerCase();
  const shown = needle
    ? cards.filter(
        (c) => fold(c.answer).includes(needle) || c.prompt.toLowerCase().includes(plain),
      )
    : cards;

  return (
    <Sheet title="Sentences" subtitle={`${cards.length}`} onClose={onClose}>
      {cards.length === 0 ? (
        <p className="field__hint" style={{ marginTop: 0 }}>
          No sentences yet. Answer a question, then use{" "}
          <em>keep this sentence</em>, and it lands here — with whatever you had
          picked out in it.
        </p>
      ) : (
        <>
          <label className="field">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Filter sentences"
            />
          </label>
          <div className="contexts">
            {shown.map((c) => {
              const due = new Date(c.fsrs.due);
              return (
                <div className="context" key={c.id}>
                  <div className="context__source">
                    {due.getTime() <= now.getTime()
                      ? "due now"
                      : `back in ${until(now, due)}`}
                  </div>
                  {/* Drawn as the card draws it, marks and all: what the student
                      picked out is most of the reason a sentence was kept, and a
                      list that flattened it would be a list of different
                      sentences. */}
                  <div {...l2Attrs} className="context__sentence">
                    <Sentence text={c.answer} marks={c.marks?.answer} />
                  </div>
                  <div className="context__prompt">
                    <Sentence text={c.prompt} marks={c.marks?.prompt} />
                  </div>
                  {c.source && (
                    <div className="attribution">
                      — {c.source.author}, <cite>{c.source.work}</cite>
                      {c.source.locus ? ` ${c.source.locus}` : ""}
                    </div>
                  )}
                  {/* The sheet's own two-step, not the link row's: there is room
                      for a pair of buttons here, so this takes the shape every
                      other deletion on a sheet has. */}
                  {confirm === c.id ? (
                    <div className="actions">
                      <button className="btn" onClick={() => setConfirm(null)}>
                        Keep it
                      </button>
                      <button
                        className="btn btn--danger"
                        onClick={() => {
                          setConfirm(null);
                          onForget(c);
                        }}
                      >
                        Confirm — forget it
                      </button>
                    </div>
                  ) : (
                    <div className="context__tools">
                      <button
                        className="btn btn--quiet"
                        onClick={() => setConfirm(c.id)}
                      >
                        ✕ forget this one
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {shown.length === 0 && (
            <p className="field__hint">Nothing matches “{filter.trim()}”.</p>
          )}
        </>
      )}
    </Sheet>
  );
}
