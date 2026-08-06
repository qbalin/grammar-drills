import { useState } from "react";
import { Sheet } from "../ui.js";
import { dictionarySize } from "../dictionary-size.js";
import { profile } from "../pack.js";
import type { SyncConfig, SyncState } from "../storage/sync.js";

function stateLine(state: SyncState): string {
  switch (state.kind) {
    case "off":
      return "Off — progress is kept on this device only.";
    case "pushing":
      return "Saving to GitHub…";
    case "offline":
      return "Offline — changes will go up when you reconnect.";
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
  onCacheDictionary,
  caching,
  vocabCount,
  onOpenVocab,
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
  onCacheDictionary: () => void;
  caching: boolean;
  vocabCount: number;
  onOpenVocab: () => void;
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
        The grammar and every test are already stored on this device. The
        dictionary, which turns a word you met into its headword, is another{" "}
        {dictionarySize()} and is only fetched when you first record a word.
      </p>
      <div className="actions">
        <button
          className="btn"
          onClick={onCacheDictionary}
          disabled={dictionaryReady || caching}
        >
          {dictionaryReady
            ? "Dictionary saved ✓"
            : caching
              ? "Downloading…"
              : "Save dictionary for offline"}
        </button>
      </div>

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
