/**
 * The burst itself.
 *
 * A canvas over everything, drawn only in the second or so after it fires and
 * otherwise costing nothing: no animation frame is scheduled while it is idle.
 *
 * The shapes come from the pack (`@pack/confetti`), never from here. This file
 * knows that a throw is a group of silhouettes and that pieces fall; which
 * silhouettes, and what a language's gold is, is the pack's business.
 */
import { useCallback, useEffect, useRef } from "react";
import pack from "@pack/confetti";
import { profile } from "../pack.js";
import { begin, countAnswer, parse, serialize, type Cadence } from "./cadence.js";

/** Named by the pack, like every other key this app writes. */
const KEY = `${profile.storage.webProgressKey}:confetti`;

/** How many pieces a burst throws. */
const PIECES = 64;
/**
 * The share of pieces that carry a silhouette rather than being a plain sliver.
 *
 * The point of the thing is that it is *sometimes* a tiny amphora. At 1.0 the
 * shapes stop being a surprise and become the design; at 0.1 a student could
 * study for a month without noticing one. A third is often enough to be found
 * and rare enough to stay a find.
 */
const SHAPED_SHARE = 0.35;
/** Piece size in CSS pixels, before the per-piece jitter. */
const SIZE = 11;
/** Gravity, per frame, in CSS pixels. */
const GRAVITY = 0.34;

type Piece = {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number;
  color: string; shape: Path2D | null; life: number;
};

/**
 * A student who has asked their system not to animate things is not asking for
 * a smaller animation. Nothing fires, and there is no setting to override it —
 * the OS preference is the setting.
 */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Path2D is built per burst rather than at module load: this module is
 * imported by the test environment, where Path2D does not exist, and a throw at
 * import time would take the whole app down with it.
 */
function buildThrow(): { paths: Path2D[]; ok: boolean } {
  if (typeof Path2D === "undefined") return { paths: [], ok: false };
  const groups = pack.throws;
  if (!groups?.length) return { paths: [], ok: false };
  const group = groups[Math.floor(Math.random() * groups.length)];
  const paths: Path2D[] = [];
  for (const name of group) {
    const d = pack.shapes[name];
    if (d) paths.push(new Path2D(d));
  }
  return { paths, ok: paths.length > 0 };
}

export function useConfetti(): { canvas: React.ReactNode; answered: () => void } {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cadence = useRef<Cadence>(begin());
  const raf = useRef(0);
  const pieces = useRef<Piece[]>([]);

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
    ctx.clearRect(0, 0, w, h);
    let live = 0;
    for (const p of pieces.current) {
      p.vy += GRAVITY;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > h * 0.72) p.life -= 0.035;
      if (p.life <= 0) continue;
      live++;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape) {
        const k = p.size / 24;
        ctx.scale(k, k);
        ctx.translate(-12, -12);
        ctx.fill(p.shape, "evenodd");
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { paths, ok } = buildThrow();
    if (!ok) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = pack.colors?.length ? pack.colors : ["#e8c98a"];
    pieces.current = Array.from({ length: PIECES }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.5,
      y: h * 0.62 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 5.5,
      vy: -5.5 - Math.random() * 5.5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.24,
      size: SIZE * (0.75 + Math.random() * 0.5),
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < SHAPED_SHARE ? paths[Math.floor(Math.random() * paths.length)] : null,
      life: 1,
    }));
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
  return { canvas, answered };
}
