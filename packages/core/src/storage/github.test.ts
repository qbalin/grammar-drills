import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProgress } from "../types.js";
import { GitHubStorage } from "./github.js";

const cfg = { token: "t", owner: "me", repo: "latin", path: "p.json" };

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/** A GitHub contents API just real enough to exercise the sha handshake. */
function stubApi(file: { sha: string; body?: string } | null) {
  const calls: { method: string; sha?: string }[] = [];
  let state = file;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      calls.push({ method });
      if (!state) return new Response("", { status: 404 });
      return Response.json({
        sha: state.sha,
        content: b64(state.body ?? JSON.stringify(emptyProgress())),
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
    await new GitHubStorage(cfg).save(emptyProgress());
    expect(calls).toEqual([{ method: "GET" }, { method: "PUT", sha: "abc" }]);
  });

  it("commits without a sha when no remote file exists yet", async () => {
    const calls = stubApi(null);
    await new GitHubStorage(cfg).save(emptyProgress());
    expect(calls).toEqual([{ method: "GET" }, { method: "PUT", sha: undefined }]);
  });

  it("re-reads the sha and retries once when another device commits first", async () => {
    const store = new GitHubStorage(cfg);
    stubApi({ sha: "abc" });
    await store.load(); // caches sha "abc"

    const calls = stubApi({ sha: "moved-on" }); // someone else committed
    await store.save(emptyProgress());
    expect(calls).toEqual([
      { method: "PUT", sha: "abc" }, // rejected
      { method: "GET" },
      { method: "PUT", sha: "moved-on" }, // accepted
    ]);
  });

  it("skips the extra read when a load already supplied the sha", async () => {
    const store = new GitHubStorage(cfg);
    stubApi({ sha: "abc" });
    await store.load();
    const calls = stubApi({ sha: "abc" });
    await store.save(emptyProgress());
    expect(calls).toEqual([{ method: "PUT", sha: "abc" }]);
  });

  it("reports the remote's sha alongside its progress", async () => {
    const remote = { ...emptyProgress(), updatedAt: "2026-07-01T00:00:00.000Z" };
    stubApi({ sha: "abc", body: JSON.stringify(remote) });
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
        ? Response.json({ sha: "abc", content: b64(JSON.stringify(emptyProgress())) })
        : Response.json({ content: { sha: "abc+" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new GitHubStorage(cfg).loadMeta();
    await new GitHubStorage(cfg).save(emptyProgress()); // the sha lookup inside

    const gets = fetchMock.mock.calls.filter(
      ([, init]) => (init?.method ?? "GET") === "GET",
    );
    expect(gets).toHaveLength(2);
    for (const [, init] of gets) expect(init?.cache).toBe("no-store");
  });
});
