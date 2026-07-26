import { useEffect, useRef, useState } from "react";
import type { LemmaEntry } from "@latin-tutor/core";
import { Sheet, Spinner } from "../ui.js";

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
  onLookup,
  onClose,
}: {
  /** Whether the dictionary is here yet, and if not, why. */
  status: "ready" | "loading" | "unavailable";
  /** Resolve the form; the parent owns the candidate list and the saving. */
  onLookup: (form: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "ready") input.current?.focus();
  }, [status]);

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
