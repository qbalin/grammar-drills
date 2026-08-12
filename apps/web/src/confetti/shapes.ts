/**
 * What a pack's shape means, in one place.
 *
 * A shape is a stack of coloured layers, painted back to front:
 *
 *     scutum: [
 *       ["blood",  "M… Z"],   // the board
 *       ["gold",   "M… Z"],   // the wings
 *     ]
 *
 * Each layer is still filled `evenodd`, so a subpath nested inside another
 * within *one* layer reads as a hole — that is how a boss or a hub is drawn.
 * Across layers there is no such rule: a later layer simply covers an earlier
 * one, which is the whole reason the format exists. Shapes used to be a single
 * path in a single colour, and every piece of detail had to be a hole punched
 * in the silhouette.
 *
 * Nothing here draws. This module is pure so it can be tested, which the canvas
 * renderer beside it cannot be — jsdom has no `Path2D`.
 */

/** A pack's confetti module, in the shape this app reads it. */
export type ConfettiPack = {
  shapes: Record<string, Shape>;
  throws: string[][];
  /**
   * The one group kept back for a burst that means something.
   *
   * Optional, and that is the point: a pack that says nothing gets an ordinary
   * group thrown at the heavier physics, which is still visibly a different
   * burst — so a second language does not have to ship a drawing before the
   * first can ship the moment. `checkConfetti` refuses one that names a shape
   * the pack has not got, and refuses one whose shapes are some ordinary
   * group's, which would ship the rarest burst in the app drawing exactly what
   * every round draws.
   */
  milestone?: string[];
  /** Named colours a layer may ask for. */
  palette?: Record<string, string>;
};

/** A shape: layers of `[paint, path]`, painted back to front. */
export type Shape = [string, string][];

/** One layer, resolved. */
export type Layer = { d: string; fill: string };

/**
 * What an unknown paint name is drawn in.
 *
 * The pack tests are what catch a typo — `checkConfetti` fails on a paint the
 * palette does not have. A burst mid-session is not the place to find out, so
 * one here draws in the pack's gold and carries on: a piece in the wrong colour
 * beats a hole in the screen.
 */
const UNPAINTED = "#e8c98a";

/** The layers of a shape, resolved against the pack's palette. */
export function layersOf(shape: Shape | undefined, pack: ConfettiPack): Layer[] {
  if (!shape) return [];
  const palette = pack.palette ?? {};
  const layers: Layer[] = [];
  for (const layer of shape) {
    if (!Array.isArray(layer) || layer.length < 2) continue;
    const [paint, d] = layer;
    if (!d) continue;
    layers.push({ d, fill: palette[paint] ?? UNPAINTED });
  }
  return layers;
}

/**
 * Which group a burst draws.
 *
 * One group and only ever one — that is what makes a burst read as a motif
 * rather than as a jumble, and it is why the heavier burst is not two groups
 * thrown together. An ordinary burst takes one at random; a milestone takes the
 * group the pack keeps back for it, and falls in with the rest when the pack
 * keeps none, so a language can arrive before its own drawing does.
 *
 * Here rather than beside the canvas because it is a choice and not a drawing,
 * and jsdom has no `Path2D` to test the drawing with.
 */
export function throwGroup(
  pack: ConfettiPack,
  grand = false,
): string[] | undefined {
  const kept = grand ? pack.milestone : undefined;
  if (kept?.length) return kept;
  const groups = pack.throws ?? [];
  if (!groups.length) return undefined;
  return groups[Math.floor(Math.random() * groups.length)];
}

/** Every shape a throw group names, in order, skipping any that is missing. */
export function shapesOf(group: string[], pack: ConfettiPack): Layer[][] {
  const out: Layer[][] = [];
  for (const name of group) {
    const layers = layersOf(pack.shapes[name], pack);
    if (layers.length) out.push(layers);
  }
  return out;
}

/**
 * A colour lightened or darkened, for the variety a burst needs.
 *
 * The old set got its depth from four tints of one gold, rolled per piece. A
 * shape that names its own colours cannot be re-tinted like that without
 * becoming a different object — a green olive is not the point if the leaves
 * come out gold. So the variety moves from hue to light: every layer of one
 * piece is shaded by the same factor, which reads as pieces catching the light
 * differently rather than as pieces being different things.
 *
 * Above 1 it moves toward white, below 1 toward black, so a near-black stays
 * visible when lightened and a near-white still darkens.
 */
export function shade(hex: string, factor: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const mix = (c: number) =>
    factor >= 1
      ? c + (255 - c) * Math.min(1, factor - 1)
      : c * Math.max(0, factor);
  return (
    "#" +
    rgb
      .map((c) => Math.round(Math.max(0, Math.min(255, mix(c)))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** `#rgb` or `#rrggbb` to bytes; anything else is not ours to interpret. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const body = m[1];
  const full =
    body.length === 3
      ? body.split("").map((c) => c + c).join("")
      : body;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
