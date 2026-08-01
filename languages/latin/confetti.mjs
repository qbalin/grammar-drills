/**
 * What this pack throws when the confetti fires.
 *
 * Five shapes. Sword and shield are the one pair allowed to share a throw —
 * they are a kit, and a burst holding both reads as one idea rather than two.
 * The rest are thrown alone.
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
    // pugio — dagger
    pugio:
      "M12 1.2 L14.6 6.4 L14.2 13.2 L9.8 13.2 L9.4 6.4 Z M7.4 13.4 L16.6 13.4 L16.6 15.2 L7.4 15.2 Z M10.6 15.4 L13.4 15.4 L12.8 18.0 L13.4 20.0 L10.6 20.0 L11.2 18.0 Z M9.4 20.2 L14.6 20.2 L14.6 22.4 L9.4 22.4 Z",
    // vexillum — cavalry banner
    vexillum:
      "M11.2 1.4 L12.8 1.4 L12.8 22.4 L11.2 22.4 Z M4.4 3.4 L19.6 3.4 L19.6 5.2 L4.4 5.2 Z M6.0 5.2 L18.0 5.2 L18.0 15.4 L6.0 15.4 Z M6.0 16.2 L7.4 16.2 L7.4 18.8 L6.0 18.8 Z M9.0 16.2 L10.4 16.2 L10.4 18.8 L9.0 18.8 Z M13.6 16.2 L15.0 16.2 L15.0 18.8 L13.6 18.8 Z M16.6 16.2 L18.0 16.2 L18.0 18.8 L16.6 18.8 Z M12 0.4 L13.4 2.4 L10.6 2.4 Z",
    // rota — chariot wheel
    rota:
      "M12 1.4 A10.6 10.6 0 1 0 12 22.6 A10.6 10.6 0 1 0 12 1.4 Z M12 4.2 A7.8 7.8 0 1 1 12 19.8 A7.8 7.8 0 1 1 12 4.2 Z M11.2 4.4 L12.8 4.4 L12.8 19.6 L11.2 19.6 Z M4.6 11.2 L19.4 11.2 L19.4 12.8 L4.6 12.8 Z M6.6 5.5 L18.5 17.4 L17.4 18.5 L5.5 6.6 Z M17.4 5.5 L18.5 6.6 L6.6 18.5 L5.5 17.4 Z M12 9.8 A2.2 2.2 0 1 1 11.99 9.8 Z",
  },

  /**
   * One burst draws from exactly one of these groups. A group with a single
   * name is a burst of only that shape.
   */
  throws: [["gladius"],["scutum"],["gladius","scutum"],["pugio"],["vexillum"],["rota"]],

  /**
   * The colours a piece may take, warmest first. The pack's gold, which is the
   * icon's gold, in four tints so a burst has depth without gaining a hue.
   */
  colors: ["#e8c98a", "#d9b673", "#f0dcb0", "#c49a5c"],
};
