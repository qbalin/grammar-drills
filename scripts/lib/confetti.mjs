/**
 * What a `confetti.mjs` has to be true of.
 *
 * None of this was checked before, and every one of these went wrong silently:
 * a name in `throws` with no shape behind it was dropped mid-burst, a mistyped
 * paint drew in nothing, and a coordinate that had crept outside the 24x24 box
 * moved the piece off its own centre so it wobbled when it span. The renderer
 * cannot afford to be strict — a burst is a decoration, and throwing during a
 * study session would be worse than drawing badly — so strictness lives here,
 * where it fails before it ships.
 *
 * Returns a list of complaints, empty when the pack is sound. Both packs' tests
 * call it; keeping it in one place is what stops the second language from
 * getting a weaker version of the first language's checks.
 */

/** The path commands the packs actually use. Anything else is a typo. */
const COMMANDS = /^[MLCAZ]$/;

/**
 * How far outside the 24x24 box a coordinate may stray.
 *
 * Not zero: a bézier control point may legitimately sit a little outside the
 * curve it pulls, and an arc is written as two endpoints that say nothing about
 * where the arc bulges. This catches a decimal point in the wrong place, not a
 * shape that grazes its edges.
 */
const SLACK = 3;

export function checkConfetti(pack, { name = "pack" } = {}) {
  const problems = [];
  const say = (message) => problems.push(`${name}: ${message}`);

  if (!pack || typeof pack !== "object") return [`${name}: is not an object`];

  const palette = pack.palette ?? {};
  for (const [paint, value] of Object.entries(palette)) {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
      say(`palette.${paint} is ${JSON.stringify(value)}, not a #rrggbb colour`);
    }
  }

  const shapes = pack.shapes ?? {};
  if (!Object.keys(shapes).length) say("has no shapes");

  for (const [shape, layers] of Object.entries(shapes)) {
    if (typeof layers === "string") {
      // The older single-path form. Still renders, still has to be a path.
      checkPath(layers, `${shape}`, say);
      continue;
    }
    if (!Array.isArray(layers) || !layers.length) {
      say(`shape ${shape} is neither a path nor a list of layers`);
      continue;
    }
    layers.forEach((layer, i) => {
      if (!Array.isArray(layer) || layer.length !== 2) {
        say(`shape ${shape} layer ${i} is not a [paint, path] pair`);
        return;
      }
      const [paint, d] = layer;
      if (!(paint in palette)) say(`shape ${shape} layer ${i} paints with "${paint}", which is not in the palette`);
      checkPath(d, `${shape} layer ${i}`, say);
    });
  }

  const throws = pack.throws ?? [];
  if (!throws.length) say("has no throw groups");
  throws.forEach((group, i) => {
    if (!Array.isArray(group) || !group.length) {
      say(`throw group ${i} is empty`);
      return;
    }
    for (const shape of group) {
      if (!(shape in shapes)) say(`throw group ${i} names "${shape}", which is not a shape`);
    }
  });

  // A shape nothing throws is a shape nobody sees. Usually it means a rename
  // that only got applied in one of the two places.
  for (const shape of Object.keys(shapes)) {
    if (!throws.some((group) => Array.isArray(group) && group.includes(shape))) {
      say(`shape ${shape} is in no throw group, so it is never thrown`);
    }
  }

  return problems;
}

function checkPath(d, where, say) {
  if (typeof d !== "string" || !d.trim()) {
    say(`${where} has no path data`);
    return;
  }
  if (!/^\s*M/.test(d)) {
    say(`${where} does not begin with a moveto`);
  }
  for (const token of d.match(/[A-Za-z]/g) ?? []) {
    if (!COMMANDS.test(token)) {
      say(`${where} uses the path command "${token}", which this pack does not draw with`);
      break;
    }
  }
  for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) {
    const v = Number(n);
    if (v < -SLACK || v > 24 + SLACK) {
      say(`${where} has the coordinate ${n}, which is outside the 24x24 box`);
      break;
    }
  }
}
