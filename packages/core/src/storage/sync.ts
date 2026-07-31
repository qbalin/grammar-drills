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

/** How long to sit on a change before committing it. */
export const PUSH_DELAY_MS = 4000;

/**
 * Where the mirror stands. `off` is "no repo configured", which is different
 * from `idle` with nothing to push.
 */
export type SyncState =
  | { kind: "off" }
  | { kind: "idle"; at?: string }
  | { kind: "pushing" }
  | { kind: "offline" }
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
    case "error":
      return `sync failed: ${state.message}`;
  }
}
