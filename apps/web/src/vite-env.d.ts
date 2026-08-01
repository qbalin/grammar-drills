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
 * silhouettes this language throws, which groups of them may share one burst,
 * and the colours a piece may take.
 */
declare module "@pack/confetti" {
  const confetti: {
    /** SVG path data in a 24x24 box, keyed by shape name. */
    shapes: Record<string, string>;
    /** One burst draws from exactly one of these groups. */
    throws: string[][];
    colors: string[];
  };
  export default confetti;
}
