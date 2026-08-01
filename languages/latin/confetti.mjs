/**
 * What this pack throws when the confetti fires.
 *
 * Sword and shield, which are the one pair allowed to share a throw — they
 * are a kit, and a burst holding both reads as one idea rather than two.
 *
 * Every path is a filled silhouette in a 24x24 box, rendered with fill-rule
 * evenodd — which is where all the detail comes from, since a piece is one flat
 * colour. A subpath drawn inside another is a hole; two subpaths that overlap
 * punch a hole in each other. That is why the shapes below either nest or
 * touch, and never cross.
 *
 * Sits beside icon.mjs for the same reason that does: the look of a language is
 * the pack's business, and `packages/core` must not learn a language.
 */
export default {
  /** Silhouettes, keyed by name. */
  shapes: {
    // gladius — short sword
    gladius:
      "M10.8 1.4 L13.2 1.4 L13.8 13.0 L12 15.4 L10.2 13.0 Z M7.0 13.4 L17.0 13.4 L17.0 15.4 L7.0 15.4 Z M11.0 15.6 L13.0 15.6 L13.0 20.2 L11.0 20.2 Z M9.8 20.4 C9.8 19.6 10.8 19.2 12 19.2 C13.2 19.2 14.2 19.6 14.2 20.4 C14.2 21.4 13.2 22.2 12 22.2 C10.8 22.2 9.8 21.4 9.8 20.4 Z",
    // scutum — legionary shield
    scutum:
      "M6.4 2.2 L17.6 2.2 C18.6 2.2 19.2 2.9 19.2 3.9 L19.2 20.1 C19.2 21.1 18.6 21.8 17.6 21.8 L6.4 21.8 C5.4 21.8 4.8 21.1 4.8 20.1 L4.8 3.9 C4.8 2.9 5.4 2.2 6.4 2.2 Z M11.1 3.4 L12.9 3.4 L12.9 9.8 L11.1 9.8 Z M11.1 14.2 L12.9 14.2 L12.9 20.6 L11.1 20.6 Z M12 9.4 A2.6 2.6 0 1 1 11.99 9.4 Z",
  },

  /**
   * One burst draws from exactly one of these groups. A group with a single
   * name is a burst of only that shape.
   */
  throws: [["gladius"],["scutum"],["gladius","scutum"]],

  /**
   * The colours a piece may take, warmest first. The pack's gold, which is the
   * icon's gold, in four tints so a burst has depth without gaining a hue.
   */
  colors: ["#e8c98a", "#d9b673", "#f0dcb0", "#c49a5c"],
};
