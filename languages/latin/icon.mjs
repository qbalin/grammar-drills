/**
 * The Latin pack's app icon: a capital A under a macron — Ā, the mark that
 * says "Latin".
 *
 * Drawn as capsules rather than text so the build needs no font: the renderer
 * in `apps/web/scripts/make-icons.mjs` rasterises these with a signed-distance
 * pass, which is a few lines of geometry and gives clean antialiasing free.
 *
 * A pack whose letterform the capsule renderer cannot draw — Ω, ж, ا — should
 * ship `icons/*.png` directly instead and leave `capsules` empty.
 */
const STROKE = 0.062;

export default {
  /** Background, matching the app's theme colour. */
  ink: [0x12, 0x12, 0x1a],
  /** The glyph. */
  gold: [0xe8, 0xc9, 0x8a],
  /**
   * The glyph in a 0..1 box: [x1, y1, x2, y2, radius].
   * The apex sits at 0.5; the crossbar is set low, as Roman capitals have it.
   */
  capsules: [
    [0.5, 0.325, 0.235, 0.86, STROKE], // left stroke
    [0.5, 0.325, 0.765, 0.86, STROKE], // right stroke
    [0.335, 0.7, 0.665, 0.7, STROKE * 0.78], // crossbar
    [0.285, 0.185, 0.715, 0.185, STROKE * 0.82], // macron
  ],
};
