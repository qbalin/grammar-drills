import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Progress, StorageAdapter } from "@lang-tutor/core";

/** Persists progress to a local JSON file (the CLl's default store). */
export class LocalFileStorage implements StorageAdapter {
  constructor(private readonly path: string) {}

  describe(): string {
    return `file:${this.path}`;
  }

  /**
   * The file, or nothing when there is no file.
   *
   * A file that will not parse **refuses** rather than starting empty, which is
   * the opposite of what the web adapter does and is right for both. In a
   * browser there is nowhere to send somebody and no way to open their storage
   * by hand, so it starts fresh and keeps the damaged copy aside. Here there is
   * a path, and a terminal to look at it with — so the useful thing is to stop
   * before `save` writes a fresh empty file over it on the first grade.
   *
   * What it must not do is refuse the way it used to, with a bare
   * `SyntaxError: Unexpected token` naming neither the file nor a way out.
   */
  async load(): Promise<Progress | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    try {
      return JSON.parse(raw) as Progress;
    } catch {
      throw new Error(
        `${this.path} is not readable as progress.\n` +
          `Nothing has been written over it. Move it aside to start fresh:\n` +
          `  mv ${this.path} ${this.path}.damaged`,
      );
    }
  }

  async save(progress: Progress): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(progress, null, 2));
  }
}
