import { describe, expect, it } from "vitest";
import {
  MAX_GAP,
  MIN_GAP,
  begin,
  countAnswer,
  parse,
  pickTarget,
  serialize,
  type Cadence,
} from "./cadence.js";

describe("pickTarget", () => {
  it("covers both ends of the range and nothing outside it", () => {
    expect(pickTarget(() => 0)).toBe(MIN_GAP);
    expect(pickTarget(() => 0.999999)).toBe(MAX_GAP);
    for (let i = 0; i < 500; i++) {
      const t = pickTarget();
      expect(t).toBeGreaterThanOrEqual(MIN_GAP);
      expect(t).toBeLessThanOrEqual(MAX_GAP);
    }
  });
});

describe("countAnswer", () => {
  it("stays quiet until the target, then fires exactly once", () => {
    let c = begin(() => 0); // target = MIN_GAP
    const fired: number[] = [];
    for (let n = 1; n <= MIN_GAP; n++) {
      const r = countAnswer(c, () => 0);
      c = r.cadence;
      if (r.fire) fired.push(n);
    }
    expect(fired).toEqual([MIN_GAP]);
  });

  it("starts a fresh stretch after firing", () => {
    let c: Cadence = { seen: MIN_GAP - 1, target: MIN_GAP };
    const r = countAnswer(c, () => 0.999999);
    expect(r.fire).toBe(true);
    expect(r.cadence.seen).toBe(0);
    expect(r.cadence.target).toBe(MAX_GAP);
  });

  it("never lets two bursts land closer than MIN_GAP apart", () => {
    let c = begin();
    let sinceLast = 0;
    const gaps: number[] = [];
    for (let n = 0; n < 4000; n++) {
      sinceLast++;
      const r = countAnswer(c);
      c = r.cadence;
      if (r.fire) {
        gaps.push(sinceLast);
        sinceLast = 0;
      }
    }
    expect(gaps.length).toBeGreaterThan(100);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MIN_GAP);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(MAX_GAP);
  });
});

describe("parse", () => {
  it("treats an absent or unreadable store as a fresh stretch", () => {
    for (const raw of [null, "", "not json", "[1,2,3]", "null"]) {
      const c = parse(raw, () => 0);
      expect(c).toEqual({ seen: 0, target: MIN_GAP });
    }
  });

  it("clamps a target from outside the range instead of trusting it", () => {
    // A huge target would switch the feature off silently, which is the one
    // failure a student would never think to report.
    expect(parse(JSON.stringify({ seen: 3, target: 10000 })).target).toBe(MAX_GAP);
    expect(parse(JSON.stringify({ seen: 3, target: 1 })).target).toBe(MIN_GAP);
    expect(parse(JSON.stringify({ seen: -8, target: 12 })).seen).toBe(0);
  });

  it("round-trips what it wrote", () => {
    const c: Cadence = { seen: 7, target: 14 };
    expect(parse(serialize(c))).toEqual(c);
  });
});
