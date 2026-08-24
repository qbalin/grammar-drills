import { mkdtemp, readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, type Progress, type SyncedAt } from "@lang-tutor/core";
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

/** `topics` is there to make one copy differ from another in substance. */
function at(iso: string, topics = 0): Progress {
  return { ...emptyProgress(), newTopicsIntroduced: topics, updatedAt: iso };
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

/**
 * Hold the next PUT open, so a grade can be given while one is in the air.
 *
 * Wraps whatever `stubApi` installed rather than replacing it: the point is a
 * real push that has not come back yet, not a broken one.
 */
function holdNextPut() {
  const underlying = fetch;
  let release!: () => void;
  let reached!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const arrived = new Promise<void>((r) => (reached = r));
  let first = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (first && (init?.method ?? "GET") === "PUT") {
        first = false;
        reached();
        await held;
      }
      return underlying(url, init);
    }),
  );
  return { reached: arrived, release };
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
  /**
   * A marker saying this machine and GitHub agreed on these two copies. They
   * are the same value except after a commit that sent nothing.
   */
  function agreed(pushedAt: string, remoteAt = pushedAt) {
    return { at: { pushedAt, remoteAt } };
  }

  async function make(marker?: { at: SyncedAt | null }) {
    const home = await dir();
    const local = new LocalFileStorage(join(home, "progress.json"));
    return {
      home,
      local,
      sync: new SyncingFileStorage(
        local,
        config,
        "Update progress",
        marker && { path: join(home, "synced"), at: marker.at },
      ),
    };
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

  it("commits nothing when the copy on GitHub already says the same thing", async () => {
    // Opening the tutor and closing it moves `updatedAt` and nothing else.
    const puts = stubApi(at("2026-01-01T00:00:00Z", 4));
    const { sync } = await make();
    await sync.saveNow(at("2026-01-02T00:00:00Z", 4));
    expect(puts).toHaveLength(0);
  });

  describe("the startup check", () => {
    it("takes a newer copy without asking when this machine has none of its own", async () => {
      stubApi(at("2026-02-02T00:00:00Z", 9));
      const local = at("2026-01-01T00:00:00Z", 3);
      // The marker says this machine's copy is exactly what it last pushed.
      const { sync } = await make(agreed(local.updatedAt));

      expect(await sync.checkRemote(local)).toEqual({
        kind: "adopt",
        remote: expect.objectContaining({ updatedAt: "2026-02-02T00:00:00Z" }),
      });
    });

    it("asks when both copies have moved since they last agreed", async () => {
      stubApi(at("2026-02-02T00:00:00Z", 9));
      // Studied offline: the local copy has moved past the marker.
      const { sync } = await make(agreed("2026-01-01T00:00:00Z"));

      const found = await sync.checkRemote(at("2026-01-05T00:00:00Z", 5));
      expect(found.kind).toBe("diverged");
    });

    it("takes what is there when this machine has no progress at all", async () => {
      stubApi(at("2026-02-02T00:00:00Z", 9));
      const { sync } = await make();
      expect((await sync.checkRemote(null)).kind).toBe("adopt");
    });

    it("has nothing to say when GitHub holds what this machine put there", async () => {
      stubApi(at("2026-01-01T00:00:00Z", 3));
      const { sync } = await make(agreed("2026-01-01T00:00:00Z"));
      expect((await sync.checkRemote(at("2026-02-02T00:00:00Z", 5))).kind).toBe(
        "current",
      );
    });

    it("adopts a copy stamped earlier than this machine's", async () => {
      // The case the clock could not see, and the one that lost people's
      // evenings. Opening the tutor moves `updatedAt` without anything being
      // studied, so this machine's stamp is the later of the two while GitHub
      // holds the week's real work. Later stamp, less study.
      stubApi(at("2026-01-01T00:00:00Z", 9));
      const { sync } = await make(agreed("2026-02-02T00:00:00Z"));
      const found = await sync.checkRemote(at("2026-02-02T00:00:00Z", 3));
      expect(found).toEqual({
        kind: "adopt",
        remote: expect.objectContaining({ newTopicsIntroduced: 9 }),
      });
    });

    it("asks a machine that has work but has never synced", async () => {
      // Its first push would be over somebody else's file.
      stubApi(at("2026-01-01T00:00:00Z", 9));
      const { sync } = await make();
      expect((await sync.checkRemote(at("2026-02-02T00:00:00Z", 5))).kind).toBe(
        "diverged",
      );
    });

    it("remembers what it adopted, so the next start is a quiet one", async () => {
      stubApi(at("2026-02-02T00:00:00Z", 9));
      const { sync, home } = await make({ at: null });
      const remote = at("2026-02-02T00:00:00Z", 9);
      await sync.adopt(remote);

      expect(sync.hasUnpushed(remote)).toBe(false);
      expect(JSON.parse(await readFile(join(home, "synced"), "utf8"))).toEqual({
        pushedAt: "2026-02-02T00:00:00Z",
        remoteAt: "2026-02-02T00:00:00Z",
      });
    });
  });

  it("sends what arrived while a push was in the air", async () => {
    // `flush` turns away anything that finds a push already going, and used to
    // leave it at that. On exit — the terminal's only other flush — that is the
    // last grades of a session sitting in a queue nobody looks at again.
    const puts = stubApi(null);
    const { sync } = await make();
    const inFlight = holdNextPut();

    const first = sync.saveNow(at("2026-01-01T00:00:01Z", 1));
    await inFlight.reached; // the first push is on the wire
    await sync.save(at("2026-01-01T00:00:02Z", 2)); // the grade that arrives
    inFlight.release();
    await first;

    expect(puts.map((p) => p.newTopicsIntroduced)).toEqual([1, 2]);
    expect(sync.hasPending()).toBe(false);
  });

  describe("when another machine pushed first", () => {
    it("refuses mid-session, when the startup check is long over", async () => {
      // The check runs once and a session runs for an hour. This machine agreed
      // with GitHub at launch and pushes again later, by which time the phone
      // has been at it — and this copy's stamp is the later one, because it has
      // been studied since. Under the clock it walked straight over the phone.
      const puts = stubApi(at("2026-01-01T09:05:00Z", 9));
      const { sync } = await make(agreed("2026-01-01T09:00:00Z"));

      await sync.saveNow(at("2026-01-01T09:10:00Z", 4));

      expect(puts).toHaveLength(0);
      expect(sync.currentState().kind).toBe("behind");
    });

    it("holds the push rather than overwriting it, and keeps the work", async () => {
      const puts = stubApi(at("2026-02-02T00:00:00Z", 9));
      const { local, sync } = await make(agreed("2026-01-01T00:00:00Z"));

      await sync.saveNow(at("2026-01-05T00:00:00Z", 5));

      expect(puts).toHaveLength(0);
      expect(sync.currentState().kind).toBe("behind");
      // Nothing was lost: this session is on disk and still queued to go up.
      expect((await local.load())?.newTopicsIntroduced).toBe(5);
      expect(sync.hasPending()).toBe(true);
    });

    it("pushes over it when the overwrite is the answer given", async () => {
      const puts = stubApi(at("2026-02-02T00:00:00Z", 9));
      const { sync } = await make(agreed("2026-01-01T00:00:00Z"));

      await sync.saveNow(at("2026-01-05T00:00:00Z", 5), { force: true });

      expect(puts).toHaveLength(1);
      expect(puts[0]?.newTopicsIntroduced).toBe(5);
      expect(sync.currentState().kind).toBe("idle");
    });
  });
});
