import type { Progress } from "../types.js";

/**
 * Pluggable progress persistence. The runtime is storage-agnostic; concrete
 * adapters (local file, GitHub, and later Google Drive/etc.) implement this.
 */
export interface StorageAdapter {
  /** Human-readable location, for status lines. */
  describe(): string;
  /** Return saved progress, or null if none exists yet. */
  load(): Promise<Progress | null>;
  save(progress: Progress): Promise<void>;
}
