/**
 * The terminal's local-first store with a GitHub mirror.
 *
 * The shape is the web app's, and deliberately so: the file on disk is what is
 * being studied against and is written on every grade, while the remote is a
 * mirror pushed on a delay so a four-question test becomes one commit rather
 * than four. A push that fails never interrupts study — the local copy is
 * already written, and the failure is reported in the status line.
 *
 * Where it differs is how a session ends. A browser tab goes hidden and the web
 * app flushes on `visibilitychange`; a terminal is closed with Ctrl-C, so the
 * flush is hung on the signal handlers in `index.tsx`. Without that, the last
 * few grades of every session would sit in the debounce and never leave.
 */
import {
  GitHubStorage,
  PUSH_DELAY_MS,
  describeSyncError,
  type Progress,
  type StorageAdapter,
  type SyncState,
} from "@lang-tutor/core";
import type { LocalFileStorage } from "./storage-local.js";
import { writeSyncedAt, type CliSyncConfig } from "./sync-config.js";

/** What the startup check found. The web app's `StartupCheck`, in a terminal. */
export type StartupCheck =
  | { kind: "current" }
  | { kind: "adopt"; remote: Progress }
  | { kind: "diverged"; remote: Progress };

/**
 * When this machine last agreed with GitHub, and where that is written down.
 * Absent in the tests and wherever there is nowhere to keep it, which costs a
 * question rather than any correctness.
 */
export interface SyncedMarker {
  path: string;
  at: string | null;
}

export class SyncingFileStorage implements StorageAdapter {
  private readonly remote: GitHubStorage;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queued: Progress | null = null;
  private inFlight = false;
  private state: SyncState = { kind: "idle" };
  private readonly listeners = new Set<(s: SyncState) => void>();
  private syncedAt: string | null;

  constructor(
    private readonly local: LocalFileStorage,
    private readonly config: CliSyncConfig,
    /** Named in the commit subject; a fact about the build, not the user. */
    message: string,
    private readonly marker?: SyncedMarker,
  ) {
    this.remote = new GitHubStorage({ ...config, message });
    this.syncedAt = marker?.at ?? null;
  }

  /** True while this machine holds a grade GitHub has not been told about. */
  hasUnpushed(local: Progress): boolean {
    return this.syncedAt !== local.updatedAt;
  }

  private async markSynced(progress: Progress): Promise<void> {
    this.syncedAt = progress.updatedAt;
    if (this.marker) await writeSyncedAt(this.marker.path, progress.updatedAt);
  }

  /**
   * Look at what GitHub holds, before the session exists.
   *
   * The terminal never had the web app's race — this runs to completion before
   * a question can be answered, let alone pushed — but it did ask about the
   * ordinary case, and being asked "which of these two do you want?" every
   * morning is how a person learns to answer without reading. So the same rule
   * applies: settle it silently unless both copies have moved.
   */
  async checkRemote(local: Progress | null): Promise<StartupCheck> {
    const remote = await this.fetchRemote();
    if (!remote) return { kind: "current" };
    if (!local) return { kind: "adopt", remote };
    if (!(remote.updatedAt > local.updatedAt)) return { kind: "current" };
    return this.hasUnpushed(local)
      ? { kind: "diverged", remote }
      : { kind: "adopt", remote };
  }

  describe(): string {
    return `${this.local.describe()} → ${this.config.owner}/${this.config.repo}`;
  }

  async load(): Promise<Progress | null> {
    return this.local.load();
  }

  /** What the remote holds, for the startup comparison. */
  async fetchRemote(): Promise<Progress | null> {
    try {
      const { progress } = await this.remote.loadMeta();
      this.setState({ kind: "idle", at: new Date().toISOString() });
      return progress;
    } catch (err) {
      this.setState(describeSyncError(err));
      throw err;
    }
  }

  async save(progress: Progress): Promise<void> {
    await this.local.save(progress);
    this.queued = progress;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), PUSH_DELAY_MS);
  }

  /**
   * Write and push now, without waiting for the debounce. `force` is the
   * deliberate overwrite — a person answering "keep this machine's copy".
   */
  async saveNow(progress: Progress, opts: { force?: boolean } = {}): Promise<void> {
    await this.local.save(progress);
    this.queued = progress;
    clearTimeout(this.timer);
    await this.flush(opts);
  }

  /**
   * Replace the local copy outright — resolving a conflict at startup.
   *
   * Always from the remote here, unlike the web app's import, so the marker is
   * set unconditionally: after this the two agree.
   */
  async adopt(progress: Progress): Promise<void> {
    await this.local.save(progress);
    await this.markSynced(progress);
  }

  /** Push whatever is queued. Safe to call at any time, including on exit. */
  async flush(opts: { force?: boolean } = {}): Promise<void> {
    if (!this.queued || this.inFlight) return;
    const progress = this.queued;
    this.inFlight = true;
    this.setState({ kind: "pushing" });
    try {
      await this.remote.save(progress, opts);
      // Only clear the queue if nothing newer arrived while we were pushing.
      if (this.queued === progress) this.queued = null;
      await this.markSynced(progress);
      this.setState({ kind: "idle", at: new Date().toISOString() });
    } catch (err) {
      // A push refused because another machine is ahead keeps its queue: the
      // work is still here to be pushed once somebody says which copy wins.
      this.setState(describeSyncError(err));
    } finally {
      this.inFlight = false;
    }
  }

  /** True while a grade is still only on this machine. */
  hasPending(): boolean {
    return this.queued !== null;
  }

  currentState(): SyncState {
    return this.state;
  }

  onStateChange(listener: (s: SyncState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(s: SyncState): void {
    this.state = s;
    for (const listener of this.listeners) listener(s);
  }
}
