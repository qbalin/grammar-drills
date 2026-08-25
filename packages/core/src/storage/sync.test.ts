import { describe, expect, it } from "vitest";
import { emptyProgress, type Progress } from "../types.js";
import { hasUnsent, readSyncedAt, remoteMoved, triage } from "./sync.js";

const MON = "2026-01-05T21:00:00.000Z";
const TUE = "2026-01-06T09:00:00.000Z";
const WED = "2026-01-07T09:00:00.000Z";

/**
 * A copy with a clock and some study in it.
 *
 * `work` is what makes two copies different, and it defaults to the clock so
 * that two stamps mean two files. It has to be said separately because the one
 * thing `triage` will not do is decide from the clock: the cases below are
 * about copies that differ, and a helper that built them all out of
 * `emptyProgress()` would hand it files that are identical but for `updatedAt`
 * — which is the one case it now settles by itself, and a different test.
 */
function progress(updatedAt: string, work: string = updatedAt): Progress {
  return { ...emptyProgress(), updatedAt, starred: [`bn-020-${work}`] };
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
    expect(triage(progress(MON), progress(MON), agreed)).toEqual({ kind: "current" });
  });

  it("has nothing to do when only this device has moved", () => {
    expect(triage(progress(TUE), progress(MON), agreed)).toEqual({ kind: "current" });
  });

  it("takes a copy this device has not seen, when it has nothing of its own", () => {
    // The ordinary morning: studied on the phone, opened on the laptop. Asking
    // about it teaches people to dismiss the question that counts.
    expect(triage(progress(MON), progress(TUE), agreed)).toEqual({
      kind: "adopt",
      remote: progress(TUE),
    });
  });

  it("asks when both have moved since they last agreed", () => {
    expect(triage(progress(TUE), progress(WED), agreed)).toEqual({
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
    expect(triage(progress(TUE), null, null)).toEqual({ kind: "current" });
  });

  it("asks a device that has work but has never synced", () => {
    // Its first push would be over somebody else's file.
    expect(triage(progress(TUE), progress(MON), null)).toEqual({
      kind: "diverged",
      remote: progress(MON),
    });
  });

  describe("and never about two copies that say the same thing", () => {
    it("settles a device whose own push landed without its marker", () => {
      // One device, no second one anywhere. The push on the way out of the app
      // landed and the page went away before the marker could be written down,
      // so the remote has "moved" — it holds this device's own work — and the
      // device has "unsent" work, because opening the app moved its clock. Read
      // from lineage that is `diverged`, and a student who has never owned a
      // second device is asked which of two identical files to keep.
      // Tuesday's work went up on Tuesday; the marker still says Monday. The
      // app was opened again on Wednesday, which moved the clock and nothing
      // else, so both copies hold Tuesday's study and neither holds any other.
      expect(triage(progress(WED, TUE), progress(TUE), agreed)).toEqual({
        kind: "agreed",
        remote: progress(TUE),
      });
    });

    it("says so rather than staying quiet, because the marker needs mending", () => {
      // `agreed` is `current` with a job attached: left unrecorded, the same
      // question comes back at the next launch, and the one after that.
      expect(triage(progress(WED, TUE), progress(TUE), agreed).kind).not.toBe("current");
    });

    it("still asks when the two copies really do differ", () => {
      expect(triage(progress(WED), progress(TUE), agreed).kind).toBe("diverged");
    });
  });

  describe("never by which clock is later", () => {
    it("adopts a copy stamped earlier than this device's", () => {
      // The case the old rule could not see. The laptop was opened on Tuesday,
      // which stamped it Tuesday without a question being answered; the phone
      // pushed on Monday and holds the week's real work. Later stamp, less
      // study — so the stamps are not what decides it.
      expect(triage(progress(TUE), progress(MON), { pushedAt: TUE, remoteAt: WED })).toEqual({
        kind: "adopt",
        remote: progress(MON),
      });
    });

    it("stays quiet about a copy stamped later that it put there itself", () => {
      expect(triage(progress(MON), progress(WED), { pushedAt: MON, remoteAt: WED })).toEqual({
        kind: "current",
      });
    });
  });
});
