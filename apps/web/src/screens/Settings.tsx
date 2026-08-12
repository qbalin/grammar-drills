import { useState } from "react";
import { Sheet } from "../ui.js";
import { dictionarySize, offlineSize } from "../dictionary-size.js";
import { profile } from "../pack.js";
import { formatBytes, type StorageReport } from "../storage/quota.js";
import type { SyncConfig, SyncState } from "../storage/sync.js";

function stateLine(state: SyncState): string {
  switch (state.kind) {
    case "off":
      return "Off — progress is kept on this device only.";
    case "pushing":
      return "Saving to GitHub…";
    case "offline":
      return "Offline — changes will go up when you reconnect.";
    // Held rather than failed: this device's work is safe where it is, and
    // pulling would be the thing that lost it. Both buttons are on this sheet.
    case "behind":
      return "Another device is ahead. Pull its copy, or push this one.";
    case "error":
      return state.message;
    case "idle":
      return state.at
        ? `Saved to GitHub at ${new Date(state.at).toLocaleTimeString()}.`
        : "Connected.";
  }
}

/**
 * Everything that is not studying: where progress goes, and whether the
 * dictionary is available on a plane.
 */
export function SettingsSheet({
  config,
  state,
  onConfigure,
  onExport,
  onImport,
  onPull,
  dictionaryReady,
  dictionaryFailed,
  onCacheDictionary,
  caching,
  space,
  onPersist,
  vocabCount,
  onOpenVocab,
  keepContext,
  onKeepContext,
  quotedOnly,
  onQuotedOnly,
  quotedFirst,
  onQuotedFirst,
  onReset,
  onClose,
}: {
  config: SyncConfig | null;
  state: SyncState;
  onConfigure: (cfg: SyncConfig | null) => void;
  onExport: () => void;
  onImport: () => void;
  onPull: () => void;
  dictionaryReady: boolean;
  /** A download this device tried and could not finish. */
  dictionaryFailed: boolean;
  onCacheDictionary: () => void;
  caching: boolean;
  /** What the browser will say about the space this app holds, if asked. */
  space: StorageReport;
  onPersist: () => void;
  vocabCount: number;
  onOpenVocab: () => void;
  /** Whether a recorded word keeps the sentence it was met in. */
  keepContext: boolean;
  onKeepContext: () => void;
  quotedOnly: boolean;
  onQuotedOnly: () => void;
  /** Whether a topic's quoted questions all come before its written ones. */
  quotedFirst: boolean;
  onQuotedFirst: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SyncConfig>(
    config ?? {
      token: "",
      owner: "",
      repo: "",
      path: profile.storage.githubPath,
      branch: "main",
    },
  );
  const [confirmReset, setConfirmReset] = useState(false);

  const set = (k: keyof SyncConfig) => (e: { target: { value: string } }) =>
    setDraft({ ...draft, [k]: e.target.value });

  const complete = draft.token && draft.owner && draft.repo;

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="section-title">Vocabulary</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {vocabCount === 0
          ? "No words recorded yet. Hold a word in an answer to save it."
          : "Every word you have recorded, with its citation and meaning both editable."}
      </p>
      <div className="actions">
        <button className="btn" onClick={onOpenVocab} disabled={vocabCount === 0}>
          {vocabCount} {vocabCount === 1 ? "word" : "words"}
        </button>
      </div>

      {/* A checkbox rather than a pressed button. `aria-pressed` is this app's
          way of saying *you are in this mode now* — what the marking button
          means — and this is a standing preference with an on and an off, which
          is the control a checkbox is. */}
      <label className="field field--check">
        <input
          type="checkbox"
          checked={keepContext}
          onChange={onKeepContext}
        />
        <span className="field__label">Keep the sentence a word was met in</span>
      </label>
      <p className="field__hint">
        Holding a word saves the question you were on with it, and the card shows
        it on the back — the line you met the word in is usually the reason it
        stuck. Turning this off stops new ones; the sentences already saved stay
        where they are.
      </p>

      <label className="field field--check">
        <input type="checkbox" checked={quotedOnly} onChange={onQuotedOnly} />
        <span className="field__label">Explore only quoted sentences</span>
      </label>
      <p className="field__hint">
        Most questions here were written for this app; some quote a classical
        author, and those say who beneath the answer. Turning this on keeps
        exploring — the walk through the book, and practice on a topic — to the
        quoted ones. Reviews are unaffected: a card that comes due comes back on
        the question that built it. Topics with nothing quoted are stepped over
        rather than marked learned, so they are still waiting if you turn this
        off again — and the grammar index and the question lists count the
        quoted questions alone while this is on, which is how the topics that
        have some are found.
      </p>

      {/* Disabled under the preference above rather than hidden: with only
          quoted sentences being served there is no second half to put second,
          so the choice is real but has nothing to decide. Hiding it would make
          the setting look like it had gone away. */}
      <label className="field field--check">
        <input
          type="checkbox"
          checked={quotedFirst}
          onChange={onQuotedFirst}
          disabled={quotedOnly}
        />
        <span className="field__label">Quoted sentences first</span>
      </label>
      <p className="field__hint">
        {quotedOnly
          ? "Nothing but quoted sentences is being served, so there is no order to choose. Turn the setting above off to use this one."
          : "Every quotation on a topic before any of the questions written for this app, then both shuffled and round again — the quoted ones are the scarce half, and a topic can otherwise be studied for a week without meeting one. Turning this off shuffles the whole topic together. Nothing is withheld either way."}
      </p>

      <div className="section-title">Your progress</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        Everything is stored on this device. Export a copy to move to another
        phone, or set up GitHub below to keep two devices together.
      </p>
      <div className="actions">
        <button className="btn" onClick={onExport}>
          Export
        </button>
        <button className="btn" onClick={onImport}>
          Import
        </button>
      </div>

      <div className="section-title">Offline</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {dictionaryReady
          ? `Everything is on this device — the grammar, every test, and the
             dictionary that turns a word you met into its headword. About
             ${offlineSize()} came down the wire, and nothing here needs a
             connection now.`
          : caching
            ? `Fetching the dictionary — ${dictionarySize()}, once. It happens by
               itself when the app opens, so you need not wait on this screen.`
            : `The grammar and every test are on this device. The dictionary is
               another ${dictionarySize()} and is fetched at launch; this device
               has not managed it yet.`}
      </p>
      {/* Only when there is something to do. The download is no longer
          something a student has to think of — the button is here for the one
          that failed, and a green tick beside a thing nobody asked for is just
          another control to read past. */}
      {!dictionaryReady && (
        <div className="actions">
          <button className="btn" onClick={onCacheDictionary} disabled={caching}>
            {caching
              ? "Downloading…"
              : dictionaryFailed
                ? "Try the download again"
                : "Download it now"}
          </button>
        </div>
      )}

      <div className="section-title">Space on this device</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {space.usage
          ? `${formatBytes(space.usage.usage)} in use, out of the
             ${formatBytes(space.usage.quota)} this browser allows the app.`
          : "This browser will not say how much room the app is using."}
      </p>
      {space.persisted ? (
        <p className="field__hint">
          It is kept: this browser has promised not to clear it to make room.
          Clearing the site’s data yourself still does.
        </p>
      ) : (
        <>
          <p className="field__hint">
            Nothing is promised. A browser short of room may clear all of it —
            and that is the lessons too, not only the dictionary, so the app
            would not open at all until it next had a connection.
          </p>
          <div className="actions">
            <button className="btn" onClick={onPersist}>
              Ask to keep it
            </button>
          </div>
        </>
      )}

      <div className="section-title">Sync with GitHub (optional)</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {stateLine(state)}
      </p>

      <label className="field">
        <span className="field__label">Repository owner</span>
        <input
          value={draft.owner}
          onChange={set("owner")}
          placeholder="your-username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span className="field__label">Repository name</span>
        <input
          value={draft.repo}
          onChange={set("repo")}
          placeholder={profile.storage.githubPath.replace(/\.json$/, "")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span className="field__label">Access token</span>
        <input
          type="password"
          value={draft.token}
          onChange={set("token")}
          placeholder="github_pat_…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <span className="field__hint">
          A fine-grained token with read and write access to Contents on that one
          repository. It is stored on this device and sent only to github.com —
          there is no server in between.
        </span>
      </label>
      <label className="field">
        <span className="field__label">File</span>
        <input
          value={draft.path}
          onChange={set("path")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      <div className="actions">
        {config && (
          <button
            className="btn"
            onClick={() => {
              onConfigure(null);
              setDraft({ ...draft, token: "" });
            }}
          >
            Turn off
          </button>
        )}
        <button
          className="btn btn--primary"
          disabled={!complete}
          onClick={() => onConfigure(draft)}
        >
          {config ? "Update" : "Connect"}
        </button>
      </div>
      {config && (
        <div className="actions">
          <button className="btn btn--quiet" onClick={onPull}>
            Pull the copy from GitHub
          </button>
        </div>
      )}

      <div className="section-title">Start over</div>
      {confirmReset ? (
        // The second tap is the irreversible one, so it says what it does and
        // wears the colour for it — and it is no longer the same button in the
        // same place, which is what made a double tap able to land on it.
        <>
          <div className="actions">
            <button className="btn" onClick={() => setConfirmReset(false)}>
              Keep it
            </button>
            <button className="btn btn--danger" onClick={onReset}>
              Confirm erasure
            </button>
          </div>
          <p className="field__hint">
            Every grade, schedule and recorded word on this device goes. If it
            has never been exported or synced, it cannot be got back.
          </p>
        </>
      ) : (
        <div className="actions">
          <button className="btn btn--quiet" onClick={() => setConfirmReset(true)}>
            Erase progress on this device
          </button>
        </div>
      )}
    </Sheet>
  );
}
