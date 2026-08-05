/**
 * The Greek pack's app icon: Ω, the letter that says "Greek" at a glance — and
 * the very same Ω this pack throws in its confetti.
 *
 * It used to be stitched out of capsules, the way Latin's Ā is: a bowl of
 * twenty-eight short strokes stepped around an arc, two ankles and two feet.
 * The seams were well under a pixel and it was still wrong — every stroke one
 * weight, so the bowl had none of the thick-and-thin a letter with a curve in
 * it lives on, and the feet were butted onto a circle rather than growing out
 * of it. Capsules draw pen strokes; Ω is a drawn shape.
 *
 * So it is the confetti's, imported rather than copied. There is one Ω in this
 * pack, it is already drawn, and the icon and the thing that rains down when a
 * round is finished should not be two different letters. `make-icons.mjs`
 * fills the path even-odd and fits it to the icon box itself, so nothing here
 * has to know how big an icon is.
 */
import confetti from "./confetti.mjs";

/** The omega's one layer is `[paint, path]`, and its paint is the icon's gold. */
const [[, d]] = confetti.shapes.omega;

export default {
  /** Background, matching the app's theme colour. */
  ink: [0x12, 0x12, 0x1a],
  /** The glyph. */
  gold: [0xe8, 0xc9, 0x8a],
  /** No capsules: this pack's letter is a filled path, not strokes. */
  capsules: [],
  /** The glyph as SVG path data, in the confetti's 24x24 box. */
  path: { d },
};
