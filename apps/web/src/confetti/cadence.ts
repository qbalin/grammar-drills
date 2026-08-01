/**
 * When the confetti fires.
 *
 * Every ten to twenty answers, whatever the grade was. Deliberately not tied
 * to getting things right: this is a study session, the student who keeps
 * pressing "again" is the one working hardest, and rewarding only the easy
 * grades would reward the easy topics.
 *
 * The gap is random inside that range rather than a flat fifteen, so the burst
 * cannot be counted towards. An Easter egg that arrives on schedule is a
 * progress bar.
 *
 * Nothing here knows a language, and nothing here draws: this is the counter
 * alone, which is why it is the part with tests.
 */

/** Fewest answers between one burst and the next. */
export const MIN_GAP = 10;
/** Most answers between one burst and the next. */
export const MAX_GAP = 20;

export type Cadence = {
  /** Answers given since the last burst. */
  seen: number;
  /** Answers this stretch wants before the next burst. */
  target: number;
};

/** A gap in `[MIN_GAP, MAX_GAP]`, both ends included. */
export function pickTarget(rand: () => number = Math.random): number {
  return MIN_GAP + Math.floor(rand() * (MAX_GAP - MIN_GAP + 1));
}

/** A fresh stretch, with its own target. */
export function begin(rand: () => number = Math.random): Cadence {
  return { seen: 0, target: pickTarget(rand) };
}

/**
 * One answer, graded. Returns the cadence to keep and whether this answer is
 * the one that earns a burst.
 */
export function countAnswer(
  cadence: Cadence,
  rand: () => number = Math.random,
): { cadence: Cadence; fire: boolean } {
  const seen = cadence.seen + 1;
  if (seen < cadence.target) return { cadence: { seen, target: cadence.target }, fire: false };
  return { cadence: begin(rand), fire: true };
}

/**
 * Read a stored cadence, tolerating anything at all.
 *
 * This is a decoration: a corrupt value, a value written by an older build, or
 * a storage that is switched off must cost the student nothing more than one
 * mistimed burst. So every unusable input becomes a fresh stretch rather than
 * an error.
 */
export function parse(raw: string | null, rand: () => number = Math.random): Cadence {
  if (!raw) return begin(rand);
  try {
    const v = JSON.parse(raw) as Partial<Cadence>;
    const target = Number(v?.target);
    const seen = Number(v?.seen);
    if (!Number.isFinite(target) || !Number.isFinite(seen)) return begin(rand);
    // A target from outside the range means a build with different bounds, or
    // a hand-edited store. Clamp rather than trust it: a target of 10000 would
    // switch the feature off silently, which is the one failure nobody would
    // think to report.
    return {
      seen: Math.max(0, Math.floor(seen)),
      target: Math.min(MAX_GAP, Math.max(MIN_GAP, Math.floor(target))),
    };
  } catch {
    return begin(rand);
  }
}

export function serialize(cadence: Cadence): string {
  return JSON.stringify(cadence);
}
