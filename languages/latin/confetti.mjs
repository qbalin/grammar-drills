/**
 * What this pack throws when the confetti fires.
 *
 * Sixteen shapes: the soldier's kit, the standards, the writing desk, the arena
 * and the wheel. Five groups are thrown as pairs, because some things are a kit
 * and a burst holding both reads as one idea rather than two — the sword and
 * shield, the murmillo's helmet and the sword he fought with, the tablet and
 * its stylus, the trident and net a retiarius threw together, and the eagle
 * beside the banner.
 *
 * A shape is a stack of layers, `[paint, path]`, painted back to front, each a
 * path in a 24x24 box. Every layer is filled `evenodd`, so a subpath nested
 * inside another *within one layer* is a hole — that is how the wheel's hub and
 * the shield's rim are cut. Across layers there is no such rule: a later layer
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
 * survive. The playground in Settings shows both at once.
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
};

export default {
  palette,

  /** Shapes, keyed by name, each a stack of layers painted back to front. */
  shapes: {
    // gladius — short sword: steel blade, bronze guard, bone grip, gold pommel
    gladius: [
      ["steel", "M12 1.6 L13.4 5.0 L13.4 13.0 L10.6 13.0 L10.6 5.0 Z"],
      ["steelDark", "M12 1.6 L13.4 5.0 L13.4 13.0 L12 13.0 Z"],
      ["bronze", "M6.8 13.0 L17.2 13.0 L17.2 15.0 L6.8 15.0 Z"],
      ["bone", "M10.7 15.0 L13.3 15.0 L13.3 19.6 L10.7 19.6 Z"],
      ["bronze", "M10.7 16.2 L13.3 16.2 L13.3 16.9 L10.7 16.9 Z M10.7 18.0 L13.3 18.0 L13.3 18.7 L10.7 18.7 Z"],
      ["gold", "M10.1 20.9 A1.9 1.9 0 1 0 13.9 20.9 A1.9 1.9 0 1 0 10.1 20.9 Z"],
    ],

    // scutum — legionary shield: the red board, gold wings and thunderbolts
    scutum: [
      ["goldDeep", "M6.2 2.0 L17.8 2.0 C18.8 2.0 19.4 2.8 19.4 3.8 L19.4 20.2 C19.4 21.2 18.8 22.0 17.8 22.0 L6.2 22.0 C5.2 22.0 4.6 21.2 4.6 20.2 L4.6 3.8 C4.6 2.8 5.2 2.0 6.2 2.0 Z"],
      ["blood", "M6.6 2.9 L17.4 2.9 C18.1 2.9 18.5 3.4 18.5 4.0 L18.5 20.0 C18.5 20.6 18.1 21.1 17.4 21.1 L6.6 21.1 C5.9 21.1 5.5 20.6 5.5 20.0 L5.5 4.0 C5.5 3.4 5.9 2.9 6.6 2.9 Z"],
      ["gold", "M11.5 10.2 C9.6 9.0 7.4 8.6 5.6 8.8 C7.0 9.6 8.2 10.4 9.0 11.2 C7.6 11.0 6.4 11.1 5.4 11.5 C7.2 12.0 9.4 12.6 11.5 13.0 Z M12.5 10.2 C14.4 9.0 16.6 8.6 18.4 8.8 C17.0 9.6 15.8 10.4 15.0 11.2 C16.4 11.0 17.6 11.1 18.6 11.5 C16.8 12.0 14.6 12.6 12.5 13.0 Z"],
      ["gold", "M12.9 4.2 L10.4 7.4 L11.9 7.4 L11.1 9.4 L13.6 6.2 L12.1 6.2 Z M12.9 14.6 L10.4 17.8 L11.9 17.8 L11.1 19.8 L13.6 16.6 L12.1 16.6 Z"],
      ["bronze", "M10.5 11.6 A1.5 1.5 0 1 0 13.5 11.6 A1.5 1.5 0 1 0 10.5 11.6 Z"],
    ],

    // pugio — dagger: a leaf blade on an inlaid hilt
    pugio: [
      ["steel", "M12 1.4 L14.4 6.0 L14.0 12.6 L10.0 12.6 L9.6 6.0 Z"],
      ["steelDark", "M11.4 2.6 L12.6 2.6 L12.4 12.6 L11.6 12.6 Z"],
      ["bronze", "M7.6 12.6 L16.4 12.6 L16.4 14.4 L7.6 14.4 Z"],
      ["woodDark", "M10.6 14.4 L13.4 14.4 L12.9 17.2 L13.4 19.6 L10.6 19.6 L11.1 17.2 Z"],
      ["gold", "M11.1 17.0 A0.9 0.9 0 1 0 12.9 17.0 A0.9 0.9 0 1 0 11.1 17.0 Z"],
      ["bronze", "M9.6 19.4 L14.4 19.4 C14.4 21.2 13.3 22.2 12 22.2 C10.7 22.2 9.6 21.2 9.6 19.4 Z"],
    ],

    // vexillum — cavalry banner: red cloth, gold fringe, lettering suggested
    vexillum: [
      ["woodDark", "M11.3 3.0 L12.7 3.0 L12.7 22.6 L11.3 22.6 Z"],
      ["gold", "M12 0.4 L13.5 3.0 L10.5 3.0 Z"],
      ["gold", "M4.4 4.0 L19.6 4.0 L19.6 5.6 L4.4 5.6 Z"],
      ["gold", "M5.6 5.6 L18.4 5.6 L18.4 16.4 L5.6 16.4 Z"],
      ["blood", "M6.4 6.4 L17.6 6.4 L17.6 15.6 L6.4 15.6 Z"],
      ["gold", "M8.0 9.2 L16.0 9.2 L16.0 10.4 L8.0 10.4 Z M9.2 11.6 L14.8 11.6 L14.8 12.8 L9.2 12.8 Z"],
      ["gold", "M6.4 16.4 L7.6 16.4 L7.6 18.8 L6.4 18.8 Z M9.2 16.4 L10.4 16.4 L10.4 18.8 L9.2 18.8 Z M13.6 16.4 L14.8 16.4 L14.8 18.8 L13.6 18.8 Z M16.4 16.4 L17.6 16.4 L17.6 18.8 L16.4 18.8 Z"],
    ],

    // rota — chariot wheel: pale spokes inside an iron tyre
    rota: [
      ["iron", "M1.4 12 A10.6 10.6 0 1 0 22.6 12 A10.6 10.6 0 1 0 1.4 12 Z M3.4 12 A8.6 8.6 0 1 0 20.6 12 A8.6 8.6 0 1 0 3.4 12 Z"],
      ["wood", "M3.4 12 A8.6 8.6 0 1 0 20.6 12 A8.6 8.6 0 1 0 3.4 12 Z M5.0 12 A7.0 7.0 0 1 0 19.0 12 A7.0 7.0 0 1 0 5.0 12 Z"],
      ["wood", "M11.2 4.6 L12.8 4.6 L12.8 19.4 L11.2 19.4 Z M4.6 11.2 L19.4 11.2 L19.4 12.8 L4.6 12.8 Z M6.8 5.7 L18.3 17.2 L17.2 18.3 L5.7 6.8 Z M17.2 5.7 L18.3 6.8 L6.8 18.3 L5.7 17.2 Z"],
      ["bronze", "M9.8 12 A2.2 2.2 0 1 0 14.2 12 A2.2 2.2 0 1 0 9.8 12 Z"],
      ["iron", "M11.1 12 A0.9 0.9 0 1 0 12.9 12 A0.9 0.9 0 1 0 11.1 12 Z"],
    ],

    // galea — an officer's helmet, worn with the crest across rather than along
    galea: [
      ["blood", "M4.6 7.6 C5.6 3.4 8.4 1.2 12 1.2 C15.6 1.2 18.4 3.4 19.4 7.6 L17.0 7.6 C16.2 4.8 14.4 3.2 12 3.2 C9.6 3.2 7.8 4.8 7.0 7.6 Z"],
      ["bronze", "M5.6 13.0 C5.6 8.2 8.4 5.2 12 5.2 C15.6 5.2 18.4 8.2 18.4 13.0 Z"],
      // The far half of the dome, so a helmet is round rather than flat.
      ["goldDeep", "M12 5.2 C15.6 5.2 18.4 8.2 18.4 13.0 L12 13.0 Z"],
      ["gold", "M5.4 13.0 L18.6 13.0 L18.6 14.6 L5.4 14.6 Z"],
      // Cheek pieces cut from one band, so the gap between them reads as a face
      // rather than as an archway.
      ["bronze", "M5.4 14.6 L18.6 14.6 L18.6 17.4 C18.6 19.6 17.2 21.0 15.4 21.0 L14.6 21.0 L14.6 16.6 L9.4 16.6 L9.4 21.0 L8.6 21.0 C6.8 21.0 5.4 19.6 5.4 17.4 Z"],
    ],

    // cassis — the murmillo's helmet, all brim and grille
    cassis: [
      ["blood", "M7.2 7.0 C7.8 2.2 9.8 0.6 12 0.6 C14.2 0.6 16.2 2.2 16.8 7.0 Z"],
      ["iron", "M5.4 11.0 C5.4 6.6 8.2 4.0 12 4.0 C15.8 4.0 18.6 6.6 18.6 11.0 L18.6 15.0 C18.6 18.6 15.6 21.0 12 21.0 C8.4 21.0 5.4 18.6 5.4 15.0 Z"],
      ["bronze", "M4.2 10.4 L19.8 10.4 L19.8 12.2 L4.2 12.2 Z"],
      ["bronze", "M7.5 14.6 A2.4 2.4 0 1 0 12.3 14.6 A2.4 2.4 0 1 0 7.5 14.6 Z M11.7 14.6 A2.4 2.4 0 1 0 16.5 14.6 A2.4 2.4 0 1 0 11.7 14.6 Z"],
      ["ink", "M8.0 14.6 A1.9 1.9 0 1 0 11.8 14.6 A1.9 1.9 0 1 0 8.0 14.6 Z M12.2 14.6 A1.9 1.9 0 1 0 16.0 14.6 A1.9 1.9 0 1 0 12.2 14.6 Z"],
      ["bronze", "M9.5 12.6 L10.3 12.6 L10.3 16.6 L9.5 16.6 Z M13.7 12.6 L14.5 12.6 L14.5 16.6 L13.7 16.6 Z"],
      ["gold", "M11.0 3.4 L13.0 3.4 L13.0 5.6 L11.0 5.6 Z"],
    ],

    // aquila — the eagle a legion did not come home without
    aquila: [
      ["gold", "M10.4 5.0 C8.2 4.4 5.8 3.0 4.2 1.4 C4.6 3.6 5.6 5.6 7.2 7.2 C8.2 6.4 9.2 5.6 10.4 5.0 Z M13.6 5.0 C15.8 4.4 18.2 3.0 19.8 1.4 C19.4 3.6 18.4 5.6 16.8 7.2 C15.8 6.4 14.8 5.6 13.6 5.0 Z"],
      ["gold", "M12 2.6 C13.3 2.6 14.0 3.6 14.0 5.2 L14.0 9.0 L10.0 9.0 L10.0 5.2 C10.0 3.6 10.7 2.6 12 2.6 Z"],
      ["goldDeep", "M10.7 3.4 A1.3 1.3 0 1 0 13.3 3.4 A1.3 1.3 0 1 0 10.7 3.4 Z"],
      ["goldDeep", "M10.2 8.6 L13.8 8.6 L13.0 11.2 L11.0 11.2 Z"],
      ["gold", "M8.2 10.6 L15.8 10.6 L15.8 12.4 L8.2 12.4 Z"],
      ["woodDark", "M11.3 12.0 L12.7 12.0 L12.7 23.2 L11.3 23.2 Z"],
    ],

    // volumen — the scroll: papyrus between two rods
    volumen: [
      ["papyrus", "M5.0 4.6 L19.0 4.6 L19.0 19.4 L5.0 19.4 Z"],
      ["ink", "M7.0 7.4 L17.0 7.4 L17.0 8.4 L7.0 8.4 Z M7.0 10.2 L17.0 10.2 L17.0 11.2 L7.0 11.2 Z M7.0 13.0 L17.0 13.0 L17.0 14.0 L7.0 14.0 Z M7.0 15.8 L13.6 15.8 L13.6 16.8 L7.0 16.8 Z"],
      ["wood", "M3.4 3.0 L20.6 3.0 C21.3 3.0 21.3 4.8 20.6 4.8 L3.4 4.8 C2.7 4.8 2.7 3.0 3.4 3.0 Z M3.4 19.2 L20.6 19.2 C21.3 19.2 21.3 21.0 20.6 21.0 L3.4 21.0 C2.7 21.0 2.7 19.2 3.4 19.2 Z"],
      ["woodDark", "M1.8 3.9 A1.2 1.2 0 1 0 4.2 3.9 A1.2 1.2 0 1 0 1.8 3.9 Z M19.8 3.9 A1.2 1.2 0 1 0 22.2 3.9 A1.2 1.2 0 1 0 19.8 3.9 Z M1.8 20.1 A1.2 1.2 0 1 0 4.2 20.1 A1.2 1.2 0 1 0 1.8 20.1 Z M19.8 20.1 A1.2 1.2 0 1 0 22.2 20.1 A1.2 1.2 0 1 0 19.8 20.1 Z"],
    ],

    // tabula — the wax tablet, written on and smoothed over again
    tabula: [
      ["wood", "M4.4 3.0 L19.6 3.0 L19.6 21.0 L4.4 21.0 Z"],
      ["ink", "M6.2 4.8 L17.8 4.8 L17.8 19.2 L6.2 19.2 Z"],
      ["papyrus", "M8.0 7.2 L16.0 7.2 L16.0 8.0 L8.0 8.0 Z M8.0 10.0 L16.0 10.0 L16.0 10.8 L8.0 10.8 Z M8.0 12.8 L16.0 12.8 L16.0 13.6 L8.0 13.6 Z M8.0 15.6 L12.6 15.6 L12.6 16.4 L8.0 16.4 Z"],
      ["bronze", "M3.2 3.0 L4.8 3.0 L4.8 21.0 L3.2 21.0 Z"],
    ],

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

    // fasces — the rods and the axe, which is the whole of what they meant.
    // Rods domed at the top so the bundle reads as sticks rather than as bars.
    fasces: [
      ["iron", "M15.4 3.0 L18.6 2.4 C21.2 4.0 21.8 8.4 19.4 10.4 L15.4 9.6 Z"],
      ["wood", "M8.0 6.0 C8.0 4.9 8.5 4.4 9.2 4.4 C9.9 4.4 10.4 4.9 10.4 6.0 L10.4 22.6 L8.0 22.6 Z M10.8 6.0 C10.8 4.9 11.3 4.4 12.0 4.4 C12.7 4.4 13.2 4.9 13.2 6.0 L13.2 22.6 L10.8 22.6 Z M13.6 6.0 C13.6 4.9 14.1 4.4 14.8 4.4 C15.5 4.4 16.0 4.9 16.0 6.0 L16.0 22.6 L13.6 22.6 Z"],
      ["woodDark", "M10.4 6.0 L10.8 6.0 L10.8 22.6 L10.4 22.6 Z M13.2 6.0 L13.6 6.0 L13.6 22.6 L13.2 22.6 Z"],
      ["blood", "M7.2 7.6 L16.8 7.6 L16.8 9.1 L7.2 9.1 Z M7.2 11.4 L16.8 11.4 L16.8 12.9 L7.2 12.9 Z M7.2 15.2 L16.8 15.2 L16.8 16.7 L7.2 16.7 Z M7.2 19.0 L16.8 19.0 L16.8 20.5 L7.2 20.5 Z"],
    ],

    // fuscina — the retiarius' trident, thrown with the net
    fuscina: [
      ["wood", "M11.2 8.0 L12.8 8.0 L12.8 23.0 L11.2 23.0 Z"],
      ["steel", "M5.4 7.0 L18.6 7.0 L18.6 8.8 L5.4 8.8 Z M11.0 1.6 L13.0 1.6 L13.0 7.0 L11.0 7.0 Z M12 0.4 L13.3 2.4 L10.7 2.4 Z M5.4 2.8 L7.4 2.8 L7.4 7.0 L5.4 7.0 Z M6.4 1.4 L7.6 3.2 L5.2 3.2 Z M16.6 2.8 L18.6 2.8 L18.6 7.0 L16.6 7.0 Z M17.6 1.4 L18.8 3.2 L16.4 3.2 Z"],
      ["bronze", "M11.2 11.0 L12.8 11.0 L12.8 12.4 L11.2 12.4 Z M11.2 14.0 L12.8 14.0 L12.8 15.4 L11.2 15.4 Z"],
    ],

    // rete — the net, weighted at the rim
    rete: [
      ["bone", "M2.4 12 A9.6 9.6 0 1 0 21.6 12 A9.6 9.6 0 1 0 2.4 12 Z M3.6 12 A8.4 8.4 0 1 0 20.4 12 A8.4 8.4 0 1 0 3.6 12 Z"],
      ["bone", "M5.6 12 A6.4 6.4 0 1 0 18.4 12 A6.4 6.4 0 1 0 5.6 12 Z M6.4 12 A5.6 5.6 0 1 0 17.6 12 A5.6 5.6 0 1 0 6.4 12 Z M8.6 12 A3.4 3.4 0 1 0 15.4 12 A3.4 3.4 0 1 0 8.6 12 Z M9.4 12 A2.6 2.6 0 1 0 14.6 12 A2.6 2.6 0 1 0 9.4 12 Z"],
      ["bone", "M11.6 2.4 L12.4 2.4 L12.4 21.6 L11.6 21.6 Z M2.4 11.6 L21.6 11.6 L21.6 12.4 L2.4 12.4 Z M5.5 4.9 L19.1 18.5 L18.5 19.1 L4.9 5.5 Z M18.5 4.9 L19.1 5.5 L5.5 19.1 L4.9 18.5 Z"],
      ["iron", "M20.6 12 A1 1 0 1 0 22.6 12 A1 1 0 1 0 20.6 12 Z M1.4 12 A1 1 0 1 0 3.4 12 A1 1 0 1 0 1.4 12 Z M11 2.4 A1 1 0 1 0 13 2.4 A1 1 0 1 0 11 2.4 Z M11 21.6 A1 1 0 1 0 13 21.6 A1 1 0 1 0 11 21.6 Z M17.8 5.2 A1 1 0 1 0 19.8 5.2 A1 1 0 1 0 17.8 5.2 Z M4.2 5.2 A1 1 0 1 0 6.2 5.2 A1 1 0 1 0 4.2 5.2 Z M17.8 18.8 A1 1 0 1 0 19.8 18.8 A1 1 0 1 0 17.8 18.8 Z M4.2 18.8 A1 1 0 1 0 6.2 18.8 A1 1 0 1 0 4.2 18.8 Z"],
    ],

    // denarius — a coin with a head on it, facing right the way they nearly all
    // do. Struck in gold rather than the silver it was, because the head has to
    // be a shade off the field to read at all and silver on silver does not.
    denarius: [
      ["gold", "M1.8 12 A10.2 10.2 0 1 0 22.2 12 A10.2 10.2 0 1 0 1.8 12 Z"],
      ["goldDeep", "M3.0 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 Z M3.8 12 A8.2 8.2 0 1 0 20.2 12 A8.2 8.2 0 1 0 3.8 12 Z"],
      ["bronze", "M8.8 19.0 C7.6 16.6 7.4 13.6 8.4 11.2 C9.6 8.2 12.4 6.6 15.0 7.4 C16.6 7.9 17.4 9.2 17.0 10.6 L15.4 12.2 L16.6 12.9 L14.9 13.9 L15.2 15.2 L13.6 15.4 L13.8 17.2 L12.0 16.9 L11.9 19.2 Z"],
    ],
  },

  /**
   * One burst draws from exactly one of these groups. A group with a single
   * name is a burst of only that shape; a group of two is a kit.
   *
   * The choice is uniform over groups rather than over shapes, so a shape that
   * appears in two groups shows up twice as often. That is the point of listing
   * the sword and the shield alone as well as together.
   */
  throws: [
    ["gladius"], ["scutum"], ["gladius", "scutum"],
    ["pugio"], ["vexillum"], ["rota"],
    ["galea"], ["cassis"], ["cassis", "gladius"],
    ["aquila"], ["aquila", "vexillum"],
    ["volumen"], ["tabula"], ["stilus"], ["tabula", "stilus"],
    ["corona"], ["fasces"], ["denarius"],
    ["fuscina"], ["rete"], ["fuscina", "rete"],
  ],
};
