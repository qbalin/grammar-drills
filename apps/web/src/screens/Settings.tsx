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
 * The pack's further books, named, for the lines that say what is on the device.
 *
 * Named rather than counted: a student who reads Lane wants to be told Lane is
 * here, and "and one other book" is a sentence they can do nothing with. Empty
 * for a pack that teaches out of one book, which is most of them — so every
 * sentence below has to read as well without this as with it.
 */
function bookList(): string {
  return (profile.grammars ?? []).map((g) => g.label).join(" and ");
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
  offlineReady,
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
  /** Every file the launch fetches, in hand — not the dictionary alone. */
  offlineReady: boolean;
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
  const books = bookList();
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
        When saving a Latin word for study by doing a long press on it, also
        attach the sentence in which the word was met when reviewing the newly
        created vocabulary card.
      </p>

      <label className="field field--check">
        <input type="checkbox" checked={quotedOnly} onChange={onQuotedOnly} />
        <span className="field__label">
          Only show attested classical quotes in <em>Explore</em> mode
        </span>
      </label>
      <p className="field__hint">
        Tests questions and answers are AI generated as well as sourced from
        ancient authors. Tick this box if you only want to see attested classical
        quotes. Benefit: the latin is pure and attested. Drawback: some topics
        may be very thin or lack questions altogether.
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
        <span className="field__label">Serve attested classical quotes first</span>
      </label>
      <p className="field__hint">
        {quotedOnly
          ? "Nothing but attested classical quotes is being served, so there is no order to choose. Turn the setting above off to use this one."
          : "When ticked, first serve attested classical quotes, and then the AI generated ones, and repeat in a loop when all questions have been seen. When unticked, serve AI generated questions and attested classical quotes in random order."}
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
        {offlineReady
          ? `Everything is on this device — the grammar${
              books ? `, ${books} beside it` : ""
            }, every test, the tables, and the dictionary that turns a word you
             met into its headword. About ${offlineSize()} came down the wire,
             and nothing here needs a connection now.`
          : caching
            ? `Fetching the dictionary — ${dictionarySize()}, once — and the
               tables${books ? ` and ${books}` : ""} behind it. It happens by
               itself when the app opens, so you need not wait on this screen.`
            : `The grammar and every test are on this device. The dictionary is
               another ${dictionarySize()}, and the tables${
                 books ? ` and ${books}` : ""
               } come after it; all of it is fetched at launch, and this device
               has not managed it yet.`}
      </p>
      {/* Only when there is something to do. The download is no longer
          something a student has to think of — the button is here for the one
          that failed, and a green tick beside a thing nobody asked for is just
          another control to read past. */}
      {!offlineReady && (
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
        {/* Not "out of the X this browser allows the app", which it used to
            say and which a student would read as a shelf set aside for this
            app. It is nothing of the kind: browsers work the ceiling out from
            the free space on the whole device and every site draws on it, so
            the figure moves with what else is stored and is usually large
            enough to be meaningless. Reported because a small one is worth
            seeing, phrased so a big one is not mistaken for an allowance. */}
        {space.usage
          ? `${formatBytes(space.usage.usage)} in use. The browser puts its
             ceiling at ${formatBytes(space.usage.quota)} — a figure for the
             device as a whole, shared with every other site.`
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
