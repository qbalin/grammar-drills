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
  hasUnsent,
  triage,
  type Progress,
  type StartupCheck,
  type StorageAdapter,
  type SyncedAt,
  type SyncState,
} from "@lang-tutor/core";
import type { LocalFileStorage } from "./storage-local.js";
import { writeSyncedMarker, type CliSyncConfig } from "./sync-config.js";

export type { StartupCheck };

/**
 * When this machine last agreed with GitHub, and where that is written down.
 * Absent in the tests and wherever there is nowhere to keep it, which costs a
 * question rather than any correctness.
 */
export interface SyncedMarker {
  path: string;
  at: SyncedAt | null;
}

export class SyncingFileStorage implements StorageAdapter {
  private readonly remote: GitHubStorage;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queued: Progress | null = null;
  private inFlight = false;
  private state: SyncState = { kind: "idle" };
  private readonly listeners = new Set<(s: SyncState) => void>();
  private marker: SyncedAt | null;

  constructor(
    private readonly local: LocalFileStorage,
    private readonly config: CliSyncConfig,
    /** Named in the commit subject; a fact about the build, not the user. */
    message: string,
    private readonly markerFile?: SyncedMarker,
  ) {
    this.remote = new GitHubStorage({ ...config, message });
    this.marker = markerFile?.at ?? null;
  }

  /** True while this machine holds a grade GitHub has not been told about. */
  hasUnpushed(local: Progress): boolean {
    return hasUnsent(this.marker, local.updatedAt);
  }

  /**
   * Record an agreement. `remoteAt` is told rather than assumed: a commit whose
   * content already matched sends nothing, and the remote's stamp stays its own.
   */
  private async markSynced(pushedAt: string, remoteAt: string): Promise<void> {
    this.marker = { pushedAt, remoteAt };
    if (this.markerFile) await writeSyncedMarker(this.markerFile.path, this.marker);
  }

  /**
   * Look at what GitHub holds, before the session exists.
   *
   * The terminal never had the web app's race — this runs to completion before
   * a question can be answered, let alone pushed — but it did ask about the
   * ordinary case, and being asked "which of these two do you want?" every
   * morning is how a person learns to answer without reading. So the same rule
   * applies, out of the same function: settle it silently unless both copies
   * have moved since they last agreed.
   */
  async checkRemote(local: Progress | null): Promise<StartupCheck> {
    const found = triage(local ?? null, await this.fetchRemote(), this.marker);
    // The two copies say the same thing and the marker did not know it — a
    // push that landed on the way out without getting its marker written. There
    // is nothing to choose, so file the agreement and carry on rather than
    // asking a person about two identical files.
    if (found.kind === "agreed") {
      if (local) await this.markSynced(local.updatedAt, found.remote.updatedAt);
      return { kind: "current" };
    }
    return found;
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
    // A copy this class owns: `Session.progress()` hands out its live object,
    // so a queue holding it holds whatever is studied next rather than what was
    // queued — and the clock read off it after the push names a copy newer than
    // the body that was sent. See `detach` in the web app's mirror.
    this.queued = structuredClone(progress) as Progress;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), PUSH_DELAY_MS);
  }

  /**
   * Write and push now, without waiting for the debounce. `force` is the
   * deliberate overwrite — a person answering "keep this machine's copy".
   */
  async saveNow(progress: Progress, opts: { force?: boolean } = {}): Promise<void> {
    await this.local.save(progress);
    // A copy this class owns: `Session.progress()` hands out its live object,
    // so a queue holding it holds whatever is studied next rather than what was
    // queued — and the clock read off it after the push names a copy newer than
    // the body that was sent. See `detach` in the web app's mirror.
    this.queued = structuredClone(progress) as Progress;
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
    // Both sides, and the same value on each: this copy is the machine's now,
    // and it is what the remote holds.
    await this.markSynced(progress.updatedAt, progress.updatedAt);
  }

  /** Push whatever is queued. Safe to call at any time, including on exit. */
  async flush(opts: { force?: boolean } = {}): Promise<void> {
    if (!this.queued || this.inFlight) return;
    const progress = this.queued;
    this.inFlight = true;
    this.setState({ kind: "pushing" });
    let landed = false;
    try {
      // `lastSeen` is what lets the refusal work: it says which copy this
      // machine believes is up there, so anything else is another device's work.
      const { remoteAt } = await this.remote.commit(progress, {
        ...opts,
        lastSeen: this.marker?.remoteAt,
      });
      landed = true;
      // Only clear the queue if nothing newer arrived while we were pushing.
      if (this.queued === progress) this.queued = null;
      await this.markSynced(progress.updatedAt, remoteAt);
      this.setState({ kind: "idle", at: new Date().toISOString() });
    } catch (err) {
      // A push refused because another machine is ahead keeps its queue: the
      // work is still here to be pushed once somebody says which copy wins.
      this.setState(describeSyncError(err));
    } finally {
      this.inFlight = false;
    }
    // Something arrived while that was in the air, and a `flush` that finds one
    // already going turns away. On exit that is the last grades of a session
    // sitting in a queue nobody will look at again.
    //
    // Without `force`: answering "overwrite" was about the copy on screen, not
    // about a grade given after it.
    if (landed && this.queued) await this.flush();
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
