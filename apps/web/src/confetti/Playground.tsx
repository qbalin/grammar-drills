/**
 * The confetti playground — a way to see a burst without answering fifteen
 * questions to earn one, and a way to see a shape standing still.
 *
 * Two halves, because a shape is judged twice. The gallery answers "is this a
 * helmet?", which you can only tell at rest and at the size it is actually
 * thrown. The sliders answer "does a burst of them feel right?", which you can
 * only tell in flight.
 *
 * It is not for students. It appears only when the repository owner in
 * Settings is this repo's author, which is a deliberately weak lock: the point
 * is to keep a debugging control out of the way of someone studying, not to
 * keep a secret. Anyone who types the name gets the toy, and nothing behind it
 * is worth guarding.
 */
import { useEffect, useState } from "react";
import pack from "@pack/confetti";
import legacy from "@pack/confetti-legacy";
import { DEFAULTS, type BurstOptions } from "./Confetti.js";
import { layersOf, type ConfettiPack } from "./shapes.js";

/**
 * Whose build this is. The playground is a workbench for whoever maintains the
 * packs' shapes, and this is how it knows it is on their machine.
 */
export const AUTHOR = "qbalin";

/** Where a tuning session is kept, so a reload does not lose it. */
const BENCH_KEY = "confetti:bench";

/** Is the owner configured in Settings this repo's author? */
export function isAuthor(owner: string | undefined | null): boolean {
  return (owner ?? "").trim().toLowerCase() === AUTHOR;
}

/** Named for the shapes it throws, so the buttons read as what they do. */
function groupLabel(group: string[]): string {
  return group.join(" + ");
}

/** Every knob, with the range that is worth sweeping and how to read it. */
type Knob = {
  key: keyof typeof DEFAULTS;
  label: string;
  min: number;
  max: number;
  step: number;
  /** How the value reads on screen. */
  format: (v: number) => string;
  /** What the number means, where the name alone will not carry it. */
  hint?: string;
};

const KNOBS: Knob[] = [
  { key: "pieces", label: "Pieces", min: 6, max: 200, step: 1, format: (v) => `${v}` },
  { key: "size", label: "Piece size", min: 6, max: 40, step: 1, format: (v) => `${v}px` },
  {
    key: "sizeSpread",
    label: "Size spread",
    min: 0,
    max: 0.8,
    step: 0.05,
    format: (v) => `±${Math.round(v * 100)}%`,
    hint: "How much bigger and smaller than that a piece may be.",
  },
  {
    key: "originY",
    label: "Launch height",
    min: 0.05,
    max: 0.95,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}% down`,
    hint: "0% is the top of the screen, 100% the bottom.",
  },
  {
    key: "spreadX",
    label: "Launch width",
    min: 0,
    max: 1.4,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}% of the screen`,
  },
  { key: "speed", label: "Launch speed", min: 1, max: 16, step: 0.5, format: (v) => `${v}` },
  { key: "gravity", label: "Gravity", min: 0.05, max: 1.2, step: 0.01, format: (v) => `${v}` },
  { key: "spin", label: "Spin", min: 0, max: 0.6, step: 0.01, format: (v) => `±${v}` },
  {
    key: "fadeAt",
    label: "Fades below",
    min: 0.1,
    max: 1.5,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}% down`,
    hint: "Past 100% a piece leaves the screen before it starts to fade.",
  },
];

/** The two sets, and what to call them. */
const SETS = {
  new: { label: "New", pack: pack as ConfettiPack },
  old: { label: "Now", pack: legacy as ConfettiPack },
};
type SetName = keyof typeof SETS;

/**
 * One shape, standing still, at the three sizes that matter: big enough to
 * judge the drawing, at the box it was drawn in, and at the size it is thrown —
 * which is the one that kills shapes.
 */
function ShapeCard({
  name,
  source,
  thrown,
  onThrow,
}: {
  name: string;
  source: ConfettiPack;
  thrown: number;
  onThrow: () => void;
}) {
  const layers = layersOf(source.shapes[name], source);
  const tint = source.colors?.[0] ?? "#e8c98a";
  const svg = (px: number) => (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
      {layers.map((layer, i) => (
        <path key={i} d={layer.d} fill={layer.fill ?? tint} fillRule="evenodd" />
      ))}
    </svg>
  );
  return (
    <div className="shape-card">
      <div className="shape-card__sizes">
        {svg(64)}
        {svg(24)}
        {svg(thrown)}
      </div>
      <button className="btn btn--quiet" onClick={onThrow} title={`Throw ${name}`}>
        {name}
      </button>
    </div>
  );
}

export function ConfettiPlayground({
  onFire,
}: {
  onFire: (options?: BurstOptions) => void;
}) {
  const [knobs, setKnobs] = useState(() => loadBench());
  const [set, setSet] = useState<SetName>("new");

  // Kept so a tuning session survives a reload — you are usually reloading
  // because you just changed a path.
  useEffect(() => {
    try {
      localStorage.setItem(BENCH_KEY, JSON.stringify(knobs));
    } catch {
      // Storage blocked. The sliders still work for this session.
    }
  }, [knobs]);

  // Stated rather than worked around: with reduced motion on, nothing fires,
  // and a playground whose buttons silently did nothing would read as a bug.
  const muted =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const source = SETS[set].pack;
  const options = (group?: string[]): BurstOptions => ({ ...knobs, group, source });
  const names = Object.keys(source.shapes);

  return (
    <>
      <div className="section-title">Confetti playground</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {muted
          ? "This device asks for reduced motion, so nothing will fire — by design, and there is no override. The gallery below still works."
          : "Throw a burst now. A burst normally picks one throw group at random every ten to twenty answers."}
      </p>

      <div className="actions">
        {(Object.keys(SETS) as SetName[]).map((key) => (
          <button
            key={key}
            className={`btn ${set === key ? "" : "btn--quiet"}`}
            aria-pressed={set === key}
            onClick={() => setSet(key)}
          >
            {SETS[key].label}
          </button>
        ))}
      </div>
      <p className="field__hint">
        {set === "new"
          ? "The shapes this pack throws."
          : "The set these replaced, kept only for this comparison."}
      </p>

      <div className="shape-gallery">
        {names.map((name) => (
          <ShapeCard
            key={name}
            name={name}
            source={source}
            thrown={knobs.size}
            onThrow={() => onFire(options([name]))}
          />
        ))}
      </div>

      <div className="actions">
        <button className="btn" onClick={() => onFire(options())}>
          Random throw
        </button>
        {source.throws.map((group) => (
          <button
            key={group.join("-")}
            className="btn"
            onClick={() => onFire(options(group))}
          >
            {groupLabel(group)}
          </button>
        ))}
      </div>

      {KNOBS.map((knob) => (
        <label className="field" key={knob.key}>
          <span className="field__label">
            {knob.label} — {knob.format(knobs[knob.key])}
          </span>
          <input
            type="range"
            min={knob.min}
            max={knob.max}
            step={knob.step}
            value={knobs[knob.key]}
            onChange={(e) =>
              setKnobs((k) => ({ ...k, [knob.key]: Number(e.target.value) }))
            }
          />
          {knob.hint && <span className="field__hint">{knob.hint}</span>}
        </label>
      ))}

      <div className="actions">
        <button className="btn btn--quiet" onClick={() => setKnobs(DEFAULTS)}>
          Reset
        </button>
        <button
          className="btn btn--quiet"
          onClick={() => navigator.clipboard?.writeText(asDefaults(knobs))}
          title="Copy these settings as the DEFAULTS block in Confetti.tsx"
        >
          Copy as defaults
        </button>
      </div>
    </>
  );
}

/** Where the sliders were left, ignoring anything that is no longer a knob. */
export function loadBench(
  read: () => string | null = () => {
    try {
      return localStorage.getItem(BENCH_KEY);
    } catch {
      return null;
    }
  },
): typeof DEFAULTS {
  const raw = read();
  if (!raw) return DEFAULTS;
  try {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
      const v = Number(saved[key]);
      if (Number.isFinite(v)) out[key] = v;
    }
    return out;
  } catch {
    return DEFAULTS;
  }
}

/**
 * The sliders as the source they would be pasted into. Tuning a burst and then
 * squinting at nine slider labels to copy the numbers by hand is how a good
 * setting gets lost.
 */
export function asDefaults(knobs: typeof DEFAULTS): string {
  const body = (Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[])
    .map((key) => `  ${key}: ${knobs[key]},`)
    .join("\n");
  return `export const DEFAULTS = {\n${body}\n};`;
}
