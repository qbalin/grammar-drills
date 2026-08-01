/**
 * The confetti playground — a way to see a burst without answering fifteen
 * questions to earn one, a way to see a shape standing still, and a way to
 * decide which shapes go together.
 *
 * Three halves, which is one more than a bench should have, because a shape is
 * judged three ways. The gallery answers "is this a helmet?", which you can
 * only tell at rest and at the size it is actually thrown. The sliders answer
 * "does a burst of them feel right?", which you can only tell in flight. The
 * composer answers "do these two belong together?", which was previously
 * answered by editing the pack and reloading.
 *
 * It is not for students. It appears only when the repository owner in
 * Settings is this repo's author, which is a deliberately weak lock: the point
 * is to keep a debugging control out of the way of someone studying, not to
 * keep a secret. Anyone who types the name gets the toy, and nothing behind it
 * is worth guarding.
 */
import { useEffect, useMemo, useState } from "react";
import pack from "@pack/confetti";
import legacy from "@pack/confetti-legacy";
import type { BurstOptions } from "./Confetti.js";
import { layersOf, type ConfettiPack } from "./shapes.js";
import {
  DEFAULTS,
  asDefaults,
  asThrows,
  browserStore,
  loadGroups,
  loadKnobs,
  saveGroups,
  saveKnobs,
  type Group,
  type Knobs,
} from "./bench.js";

/**
 * Whose build this is. The playground is a workbench for whoever maintains the
 * packs' shapes, and this is how it knows it is on their machine.
 */
export const AUTHOR = "qbalin";

/** Is the owner configured in Settings this repo's author? */
export function isAuthor(owner: string | undefined | null): boolean {
  return (owner ?? "").trim().toLowerCase() === AUTHOR;
}

/** Named for the shapes it throws, so the buttons read as what they do. */
function groupLabel(shapes: string[]): string {
  return shapes.join(" + ");
}

/** Every knob, with the range that is worth sweeping and how to read it. */
type Knob = {
  key: keyof Knobs;
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
  { key: "pieces", label: "Pieces", min: 6, max: 400, step: 1, format: (v) => `${v}` },
  { key: "size", label: "Piece size", min: 6, max: 64, step: 1, format: (v) => `${v}px` },
  {
    key: "sizeSpread",
    label: "Size spread",
    min: 0,
    max: 0.9,
    step: 0.05,
    format: (v) => `±${Math.round(v * 100)}%`,
    hint: "How much bigger and smaller than that a piece may be.",
  },
  {
    key: "originY",
    label: "Launch height",
    min: 0.05,
    max: 1.1,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}% down`,
    hint: "0% is the top of the screen, 100% the bottom.",
  },
  {
    key: "spreadX",
    label: "Launch width",
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}% of the screen`,
  },
  { key: "speed", label: "Launch speed", min: 1, max: 30, step: 0.5, format: (v) => `${v}` },
  { key: "gravity", label: "Gravity", min: 0.05, max: 1.6, step: 0.01, format: (v) => `${v}` },
  { key: "spin", label: "Spin", min: 0, max: 0.8, step: 0.01, format: (v) => `±${v}` },
  {
    key: "fadeAt",
    label: "Fades below",
    min: 0.1,
    max: 2,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}% down`,
    hint: "Past 100% a piece leaves the screen before it starts to fade.",
  },
  {
    key: "outline",
    label: "Outline weight",
    min: 0.1,
    max: 2,
    step: 0.05,
    format: (v) => `${v} of 24`,
    hint: "In the box the shapes are drawn in, so the line keeps its weight as the size changes.",
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
  outline,
  picked,
  onPick,
  onThrow,
}: {
  name: string;
  source: ConfettiPack;
  thrown: number;
  outline: number;
  picked: boolean;
  onPick: () => void;
  onThrow: () => void;
}) {
  const layers = layersOf(source.shapes[name], source);
  const tint = source.colors?.[0] ?? "#e8c98a";
  const svg = (px: number) => (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
      {layers.map((layer, i) => (
        <path key={i} d={layer.d} fill={layer.fill ?? tint} fillRule="evenodd" />
      ))}
      {/* The same second pass the canvas makes, for the same reason. */}
      {outline > 0 &&
        layers.map((layer, i) => (
          <path
            key={`o${i}`}
            d={layer.d}
            fill="none"
            stroke="#000"
            strokeWidth={outline}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
    </svg>
  );
  return (
    <div className={`shape-card ${picked ? "shape-card--picked" : ""}`}>
      <div className="shape-card__sizes" onClick={onThrow} title={`Throw ${name}`}>
        {svg(64)}
        {svg(24)}
        {svg(thrown)}
      </div>
      <label className="shape-card__pick">
        <input type="checkbox" checked={picked} onChange={onPick} />
        <span>{name}</span>
      </label>
    </div>
  );
}

export function ConfettiPlayground({
  onFire,
}: {
  onFire: (options?: BurstOptions) => void;
}) {
  const store = useMemo(() => browserStore(), []);
  const [knobs, setKnobs] = useState(() => loadKnobs(store));
  const [set, setSet] = useState<SetName>("new");
  const [picked, setPicked] = useState<string[]>([]);

  const live = pack as ConfettiPack;
  const known = useMemo(() => new Set(Object.keys(live.shapes)), [live]);
  const [groups, setGroups] = useState<Group[]>(() => loadGroups(store, live.throws, known));

  // Kept so a tuning session survives a reload — you are usually reloading
  // because you just changed a path.
  useEffect(() => saveKnobs(store, knobs), [store, knobs]);
  useEffect(() => saveGroups(store, groups), [store, groups]);

  // Stated rather than worked around: with reduced motion on, nothing fires,
  // and a playground whose buttons silently did nothing would read as a bug.
  const muted =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const source = SETS[set].pack;
  const options = (group?: string[]): BurstOptions => ({ ...knobs, group, source });
  const names = Object.keys(source.shapes);
  const on = groups.filter((g) => g.on).length;

  const toggle = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]));

  return (
    <>
      <div className="section-title">Confetti playground</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {muted
          ? "This device asks for reduced motion, so nothing will fire — by design, and there is no override. The gallery below still works."
          : "Tap a shape to throw it. A burst normally picks one live group at random every ten to twenty answers."}
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
            outline={knobs.outline}
            picked={picked.includes(name)}
            onPick={() => toggle(name)}
            onThrow={() => onFire(options([name]))}
          />
        ))}
      </div>

      {/* Composing groups only makes sense against the set that ships. */}
      {set === "new" && (
        <>
          <div className="actions">
            <button className="btn" disabled={!picked.length} onClick={() => onFire(options(picked))}>
              Throw the {picked.length} picked
            </button>
            <button
              className="btn"
              disabled={!picked.length}
              onClick={() => {
                setGroups((g) => [{ shapes: picked, on: true }, ...g]);
                setPicked([]);
              }}
            >
              Make a group
            </button>
            <button className="btn btn--quiet" disabled={!picked.length} onClick={() => setPicked([])}>
              Clear
            </button>
          </div>

          <div className="section-title">
            Groups — {on} of {groups.length} live
          </div>
          <p className="field__hint" style={{ marginTop: 0 }}>
            A real burst draws from the live ones, here and in the session behind
            this sheet. Copy them out when you are happy, or they stay in this
            browser.
          </p>
          <div className="group-list">
            {groups.map((group, i) => (
              <div className="group-row" key={`${group.shapes.join("-")}-${i}`}>
                <label className="group-row__on">
                  <input
                    type="checkbox"
                    checked={group.on}
                    onChange={() =>
                      setGroups((g) => g.map((x, j) => (i === j ? { ...x, on: !x.on } : x)))
                    }
                  />
                  <span>{groupLabel(group.shapes)}</span>
                </label>
                <button
                  className="btn btn--quiet group-row__throw"
                  onClick={() => onFire(options(group.shapes))}
                >
                  Throw
                </button>
                <button
                  className="btn btn--quiet group-row__drop"
                  aria-label={`Delete ${groupLabel(group.shapes)}`}
                  onClick={() => setGroups((g) => g.filter((_, j) => i !== j))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="actions">
            <button className="btn" onClick={() => onFire(options())}>
              Random throw
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => navigator.clipboard?.writeText(asThrows(groups))}
              title="Copy the live groups as the throws block in confetti.mjs"
            >
              Copy throws
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => setGroups(loadGroups({ getItem: () => null, setItem: () => {} }, live.throws, known))}
            >
              Reset groups
            </button>
          </div>
        </>
      )}

      {KNOBS.map((knob) => (
        <label className="field" key={knob.key}>
          <span className="field__label">
            {knob.label} — {knob.key === "outline" && !knobs.outline ? "none" : knob.format(knobs[knob.key])}
          </span>
          {knob.key === "outline" && (
            <label className="field__check">
              <input
                type="checkbox"
                checked={knobs.outline > 0}
                onChange={(e) => setKnobs((k) => ({ ...k, outline: e.target.checked ? 0.7 : 0 }))}
              />
              <span>Outline every shape in black</span>
            </label>
          )}
          <input
            type="range"
            min={knob.min}
            max={knob.max}
            step={knob.step}
            value={knobs[knob.key]}
            disabled={knob.key === "outline" && !knobs.outline}
            onChange={(e) => setKnobs((k) => ({ ...k, [knob.key]: Number(e.target.value) }))}
          />
          {knob.hint && <span className="field__hint">{knob.hint}</span>}
        </label>
      ))}

      <div className="actions">
        <button className="btn btn--quiet" onClick={() => setKnobs(DEFAULTS)}>
          Reset sliders
        </button>
        <button
          className="btn btn--quiet"
          onClick={() => navigator.clipboard?.writeText(asDefaults(knobs))}
          title="Copy these settings as the DEFAULTS block in bench.ts"
        >
          Copy as defaults
        </button>
      </div>
    </>
  );
}
