import { emptyProgress, type Progress } from "./types.js";

/**
 * Make an unknown object safe to run the engine against.
 *
 * `parseProfile` validates a hand-written config exhaustively and rejects an
 * unknown key. The **student's** file — the one that genuinely cannot be
 * recreated — went through `JSON.parse(...) as Progress` on all three storage
 * paths, and the cast is a claim nobody checks. A file with `topicCards: null`
 * parses, satisfies the type at compile time, and crashes on the first
 * `Object.entries` inside `next()`; the app then opens to a stack trace with
 * the file still on the device and no way in.
 *
 * **Repair, not reject.** The `Session` constructor already fills in fields a
 * file predates, with `??=`, and this is the same errand one step further: a
 * field of the wrong *type* is put back to its default rather than made fatal.
 * That is the same trade `local.ts` makes when a file will not parse at all —
 * losing what cannot be read is bad, refusing to start is worse — and it means
 * a file damaged in one record costs that record instead of the year.
 *
 * What is repaired is reported rather than swallowed, so a caller can say so.
 * Nothing here guesses at content: a broken record becomes an empty one, never
 * an invented one.
 */
export interface Repair {
  progress: Progress;
  /** Field paths that were not the shape they claimed, in the order found. */
  repaired: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function repairProgress(raw: unknown, citationsVersion?: number): Repair {
  const repaired: string[] = [];
  const empty = emptyProgress(citationsVersion);
  if (!isRecord(raw)) return { progress: empty, repaired: ["the file itself"] };

  const out = { ...empty, ...raw } as Record<string, unknown>;

  /** A field that must be an object keyed by topic or card id. */
  const record = (key: string) => {
    if (out[key] !== undefined && !isRecord(out[key])) {
      repaired.push(key);
      out[key] = {};
    }
  };
  for (const key of [
    "topicCards",
    "vocabCards",
    "sentenceCards",
    "seenTests",
    "testCycles",
    "attempts",
  ]) {
    record(key);
  }

  // The two fields that are lists rather than records. A non-array here would
  // take `.includes` on the first star or die lookup; a non-string inside one
  // can never match a section id, so it is dropped rather than kept as dead
  // weight.
  for (const key of ["starred", "noRoll"]) {
    const list = out[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      repaired.push(key);
      out[key] = [];
    } else if (list.some((id) => typeof id !== "string")) {
      repaired.push(key);
      out[key] = list.filter((id) => typeof id === "string");
    }
  }

  // The trail is the one record whose *values* are arrays, and a value that is
  // not one takes the same walk through `coverage()` as the rest.
  if (isRecord(out.attempts)) {
    for (const [id, list] of Object.entries(out.attempts)) {
      if (!Array.isArray(list)) {
        repaired.push(`attempts.${id}`);
        delete (out.attempts as Record<string, unknown>)[id];
      }
    }
  }
  if (isRecord(out.seenTests)) {
    for (const [id, list] of Object.entries(out.seenTests)) {
      if (!Array.isArray(list)) {
        repaired.push(`seenTests.${id}`);
        delete (out.seenTests as Record<string, unknown>)[id];
      }
    }
  }

  // `updatedAt` decides which of two devices wins a sync, so a value that is
  // not a date string is worse than a missing one: it compares as a string
  // against real ISO timestamps and can win.
  if (typeof out.updatedAt !== "string" || Number.isNaN(Date.parse(out.updatedAt))) {
    repaired.push("updatedAt");
    out.updatedAt = empty.updatedAt;
  }

  for (const key of ["version", "newTopicsIntroduced", "citationsVersion"]) {
    if (out[key] !== undefined && typeof out[key] !== "number") {
      repaired.push(key);
      out[key] = empty[key as keyof Progress];
    }
  }

  // `null` is a meaning here — no run and no round in flight — so only a
  // wrong-typed value is repaired, never an absent one.
  for (const key of ["openRound", "practise"]) {
    if (out[key] !== undefined && out[key] !== null && !isRecord(out[key])) {
      repaired.push(key);
      out[key] = null;
    }
  }

  /*
   * The rounds put down take two checks rather than the one above, being a
   * record of records: a wrong-typed container costs both slots, a wrong-typed
   * slot costs only its own.
   *
   * Absent is the meaning here — nothing put down — so an absent field is left
   * absent rather than filled in with an empty object, and a broken one is
   * deleted rather than nulled. That is the difference from `openRound`, where
   * `null` is itself a value the engine writes.
   */
  if (out.suspended !== undefined) {
    if (!isRecord(out.suspended)) {
      repaired.push("suspended");
      delete out.suspended;
    } else {
      const slots = out.suspended as Record<string, unknown>;
      for (const mode of ["review", "explore"]) {
        if (slots[mode] !== undefined && !isRecord(slots[mode])) {
          repaired.push(`suspended.${mode}`);
          delete slots[mode];
        }
      }
    }
  }

  return { progress: out as unknown as Progress, repaired };
}
