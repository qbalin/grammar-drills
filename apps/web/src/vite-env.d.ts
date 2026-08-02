/**
 * `@pack/profile` is aliased by `vite.config.ts` to the profile.json of the
 * language this build is for (LANG_PACK, default latin).
 */
declare module "@pack/profile" {
  const profile: unknown;
  export default profile;
}

/**
 * `@pack/confetti` is aliased the same way, to the pack's confetti.mjs: the
 * shapes this language throws, which groups of them may share one burst, and
 * the colours they are painted in.
 *
 * A shape is layers of `[paint, path]`, drawn back to front, where each paint
 * names a colour in `palette`. The older single-path form is still accepted —
 * see `confetti/shapes.ts`, which is the only place that reads either.
 */
declare module "@pack/confetti" {
  const confetti: {
    /** SVG path data in a 24x24 box, layered, keyed by shape name. */
    shapes: Record<string, [string, string][]>;
    /** One burst draws from exactly one of these groups. */
    throws: string[][];
    /** The colours a layer may name. */
    palette?: Record<string, string>;
  };
  export default confetti;
}
