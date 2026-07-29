/**
 * The Greek pack's app icon: Ω, the letter that says "Greek" at a glance.
 *
 * Drawn as capsules rather than text so the build needs no font: the renderer
 * in `apps/web/scripts/make-icons.mjs` rasterises these with a signed-distance
 * pass and takes the union of them all.
 *
 * Latin's icon.mjs notes that Ω is one of the letterforms the capsule renderer
 * cannot draw. That is true of four capsules; it is not true of the renderer,
 * which unions however many it is given. A bowl is a chord of short capsules
 * stepped around an arc, and at 192 pixels the seams are well under a pixel.
 */
const STROKE = 0.062;

/** Where the bowl sits, and how wide. */
const CX = 0.5;
const CY = 0.475;
const R = 0.25;

/**
 * The bowl: an arc open at the bottom, drawn from one shoulder up over the top
 * and down to the other. Angles run clockwise from the top, so the opening is
 * the 100° the arc does not cover.
 */
const OPEN = 130;
const STEPS = 28;

const at = (deg) => {
  const t = (deg * Math.PI) / 180;
  return [CX + R * Math.sin(t), CY - R * Math.cos(t)];
};

const bowl = Array.from({ length: STEPS }, (_, i) => {
  const a = -OPEN + (i * (2 * OPEN)) / STEPS;
  const b = -OPEN + ((i + 1) * (2 * OPEN)) / STEPS;
  return [...at(a), ...at(b), STROKE];
});

// The feet: Ω's ends turn out and sit flat on the baseline. Each starts under
// the shoulder the bowl left off at and runs outward, away from the centre.
const [lx, ly] = at(-OPEN);
const [rx, ry] = at(OPEN);
const FOOT = 0.085;
const BASE = 0.845;

export default {
  /** Background, matching the app's theme colour. */
  ink: [0x12, 0x12, 0x1a],
  /** The glyph. */
  gold: [0xe8, 0xc9, 0x8a],
  /** The glyph in a 0..1 box: [x1, y1, x2, y2, radius]. */
  capsules: [
    ...bowl,
    [lx, ly, lx - FOOT * 0.55, BASE, STROKE * 0.9], // left ankle
    [rx, ry, rx + FOOT * 0.55, BASE, STROKE * 0.9], // right ankle
    [lx - FOOT * 1.6, BASE, lx + FOOT * 0.35, BASE, STROKE * 0.86], // left foot
    [rx - FOOT * 0.35, BASE, rx + FOOT * 1.6, BASE, STROKE * 0.86], // right foot
  ],
};
