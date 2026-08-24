import {
  GitHubStorage,
  PUSH_DELAY_MS,
  RemoteMovedError,
  describeSyncError,
  hasUnsent,
  readSyncedAt,
  triage,
  type Progress,
  type StartupCheck,
  type StorageAdapter,
  type SyncedAt,
  type SyncState,
} from "@lang-tutor/core";
import { LocalStorageAdapter } from "./local.js";
import { profile } from "../pack.js";

export type { StartupCheck, SyncState };

// Namespaced by the pack, like the progress key: each language keeps its own
// repo settings even when they share an origin.
const CONFIG_KEY = profile.storage.webSyncKey;

/**
 * When this device last agreed with GitHub. See `SyncedAt` in core, which is
 * what it holds and why it is two values rather than one.
 *
 * Derived from the config key rather than declared in the profile, because it
 * is a fact about this browser and not part of a pack's contract.
 */
const SYNCED_KEY = `${CONFIG_KEY}:synced`;

export interface SyncConfig {
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as Partial<SyncConfig>;
    if (!cfg.token || !cfg.owner || !cfg.repo) return null;
    return {
      token: cfg.token,
      owner: cfg.owner,
      repo: cfg.repo,
      path: cfg.path || profile.storage.githubPath,
      branch: cfg.branch || "main",
    };
  } catch {
    return null;
  }
}

export function saveSyncConfig(cfg: SyncConfig | null): void {
  try {
    if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* storage blocked; sync simply stays off */
  }
}

function storedMarker(): SyncedAt | null {
  try {
    return readSyncedAt(localStorage.getItem(SYNCED_KEY));
  } catch {
    return null;
  }
}

/**
 * Local-first progress storage with an optional GitHub mirror.
 *
 * The device's copy is the one being studied against, and it is written
 * synchronously on every grade. The remote is a mirror, pushed on a delay so a
 * four-question test becomes one commit rather than four, and flushed early
 * when the tab is hidden — on a phone that is the usual way a session ends.
 *
 * A push that fails never surfaces as an interruption. Study continues against
 * the local copy and the attempt is retried on the next save or when the device
 * comes back online; Settings is where the state is reported.
 *
 * Nothing is pushed before the app has looked at what GitHub holds. The first
 * grade of a session used to be able to beat the startup check — four seconds
 * is a long time in a debounce and no time at all in a person — and the copy it
 * committed was the stale one the check was on its way to replace. So the push
 * waits on a gate that only `checkRemote` opens.
 *
 * The gate is an ordering, though, not the guarantee. It cannot be: the check
 * runs once and a session runs for an hour, so a device that pushes at 09:10
 * has to answer for a remote that moved at 09:05, and there is no gate for
 * that. The guarantee is `GitHubStorage`'s refusal, which asks whether the
 * remote holds a copy this device has seen — `lastSeen`, below, is that
 * question's other half, and every push carries it.
 */
export class SyncingStorage implements StorageAdapter {
  private readonly local = new LocalStorageAdapter();
  private remote: GitHubStorage | null = null;
  private config: SyncConfig | null = null;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private queued: Progress | null = null;
  private inFlight = false;
  private sealed = false;
  private state: SyncState = { kind: "off" };
  private readonly listeners = new Set<(s: SyncState) => void>();

  /** Told once, when the device's own copy stops being written. See `writeLocal`. */
  private readonly failureListeners = new Set<() => void>();
  private announcedFailure = false;

  /**
   * Told when a push was refused because GitHub holds work this device has
   * never seen — the mid-session half of the startup check's `diverged`.
   *
   * It carries the remote copy, which `RemoteMovedError` went to the trouble of
   * bringing back for exactly this. Without a listener the refusal is a line of
   * text in Settings, which is to say invisible: the one moment the app has
   * something to ask about was the one moment it did not ask.
   */
  private readonly behindListeners = new Set<(remote: Progress) => void>();

  /** What this device last pushed or took. See `SYNCED_KEY`. */
  private marker: SyncedAt | null = storedMarker();

  /**
   * The copy that was on this device when the tab opened.
   *
   * The startup check has to compare against this rather than against the
   * session, because by the time the check resolves the app has already served
   * a test and written the round down — `updatedAt` has moved for reasons that
   * are not work anybody did. Compared against the live copy, every ordinary
   * morning looks like a device with unpushed changes, and the question that
   * should be rare would be the one asked every time.
   */
  private readonly bootAt: string | null = this.local.read()?.updatedAt ?? null;

  /**
   * Resolves when the startup check has been made, or immediately when there is
   * nothing to check. `flush` waits on it, so a session's first grades queue up
   * behind the answer instead of racing it.
   */
  private gate: Promise<void> = Promise.resolve();
  private openGate: (() => void) | null = null;

  constructor() {
    this.configure(loadSyncConfig());
    // Sync was already configured when this tab opened, so a check is coming
    // and the first push waits for it. Connecting later opens the gate instead:
    // there is nothing to wait for when a person has just named the repo.
    if (this.remote) this.shutGate();
    addEventListener("online", () => void this.flush());
    // A phone does not "close" a tab so much as leave it. These are the last
    // reliable moments to get the session off the device, and both are needed:
    // a tab discarded outright gets `pagehide` without ever going hidden, and
    // the draft keeper has listened to both all along.
    addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flush();
    });
    addEventListener("pagehide", () => void this.flush());
  }

  private shutGate(): void {
    this.gate = new Promise((resolve) => (this.openGate = resolve));
  }

  private releaseGate(): void {
    this.openGate?.();
    this.openGate = null;
  }

  /** True while this device holds a grade GitHub has not been told about. */
  hasUnpushed(local: Progress): boolean {
    return hasUnsent(this.marker, local.updatedAt);
  }

  /**
   * Record an agreement: this local copy is up there, and that is what is up
   * there.
   *
   * `remoteAt` is told rather than assumed, because a commit that sent nothing
   * — the content already matched, clock aside — leaves the remote's own stamp
   * in place. Assuming the two were equal is what would make the next launch
   * believe another device had been at it.
   */
  private markSynced(pushedAt: string, remoteAt: string): void {
    this.marker = { pushedAt, remoteAt };
    try {
      localStorage.setItem(SYNCED_KEY, JSON.stringify(this.marker));
    } catch {
      /* storage blocked; the marker is an optimisation, not a correctness bet */
    }
  }

  /**
   * Look at what GitHub holds and settle it if it can be settled.
   *
   * Called once at startup, and the only thing that opens the push gate — the
   * app must call it, or nothing is ever pushed. That is the safe way round:
   * a mirror that stops is a nuisance, and a mirror that overwrites is a week
   * of somebody's evenings.
   *
   * Being offline settles it too, and so does a fetch that fails for any other
   * reason. The local copy is what study runs against either way, and the push
   * that follows carries `lastSeen`, so a remote holding another device's work
   * is refused on its own terms rather than on this check having answered.
   *
   * The gate is opened by the answer, not by the attempt, and only where the
   * answer is this class's to give. `adopt` and `diverged` both leave it shut:
   * releasing it here would resolve a `flush` already waiting on it, and that
   * continuation runs before the caller's `.then` can adopt and seal — so on a
   * check slower than the debounce the stale push would start first and land.
   * The caller opens it, by adopting (which seals), by answering the question,
   * or by `resolveCheck` when the question is dismissed.
   */
  async checkRemote(): Promise<StartupCheck> {
    let found: StartupCheck;
    try {
      // Against `bootAt`, not the session: see the field.
      found = triage(this.bootAt, await this.fetchRemote(), this.marker);
    } catch {
      found = { kind: "current" };
    }
    if (found.kind === "current") this.releaseGate();
    return found;
  }

  /**
   * Let pushes go again after a startup question was put down unanswered.
   *
   * Nothing is decided by it. What was queued is still queued and still carries
   * `lastSeen`, so it is refused again and asks again — which is the right way
   * round for a sheet somebody swiped away while thinking about it.
   */
  resolveCheck(): void {
    this.releaseGate();
  }

  /** Point sync at a repo, or turn it off with `null`. */
  configure(config: SyncConfig | null): void {
    this.config = config;
    // The commit subject names the language rather than being stored with the
    // credentials: it is a fact about this build, not about the user's repo.
    this.remote = config
      ? new GitHubStorage({ ...config, message: `Update ${profile.l2.name} progress` })
      : null;
    saveSyncConfig(config);
    // A repo just named by hand has nothing pending to wait for, and turning
    // sync off must not leave a queued push parked behind a gate forever.
    this.releaseGate();
    this.setState(config ? { kind: "idle" } : { kind: "off" });
  }

  currentConfig(): SyncConfig | null {
    return this.config;
  }

  describe(): string {
    return this.config
      ? `${this.config.owner}/${this.config.repo}`
      : this.local.describe();
  }

  async load(): Promise<Progress | null> {
    return this.local.load();
  }

  /** The local copy, read synchronously — what startup and export both want. */
  read(): Progress | null {
    return this.local.read();
  }

  /**
   * What the remote holds, or null if there is none (or sync is off). Used at
   * startup to notice that another device has newer progress, and by Settings
   * to pull on demand.
   */
  async fetchRemote(): Promise<Progress | null> {
    if (!this.remote) return null;
    try {
      const { progress } = await this.remote.loadMeta();
      this.setState({ kind: "idle", at: new Date().toISOString() });
      return progress;
    } catch (err) {
      this.setState(this.describeError(err));
      throw err;
    }
  }

  async save(progress: Progress): Promise<void> {
    if (this.sealed) return;
    this.writeLocal(progress);
    if (!this.remote) return;
    this.queued = progress;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), PUSH_DELAY_MS);
  }

  /**
   * Write the device's copy only, leaving the mirror alone.
   *
   * For what changes as fast as it is typed — the answer in flight. That is
   * worth having on this device the instant the app is taken away, and worth
   * nothing to another one, so it must not become a commit per keystroke.
   */
  saveLocal(progress: Progress): void {
    if (this.sealed) return;
    this.writeLocal(progress);
  }

  /**
   * Write the local copy and push it now, without waiting for the debounce.
   *
   * `force` is a person saying "make GitHub match this device" — the Update
   * button, and keeping this device's copy in the face of a newer one. It is
   * the only way past the refusal in `GitHubStorage`, and it should stay that
   * way: everything automatic has a local copy it can fall back on, and a
   * person choosing has been shown what they are choosing between.
   */
  async saveNow(progress: Progress, opts: { force?: boolean } = {}): Promise<void> {
    if (this.sealed) return;
    this.writeLocal(progress);
    this.queued = progress;
    clearTimeout(this.timer);
    // A person has said which copy wins, so the startup question is answered
    // and the gate has nothing left to hold back. Without this the forced push
    // would land and every ordinary one after it would wait on a check that has
    // already been settled by hand.
    if (opts.force) this.releaseGate();
    await this.flush(opts);
  }

  /**
   * Replace the local copy outright — resolving a conflict, pulling, importing.
   *
   * `synced` says whether the copy came from GitHub, and it must be told rather
   * than guessed: adopting a pulled copy means this device now agrees with the
   * remote, while adopting an imported file means it very much does not, and
   * marking the second one synced would let the next session push it over
   * whatever the file was older than.
   */
  adopt(progress: Progress, opts: { synced?: boolean } = {}): void {
    this.writeLocal(progress);
    // Both sides of the marker, and the same value on each: this copy is the
    // device's now, and it is what the remote holds.
    if (opts.synced) this.markSynced(progress.updatedAt, progress.updatedAt);
  }

  clearLocal(): void {
    this.local.clear();
  }

  /**
   * Stop writing the device's copy, for good.
   *
   * Erasing progress and adopting another device's both end in a reload, and
   * `location.reload()` does not take the page away on the spot: the unload it
   * schedules fires `visibilitychange` and `pagehide` first, and the draft the
   * app keeps on those writes the in-memory session straight back over what was
   * just erased or replaced. The erase then survives exactly until the reload
   * that was supposed to complete it. Sealing after the intended write is what
   * makes it stick.
   *
   * The queued push goes with it: what is on its way up is the progress being
   * discarded, and landing it on GitHub would hand it back on the next pull.
   */
  seal(): void {
    this.sealed = true;
    clearTimeout(this.timer);
    this.queued = null;
    // Nothing more will be pushed, so nothing should be left waiting on a gate
    // whose opener may never be called.
    this.releaseGate();
  }

  /** Push whatever is queued. Safe to call at any time. */
  async flush(opts: { force?: boolean } = {}): Promise<void> {
    if (this.sealed) return;
    if (!this.remote || !this.queued || this.inFlight) return;
    if (!navigator.onLine) {
      this.setState({ kind: "offline" });
      return;
    }
    // The startup check, if one is still out. A forced push is a person acting
    // on what they have already been shown, so it does not queue behind it.
    if (!opts.force) await this.gate;
    if (this.sealed || !this.remote || !this.queued || this.inFlight) return;
    const progress = this.queued;
    this.inFlight = true;
    this.setState({ kind: "pushing" });
    let landed = false;
    try {
      // `lastSeen` is what makes the refusal work at all: it says which copy
      // this device thinks is up there, so anything else is somebody's work
      // arriving from another device. A forced push is a person overruling
      // that, and passes it anyway so the two paths differ in one word.
      const { remoteAt } = await this.remote.commit(progress, {
        ...opts,
        lastSeen: this.marker?.remoteAt,
      });
      landed = true;
      // Only clear the queue if nothing newer arrived while we were pushing.
      if (this.queued === progress) this.queued = null;
      this.markSynced(progress.updatedAt, remoteAt);
      this.setState({ kind: "idle", at: new Date().toISOString() });
    } catch (err) {
      // A refused push is not a failed one. What is queued stays queued, so
      // resolving the conflict still has this device's work to offer, and
      // `describeSyncError` reports it as `behind` rather than as something the
      // student did wrong.
      this.setState(this.describeError(err));
      if (err instanceof RemoteMovedError && err.remote) {
        for (const listener of this.behindListeners) listener(err.remote);
      }
    } finally {
      this.inFlight = false;
    }
    // Something arrived while that was in the air. `flush` turns away anything
    // that finds a push in flight, and used to leave it there: a grade given
    // during a push, followed by the app being taken away, was queued and then
    // never sent by anybody. Retried only after a push that landed — a refusal
    // would refuse again, and this would spin.
    //
    // Without `force`, whatever the push that landed carried. A person saying
    // "keep this device" answered for the copy they were shown; a grade that
    // arrived afterwards is not covered by it, and if the remote really has
    // moved underneath, being asked again is the right outcome.
    if (landed && this.queued && !this.sealed) await this.flush();
  }

  /** The shared mapping, told what only the browser knows. */
  private describeError(err: unknown): SyncState {
    return describeSyncError(err, navigator.onLine);
  }

  private setState(s: SyncState): void {
    this.state = s;
    for (const listener of this.listeners) listener(s);
  }

  currentState(): SyncState {
    return this.state;
  }

  /** Watch the sync state. Returns an unsubscribe, for `useEffect`. */
  onStateChange(listener: (s: SyncState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Watch for a push refused because GitHub is ahead. Returns an unsubscribe.
   *
   * Kept apart from `onStateChange`, which reports where the mirror stands: a
   * status line can say "another device is ahead" all afternoon without anybody
   * reading it, and this is the same fact as something to answer. The copy it
   * carries is the one the refusal was for, so the caller can show what it is
   * choosing between without fetching the file again.
   */
  onBehind(listener: (remote: Progress) => void): () => void {
    this.behindListeners.add(listener);
    return () => {
      this.behindListeners.delete(listener);
    };
  }

  /**
   * Watch for the device's copy failing to write. Returns an unsubscribe.
   *
   * Kept apart from `onStateChange`, which is about the *mirror*: a device with
   * no room is not a sync problem, it is the problem sync was supposed to be a
   * backup against, and most students have no mirror configured at all.
   *
   * Fires **once**. The condition does not clear on its own and every save
   * afterwards would raise it again, which on a full device is a toast per
   * grade — the app shouting where it needs to be heard once.
   */
  onLocalFailure(listener: () => void): () => void {
    this.failureListeners.add(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }

  /** The file a read had to give up on, if there is one. See `local.ts`. */
  salvaged(): string | null {
    return this.local.salvaged();
  }

  dropSalvaged(): void {
    this.local.dropSalvaged();
  }

  /**
   * Write the device's copy, and say so the first time one does not land.
   *
   * Every local write in this class goes through here rather than calling the
   * adapter directly, so there is one place that can notice — and so a route
   * added later cannot quietly become the silent one again.
   */
  private writeLocal(progress: Progress): void {
    if (this.local.write(progress)) return;
    if (this.announcedFailure) return;
    this.announcedFailure = true;
    for (const listener of this.failureListeners) listener();
  }
}
