/**
 * What the author's bench has been set to.
 *
 * Two things live here: the knobs a burst is thrown with, and the groups it may
 * draw from. Both are read by the renderer, which fires them, and by the
 * playground, which edits them — and the renderer must not import the
 * playground, which pulls in the pack this one replaced. So they meet here.
 *
 * None of it is a student's concern. A student has nothing under these keys and
 * gets the pack's own throws and the shipped defaults, which is exactly what
 * they got before the bench existed.
 *
 * Everything here is pure and takes its storage as an argument, so it can be
 * tested without a DOM pretending to have one.
 */

/**
 * How a burst behaves when nobody has said otherwise.
 *
 * Gathered into one object rather than left as loose constants because the
 * playground sets every one of them, and a knob whose default lives somewhere
 * else is a knob that drifts. This is what "copy as defaults" writes back.
 */
export const DEFAULTS = {
  /** How many pieces a burst throws. */
  pieces: 180,
  /** Piece size in CSS pixels, before the per-piece spread. */
  size: 34,
  /** Half-width of the size spread, as a fraction: 0.65 is 35%–165%. */
  sizeSpread: 0.65,
  /** Where the burst starts, down the viewport. */
  originY: 0.95,
  /** How wide it starts, as a fraction of viewport width. */
  spreadX: 1.2,
  /** Upward launch speed in CSS pixels per frame, before its own jitter. */
  speed: 15,
  /** Gravity, per frame, in CSS pixels. */
  gravity: 0.5,
  /** Half-width of the spin, in radians per frame. */
  spin: 0.2,
  /** How far down the viewport a piece must fall before it begins to fade. */
  fadeAt: 1.5,
  /**
   * Outline width, in the 24-wide box the shapes are drawn in, or 0 for none.
   * A box unit rather than a pixel so the line keeps its weight relative to the
   * shape as the size slider moves.
   */
  outline: 0,
};

export type Knobs = typeof DEFAULTS;

/** A throw group as the bench holds it: the shapes, and whether it is live. */
export type Group = { shapes: string[]; on: boolean };

const KNOBS_KEY = "confetti:bench";
const GROUPS_KEY = "confetti:bench:groups";

/** Storage, narrowed to what this needs and allowed to be absent. */
export type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** The browser's. It may not exist, and it may refuse — see `read`/`write`. */
export function browserStore(): Store {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  };
}

/**
 * Storage is allowed to fail, and a bench is a decoration.
 *
 * Guarded here rather than only inside `browserStore`, because a store that
 * throws would otherwise take out the React effect that saves on every slider
 * move — losing the whole Settings sheet over a full disk. A refused write
 * costs a tuning session and nothing else.
 */
function read(store: Store, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store: Store, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Storage full or blocked. The bench still works for this session.
  }
}

/** Where the sliders were left, ignoring anything that is no longer a knob. */
export function loadKnobs(store: Store): Knobs {
  const raw = read(store, KNOBS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if (!saved || typeof saved !== "object") return DEFAULTS;
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof Knobs)[]) {
      const v = Number(saved[key]);
      if (Number.isFinite(v)) out[key] = v;
    }
    return out;
  } catch {
    return DEFAULTS;
  }
}

export function saveKnobs(store: Store, knobs: Knobs): void {
  write(store, KNOBS_KEY, JSON.stringify(knobs));
}

/**
 * The groups the bench holds, seeded from the pack the first time.
 *
 * `known` is the set of shapes the pack actually has. A stored group naming a
 * shape that has since been renamed or deleted loses that name, and a group
 * left with nothing is dropped rather than kept as a row that cannot be thrown.
 * This file outlives any particular version of the pack it describes, and the
 * pack is the one that gets edited.
 */
export function loadGroups(store: Store, packThrows: string[][], known: Set<string>): Group[] {
  const raw = read(store, GROUPS_KEY);
  if (!raw) return seed(packThrows, known);
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return seed(packThrows, known);
    const groups: Group[] = [];
    for (const group of saved) {
      const shapes = (Array.isArray(group?.shapes) ? group.shapes : [])
        .filter((s: unknown): s is string => typeof s === "string" && known.has(s));
      if (shapes.length) groups.push({ shapes, on: group?.on !== false });
    }
    return groups.length ? groups : seed(packThrows, known);
  } catch {
    return seed(packThrows, known);
  }
}

function seed(packThrows: string[][], known: Set<string>): Group[] {
  return packThrows
    .map((shapes) => ({ shapes: shapes.filter((s) => known.has(s)), on: true }))
    .filter((group) => group.shapes.length);
}

export function saveGroups(store: Store, groups: Group[]): void {
  write(store, GROUPS_KEY, JSON.stringify(groups));
}

/**
 * What a burst may draw from, or null for "the bench has nothing to say".
 *
 * Null rather than the pack's own throws, so the renderer can tell the
 * difference between a bench that has been curated down to nothing — which
 * should throw nothing rather than silently throw everything — and a browser
 * that has never seen the bench, which should throw what the pack ships.
 */
export function enabledGroups(store: Store, known: Set<string>): string[][] | null {
  if (!read(store, GROUPS_KEY)) return null;
  return loadGroups(store, [], known)
    .filter((group) => group.on)
    .map((group) => group.shapes);
}

/**
 * The sliders as the source they would be pasted into. Tuning a burst and then
 * squinting at ten slider labels to copy the numbers by hand is how a good
 * setting gets lost.
 */
export function asDefaults(knobs: Knobs): string {
  const body = (Object.keys(DEFAULTS) as (keyof Knobs)[])
    .map((key) => `  ${key}: ${knobs[key]},`)
    .join("\n");
  return `export const DEFAULTS = {\n${body}\n};`;
}

/**
 * The live groups as the `throws` array they would be pasted into, so a set
 * curated on the bench can actually reach the pack. Without this the curation
 * only ever exists in one browser.
 */
export function asThrows(groups: Group[]): string {
  const body = groups
    .filter((group) => group.on)
    .map((group) => `    [${group.shapes.map((s) => JSON.stringify(s)).join(", ")}],`)
    .join("\n");
  return `  throws: [\n${body}\n  ],`;
}
