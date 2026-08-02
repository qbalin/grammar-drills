import { useEffect, useRef, useState } from "react";
import type { LemmaEntry, VocabCardState } from "@lang-tutor/core";
import { fold, profile } from "../pack.js";
import { Sheet, Spinner, ago, until } from "../ui.js";

/**
 * Recording an unknown word.
 *
 * The student types the word as they met it — any inflected form — and the
 * dictionary headword is built for them: `manibus` becomes
 * `manus, manūs (f): hand`. Producing that citation by hand is the tedious part
 * of keeping a vocabulary list, and the reason most people stop.
 *
 * The dictionary is 900 KB and is not downloaded until this sheet is first
 * opened, so the first use waits on it.
 */
export function VocabSheet({
  status,
  initialForm = "",
  autoLookup = false,
  onLookup,
  onClose,
}: {
  /** Whether the dictionary is here yet, and if not, why. */
  status: "ready" | "loading" | "unavailable";
  /** A word held down on the question, already in the box. */
  initialForm?: string;
  /** Look it up the moment the dictionary lands, without a second tap. */
  autoLookup?: boolean;
  /** Resolve the form; the parent owns the candidate list and the saving. */
  onLookup: (form: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initialForm);
  const input = useRef<HTMLInputElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (status === "ready") input.current?.focus();
  }, [status]);

  // A word held on the question while the dictionary was still downloading:
  // the student has already said which word they meant, so the wait is the only
  // thing standing between them and the card.
  useEffect(() => {
    if (!autoLookup || status !== "ready" || fired.current) return;
    if (!initialForm.trim()) return;
    fired.current = true;
    onLookup(initialForm);
  }, [autoLookup, initialForm, onLookup, status]);

  return (
    <Sheet title="Record a word" onClose={onClose}>
      {status === "loading" ? (
        <div className="centered" style={{ padding: "1.5rem 0" }}>
          <Spinner />
          <p>Fetching the dictionary — this happens once.</p>
        </div>
      ) : status === "unavailable" ? (
        // Without this the lookup would run anyway and report "no match",
        // blaming the spelling for what is really a missing download.
        <div className="centered" style={{ padding: "1.5rem 0" }}>
          <p>
            The dictionary hasn't been saved to this device yet, and it needs a
            connection to fetch. Everything else works offline.
          </p>
          <p>
            Next time you're online, Settings → <em>Save dictionary for
            offline</em> keeps it here for good.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.trim()) onLookup(form);
          }}
        >
          <label className="field">
            <span className="field__label">Type the word as you saw it</span>
            <input
              ref={input}
              value={form}
              onChange={(e) => setForm(e.target.value)}
              placeholder="manibus"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            <span className="field__hint">
              Any form will do — the headword is built for you. Macrons optional.
            </span>
          </label>
          <div className="actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={!form.trim()}
            >
              Look up
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

/**
 * Which word it was. Latin forms are genuinely ambiguous — `manibus` is both
 * the noun *manus* and the adjective *mānis* — so the candidates are offered
 * most-frequent-first and the student settles it.
 */
export function VocabPickSheet({
  form,
  candidates,
  onPick,
  onClose,
}: {
  form: string;
  candidates: LemmaEntry[];
  onPick: (entry: LemmaEntry) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={`Which word is “${form}”?`} onClose={onClose}>
      <div className="list">
        {candidates.slice(0, 12).map((c) => (
          <button
            className="row"
            key={`${c.lemma}-${c.pos}`}
            onClick={() => onPick(c)}
          >
            <span className="row__main">
              <span className="row__title">{c.citation}</span>
              <span className="row__sub">
                {c.gloss}
                {c.pos ? ` · ${c.pos}` : ""}
              </span>
            </span>
            <span className="row__chev">›</span>
          </button>
        ))}
      </div>
      <p className="field__hint">Most frequent first.</p>
    </Sheet>
  );
}

/**
 * A word the dictionary has not got, written out by hand.
 *
 * The dictionary is large but finite, and a miss used to be the end of the
 * road: a toast saying "no match" and a word the student had just decided was
 * worth keeping, gone. A proper noun, a late coinage, a form the lemmatizer
 * cannot cut — none of them are mistakes, and all of them are exactly the words
 * a reader stops on. So the miss opens this instead, with the form already in
 * the citation box.
 *
 * Both sides are required. A card is a pair — the meaning is the prompt and the
 * citation is the answer — and one saved with either side blank is a card that
 * can never be reviewed, only met and deleted.
 */
export function VocabNewSheet({
  form,
  onSave,
  onClose,
}: {
  /** The word as it was met; the citation starts here and is edited from it. */
  form: string;
  onSave: (entry: { citation: string; gloss: string }) => void;
  onClose: () => void;
}) {
  const [citation, setCitation] = useState(form.trim());
  const [gloss, setGloss] = useState("");
  const meaning = useRef<HTMLInputElement>(null);
  const complete = citation.trim() !== "" && gloss.trim() !== "";

  // The citation arrives filled in, so the meaning is the box with work to do.
  useEffect(() => {
    meaning.current?.focus();
  }, []);

  return (
    <Sheet title="Write the card yourself" subtitle={form.trim()} onClose={onClose}>
      <p className="field__hint" style={{ marginTop: 0 }}>
        “{form.trim()}” is not in the dictionary, so there is no headword to
        build. Write the card as you would want to be asked it.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) onSave({ citation, gloss });
        }}
      >
        <label className="field">
          <span className="field__label">Citation</span>
          <input
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label="Citation"
          />
          <span className="field__hint">
            The form you are asked to produce — the dictionary's own naming, as
            near as you can give it.
          </span>
        </label>
        <label className="field">
          <span className="field__label">Meaning</span>
          <input
            ref={meaning}
            value={gloss}
            onChange={(e) => setGloss(e.target.value)}
            enterKeyHint="done"
            aria-label="Meaning"
          />
          <span className="field__hint">
            The prompt side: this is what you see before the {profile.l2.name}.
          </span>
        </label>
        <div className="actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" type="submit" disabled={!complete}>
            Save
          </button>
        </div>
      </form>
      {!complete && (
        // Said rather than only shown: a disabled button with no reason beside
        // it reads as the app being broken, not as a field being empty.
        <p className="field__hint">
          Both sides are needed — a card with one side blank cannot be reviewed.
        </p>
      )}
    </Sheet>
  );
}

/**
 * Every word recorded.
 *
 * Until this existed a card could only be created and reviewed: a word saved
 * from the wrong candidate, or a gloss that turned out to be the wrong sense,
 * was permanent. The list is also the only place the vocabulary is visible as a
 * vocabulary rather than as one card at a time.
 */
export function VocabListSheet({
  cards,
  now = new Date(),
  onPick,
  onClose,
}: {
  cards: VocabCardState[];
  now?: Date;
  onPick: (card: VocabCardState) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const needle = fold(filter);
  const shown = needle
    ? cards.filter(
        (c) =>
          fold(c.citation).includes(needle) ||
          c.gloss.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : cards;

  return (
    <Sheet title="Vocabulary" subtitle={`${cards.length}`} onClose={onClose}>
      {cards.length === 0 ? (
        <p className="field__hint" style={{ marginTop: 0 }}>
          No words yet. Hold a word in an answer, or use <em>record a word</em>,
          and it lands here.
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
              aria-label="Filter words"
            />
          </label>
          <div className="list">
            {shown.map((c) => {
              const due = new Date(c.fsrs.due);
              return (
                <button className="row" key={c.id} onClick={() => onPick(c)}>
                  <span className="row__main">
                    <span className="row__title">{c.citation}</span>
                    <span className="row__sub">
                      {c.gloss}
                      {" · "}
                      {due.getTime() <= now.getTime()
                        ? "due now"
                        : `back in ${until(now, due)}`}
                    </span>
                  </span>
                  <span className="row__chev">›</span>
                </button>
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

/**
 * One card, corrected.
 *
 * Both sides are editable because both can be wrong in ways the dictionary
 * cannot know: the citation when an ambiguous form resolved to the wrong lemma,
 * the gloss when the sense you met is the fourth one down. The card's schedule
 * is untouched by an edit, so fixing a word months in does not cost it its
 * history — which is the whole reason this is safe to offer at any time.
 */
export function VocabEditSheet({
  card,
  onSave,
  onDelete,
  onClose,
}: {
  card: VocabCardState;
  onSave: (patch: { citation: string; gloss: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [citation, setCitation] = useState(card.citation);
  const [gloss, setGloss] = useState(card.gloss);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const changed =
    citation.trim() !== card.citation || gloss.trim() !== card.gloss;
  // The same rule a new card is held to: emptying the meaning here would leave
  // a card with nothing on its prompt side, which is the one way an edit could
  // break a word rather than fix it. Deleting is the way to be rid of a card.
  const complete = citation.trim() !== "" && gloss.trim() !== "";

  return (
    <Sheet title="Edit word" subtitle={card.pos} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) onSave({ citation, gloss });
        }}
      >
        <label className="field">
          <span className="field__label">Citation</span>
          <input
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Citation"
          />
          <span className="field__hint">
            How the dictionary names it — the form you are asked to produce.
          </span>
        </label>
        <label className="field">
          <span className="field__label">Meaning</span>
          <input
            value={gloss}
            onChange={(e) => setGloss(e.target.value)}
            aria-label="Meaning"
          />
          <span className="field__hint">
            The prompt side: this is what you see before the Latin.
          </span>
        </label>
        <div className="actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={!complete || !changed}
          >
            Save
          </button>
        </div>
      </form>
      {!complete && (
        <p className="field__hint">
          Both sides are needed — a card with one side blank cannot be reviewed.
        </p>
      )}

      <div className="section-title">Remove</div>
      {confirmDelete ? (
        <div className="actions">
          <button className="btn" onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
          <button className="btn btn--quiet" onClick={onDelete}>
            Delete “{card.citation}”
          </button>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn--quiet" onClick={() => setConfirmDelete(true)}>
            Delete this word
          </button>
        </div>
      )}
      <p className="field__hint">
        Recorded {ago(card.created)}, reviewed {card.fsrs.reps}{" "}
        {card.fsrs.reps === 1 ? "time" : "times"}.
      </p>
    </Sheet>
  );
}
