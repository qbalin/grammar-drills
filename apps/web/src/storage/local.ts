import type { Progress, StorageAdapter } from "@lang-tutor/core";

const KEY = "latin-tutor:progress";

/**
 * Progress in `localStorage` — the web twin of the CLI's `LocalFileStorage`.
 *
 * `localStorage` rather than IndexedDB because the writes must not be lost: the
 * app saves on every grade and the page can be closed a moment later, and a
 * synchronous write has already happened by the time the tab goes away. The
 * file is small — a few KB, growing only with vocabulary — so the quota that
 * makes `localStorage` a poor choice for bulk data does not apply.
 */
export class LocalStorageAdapter implements StorageAdapter {
  describe(): string {
    return "this device";
  }

  async load(): Promise<Progress | null> {
    return this.read();
  }

  /** The synchronous read, for callers that cannot await (startup, export). */
  read(): Progress | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Progress) : null;
    } catch {
      // Corrupt JSON, or storage blocked entirely (Safari private browsing).
      // Losing progress is bad; refusing to start is worse.
      return null;
    }
  }

  async save(progress: Progress): Promise<void> {
    this.write(progress);
  }

  write(progress: Progress): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      // Quota or a blocked store. The session continues in memory; Settings
      // shows the sync status, and export still works.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to undo */
    }
  }
}
