/**
 * The confetti playground — a way to see a burst without answering fifteen
 * questions to earn one.
 *
 * It is not for students. It appears only when the repository owner in
 * Settings is this repo's author, which is a deliberately weak lock: the point
 * is to keep a debugging control out of the way of someone studying, not to
 * keep a secret. Anyone who types the name gets the toy, and nothing behind it
 * is worth guarding.
 */
import { useState } from "react";
import pack from "@pack/confetti";
import type { BurstOptions } from "./Confetti.js";

/**
 * Whose build this is. The playground is a workbench for whoever maintains the
 * packs' silhouettes, and this is how it knows it is on their machine.
 */
export const AUTHOR = "qbalin";

/** Is the owner configured in Settings this repo's author? */
export function isAuthor(owner: string | undefined | null): boolean {
  return (owner ?? "").trim().toLowerCase() === AUTHOR;
}

/** Named for the shapes it throws, so the buttons read as what they do. */
function groupLabel(group: string[]): string {
  return group.join(" + ");
}

export function ConfettiPlayground({
  onFire,
}: {
  onFire: (options?: BurstOptions) => void;
}) {
  const [size, setSize] = useState(11);
  const [pieces, setPieces] = useState(64);
  const [shaped, setShaped] = useState(35);

  // Stated rather than worked around: with reduced motion on, nothing fires,
  // and a playground whose buttons silently did nothing would read as a bug.
  const muted =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const options = (group?: string[]): BurstOptions => ({
    group,
    size,
    pieces,
    shapedShare: shaped / 100,
  });

  return (
    <>
      <div className="section-title">Confetti playground</div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {muted
          ? "This device asks for reduced motion, so nothing will fire — by design, and there is no override."
          : "Throw a burst now. Each button is one of this pack's throw groups; a burst normally picks one at random every ten to twenty answers."}
      </p>

      <div className="actions">
        <button className="btn" onClick={() => onFire(options())}>
          Random throw
        </button>
        {pack.throws.map((group) => (
          <button
            key={group.join("-")}
            className="btn"
            onClick={() => onFire(options(group))}
          >
            {groupLabel(group)}
          </button>
        ))}
      </div>

      <label className="field">
        <span className="field__label">Piece size — {size}px</span>
        <input
          type="range"
          min={6}
          max={24}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span className="field__label">Pieces — {pieces}</span>
        <input
          type="range"
          min={12}
          max={200}
          value={pieces}
          onChange={(e) => setPieces(Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span className="field__label">Shaped share — {shaped}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={shaped}
          onChange={(e) => setShaped(Number(e.target.value))}
        />
        <span className="field__hint">
          How many pieces carry a silhouette rather than being a plain sliver.
          The shipped value is 35%: often enough to be found, rare enough to
          stay a find.
        </span>
      </label>
    </>
  );
}
