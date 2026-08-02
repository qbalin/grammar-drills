/**
 * The burst itself.
 *
 * A canvas over everything, drawn only in the second or so after it fires and
 * otherwise costing nothing: no animation frame is scheduled while it is idle.
 *
 * The shapes come from the pack (`@pack/confetti`), never from here. This file
 * knows that a throw is a group of shapes, that a shape is layers of colour,
 * and that pieces fall; which shapes, and what colours they are painted in, is
 * the pack's business.
 */
import { useCallback, useEffect, useRef } from "react";
import pack from "@pack/confetti";
import { shade, shapesOf, type ConfettiPack } from "./shapes.js";

/**
 * How a burst behaves.
 *
 * These were sliders once, in a bench in Settings, alongside a playground that
 * drew every shape the packs had so the good ones could be picked out. Both are
 * gone: the tuning is finished, and a knob nobody is turning is a knob that
 * drifts. What is left is the setting that was landed on.
 */
const PHYSICS = {
  /** How many pieces a burst throws. */
  pieces: 200,
  /** Piece size in CSS pixels, before the per-piece spread. */
  size: 40,
  /** Half-width of the size spread, as a fraction: 0.65 is 35%-165%. */
  sizeSpread: 0.65,
  /** Where the burst starts, down the viewport. 1 is the bottom edge. */
  originY: 1,
  /** How wide it starts, as a fraction of viewport width. */
  spreadX: 1.2,
  /** Upward launch speed in CSS pixels per frame, before its own jitter. */
  speed: 11,
  /** Gravity, per frame, in CSS pixels. */
  gravity: 0.2,
  /** Half-width of the spin, in radians per frame. */
  spin: 0.15,
  /**
   * How far down the viewport a piece falls before it begins to fade. Past 1 it
   * is off the screen before it starts, which is why the burst reads as pieces
   * leaving rather than pieces dissolving.
   */
  fadeAt: 1.7,
};

/**
 * How much lighter or darker one piece may be than the colours its shape names.
 *
 * The old set got its depth from four tints of one gold, rolled per piece. A
 * shape that names green leaves and black fruit cannot be re-tinted like that
 * without becoming a different object, so the variety moved from hue to light.
 * Kept narrow on purpose: enough that a burst is not flat, not so much that two
 * pieces look like two different shields.
 */
const SHADE = 0.08;

type Piece = {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number;
  /** One entry per layer, painted in order. */
  layers: { path: Path2D; fill: string }[];
  life: number;
};

/**
 * A student who has asked their system not to animate things is not asking for
 * a smaller animation. Nothing fires, and there is no setting to override it —
 * the OS preference is the setting.
 */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A shape ready to draw: its layers, with the paths already built. */
type Built = { d: Path2D; fill: string }[];

/**
 * Path2D is built per burst rather than at module load: this module is
 * imported by the test environment, where Path2D does not exist, and a throw at
 * import time would take the whole app down with it.
 *
 * One group is drawn at random from the pack's throws.
 */
function buildThrow(source: ConfettiPack): Built[] {
  if (typeof Path2D === "undefined") return [];
  const groups = source.throws ?? [];
  if (!groups.length) return [];
  const group = groups[Math.floor(Math.random() * groups.length)];
  return shapesOf(group, source).map((layers) =>
    layers.map((layer) => ({ d: new Path2D(layer.d), fill: layer.fill })),
  );
}

export function useConfetti(): {
  canvas: React.ReactNode;
  fire: () => void;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef(0);
  const pieces = useRef<Piece[]>([]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const { gravity, fadeAt } = PHYSICS;
    ctx.clearRect(0, 0, w, h);
    let live = 0;
    for (const p of pieces.current) {
      p.vy += gravity;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > h * fadeAt) p.life -= 0.035;
      if (p.life <= 0) continue;
      live++;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // The 24x24 box the pack draws in, centred on the piece.
      const k = p.size / 24;
      ctx.scale(k, k);
      ctx.translate(-12, -12);
      // Back to front. Within a layer `evenodd` still punches holes; across
      // layers a later one simply covers the one beneath, which is where the
      // colour comes from.
      for (const layer of p.layers) {
        ctx.fillStyle = layer.fill;
        ctx.fill(layer.path, "evenodd");
      }
      ctx.restore();
    }
    if (live) raf.current = requestAnimationFrame(draw);
    else {
      pieces.current = [];
      ctx.clearRect(0, 0, w, h);
    }
  }, []);

  const burst = useCallback(() => {
    if (prefersReducedMotion()) return;
    // Before the canvas is touched, not after. `buildThrow` is what knows this
    // environment has no Path2D, and asking jsdom for a 2d context is a loud
    // "not implemented" in the middle of an otherwise passing test run.
    const source = pack as ConfettiPack;
    const shapes = buildThrow(source);
    if (!shapes.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { pieces: count, size, sizeSpread, originY, spreadX, speed, spin } = PHYSICS;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    pieces.current = Array.from({ length: count }, () => {
      const built = shapes[Math.floor(Math.random() * shapes.length)];
      const light = 1 + (Math.random() - 0.5) * 2 * SHADE;
      return {
        x: w / 2 + (Math.random() - 0.5) * w * spreadX,
        y: h * originY + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * speed,
        vy: -speed - Math.random() * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 2 * spin,
        size: size * (1 - sizeSpread + Math.random() * sizeSpread * 2),
        // One shade for the whole piece, so it reads as light falling on an
        // object rather than as a differently coloured object.
        layers: built.map((layer) => ({
          path: layer.d,
          fill: shade(layer.fill, light),
        })),
        life: 1,
      };
    });
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const canvas = <canvas ref={canvasRef} className="confetti" aria-hidden="true" />;
  return { canvas, fire: burst };
}
