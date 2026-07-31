import { mkdtemp, readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, type Progress } from "@lang-tutor/core";
import { testProfile } from "@lang-tutor/core/testing";
import { LocalFileStorage } from "./storage-local.js";
import { SyncingFileStorage } from "./storage-sync.js";
import { loadSyncConfig, saveSyncConfig, syncConfigPath } from "./sync-config.js";

const config = {
  token: "t",
  owner: "me",
  repo: "progress",
  path: "p.json",
  branch: "main",
};

const dir = () => mkdtemp(join(tmpdir(), "tutor-sync-"));

function at(iso: string): Progress {
  return { ...emptyProgress(), updatedAt: iso };
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/** A contents API just real enough to serve a file and take a commit. */
function stubApi(file: Progress | null) {
  let state = file;
  const puts: Progress[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        if (!state) return new Response("", { status: 404 });
        return Response.json({ sha: "s", content: b64(JSON.stringify(state)) });
      }
      const sent = JSON.parse(String(init?.body)) as { content: string };
      state = JSON.parse(Buffer.from(sent.content, "base64").toString("utf8"));
      puts.push(state!);
      return Response.json({ content: { sha: "s2" } });
    }),
  );
  return puts;
}

/** Every push fails, the way a revoked token does. */
function stubFailing(status: number) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe("the CLI's sync settings file", () => {
  it("is absent until it is written, which is not an error", async () => {
    const home = await dir();
    const path = syncConfigPath(testProfile, home);
    expect(await loadSyncConfig(path, testProfile, {})).toBeNull();
  });

  it("round-trips, filling the path and branch from the pack", async () => {
    const home = await dir();
    const path = syncConfigPath(testProfile, home);
    await saveSyncConfig(path, { ...config, path: "", branch: "" });
    const loaded = await loadSyncConfig(path, testProfile, {});
    expect(loaded?.owner).toBe("me");
    expect(loaded?.path).toBe(testProfile.storage.githubPath);
    expect(loaded?.branch).toBe("main");
  });

  it("is readable only by its owner, because it holds a token", async () => {
    const home = await dir();
    const path = syncConfigPath(testProfile, home);
    const { mode } = await saveSyncConfig(path, config);
    expect(mode).toBe("0600");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("lets GITHUB_TOKEN win over the token on disk", async () => {
    const home = await dir();
    const path = syncConfigPath(testProfile, home);
    await saveSyncConfig(path, config);
    const loaded = await loadSyncConfig(path, testProfile, { GITHUB_TOKEN: "env" });
    expect(loaded?.token).toBe("env");
  });

  it("can keep the token out of the file entirely", async () => {
    const home = await dir();
    const path = syncConfigPath(testProfile, home);
    await saveSyncConfig(path, config, { keepTokenOnDisk: false });
    expect(JSON.parse(await readFile(path, "utf8"))).not.toHaveProperty("token");
    // Without the environment there is now nothing to sync with.
    expect(await loadSyncConfig(path, testProfile, {})).toBeNull();
    expect(
      (await loadSyncConfig(path, testProfile, { GITHUB_TOKEN: "env" }))?.token,
    ).toBe("env");
  });

  it("says which file it could not read, rather than failing silently", async () => {
    const home = await dir();
    const path = syncConfigPath(testProfile, home);
    await mkdir(join(home, testProfile.storage.cliDir), { recursive: true });
    await writeFile(path, "{ not json");
    await expect(loadSyncConfig(path, testProfile, {})).rejects.toThrow(path);
  });
});

describe("SyncingFileStorage", () => {
  async function make() {
    const home = await dir();
    const local = new LocalFileStorage(join(home, "progress.json"));
    return { local, sync: new SyncingFileStorage(local, config, "Update progress") };
  }

  it("writes the local copy immediately and holds the push back", async () => {
    const puts = stubApi(null);
    const { local, sync } = await make();
    await sync.save(at("2026-01-01T00:00:00Z"));

    // The grade is on disk before anything touches the network — study never
    // waits on GitHub.
    expect((await local.load())?.updatedAt).toBe("2026-01-01T00:00:00Z");
    expect(puts).toHaveLength(0);
    expect(sync.hasPending()).toBe(true);
  });

  it("sends one commit for a burst of grades, not one each", async () => {
    const puts = stubApi(null);
    const { sync } = await make();
    await sync.save(at("2026-01-01T00:00:01Z"));
    await sync.save(at("2026-01-01T00:00:02Z"));
    await sync.save(at("2026-01-01T00:00:03Z"));
    await sync.flush();

    expect(puts).toHaveLength(1);
    expect(puts[0]?.updatedAt).toBe("2026-01-01T00:00:03Z");
    expect(sync.hasPending()).toBe(false);
  });

  it("keeps studying when the push fails, and says why", async () => {
    stubFailing(401);
    const { local, sync } = await make();
    await sync.saveNow(at("2026-01-01T00:00:00Z"));

    // The local copy is written regardless; only the mirror failed.
    expect((await local.load())?.updatedAt).toBe("2026-01-01T00:00:00Z");
    const state = sync.currentState();
    expect(state.kind).toBe("error");
    expect(state.kind === "error" && state.message).toBe("GitHub rejected the token.");
    // Still queued, so the next flush — including the one on exit — retries it.
    expect(sync.hasPending()).toBe(true);
  });

  it("reads what the remote holds, for the startup comparison", async () => {
    stubApi(at("2026-02-02T00:00:00Z"));
    const { sync } = await make();
    expect((await sync.fetchRemote())?.updatedAt).toBe("2026-02-02T00:00:00Z");
  });

  it("has nothing to push when nothing has changed", async () => {
    const puts = stubApi(null);
    const { sync } = await make();
    await sync.flush();
    expect(puts).toHaveLength(0);
  });
});
