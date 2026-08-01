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
 * The older form — a bare path string — still renders, as one layer with no
 * colour of its own. `null` fill means "tint this piece from `colors`", which
 * is what every piece used to do. That is not nostalgia: it is what lets the
 * playground draw the old set beside the new one through this same code.
 *
 * Nothing here draws. This module is pure so it can be tested, which the canvas
 * renderer beside it cannot be — jsdom has no `Path2D`.
 */

/** A pack's confetti module, in the shape this app reads it. */
export type ConfettiPack = {
  shapes: Record<string, Shape>;
  throws: string[][];
  /** Named colours a layer may ask for. Absent in the older form. */
  palette?: Record<string, string>;
  /** The per-piece tints the older form used. Absent in the newer one. */
  colors?: string[];
};

/** Either form: a bare path, or layers of `[paint, path]`. */
export type Shape = string | [string, string][];

/** One layer, resolved. A null fill takes the piece's tint instead. */
export type Layer = { d: string; fill: string | null };

/**
 * The layers of a shape, resolved against the pack's palette.
 *
 * An unknown paint name falls back to the piece's tint rather than throwing.
 * The pack tests are what catch a typo; a burst mid-session is not the place to
 * find out, and a piece drawn in the wrong gold beats a blank screen.
 */
export function layersOf(shape: Shape | undefined, pack: ConfettiPack): Layer[] {
  if (!shape) return [];
  if (typeof shape === "string") return [{ d: shape, fill: null }];
  const palette = pack.palette ?? {};
  const layers: Layer[] = [];
  for (const layer of shape) {
    if (!Array.isArray(layer) || layer.length < 2) continue;
    const [paint, d] = layer;
    if (!d) continue;
    layers.push({ d, fill: palette[paint] ?? null });
  }
  return layers;
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
