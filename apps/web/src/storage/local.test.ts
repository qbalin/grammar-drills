/**
 * The device's own copy, and the two ways it goes wrong.
 *
 * Both used to be silent, and both cost a student everything they had done.
 * A file that will not parse was started over and then written straight over
 * on the first grade; a device with no room accepted every save and kept none
 * of them. Neither is a hypothetical — they are why this file exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emptyProgress, type Progress } from "@lang-tutor/core";
import { profile } from "../pack.js";
import { LocalStorageAdapter } from "./local.js";

const KEY = profile.storage.webProgressKey;
const SALVAGE_KEY = `${KEY}:corrupt`;

const someProgress = (): Progress => {
  const p = emptyProgress();
  p.updatedAt = "2026-01-01T00:00:00.000Z";
  return p;
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("reading", () => {
  it("returns what was written", () => {
    const store = new LocalStorageAdapter();
    const written = someProgress();
    expect(store.write(written)).toBe(true);
    expect(store.read()?.updatedAt).toBe(written.updatedAt);
  });

  it("is empty when there is nothing there", () => {
    expect(new LocalStorageAdapter().read()).toBeNull();
    expect(new LocalStorageAdapter().salvaged()).toBeNull();
  });

  it("still starts when the file will not parse", () => {
    localStorage.setItem(KEY, "{not json");
    // Empty, not an error: a student who cannot open the app has no route to
    // their own data at all.
    expect(new LocalStorageAdapter().read()).toBeNull();
  });

  it("keeps the file it could not read", () => {
    localStorage.setItem(KEY, '{"topicCards":{"bn-1"');
    new LocalStorageAdapter().read();
    expect(localStorage.getItem(SALVAGE_KEY)).toBe('{"topicCards":{"bn-1"');
  });

  it("does not let the next write destroy it", () => {
    // The whole defect, in one test. Open the app on a damaged file, grade
    // once, and the damaged file used to be gone.
    localStorage.setItem(KEY, "half a fi");
    const store = new LocalStorageAdapter();
    store.read();
    store.write(someProgress());

    expect(store.read()).not.toBeNull(); // the fresh file is readable
    expect(store.salvaged()).toBe("half a fi"); // and the old one is still here
  });

  it("keeps the first damaged file rather than the newest", () => {
    // A second failure must not overwrite the rescue with what the first one
    // left behind — by then that is the empty file, not the student's work.
    localStorage.setItem(KEY, "the original");
    const store = new LocalStorageAdapter();
    store.read();
    localStorage.setItem(KEY, "something else broken");
    store.read();

    expect(store.salvaged()).toBe("the original");
  });

  it("lets it go when asked", () => {
    localStorage.setItem(SALVAGE_KEY, "whatever");
    const store = new LocalStorageAdapter();
    store.dropSalvaged();
    expect(store.salvaged()).toBeNull();
  });

  it("rescues nothing when storage is blocked outright", () => {
    // Safari private browsing. There is no file to read and none to keep, and
    // the rescue must not throw on its way to finding that out.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = new LocalStorageAdapter();
    expect(store.read()).toBeNull();
    expect(store.salvaged()).toBeNull();
  });
});

describe("writing", () => {
  it("says so when the write does not land", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(new LocalStorageAdapter().write(someProgress())).toBe(false);
  });

  it("says so when it does", () => {
    expect(new LocalStorageAdapter().write(someProgress())).toBe(true);
  });
});
