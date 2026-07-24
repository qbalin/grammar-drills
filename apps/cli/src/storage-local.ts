import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Progress, StorageAdapter } from "@latin-tutor/core";

/** Persists progress to a local JSON file (the CLl's default store). */
export class LocalFileStorage implements StorageAdapter {
  constructor(private readonly path: string) {}

  describe(): string {
    return `file:${this.path}`;
  }

  async load(): Promise<Progress | null> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Progress;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async save(progress: Progress): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(progress, null, 2));
  }
}
