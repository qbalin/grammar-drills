/**
 * What this pack throws when the confetti fires.
 *
 * The soldier's kit, the writing desk, the arena and the chariot, and the four
 * things Rome built that a beginner would name.
 *
 * Twenty shapes, which is what is left of three times that many. The pack spent
 * four passes drawing everything the reference sheets had and a bench in
 * Settings to look at them on; this is the set that survived being looked at,
 * and the rest has gone rather than being kept around to be compared against.
 * Git remembers it.
 *
 * A shape is a stack of layers, `[paint, path]`, painted back to front, each a
 * path in a 24x24 box. Every layer is filled `evenodd`, so a subpath nested
 * inside another *within one layer* is a hole — that is how the boss is set
 * into the shield and the arch is opened out of the wall. Across layers there is no such rule: a later layer
 * simply covers the one beneath, which is where the colour comes from. Draw the
 * board, then the wings on it.
 *
 * That is the whole reason the format changed. A piece used to be one flat
 * colour, so the scutum could not be the red board with gold wings that everyone
 * pictures, and the blade of a sword was the same gold as its grip.
 *
 * Paints are named, and resolved through `palette` below, so the pack's colours
 * are tuned in one place. `languages/latin/pack.test.ts` fails on a name that
 * is not there.
 *
 * Draw them at 40px, then look at them at 17px, which is the size they are
 * thrown at; anything that needs its fine detail to be recognized will not
 * survive. That is what took the count down.
 *
 * Sits beside icon.mjs for the same reason that does: the look of a language is
 * the pack's business, and `packages/core` must not learn a language.
 */

/**
 * What Rome is made of, here. The gold is the icon's gold; the red is the one
 * the Praetorian shields are painted in every reconstruction, which is what the
 * shape has to look like to be recognised even if the pigment is arguable.
 */
const palette = {
  gold: "#e8c98a",
  goldDeep: "#c49a5c",
  bronze: "#b5793a",
  blood: "#a92b25",
  bloodDark: "#7a1a18",
  steel: "#ccd3db",
  steelDark: "#98a2ae",
  iron: "#5a616b",
  bone: "#e6d9bb",
  wood: "#8a6234",
  woodDark: "#59401f",
  laurel: "#6f9147",
  laurelDark: "#4b6b2f",
  papyrus: "#efe3c4",
  ink: "#2e2820",
  clay: "#c8703f",
  flame: "#f0a83c",
  // Added for the third pass, which models light on a shape rather than
  // filling it flat: every material wants a lit face and a turned-away one.
  steelLight: "#eef3f8",
  bronzeDark: "#7d4f22",
  bloodLight: "#c8443c",
  goldLight: "#f7e8c6",
  woodLight: "#a87c48",
  // Added for the fourth pass, which is where the buildings arrived and the
  // pack first needed something it was not made of. Travertine rather than
  // marble: the aqueducts and the amphitheatre are the warm buff stone Rome
  // actually built in, and a white one would read as Greek.
  stone: "#ded2bd",
  stoneShade: "#b2a68e",
  stoneLight: "#f3ecdd",
  // The dark of a hollow: the shadow the amphitheatre's seating sits in.
  hideDark: "#5f5b56",
};

export default {
  palette,

  /** Shapes, keyed by name, each a stack of layers painted back to front. */
  shapes: {
    // stilus — pointed at one end for writing, flat at the other for unwriting.
    // Drawn heavier than it really is: a stylus at its true proportions is a
    // line, and a line is nothing at 17px.
    stilus: [
      ["bronze", "M10.5 4.4 L13.5 4.4 L13.5 17.6 L10.5 17.6 Z"],
      ["iron", "M12 0.8 L13.8 4.4 L10.2 4.4 Z"],
      ["iron", "M9.4 17.6 L14.6 17.6 L14.6 20.8 C14.6 22.0 13.4 22.9 12 22.9 C10.6 22.9 9.4 22.0 9.4 20.8 Z"],
      ["gold", "M10.5 6.2 L13.5 6.2 L13.5 7.4 L10.5 7.4 Z M10.5 8.6 L13.5 8.6 L13.5 9.8 L10.5 9.8 Z"],
    ],

    // corona — the laurel crown, two branches meeting under a ribbon
    corona: [
      ["laurelDark", "M11.6 21.4 C6.4 20.4 3.0 16.2 3.0 11.4 C3.0 7.8 4.8 4.8 7.4 3.2 L8.4 4.8 C6.2 6.2 4.8 8.6 4.8 11.4 C4.8 15.4 7.6 18.8 11.8 19.6 Z M12.4 21.4 C17.6 20.4 21.0 16.2 21.0 11.4 C21.0 7.8 19.2 4.8 16.6 3.2 L15.6 4.8 C17.8 6.2 19.2 8.6 19.2 11.4 C19.2 15.4 16.4 18.8 12.2 19.6 Z"],
      ["laurel", "M4.2 8.6 C3.0 7.2 3.2 5.4 4.8 4.6 C5.6 6.2 5.4 7.6 4.2 8.6 Z M3.6 12.6 C2.2 11.8 1.8 10.0 3.0 8.8 C4.2 10.0 4.4 11.4 3.6 12.6 Z M4.6 16.4 C3.2 16.0 2.4 14.4 3.2 13.0 C4.6 13.8 5.2 15.0 4.6 16.4 Z M7.0 19.2 C5.6 19.2 4.4 17.9 4.8 16.4 C6.3 16.8 7.2 17.8 7.0 19.2 Z M8.4 5.0 C7.6 3.4 8.4 1.8 10.1 1.6 C10.2 3.3 9.6 4.5 8.4 5.0 Z"],
      ["laurel", "M19.8 8.6 C21.0 7.2 20.8 5.4 19.2 4.6 C18.4 6.2 18.6 7.6 19.8 8.6 Z M20.4 12.6 C21.8 11.8 22.2 10.0 21.0 8.8 C19.8 10.0 19.6 11.4 20.4 12.6 Z M19.4 16.4 C20.8 16.0 21.6 14.4 20.8 13.0 C19.4 13.8 18.8 15.0 19.4 16.4 Z M17.0 19.2 C18.4 19.2 19.6 17.9 19.2 16.4 C17.7 16.8 16.8 17.8 17.0 19.2 Z M15.6 5.0 C16.4 3.4 15.6 1.8 13.9 1.6 C13.8 3.3 14.4 4.5 15.6 5.0 Z"],
      ["gold", "M9.0 21.4 L11.0 21.0 L11.4 22.9 L9.4 23.2 Z M15.0 21.4 L13.0 21.0 L12.6 22.9 L14.6 23.2 Z M10.6 20.0 L13.4 20.0 L13.4 22.0 L10.6 22.0 Z"],
    ],

    // fuscina — the retiarius' trident, thrown with the net.
    //
    // The tines run most of the height and the crossbar sits at the very foot
    // of them. Drawn the other way round — short tines on a wide bar — this is
    // a table fork, which is what the first attempt looked like.
    fuscina: [
      ["wood", "M11.1 9.8 L12.9 9.8 L12.9 23.2 L11.1 23.2 Z"],
      ["steel", "M5.2 1.6 L6.9 1.6 L6.9 9.8 L5.2 9.8 Z M6.05 0.2 L7.2 2.4 L4.9 2.4 Z M11.15 1.2 L12.85 1.2 L12.85 9.8 L11.15 9.8 Z M12 -0.4 L13.2 1.8 L10.8 1.8 Z M17.1 1.6 L18.8 1.6 L18.8 9.8 L17.1 9.8 Z M17.95 0.2 L19.1 2.4 L16.8 2.4 Z M5.2 8.2 L18.8 8.2 L18.8 9.8 L5.2 9.8 Z"],
      ["steelDark", "M6.9 3.4 L8.6 5.0 L6.9 5.0 Z M12.85 3.0 L14.55 4.6 L12.85 4.6 Z M18.8 3.4 L20.5 5.0 L18.8 5.0 Z"],
      ["bronze", "M11.1 12.0 L12.9 12.0 L12.9 13.4 L11.1 13.4 Z M11.1 15.4 L12.9 15.4 L12.9 16.8 L11.1 16.8 Z"],
    ],

    // cassisClathrata — the murmillo's helmet with the grille it really had:
    // a mesh over the whole face, not two eyeholes
    cassisClathrata: [
      ["blood", "M8.4 6.6 C8.8 2.0 10.4 0.6 12 0.6 C13.6 0.6 15.2 2.0 15.6 6.6 Z"],
      ["iron", "M5.8 11.4 C5.8 6.8 8.4 4.2 12 4.2 C15.6 4.2 18.2 6.8 18.2 11.4 L18.2 15.6 C18.2 19.2 15.4 21.4 12 21.4 C8.6 21.4 5.8 19.2 5.8 15.6 Z"],
      ["bronze", "M3.4 10.2 L20.6 10.2 L20.6 12.4 L3.4 12.4 Z"],
      ["ink", "M7.4 12.6 L16.6 12.6 L16.6 17.2 C16.6 19.4 14.6 20.8 12 20.8 C9.4 20.8 7.4 19.4 7.4 17.2 Z"],
      ["bronze", "M9.2 12.6 L9.9 12.6 L9.9 20.4 L9.2 20.4 Z M11.65 12.6 L12.35 12.6 L12.35 20.8 L11.65 20.8 Z M14.1 12.6 L14.8 12.6 L14.8 20.4 L14.1 20.4 Z M7.4 14.4 L16.6 14.4 L16.6 15.1 L7.4 15.1 Z M7.5 16.5 L16.5 16.5 L16.5 17.2 L7.5 17.2 Z M8.4 18.6 L15.6 18.6 L15.6 19.3 L8.4 19.3 Z"],
      ["gold", "M6.6 10.8 A0.8 0.8 0 1 0 8.2 10.8 A0.8 0.8 0 1 0 6.6 10.8 Z M15.8 10.8 A0.8 0.8 0 1 0 17.4 10.8 A0.8 0.8 0 1 0 15.8 10.8 Z"],
    ],

    // tabulaDuplex — two tablets hinged, opened out, which is what a letter was
    tabulaDuplex: [
      ["wood", "M2.4 4.2 L11.5 4.2 L11.5 19.8 L2.4 19.8 Z M12.5 4.2 L21.6 4.2 L21.6 19.8 L12.5 19.8 Z"],
      ["ink", "M3.8 5.6 L10.3 5.6 L10.3 18.4 L3.8 18.4 Z M13.7 5.6 L20.2 5.6 L20.2 18.4 L13.7 18.4 Z"],
      ["papyrus", "M5.0 7.4 L9.1 7.4 L9.1 8.2 L5.0 8.2 Z M5.0 9.8 L9.1 9.8 L9.1 10.6 L5.0 10.6 Z M5.0 12.2 L9.1 12.2 L9.1 13.0 L5.0 13.0 Z M5.0 14.6 L7.4 14.6 L7.4 15.4 L5.0 15.4 Z M14.9 7.4 L19.0 7.4 L19.0 8.2 L14.9 8.2 Z M14.9 9.8 L19.0 9.8 L19.0 10.6 L14.9 10.6 Z M14.9 12.2 L19.0 12.2 L19.0 13.0 L14.9 13.0 Z M14.9 14.6 L17.3 14.6 L17.3 15.4 L14.9 15.4 Z"],
      ["bronze", "M11.3 4.2 L12.7 4.2 L12.7 19.8 L11.3 19.8 Z"],
      ["gold", "M11.3 7.0 L12.7 7.0 L12.7 8.6 L11.3 8.6 Z M11.3 15.4 L12.7 15.4 L12.7 17.0 L11.3 17.0 Z"],
    ],

    // currus — the racing chariot. The car sits high and to the rear, the wheel
    // low and forward across it; drawn concentric they read as one blot.
    currus: [
      ["wood", "M0.4 17.4 L9.4 15.4 L9.9 17.4 L0.9 19.4 Z"],
      ["blood", "M9.4 16.0 L9.4 9.0 C9.4 7.2 10.8 6.0 12.8 6.0 L20.0 6.0 C21.0 6.0 21.8 6.8 21.8 7.8 L21.8 16.0 Z"],
      ["gold", "M12.4 5.4 L21.8 5.4 L21.8 7.0 L12.4 7.0 Z M9.4 14.4 L21.8 14.4 L21.8 16.0 L9.4 16.0 Z"],
      // A ring rather than the eagle it really carried: at this size a small
      // eagle is two gold hooks, and two gold hooks are horns.
      ["gold", "M13.4 10.6 A2.8 2.8 0 1 0 19.0 10.6 A2.8 2.8 0 1 0 13.4 10.6 Z M14.4 10.6 A1.8 1.8 0 1 0 18.0 10.6 A1.8 1.8 0 1 0 14.4 10.6 Z"],
      ["iron", "M1.6 17.8 A5.4 5.4 0 1 0 12.4 17.8 A5.4 5.4 0 1 0 1.6 17.8 Z M2.7 17.8 A4.3 4.3 0 1 0 11.3 17.8 A4.3 4.3 0 1 0 2.7 17.8 Z"],
      ["wood", "M6.3 13.5 L7.7 13.5 L7.7 22.1 L6.3 22.1 Z M2.7 17.1 L11.3 17.1 L11.3 18.5 L2.7 18.5 Z"],
      ["bronze", "M5.4 17.8 A1.6 1.6 0 1 0 8.6 17.8 A1.6 1.6 0 1 0 5.4 17.8 Z"],
    ],

    // pilum — the javelin whose thin iron shank bent on impact, so it could not
    // be thrown back. The thin shank on a thick shaft is the whole silhouette.
    pilum: [
      ["iron", "M12 0.4 L13.2 3.2 L10.8 3.2 Z M11.5 3.2 L12.5 3.2 L12.5 12.0 L11.5 12.0 Z"],
      ["bronze", "M10.0 11.6 L14.0 11.6 L14.0 14.4 L10.0 14.4 Z"],
      ["wood", "M10.8 14.4 L13.2 14.4 L13.2 23.2 L10.8 23.2 Z"],
      ["bronze", "M10.8 16.4 L13.2 16.4 L13.2 17.6 L10.8 17.6 Z M10.8 20.0 L13.2 20.0 L13.2 21.2 L10.8 21.2 Z"],
    ],

    // parma — the small round shield the auxiliaries and the cavalry carried
    parma: [
      ["bronze", "M1.6 12 A10.4 10.4 0 1 0 22.4 12 A10.4 10.4 0 1 0 1.6 12 Z M2.8 12 A9.2 9.2 0 1 0 21.2 12 A9.2 9.2 0 1 0 2.8 12 Z"],
      ["blood", "M2.8 12 A9.2 9.2 0 1 0 21.2 12 A9.2 9.2 0 1 0 2.8 12 Z"],
      ["gold", "M12 3.4 L13.8 9.0 L19.6 9.0 L14.9 12.4 L16.7 18.0 L12 14.5 L7.3 18.0 L9.1 12.4 L4.4 9.0 L10.2 9.0 Z"],
      ["bronze", "M9.8 12 A2.2 2.2 0 1 0 14.2 12 A2.2 2.2 0 1 0 9.8 12 Z"],
      ["gold", "M11.1 12 A0.9 0.9 0 1 0 12.9 12 A0.9 0.9 0 1 0 11.1 12 Z"],
    ],

    // ---- third pass ---------------------------------------------------
    // Modelled rather than filled: each shape has a lit face and a turned-away
    // one, an edge treatment, and the surface detail the object actually has —
    // the fuller down a blade, the rivets round a boss, the joints in a felloe.

    gladius3: [
      ["steel", "M12 0.8 L13.7 4.4 L13.8 12.6 L10.2 12.6 L10.3 4.4 Z"],
      ["steelDark", "M12 0.8 L13.7 4.4 L13.8 12.6 L12 12.6 Z"],
      ["steelLight", "M11.45 3.8 L12.55 3.8 L12.6 11.8 L11.4 11.8 Z"],
      ["steelDark", "M11.8 4.2 L12.2 4.2 L12.25 11.4 L11.75 11.4 Z"],
      ["bronze", "M6.6 12.6 L17.4 12.6 C17.4 13.9 16.7 14.8 15.4 14.8 L8.6 14.8 C7.3 14.8 6.6 13.9 6.6 12.6 Z"],
      ["bronzeDark", "M6.7 13.9 L17.3 13.9 C17.1 14.5 16.4 14.8 15.4 14.8 L8.6 14.8 C7.6 14.8 6.9 14.5 6.7 13.9 Z"],
      ["goldLight", "M6.6 12.6 L17.4 12.6 L17.4 13.1 L6.6 13.1 Z"],
      ["bone", "M10.5 14.8 L13.5 14.8 L13.5 19.4 L10.5 19.4 Z"],
      ["woodDark", "M10.5 15.8 L13.5 15.8 L13.5 16.4 L10.5 16.4 Z M10.5 17.0 L13.5 17.0 L13.5 17.6 L10.5 17.6 Z M10.5 18.2 L13.5 18.2 L13.5 18.8 L10.5 18.8 Z"],
      ["bronze", "M10.2 19.2 L13.8 19.2 L13.8 20.0 L10.2 20.0 Z"],
      ["gold", "M9.9 21.4 A2.1 2.1 0 1 0 14.1 21.4 A2.1 2.1 0 1 0 9.9 21.4 Z"],
      ["goldDeep", "M10.3 22.4 C10.9 23.0 13.1 23.0 13.7 22.4 C13.3 23.1 10.7 23.1 10.3 22.4 Z"],
      ["goldLight", "M10.7 20.6 A0.7 0.7 0 1 0 12.1 20.6 A0.7 0.7 0 1 0 10.7 20.6 Z"],
    ],

    scutum3: [
      ["goldDeep", "M6.0 1.8 L18.0 1.8 C19.1 1.8 19.7 2.7 19.7 3.8 L19.7 20.2 C19.7 21.3 19.1 22.2 18.0 22.2 L6.0 22.2 C4.9 22.2 4.3 21.3 4.3 20.2 L4.3 3.8 C4.3 2.7 4.9 1.8 6.0 1.8 Z"],
      ["goldLight", "M6.0 1.8 L18.0 1.8 C18.7 1.8 19.2 2.2 19.5 2.8 L4.5 2.8 C4.8 2.2 5.3 1.8 6.0 1.8 Z"],
      ["blood", "M6.5 2.8 L17.5 2.8 C18.3 2.8 18.7 3.4 18.7 4.1 L18.7 19.9 C18.7 20.6 18.3 21.2 17.5 21.2 L6.5 21.2 C5.7 21.2 5.3 20.6 5.3 19.9 L5.3 4.1 C5.3 3.4 5.7 2.8 6.5 2.8 Z"],
      ["bloodLight", "M6.5 2.8 L8.4 2.8 L8.4 21.2 L6.5 21.2 C5.7 21.2 5.3 20.6 5.3 19.9 L5.3 4.1 C5.3 3.4 5.7 2.8 6.5 2.8 Z"],
      ["bloodDark", "M16.6 2.8 L17.5 2.8 C18.3 2.8 18.7 3.4 18.7 4.1 L18.7 19.9 C18.7 20.6 18.3 21.2 17.5 21.2 L16.6 21.2 Z"],
      ["gold", "M11.0 10.5 C9.0 9.5 7.2 7.9 5.6 5.7 C6.0 8.1 6.8 9.9 8.0 11.3 C7.2 11.1 6.4 11.0 5.6 11.1 C7.0 11.9 8.9 12.5 11.0 12.8 Z M13.0 10.5 C15.0 9.5 16.8 7.9 18.4 5.7 C18.0 8.1 17.2 9.9 16.0 11.3 C16.8 11.1 17.6 11.0 18.4 11.1 C17.0 11.9 15.1 12.5 13.0 12.8 Z M11.0 13.5 C9.0 14.5 7.2 16.1 5.6 18.3 C6.0 15.9 6.8 14.1 8.0 12.7 C7.2 12.9 6.4 13.0 5.6 12.9 C7.0 12.1 8.9 11.5 11.0 11.2 Z M13.0 13.5 C15.0 14.5 16.8 16.1 18.4 18.3 C18.0 15.9 17.2 14.1 16.0 12.7 C16.8 12.9 17.6 13.0 18.4 12.9 C17.0 12.1 15.1 11.5 13.0 11.2 Z"],
      ["goldDeep", "M6.6 7.4 C7.6 9.0 8.6 10.2 9.6 11.0 L9.2 11.5 C8.1 10.7 7.1 9.4 6.2 7.8 Z M17.4 7.4 C16.4 9.0 15.4 10.2 14.4 11.0 L14.8 11.5 C15.9 10.7 16.9 9.4 17.8 7.8 Z M6.6 16.6 C7.6 15.0 8.6 13.8 9.6 13.0 L9.2 12.5 C8.1 13.3 7.1 14.6 6.2 16.2 Z M17.4 16.6 C16.4 15.0 15.4 13.8 14.4 13.0 L14.8 12.5 C15.9 13.3 16.9 14.6 17.8 16.2 Z"],
      ["gold", "M11.4 3.4 L12.6 3.4 L12.6 20.6 L11.4 20.6 Z M12 1.9 L13.8 4.7 L10.2 4.7 Z M12 22.1 L10.2 19.3 L13.8 19.3 Z"],
      ["gold", "M9.9 4.8 L8.3 7.6 L9.5 7.6 L8.5 9.8 L10.2 6.9 L9.0 6.9 Z M14.1 4.8 L15.7 7.6 L14.5 7.6 L15.5 9.8 L13.8 6.9 L15.0 6.9 Z M9.9 19.2 L8.3 16.4 L9.5 16.4 L8.5 14.2 L10.2 17.1 L9.0 17.1 Z M14.1 19.2 L15.7 16.4 L14.5 16.4 L15.5 14.2 L13.8 17.1 L15.0 17.1 Z"],
      ["goldDeep", "M9.2 12 A2.8 2.8 0 1 0 14.8 12 A2.8 2.8 0 1 0 9.2 12 Z"],
      ["bronze", "M9.8 12 A2.2 2.2 0 1 0 14.2 12 A2.2 2.2 0 1 0 9.8 12 Z"],
      ["goldLight", "M10.5 11.2 A1.0 1.0 0 1 0 12.5 11.2 A1.0 1.0 0 1 0 10.5 11.2 Z"],
      ["bronzeDark", "M11.6 9.0 A0.4 0.4 0 1 0 12.4 9.0 A0.4 0.4 0 1 0 11.6 9.0 Z M11.6 14.6 A0.4 0.4 0 1 0 12.4 14.6 A0.4 0.4 0 1 0 11.6 14.6 Z M8.8 11.6 A0.4 0.4 0 1 0 9.6 11.6 A0.4 0.4 0 1 0 8.8 11.6 Z M14.4 11.6 A0.4 0.4 0 1 0 15.2 11.6 A0.4 0.4 0 1 0 14.4 11.6 Z"],
    ],

    galea3: [
      ["blood", "M4.4 8.0 C5.4 3.4 8.4 1.0 12 1.0 C15.6 1.0 18.6 3.4 19.6 8.0 L17.1 8.0 C16.3 4.9 14.4 3.2 12 3.2 C9.6 3.2 7.7 4.9 6.9 8.0 Z"],
      ["bloodDark", "M5.6 5.4 C6.2 4.2 6.9 3.2 7.8 2.5 L8.6 3.5 C7.8 4.2 7.2 5.1 6.7 6.1 Z M18.4 5.4 C17.8 4.2 17.1 3.2 16.2 2.5 L15.4 3.5 C16.2 4.2 16.8 5.1 17.3 6.1 Z M11.4 1.1 L12.6 1.1 L12.6 3.3 L11.4 3.3 Z"],
      ["bronze", "M5.4 13.2 C5.4 8.2 8.3 5.0 12 5.0 C15.7 5.0 18.6 8.2 18.6 13.2 Z"],
      ["bronzeDark", "M12 5.0 C15.7 5.0 18.6 8.2 18.6 13.2 L12 13.2 Z"],
      ["goldLight", "M8.0 12.6 C8.0 9.0 9.4 6.6 11.2 6.2 C10.2 7.4 9.4 9.6 9.3 12.6 Z"],
      ["gold", "M5.1 13.2 L18.9 13.2 L18.9 14.9 L5.1 14.9 Z"],
      ["goldDeep", "M5.1 14.3 L18.9 14.3 L18.9 14.9 L5.1 14.9 Z"],
      ["bronze", "M5.1 14.9 L18.9 14.9 L18.9 17.6 C18.9 19.8 17.5 21.2 15.6 21.2 L14.7 21.2 L14.7 16.8 L9.3 16.8 L9.3 21.2 L8.4 21.2 C6.5 21.2 5.1 19.8 5.1 17.6 Z"],
      ["bronzeDark", "M14.7 16.8 L14.7 21.2 L15.6 21.2 C17.5 21.2 18.9 19.8 18.9 17.6 L18.9 14.9 L16.6 14.9 L16.6 17.6 C16.6 18.8 15.9 19.6 14.7 19.8 Z"],
      ["goldDeep", "M7.0 17.6 A0.5 0.5 0 1 0 8.0 17.6 A0.5 0.5 0 1 0 7.0 17.6 Z M16.0 17.6 A0.5 0.5 0 1 0 17.0 17.6 A0.5 0.5 0 1 0 16.0 17.6 Z M6.2 13.6 A0.45 0.45 0 1 0 7.1 13.6 A0.45 0.45 0 1 0 6.2 13.6 Z M16.9 13.6 A0.45 0.45 0 1 0 17.8 13.6 A0.45 0.45 0 1 0 16.9 13.6 Z"],
    ],

    aquila3: [
      ["gold", "M10.2 8.2 C8.0 7.2 5.6 5.2 3.6 2.4 C4.0 5.6 5.0 8.2 6.6 10.2 C7.6 9.2 8.8 8.6 10.2 8.2 Z M13.8 8.2 C16.0 7.2 18.4 5.2 20.4 2.4 C20.0 5.6 19.0 8.2 17.4 10.2 C16.4 9.2 15.2 8.6 13.8 8.2 Z"],
      ["goldDeep", "M4.6 4.4 C6.0 6.4 7.4 7.9 8.9 8.8 L8.4 9.6 C6.8 8.6 5.4 7.0 4.2 5.0 Z M19.4 4.4 C18.0 6.4 16.6 7.9 15.1 8.8 L15.6 9.6 C17.2 8.6 18.6 7.0 19.8 5.0 Z M5.8 7.4 C6.9 8.8 8.0 9.8 9.2 10.4 L8.9 11.0 C7.6 10.4 6.4 9.3 5.4 7.9 Z M18.2 7.4 C17.1 8.8 16.0 9.8 14.8 10.4 L15.1 11.0 C16.4 10.4 17.6 9.3 18.6 7.9 Z"],
      ["gold", "M12 3.4 C13.4 3.4 14.2 4.5 14.2 6.2 L14.2 11.6 L9.8 11.6 L9.8 6.2 C9.8 4.5 10.6 3.4 12 3.4 Z"],
      ["goldDeep", "M12 3.4 C13.4 3.4 14.2 4.5 14.2 6.2 L14.2 11.6 L12 11.6 Z"],
      ["gold", "M10.6 3.0 A1.5 1.5 0 1 0 13.6 3.0 A1.5 1.5 0 1 0 10.6 3.0 Z"],
      ["goldDeep", "M13.4 2.4 L15.4 3.2 L13.4 4.0 Z"],
      ["ink", "M12.5 2.6 A0.4 0.4 0 1 0 13.3 2.6 A0.4 0.4 0 1 0 12.5 2.6 Z"],
      ["goldDeep", "M10.0 11.2 L14.0 11.2 L13.4 14.4 L10.6 14.4 Z"],
      ["gold", "M11.0 11.4 L11.6 11.4 L11.4 14.2 L10.9 14.2 Z M12.4 11.4 L13.0 11.4 L13.1 14.2 L12.6 14.2 Z"],
      ["gold", "M6.4 8.6 L9.8 10.4 L9.2 11.6 L6.0 9.8 Z M17.6 8.6 L14.2 10.4 L14.8 11.6 L18.0 9.8 Z"],
      ["gold", "M7.6 13.8 L16.4 13.8 L16.4 15.8 L7.6 15.8 Z"],
      ["goldDeep", "M7.6 15.0 L16.4 15.0 L16.4 15.8 L7.6 15.8 Z"],
      ["blood", "M9.2 15.8 L14.8 15.8 L14.8 17.2 L9.2 17.2 Z"],
      ["woodDark", "M11.1 17.2 L12.9 17.2 L12.9 23.4 L11.1 23.4 Z"],
      ["woodLight", "M11.1 17.2 L11.7 17.2 L11.7 23.4 L11.1 23.4 Z"],
    ],

    // ---- fourth pass: what Rome built, and who it prayed to -----------
    // The kit was already here; the city was not. These are the buildings, the
    // gods, the animals and the instruments — everything that needs a material
    // the soldier's kit never did, which is why the palette grew stone, flesh
    // and hide above.
    //
    // A building is drawn straight on, not in perspective: at 17px a receding
    // wall is a smudge, and the thing that says "aqueduct" is the row of
    // arches, so the arches get the whole box.

    // templum — the temple front: pediment, architrave, five columns, steps.
    // Five and not the six the reference draws, because at 17px six columns
    // and five gaps land on eleven pixels and the whole portico greys out.
    templum: [
      ["stone", "M12 2.4 L23.0 8.8 L1.0 8.8 Z"],
      ["stoneShade", "M12 2.4 L23.0 8.8 L12 8.8 Z"],
      ["stoneLight", "M12 2.4 L13.1 3.05 L3.2 8.8 L1.0 8.8 Z"],
      ["stoneShade", "M12 5.0 L18.4 8.7 L5.6 8.7 Z"],
      ["stone", "M1.6 8.8 L22.4 8.8 L22.4 11.0 L1.6 11.0 Z"],
      ["stoneLight", "M1.6 8.8 L22.4 8.8 L22.4 9.5 L1.6 9.5 Z"],
      ["stoneShade", "M1.6 10.4 L22.4 10.4 L22.4 11.0 L1.6 11.0 Z"],
      ["stone", "M3.4 11 L5.4 11 L5.4 19.2 L3.4 19.2 Z M7 11 L9 11 L9 19.2 L7 19.2 Z M10.6 11 L12.6 11 L12.6 19.2 L10.6 19.2 Z M14.2 11 L16.2 11 L16.2 19.2 L14.2 19.2 Z M17.8 11 L19.8 11 L19.8 19.2 L17.8 19.2 Z"],
      ["stoneLight", "M3.4 11 L3.95 11 L3.95 19.2 L3.4 19.2 Z M7 11 L7.55 11 L7.55 19.2 L7 19.2 Z M10.6 11 L11.15 11 L11.15 19.2 L10.6 19.2 Z M14.2 11 L14.75 11 L14.75 19.2 L14.2 19.2 Z M17.8 11 L18.35 11 L18.35 19.2 L17.8 19.2 Z"],
      ["stoneShade", "M4.85 11 L5.4 11 L5.4 19.2 L4.85 19.2 Z M8.45 11 L9 11 L9 19.2 L8.45 19.2 Z M12.05 11 L12.6 11 L12.6 19.2 L12.05 19.2 Z M15.65 11 L16.2 11 L16.2 19.2 L15.65 19.2 Z M19.25 11 L19.8 11 L19.8 19.2 L19.25 19.2 Z"],
      ["stone", "M2.2 19.2 L21.8 19.2 L21.8 20.7 L2.2 20.7 Z"],
      ["stoneShade", "M2.2 20.1 L21.8 20.1 L21.8 20.7 L2.2 20.7 Z"],
      ["stone", "M1.0 20.7 L23.0 20.7 L23.0 22.2 L1.0 22.2 Z"],
      ["stoneShade", "M1.0 21.6 L23.0 21.6 L23.0 22.2 L1.0 22.2 Z"],
    ],

    // aquaeductus — two arcades and the water channel on top of them. The
    // channel is the point: an aqueduct without the lid on it is a bridge.
    aquaeductus: [
      ["stone", "M0.8 3.6 L23.2 3.6 L23.2 6.0 L0.8 6.0 Z"],
      ["stoneLight", "M0.8 3.6 L23.2 3.6 L23.2 4.3 L0.8 4.3 Z"],
      ["stoneShade", "M0.8 5.3 L23.2 5.3 L23.2 6.0 L0.8 6.0 Z"],
      ["stone", "M2 6 L22 6 L22 11.2 L2 11.2 Z M3.17 11.2 L3.17 9.4 A1.3 1.3 0 0 1 5.77 9.4 L5.77 11.2 Z M6.93 11.2 L6.93 9.4 A1.3 1.3 0 0 1 9.53 9.4 L9.53 11.2 Z M10.7 11.2 L10.7 9.4 A1.3 1.3 0 0 1 13.3 9.4 L13.3 11.2 Z M14.47 11.2 L14.47 9.4 A1.3 1.3 0 0 1 17.07 9.4 L17.07 11.2 Z M18.23 11.2 L18.23 9.4 A1.3 1.3 0 0 1 20.83 9.4 L20.83 11.2 Z"],
      ["stoneShade", "M5.17 11.2 L5.17 9.4 A1.3 1.3 0 0 0 3.17 8.31 L3.17 9.4 A1.3 1.3 0 0 1 5.77 9.4 L5.77 11.2 Z M8.93 11.2 L8.93 9.4 A1.3 1.3 0 0 0 6.93 8.31 L6.93 9.4 A1.3 1.3 0 0 1 9.53 9.4 L9.53 11.2 Z M12.7 11.2 L12.7 9.4 A1.3 1.3 0 0 0 10.7 8.31 L10.7 9.4 A1.3 1.3 0 0 1 13.3 9.4 L13.3 11.2 Z M16.47 11.2 L16.47 9.4 A1.3 1.3 0 0 0 14.47 8.31 L14.47 9.4 A1.3 1.3 0 0 1 17.07 9.4 L17.07 11.2 Z M20.23 11.2 L20.23 9.4 A1.3 1.3 0 0 0 18.23 8.31 L18.23 9.4 A1.3 1.3 0 0 1 20.83 9.4 L20.83 11.2 Z"],
      ["stone", "M1.4 11.2 L22.6 11.2 L22.6 12.6 L1.4 12.6 Z"],
      ["stoneLight", "M1.4 11.2 L22.6 11.2 L22.6 11.8 L1.4 11.8 Z"],
      ["stone", "M2.6 12.6 L21.4 12.6 L21.4 21.2 L2.6 21.2 Z M4 21.2 L4 17.2 A2.2 2.2 0 0 1 8.4 17.2 L8.4 21.2 Z M9.8 21.2 L9.8 17.2 A2.2 2.2 0 0 1 14.2 17.2 L14.2 21.2 Z M15.6 21.2 L15.6 17.2 A2.2 2.2 0 0 1 20 17.2 L20 21.2 Z"],
      ["stoneShade", "M7.0 21.2 L7.0 17.2 A2.2 2.2 0 0 0 4.0 15.2 L4 17.2 A2.2 2.2 0 0 1 8.4 17.2 L8.4 21.2 Z M12.8 21.2 L12.8 17.2 A2.2 2.2 0 0 0 9.8 15.2 L9.8 17.2 A2.2 2.2 0 0 1 14.2 17.2 L14.2 21.2 Z M18.6 21.2 L18.6 17.2 A2.2 2.2 0 0 0 15.6 15.2 L15.6 17.2 A2.2 2.2 0 0 1 20 17.2 L20 21.2 Z"],
      ["stone", "M1.4 21.2 L22.6 21.2 L22.6 22.6 L1.4 22.6 Z"],
      ["stoneShade", "M1.4 22.0 L22.6 22.0 L22.6 22.6 L1.4 22.6 Z"],
    ],

    // fornix — the triumphal arch. Named for the vault and not for the arch,
    // because `arcus` in this pack is already the bow.
    fornix: [
      ["stone", "M3.2 2.4 L20.8 2.4 L20.8 6.4 L3.2 6.4 Z"],
      ["stoneLight", "M3.2 2.4 L20.8 2.4 L20.8 3.1 L3.2 3.1 Z"],
      ["stoneShade", "M5.6 3.8 L18.4 3.8 L18.4 4.4 L5.6 4.4 Z M7.2 5.0 L16.8 5.0 L16.8 5.6 L7.2 5.6 Z"],
      ["stone", "M1.9 6.4 L22.1 6.4 L22.1 8.4 L1.9 8.4 Z"],
      ["stoneLight", "M1.9 6.4 L22.1 6.4 L22.1 7.1 L1.9 7.1 Z"],
      ["stoneShade", "M1.9 7.8 L22.1 7.8 L22.1 8.4 L1.9 8.4 Z"],
      ["stone", "M3.6 8.4 L20.4 8.4 L20.4 21.2 L3.6 21.2 Z M9.4 21.2 L9.4 14.6 A2.6 2.6 0 0 1 14.6 14.6 L14.6 21.2 Z"],
      ["stoneShade", "M16.8 8.4 L20.4 8.4 L20.4 21.2 L16.8 21.2 Z"],
      ["stoneShade", "M12.6 21.2 L12.6 14.6 A2.6 2.6 0 0 0 9.4 12.05 L9.4 14.6 A2.6 2.6 0 0 1 14.6 14.6 L14.6 21.2 Z"],
      ["stoneLight", "M9.4 14.6 A2.6 2.6 0 0 1 14.6 14.6 L13.9 14.6 A1.9 1.9 0 0 0 10.1 14.6 Z"],
      ["stone", "M4.2 9.2 L5.9 9.2 L5.9 21.2 L4.2 21.2 Z M6.9 9.2 L8.6 9.2 L8.6 21.2 L6.9 21.2 Z M15.4 9.2 L17.1 9.2 L17.1 21.2 L15.4 21.2 Z M18.1 9.2 L19.8 9.2 L19.8 21.2 L18.1 21.2 Z"],
      ["stoneLight", "M4.2 9.2 L4.75 9.2 L4.75 21.2 L4.2 21.2 Z M6.9 9.2 L7.45 9.2 L7.45 21.2 L6.9 21.2 Z M15.4 9.2 L15.95 9.2 L15.95 21.2 L15.4 21.2 Z M18.1 9.2 L18.65 9.2 L18.65 21.2 L18.1 21.2 Z"],
      ["stoneShade", "M5.35 9.2 L5.9 9.2 L5.9 21.2 L5.35 21.2 Z M8.05 9.2 L8.6 9.2 L8.6 21.2 L8.05 21.2 Z M16.55 9.2 L17.1 9.2 L17.1 21.2 L16.55 21.2 Z M19.25 9.2 L19.8 9.2 L19.8 21.2 L19.25 21.2 Z"],
      ["stone", "M2.6 21.2 L21.4 21.2 L21.4 22.8 L2.6 22.8 Z"],
      ["stoneShade", "M2.6 22.1 L21.4 22.1 L21.4 22.8 L2.6 22.8 Z"],
    ],

    // amphitheatrum — the Colosseum as a drum with the seating dished out of
    // it. Drawn whole rather than ruined: the missing third of the outer wall
    // is the first thing to go at 17px, and what is left of it then is a
    // lopsided blob. Two tiers of arches sagging with the curve is what reads.
    amphitheatrum: [
      ["stone", "M1.6 8.6 C1.6 6.2 6.3 4.4 12 4.4 C17.7 4.4 22.4 6.2 22.4 8.6 L22.4 15.4 C22.4 17.9 17.7 19.8 12 19.8 C6.3 19.8 1.6 17.9 1.6 15.4 Z"],
      ["stoneLight", "M2.4 8.6 C2.4 6.6 5.0 5.1 8.6 4.7 L8.8 5.9 C5.9 6.3 3.8 7.4 3.8 8.8 Z"],
      ["stoneShade", "M1.6 8.6 C1.6 6.2 6.3 4.4 12 4.4 C17.7 4.4 22.4 6.2 22.4 8.6 C22.4 11.0 17.7 12.8 12 12.8 C6.3 12.8 1.6 11.0 1.6 8.6 Z"],
      ["hideDark", "M3.2 8.6 C3.2 6.9 7.1 5.5 12 5.5 C16.9 5.5 20.8 6.9 20.8 8.6 C20.8 10.3 16.9 11.7 12 11.7 C7.1 11.7 3.2 10.3 3.2 8.6 Z"],
      ["stoneShade", "M5.4 8.6 C5.4 7.5 8.4 6.6 12 6.6 C15.6 6.6 18.6 7.5 18.6 8.6 C18.6 9.7 15.6 10.6 12 10.6 C8.4 10.6 5.4 9.7 5.4 8.6 Z"],
      ["iron", "M3.46 15.3 L3.46 13.6 A0.85 0.85 0 0 1 5.16 13.6 L5.16 15.3 Z M6.03 14.75 L6.03 13.05 A0.85 0.85 0 0 1 7.72 13.05 L7.72 14.75 Z M8.59 14.41 L8.59 12.71 A0.85 0.85 0 0 1 10.29 12.71 L10.29 14.41 Z M11.15 14.3 L11.15 12.6 A0.85 0.85 0 0 1 12.85 12.6 L12.85 14.3 Z M13.71 14.41 L13.71 12.71 A0.85 0.85 0 0 1 15.41 12.71 L15.41 14.41 Z M16.27 14.75 L16.27 13.05 A0.85 0.85 0 0 1 17.97 13.05 L17.97 14.75 Z M18.84 15.3 L18.84 13.6 A0.85 0.85 0 0 1 20.54 13.6 L20.54 15.3 Z"],
      ["iron", "M3.46 18.3 L3.46 16.6 A0.85 0.85 0 0 1 5.16 16.6 L5.16 18.3 Z M6.03 17.75 L6.03 16.05 A0.85 0.85 0 0 1 7.72 16.05 L7.72 17.75 Z M8.59 17.41 L8.59 15.71 A0.85 0.85 0 0 1 10.29 15.71 L10.29 17.41 Z M11.15 17.3 L11.15 15.6 A0.85 0.85 0 0 1 12.85 15.6 L12.85 17.3 Z M13.71 17.41 L13.71 15.71 A0.85 0.85 0 0 1 15.41 15.71 L15.41 17.41 Z M16.27 17.75 L16.27 16.05 A0.85 0.85 0 0 1 17.97 16.05 L17.97 17.75 Z M18.84 18.3 L18.84 16.6 A0.85 0.85 0 0 1 20.54 16.6 L20.54 18.3 Z"],
      ["stoneShade", "M2.0 18.2 C4.2 19.2 7.8 19.8 12 19.8 C16.2 19.8 19.8 19.2 22.0 18.2 L22.0 19.0 C19.8 20.0 16.2 20.6 12 20.6 C7.8 20.6 4.2 20.0 2.0 19.0 Z"],
    ],

    // The gods are drawn full-face rather than in the three-quarter profile the
    // reference uses. A profile has one eye, and one eye at 17px is a smudge on
    // a blank oval; two eyes, a brow and a nose is a face at any size. It is
    // also the construction the Greek pack already uses for Medusa and the
    // masks, so the two packs' faces are cut to one pattern.
    //
    // What tells them apart is never the face. It is the attribute: the bolt,
    // the crest, the piled hair. Draw the attribute first and large.

    // equus — the horse, standing. What says horse and not dog is the neck:
    // long, rising, and carrying a mane along the whole of its upper edge.
    equus: [
      ["ink", "M19.6 10.4 C22.0 11.4 23.0 15.0 21.9 18.6 L20.1 17.9 C20.9 15.2 20.5 13.0 19.0 11.8 Z"],
      ["woodDark", "M10.0 15.2 L11.3 15.2 L11.3 21.0 L10.0 21.0 Z M17.8 15.2 L19.1 15.2 L19.1 21.0 L17.8 21.0 Z"],
      ["wood", "M9.2 10.4 C12.6 9.4 16.6 9.8 19.0 11.2 C20.4 12.0 21.0 13.4 20.8 14.8 C20.6 16.4 19.6 17.2 18.2 17.4 L10.4 17.4 C9.0 17.2 8.4 16.0 8.4 14.2 C8.4 12.4 8.6 11.0 9.2 10.4 Z"],
      ["woodLight", "M9.2 10.4 C12.6 9.4 16.6 9.8 19.0 11.2 C19.5 11.5 19.9 11.9 20.2 12.4 C17.6 11.2 13.2 11.0 9.6 11.8 C9.3 11.2 9.2 10.8 9.2 10.4 Z"],
      ["woodDark", "M10.4 17.4 L18.2 17.4 C19.2 17.3 20.0 16.8 20.5 15.9 C19.6 16.5 18.4 16.7 17.0 16.7 L11.2 16.7 C10.4 16.7 9.8 16.4 9.4 15.8 C9.5 16.8 9.9 17.3 10.4 17.4 Z"],
      ["wood", "M11.8 16.6 L13.1 16.6 L13.1 21.0 L11.8 21.0 Z M15.8 16.6 L17.1 16.6 L17.1 21.0 L15.8 21.0 Z"],
      ["wood", "M5.8 6.0 L8.8 3.6 C10.0 6.4 11.6 8.8 13.6 10.8 L10.0 13.4 C8.0 11.2 6.6 8.7 5.8 6.0 Z"],
      ["woodLight", "M6.6 6.6 C7.4 8.6 8.6 10.4 10.0 11.9 L9.3 12.5 C7.8 10.9 6.6 9.0 5.9 6.9 Z"],
      ["ink", "M8.8 3.6 C10.0 6.4 11.6 8.8 13.6 10.8 L12.3 11.8 C10.3 9.7 8.8 7.2 7.7 4.4 Z"],
      ["wood", "M5.6 2.6 L4.8 0.4 L7.0 1.9 Z M7.6 2.4 L7.8 0.3 L9.1 2.1 Z"],
      ["woodDark", "M7.8 0.3 L9.1 2.1 L8.2 2.4 L7.8 1.4 Z"],
      ["wood", "M8.8 5.4 C8.8 3.0 7.3 1.7 5.4 2.1 C3.5 2.5 1.9 4.2 1.1 6.3 C0.7 7.3 1.1 8.1 2.2 8.3 L4.3 8.6 C6.8 8.9 8.4 7.7 8.8 5.4 Z"],
      ["woodLight", "M5.4 2.1 C6.4 1.9 7.3 2.1 7.9 2.7 C6.4 2.7 5.0 3.3 3.8 4.5 L2.6 4.2 C3.4 3.2 4.4 2.4 5.4 2.1 Z"],
      ["woodDark", "M1.1 6.3 C0.7 7.3 1.1 8.1 2.2 8.3 L4.3 8.6 L4.9 6.6 Z"],
      ["ink", "M6.0 1.4 C7.0 2.6 7.4 4.1 7.2 5.9 L5.6 5.4 C5.7 3.9 5.9 2.6 6.0 1.4 Z"],
      ["ink", "M1.5 7.0 A0.5 0.5 0 1 0 2.5 7.0 A0.5 0.5 0 1 0 1.5 7.0 Z"],
      ["ink", "M5.7 4.5 A0.62 0.62 0 1 0 6.94 4.5 A0.62 0.62 0 1 0 5.7 4.5 Z"],
      ["ink", "M11.8 21.0 L13.1 21.0 L13.1 21.9 L11.8 21.9 Z M15.8 21.0 L17.1 21.0 L17.1 21.9 L15.8 21.9 Z M10.0 21.0 L11.3 21.0 L11.3 21.9 L10.0 21.9 Z M17.8 21.0 L19.1 21.0 L19.1 21.9 L17.8 21.9 Z"],
      ["woodDark", "M0.8 21.9 L23.2 21.9 L23.2 23.0 L0.8 23.0 Z"],
    ],

    // urna — the pot. Rome drank out of Greek shapes, so what marks this one as
    // Roman is the paint on it rather than the profile.
    urna: [
      ["clay", "M9.4 4.2 L14.6 4.2 L14.6 7.6 C18.4 9.2 20.2 12.0 20.2 15.0 C20.2 18.8 16.6 21.6 12 21.6 C7.4 21.6 3.8 18.8 3.8 15.0 C3.8 12.0 5.6 9.2 9.4 7.6 Z"],
      ["flame", "M9.4 4.2 L10.8 4.2 L10.8 8.0 C8.0 9.4 6.6 11.8 6.6 15.0 C6.6 17.6 7.6 19.7 9.4 21.0 C6.2 20.0 3.8 17.8 3.8 15.0 C3.8 12.0 5.6 9.2 9.4 7.6 Z"],
      ["bronzeDark", "M13.4 4.2 L14.6 4.2 L14.6 7.6 C18.4 9.2 20.2 12.0 20.2 15.0 C20.2 18.0 18.0 20.4 14.8 21.3 C16.8 20.0 18.0 17.8 18.0 15.0 C18.0 11.9 16.4 9.4 13.4 8.1 Z"],
      ["ink", "M9.2 4.8 C5.6 5.2 3.8 7.8 4.2 11.2 L6.4 10.8 C6.2 8.4 7.3 6.8 9.2 6.6 Z M14.8 4.8 C18.4 5.2 20.2 7.8 19.8 11.2 L17.6 10.8 C17.8 8.4 16.7 6.8 14.8 6.6 Z"],
      ["ink", "M7.0 1.8 L17.0 1.8 L17.0 4.4 L7.0 4.4 Z"],
      ["flame", "M7.0 1.8 L17.0 1.8 L17.0 2.5 L7.0 2.5 Z"],
      ["ink", "M4.4 12.4 C4.0 13.3 3.8 14.2 3.8 15.0 C3.8 16.5 4.3 17.8 5.2 19.0 L18.8 19.0 C19.7 17.8 20.2 16.5 20.2 15.0 C20.2 14.2 20.0 13.3 19.6 12.4 Z"],
      ["gold", "M9.6 13.4 C10.6 13.4 11.0 14.1 11.0 15.0 L11.4 18.0 L10.6 18.0 L10.0 15.9 L9.2 18.0 L8.4 18.0 L8.8 15.0 C8.8 14.1 9.0 13.4 9.6 13.4 Z M14.4 13.4 C15.2 13.4 15.6 14.1 15.6 15.0 L15.8 18.0 L15.0 18.0 L14.6 15.9 L13.8 18.0 L13.0 18.0 L13.2 15.0 C13.2 14.1 13.6 13.4 14.4 13.4 Z"],
      ["flame", "M9.2 12.5 A0.85 0.85 0 1 0 10.9 12.5 A0.85 0.85 0 1 0 9.2 12.5 Z M14.0 12.5 A0.85 0.85 0 1 0 15.7 12.5 A0.85 0.85 0 1 0 14.0 12.5 Z"],
      ["ink", "M8.8 21.0 L15.2 21.0 L15.2 22.8 L8.8 22.8 Z"],
    ],

    // tuba — the straight trumpet the legions were ordered by. Laid across the
    // box on the diagonal: upright it is a stick, and the flare is what says
    // that the stick is an instrument.
    tuba: [
      ["gold", "M18.93 2.53 L20.27 3.87 L9.27 15.07 L7.93 13.73 Z"],
      ["goldLight", "M18.93 2.53 L19.6 3.2 L8.6 14.4 L7.93 13.73 Z"],
      ["goldDeep", "M19.6 3.2 L20.27 3.87 L9.27 15.07 L8.6 14.4 Z"],
      ["goldDeep", "M16.0 5.4 L17.4 6.8 L16.4 7.8 L15.0 6.4 Z M12.4 9.0 L13.8 10.4 L12.8 11.4 L11.4 10.0 Z"],
      ["gold", "M7.89 13.69 L9.31 15.11 L5.66 21.86 L1.14 17.34 Z"],
      ["goldDeep", "M9.31 15.11 L5.66 21.86 L3.4 19.6 L8.6 14.4 Z"],
      ["goldLight", "M7.89 13.69 L8.6 14.4 L2.4 18.6 L1.14 17.34 Z"],
      ["goldDeep", "M1.14 17.34 L5.66 21.86 L4.6 22.9 L0.1 18.4 Z"],
      ["bronze", "M18.9 1.0 A1.7 1.7 0 1 0 22.3 1.0 A1.7 1.7 0 1 0 18.9 1.0 Z"],
      ["goldLight", "M19.5 0.5 A0.6 0.6 0 1 0 20.7 0.5 A0.6 0.6 0 1 0 19.5 0.5 Z"],
    ],

    // carnyx — the Gaulish war-horn Rome kept the sound of. The bell is an
    // animal's head, mouth open, and the shaft is only there to hold it up.
    carnyx: [
      ["bronze", "M11.0 8.2 L13.2 8.2 L13.2 21.6 L11.0 21.6 Z"],
      ["bronzeDark", "M12.4 8.2 L13.2 8.2 L13.2 21.6 L12.4 21.6 Z"],
      ["goldDeep", "M10.6 11.8 L13.6 11.8 L13.6 12.8 L10.6 12.8 Z M10.6 16.4 L13.6 16.4 L13.6 17.4 L10.6 17.4 Z"],
      ["bronze", "M10.2 21.4 L14.0 21.4 L14.8 23.6 L9.4 23.6 Z"],
      ["bronze", "M13.8 8.6 L13.8 6.2 C13.8 3.6 12.0 1.8 9.2 1.4 C6.4 1.0 3.6 2.0 1.8 4.0 L4.2 5.8 C5.4 4.5 7.0 4.0 8.6 4.2 C10.0 4.4 10.8 5.2 10.8 6.4 L10.8 8.6 Z"],
      ["bronzeDark", "M10.8 6.4 L10.8 8.6 L13.8 8.6 L13.8 6.2 C13.8 4.2 12.8 2.6 11.0 1.7 C11.9 2.9 12.4 4.4 12.4 6.4 Z"],
      ["goldLight", "M3.6 3.4 C4.9 2.6 6.4 2.2 7.9 2.3 C8.5 2.4 9.0 2.5 9.5 2.7 L9.0 3.7 C8.6 3.5 8.1 3.4 7.6 3.4 C6.4 3.4 5.4 3.7 4.5 4.3 Z"],
      ["bronze", "M1.8 4.0 L4.2 5.8 L3.0 7.4 L0.4 5.6 Z"],
      ["bronzeDark", "M1.8 4.0 L4.2 5.8 L3.6 6.6 L1.2 4.8 Z"],
      ["bronze", "M3.4 8.0 C4.8 9.4 6.8 10.1 9.0 9.9 L9.2 11.8 C6.2 12.1 3.4 11.0 1.6 9.0 Z"],
      ["bronzeDark", "M3.4 8.0 C4.4 9.0 5.7 9.6 7.2 9.9 L7.0 10.9 C5.2 10.6 3.6 9.8 2.4 8.6 Z"],
      ["goldLight", "M4.6 6.4 L5.6 8.0 L3.8 7.9 Z M7.0 6.4 L8.2 8.2 L6.2 8.1 Z"],
      ["bronze", "M11.2 2.2 L11.8 -0.2 L13.8 2.0 Z"],
      ["bronzeDark", "M11.8 -0.2 L13.8 2.0 L12.8 2.3 L11.9 0.9 Z"],
      ["ink", "M8.3 3.0 A0.72 0.72 0 1 0 9.74 3.0 A0.72 0.72 0 1 0 8.3 3.0 Z"],
      ["goldLight", "M8.5 2.7 A0.27 0.27 0 1 0 9.04 2.7 A0.27 0.27 0 1 0 8.5 2.7 Z"],
    ],
  },

  /**
   * One burst draws from exactly one of these groups.
   *
   * A group of one is a burst of that shape alone; a group of more is a kit,
   * and a burst holding all of it reads as one idea rather than three — the
   * sword with the shield and the helmet, the arena with the helmet and the
   * trident that were used in it, the four buildings as a skyline, the chariot
   * with the wreath it was racing for.
   *
   * The choice is uniform over groups rather than over shapes, so a shape in
   * two groups shows up twice as often. That is the point of listing the shield
   * alone as well as beside the sword.
   */
  throws: [
    ["scutum3"],
    ["galea3"],
    ["gladius3", "scutum3", "galea3"],
    ["scutum3", "gladius3"],
    ["urna"],
    ["amphitheatrum", "templum", "aquaeductus", "fornix"],
    ["amphitheatrum", "aquaeductus", "templum"],
    ["templum", "amphitheatrum"],
    ["currus", "corona", "fornix"],
    ["parma", "pilum"],
    ["equus", "currus", "corona"],
    ["amphitheatrum", "cassisClathrata", "fuscina"],
    ["carnyx", "tuba"],
    ["aquila3", "scutum3"],
    ["tabulaDuplex", "stilus"],
  ],
};
