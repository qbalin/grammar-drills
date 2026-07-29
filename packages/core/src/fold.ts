/**
 * Folding — what counts as "the same word".
 *
 * Every lookup, every answer comparison and every vocabulary card id passes
 * through the fold, so it is the one piece of language knowledge the runtime
 * cannot do without. It is data rather than code: a pack declares its rules in
 * `profile.fold` and this compiles them.
 *
 * The rules differ sharply between languages and getting them wrong is silent.
 * Latin's macrons are editorial and u/v, i/j are spelling variants, so all of
 * them fold away. Vietnamese tones and Arabic shadda are not editorial at all,
 * and stripping them would mark wrong answers right forever. Hence the
 * must-equal / must-differ fixtures every pack ships.
 */

export interface FoldSpec {
  /** Trim surrounding whitespace. */
  trim?: boolean;
  /** Case folding. Greek's final sigma still needs a `map` entry as well. */
  caseFold: "lower" | "none";
  /** Applied before `stripMarks`; NFD is required to reach precomposed marks. */
  decompose: "NFD" | "NFC" | "none";
  /** Character-class bodies whose characters are deleted, e.g. "\\u0300-\\u036f". */
  stripMarks: string[];
  /** Characters exempted from `stripMarks`, for "strip accents, keep breathings". */
  keepMarks?: string[];
  /** Literal replacements, applied longest key first in one left-to-right pass. */
  map: Array<[string, string]>;
  /** Canonical form of the emitted key. Must be NFC wherever a sorted index is bisected. */
  recompose: "NFD" | "NFC" | "none";
}

export type Fold = (word: string) => string;

const cache = new WeakMap<FoldSpec, Fold>();

function escapeClass(body: string): string {
  // Class bodies arrive as regex source ("\\u0300-\\u036f"), so they are used
  // verbatim; only a stray "]" could close the class early.
  return body.replace(/\]/g, "\\]");
}

/**
 * Compile a spec into a pure fold. Memoized on the spec object, since the same
 * profile is folded through on every keystroke of every lookup.
 */
export function compileFold(spec: FoldSpec): Fold {
  const hit = cache.get(spec);
  if (hit) return hit;

  const strip = spec.stripMarks.length
    ? new RegExp("[" + spec.stripMarks.map(escapeClass).join("") + "]", "gu")
    : null;
  const keep = new Set(spec.keepMarks ?? []);
  // Longest first, so a two-character rule is never pre-empted by a one-character one.
  const pairs = [...spec.map].sort((a, b) => b[0].length - a[0].length);

  const fold: Fold = (word: string) => {
    let s = spec.trim === false ? word : word.trim();
    if (spec.caseFold === "lower") s = s.toLowerCase();
    if (spec.decompose !== "none") s = s.normalize(spec.decompose);
    if (strip) {
      s = keep.size
        ? s.replace(strip, (c) => (keep.has(c) ? c : ""))
        : s.replace(strip, "");
    }
    if (pairs.length) s = replaceAll(s, pairs);
    if (spec.recompose !== "none") s = s.normalize(spec.recompose);
    return s;
  };

  cache.set(spec, fold);
  return fold;
}

/**
 * One left-to-right pass, so replaced text is never rescanned: a pack mapping
 * v->u and u->y must not turn `v` into `y`.
 */
function replaceAll(s: string, pairs: Array<[string, string]>): string {
  let out = "";
  let i = 0;
  outer: while (i < s.length) {
    for (const [from, to] of pairs) {
      if (from && s.startsWith(from, i)) {
        out += to;
        i += from.length;
        continue outer;
      }
    }
    out += s[i++];
  }
  return out;
}
