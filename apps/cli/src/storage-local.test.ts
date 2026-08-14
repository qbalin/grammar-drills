/**
 * The file on disk, and what it says when it cannot be read.
 *
 * A damaged file used to come out of here as a bare `SyntaxError: Unexpected
 * token` naming neither the file nor a way out of it. Refusing is right — the
 * terminal has a path and somebody to look at it, so stopping is better than
 * starting empty and letting the first grade write over the evidence — but
 * refusing has to say which file and what to do about it.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyProgress } from "@lang-tutor/core";
import { LocalFileStorage } from "./storage-local.js";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lang-tutor-"));
  path = join(dir, "progress.json");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("LocalFileStorage", () => {
  it("round-trips what it was given", async () => {
    const store = new LocalFileStorage(path);
    const written = { ...emptyProgress(), updatedAt: "2026-01-01T00:00:00.000Z" };
    await store.save(written);
    expect((await store.load())?.updatedAt).toBe(written.updatedAt);
  });

  it("is empty when there is no file yet", async () => {
    expect(await new LocalFileStorage(path).load()).toBeNull();
  });

  it("names the file it cannot read, and how to move it aside", async () => {
    await writeFile(path, "{ this is not");
    const store = new LocalFileStorage(path);
    await expect(store.load()).rejects.toThrow(path);
    await expect(store.load()).rejects.toThrow(/not readable as progress/);
    await expect(store.load()).rejects.toThrow(/mv /);
  });

  it("leaves the damaged file exactly as it found it", async () => {
    // The point of refusing rather than starting empty: nothing here may write
    // a fresh file over something a person might still get their work out of.
    await writeFile(path, "{ this is not");
    await new LocalFileStorage(path).load().catch(() => undefined);
    expect(await readFile(path, "utf8")).toBe("{ this is not");
  });
});
