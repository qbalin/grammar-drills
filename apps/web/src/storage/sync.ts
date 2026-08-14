import {
  GitHubStorage,
  PUSH_DELAY_MS,
  describeSyncError,
  type Progress,
  type StorageAdapter,
  type SyncState,
} from "@lang-tutor/core";
import { LocalStorageAdapter } from "./local.js";
import { profile } from "../pack.js";

export type { SyncState };

// Namespaced by the pack, like the progress key: each language keeps its own
// repo settings even when they share an origin.
const CONFIG_KEY = profile.storage.webSyncKey;

/**
 * When this device last agreed with GitHub — the `updatedAt` of the copy it
 * pushed or took, whichever came last.
 *
 * Derived from the config key rather than declared in the profile, because it
 * is a fact about this browser and not part of a pack's contract. It must never
 * travel inside `Progress`: a marker that synced along with the progress would
 * describe whichever device wrote it last, which is precisely the device we are
 * trying to tell ourselves apart from.
 */
const SYNCED_KEY = `${CONFIG_KEY}:synced`;

/**
 * What the startup check found, once it has resolved everything it can resolve
 * on its own.
 *
 * The three answers are genuinely different errands and only one of them is a
 * question for a person. "Your phone is ahead of your laptop" is ordinary and
 * gets on with it; two devices that have both been studied since they last
 * agreed is a choice nobody else can make.
 */
export type StartupCheck =
  | { kind: "current" }
  | { kind: "adopt"; remote: Progress }
  | { kind: "diverged"; remote: Progress };

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

function readSyncedAt(): string | null {
  try {
    return localStorage.getItem(SYNCED_KEY);
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

  /** What this device last pushed or took. See `SYNCED_KEY`. */
  private syncedAt: string | null = readSyncedAt();

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
    // A phone does not "close" a tab so much as leave it. This is the last
    // reliable moment to get the session off the device.
    addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flush();
    });
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
    return this.syncedAt !== local.updatedAt;
  }

  private markSynced(progress: Progress): void {
    this.syncedAt = progress.updatedAt;
    try {
      localStorage.setItem(SYNCED_KEY, progress.updatedAt);
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
   * Being offline settles it too. The local copy is what study runs against
   * either way, and `GitHubStorage` refuses the stale write on its own if the
   * network comes back mid-session.
   */
  async checkRemote(): Promise<StartupCheck> {
    try {
      const remote = await this.fetchRemote();
      // Against `bootAt`, not the session: see the field. A device with no copy
      // at all takes whatever is there, which is how a second device starts.
      if (!remote) return { kind: "current" };
      if (this.bootAt && !(remote.updatedAt > this.bootAt)) return { kind: "current" };
      // Ahead of us, and we have nothing of our own to lose: take it. This is
      // the ordinary case — a phone on the sofa, a laptop the next morning —
      // and asking about it teaches people to dismiss the question that counts.
      return this.bootAt !== null && this.syncedAt !== this.bootAt
        ? { kind: "diverged", remote }
        : { kind: "adopt", remote };
    } catch {
      return { kind: "current" };
    } finally {
      this.releaseGate();
    }
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
    if (opts.synced) this.markSynced(progress);
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
    try {
      await this.remote.save(progress, opts);
      // Only clear the queue if nothing newer arrived while we were pushing.
      if (this.queued === progress) this.queued = null;
      this.markSynced(progress);
      this.setState({ kind: "idle", at: new Date().toISOString() });
    } catch (err) {
      // A refused push is not a failed one. What is queued stays queued, so
      // resolving the conflict in Settings still has this device's work to
      // offer, and `describeSyncError` reports it as `behind` rather than as
      // something the student did wrong.
      this.setState(this.describeError(err));
    } finally {
      this.inFlight = false;
    }
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
