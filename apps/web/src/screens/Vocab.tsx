import { useEffect, useRef, useState } from "react";
import type { LemmaEntry, VocabCardState, VocabContext } from "@lang-tutor/core";
import { fold, profile } from "../pack.js";
import { Sentence, Sheet, Spinner, ago, l2Attrs, until } from "../ui.js";

/**
 * Recording an unknown word.
 *
 * The student types the word as they met it — any inflected form — and the
 * dictionary headword is built for them: `manibus` becomes
 * `manus, manūs (f): hand`. Producing that citation by hand is the tedious part
 * of keeping a vocabulary list, and the reason most people stop.
 *
 * The dictionary is a few megabytes, fetched as soon as the app is up rather
 * than when this sheet first opens — so `status` is nearly always `ready` by
 * the time anyone gets here, and the waiting states below are for the student
 * who was quicker than the download.
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
              <span {...l2Attrs} className="row__title">{c.citation}</span>
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
                    <span {...l2Attrs} className="row__title">{c.citation}</span>
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
  onMoveContext,
  onEditContext,
  onDeleteContext,
  onClose,
}: {
  card: VocabCardState;
  onSave: (patch: { citation: string; gloss: string }) => void;
  onDelete: () => void;
  /** One place towards the front (-1) or the back (1). */
  onMoveContext: (at: string, dir: -1 | 1) => void;
  onEditContext: (at: string, patch: { prompt: string; sentence: string }) => void;
  onDeleteContext: (at: string) => void;
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
            The prompt side: this is what you see before the {profile.l2.name}.
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

      <div className="section-title">Where you met it</div>
      {(card.contexts ?? []).length === 0 ? (
        <p className="field__hint" style={{ marginTop: 0 }}>
          Nothing yet. Hold a word in an answer and the sentence it stood in is
          kept here, and shown on the back of this card.
        </p>
      ) : (
        <>
          <p className="field__hint" style={{ marginTop: 0 }}>
            Shown on the back of the card, in this order — the first is the one
            the hint offers. These save as you change them.
          </p>
          <div className="contexts">
            {(card.contexts ?? []).map((context, i, all) => (
              <ContextRow
                key={context.at}
                context={context}
                first={i === 0}
                last={i === all.length - 1}
                onMove={(dir) => onMoveContext(context.at, dir)}
                onEdit={(patch) => onEditContext(context.at, patch)}
                onDelete={() => onDeleteContext(context.at)}
              />
            ))}
          </div>
        </>
      )}

      <div className="section-title">Remove</div>
      {confirmDelete ? (
        <>
          <div className="actions">
            <button className="btn" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            {/* What the button does, not what it does it to: the card being
                edited is named at the top of the sheet and in the field above,
                and a citation set in the confirming button read as a label
                rather than as a warning. Still red, and still asked twice: the
                undo below is a few seconds long, and a student who looks away
                has lost the months of schedule on the card just as surely as
                before. */}
            <button className="btn btn--danger" onClick={onDelete}>
              Confirm deletion
            </button>
          </div>
          {/* Said plainly rather than reassuringly. The undo is real but it is
              brief, and copy that leaned on it would turn a two-step
              confirmation into a formality. */}
          <p className="field__hint">
            The card and its review history go. There is a moment to undo it
            afterwards, and then it is gone.
          </p>
        </>
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

/**
 * One sentence on a card: read it, move it, correct it, or throw it away.
 *
 * Everything here commits on the press, unlike the citation and meaning above
 * it — moving a row and then having to find a Save button would be a reorder
 * you could lose by closing the sheet. The section says so rather than leaving
 * the two halves of one sheet to be told apart by trying them.
 *
 * Reordering is a pair of buttons and not a drag. There is no drag anywhere in
 * this app, a new one would be a 500 ms press away from the hold gesture that
 * put these sentences here, and buttons are the only version of this that works
 * with a thumb on a moving bus or with a screen reader.
 */
function ContextRow({
  context,
  first,
  last,
  onMove,
  onEdit,
  onDelete,
}: {
  context: VocabContext;
  /** Whether the row is at an end, so its button can say so by being off. */
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: (patch: { prompt: string; sentence: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(context.prompt);
  const [sentence, setSentence] = useState(context.sentence);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const complete = prompt.trim() !== "" && sentence.trim() !== "";

  if (editing) {
    return (
      <div className="context context--editing">
        <label className="field">
          <span className="field__label">The question</span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="The question"
          />
        </label>
        <label className="field">
          <span className="field__label">The sentence</span>
          <input
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="The sentence"
          />
        </label>
        <div className="actions">
          <button
            className="btn"
            onClick={() => {
              setPrompt(context.prompt);
              setSentence(context.sentence);
              setEditing(false);
            }}
          >
            Cancel
          </button>
          {/* Named for what it saves. The card's own Save sits a few lines up
              this same sheet, and two buttons reading "Save" is a coin toss
              for anyone who cannot see which one they are on. */}
          <button
            className="btn btn--primary"
            disabled={!complete}
            onClick={() => {
              onEdit({ prompt, sentence });
              setEditing(false);
            }}
          >
            Save sentence
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="context">
      <div className="context__source">
        {/* Never dropped for tidiness: a sentence the student wrote may be
            wrong, and a card that drew it as the reference would be teaching
            the mistake back to the person who made it. */}
        {context.source === "answer" ? "Reference" : "You wrote"}
      </div>
      <div className="context__prompt">{context.prompt}</div>
      <div className="context__sentence">
        <Sentence
          text={context.sentence}
          marks={context.index === undefined ? undefined : { [context.index]: 1 }}
        />
      </div>
      {confirmDelete ? (
        <div className="actions">
          <button className="btn" onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
          <button className="btn btn--danger" onClick={onDelete}>
            Confirm deletion
          </button>
        </div>
      ) : (
        <div className="context__tools">
          {/* Named rather than left as glyphs: four unlabelled arrows repeated
              down a list is a screen reader reading "button button button". */}
          <button
            className="iconbtn"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label={`Move “${context.sentence}” up`}
          >
            ▲
          </button>
          <button
            className="iconbtn"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={`Move “${context.sentence}” down`}
          >
            ▼
          </button>
          <button
            className="iconbtn"
            onClick={() => setEditing(true)}
            aria-label={`Edit “${context.sentence}”`}
          >
            ✎
          </button>
          <button
            className="iconbtn"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete “${context.sentence}”`}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
