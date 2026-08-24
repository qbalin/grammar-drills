import { describe, expect, it } from "vitest";
import { emptyProgress, type Progress } from "../types.js";
import { hasUnsent, readSyncedAt, remoteMoved, triage } from "./sync.js";

const MON = "2026-01-05T21:00:00.000Z";
const TUE = "2026-01-06T09:00:00.000Z";
const WED = "2026-01-07T09:00:00.000Z";

function progress(updatedAt: string): Progress {
  return { ...emptyProgress(), updatedAt };
}

describe("the marker", () => {
  it("reads a pair back", () => {
    expect(readSyncedAt(JSON.stringify({ pushedAt: MON, remoteAt: TUE }))).toEqual({
      pushedAt: MON,
      remoteAt: TUE,
    });
  });

  it("reads a file written before there were two of them", () => {
    // A bare `updatedAt`, which after a real push was both values at once.
    expect(readSyncedAt(MON)).toEqual({ pushedAt: MON, remoteAt: MON });
  });

  it("has nothing to say about a device that has never synced", () => {
    expect(readSyncedAt(null)).toBeNull();
    expect(readSyncedAt("")).toBeNull();
  });

  it("would rather know nothing than half of it", () => {
    // Half a marker is worse than none: it would answer one of the two
    // questions confidently and the other by accident.
    expect(readSyncedAt(JSON.stringify({ pushedAt: MON }))).toBeNull();
  });

  it("answers its two questions from its two halves", () => {
    const marker = { pushedAt: TUE, remoteAt: MON };
    expect(remoteMoved(marker, MON)).toBe(false);
    expect(remoteMoved(marker, WED)).toBe(true);
    expect(hasUnsent(marker, TUE)).toBe(false);
    expect(hasUnsent(marker, WED)).toBe(true);
  });

  it("counts everything as unseen when there is no marker", () => {
    expect(remoteMoved(null, MON)).toBe(true);
    expect(hasUnsent(null, MON)).toBe(true);
  });
});

describe("the startup triage", () => {
  const agreed = { pushedAt: MON, remoteAt: MON };

  it("has nothing to do when neither copy has moved", () => {
    expect(triage(MON, progress(MON), agreed)).toEqual({ kind: "current" });
  });

  it("has nothing to do when only this device has moved", () => {
    expect(triage(TUE, progress(MON), agreed)).toEqual({ kind: "current" });
  });

  it("takes a copy this device has not seen, when it has nothing of its own", () => {
    // The ordinary morning: studied on the phone, opened on the laptop. Asking
    // about it teaches people to dismiss the question that counts.
    expect(triage(MON, progress(TUE), agreed)).toEqual({
      kind: "adopt",
      remote: progress(TUE),
    });
  });

  it("asks when both have moved since they last agreed", () => {
    expect(triage(TUE, progress(WED), agreed)).toEqual({
      kind: "diverged",
      remote: progress(WED),
    });
  });

  it("takes whatever is there when this device has no progress at all", () => {
    expect(triage(null, progress(MON), null)).toEqual({
      kind: "adopt",
      remote: progress(MON),
    });
  });

  it("has nothing to do when there is no remote file yet", () => {
    expect(triage(TUE, null, null)).toEqual({ kind: "current" });
  });

  it("asks a device that has work but has never synced", () => {
    // Its first push would be over somebody else's file.
    expect(triage(TUE, progress(MON), null)).toEqual({
      kind: "diverged",
      remote: progress(MON),
    });
  });

  describe("never by which clock is later", () => {
    it("adopts a copy stamped earlier than this device's", () => {
      // The case the old rule could not see. The laptop was opened on Tuesday,
      // which stamped it Tuesday without a question being answered; the phone
      // pushed on Monday and holds the week's real work. Later stamp, less
      // study — so the stamps are not what decides it.
      expect(triage(TUE, progress(MON), { pushedAt: TUE, remoteAt: WED })).toEqual({
        kind: "adopt",
        remote: progress(MON),
      });
    });

    it("stays quiet about a copy stamped later that it put there itself", () => {
      expect(triage(MON, progress(WED), { pushedAt: MON, remoteAt: WED })).toEqual({
        kind: "current",
      });
    });
  });
});
