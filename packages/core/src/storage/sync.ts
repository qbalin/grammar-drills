/**
 * What both apps' GitHub mirrors agree about.
 *
 * The web app grew a mirror first and the terminal had none, so when the
 * terminal got one there were two choices: copy the delay, the state machine
 * and the error wording, or share them. Copied, they drift — and the way they
 * drift is that one app tells you the token was rejected and the other shows a
 * raw `401` from `fetch`.
 *
 * What stays in the apps is the part that genuinely differs: the browser knows
 * `navigator.onLine` and `visibilitychange`, and the terminal knows `SIGINT`.
 * How long to sit on a change, and what an HTTP failure means to a person, are
 * the same question in both.
 */

import type { Progress } from "../types.js";
import { RemoteMovedError, sameProgress } from "./github.js";

/** How long to sit on a change before committing it. */
export const PUSH_DELAY_MS = 4000;

/**
 * When this device last agreed with the remote, from both sides.
 *
 * Two fields rather than one, and the difference between them is the whole
 * reason this is not a string. `pushedAt` answers "does this device hold work
 * the remote has not been told about"; `remoteAt` answers "does the remote hold
 * work this device has never seen". They are usually the same value — a push
 * puts this copy up there, an adopt brings that copy down here — and they come
 * apart on the one path that changes a device without changing the remote: a
 * commit whose content already matched, which `GitHubStorage` declines to send.
 * Kept as one field, that no-op would leave every following launch believing
 * the remote had moved, and the question that should be rare would be the one
 * asked every morning.
 *
 * Neither is ever compared for *order*. That is the mistake this replaced: a
 * timestamp says when a device last wrote, not how much study it holds, and
 * opening the app is a write. See `remoteIsUnseen` in `github.ts`.
 *
 * It must never travel inside `Progress`: a marker that synced along with the
 * progress would describe whichever device wrote it last, which is precisely
 * the device we are trying to tell ourselves apart from.
 */
export interface SyncedAt {
  /** The local `updatedAt` this device last got onto the remote. */
  pushedAt: string;
  /** What the remote's `updatedAt` was at that moment. */
  remoteAt: string;
}

/**
 * A stored marker, in either shape.
 *
 * Files written before there were two fields hold a bare string: the local
 * `updatedAt` last pushed, which after a real push is also what the remote
 * held. Read as both, that is right — except for a device whose last act was a
 * no-op commit, which costs one needless question, once.
 */
export function readSyncedAt(raw: string | null | undefined): SyncedAt | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const { pushedAt, remoteAt } = parsed as Partial<SyncedAt>;
      if (typeof pushedAt === "string" && typeof remoteAt === "string") {
        return { pushedAt, remoteAt };
      }
      return null;
    }
  } catch {
    /* not JSON, so it is one of the bare strings below */
  }
  return { pushedAt: raw, remoteAt: raw };
}

/** True when the remote holds a copy this device has never agreed with. */
export function remoteMoved(marker: SyncedAt | null, remoteUpdatedAt: string): boolean {
  return marker === null || marker.remoteAt !== remoteUpdatedAt;
}

/** True when this device holds a copy the remote has never been told about. */
export function hasUnsent(marker: SyncedAt | null, localUpdatedAt: string): boolean {
  return marker === null || marker.pushedAt !== localUpdatedAt;
}

/**
 * What the startup check found, once it has resolved everything it can resolve
 * on its own.
 *
 * The four answers are genuinely different errands and only one of them is a
 * question for a person. "Your phone is ahead of your laptop" is ordinary and
 * gets on with it; two devices that have both been studied since they last
 * agreed is a choice nobody else can make.
 *
 * `agreed` is `current` with a job attached: the two copies say the same thing
 * but the marker does not know it, so the caller has to write the marker down
 * before it can go on being `current`. It carries the remote for that, and for
 * nothing else — there is nothing to adopt when the copies already match.
 */
export type StartupCheck =
  | { kind: "current" }
  | { kind: "agreed"; remote: Progress }
  | { kind: "adopt"; remote: Progress }
  | { kind: "diverged"; remote: Progress };

/**
 * Which of the two copies to keep, decided by what would be lost.
 *
 * Four cases, and not one of them asks which clock is later:
 *
 * | remote moved | local unsent | answer |
 * |---|---|---|
 * | no  | no  | `current`  |
 * | no  | yes | `current` — this device pushes |
 * | yes | no  | `adopt` — silently, the ordinary morning |
 * | yes | yes | `diverged` — only a person can say |
 *
 * `local` is the copy as of when the app opened, not the live session: by the
 * time this resolves the app has served a test and written the round down, so
 * `updatedAt` has already moved for reasons that are not work anybody did.
 * Compared against the live copy, every ordinary morning looks like a device
 * with unpushed changes, and the rare question becomes the daily one.
 *
 * A device with no copy at all takes whatever is there, which is how a second
 * device starts. A device that has never synced but holds work is `diverged`:
 * its first push would be over somebody else's file.
 *
 * Ahead of the bottom row, and for the same reason `GitHubStorage.commit` puts
 * its no-op check ahead of its refusal: **two copies that say the same thing
 * have nothing to choose between them, whatever their lineage.** The lineage
 * test is a stand-in for a content test, and it is the wrong answer in one
 * ordinary case on one device — the push that lands as the app is taken away,
 * and dies before the marker can be written down. The remote has then "moved"
 * (it holds this device's own work) and this device has "unsent" work (its
 * clock moved), so a student who has never owned a second device is asked which
 * of two identical files to keep. With the two copies in hand there is no need
 * to guess: compare them.
 */
export function triage(
  local: Progress | null,
  remote: Progress | null,
  marker: SyncedAt | null,
): StartupCheck {
  if (!remote) return { kind: "current" };
  if (local === null) return { kind: "adopt", remote };
  if (!remoteMoved(marker, remote.updatedAt)) return { kind: "current" };
  if (sameProgress(local, remote)) return { kind: "agreed", remote };
  return hasUnsent(marker, local.updatedAt)
    ? { kind: "diverged", remote }
    : { kind: "adopt", remote };
}

/**
 * Where the mirror stands. `off` is "no repo configured", which is different
 * from `idle` with nothing to push.
 */
export type SyncState =
  | { kind: "off" }
  | { kind: "idle"; at?: string }
  | { kind: "pushing" }
  | { kind: "offline" }
  /**
   * Another device is ahead, and this one has work of its own that a plain
   * catch-up would throw away. The push is held rather than failed — nothing is
   * lost, and nothing is decided until a person decides it.
   */
  | { kind: "behind" }
  | { kind: "error"; message: string };

/**
 * An HTTP failure as something a person can act on.
 *
 * `GitHubStorage` throws with the status in the message, which is the right
 * thing for it to do and the wrong thing to put in front of someone: "401" does
 * not say which of the four things they typed was wrong. Each of these maps to
 * a different fix — reissue the token, check the repo name, widen the scope.
 *
 * `online` is passed in rather than read, because the two apps learn it
 * differently and core is not the place that knows how.
 */
export function describeSyncError(err: unknown, online = true): SyncState {
  // Not a failure at all: the push was refused on purpose, because landing it
  // would have overwritten another device. Both apps show it as its own thing.
  if (err instanceof RemoteMovedError) return { kind: "behind" };
  if (!online) return { kind: "offline" };
  const message = err instanceof Error ? err.message : String(err);
  if (/\b401\b/.test(message)) {
    return { kind: "error", message: "GitHub rejected the token." };
  }
  if (/\b404\b/.test(message)) {
    return { kind: "error", message: "Repo or branch not found." };
  }
  if (/\b403\b/.test(message)) {
    return { kind: "error", message: "The token cannot write to that repo." };
  }
  return { kind: "error", message };
}

/** `SyncState` as one line, for a status bar or a startup message. */
export function syncStateLine(state: SyncState): string {
  switch (state.kind) {
    case "off":
      return "not syncing";
    case "idle":
      return state.at ? `synced ${state.at}` : "sync ready";
    case "pushing":
      return "syncing…";
    case "offline":
      return "offline — will sync when the network is back";
    case "behind":
      return "another device is ahead — choose which copy to keep";
    case "error":
      return `sync failed: ${state.message}`;
  }
}
