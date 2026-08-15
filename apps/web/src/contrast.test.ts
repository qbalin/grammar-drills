// @vitest-environment node
// This one reads the stylesheet off disk, and the jsdom environment rewrites
// `import.meta.url` to an http URL.
/**
 * Every theme has to be readable, and one of them was not.
 *
 * The palette is designed dark and inverts to warm paper in daylight, so an
 * accent that is a light colour in one theme is a dark one in the other. The
 * primary button did not know that: it filled itself with the accent and wrote
 * its label in a hardcoded near-black tuned for gold. In daylight, in review
 * mode, that was dark text on a dark blue fill at 2.7:1 — which is what a
 * student reported and what `--on-accent` now fixes.
 *
 * A colour is easy to change and a contrast ratio is not obvious by eye, so
 * this reads the real stylesheet rather than a copy of its values, and checks
 * every pair the app actually paints. WCAG AA for body text is 4.5:1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

/**
 * The custom properties of one `:root` block.
 *
 * The dark palette is the first `:root` in the file and the light one is the
 * `:root` inside `@media (prefers-color-scheme: light)`, so taking the first
 * and second blocks in source order is exactly the two themes.
 */
function palette(nth: number): Record<string, string> {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)];
  const body = blocks[nth]?.[1];
  if (!body) throw new Error(`no :root block ${nth} in styles.css`);
  const vars: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    vars[name] = value;
  }
  return vars;
}

const relativeLuminance = (hex: string): number => {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Foreground/background pairs the app really puts together, named for where.
 *
 * Both accent moods are here: `--gold` is the exploring accent, and review mode
 * swaps `--gold`/`--gold-muted` for `--blue`/`--blue-muted` wholesale, so every
 * gold pair has a blue twin that has to hold up just as well.
 */
const PAIRS: [string, string, string][] = [
  [".btn--primary label on the gold fill", "--on-accent", "--gold"],
  [".btn--primary label on the blue fill (review mode)", "--on-accent", "--blue"],
  [".btn--danger label on the red fill", "--ink", "--red"],
  ["accent text on the page", "--gold", "--ink"],
  ["accent text on a raised card", "--gold", "--ink-raised"],
  ["review accent text on the page", "--blue", "--ink"],
  ["review accent text on a raised card", "--blue", "--ink-raised"],
  ["muted accent text (.pager__arrow, .gr-marker)", "--gold-muted", "--ink"],
  ["muted accent text in review mode", "--blue-muted", "--ink"],
  ["muted accent text on a raised card", "--gold-muted", "--ink-raised"],
  ["muted review accent on a raised card", "--blue-muted", "--ink-raised"],
  ["amber on the page", "--amber", "--ink"],
  ["red on the page", "--red", "--ink"],
  ["body text on the page", "--text", "--ink"],
  ["dim text on the page", "--text-dim", "--ink"],
  ["faint text on the page", "--text-faint", "--ink"],
  ["faint text on a sunken panel", "--text-faint", "--ink-sunken"],
];

const AA = 4.5;

/**
 * WCAG 1.4.11, for the things that carry meaning without being text.
 *
 * A focus ring is the one on this page. It is drawn in `var(--gold)`, which the
 * review errand remaps to `var(--blue)`, and it can land on any of the three
 * surfaces — the page, a raised card, a sunken panel. Six pairs per theme, and
 * 3:1 rather than 4.5, which is the bar for a non-text indicator.
 *
 * This is here rather than left to inspection for the reason the block above
 * exists: a ring that is invisible on one surface in one theme in one errand is
 * exactly the defect nobody finds by looking, and there are twelve combinations.
 */
const NON_TEXT = 3;
const RING: [string, string, string][] = [
  ["focus ring on the page", "--gold", "--ink"],
  ["focus ring on a raised card", "--gold", "--ink-raised"],
  ["focus ring on a sunken panel", "--gold", "--ink-sunken"],
  ["focus ring on the page (review mode)", "--blue", "--ink"],
  ["focus ring on a raised card (review mode)", "--blue", "--ink-raised"],
  ["focus ring on a sunken panel (review mode)", "--blue", "--ink-sunken"],
];

describe.each([
  ["the dark palette", 0],
  ["the light palette", 1],
])("%s", (_name, nth) => {
  const vars = palette(nth);

  it("declares every colour the pairs below name", () => {
    const missing = [...new Set(PAIRS.flatMap(([, fg, bg]) => [fg, bg]))].filter(
      (v) => !vars[v],
    );
    expect(missing).toEqual([]);
  });

  it.each(PAIRS)("reads at AA: %s", (_where, fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(AA);
  });

  it.each(RING)("is visible at 3:1: %s", (_where, fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(NON_TEXT);
  });
});

/**
 * The ring has to exist before its contrast means anything.
 *
 * Both halves were live defects: there was no `:focus-visible` rule in 1,901
 * lines, and `outline: none` sat on the two controls that did have a focus rule,
 * with a border-colour change standing in for a ring.
 */
describe("the focus ring", () => {
  it("is drawn on :focus-visible, in the accent", () => {
    const rule = css.match(/:focus-visible\s*\{([^}]*)\}/g) ?? [];
    const drawn = rule.filter((r) => /outline:\s*\d/.test(r));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.some((r) => r.includes("var(--gold)"))).toBe(true);
  });

  /**
   * The two rules that used to kill it.
   *
   * Written as a plain scan rather than a built regex: the first draft of this
   * escaped the selector into a pattern that matched nothing, so the assertion
   * passed against a stylesheet with `outline: none` put back — a test that
   * checks nothing is worse than no test, and this one was caught only because
   * it was tried against the defect it was written for.
   */
  it.each([".answer-field:focus", ".field input:focus"])(
    "is not suppressed on %s",
    (selector) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, `no rule for ${selector} — did it move?`).toBeGreaterThanOrEqual(0);
      const body = css.slice(at, css.indexOf("}", at));
      expect(body).not.toContain("outline: none");
      expect(body).not.toContain("outline:none");
    },
  );
});

describe("the accent label", () => {
  // The bug in one line: if this ever goes back to a fixed colour, one of the
  // two themes is wrong, because the accent it sits on inverts and it does not.
  it("is a variable, not a literal, so it can invert with the paper", () => {
    const rule = css.match(/\.btn--primary\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("color: var(--on-accent)");
    expect(rule).not.toMatch(/color:\s*#/);
  });

  it("is a different colour in each theme", () => {
    expect(palette(0)["--on-accent"]).not.toBe(palette(1)["--on-accent"]);
  });
});
