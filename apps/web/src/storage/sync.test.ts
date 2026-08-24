/**
 * The mirror, and the ways it used to lose an evening.
 *
 * Every one of these is a sequence somebody hit: study on the phone, open the
 * laptop, and find the laptop's week-old copy on GitHub with nothing having
 * been asked. The cause was always the same — the decision was made by
 * comparing `updatedAt`, which says when a device last wrote and not how much
 * study it holds, and opening the app is a write.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emptyProgress, type Progress } from "@lang-tutor/core";
import { profile } from "../pack.js";
import { SyncingStorage } from "./sync.js";

const PROGRESS_KEY = profile.storage.webProgressKey;
const CONFIG_KEY = profile.storage.webSyncKey;
const SYNCED_KEY = `${CONFIG_KEY}:synced`;

const MON = "2026-01-05T21:00:00.000Z";
const TUE = "2026-01-06T09:00:00.000Z";
const WED = "2026-01-07T09:00:00.000Z";

/** `topics` is there to make one copy differ from another in substance. */
function at(iso: string, topics = 0): Progress {
  return { ...emptyProgress(), newTopicsIntroduced: topics, updatedAt: iso };
}

function b64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

/**
 * A contents API just real enough to serve a file and take a commit.
 *
 * The sha handshake is modelled, because it is half the defence: a tab that has
 * been open a while holds one, and a remote that moved underneath it answers
 * the next PUT with a 409 rather than accepting it. `sha` says which version
 * this file is, so a second `stubApi` call stands for another device having
 * pushed in the meantime.
 */
function stubApi(file: Progress | null, sha = "s") {
  let state = file ? { sha, body: file } : null;
  const puts: Progress[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        if (!state) return new Response("", { status: 404 });
        return Response.json({ sha: state.sha, content: b64(JSON.stringify(state.body)) });
      }
      const sent = JSON.parse(String(init?.body)) as { content: string; sha?: string };
      if (state && sent.sha !== state.sha) {
        return new Response("sha mismatch", { status: 409 });
      }
      const body = JSON.parse(atob(sent.content)) as Progress;
      state = { sha: `${state?.sha ?? "s"}+`, body };
      puts.push(body);
      return Response.json({ content: { sha: state.sha } });
    }),
  );
  return puts;
}

/** This device: what is on it, and what it last agreed with GitHub about. */
function device(local: Progress | null, marker?: { pushedAt: string; remoteAt: string }) {
  localStorage.clear();
  if (local) localStorage.setItem(PROGRESS_KEY, JSON.stringify(local));
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ token: "t", owner: "me", repo: "r", path: "p.json", branch: "main" }),
  );
  if (marker) localStorage.setItem(SYNCED_KEY, JSON.stringify(marker));
}

/** They agreed on this one copy, which is the ordinary state of a device. */
const agreed = (at: string) => ({ pushedAt: at, remoteAt: at });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

/** Let anything the gate released actually get a turn to run. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe("the startup check", () => {
  it("takes what the phone pushed, without asking", async () => {
    // The ordinary morning. Asking about it is how people learn to dismiss the
    // question that counts.
    device(at(MON, 3), agreed(MON));
    stubApi(at(TUE, 9));
    expect(await new SyncingStorage().checkRemote()).toEqual({
      kind: "adopt",
      remote: expect.objectContaining({ newTopicsIntroduced: 9 }),
    });
  });

  it("asks when both have been studied since they last agreed", async () => {
    device(at(TUE, 5), agreed(MON));
    stubApi(at(WED, 9));
    expect((await new SyncingStorage().checkRemote()).kind).toBe("diverged");
  });

  it("adopts a copy stamped earlier than this device's", async () => {
    // The defect, as the check saw it. This laptop was opened on Tuesday, which
    // stamped it Tuesday without a question being answered; the phone pushed on
    // Monday and holds the week's work. Later stamp, less study — so under the
    // old rule the check found "nothing to do" and the laptop pushed over it.
    device(at(TUE, 3), { pushedAt: TUE, remoteAt: WED });
    stubApi(at(MON, 9));
    expect((await new SyncingStorage().checkRemote()).kind).toBe("adopt");
  });

  it("has nothing to do when GitHub holds what this device put there", async () => {
    device(at(TUE, 3), agreed(MON));
    stubApi(at(MON, 3));
    expect(await new SyncingStorage().checkRemote()).toEqual({ kind: "current" });
  });
});

describe("the push", () => {
  it("carries what this device last saw, so a refusal is possible at all", async () => {
    device(at(TUE, 3), agreed(MON));
    stubApi(at(MON, 3));
    const store = new SyncingStorage();
    await store.checkRemote();
    await store.saveNow(at(WED, 4));
    expect(store.currentState().kind).toBe("idle");
  });

  it("refuses mid-session, when the startup check is long over", async () => {
    // The check runs once and a session runs for an hour. This device agreed
    // with GitHub at nine, the phone pushed at five past, and the grade given
    // at ten past is stamped later than either — so the clock waved it through
    // and the phone's five minutes went under it without a word.
    device(at("2026-01-06T09:00:00.000Z", 3), agreed("2026-01-06T09:00:00.000Z"));
    const store = new SyncingStorage();
    stubApi(at("2026-01-06T09:00:00.000Z", 3));
    await store.checkRemote(); // clean: GitHub holds what we put there

    const behind: Progress[] = [];
    store.onBehind((remote) => behind.push(remote));
    // The phone pushes at five past, which moves the sha this tab is holding.
    const puts = stubApi(at("2026-01-06T09:05:00.000Z", 9), "phone");
    await store.saveNow(at("2026-01-06T09:10:00.000Z", 4));

    expect(puts).toHaveLength(0);
    expect(store.currentState().kind).toBe("behind");
    // And it is a question, not a status line: the copy it refused for comes
    // back so the app can show what it would be choosing between.
    expect(behind).toHaveLength(1);
    expect(behind[0]?.newTopicsIntroduced).toBe(9);
  });

  it("lands when the person says to overwrite", async () => {
    device(at(TUE, 3), agreed(MON));
    const store = new SyncingStorage();
    const puts = stubApi(at(WED, 9));
    await store.saveNow(at(TUE, 4), { force: true });
    expect(puts.map((p) => p.newTopicsIntroduced)).toEqual([4]);
  });

  it("files the remote's own clock when it sent nothing", async () => {
    // Opening the app moves `updatedAt` and nothing else, so the commit is
    // declined — and the remote's stamp stays where it was. Filed as this
    // device's instead, every launch after would believe another device had
    // been at the file, which is the daily question the marker exists to avoid.
    device(at(TUE, 3), agreed(MON));
    stubApi(at(MON, 3));
    const store = new SyncingStorage();
    await store.checkRemote();
    await store.saveNow(at(WED, 3));
    expect(JSON.parse(localStorage.getItem(SYNCED_KEY) ?? "null")).toEqual({
      pushedAt: WED,
      remoteAt: MON,
    });
  });
});

describe("the gate", () => {
  it("does not let a queued push out under a check that says adopt", async () => {
    // The push is armed on a four-second debounce and the check is a network
    // round trip, so on a slow morning the timer fires first and waits on the
    // gate. Released before the app can act on the answer, that continuation
    // ran first and committed the copy the app was on its way to replace.
    device(at(MON, 3), agreed(MON));
    const store = new SyncingStorage();
    const puts = stubApi(at(TUE, 9));

    await store.save(at(MON, 3));
    void store.flush(); // as the debounce would, still waiting on the gate
    const found = await store.checkRemote();
    await settle();

    expect(found.kind).toBe("adopt");
    expect(puts).toHaveLength(0);
    store.seal(); // what adopting does next, and it lets go of the gate
  });

  it("holds it under a check that says ask, too", async () => {
    device(at(TUE, 5), agreed(MON));
    const store = new SyncingStorage();
    const puts = stubApi(at(WED, 9));

    await store.save(at(TUE, 5));
    void store.flush();
    expect((await store.checkRemote()).kind).toBe("diverged");
    await settle();

    expect(puts).toHaveLength(0);
    store.seal();
  });

  it("lets it out again when the question is put down unanswered", async () => {
    // Nothing is decided by dismissing the sheet. The work is still queued and
    // still carries what this device last saw, so it is refused and asks again.
    device(at(TUE, 5), agreed(MON));
    const store = new SyncingStorage();
    stubApi(at(WED, 9));

    await store.save(at(TUE, 5));
    await store.checkRemote();
    store.resolveCheck();
    await store.flush();

    expect(store.currentState().kind).toBe("behind");
  });

  it("opens on a check that could not reach GitHub", async () => {
    // Offline, a 500, an expired token. Study runs against the local copy
    // either way, and the push that follows is refused on its own terms rather
    // than on this check having answered — which is what makes it safe to let
    // go of. It used to be treated as "nothing to do", which let the stale copy
    // straight through.
    device(at(TUE, 3), agreed(MON));
    const store = new SyncingStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    expect(await store.checkRemote()).toEqual({ kind: "current" });

    const puts = stubApi(at(WED, 9));
    await store.saveNow(at(WED, 4));
    expect(puts).toHaveLength(0);
    expect(store.currentState().kind).toBe("behind");
  });
});

describe("leaving the app", () => {
  it("sends what arrived while a push was in the air", async () => {
    // A grade given during a push, and then the app taken away. `flush` turns
    // away anything that finds a push already going, and used to leave it
    // there: nobody looked at that queue again.
    device(null, agreed(MON));
    const store = new SyncingStorage();
    store.resolveCheck(); // the startup check, already answered
    const puts = stubApi(null);

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

    const pushing = store.saveNow(at(TUE, 1));
    await arrived;
    await store.save(at(WED, 2));
    release();
    await pushing;

    expect(puts.map((p) => p.newTopicsIntroduced)).toEqual([1, 2]);
  });
});
