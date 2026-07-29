import {
  GitHubStorage,
  type Progress,
  type StorageAdapter,
} from "@lang-tutor/core";
import { LocalStorageAdapter } from "./local.js";
import { profile } from "../pack.js";

// Namespaced by the pack, like the progress key: each language keeps its own
// repo settings even when they share an origin.
const CONFIG_KEY = profile.storage.webSyncKey;

export interface SyncConfig {
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
}

export type SyncState =
  | { kind: "off" }
  | { kind: "idle"; at?: string }
  | { kind: "pushing" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

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

/** How long to sit on a change before committing it. */
const PUSH_DELAY_MS = 4000;

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
 */
export class SyncingStorage implements StorageAdapter {
  private readonly local = new LocalStorageAdapter();
  private remote: GitHubStorage | null = null;
  private config: SyncConfig | null = null;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private queued: Progress | null = null;
  private inFlight = false;
  private state: SyncState = { kind: "off" };
  private readonly listeners = new Set<(s: SyncState) => void>();

  constructor() {
    this.configure(loadSyncConfig());
    addEventListener("online", () => void this.flush());
    // A phone does not "close" a tab so much as leave it. This is the last
    // reliable moment to get the session off the device.
    addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flush();
    });
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
    this.local.write(progress);
    if (!this.remote) return;
    this.queued = progress;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), PUSH_DELAY_MS);
  }

  /** Write the local copy and push it now, without waiting for the debounce. */
  async saveNow(progress: Progress): Promise<void> {
    this.local.write(progress);
    this.queued = progress;
    clearTimeout(this.timer);
    await this.flush();
  }

  /** Replace the local copy outright — resolving a conflict, or importing. */
  adopt(progress: Progress): void {
    this.local.write(progress);
  }

  clearLocal(): void {
    this.local.clear();
  }

  /** Push whatever is queued. Safe to call at any time. */
  async flush(): Promise<void> {
    if (!this.remote || !this.queued || this.inFlight) return;
    if (!navigator.onLine) {
      this.setState({ kind: "offline" });
      return;
    }
    const progress = this.queued;
    this.inFlight = true;
    this.setState({ kind: "pushing" });
    try {
      await this.remote.save(progress);
      // Only clear the queue if nothing newer arrived while we were pushing.
      if (this.queued === progress) this.queued = null;
      this.setState({ kind: "idle", at: new Date().toISOString() });
    } catch (err) {
      this.setState(this.describeError(err));
    } finally {
      this.inFlight = false;
    }
  }

  private describeError(err: unknown): SyncState {
    if (!navigator.onLine) return { kind: "offline" };
    const message = err instanceof Error ? err.message : String(err);
    if (/\b401\b/.test(message)) {
      return { kind: "error", message: "GitHub rejected the token." };
    }
    if (/\b404\b/.test(message)) {
      return { kind: "error", message: "Repo or branch not found." };
    }
    if (/\b403\b/.test(message)) {
      return { kind: "error", message: "The token cannot write to that repo." };
    }
    return { kind: "error", message };
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
}
