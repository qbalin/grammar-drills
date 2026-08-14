import type { Progress, StorageAdapter } from "@lang-tutor/core";
import { profile } from "../pack.js";

// Named by the pack, because one origin can serve several of them and two
// languages sharing a key would overwrite each other's progress.
const KEY = profile.storage.webProgressKey;

/**
 * Where a file we could not read is kept.
 *
 * Starting empty is the right answer to an unreadable file — see `read` — but
 * it used to be the *only* answer, and the first grade after it wrote straight
 * over the thing that could not be parsed. Whatever a person might have
 * recovered by hand from a truncated write was gone by the time they noticed
 * anything was wrong. So the raw text moves here first, and Settings offers it
 * back as a download.
 */
const SALVAGE_KEY = `${KEY}:corrupt`;

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

  /**
   * The synchronous read, for callers that cannot await (startup, export).
   *
   * The two ways this fails are not the same failure and no longer share a
   * `catch`. **Storage blocked** — Safari private browsing — means there is
   * nothing to read and nothing to rescue, and the session runs in memory.
   * **A file that will not parse** means there is something on this device that
   * matters, and the old shared catch let the next grade destroy it.
   *
   * Either way the app starts empty rather than refusing to start, which is
   * still the right call: a student who cannot open the app has no route to
   * their own data at all.
   */
  read(): Progress | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Progress;
    } catch {
      this.setAside(raw);
      return null;
    }
  }

  /**
   * Keep an unreadable file, once.
   *
   * Only if nothing is held already: the first failure is the one still
   * carrying a whole file, and a second pass would replace it with whatever the
   * first one left behind — which, after a grade or two, is the empty file that
   * started the trouble.
   */
  private setAside(raw: string): void {
    try {
      if (localStorage.getItem(SALVAGE_KEY) === null) {
        localStorage.setItem(SALVAGE_KEY, raw);
      }
    } catch {
      /* blocked, or no room for a second copy: nothing further to try */
    }
  }

  /** The file a read had to give up on, if this device ever held one. */
  salvaged(): string | null {
    try {
      return localStorage.getItem(SALVAGE_KEY);
    } catch {
      return null;
    }
  }

  /** Let it go — the student has taken a copy, or does not want one. */
  dropSalvaged(): void {
    try {
      localStorage.removeItem(SALVAGE_KEY);
    } catch {
      /* nothing to undo */
    }
  }

  async save(progress: Progress): Promise<void> {
    this.write(progress);
  }

  /**
   * Returns whether the write landed.
   *
   * It used to return nothing, and a full device was therefore silent: the
   * session carried on in memory, every grade looked saved, and the lot went on
   * the next reload. The comment here said Settings would show it, but the sync
   * status only exists for the few who have set up a GitHub mirror. The caller
   * says so out loud instead.
   */
  write(progress: Progress): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
      return true;
    } catch {
      return false;
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
