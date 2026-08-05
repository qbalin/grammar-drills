#!/usr/bin/env node
/**
 * Draw the app icon from the pack's own glyph (languages/<pack>/icon.mjs)
 * faster than any word could.
 *
 * iOS needs a real PNG for `apple-touch-icon` and the manifest wants 192/512,
 * so an SVG alone will not do. Rather than take on a rasterizer dependency for
 * four small images, this draws them, and a pack can hand it the glyph either
 * of two ways:
 *
 * - **`capsules`** — a letterform as a handful of round-capped strokes, filled
 *   by signed distance. A dozen lines of geometry, clean antialiasing free, and
 *   right for anything that is essentially pen strokes: Latin's Ā is four.
 * - **`path`** — SVG path data, filled even-odd by a scanline pass. Letters
 *   with a bowl — Ω, and anything with a counter in it — are curves with a
 *   thick-and-thin weight to them, and stitching that out of capsules gives a
 *   shape that is recognisably the letter and recognisably not drawn. The
 *   Greek pack points this at the very same Ω its confetti throws.
 *
 * Whichever it is, the SVG is emitted from it too, so the four PNGs and the
 * vector can never drift apart.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(
  here,
  "..",
  "public",
  "icons",
);

// The glyph belongs to the language, not to the renderer: a Latin build draws
// Ā, and another pack draws whatever says its language at a glance.
const pack = process.env.LANG_PACK ?? "latin";
const icon = (
  await import(
    pathToFileURL(join(here, "..", "..", "..", "languages", pack, "icon.mjs")).href
  )
).default;

const INK = icon.ink;
const GOLD = icon.gold;
const CAPSULES = icon.capsules ?? [];
const PATH = icon.path;

if (!PATH && CAPSULES.length === 0) {
  throw new Error(`languages/${pack}/icon.mjs: needs capsules or a path`);
}

/** How much of the icon box the glyph's longer side takes up. */
const GLYPH = 0.68;

/** Distance from a point to a line segment — the capsule's spine. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Glyph coverage at a point, 0..1, softened over roughly one pixel. */
function coverage(px, py, size) {
  const feather = 1.2 / size;
  let best = 0;
  for (const [x1, y1, x2, y2, r] of CAPSULES) {
    const d = distToSegment(px, py, x1, y1, x2, y2) - r;
    // smoothstep across the edge
    const t = Math.max(0, Math.min(1, 0.5 - d / (2 * feather)));
    best = Math.max(best, t * t * (3 - 2 * t));
  }
  return best;
}

// --- the other way in: SVG path data ----------------------------------------

/**
 * A path, flattened to polygons in its own coordinates.
 *
 * Curves become line runs — 24 steps for a cubic is far more than a 512-pixel
 * glyph can show — because a polygon is all the scanline fill below wants. The
 * command set is what a drawn glyph uses; an arc throws rather than being
 * quietly dropped, since a silently missing stroke is the worst outcome here.
 */
function flatten(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const polys = [];
  let poly = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  const close = () => {
    if (poly.length > 1) polys.push(poly);
    poly = [];
  };
  const curve = (x1, y1, x2, y2, x3, y3) => {
    const STEPS = 24;
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const u = 1 - t;
      poly.push([
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
    x = x3;
    y = y3;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    // A repeated coordinate run carries the previous command, except after a
    // moveto, which continues as a lineto the way SVG says.
    else if (command === "M") command = "L";
    else if (command === "m") command = "l";
    const rel = command === command.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;

    switch (command.toUpperCase()) {
      case "M": {
        close();
        x = ox + num();
        y = oy + num();
        startX = x;
        startY = y;
        poly.push([x, y]);
        break;
      }
      case "L": {
        x = ox + num();
        y = oy + num();
        poly.push([x, y]);
        break;
      }
      case "H": {
        x = ox + num();
        poly.push([x, y]);
        break;
      }
      case "V": {
        y = oy + num();
        poly.push([x, y]);
        break;
      }
      case "C": {
        curve(ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num());
        break;
      }
      case "Q": {
        // Raised to a cubic rather than given a second flattener.
        const qx = ox + num();
        const qy = oy + num();
        const ex = ox + num();
        const ey = oy + num();
        curve(
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          ex + (2 / 3) * (qx - ex),
          ey + (2 / 3) * (qy - ey),
          ex,
          ey,
        );
        break;
      }
      case "Z": {
        close();
        x = startX;
        y = startY;
        break;
      }
      default:
        throw new Error(
          `languages/${pack}/icon.mjs: path command "${command}" is not drawn here`,
        );
    }
  }
  close();
  return polys;
}

/**
 * The glyph's polygons in the 0..1 icon box: centred, and scaled so its longer
 * side is `GLYPH` of the box. Fitted rather than hand-placed, so a pack can
 * hand over a shape drawn for something else — the confetti — untouched.
 */
function fitted(scale = 1) {
  const polys = flatten(PATH.d ?? PATH);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys) {
    for (const [px, py] of poly) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  const k = (GLYPH * scale) / Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    k,
    polys: polys.map((poly) => poly.map(([px, py]) => [0.5 + (px - cx) * k, 0.5 + (py - cy) * k])),
    /** Where the untransformed path's origin lands, for the SVG's matrix. */
    tx: 0.5 - cx * k,
    ty: 0.5 - cy * k,
  };
}

/**
 * Glyph coverage for a whole image, filled even-odd.
 *
 * Four sample rows to the pixel, each filled with the exact fraction of every
 * pixel it crosses: vertical antialiasing from the samples, horizontal from the
 * span arithmetic. Cheaper than supersampling in both directions and, at these
 * sizes, indistinguishable from it.
 */
function pathCoverage(size, scale) {
  const SUB = 4;
  const edges = [];
  for (const poly of fitted(scale).polys) {
    for (let n = 0; n < poly.length; n++) {
      const [x1, y1] = poly[n];
      const [x2, y2] = poly[(n + 1) % poly.length];
      if (y1 !== y2) edges.push([x1 * size, y1 * size, x2 * size, y2 * size]);
    }
  }
  const cov = new Float32Array(size * size);
  const xs = [];
  for (let row = 0; row < size * SUB; row++) {
    const y = (row + 0.5) / SUB;
    xs.length = 0;
    for (const [x1, y1, x2, y2] of edges) {
      if ((y >= y1 && y < y2) || (y >= y2 && y < y1)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const base = ((row / SUB) | 0) * size;
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const from = Math.max(0, xs[n]);
      const to = Math.min(size, xs[n + 1]);
      for (let px = Math.floor(from); px < to; px++) {
        if (px < 0) continue;
        cov[base + px] += (Math.min(px + 1, to) - Math.max(from, px)) / SUB;
      }
    }
  }
  return cov;
}

/**
 * Background coverage. A maskable icon is cropped to a circle by the launcher,
 * so it bleeds to the edges; a plain one keeps the rounded square visible.
 */
function background(px, py, size, maskable) {
  if (maskable) return 1;
  const r = 0.22;
  const dx = Math.max(Math.abs(px - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(py - 0.5) - (0.5 - r), 0);
  const d = Math.hypot(dx, dy) - r;
  const feather = 1.2 / size;
  const t = Math.max(0, Math.min(1, 0.5 - d / (2 * feather)));
  return t * t * (3 - 2 * t);
}

function render(size, { maskable = false } = {}) {
  // A maskable icon's safe zone is the middle 80%, so the glyph shrinks to fit.
  const scale = maskable ? 0.76 : 1;
  // A path is filled for the whole image at once — a scanline pass has to be —
  // where capsules answer per point.
  const filled = PATH ? pathCoverage(size, scale) : null;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      const gx = (px - 0.5) / scale + 0.5;
      const gy = (py - 0.5) / scale + 0.5;
      const bg = background(px, py, size, maskable);
      const fg =
        (filled ? Math.min(1, filled[y * size + x]) : coverage(gx, gy, size * scale)) * bg;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(INK[c] * (1 - fg) + GOLD[c] * fg);
      }
      rgba[i + 3] = Math.round(bg * 255);
    }
  }
  return rgba;
}

// --- a minimal PNG encoder (IHDR / IDAT / IEND, 8-bit RGBA) -----------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // Each scanline is prefixed with its filter type; 0 (none) keeps this simple
  // and costs little, as the image is mostly flat colour.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the SVG, from whichever the pack gave -----------------------------------

function svg() {
  const rgb = (c) => `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  if (PATH) {
    // The very same fit the PNGs were filled through, as a matrix — so the
    // vector and the four rasters cannot disagree about where the glyph sits.
    const { k, tx, ty } = fitted();
    const m = [k * 512, 0, 0, k * 512, tx * 512, ty * 512];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="113" fill="${rgb(INK)}"/>
  <path d="${PATH.d ?? PATH}" fill="${rgb(GOLD)}" fill-rule="evenodd" transform="matrix(${m.join(" ")})"/>
</svg>
`;
  }
  const lines = CAPSULES.map(
    ([x1, y1, x2, y2, r]) =>
      `  <line x1="${x1 * 512}" y1="${y1 * 512}" x2="${x2 * 512}" y2="${y2 * 512}" ` +
      `stroke-width="${r * 2 * 512}"/>`,
  ).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="113" fill="${rgb(INK)}"/>
  <g stroke="${rgb(GOLD)}" stroke-linecap="round">
${lines}
  </g>
</svg>
`;
}

// --- run --------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
];
for (const [name, size, opts] of targets) {
  writeFileSync(join(outDir, name), encodePng(render(size, opts), size));
}
writeFileSync(join(outDir, "icon.svg"), svg());
console.log(`  icons            ${targets.map(([n]) => n).join(", ")}, icon.svg`);
