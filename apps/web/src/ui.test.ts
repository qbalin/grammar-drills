import { describe, expect, it } from "vitest";
import { comesBack, interval, splitCitation, until } from "./ui.js";

/**
 * The two ways of saying when something comes back.
 *
 * `comesBack` used to be one function with the whole sentence in it. The offer
 * at the end of a round needed the same thresholds under a different verb — "it
 * *would* come back in nine days" — so the tail came out as `interval`, and the
 * one thing worth pinning is that nothing about the sentence moved when it did.
 */
describe("interval and comesBack", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const on = (ms: number) => new Date(now.getTime() + ms);

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  /** One date in every branch of the ladder, boundaries included. */
  const ladder: [Date, string][] = [
    [on(0), "in a moment"],
    [on(MINUTE), "in a moment"],
    [on(3 * MINUTE), "in 3 minutes"],
    [on(59 * MINUTE), "in 59 minutes"],
    [on(65 * MINUTE), "in an hour"],
    [on(2 * HOUR), "in 2 hours"],
    [on(23 * HOUR), "in 23 hours"],
    [on(DAY), "tomorrow"],
    [on(9 * DAY), "in 9 days"],
    [on(20 * DAY), "in 3 weeks"],
    [on(90 * DAY), "in 3 months"],
    [on(900 * DAY), "in 2 years"],
  ];

  it("says how long, in words", () => {
    for (const [to, want] of ladder) expect(interval(to, now)).toBe(want);
  });

  it("puts the same tail under the verb, for every branch of the ladder", () => {
    // The property, not a second table of strings: a threshold moved in one and
    // not the other is the failure this exists to catch, and it would be
    // *visible* — the offer is on screen one tap before the promise.
    for (const [to] of ladder) {
      expect(comesBack(to, now)).toBe(`Back ${interval(to, now)}`);
    }
  });

  it("keeps the compact form compact, which is a different job", () => {
    // Read four at a time under four grade buttons on a phone-width row, where
    // "in 9 days" does not fit and is not what is wanted.
    expect(until(now, on(9 * DAY))).toBe("9d");
    expect(until(now, on(3 * MINUTE))).toBe("3m");
    expect(until(now, now)).toBe("now");
  });
});

/**
 * The tail of a citation that is not a word of the language.
 *
 * Half the point is that `head + tag` is the string that came in: the head goes
 * to `Sentence`, which reproduces the spacing it is handed, so a split that ate
 * the space before the bracket would quietly reflow the line it was showing.
 */
describe("splitCitation", () => {
  const cases: [string, string, string][] = [
    // Latin's habit: a gender or a part of speech in brackets at the end.
    ["rosa, rosae (f)", "rosa, rosae ", "(f)"],
    ["aes, aeris (n)", "aes, aeris ", "(n)"],
    ["sum (pron)", "sum ", "(pron)"],
    // No tag at all — a verb's principal parts, and every Greek citation there
    // is. The split is then a no-op and every token is a real word.
    ["sum, esse, fuī", "sum, esse, fuī", ""],
    ["εἰμί, ἔσομαι", "εἰμί, ἔσομαι", ""],
    ["ἵημι, ἥσω, ἧκα, εἷκα", "ἵημι, ἥσω, ἧκα, εἷκα", ""],
    // A bracket that is not at the end is not a tag; nothing is taken off.
    ["ferō (irreg), ferre", "ferō (irreg), ferre", ""],
    // Hand-edited down to nothing but the tag: no head, and so no word to press.
    ["(f)", "", "(f)"],
    ["", "", ""],
  ];

  it("takes the tag off the end, and only off the end", () => {
    for (const [text, head, tag] of cases) {
      expect(splitCitation(text)).toEqual({ head, tag });
    }
  });

  it("puts the string back together, spacing and all", () => {
    for (const [text] of cases) {
      const { head, tag } = splitCitation(text);
      expect(head + tag).toBe(text);
    }
  });
});
