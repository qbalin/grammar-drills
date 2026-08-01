/**
 * What this pack throws when the confetti fires.
 *
 * Seven shapes, each thrown on its own. A burst that mixed an amphora with
 * a trireme would read as a jumble; a burst that is all one thing reads as a
 * motif, and the student slowly collects the set.
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
    // ἀμφορεύς — amphora
    amphora:
      "M9.6 1.6 L14.4 1.6 L14.4 3.4 L13.4 4.6 C16.8 6.0 18.6 9.0 18.6 12.6 C18.6 16.6 15.9 19.6 12.9 20.6 L12.9 22.4 L11.1 22.4 L11.1 20.6 C8.1 19.6 5.4 16.6 5.4 12.6 C5.4 9.0 7.2 6.0 10.6 4.6 L9.6 3.4 Z M8.4 5.4 C6.2 6.0 4.6 7.6 4.2 9.8 L6.0 9.8 C6.4 8.4 7.4 7.4 9.0 6.9 Z M15.6 5.4 C17.8 6.0 19.4 7.6 19.8 9.8 L18.0 9.8 C17.6 8.4 16.6 7.4 15.0 6.9 Z",
    // ἐλαία — olive sprig
    olive:
      "M4.2 20.8 C7.6 17.2 12.4 12.0 19.4 5.2 L20.6 6.4 C13.8 13.2 8.6 18.2 5.4 21.8 Z M11.6 12.2 C10.0 10.2 10.4 7.6 12.6 6.4 C13.6 8.8 13.4 10.8 11.6 12.2 Z M14.8 9.0 C13.4 6.8 14.0 4.4 16.2 3.4 C17.0 5.8 16.6 7.8 14.8 9.0 Z M9.2 14.6 C7.2 13.4 6.6 11.0 8.0 9.0 C9.8 10.8 10.4 12.8 9.2 14.6 Z M17.4 11.0 A1.8 1.8 0 1 1 17.39 11.0 Z M13.0 15.4 A1.8 1.8 0 1 1 12.99 15.4 Z",
    // λύρα — tortoise-shell lyre
    lyre:
      "M12 21.8 C9.0 21.8 6.8 19.9 6.8 17.2 C6.8 14.7 9.0 13.0 12 13.0 C15.0 13.0 17.2 14.7 17.2 17.2 C17.2 19.9 15.0 21.8 12 21.8 Z M9.2 14.0 C6.6 11.4 5.4 8.2 6.0 4.8 L8.0 5.1 C7.5 8.0 8.4 10.7 10.5 13.0 Z M14.8 14.0 C17.4 11.4 18.6 8.2 18.0 4.8 L16.0 5.1 C16.5 8.0 15.6 10.7 13.5 13.0 Z M5.0 3.4 L19.0 3.4 L19.0 5.2 L5.0 5.2 Z M10.3 5.4 L10.9 5.4 L10.9 13.2 L10.3 13.2 Z M11.7 5.4 L12.3 5.4 L12.3 13.2 L11.7 13.2 Z M13.1 5.4 L13.7 5.4 L13.7 13.2 L13.1 13.2 Z",
    // τριήρης — trireme
    trireme:
      "M2.4 13.2 L21.6 13.2 C20.7 17.3 17.2 20.0 12 20.0 C6.8 20.0 3.3 17.3 2.4 13.2 Z M0.5 14.4 L3.2 12.2 L3.2 15.0 Z M11.2 1.8 L12.8 1.8 L12.8 4.7 L11.2 4.7 Z M11.2 9.9 L12.8 9.9 L12.8 12.8 L11.2 12.8 Z M4.6 4.7 C9.0 3.5 15.0 3.5 19.4 4.7 L19.4 10.0 L4.6 10.0 Z M5.6 20.2 L6.7 22.8 L5.6 22.8 L4.8 20.2 Z M9.2 20.4 L10.0 23.0 L8.9 23.0 L8.4 20.4 Z M14.8 20.4 L15.6 20.4 L15.1 23.0 L14.0 23.0 Z M18.4 20.2 L19.2 20.2 L18.4 22.8 L17.3 22.8 Z",
    // κιόκρανον — Ionic capital
    capital:
      "M3.4 6.6 L20.6 6.6 L20.6 9.0 L3.4 9.0 Z M4.0 9.6 C4.0 12.6 5.8 14.6 8.2 14.6 C10.0 14.6 11.2 13.4 11.2 11.9 C11.2 10.6 10.3 9.7 9.1 9.7 C8.1 9.7 7.4 10.4 7.4 11.3 C7.4 12.0 7.9 12.5 8.6 12.5 C9.0 12.5 9.3 12.3 9.5 12.0 C9.4 12.9 8.9 13.4 8.1 13.4 C6.8 13.4 6.0 12.2 6.0 10.4 L6.0 9.6 Z M20.0 9.6 C20.0 12.6 18.2 14.6 15.8 14.6 C14.0 14.6 12.8 13.4 12.8 11.9 C12.8 10.6 13.7 9.7 14.9 9.7 C15.9 9.7 16.6 10.4 16.6 11.3 C16.6 12.0 16.1 12.5 15.4 12.5 C15.0 12.5 14.7 12.3 14.5 12.0 C14.6 12.9 15.1 13.4 15.9 13.4 C17.2 13.4 18.0 12.2 18.0 10.4 L18.0 9.6 Z M8.6 15.2 L15.4 15.2 L16.2 21.4 L7.8 21.4 Z",
    // κύλιξ — drinking cup
    kylix:
      "M3.6 7.6 L20.4 7.6 C19.6 12.2 16.4 15.0 12 15.0 C7.6 15.0 4.4 12.2 3.6 7.6 Z M11.1 14.6 L12.9 14.6 L12.9 18.6 L11.1 18.6 Z M7.2 18.6 L16.8 18.6 L16.8 20.6 L7.2 20.6 Z M2.2 8.2 C1.0 9.4 1.4 11.2 3.0 11.6 L3.4 9.9 C2.9 9.7 2.8 9.2 3.1 8.8 Z M21.8 8.2 C23.0 9.4 22.6 11.2 21.0 11.6 L20.6 9.9 C21.1 9.7 21.2 9.2 20.9 8.8 Z",
    // Ω — omega
    omega:
      "M12 2.6 C7.4 2.6 4.4 6.0 4.4 10.6 C4.4 13.4 5.6 15.8 7.6 17.2 L7.6 18.6 L3.6 18.6 L3.6 21.4 L10.4 21.4 L10.4 15.6 C8.4 14.8 7.4 13.0 7.4 10.8 C7.4 7.8 9.2 5.6 12 5.6 C14.8 5.6 16.6 7.8 16.6 10.8 C16.6 13.0 15.6 14.8 13.6 15.6 L13.6 21.4 L20.4 21.4 L20.4 18.6 L16.4 18.6 L16.4 17.2 C18.4 15.8 19.6 13.4 19.6 10.6 C19.6 6.0 16.6 2.6 12 2.6 Z",
  },

  /**
   * One burst draws from exactly one of these groups. A group with a single
   * name is a burst of only that shape.
   */
  throws: [["amphora"],["olive"],["lyre"],["trireme"],["capital"],["kylix"],["omega"]],

  /**
   * The colours a piece may take, warmest first. The pack's gold, which is the
   * icon's gold, in four tints so a burst has depth without gaining a hue.
   */
  colors: ["#e8c98a", "#d9b673", "#f0dcb0", "#c49a5c"],
};
