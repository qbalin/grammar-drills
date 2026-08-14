import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, type Progress } from "../types.js";
import { GitHubStorage, RemoteMovedError } from "./github.js";

const cfg = { token: "t", owner: "me", repo: "latin", path: "p.json" };

const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-06-01T00:00:00.000Z";

/** A progress file with something in it, so a change is a change. */
function progress(updatedAt: string, topics = 0): Progress {
  return { ...emptyProgress(), newTopicsIntroduced: topics, updatedAt };
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/** A GitHub contents API just real enough to exercise the sha handshake. */
function stubApi(file: { sha: string; body?: Progress } | null) {
  const calls: { method: string; sha?: string }[] = [];
  let state = file;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      calls.push({ method });
      if (!state) return new Response("", { status: 404 });
      return Response.json({
        sha: state.sha,
        content: b64(JSON.stringify(state.body ?? progress(OLD))),
      });
    }
    const sent = JSON.parse(String(init?.body)) as { sha?: string };
    calls.push({ method, sha: sent.sha });
    // The real API rejects a write that doesn't name the current blob.
    if (state && sent.sha !== state.sha) {
      return new Response("sha mismatch", { status: 409 });
    }
    state = { sha: `${state?.sha ?? "sha"}+` };
    return Response.json({ content: { sha: state.sha } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("GitHubStorage", () => {
  it("fetches the sha before overwriting a file it never loaded", async () => {
    // The browser case: a fresh page, a remote file already there. Without the
    // lookup the PUT carries no sha and GitHub refuses it.
    const calls = stubApi({ sha: "abc" });
    await new GitHubStorage(cfg).save(progress(NEW, 3));
    expect(calls).toEqual([{ method: "GET" }, { method: "PUT", sha: "abc" }]);
  });

  it("commits without a sha when no remote file exists yet", async () => {
    const calls = stubApi(null);
    await new GitHubStorage(cfg).save(progress(NEW));
    expect(calls).toEqual([{ method: "GET" }, { method: "PUT", sha: undefined }]);
  });

  it("refuses a remote file that is not progress, and writes nothing over it", async () => {
    // Whatever is up there, it is not what this app wrote. The parse used to be
    // bare, so a `SyntaxError` arrived out of a debounced background push four
    // seconds after a grade — and the one thing that must not follow a file we
    // cannot read is a save that treats the mismatch as ours to resolve.
    const calls: { method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET" });
        return Response.json({ sha: "abc", content: b64("<!doctype html>") });
      }),
    );
    const store = new GitHubStorage(cfg);
    await expect(store.load()).rejects.toThrow(/not readable as progress/);
    await expect(store.save(progress(NEW))).rejects.toThrow(/not readable as progress/);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("names the file it could not read, so the repo can be looked at", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ sha: "abc", content: b64("{oops") })),
    );
    await expect(new GitHubStorage(cfg).load()).rejects.toThrow("me/latin/p.json");
  });

  it("skips the extra read when a load already supplied the sha", async () => {
    const store = new GitHubStorage(cfg);
    stubApi({ sha: "abc" });
    await store.load();
    const calls = stubApi({ sha: "abc" });
    await store.save(progress(NEW, 3));
    expect(calls).toEqual([{ method: "PUT", sha: "abc" }]);
  });

  it("reports the remote's sha alongside its progress", async () => {
    stubApi({ sha: "abc", body: progress("2026-07-01T00:00:00.000Z") });
    const meta = await new GitHubStorage(cfg).loadMeta();
    expect(meta.sha).toBe("abc");
    expect(meta.progress?.updatedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("reports no progress when the file is absent", async () => {
    stubApi(null);
    expect(await new GitHubStorage(cfg).loadMeta()).toEqual({ progress: null });
  });

  it("reads past the browser's cache, which GitHub invites it to keep", async () => {
    // The contents API answers `cache-control: max-age=60`. A browser with a
    // real HTTP cache honours that, and the pull comes back with the progress
    // from before the other device pushed — indistinguishable from a pull that
    // had nothing to bring — carrying the stale sha the next save would send.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "GET"
        ? Response.json({ sha: "abc", content: b64(JSON.stringify(progress(OLD))) })
        : Response.json({ content: { sha: "abc+" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new GitHubStorage(cfg).loadMeta();
    await new GitHubStorage(cfg).save(progress(NEW, 3)); // the sha lookup inside

    const gets = fetchMock.mock.calls.filter(
      ([, init]) => (init?.method ?? "GET") === "GET",
    );
    expect(gets).toHaveLength(2);
    for (const [, init] of gets) expect(init?.cache).toBe("no-store");
  });

  describe("refusing to overwrite a remote that has moved on", () => {
    it("refuses before the PUT when the file it read is newer", async () => {
      // The reported bug, and the one no 409 would have caught: a tab that has
      // just opened reads the *current* sha, so its stale write is accepted.
      const calls = stubApi({ sha: "abc", body: progress(NEW, 9) });
      const store = new GitHubStorage(cfg);

      await expect(store.save(progress(OLD, 1))).rejects.toBeInstanceOf(
        RemoteMovedError,
      );
      expect(calls).toEqual([{ method: "GET" }]); // read, and then nothing
    });

    it("hands the caller the remote copy it refused for", async () => {
      stubApi({ sha: "abc", body: progress(NEW, 9) });
      const err = await new GitHubStorage(cfg)
        .save(progress(OLD, 1))
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RemoteMovedError);
      expect((err as RemoteMovedError).remote?.newTopicsIntroduced).toBe(9);
      expect((err as RemoteMovedError).sha).toBe("abc");
    });

    it("does not retry a rejected sha into an overwrite", async () => {
      const store = new GitHubStorage(cfg);
      stubApi({ sha: "abc" });
      await store.load(); // caches sha "abc"

      const calls = stubApi({ sha: "moved-on", body: progress(NEW, 9) });
      await expect(store.save(progress(NEW, 1))).rejects.toBeInstanceOf(
        RemoteMovedError,
      );
      expect(calls).toEqual([
        { method: "PUT", sha: "abc" }, // rejected by GitHub
        { method: "GET" }, // learn what is actually there
        // and stop: the second PUT is the overwrite this exists to prevent
      ]);
    });

    it("re-reads the sha and retries once when the overwrite is asked for", async () => {
      // The deliberate push — "make GitHub match this device" — is the one
      // caller allowed to win, and it behaves as every save used to.
      const store = new GitHubStorage(cfg);
      stubApi({ sha: "abc" });
      await store.load();

      const calls = stubApi({ sha: "moved-on", body: progress(NEW, 9) });
      await store.save(progress(NEW, 1), { force: true });
      expect(calls).toEqual([
        { method: "PUT", sha: "abc" }, // rejected
        { method: "GET" },
        { method: "PUT", sha: "moved-on" }, // accepted
      ]);
    });

    it("lets a forced push land over a newer remote without a mismatch", async () => {
      const calls = stubApi({ sha: "abc", body: progress(NEW, 9) });
      await new GitHubStorage(cfg).save(progress(OLD, 1), { force: true });
      expect(calls).toEqual([{ method: "GET" }, { method: "PUT", sha: "abc" }]);
    });
  });

  describe("not committing what has not changed", () => {
    it("sends nothing when the copy matches the remote's but for its clock", async () => {
      // Opening the app touches `updatedAt` without anything being studied. A
      // commit for that is a commit on somebody's real repository.
      const calls = stubApi({ sha: "abc", body: progress(OLD, 3) });
      await new GitHubStorage(cfg).save(progress(NEW, 3));
      expect(calls).toEqual([{ method: "GET" }]);
    });

    it("sends nothing on a second save that changed nothing", async () => {
      const store = new GitHubStorage(cfg);
      const calls = stubApi({ sha: "abc" });
      await store.save(progress(NEW, 3));
      await store.save(progress("2026-06-02T00:00:00.000Z", 3));
      expect(calls).toEqual([{ method: "GET" }, { method: "PUT", sha: "abc" }]);
    });

    it("still commits a real change", async () => {
      const store = new GitHubStorage(cfg);
      const calls = stubApi({ sha: "abc" });
      await store.save(progress(NEW, 3));
      await store.save(progress("2026-06-02T00:00:00.000Z", 4));
      expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2);
    });

    it("is not fooled by the order the keys happen to be in", async () => {
      // One side is parsed out of the remote file and the other is built in
      // memory, so their key order differs. Compared as text, a file that
      // changed in no way would read as changed on every first save.
      const remote = progress(OLD, 3);
      const reordered = Object.fromEntries(
        Object.entries(remote).reverse(),
      ) as unknown as Progress;
      const calls = stubApi({ sha: "abc", body: reordered });
      await new GitHubStorage(cfg).save({ ...remote, updatedAt: NEW });
      expect(calls).toEqual([{ method: "GET" }]);
    });
  });
});
