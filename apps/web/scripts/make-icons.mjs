#!/usr/bin/env node
/**
 * Draw the app icon from the pack's own glyph (languages/<pack>/icon.mjs)
 * faster than any word could.
 *
 * iOS needs a real PNG for `apple-touch-icon` and the manifest wants 192/512,
 * so an SVG alone will not do. Rather than take on a rasterizer dependency for
 * four small images, the glyph is drawn as four capsules (two slanted strokes,
 * a crossbar, the macron) and filled by signed distance, which is a dozen lines
 * of geometry and gives clean antialiasing for free. The same four capsules
 * describe the SVG, so the two can never drift apart.
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
const CAPSULES = icon.capsules;

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
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      const gx = (px - 0.5) / scale + 0.5;
      const gy = (py - 0.5) / scale + 0.5;
      const bg = background(px, py, size, maskable);
      const fg = coverage(gx, gy, size * scale) * bg;
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

// --- the SVG, from the same capsules ----------------------------------------

function svg() {
  const rgb = (c) => `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
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
