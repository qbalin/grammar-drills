import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  asDefaults,
  asThrows,
  enabledGroups,
  loadGroups,
  loadKnobs,
  saveGroups,
  saveKnobs,
  type Store,
} from "./bench.js";

/** A store over a plain object, which is all any of this needs. */
function fake(seed: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** A store that refuses everything, the way a locked-down browser does. */
const shut: Store = {
  getItem: () => null,
  setItem: () => {
    throw new Error("nope");
  },
};

/**
 * A tuning session is worth keeping across the reload that follows editing a
 * path, but not at the cost of a burst that will not fire because something
 * unreadable got into storage.
 */
describe("loadKnobs", () => {
  it("starts from the shipped defaults with nothing stored", () => {
    expect(loadKnobs(fake())).toEqual(DEFAULTS);
  });

  it("takes back the values it wrote", () => {
    const store = fake();
    const tuned = { ...DEFAULTS, size: 21, originY: 0.4 };
    saveKnobs(store, tuned);
    expect(loadKnobs(store)).toEqual(tuned);
  });

  it("keeps the default for a knob that was not stored, and drops one that no longer exists", () => {
    const loaded = loadKnobs(fake({ "confetti:bench": JSON.stringify({ size: 21, gone: 5 }) }));
    expect(loaded.size).toBe(21);
    expect(loaded.pieces).toBe(DEFAULTS.pieces);
    expect(loaded).not.toHaveProperty("gone");
  });

  it("falls back rather than throwing on anything unreadable", () => {
    for (const raw of ["", "{", "null", '"a string"', "[]", '{"size":"wide"}']) {
      expect(loadKnobs(fake({ "confetti:bench": raw })).size).toBe(DEFAULTS.size);
    }
  });
});

const THROWS = [["gladius"], ["gladius", "scutum"], ["pugio"]];
const KNOWN = new Set(["gladius", "scutum", "pugio"]);

describe("loadGroups", () => {
  it("seeds from the pack the first time", () => {
    expect(loadGroups(fake(), THROWS, KNOWN)).toEqual([
      { shapes: ["gladius"], on: true },
      { shapes: ["gladius", "scutum"], on: true },
      { shapes: ["pugio"], on: true },
    ]);
  });

  it("takes back what it saved, including what was switched off", () => {
    const store = fake();
    const groups = [
      { shapes: ["gladius", "scutum"], on: true },
      { shapes: ["pugio"], on: false },
    ];
    saveGroups(store, groups);
    expect(loadGroups(store, THROWS, KNOWN)).toEqual(groups);
  });

  /**
   * The pack is the file that gets edited, and the bench outlives any version
   * of it. A group naming a shape that has been renamed away has to lose that
   * name rather than become a row that cannot be thrown.
   */
  it("drops a name the pack no longer has, and the group if nothing is left", () => {
    const store = fake({
      "confetti:bench:groups": JSON.stringify([
        { shapes: ["gladius", "ghost"], on: true },
        { shapes: ["ghost"], on: true },
      ]),
    });
    expect(loadGroups(store, THROWS, KNOWN)).toEqual([{ shapes: ["gladius"], on: true }]);
  });

  it("re-seeds rather than showing nothing when everything stored has gone", () => {
    const store = fake({
      "confetti:bench:groups": JSON.stringify([{ shapes: ["ghost"], on: true }]),
    });
    expect(loadGroups(store, THROWS, KNOWN)).toHaveLength(THROWS.length);
  });

  it("re-seeds rather than throwing on anything unreadable", () => {
    for (const raw of ["{", '"a string"', "null", '[{"shapes":"gladius"}]']) {
      expect(loadGroups(fake({ "confetti:bench:groups": raw }), THROWS, KNOWN)).toHaveLength(
        THROWS.length,
      );
    }
  });
});

describe("enabledGroups", () => {
  /**
   * Null is not "none" — it is "this browser has never seen the bench", which
   * is every browser but one, and which must get the pack's own throws.
   */
  it("says nothing at all when there is no bench", () => {
    expect(enabledGroups(fake(), KNOWN)).toBeNull();
  });

  it("gives only the live groups once there is one", () => {
    const store = fake();
    saveGroups(store, [
      { shapes: ["gladius", "scutum"], on: true },
      { shapes: ["pugio"], on: false },
    ]);
    expect(enabledGroups(store, KNOWN)).toEqual([["gladius", "scutum"]]);
  });

  /**
   * Curated down to nothing means throw nothing. Falling back to the whole pack
   * here would make every toggle look broken.
   */
  it("gives an empty list, not the pack, when everything is switched off", () => {
    const store = fake();
    saveGroups(store, [{ shapes: ["pugio"], on: false }]);
    expect(enabledGroups(store, KNOWN)).toEqual([]);
  });
});

describe("what gets copied out", () => {
  it("writes a defaults block that names every knob", () => {
    const source = asDefaults({ ...DEFAULTS, size: 21 });
    expect(source).toContain("size: 21,");
    for (const key of Object.keys(DEFAULTS)) expect(source).toContain(`${key}:`);
    expect(source.startsWith("export const DEFAULTS = {")).toBe(true);
  });

  /**
   * This is the only way a set curated here reaches the pack, so it has to
   * paste in as valid source and carry only what is live.
   */
  it("writes a throws block holding the live groups and no others", () => {
    const source = asThrows([
      { shapes: ["gladius", "scutum"], on: true },
      { shapes: ["pugio"], on: false },
    ]);
    expect(source).toContain('["gladius", "scutum"],');
    expect(source).not.toContain("pugio");
    expect(source.trim().startsWith("throws: [")).toBe(true);
    expect(source.trim().endsWith("],")).toBe(true);
  });
});

/** A locked-down browser costs a tuning session, not a working app. */
describe("a storage that refuses", () => {
  it("neither throws on save nor loses the defaults on load", () => {
    expect(() => saveKnobs(shut, DEFAULTS)).not.toThrow();
    expect(() => saveGroups(shut, [])).not.toThrow();
    expect(loadKnobs(shut)).toEqual(DEFAULTS);
  });
});
