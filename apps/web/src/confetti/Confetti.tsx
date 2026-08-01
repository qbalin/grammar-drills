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
import { profile } from "../pack.js";
import { begin, countAnswer, parse, serialize, type Cadence } from "./cadence.js";
import { shade, shapesOf, type ConfettiPack } from "./shapes.js";

/** Named by the pack, like every other key this app writes. */
const KEY = `${profile.storage.webProgressKey}:confetti`;

/**
 * How a burst behaves when nobody has said otherwise.
 *
 * Gathered into one object rather than left as loose constants because the
 * playground now sets every one of them, and a knob whose default lives
 * somewhere else is a knob that drifts. These are the numbers the playground's
 * "copy as defaults" writes back.
 */
export const DEFAULTS = {
  /** How many pieces a burst throws. */
  pieces: 40,
  /** Piece size in CSS pixels, before the per-piece spread. */
  size: 17,
  /** Half-width of the size spread, as a fraction: 0.25 is 75%–125%. */
  sizeSpread: 0.25,
  /** Where the burst starts, down the viewport. */
  originY: 0.62,
  /** How wide it starts, as a fraction of viewport width. */
  spreadX: 0.5,
  /** Upward launch speed in CSS pixels per frame, before its own jitter. */
  speed: 5.5,
  /** Gravity, per frame, in CSS pixels. */
  gravity: 0.34,
  /** Half-width of the spin, in radians per frame. */
  spin: 0.12,
  /** How far down the viewport a piece must fall before it begins to fade. */
  fadeAt: 0.72,
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
type Built = { d: Path2D; fill: string | null }[];

/**
 * Path2D is built per burst rather than at module load: this module is
 * imported by the test environment, where Path2D does not exist, and a throw at
 * import time would take the whole app down with it.
 *
 * `only` names the group to throw; without it one is drawn at random, which is
 * what a real burst does.
 */
function buildThrow(source: ConfettiPack, only?: string[]): Built[] {
  if (typeof Path2D === "undefined") return [];
  const groups = source.throws;
  if (!groups?.length && !only) return [];
  const group = only ?? groups[Math.floor(Math.random() * groups.length)];
  return shapesOf(group, source).map((layers) =>
    layers.map((layer) => ({ d: new Path2D(layer.d), fill: layer.fill })),
  );
}

/** What a burst may be asked to do differently. Only the playground asks. */
export type BurstOptions = Partial<typeof DEFAULTS> & {
  /** Throw exactly these shapes rather than a random group. */
  group?: string[];
  /** Throw from a different pack — the playground's old set. */
  source?: ConfettiPack;
};

export function useConfetti(): {
  canvas: React.ReactNode;
  answered: () => void;
  fire: (options?: BurstOptions) => void;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cadence = useRef<Cadence>(begin());
  const raf = useRef(0);
  const pieces = useRef<Piece[]>([]);
  // Set per burst, because the playground can change them between two throws.
  const physics = useRef(DEFAULTS);

  // The count carries across sessions: a student whose queue is eight cards a
  // day would otherwise never reach the first burst.
  useEffect(() => {
    try {
      cadence.current = parse(localStorage.getItem(KEY));
    } catch {
      cadence.current = begin();
    }
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const { gravity, fadeAt } = physics.current;
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

  const burst = useCallback((options: BurstOptions = {}) => {
    // The playground gets no exemption from this. A student who has asked for
    // no animation and an author testing on the same machine are the same
    // browser making the same request, and one rule is easier to trust than
    // two — the playground says so on screen rather than overriding it.
    if (prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { group, source: from, ...knobs } = options;
    const source = from ?? (pack as ConfettiPack);
    const shapes = buildThrow(source, group);
    if (!shapes.length) return;

    const settings = { ...DEFAULTS, ...stripUndefined(knobs) };
    physics.current = settings;
    const { pieces: count, size, sizeSpread, originY, spreadX, speed, spin } = settings;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Only reached by a shape that names no colour of its own — the old set.
    const tints = source.colors?.length ? source.colors : ["#e8c98a"];

    pieces.current = Array.from({ length: count }, () => {
      const built = shapes[Math.floor(Math.random() * shapes.length)];
      const tint = tints[Math.floor(Math.random() * tints.length)];
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
          fill: shade(layer.fill ?? tint, light),
        })),
        life: 1,
      };
    });
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  /** One answer graded, of any kind and any rating. */
  const answered = useCallback(() => {
    const { cadence: next, fire } = countAnswer(cadence.current);
    cadence.current = next;
    try {
      localStorage.setItem(KEY, serialize(next));
    } catch {
      // Storage full or blocked. The count keeps working for this session.
    }
    if (fire) burst();
  }, [burst]);

  const canvas = <canvas ref={canvasRef} className="confetti" aria-hidden="true" />;
  return { canvas, answered, fire: burst };
}

/**
 * Spreading `options` over the defaults would let an explicit `undefined` — a
 * slider that has not been touched — overwrite a default with nothing.
 */
function stripUndefined<T extends object>(options: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
