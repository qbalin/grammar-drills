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
import { DEFAULTS, browserStore, enabledGroups } from "./bench.js";

/** The colour an outline is drawn in, when one is asked for. */
const INK = "#000000";

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
 * `only` names the group to throw; without it one is drawn at random from the
 * groups the bench has left live, or from the pack's own throws when there is
 * no bench — which is every browser but one.
 */
function buildThrow(source: ConfettiPack, only?: string[]): Built[] {
  if (typeof Path2D === "undefined") return [];
  const groups = only ? [only] : throwable(source);
  if (!groups.length) return [];
  const group = groups[Math.floor(Math.random() * groups.length)];
  return shapesOf(group, source).map((layers) =>
    layers.map((layer) => ({ d: new Path2D(layer.d), fill: layer.fill })),
  );
}

/**
 * The groups a random burst may pick from.
 *
 * A curated bench wins over the pack, including when it has been curated down
 * to nothing — that is a deliberate "throw none of these", and quietly falling
 * back to the whole pack would make the toggles look broken. Only the absence
 * of a bench falls back.
 */
function throwable(source: ConfettiPack): string[][] {
  const curated = enabledGroups(browserStore(), new Set(Object.keys(source.shapes ?? {})));
  return curated ?? source.throws ?? [];
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
  fire: (options?: BurstOptions) => void;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef(0);
  const pieces = useRef<Piece[]>([]);
  // Set per burst, because the playground can change them between two throws.
  const physics = useRef(DEFAULTS);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const { gravity, fadeAt, outline } = physics.current;
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = outline;
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
      // The outline is a second pass over the whole piece rather than a stroke
      // after each fill: stroked as it went, half the linework would be buried
      // under the next layer, which reads as a rendering fault rather than as
      // an outline. Line width is in box units, so it keeps its weight against
      // the shape as the size slider moves.
      if (outline > 0) for (const layer of p.layers) ctx.stroke(layer.path);
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
    // Before the canvas is touched, not after. `buildThrow` is what knows this
    // environment has no Path2D, and asking jsdom for a 2d context is a loud
    // "not implemented" in the middle of an otherwise passing test run.
    const { group, source: from, ...knobs } = options;
    const source = from ?? (pack as ConfettiPack);
    const shapes = buildThrow(source, group);
    if (!shapes.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

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

  const canvas = <canvas ref={canvasRef} className="confetti" aria-hidden="true" />;
  return { canvas, fire: burst };
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
