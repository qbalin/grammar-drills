/**
 * What this pack throws when the confetti fires.
 *
 * The soldier's kit, the standards, the writing desk, the arena and the wheel;
 * then, in the fourth pass, what Rome built and who it prayed to — the temple,
 * the aqueduct, the arch and the amphitheatre, the four gods a beginner meets
 * first, the she-wolf, the horse, the masks and the horns. Some groups are
 * thrown as pairs, because some things are a kit
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
  clay: "#c8703f",
  flame: "#f0a83c",
  // Added for the third pass, which models light on a shape rather than
  // filling it flat: every material wants a lit face and a turned-away one.
  steelLight: "#eef3f8",
  bronzeDark: "#7d4f22",
  bloodLight: "#c8443c",
  goldLight: "#f7e8c6",
  woodLight: "#a87c48",
  // Added for the fourth pass — the buildings, the gods and the animals, none
  // of which the pack had a material for. Travertine rather than marble: the
  // aqueducts and the amphitheatre are the warm buff stone Rome actually built
  // in, and a white one would read as Greek.
  stone: "#ded2bd",
  stoneShade: "#b2a68e",
  stoneLight: "#f3ecdd",
  flesh: "#f0c8a0",
  fleshShade: "#cf9a6f",
  fleshLight: "#fbe2c6",
  // Old men's hair. Not white: a true white beard on a pale ground is a hole.
  hoar: "#e4e0d8",
  hoarShade: "#b0aca2",
  hide: "#8f8a83",
  hideDark: "#5f5b56",
  hideLight: "#b5b0a7",
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

    // spatha — the long sword the cavalry carried, and the infantry later
    spatha: [
      ["steel", "M12 0.8 L13.2 3.6 L13.2 15.6 L10.8 15.6 L10.8 3.6 Z"],
      ["steelDark", "M12 0.8 L13.2 3.6 L13.2 15.6 L12 15.6 Z"],
      ["bronze", "M8.2 15.6 L15.8 15.6 L15.8 17.2 L8.2 17.2 Z"],
      ["bone", "M10.9 17.2 L13.1 17.2 L13.1 20.6 L10.9 20.6 Z"],
      ["gold", "M10.5 22.0 A1.5 1.5 0 1 0 13.5 22.0 A1.5 1.5 0 1 0 10.5 22.0 Z"],
    ],

    // scutumAlatum — the Praetorian shield as it is actually painted: four
    // wings around a central shaft, not two, and a boss you cannot miss
    scutumAlatum: [
      ["goldDeep", "M6.2 2.0 L17.8 2.0 C18.8 2.0 19.4 2.8 19.4 3.8 L19.4 20.2 C19.4 21.2 18.8 22.0 17.8 22.0 L6.2 22.0 C5.2 22.0 4.6 21.2 4.6 20.2 L4.6 3.8 C4.6 2.8 5.2 2.0 6.2 2.0 Z"],
      ["blood", "M6.6 2.9 L17.4 2.9 C18.1 2.9 18.5 3.4 18.5 4.0 L18.5 20.0 C18.5 20.6 18.1 21.1 17.4 21.1 L6.6 21.1 C5.9 21.1 5.5 20.6 5.5 20.0 L5.5 4.0 C5.5 3.4 5.9 2.9 6.6 2.9 Z"],
      ["gold", "M11.0 10.6 C9.0 9.6 7.2 8.0 5.6 5.8 C6.0 8.2 6.8 10.0 8.0 11.4 C7.2 11.2 6.4 11.1 5.6 11.2 C7.0 12.0 8.9 12.6 11.0 12.9 Z M13.0 10.6 C15.0 9.6 16.8 8.0 18.4 5.8 C18.0 8.2 17.2 10.0 16.0 11.4 C16.8 11.2 17.6 11.1 18.4 11.2 C17.0 12.0 15.1 12.6 13.0 12.9 Z M11.0 13.4 C9.0 14.4 7.2 16.0 5.6 18.2 C6.0 15.8 6.8 14.0 8.0 12.6 C7.2 12.8 6.4 12.9 5.6 12.8 C7.0 12.0 8.9 11.4 11.0 11.1 Z M13.0 13.4 C15.0 14.4 16.8 16.0 18.4 18.2 C18.0 15.8 17.2 14.0 16.0 12.6 C16.8 12.8 17.6 12.9 18.4 12.8 C17.0 12.0 15.1 11.4 13.0 11.1 Z"],
      ["gold", "M11.4 3.6 L12.6 3.6 L12.6 20.4 L11.4 20.4 Z M12 2.2 L13.7 4.8 L10.3 4.8 Z M12 21.8 L10.3 19.2 L13.7 19.2 Z"],
      ["gold", "M4.7 11.2 L6.4 11.2 L6.4 12.8 L4.7 12.8 Z M17.6 11.2 L19.3 11.2 L19.3 12.8 L17.6 12.8 Z"],
      ["bronze", "M9.6 12 A2.4 2.4 0 1 0 14.4 12 A2.4 2.4 0 1 0 9.6 12 Z"],
      ["gold", "M11.0 12 A1.0 1.0 0 1 0 13.0 12 A1.0 1.0 0 1 0 11.0 12 Z"],
    ],

    // pugioVagina — the dagger in its scabbard, which is the part they decorated
    pugioVagina: [
      ["steel", "M10.4 1.0 L13.6 1.0 L13.6 3.0 L10.4 3.0 Z"],
      ["bronze", "M8.4 3.0 L15.6 3.0 L15.6 4.4 L8.4 4.4 Z"],
      ["bronze", "M9.0 4.4 L15.0 4.4 L14.4 18.8 C14.4 20.0 13.4 20.8 12 20.8 C10.6 20.8 9.6 20.0 9.6 18.8 Z"],
      ["gold", "M9.0 6.6 L15.0 6.6 L15.0 8.0 L9.0 8.0 Z M9.2 10.6 L14.8 10.6 L14.8 12.0 L9.2 12.0 Z M9.4 14.6 L14.6 14.6 L14.6 16.0 L9.4 16.0 Z"],
      ["blood", "M10.6 8.6 L13.4 8.6 L13.4 10.0 L10.6 10.0 Z M10.7 12.6 L13.3 12.6 L13.3 14.0 L10.7 14.0 Z M10.8 16.6 L13.2 16.6 L13.2 18.0 L10.8 18.0 Z"],
    ],

    // signum — the maniple's standard, counted by the discs on it
    signum: [
      ["woodDark", "M11.3 6.4 L12.7 6.4 L12.7 23.2 L11.3 23.2 Z"],
      ["gold", "M12 0.6 L14.0 4.2 L10.0 4.2 Z"],
      ["gold", "M6.6 4.6 L17.4 4.6 L17.4 6.2 L6.6 6.2 Z"],
      ["gold", "M9.4 9.0 A2.6 2.6 0 1 0 14.6 9.0 A2.6 2.6 0 1 0 9.4 9.0 Z M9.4 14.0 A2.6 2.6 0 1 0 14.6 14.0 A2.6 2.6 0 1 0 9.4 14.0 Z"],
      ["goldDeep", "M11.0 9.0 A1.0 1.0 0 1 0 13.0 9.0 A1.0 1.0 0 1 0 11.0 9.0 Z M11.0 14.0 A1.0 1.0 0 1 0 13.0 14.0 A1.0 1.0 0 1 0 11.0 14.0 Z"],
      ["blood", "M7.4 18.2 C7.4 20.6 9.4 21.8 12 21.8 C14.6 21.8 16.6 20.6 16.6 18.2 C15.5 19.5 13.9 20.2 12 20.2 C10.1 20.2 8.5 19.5 7.4 18.2 Z"],
    ],

    // rotaFerrata — the wagon's wheel: fewer, heavier spokes in a thicker tyre
    rotaFerrata: [
      ["iron", "M1.0 12 A11.0 11.0 0 1 0 23.0 12 A11.0 11.0 0 1 0 1.0 12 Z M3.6 12 A8.4 8.4 0 1 0 20.4 12 A8.4 8.4 0 1 0 3.6 12 Z"],
      ["wood", "M3.6 12 A8.4 8.4 0 1 0 20.4 12 A8.4 8.4 0 1 0 3.6 12 Z M5.4 12 A6.6 6.6 0 1 0 18.6 12 A6.6 6.6 0 1 0 5.4 12 Z"],
      ["wood", "M10.9 5.2 L13.1 5.2 L13.1 18.8 L10.9 18.8 Z M17.5 7.55 L18.6 9.45 L6.5 16.45 L5.4 14.55 Z M6.5 7.55 L5.4 9.45 L17.5 16.45 L18.6 14.55 Z"],
      ["bronze", "M9.2 12 A2.8 2.8 0 1 0 14.8 12 A2.8 2.8 0 1 0 9.2 12 Z"],
      ["iron", "M10.9 12 A1.1 1.1 0 1 0 13.1 12 A1.1 1.1 0 1 0 10.9 12 Z"],
    ],

    // galeaPlumata — the same helmet with the crest worn fore-and-aft, sweeping
    // back past the neck guard the way the Spartan ones are always drawn
    galeaPlumata: [
      ["blood", "M7.0 9.2 C7.2 4.0 9.8 1.0 13.0 1.0 C16.6 1.0 19.4 3.6 20.4 7.4 L21.8 12.6 L19.0 13.2 L17.8 8.6 C17.0 5.6 15.4 3.6 13.0 3.6 C10.6 3.6 9.4 5.8 9.4 9.4 Z"],
      ["bronze", "M5.4 13.4 C5.4 8.6 8.2 5.4 12 5.4 C15.8 5.4 18.6 8.6 18.6 13.4 Z"],
      ["goldDeep", "M12 5.4 C15.8 5.4 18.6 8.6 18.6 13.4 L12 13.4 Z"],
      ["gold", "M5.2 13.4 L18.8 13.4 L18.8 15.0 L5.2 15.0 Z"],
      ["bronze", "M5.2 15.0 L18.8 15.0 L18.8 17.8 C18.8 20.0 17.4 21.4 15.6 21.4 L14.8 21.4 L14.8 17.0 L9.2 17.0 L9.2 21.4 L8.4 21.4 C6.6 21.4 5.2 20.0 5.2 17.8 Z"],
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

    // aquilaCoronata — the eagle with its wings up, inside the wreath
    aquilaCoronata: [
      ["laurelDark", "M11.6 21.8 C6.2 20.8 2.8 16.4 2.8 11.4 C2.8 7.8 4.6 4.6 7.4 3.0 L8.4 4.7 C6.0 6.0 4.6 8.6 4.6 11.4 C4.6 15.6 7.5 19.1 11.8 19.9 Z M12.4 21.8 C17.8 20.8 21.2 16.4 21.2 11.4 C21.2 7.8 19.4 4.6 16.6 3.0 L15.6 4.7 C18.0 6.0 19.4 8.6 19.4 11.4 C19.4 15.6 16.5 19.1 12.2 19.9 Z"],
      ["laurel", "M3.9 8.4 C2.7 7.0 2.9 5.2 4.5 4.4 C5.3 6.0 5.1 7.4 3.9 8.4 Z M3.3 12.6 C1.9 11.8 1.5 10.0 2.7 8.8 C3.9 10.0 4.1 11.4 3.3 12.6 Z M4.4 16.6 C3.0 16.2 2.2 14.6 3.0 13.2 C4.4 14.0 5.0 15.2 4.4 16.6 Z M20.1 8.4 C21.3 7.0 21.1 5.2 19.5 4.4 C18.7 6.0 18.9 7.4 20.1 8.4 Z M20.7 12.6 C22.1 11.8 22.5 10.0 21.3 8.8 C20.1 10.0 19.9 11.4 20.7 12.6 Z M19.6 16.6 C21.0 16.2 21.8 14.6 21.0 13.2 C19.6 14.0 19.0 15.2 19.6 16.6 Z"],
      ["gold", "M10.4 10.0 C8.8 9.0 7.4 7.2 6.6 5.2 C6.9 7.6 7.7 9.6 9.0 11.2 C9.4 10.7 9.9 10.3 10.4 10.0 Z M13.6 10.0 C15.2 9.0 16.6 7.2 17.4 5.2 C17.1 7.6 16.3 9.6 15.0 11.2 C14.6 10.7 14.1 10.3 13.6 10.0 Z"],
      ["gold", "M12 8.2 C13.1 8.2 13.7 9.1 13.7 10.4 L13.7 14.6 L10.3 14.6 L10.3 10.4 C10.3 9.1 10.9 8.2 12 8.2 Z"],
      ["goldDeep", "M10.9 8.8 A1.1 1.1 0 1 0 13.1 8.8 A1.1 1.1 0 1 0 10.9 8.8 Z M10.5 14.2 L13.5 14.2 L12.8 16.6 L11.2 16.6 Z"],
      ["gold", "M9.0 16.2 L15.0 16.2 L15.0 17.8 L9.0 17.8 Z"],
    ],

    // volumenApertum — the scroll part-unrolled, which is how it was read
    volumenApertum: [
      ["papyrus", "M5.4 4.6 L18.6 4.6 L18.6 18.2 L5.4 18.2 Z"],
      ["ink", "M7.4 7.2 L16.6 7.2 L16.6 8.2 L7.4 8.2 Z M7.4 9.8 L16.6 9.8 L16.6 10.8 L7.4 10.8 Z M7.4 12.4 L16.6 12.4 L16.6 13.4 L7.4 13.4 Z M7.4 15.0 L13.4 15.0 L13.4 16.0 L7.4 16.0 Z"],
      ["wood", "M3.6 2.8 L20.4 2.8 C21.1 2.8 21.1 4.6 20.4 4.6 L3.6 4.6 C2.9 4.6 2.9 2.8 3.6 2.8 Z"],
      ["papyrus", "M4.4 18.2 L19.6 18.2 C20.8 18.2 20.8 22.0 19.6 22.0 L4.4 22.0 C3.2 22.0 3.2 18.2 4.4 18.2 Z"],
      ["goldDeep", "M4.4 19.6 L19.6 19.6 L19.6 20.6 L4.4 20.6 Z"],
      ["woodDark", "M2.2 3.7 A1.1 1.1 0 1 0 4.4 3.7 A1.1 1.1 0 1 0 2.2 3.7 Z M19.6 3.7 A1.1 1.1 0 1 0 21.8 3.7 A1.1 1.1 0 1 0 19.6 3.7 Z"],
    ],

    // tabulaDuplex — two tablets hinged, opened out, which is what a letter was
    tabulaDuplex: [
      ["wood", "M2.4 4.2 L11.5 4.2 L11.5 19.8 L2.4 19.8 Z M12.5 4.2 L21.6 4.2 L21.6 19.8 L12.5 19.8 Z"],
      ["ink", "M3.8 5.6 L10.3 5.6 L10.3 18.4 L3.8 18.4 Z M13.7 5.6 L20.2 5.6 L20.2 18.4 L13.7 18.4 Z"],
      ["papyrus", "M5.0 7.4 L9.1 7.4 L9.1 8.2 L5.0 8.2 Z M5.0 9.8 L9.1 9.8 L9.1 10.6 L5.0 10.6 Z M5.0 12.2 L9.1 12.2 L9.1 13.0 L5.0 13.0 Z M5.0 14.6 L7.4 14.6 L7.4 15.4 L5.0 15.4 Z M14.9 7.4 L19.0 7.4 L19.0 8.2 L14.9 8.2 Z M14.9 9.8 L19.0 9.8 L19.0 10.6 L14.9 10.6 Z M14.9 12.2 L19.0 12.2 L19.0 13.0 L14.9 13.0 Z M14.9 14.6 L17.3 14.6 L17.3 15.4 L14.9 15.4 Z"],
      ["bronze", "M11.3 4.2 L12.7 4.2 L12.7 19.8 L11.3 19.8 Z"],
      ["gold", "M11.3 7.0 L12.7 7.0 L12.7 8.6 L11.3 8.6 Z M11.3 15.4 L12.7 15.4 L12.7 17.0 L11.3 17.0 Z"],
    ],

    // coronaMuralis — given to whoever went over the wall first, and shaped
    // like the wall he went over
    coronaMuralis: [
      ["gold", "M3.4 7.4 L6.2 7.4 L6.2 13.0 L3.4 13.0 Z M7.8 7.4 L10.6 7.4 L10.6 13.0 L7.8 13.0 Z M13.4 7.4 L16.2 7.4 L16.2 13.0 L13.4 13.0 Z M17.8 7.4 L20.6 7.4 L20.6 13.0 L17.8 13.0 Z"],
      ["gold", "M3.4 11.6 L20.6 11.6 L20.6 19.8 C20.6 21.0 19.8 21.8 18.6 21.8 L5.4 21.8 C4.2 21.8 3.4 21.0 3.4 19.8 Z"],
      ["goldDeep", "M3.4 14.4 L20.6 14.4 L20.6 15.2 L3.4 15.2 Z M3.4 18.0 L20.6 18.0 L20.6 18.8 L3.4 18.8 Z M8.0 15.2 L8.8 15.2 L8.8 18.0 L8.0 18.0 Z M15.2 15.2 L16.0 15.2 L16.0 18.0 L15.2 18.0 Z"],
      ["bronze", "M10.2 21.8 L10.2 17.0 C10.2 15.9 11.0 15.2 12 15.2 C13.0 15.2 13.8 15.9 13.8 17.0 L13.8 21.8 Z"],
    ],

    // fascesCorona — the rods with a laurel on them, as they were carried in a
    // triumph rather than to an execution
    fascesCorona: [
      ["wood", "M8.0 6.0 C8.0 4.9 8.5 4.4 9.2 4.4 C9.9 4.4 10.4 4.9 10.4 6.0 L10.4 22.6 L8.0 22.6 Z M10.8 6.0 C10.8 4.9 11.3 4.4 12.0 4.4 C12.7 4.4 13.2 4.9 13.2 6.0 L13.2 22.6 L10.8 22.6 Z M13.6 6.0 C13.6 4.9 14.1 4.4 14.8 4.4 C15.5 4.4 16.0 4.9 16.0 6.0 L16.0 22.6 L13.6 22.6 Z"],
      ["woodDark", "M10.4 6.0 L10.8 6.0 L10.8 22.6 L10.4 22.6 Z M13.2 6.0 L13.6 6.0 L13.6 22.6 L13.2 22.6 Z"],
      ["blood", "M7.2 7.6 L16.8 7.6 L16.8 9.1 L7.2 9.1 Z M7.2 19.0 L16.8 19.0 L16.8 20.5 L7.2 20.5 Z"],
      ["laurelDark", "M12 8.6 C16.2 8.6 19.4 11.2 19.4 14.4 C19.4 17.6 16.2 20.2 12 20.2 C7.8 20.2 4.6 17.6 4.6 14.4 C4.6 11.2 7.8 8.6 12 8.6 Z M12 10.4 C8.8 10.4 6.4 12.2 6.4 14.4 C6.4 16.6 8.8 18.4 12 18.4 C15.2 18.4 17.6 16.6 17.6 14.4 C17.6 12.2 15.2 10.4 12 10.4 Z"],
      ["laurel", "M5.6 11.4 C4.6 10.6 4.6 9.2 5.8 8.6 C6.5 9.8 6.4 10.8 5.6 11.4 Z M4.6 15.6 C3.4 15.2 3.0 13.8 3.9 12.9 C4.9 13.7 5.2 14.7 4.6 15.6 Z M6.6 18.8 C5.4 18.9 4.5 17.8 4.9 16.7 C6.0 17.0 6.7 17.8 6.6 18.8 Z M18.4 11.4 C19.4 10.6 19.4 9.2 18.2 8.6 C17.5 9.8 17.6 10.8 18.4 11.4 Z M19.4 15.6 C20.6 15.2 21.0 13.8 20.1 12.9 C19.1 13.7 18.8 14.7 19.4 15.6 Z M17.4 18.8 C18.6 18.9 19.5 17.8 19.1 16.7 C18.0 17.0 17.3 17.8 17.4 18.8 Z"],
    ],

    // reteOnus — the net gathered up, weighted at the hem
    reteOnus: [
      ["bone", "M6.0 6.2 C6.0 4.8 8.6 3.8 12 3.8 C15.4 3.8 18.0 4.8 18.0 6.2 L17.0 15.2 C16.8 17.6 14.6 19.2 12 19.2 C9.4 19.2 7.2 17.6 7.0 15.2 Z"],
      ["ink", "M9.0 6.4 L10.0 7.6 L9.0 8.8 L8.0 7.6 Z M12 6.4 L13.0 7.6 L12 8.8 L11.0 7.6 Z M15 6.4 L16.0 7.6 L15 8.8 L14.0 7.6 Z M10.5 9.6 L11.5 10.8 L10.5 12.0 L9.5 10.8 Z M13.5 9.6 L14.5 10.8 L13.5 12.0 L12.5 10.8 Z M7.6 9.8 L8.5 10.9 L7.6 12.0 L6.8 10.9 Z M16.4 9.8 L17.2 10.9 L16.4 12.0 L15.5 10.9 Z M9.0 12.8 L10.0 14.0 L9.0 15.2 L8.0 14.0 Z M12 12.8 L13.0 14.0 L12 15.2 L11.0 14.0 Z M15 12.8 L16.0 14.0 L15 15.2 L14.0 14.0 Z M10.5 15.8 L11.4 16.9 L10.5 18.0 L9.6 16.9 Z M13.5 15.8 L14.4 16.9 L13.5 18.0 L12.6 16.9 Z"],
      ["bone", "M5.4 4.6 L18.6 4.6 L18.6 6.4 L5.4 6.4 Z"],
      ["iron", "M8.0 20.4 A1.3 1.3 0 1 0 10.6 20.4 A1.3 1.3 0 1 0 8.0 20.4 Z M10.7 21.6 A1.3 1.3 0 1 0 13.3 21.6 A1.3 1.3 0 1 0 10.7 21.6 Z M13.4 20.4 A1.3 1.3 0 1 0 16.0 20.4 A1.3 1.3 0 1 0 13.4 20.4 Z"],
    ],

    // aureus — the gold coin, wreath on the reverse where the denarius has a head
    aureus: [
      ["gold", "M1.8 12 A10.2 10.2 0 1 0 22.2 12 A10.2 10.2 0 1 0 1.8 12 Z"],
      ["goldDeep", "M3.0 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 Z M3.8 12 A8.2 8.2 0 1 0 20.2 12 A8.2 8.2 0 1 0 3.8 12 Z"],
      ["goldDeep", "M11.6 19.4 C7.8 18.6 5.4 15.6 5.4 12.0 C5.4 9.4 6.7 7.2 8.7 6.0 L9.7 7.5 C8.1 8.4 7.2 10.1 7.2 12.0 C7.2 14.9 9.1 17.2 11.9 17.8 Z M12.4 19.4 C16.2 18.6 18.6 15.6 18.6 12.0 C18.6 9.4 17.3 7.2 15.3 6.0 L14.3 7.5 C15.9 8.4 16.8 10.1 16.8 12.0 C16.8 14.9 14.9 17.2 12.1 17.8 Z"],
      ["goldDeep", "M10.4 9.6 L13.6 9.6 L13.6 11.0 L10.4 11.0 Z M9.4 12.2 L14.6 12.2 L14.6 13.6 L9.4 13.6 Z"],
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

    // hasta — the spear that stayed a spear
    hasta: [
      ["steel", "M12 0.6 L14.0 4.4 L13.4 8.2 L10.6 8.2 L10.0 4.4 Z"],
      ["steelDark", "M12 0.6 L14.0 4.4 L13.4 8.2 L12 8.2 Z"],
      ["wood", "M11.1 8.2 L12.9 8.2 L12.9 21.4 L11.1 21.4 Z"],
      ["bronze", "M10.6 21.4 L13.4 21.4 L12.9 23.4 L11.1 23.4 Z"],
    ],

    // arcus — the bow, with the arrow on the string
    arcus: [
      ["wood", "M16.0 2.4 C11.0 6.4 11.0 17.6 16.0 21.6 L17.4 20.2 C13.2 16.8 13.2 7.2 17.4 3.8 Z"],
      ["bone", "M15.6 2.4 L16.4 2.4 L16.4 21.6 L15.6 21.6 Z"],
      ["wood", "M3.4 11.5 L16.0 11.5 L16.0 12.5 L3.4 12.5 Z"],
      ["steel", "M0.6 12.0 L4.2 10.0 L4.2 14.0 Z"],
      ["blood", "M13.6 11.5 L16.2 9.8 L16.9 10.5 L15.2 12.0 L16.9 13.5 L16.2 14.2 L13.6 12.5 Z"],
    ],

    // funda — the sling: two cords to one hand, and a pouch with the stone
    // still in it. Cords that meet at the bottom instead make a necklace.
    funda: [
      ["bone", "M11.2 1.6 L12.6 2.2 L8.6 14.8 L7.2 14.2 Z M12.8 1.6 L11.4 2.2 L15.4 14.8 L16.8 14.2 Z"],
      ["woodDark", "M6.6 13.4 L17.4 13.4 C17.4 18.2 15.0 20.9 12 20.9 C9.0 20.9 6.6 18.2 6.6 13.4 Z"],
      ["iron", "M9.0 16.4 A3.0 3.0 0 1 0 15.0 16.4 A3.0 3.0 0 1 0 9.0 16.4 Z"],
      ["bone", "M10.8 0.8 A1.4 1.4 0 1 0 13.6 0.8 A1.4 1.4 0 1 0 10.8 0.8 Z"],
    ],

    // securis — the axe on its own, without the rods
    securis: [
      ["wood", "M11.0 5.4 L13.0 5.4 L13.0 23.2 L11.0 23.2 Z"],
      ["iron", "M9.6 2.6 L13.0 1.8 C18.2 3.2 19.8 8.4 16.4 11.8 L9.6 10.8 Z"],
      ["steelDark", "M16.4 11.8 C19.8 8.4 18.2 3.2 13.0 1.8 L13.0 3.6 C16.8 4.8 18.0 8.6 15.2 11.4 Z"],
      ["bronze", "M10.6 5.0 L13.4 5.0 L13.4 6.6 L10.6 6.6 Z"],
    ],

    // parma — the small round shield the auxiliaries and the cavalry carried
    parma: [
      ["bronze", "M1.6 12 A10.4 10.4 0 1 0 22.4 12 A10.4 10.4 0 1 0 1.6 12 Z M2.8 12 A9.2 9.2 0 1 0 21.2 12 A9.2 9.2 0 1 0 2.8 12 Z"],
      ["blood", "M2.8 12 A9.2 9.2 0 1 0 21.2 12 A9.2 9.2 0 1 0 2.8 12 Z"],
      ["gold", "M12 3.4 L13.8 9.0 L19.6 9.0 L14.9 12.4 L16.7 18.0 L12 14.5 L7.3 18.0 L9.1 12.4 L4.4 9.0 L10.2 9.0 Z"],
      ["bronze", "M9.8 12 A2.2 2.2 0 1 0 14.2 12 A2.2 2.2 0 1 0 9.8 12 Z"],
      ["gold", "M11.1 12 A0.9 0.9 0 1 0 12.9 12 A0.9 0.9 0 1 0 11.1 12 Z"],
    ],

    // lucerna — the oil lamp, lit. A loop handle behind and a nozzle in front
    // made a fish of it; the flame is what says lamp, so it sits square on the
    // spout and nothing trails off the back.
    lucerna: [
      ["clay", "M3.2 15.4 C3.2 12.4 6.0 10.4 9.8 10.4 C13.6 10.4 16.4 12.4 16.4 15.4 C16.4 18.2 13.6 20.0 9.8 20.0 C6.0 20.0 3.2 18.2 3.2 15.4 Z"],
      ["clay", "M15.0 13.2 L21.0 12.4 L21.4 15.6 L15.4 16.8 Z"],
      ["goldDeep", "M3.6 17.0 C4.8 19.0 7.2 20.0 9.8 20.0 C12.4 20.0 14.8 19.0 16.0 17.0 Z"],
      ["ink", "M7.8 13.6 A2.0 2.0 0 1 0 11.8 13.6 A2.0 2.0 0 1 0 7.8 13.6 Z"],
      ["clay", "M7.4 13.6 A2.4 2.4 0 1 0 12.2 13.6 A2.4 2.4 0 1 0 7.4 13.6 Z M8.2 13.6 A1.6 1.6 0 1 0 11.4 13.6 A1.6 1.6 0 1 0 8.2 13.6 Z"],
      ["flame", "M21.8 13.6 C23.6 11.0 23.4 7.4 21.2 5.0 C21.6 8.2 20.4 9.8 19.4 11.0 C20.6 11.6 21.4 12.5 21.8 13.6 Z"],
      ["gold", "M21.4 13.0 C22.5 11.2 22.4 8.8 21.1 7.2 C21.3 9.4 20.5 10.4 19.9 11.1 C20.6 11.6 21.1 12.3 21.4 13.0 Z"],
    ],

    // calamus — the reed pen. Drawn upright it is a stick and nothing else;
    // held across the box at the angle a hand holds it, it is a pen.
    calamus: [
      ["bone", "M17.98 3.04 L20.02 4.96 L7.02 17.96 L4.98 16.04 Z"],
      ["woodDark", "M13.43 7.59 L15.47 9.51 L14.50 10.48 L12.46 8.56 Z M10.83 10.19 L12.87 12.11 L11.90 13.08 L9.86 11.16 Z"],
      ["ink", "M4.98 16.04 L7.02 17.96 L3.0 20.0 Z"],
      ["goldDeep", "M17.98 3.04 L20.02 4.96 L19.2 5.78 L17.16 3.86 Z"],
    ],

    // bulla — the amulet a freeborn child wore until the day he put it off
    bulla: [
      ["woodDark", "M12 2.0 A4.0 4.0 0 1 0 12 10.0 A4.0 4.0 0 1 0 12 2.0 Z M12 3.6 A2.4 2.4 0 1 1 12 8.4 A2.4 2.4 0 1 1 12 3.6 Z"],
      ["gold", "M11.2 8.8 L12.8 8.8 L12.8 11.4 L11.2 11.4 Z"],
      ["gold", "M6.6 16.2 A5.4 5.4 0 1 0 17.4 16.2 A5.4 5.4 0 1 0 6.6 16.2 Z"],
      ["goldDeep", "M8.0 16.2 A4.0 4.0 0 1 0 16.0 16.2 A4.0 4.0 0 1 0 8.0 16.2 Z M9.4 16.2 A2.6 2.6 0 1 0 14.6 16.2 A2.6 2.6 0 1 0 9.4 16.2 Z"],
      ["gold", "M10.8 16.2 A1.2 1.2 0 1 0 13.2 16.2 A1.2 1.2 0 1 0 10.8 16.2 Z"],
    ],

    // cornu — the horn that carried the signal over a battle, wrapped round the
    // player and braced on a bar
    cornu: [
      ["bronze", "M14.0 3.2 C7.2 3.2 2.6 7.6 2.6 12.6 C2.6 17.8 7.4 21.8 13.6 21.8 C17.4 21.8 20.4 20.2 21.6 17.6 L19.4 16.6 C18.4 18.6 16.2 19.8 13.6 19.8 C8.6 19.8 4.8 16.6 4.8 12.6 C4.8 8.8 8.4 5.4 14.0 5.4 Z"],
      ["goldDeep", "M13.4 1.8 L13.4 6.6 L17.6 7.6 L17.6 0.8 Z"],
      ["gold", "M14.6 2.6 L14.6 5.8 L16.4 6.2 L16.4 2.2 Z"],
      ["wood", "M5.6 11.6 L19.6 11.6 L19.6 13.4 L5.6 13.4 Z"],
      ["woodDark", "M5.6 11.6 L19.6 11.6 L19.6 12.2 L5.6 12.2 Z"],
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
    //
    // The profile is drawn as a profile: brow, the bridge and tip of the nose,
    // the philtrum, both lips, the chin and the jaw back to a neck that is cut
    // off square the way a die cuts it. A smooth blob in roughly that outline
    // is what the first attempt was, and it read as nothing at all.
    denarius2: [
      ["gold", "M1.4 12 A10.6 10.6 0 1 0 22.6 12 A10.6 10.6 0 1 0 1.4 12 Z"],
      ["goldDeep", "M2.6 12 A9.4 9.4 0 1 0 21.4 12 A9.4 9.4 0 1 0 2.6 12 Z M3.5 12 A8.5 8.5 0 1 0 20.5 12 A8.5 8.5 0 1 0 3.5 12 Z"],
      ["goldDeep", "M11.4 2.6 A0.62 0.62 0 1 0 12.64 2.6 A0.62 0.62 0 1 0 11.4 2.6 Z M15.6 3.4 A0.62 0.62 0 1 0 16.84 3.4 A0.62 0.62 0 1 0 15.6 3.4 Z M18.6 6.2 A0.62 0.62 0 1 0 19.84 6.2 A0.62 0.62 0 1 0 18.6 6.2 Z M20.0 10.0 A0.62 0.62 0 1 0 21.24 10.0 A0.62 0.62 0 1 0 20.0 10.0 Z M19.5 14.1 A0.62 0.62 0 1 0 20.74 14.1 A0.62 0.62 0 1 0 19.5 14.1 Z M17.2 17.5 A0.62 0.62 0 1 0 18.44 17.5 A0.62 0.62 0 1 0 17.2 17.5 Z M13.8 19.8 A0.62 0.62 0 1 0 15.04 19.8 A0.62 0.62 0 1 0 13.8 19.8 Z M9.6 20.2 A0.62 0.62 0 1 0 10.84 20.2 A0.62 0.62 0 1 0 9.6 20.2 Z M5.8 18.4 A0.62 0.62 0 1 0 7.04 18.4 A0.62 0.62 0 1 0 5.8 18.4 Z M3.4 15.0 A0.62 0.62 0 1 0 4.64 15.0 A0.62 0.62 0 1 0 3.4 15.0 Z M3.1 10.8 A0.62 0.62 0 1 0 4.34 10.8 A0.62 0.62 0 1 0 3.1 10.8 Z M4.9 7.0 A0.62 0.62 0 1 0 6.14 7.0 A0.62 0.62 0 1 0 4.9 7.0 Z M8.0 4.0 A0.62 0.62 0 1 0 9.24 4.0 A0.62 0.62 0 1 0 8.0 4.0 Z"],
      ["bronze", "M7.9 18.9 L7.9 17.2 C7.1 15.3 7.0 13.0 7.7 11.0 C8.8 7.9 11.6 6.2 14.3 6.7 C16.1 7.1 17.2 8.4 17.1 10.0 L16.2 11.5 L17.7 13.2 L16.0 13.7 L16.5 14.5 L15.2 15.1 L15.6 15.9 L14.3 16.3 L14.4 17.2 C13.0 17.9 11.6 18.2 10.4 18.0 L10.4 18.9 Z"],
      ["woodDark", "M7.7 12.9 C7.9 9.4 10.5 6.5 13.7 6.7 C15.6 6.9 16.9 8.2 17.1 9.9 L15.7 9.6 C15.4 8.6 14.7 8.0 13.5 7.9 C11.1 7.7 9.1 9.8 8.9 13.1 Z"],
      ["laurelDark", "M8.0 13.6 C8.3 10.1 10.8 7.5 13.7 7.7 C15.3 7.9 16.4 8.7 16.8 9.8 L15.5 10.3 C15.2 9.6 14.6 9.1 13.6 9.0 C11.5 8.8 9.7 10.9 9.2 13.7 Z"],
      ["laurel", "M8.7 10.3 C8.1 9.1 8.5 7.8 9.7 7.4 C10.2 8.6 9.9 9.7 8.7 10.3 Z M10.9 8.1 C10.6 6.8 11.4 5.7 12.7 5.7 C12.8 7.0 12.1 7.9 10.9 8.1 Z M13.7 7.5 C14.0 6.2 15.1 5.6 16.2 6.1 C15.7 7.3 14.9 7.9 13.7 7.5 Z M15.9 8.6 C16.6 7.6 17.8 7.5 18.5 8.4 C17.7 9.2 16.8 9.3 15.9 8.6 Z"],
      ["laurel", "M8.1 13.9 L9.4 14.5 L8.0 16.9 L7.2 16.0 Z M8.0 13.6 L8.9 14.8 L6.3 15.4 L6.3 14.2 Z"],
      ["goldDeep", "M10.0 10.0 A0.55 0.55 0 1 0 11.1 10.0 A0.55 0.55 0 1 0 10.0 10.0 Z"],
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

    rota3: [
      ["iron", "M1.2 12 A10.8 10.8 0 1 0 22.8 12 A10.8 10.8 0 1 0 1.2 12 Z M3.2 12 A8.8 8.8 0 1 0 20.8 12 A8.8 8.8 0 1 0 3.2 12 Z"],
      ["steelDark", "M1.2 12 A10.8 10.8 0 1 0 22.8 12 A10.8 10.8 0 1 0 1.2 12 Z M2.0 12 A10.0 10.0 0 1 0 22.0 12 A10.0 10.0 0 1 0 2.0 12 Z"],
      ["steelLight", "M11.6 1.3 A0.45 0.45 0 1 0 12.5 1.3 A0.45 0.45 0 1 0 11.6 1.3 Z M18.7 4.5 A0.45 0.45 0 1 0 19.6 4.5 A0.45 0.45 0 1 0 18.7 4.5 Z M22.0 11.6 A0.45 0.45 0 1 0 22.9 11.6 A0.45 0.45 0 1 0 22.0 11.6 Z M18.7 18.7 A0.45 0.45 0 1 0 19.6 18.7 A0.45 0.45 0 1 0 18.7 18.7 Z M11.6 22.0 A0.45 0.45 0 1 0 12.5 22.0 A0.45 0.45 0 1 0 11.6 22.0 Z M4.5 18.7 A0.45 0.45 0 1 0 5.4 18.7 A0.45 0.45 0 1 0 4.5 18.7 Z M1.2 11.6 A0.45 0.45 0 1 0 2.1 11.6 A0.45 0.45 0 1 0 1.2 11.6 Z M4.5 4.5 A0.45 0.45 0 1 0 5.4 4.5 A0.45 0.45 0 1 0 4.5 4.5 Z"],
      ["wood", "M3.2 12 A8.8 8.8 0 1 0 20.8 12 A8.8 8.8 0 1 0 3.2 12 Z M5.0 12 A7.0 7.0 0 1 0 19.0 12 A7.0 7.0 0 1 0 5.0 12 Z"],
      ["woodDark", "M11.7 3.2 L12.3 3.2 L12.3 5.0 L11.7 5.0 Z M17.9 5.5 L18.3 5.9 L17.0 7.2 L16.6 6.8 Z M20.8 11.7 L20.8 12.3 L19.0 12.3 L19.0 11.7 Z M18.3 18.1 L17.9 18.5 L16.6 17.2 L17.0 16.8 Z M12.3 20.8 L11.7 20.8 L11.7 19.0 L12.3 19.0 Z M6.1 18.5 L5.7 18.1 L7.0 16.8 L7.4 17.2 Z M3.2 12.3 L3.2 11.7 L5.0 11.7 L5.0 12.3 Z M5.7 5.9 L6.1 5.5 L7.4 6.8 L7.0 7.2 Z"],
      ["wood", "M11.0 4.8 L13.0 4.8 L13.0 19.2 L11.0 19.2 Z M4.8 11.0 L19.2 11.0 L19.2 13.0 L4.8 13.0 Z M6.6 5.2 L18.8 17.4 L17.4 18.8 L5.2 6.6 Z M17.4 5.2 L18.8 6.6 L6.6 18.8 L5.2 17.4 Z"],
      ["woodLight", "M11.0 4.8 L11.7 4.8 L11.7 19.2 L11.0 19.2 Z M4.8 11.0 L19.2 11.0 L19.2 11.7 L4.8 11.7 Z M6.6 5.2 L18.8 17.4 L18.3 17.9 L6.1 5.7 Z M17.4 5.2 L17.9 5.7 L5.7 17.9 L5.2 17.4 Z"],
      ["bronze", "M8.8 12 A3.2 3.2 0 1 0 15.2 12 A3.2 3.2 0 1 0 8.8 12 Z"],
      ["goldLight", "M9.8 10.6 A1.2 1.2 0 1 0 12.2 10.6 A1.2 1.2 0 1 0 9.8 10.6 Z"],
      ["iron", "M10.6 12 A1.4 1.4 0 1 0 13.4 12 A1.4 1.4 0 1 0 10.6 12 Z"],
      ["steelLight", "M11.4 11.4 A0.5 0.5 0 1 0 12.4 11.4 A0.5 0.5 0 1 0 11.4 11.4 Z"],
    ],

    corona3: [
      ["laurelDark", "M12 21.6 C6.4 21.0 2.4 16.8 2.4 11.6 C2.4 7.6 4.6 4.2 7.8 2.6 L8.9 4.6 C6.3 5.9 4.6 8.5 4.6 11.6 C4.6 15.8 7.8 19.2 12 19.6 Z M12 21.6 C17.6 21.0 21.6 16.8 21.6 11.6 C21.6 7.6 19.4 4.2 16.2 2.6 L15.1 4.6 C17.7 5.9 19.4 8.5 19.4 11.6 C19.4 15.8 16.2 19.2 12 19.6 Z"],
      ["laurel", "M4.0 9.4 C2.6 8.0 2.6 5.8 4.4 4.8 C5.5 6.6 5.4 8.3 4.0 9.4 Z M3.1 13.4 C1.5 12.5 1.1 10.4 2.6 9.0 C4.1 10.3 4.2 12.0 3.1 13.4 Z M4.2 17.2 C2.5 16.8 1.5 14.9 2.6 13.2 C4.3 14.2 4.9 15.7 4.2 17.2 Z M6.8 20.2 C5.1 20.2 3.7 18.6 4.3 16.8 C6.1 17.4 7.0 18.7 6.8 20.2 Z M6.4 6.2 C5.5 4.4 6.4 2.4 8.5 2.2 C8.7 4.3 7.9 5.7 6.4 6.2 Z M9.6 3.8 C9.3 1.9 10.8 0.4 12.7 0.9 C12.4 2.9 11.3 3.9 9.6 3.8 Z"],
      ["laurel", "M20.0 9.4 C21.4 8.0 21.4 5.8 19.6 4.8 C18.5 6.6 18.6 8.3 20.0 9.4 Z M20.9 13.4 C22.5 12.5 22.9 10.4 21.4 9.0 C19.9 10.3 19.8 12.0 20.9 13.4 Z M19.8 17.2 C21.5 16.8 22.5 14.9 21.4 13.2 C19.7 14.2 19.1 15.7 19.8 17.2 Z M17.2 20.2 C18.9 20.2 20.3 18.6 19.7 16.8 C17.9 17.4 17.0 18.7 17.2 20.2 Z M17.6 6.2 C18.5 4.4 17.6 2.4 15.5 2.2 C15.3 4.3 16.1 5.7 17.6 6.2 Z M14.4 3.8 C14.7 1.9 13.2 0.4 11.3 0.9 C11.6 2.9 12.7 3.9 14.4 3.8 Z"],
      ["laurelDark", "M8.5 2.2 C8.0 3.5 7.4 4.7 6.4 6.2 C6.6 4.6 7.3 3.2 8.5 2.2 Z M2.6 9.0 C3.0 10.4 3.1 11.9 3.1 13.4 C2.4 12.0 2.3 10.5 2.6 9.0 Z M15.5 2.2 C16.0 3.5 16.6 4.7 17.6 6.2 C17.4 4.6 16.7 3.2 15.5 2.2 Z M21.4 9.0 C21.0 10.4 20.9 11.9 20.9 13.4 C21.6 12.0 21.7 10.5 21.4 9.0 Z"],
      ["blood", "M9.0 21.2 L11.4 20.6 L11.9 23.0 L9.4 23.6 Z M15.0 21.2 L12.6 20.6 L12.1 23.0 L14.6 23.6 Z"],
      ["gold", "M10.2 19.6 L13.8 19.6 L13.8 22.0 C13.8 22.6 10.2 22.6 10.2 22.0 Z"],
      ["goldLight", "M10.2 19.6 L13.8 19.6 L13.8 20.4 L10.2 20.4 Z"],
    ],

    denarius3: [
      ["gold", "M1.2 12 A10.8 10.8 0 1 0 22.8 12 A10.8 10.8 0 1 0 1.2 12 Z"],
      ["goldLight", "M1.2 12 A10.8 10.8 0 1 0 22.8 12 A10.8 10.8 0 1 0 1.2 12 Z M2.1 12 A9.9 9.9 0 1 0 21.9 12 A9.9 9.9 0 1 0 2.1 12 Z"],
      ["goldDeep", "M2.4 12 A9.6 9.6 0 1 0 21.6 12 A9.6 9.6 0 1 0 2.4 12 Z M3.3 12 A8.7 8.7 0 1 0 20.7 12 A8.7 8.7 0 1 0 3.3 12 Z"],
      ["goldDeep", "M11.4 2.3 A0.62 0.62 0 1 0 12.64 2.3 A0.62 0.62 0 1 0 11.4 2.3 Z M15.7 3.2 A0.62 0.62 0 1 0 16.94 3.2 A0.62 0.62 0 1 0 15.7 3.2 Z M18.9 6.0 A0.62 0.62 0 1 0 20.14 6.0 A0.62 0.62 0 1 0 18.9 6.0 Z M20.3 10.0 A0.62 0.62 0 1 0 21.54 10.0 A0.62 0.62 0 1 0 20.3 10.0 Z M19.8 14.3 A0.62 0.62 0 1 0 21.04 14.3 A0.62 0.62 0 1 0 19.8 14.3 Z M17.4 17.9 A0.62 0.62 0 1 0 18.64 17.9 A0.62 0.62 0 1 0 17.4 17.9 Z M13.8 20.3 A0.62 0.62 0 1 0 15.04 20.3 A0.62 0.62 0 1 0 13.8 20.3 Z M9.4 20.7 A0.62 0.62 0 1 0 10.64 20.7 A0.62 0.62 0 1 0 9.4 20.7 Z M5.5 18.8 A0.62 0.62 0 1 0 6.74 18.8 A0.62 0.62 0 1 0 5.5 18.8 Z M3.0 15.2 A0.62 0.62 0 1 0 4.24 15.2 A0.62 0.62 0 1 0 3.0 15.2 Z M2.7 10.8 A0.62 0.62 0 1 0 3.94 10.8 A0.62 0.62 0 1 0 2.7 10.8 Z M4.6 6.7 A0.62 0.62 0 1 0 5.84 6.7 A0.62 0.62 0 1 0 4.6 6.7 Z M7.8 3.6 A0.62 0.62 0 1 0 9.04 3.6 A0.62 0.62 0 1 0 7.8 3.6 Z"],
      ["bronze", "M7.9 18.9 L7.9 17.2 C7.1 15.3 7.0 13.0 7.7 11.0 C8.8 7.9 11.6 6.2 14.3 6.7 C16.1 7.1 17.2 8.4 17.1 10.0 L16.2 11.5 L17.7 13.2 L16.0 13.7 L16.5 14.5 L15.2 15.1 L15.6 15.9 L14.3 16.3 L14.4 17.2 C13.0 17.9 11.6 18.2 10.4 18.0 L10.4 18.9 Z"],
      ["bronzeDark", "M9.1 18.6 C8.4 16.7 8.3 14.4 8.9 12.4 C9.7 9.8 11.5 8.1 13.5 7.8 C11.2 8.4 9.5 10.2 8.8 12.6 C8.2 14.6 8.4 16.8 9.1 18.6 Z M16.2 11.5 L17.7 13.2 L16.0 13.7 L16.9 13.1 Z M15.2 15.1 L15.6 15.9 L14.3 16.3 L15.0 15.7 Z"],
      ["woodDark", "M7.7 12.9 C7.9 9.4 10.5 6.5 13.7 6.7 C15.6 6.9 16.9 8.2 17.1 9.9 L15.7 9.6 C15.4 8.6 14.7 8.0 13.5 7.9 C11.1 7.7 9.1 9.8 8.9 13.1 Z"],
      ["laurelDark", "M8.0 13.6 C8.3 10.1 10.8 7.5 13.7 7.7 C15.3 7.9 16.4 8.7 16.8 9.8 L15.5 10.3 C15.2 9.6 14.6 9.1 13.6 9.0 C11.5 8.8 9.7 10.9 9.2 13.7 Z"],
      ["laurel", "M8.7 10.3 C8.1 9.1 8.5 7.8 9.7 7.4 C10.2 8.6 9.9 9.7 8.7 10.3 Z M10.9 8.1 C10.6 6.8 11.4 5.7 12.7 5.7 C12.8 7.0 12.1 7.9 10.9 8.1 Z M13.7 7.5 C14.0 6.2 15.1 5.6 16.2 6.1 C15.7 7.3 14.9 7.9 13.7 7.5 Z M15.9 8.6 C16.6 7.6 17.8 7.5 18.5 8.4 C17.7 9.2 16.8 9.3 15.9 8.6 Z"],
      ["laurel", "M8.1 13.9 L9.4 14.5 L8.0 16.9 L7.2 16.0 Z M8.0 13.6 L8.9 14.8 L6.3 15.4 L6.3 14.2 Z"],
      ["goldDeep", "M10.0 10.0 A0.55 0.55 0 1 0 11.1 10.0 A0.55 0.55 0 1 0 10.0 10.0 Z"],
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

    // Iuppiter — the bolt is half the drawing, so the head moves off centre to
    // make room for it rather than the two being crushed together.
    //
    // The beard is narrower than the face and the hair stops above the cheek,
    // so a band of skin runs down each side of him. Drawn without that gap the
    // hair and the beard closed round the face into one white egg, which is
    // what the first attempt was.
    iuppiter: [
      ["flesh", "M10.2 12.6 C11.0 12.6 11.3 13.4 11.3 14.4 C14.4 15.0 16.4 17.4 16.4 21.0 L16.4 23.6 L4.0 23.6 L4.0 21.0 C4.0 17.4 6.0 15.0 9.1 14.4 C9.1 13.4 9.4 12.6 10.2 12.6 Z"],
      ["blood", "M9.1 14.4 C6.0 15.0 4.0 17.4 4.0 21.0 L4.0 23.6 L16.4 23.6 L16.4 21.0 C16.4 17.4 14.4 15.0 11.3 14.4 C11.3 16.2 9.1 16.2 9.1 14.4 Z"],
      ["bloodDark", "M11.3 14.4 C14.4 15.0 16.4 17.4 16.4 21.0 L16.4 23.6 L13.6 23.6 L13.6 20.6 C13.6 17.6 12.8 15.6 11.3 15.2 Z"],
      ["hoar", "M10.2 1.6 C14.3 1.6 16.4 4.4 16.4 8.6 C16.4 10.0 16.2 11.4 15.8 12.6 L13.6 11.8 C13.9 10.8 14.0 9.6 14.0 8.4 C14.0 6.4 12.8 5.4 10.2 5.4 C7.6 5.4 6.4 6.4 6.4 8.4 C6.4 9.6 6.5 10.8 6.8 11.8 L4.6 12.6 C4.2 11.4 4.0 10.0 4.0 8.6 C4.0 4.4 6.1 1.6 10.2 1.6 Z"],
      ["hoarShade", "M14.0 8.4 C14.0 9.8 13.9 11.0 13.6 11.8 L15.8 12.6 C16.2 11.4 16.4 10.0 16.4 8.6 C16.4 5.6 15.3 3.4 13.2 2.3 C14.4 3.8 14.0 6.2 14.0 8.4 Z"],
      ["flesh", "M10.2 3.6 C12.43 3.6 14.02 5.4 14.02 8.2 C14.02 12.02 12.29 14.97 10.2 14.97 C8.11 14.97 6.38 12.02 6.38 8.2 C6.38 5.4 7.97 3.6 10.2 3.6 Z"],
      ["fleshShade", "M10.2 3.6 C12.43 3.6 14.02 5.4 14.02 8.2 C14.02 12.02 12.29 14.97 10.2 14.97 Z"],
      ["hoar", "M6.0 4.6 C7.2 3.2 8.6 2.6 10.2 2.6 C11.8 2.6 13.2 3.2 14.4 4.6 L14.4 6.2 C13.6 5.4 13.0 5.6 12.4 6.0 C11.9 5.2 11.3 4.9 10.2 4.9 C9.1 4.9 8.5 5.2 8.0 6.0 C7.4 5.6 6.8 5.4 6.0 6.2 Z"],
      ["hoarShade", "M12.4 6.0 C13.0 5.6 13.6 5.4 14.4 6.2 L14.4 4.6 C13.8 3.9 13.1 3.4 12.3 3.1 C12.7 3.9 12.7 4.9 12.4 6.0 Z"],
      ["hoarShade", "M7.25 7.34 C7.75 6.62 8.69 6.48 9.34 6.91 L9.12 7.48 C8.62 7.2 8.04 7.27 7.68 7.77 Z M13.15 7.34 C12.65 6.62 11.71 6.48 11.06 6.91 L11.28 7.48 C11.78 7.2 12.36 7.27 12.72 7.77 Z"],
      ["fleshLight", "M7.18 8.71 C7.75 7.92 9.05 7.92 9.62 8.71 C9.05 9.5 7.75 9.5 7.18 8.71 Z M10.78 8.71 C11.35 7.92 12.65 7.92 13.22 8.71 C12.65 9.5 11.35 9.5 10.78 8.71 Z"],
      ["woodDark", "M7.79 8.71 A0.61 0.61 0 1 0 9.01 8.71 A0.61 0.61 0 1 0 7.79 8.71 Z M11.39 8.71 A0.61 0.61 0 1 0 12.61 8.71 A0.61 0.61 0 1 0 11.39 8.71 Z"],
      ["ink", "M8.11 8.71 A0.29 0.29 0 1 0 8.69 8.71 A0.29 0.29 0 1 0 8.11 8.71 Z M11.71 8.71 A0.29 0.29 0 1 0 12.29 8.71 A0.29 0.29 0 1 0 11.71 8.71 Z"],
      ["fleshShade", "M9.77 9.21 L10.63 9.21 L10.88 11.23 C10.88 11.66 9.52 11.66 9.52 11.23 Z"],
      ["hoar", "M7.4 11.6 C7.0 15.6 7.8 18.6 9.2 20.4 C9.8 21.1 10.6 21.1 11.2 20.4 C12.6 18.6 13.4 15.6 13.0 11.6 C13.0 13.6 12.1 14.6 10.2 14.6 C8.3 14.6 7.4 13.6 7.4 11.6 Z"],
      ["hoarShade", "M13.0 11.6 C13.4 15.6 12.6 18.6 11.2 20.4 C11.0 20.6 10.8 20.8 10.5 20.9 C11.6 19.0 12.3 16.4 12.5 13.2 C12.7 13.6 12.9 12.9 13.0 11.6 Z"],
      ["hoar", "M8.0 11.4 C8.6 10.9 9.4 10.8 10.2 11.1 C11.0 10.8 11.8 10.9 12.4 11.4 C11.8 12.4 11.0 12.7 10.2 12.4 C9.4 12.7 8.6 12.4 8.0 11.4 Z"],
      ["gold", "M21.29 3.6 L16.4 9.95 L18.95 9.95 L17.75 14.84 L22.85 8.28 L20.2 8.28 Z"],
      ["goldLight", "M20.87 4.85 L17.65 9.43 L19.21 9.43 L18.38 13.07 L21.7 8.6 L20.04 8.6 Z"],
    ],

    // Minerva — the crest has to stand clear above the dome, not lie along the
    // top of it, so the head sits low in the box and gives the crest the top
    // third. A crest drawn flush with the skull reads as a red hairband.
    minerva: [
      ["flesh", "M12 15.4 C13.3 15.4 13.8 16.6 13.8 18.0 C16.9 18.6 19.0 20.6 19.0 23.6 L5.0 23.6 C5.0 20.6 7.1 18.6 10.2 18.0 C10.2 16.6 10.7 15.4 12 15.4 Z"],
      ["bone", "M10.2 18.0 C7.1 18.6 5.0 20.6 5.0 23.6 L19.0 23.6 C19.0 20.6 16.9 18.6 13.8 18.0 C13.8 19.9 10.2 19.9 10.2 18.0 Z"],
      ["stoneShade", "M13.8 18.0 C16.9 18.6 19.0 20.6 19.0 23.6 L15.8 23.6 C15.8 20.8 15.1 18.9 13.8 18.6 Z"],
      ["blood", "M4.8 9.6 C5.8 4.0 8.6 0.8 12 0.8 C15.4 0.8 18.2 4.0 19.2 9.6 L16.8 9.6 C16.0 5.4 14.3 3.0 12 3.0 C9.7 3.0 8.0 5.4 7.2 9.6 Z"],
      ["bloodDark", "M13.8 1.2 C16.4 2.4 18.4 5.4 19.2 9.6 L16.8 9.6 C16.2 6.2 15.2 3.9 13.6 2.6 Z"],
      ["bloodLight", "M10.2 1.2 C8.4 2.2 7.0 4.2 6.2 7.0 L5.4 6.6 C6.2 3.8 7.7 1.8 9.6 0.9 Z"],
      ["flesh", "M12 5.5 C14.33 5.5 15.98 7.38 15.98 10.3 C15.98 14.28 14.18 17.35 12 17.35 C9.82 17.35 8.03 14.28 8.03 10.3 C8.03 7.38 9.68 5.5 12 5.5 Z"],
      ["fleshShade", "M12 5.5 C14.33 5.5 15.98 7.38 15.98 10.3 C15.98 14.28 14.18 17.35 12 17.35 Z"],
      ["fleshShade", "M8.93 9.4 C9.45 8.65 10.43 8.5 11.1 8.95 L10.88 9.55 C10.35 9.25 9.75 9.33 9.38 9.85 Z M15.08 9.4 C14.55 8.65 13.58 8.5 12.9 8.95 L13.13 9.55 C13.65 9.25 14.25 9.33 14.63 9.85 Z"],
      ["fleshLight", "M8.85 10.83 C9.45 10 10.8 10 11.4 10.83 C10.8 11.65 9.45 11.65 8.85 10.83 Z M12.6 10.83 C13.2 10 14.55 10 15.15 10.83 C14.55 11.65 13.2 11.65 12.6 10.83 Z"],
      ["laurelDark", "M9.49 10.83 A0.64 0.64 0 1 0 10.76 10.83 A0.64 0.64 0 1 0 9.49 10.83 Z M13.24 10.83 A0.64 0.64 0 1 0 14.51 10.83 A0.64 0.64 0 1 0 13.24 10.83 Z"],
      ["ink", "M9.82 10.83 A0.3 0.3 0 1 0 10.43 10.83 A0.3 0.3 0 1 0 9.82 10.83 Z M13.58 10.83 A0.3 0.3 0 1 0 14.18 10.83 A0.3 0.3 0 1 0 13.58 10.83 Z"],
      ["fleshShade", "M11.55 11.35 L12.45 11.35 L12.71 13.45 C12.71 13.9 11.29 13.9 11.29 13.45 Z"],
      ["blood", "M10.65 14.88 C11.18 14.43 12.83 14.43 13.35 14.88 C12.83 15.48 11.18 15.48 10.65 14.88 Z"],
      ["steel", "M6.8 9.6 C6.8 5.4 9.1 3.0 12 3.0 C14.9 3.0 17.2 5.4 17.2 9.6 Z"],
      ["steelDark", "M12 3.0 C14.9 3.0 17.2 5.4 17.2 9.6 L12 9.6 Z"],
      ["steelLight", "M8.6 8.8 C8.7 6.6 9.5 5.0 10.8 4.2 C10.0 5.4 9.6 7.0 9.5 8.8 Z"],
      ["gold", "M6.2 8.8 L17.8 8.8 L17.8 10.4 L6.2 10.4 Z"],
      ["goldDeep", "M6.2 9.8 L17.8 9.8 L17.8 10.4 L6.2 10.4 Z"],
      ["goldLight", "M6.2 8.8 L17.8 8.8 L17.8 9.2 L6.2 9.2 Z"],
      ["steel", "M6.2 10.4 L8.5 10.4 L8.5 15.2 C8.5 16.0 6.2 16.0 6.2 15.2 Z M17.8 10.4 L15.5 10.4 L15.5 15.2 C15.5 16.0 17.8 16.0 17.8 15.2 Z"],
      ["steelDark", "M17.8 10.4 L16.6 10.4 L16.6 15.2 C16.6 15.6 17.2 15.8 17.8 15.7 Z"],
      ["goldDeep", "M6.9 12.4 A0.42 0.42 0 1 0 7.74 12.4 A0.42 0.42 0 1 0 6.9 12.4 Z M16.26 12.4 A0.42 0.42 0 1 0 17.1 12.4 A0.42 0.42 0 1 0 16.26 12.4 Z"],
    ],

    // Mars — the same construction as Minerva, with the crest a shade taller
    // and a beard under it. That beard is the whole difference between the two
    // of them at 17px, which is why it is drawn dark against the metal.
    mars: [
      ["flesh", "M12 15.4 C13.3 15.4 13.8 16.6 13.8 18.0 C16.9 18.6 19.0 20.6 19.0 23.6 L5.0 23.6 C5.0 20.6 7.1 18.6 10.2 18.0 C10.2 16.6 10.7 15.4 12 15.4 Z"],
      ["blood", "M10.2 18.0 C7.1 18.6 5.0 20.6 5.0 23.6 L19.0 23.6 C19.0 20.6 16.9 18.6 13.8 18.0 C13.8 19.9 10.2 19.9 10.2 18.0 Z"],
      ["bloodDark", "M13.8 18.0 C16.9 18.6 19.0 20.6 19.0 23.6 L15.8 23.6 C15.8 20.8 15.1 18.9 13.8 18.6 Z"],
      ["blood", "M4.4 9.8 C5.4 3.6 8.4 0.4 12 0.4 C15.6 0.4 18.6 3.6 19.6 9.8 L17.0 9.8 C16.2 5.2 14.4 2.6 12 2.6 C9.6 2.6 7.8 5.2 7.0 9.8 Z"],
      ["bloodDark", "M13.8 0.8 C16.6 2.0 18.7 5.2 19.6 9.8 L17.0 9.8 C16.4 6.0 15.3 3.5 13.6 2.2 Z"],
      ["bloodLight", "M10.2 0.8 C8.2 1.9 6.7 4.2 5.9 7.2 L5.1 6.8 C5.9 3.7 7.5 1.5 9.6 0.5 Z"],
      ["flesh", "M12 5.5 C14.33 5.5 15.98 7.38 15.98 10.3 C15.98 14.28 14.18 17.35 12 17.35 C9.82 17.35 8.03 14.28 8.03 10.3 C8.03 7.38 9.68 5.5 12 5.5 Z"],
      ["fleshShade", "M12 5.5 C14.33 5.5 15.98 7.38 15.98 10.3 C15.98 14.28 14.18 17.35 12 17.35 Z"],
      ["fleshShade", "M8.93 9.4 C9.45 8.65 10.43 8.5 11.1 8.95 L10.88 9.55 C10.35 9.25 9.75 9.33 9.38 9.85 Z M15.08 9.4 C14.55 8.65 13.58 8.5 12.9 8.95 L13.13 9.55 C13.65 9.25 14.25 9.33 14.63 9.85 Z"],
      ["fleshLight", "M8.85 10.83 C9.45 10 10.8 10 11.4 10.83 C10.8 11.65 9.45 11.65 8.85 10.83 Z M12.6 10.83 C13.2 10 14.55 10 15.15 10.83 C14.55 11.65 13.2 11.65 12.6 10.83 Z"],
      ["woodDark", "M9.49 10.83 A0.64 0.64 0 1 0 10.76 10.83 A0.64 0.64 0 1 0 9.49 10.83 Z M13.24 10.83 A0.64 0.64 0 1 0 14.51 10.83 A0.64 0.64 0 1 0 13.24 10.83 Z"],
      ["ink", "M9.82 10.83 A0.3 0.3 0 1 0 10.43 10.83 A0.3 0.3 0 1 0 9.82 10.83 Z M13.58 10.83 A0.3 0.3 0 1 0 14.18 10.83 A0.3 0.3 0 1 0 13.58 10.83 Z"],
      ["fleshShade", "M11.55 11.35 L12.45 11.35 L12.71 13.45 C12.71 13.9 11.29 13.9 11.29 13.45 Z"],
      ["woodDark", "M8.0 12.6 C7.6 16.4 8.6 19.4 10.3 21.2 C11.2 22.2 12.8 22.2 13.7 21.2 C15.4 19.4 16.4 16.4 16.0 12.6 C16.0 15.2 14.7 16.4 12 16.4 C9.3 16.4 8.0 15.2 8.0 12.6 Z"],
      ["wood", "M8.0 12.6 C7.6 16.4 8.6 19.4 10.3 21.2 C10.6 21.5 11.0 21.7 11.4 21.8 C10.1 19.8 9.4 17.0 9.3 13.6 C9.0 14.4 8.4 14.0 8.0 12.6 Z"],
      ["woodDark", "M9.4 12.4 C10.1 11.9 11.0 11.8 12 12.1 C13.0 11.8 13.9 11.9 14.6 12.4 C13.9 13.4 13.0 13.7 12 13.4 C11.0 13.7 10.1 13.4 9.4 12.4 Z"],
      ["bronze", "M6.8 9.8 C6.8 5.4 9.1 2.8 12 2.8 C14.9 2.8 17.2 5.4 17.2 9.8 Z"],
      ["bronzeDark", "M12 2.8 C14.9 2.8 17.2 5.4 17.2 9.8 L12 9.8 Z"],
      ["goldLight", "M8.6 8.8 C8.7 6.5 9.5 4.8 10.8 4.0 C10.0 5.3 9.6 6.9 9.5 8.8 Z"],
      ["gold", "M6.2 8.9 L17.8 8.9 L17.8 10.5 L6.2 10.5 Z"],
      ["goldDeep", "M6.2 9.9 L17.8 9.9 L17.8 10.5 L6.2 10.5 Z"],
      ["goldLight", "M6.2 8.9 L17.8 8.9 L17.8 9.3 L6.2 9.3 Z"],
      ["bronze", "M6.2 10.5 L8.5 10.5 L8.5 14.6 C8.5 15.4 6.2 15.4 6.2 14.6 Z M17.8 10.5 L15.5 10.5 L15.5 14.6 C15.5 15.4 17.8 15.4 17.8 14.6 Z"],
      ["bronzeDark", "M17.8 10.5 L16.6 10.5 L16.6 14.6 C16.6 15.0 17.2 15.2 17.8 15.1 Z"],
      ["bronze", "M11.4 8.9 L12.6 8.9 L12.6 13.0 L11.4 13.0 Z"],
      ["goldDeep", "M11.4 8.9 L11.9 8.9 L11.9 13.0 L11.4 13.0 Z"],
    ],

    // Venus — no helmet and no beard, so the hair has to do all the work: piled
    // up, bound with a fillet, and falling past the shoulders.
    venus: [
      ["goldDeep", "M12 1.2 C16.6 1.2 19.0 4.4 19.0 9.6 C19.0 13.2 18.4 16.6 17.4 19.2 L14.6 18.2 C15.4 15.6 15.8 12.6 15.8 9.6 C15.8 6.6 14.6 5.2 12 5.2 C9.4 5.2 8.2 6.6 8.2 9.6 C8.2 12.6 8.6 15.6 9.4 18.2 L6.6 19.2 C5.6 16.6 5.0 13.2 5.0 9.6 C5.0 4.4 7.4 1.2 12 1.2 Z"],
      ["flesh", "M12 3 C14.48 3 16.24 5 16.24 8.12 C16.24 12.36 14.32 15.64 12 15.64 C9.68 15.64 7.76 12.36 7.76 8.12 C7.76 5 9.52 3 12 3 Z"],
      ["fleshShade", "M12 3 C14.48 3 16.24 5 16.24 8.12 C16.24 12.36 14.32 15.64 12 15.64 Z"],
      ["gold", "M7.2 6.4 C7.6 3.4 9.2 1.8 12 1.8 C14.8 1.8 16.4 3.4 16.8 6.4 C15.6 4.8 14.0 4.0 12 4.0 C10.0 4.0 8.4 4.8 7.2 6.4 Z"],
      ["goldLight", "M9.0 3.4 C10.0 2.6 11.0 2.2 12 2.1 L12 2.9 C11.1 3.0 10.2 3.4 9.4 4.1 Z"],
      ["gold", "M10.0 0.6 C12.6 -0.2 14.8 0.8 15.6 2.8 C13.8 1.6 11.8 1.4 10.0 2.2 Z M8.4 1.6 C9.2 0.6 10.2 0.2 11.4 0.4 C10.0 1.0 9.0 1.8 8.4 2.8 Z"],
      ["goldDeep", "M6.6 5.6 L17.4 5.6 L17.4 7.0 L6.6 7.0 Z"],
      ["gold", "M6.6 5.6 L17.4 5.6 L17.4 6.2 L6.6 6.2 Z"],
      ["fleshShade", "M8.72 7.86 C9.28 7.06 10.32 6.9 11.04 7.38 L10.8 8.02 C10.24 7.7 9.6 7.78 9.2 8.34 Z M15.28 7.86 C14.72 7.06 13.68 6.9 12.96 7.38 L13.2 8.02 C13.76 7.7 14.4 7.78 14.8 8.34 Z"],
      ["fleshLight", "M8.64 9.18 C9.28 8.3 10.72 8.3 11.36 9.18 C10.72 10.06 9.28 10.06 8.64 9.18 Z M12.64 9.18 C13.28 8.3 14.72 8.3 15.36 9.18 C14.72 10.06 13.28 10.06 12.64 9.18 Z"],
      ["laurelDark", "M9.32 9.18 A0.68 0.68 0 1 0 10.68 9.18 A0.68 0.68 0 1 0 9.32 9.18 Z M13.32 9.18 A0.68 0.68 0 1 0 14.68 9.18 A0.68 0.68 0 1 0 13.32 9.18 Z"],
      ["ink", "M9.68 9.18 A0.32 0.32 0 1 0 10.32 9.18 A0.32 0.32 0 1 0 9.68 9.18 Z M13.68 9.18 A0.32 0.32 0 1 0 14.32 9.18 A0.32 0.32 0 1 0 13.68 9.18 Z"],
      ["fleshShade", "M11.52 9.74 L12.48 9.74 L12.76 11.98 C12.76 12.46 11.24 12.46 11.24 11.98 Z"],
      ["blood", "M10.56 13.4 C11.12 12.92 12.88 12.92 13.44 13.4 C12.88 14.04 11.12 14.04 10.56 13.4 Z"],
      ["flesh", "M12 14.8 C13.4 14.8 13.9 16.2 13.9 17.8 C17.0 18.4 19.2 20.4 19.2 23.6 L4.8 23.6 C4.8 20.4 7.0 18.4 10.1 17.8 C10.1 16.2 10.6 14.8 12 14.8 Z"],
      ["goldDeep", "M6.6 19.2 C7.2 20.6 7.4 22.0 7.2 23.6 L4.8 23.6 C4.8 21.6 5.4 20.1 6.6 19.2 Z M17.4 19.2 C16.8 20.6 16.6 22.0 16.8 23.6 L19.2 23.6 C19.2 21.6 18.6 20.1 17.4 19.2 Z"],
      ["bone", "M10.1 17.8 C9.0 18.0 8.2 18.6 7.8 19.6 L9.6 23.6 L7.6 23.6 L7.0 20.2 C6.4 21.2 6.0 22.4 6.0 23.6 L18.0 23.6 C18.0 20.6 16.4 18.4 13.9 17.8 C13.9 19.8 10.1 19.8 10.1 17.8 Z"],
    ],

    // lupa — the she-wolf and the twins, which is the city's founding and the
    // one drawing here that has to be three animals at once. The wolf faces
    // left and the twins sit under the belly, because that grouping is the
    // whole image: a wolf on its own is a wolf.
    lupa: [
      ["hideDark", "M19.4 11.0 C21.6 11.6 22.8 14.0 22.4 17.2 L20.6 16.8 C20.9 14.6 20.2 13.0 18.8 12.4 Z"],
      ["hideDark", "M9.6 15.4 L11.0 15.4 L11.0 21.2 L9.6 21.2 Z M17.6 15.4 L19.0 15.4 L19.0 21.2 L17.6 21.2 Z"],
      ["hide", "M7.6 9.6 C11.4 8.6 16.2 8.8 19.0 10.2 C20.6 11.0 21.2 12.4 21.0 14.0 C20.8 15.8 19.6 16.8 18.0 17.0 L9.4 17.0 C7.8 16.8 7.0 15.4 7.0 13.4 C7.0 11.6 7.0 10.2 7.6 9.6 Z"],
      ["hideLight", "M7.6 9.6 C11.4 8.6 16.2 8.8 19.0 10.2 C19.6 10.5 20.0 10.9 20.3 11.4 C17.4 10.3 12.6 10.1 8.4 11.0 C7.9 10.4 7.6 10.0 7.6 9.6 Z"],
      ["hideDark", "M9.4 17.0 L18.0 17.0 C19.0 16.9 19.8 16.5 20.3 15.7 C19.4 16.1 18.2 16.3 16.8 16.3 L10.4 16.3 C9.5 16.3 8.9 16.0 8.4 15.4 C8.5 16.3 8.9 16.9 9.4 17.0 Z"],
      ["hide", "M11.6 16.4 L13.2 16.4 L13.2 21.2 L11.6 21.2 Z M15.6 16.4 L17.2 16.4 L17.2 21.2 L15.6 21.2 Z"],
      ["hide", "M4.6 7.6 L4.2 4.2 L6.8 6.2 Z M8.0 6.2 L8.8 3.4 L10.4 6.0 Z"],
      ["hideDark", "M8.8 3.4 L10.4 6.0 L9.4 6.0 L8.9 4.4 Z"],
      ["hide", "M2.2 11.4 C2.2 9.6 3.4 8.2 5.0 7.6 C5.4 6.2 6.8 5.4 8.4 5.6 C10.4 5.9 11.6 7.6 11.6 9.8 L11.6 12.8 L5.0 13.2 C3.2 13.2 2.2 12.6 2.2 11.4 Z"],
      ["hideLight", "M5.0 7.6 C5.4 6.2 6.8 5.4 8.4 5.6 C9.2 5.7 9.8 6.1 10.3 6.7 C9.0 6.3 7.6 6.5 6.4 7.4 Z"],
      ["hideDark", "M2.2 11.4 L5.6 10.4 L5.6 12.6 L3.4 13.0 C2.7 12.9 2.2 12.3 2.2 11.4 Z"],
      ["ink", "M1.6 11.0 A0.85 0.85 0 1 0 3.3 11.0 A0.85 0.85 0 1 0 1.6 11.0 Z"],
      ["ink", "M6.5 8.9 A0.55 0.55 0 1 0 7.6 8.9 A0.55 0.55 0 1 0 6.5 8.9 Z"],
      ["hideDark", "M4.2 12.4 C5.4 12.9 6.6 13.0 7.8 12.8 L7.8 13.3 C6.5 13.5 5.2 13.3 4.2 12.8 Z"],
      ["flesh", "M11.0 18.4 A1.45 1.45 0 1 0 13.9 18.4 A1.45 1.45 0 1 0 11.0 18.4 Z M14.6 18.4 A1.45 1.45 0 1 0 17.5 18.4 A1.45 1.45 0 1 0 14.6 18.4 Z"],
      ["fleshShade", "M12.9 17.3 C13.6 17.8 13.9 18.6 13.7 19.4 C13.4 18.6 13.2 17.9 12.9 17.3 Z M16.5 17.3 C17.2 17.8 17.5 18.6 17.3 19.4 C17.0 18.6 16.8 17.9 16.5 17.3 Z"],
      ["flesh", "M11.4 19.6 C12.0 19.2 12.9 19.2 13.5 19.6 L14.0 21.4 L10.9 21.4 Z M15.0 19.6 C15.6 19.2 16.5 19.2 17.1 19.6 L17.6 21.4 L14.5 21.4 Z"],
      ["ink", "M11.7 18.1 A0.3 0.3 0 1 0 12.3 18.1 A0.3 0.3 0 1 0 11.7 18.1 Z M12.9 18.1 A0.3 0.3 0 1 0 13.5 18.1 A0.3 0.3 0 1 0 12.9 18.1 Z M15.3 18.1 A0.3 0.3 0 1 0 15.9 18.1 A0.3 0.3 0 1 0 15.3 18.1 Z M16.5 18.1 A0.3 0.3 0 1 0 17.1 18.1 A0.3 0.3 0 1 0 16.5 18.1 Z"],
      ["woodDark", "M0.8 21.2 L23.2 21.2 L23.2 22.4 L0.8 22.4 Z"],
      ["wood", "M0.8 21.2 L23.2 21.2 L23.2 21.7 L0.8 21.7 Z"],
    ],

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

    // Victoria — the wings are the shape; the figure inside them only has to be
    // a figure. She holds the wreath out rather than overhead, because a ring
    // above the head at 17px sits in the wings and disappears into them.
    victoria: [
      ["gold", "M11.0 10.2 C8.4 8.6 5.6 5.4 3.4 1.2 C3.2 5.6 4.0 9.4 5.6 12.4 C7.2 11.2 9.0 10.4 11.0 10.2 Z M13.0 10.2 C15.6 8.6 18.4 5.4 20.6 1.2 C20.8 5.6 20.0 9.4 18.4 12.4 C16.8 11.2 15.0 10.4 13.0 10.2 Z"],
      ["goldDeep", "M4.6 4.6 C6.0 7.2 7.6 9.2 9.4 10.6 L8.8 11.4 C6.9 10.0 5.3 7.9 4.1 5.2 Z M19.4 4.6 C18.0 7.2 16.4 9.2 14.6 10.6 L15.2 11.4 C17.1 10.0 18.7 7.9 19.9 5.2 Z M5.4 8.2 C6.5 10.0 7.7 11.4 9.0 12.4 L8.6 13.1 C7.2 12.2 6.0 10.8 5.0 9.0 Z M18.6 8.2 C17.5 10.0 16.3 11.4 15.0 12.4 L15.4 13.1 C16.8 12.2 18.0 10.8 19.0 9.0 Z"],
      ["gold", "M12 3.4 A1.75 1.75 0 1 0 15.5 3.4 A1.75 1.75 0 1 0 12 3.4 Z"],
      ["goldDeep", "M13.75 1.65 C14.72 1.65 15.5 2.43 15.5 3.4 C15.5 4.37 14.72 5.15 13.75 5.15 Z"],
      ["goldLight", "M12.9 2.4 A0.6 0.6 0 1 0 14.1 2.4 A0.6 0.6 0 1 0 12.9 2.4 Z"],
      ["gold", "M12.4 6.6 C14.4 6.6 15.4 8.0 15.6 10.2 L16.6 18.0 C16.9 20.4 16.0 21.8 14.0 22.4 L11.0 22.4 C9.4 21.8 8.8 20.4 9.2 18.0 L10.4 10.2 C10.7 8.0 11.4 6.6 12.4 6.6 Z"],
      ["goldLight", "M12.4 6.6 C11.4 6.6 10.7 8.0 10.4 10.2 L9.2 18.0 C8.9 20.0 9.3 21.4 10.4 22.1 C10.2 20.2 10.4 18.0 10.9 15.4 C11.5 12.2 11.9 9.2 12.0 6.6 Z"],
      ["goldDeep", "M14.4 7.6 C15.2 8.4 15.5 9.6 15.6 10.2 L16.6 18.0 C16.9 20.4 16.0 21.8 14.0 22.4 L13.2 22.4 C14.6 21.4 15.2 19.8 15.0 17.6 C14.8 14.6 14.6 11.2 14.4 7.6 Z"],
      ["goldDeep", "M9.6 20.8 C11.6 21.8 14.2 21.8 16.2 20.8 L16.4 22.4 C14.2 23.4 11.6 23.4 9.4 22.4 Z"],
      ["gold", "M11.6 8.6 L11.0 8.2 C9.2 7.0 7.6 6.6 6.2 7.0 L6.6 8.8 C7.6 8.5 8.8 8.8 10.2 9.8 Z"],
      ["gold", "M2.6 8.8 A3.0 3.0 0 1 0 8.6 8.8 A3.0 3.0 0 1 0 2.6 8.8 Z M4.2 8.8 A1.4 1.4 0 1 0 7.0 8.8 A1.4 1.4 0 1 0 4.2 8.8 Z"],
      ["goldLight", "M2.6 8.8 A3.0 3.0 0 1 0 8.6 8.8 A3.0 3.0 0 1 0 2.6 8.8 Z M3.2 8.8 A2.4 2.4 0 1 0 8.0 8.8 A2.4 2.4 0 1 0 3.2 8.8 Z"],
      ["laurel", "M4.4 6.2 C3.6 5.6 3.4 4.6 4.0 3.8 C4.9 4.4 5.1 5.4 4.4 6.2 Z M6.8 5.6 C6.4 4.6 6.9 3.6 8.0 3.4 C8.3 4.5 7.8 5.4 6.8 5.6 Z"],
    ],

    // Pax — the same bust as Venus would be, but the branch is the point, so it
    // is drawn green and held clear of the drapery. Green is the only colour on
    // her, which is what stops the two of them reading as one woman twice.
    pax: [
      ["flesh", "M11.0 15.4 C12.3 15.4 12.8 16.6 12.8 18.0 C15.9 18.6 18.0 20.6 18.0 23.6 L4.0 23.6 C4.0 20.6 6.1 18.6 9.2 18.0 C9.2 16.6 9.7 15.4 11.0 15.4 Z"],
      ["gold", "M9.2 18.0 C6.1 18.6 4.0 20.6 4.0 23.6 L18.0 23.6 C18.0 20.6 15.9 18.6 12.8 18.0 C12.8 19.9 9.2 19.9 9.2 18.0 Z"],
      ["goldDeep", "M12.8 18.0 C15.9 18.6 18.0 20.6 18.0 23.6 L14.8 23.6 C14.8 20.8 14.1 18.9 12.8 18.6 Z"],
      ["goldDeep", "M11.0 2.2 C15.2 2.2 17.4 5.2 17.4 10.0 C17.4 12.6 17.0 15.2 16.2 17.4 L13.8 16.6 C14.4 14.6 14.8 12.4 14.8 10.0 C14.8 7.2 13.6 6.0 11.0 6.0 C8.4 6.0 7.2 7.2 7.2 10.0 C7.2 12.4 7.6 14.6 8.2 16.6 L5.8 17.4 C5.0 15.2 4.6 12.6 4.6 10.0 C4.6 5.2 6.8 2.2 11.0 2.2 Z"],
      ["flesh", "M11 5.5 C13.33 5.5 14.98 7.38 14.98 10.3 C14.98 14.28 13.18 17.35 11 17.35 C8.82 17.35 7.03 14.28 7.03 10.3 C7.03 7.38 8.68 5.5 11 5.5 Z"],
      ["fleshShade", "M11 5.5 C13.33 5.5 14.98 7.38 14.98 10.3 C14.98 14.28 13.18 17.35 11 17.35 Z"],
      ["gold", "M6.6 8.0 C6.8 5.0 8.2 3.4 11.0 3.4 C13.8 3.4 15.2 5.0 15.4 8.0 C14.2 6.2 12.8 5.4 11.0 5.4 C9.2 5.4 7.8 6.2 6.6 8.0 Z"],
      ["goldLight", "M8.2 4.8 C9.0 4.1 9.9 3.7 11.0 3.6 L11.0 4.4 C10.1 4.5 9.3 4.9 8.6 5.5 Z"],
      ["fleshShade", "M7.93 9.4 C8.45 8.65 9.43 8.5 10.1 8.95 L9.88 9.55 C9.35 9.25 8.75 9.33 8.38 9.85 Z M14.08 9.4 C13.55 8.65 12.58 8.5 11.9 8.95 L12.13 9.55 C12.65 9.25 13.25 9.33 13.63 9.85 Z"],
      ["fleshLight", "M7.85 10.83 C8.45 10 9.8 10 10.4 10.83 C9.8 11.65 8.45 11.65 7.85 10.83 Z M11.6 10.83 C12.2 10 13.55 10 14.15 10.83 C13.55 11.65 12.2 11.65 11.6 10.83 Z"],
      ["laurelDark", "M8.49 10.83 A0.64 0.64 0 1 0 9.76 10.83 A0.64 0.64 0 1 0 8.49 10.83 Z M12.24 10.83 A0.64 0.64 0 1 0 13.51 10.83 A0.64 0.64 0 1 0 12.24 10.83 Z"],
      ["ink", "M8.82 10.83 A0.3 0.3 0 1 0 9.43 10.83 A0.3 0.3 0 1 0 8.82 10.83 Z M12.58 10.83 A0.3 0.3 0 1 0 13.18 10.83 A0.3 0.3 0 1 0 12.58 10.83 Z"],
      ["fleshShade", "M10.55 11.35 L11.45 11.35 L11.71 13.45 C11.71 13.9 10.29 13.9 10.29 13.45 Z"],
      ["blood", "M9.65 14.88 C10.18 14.43 11.83 14.43 12.35 14.88 C11.83 15.48 10.18 15.48 9.65 14.88 Z"],
      ["laurelDark", "M17.0 22.6 C17.8 18.0 19.4 12.6 21.8 6.4 L23.0 6.8 C20.6 13.0 19.0 18.4 18.2 22.8 Z"],
      ["laurel", "M17.8 19.2 C16.4 18.0 15.8 16.2 16.2 14.2 C17.8 15.2 18.4 17.0 17.8 19.2 Z M19.0 15.6 C17.6 14.4 17.0 12.6 17.4 10.6 C19.0 11.6 19.6 13.4 19.0 15.6 Z M20.2 12.2 C18.8 11.0 18.2 9.2 18.6 7.2 C20.2 8.2 20.8 10.0 20.2 12.2 Z M19.6 17.6 C20.2 15.6 21.8 14.4 23.4 14.8 C22.8 16.8 21.2 17.9 19.6 17.6 Z M20.8 13.4 C21.4 11.4 23.0 10.2 24.0 10.4 C23.4 12.4 22.4 13.7 20.8 13.4 Z"],
      ["laurelDark", "M16.2 14.2 C16.8 15.8 17.4 17.4 17.8 19.2 C16.8 17.8 16.2 16.1 16.2 14.2 Z M17.4 10.6 C18.0 12.2 18.6 13.8 19.0 15.6 C18.0 14.2 17.4 12.5 17.4 10.6 Z M18.6 7.2 C19.2 8.8 19.8 10.4 20.2 12.2 C19.2 10.8 18.6 9.1 18.6 7.2 Z"],
      ["ink", "M18.4 20.6 A1.1 1.1 0 1 0 20.6 20.6 A1.1 1.1 0 1 0 18.4 20.6 Z"],
    ],

    // aegis — the goatskin with the Gorgon's head on it, which Minerva wears
    // and the emperors are shown carrying. Drawn as the shield it became.
    aegis: [
      ["goldDeep", "M12 1.4 C15.9 1.4 19.6 2.3 21.6 3.3 L21.6 12.4 C21.6 17.5 17.7 21.4 12 22.8 C6.3 21.4 2.4 17.5 2.4 12.4 L2.4 3.3 C4.4 2.3 8.1 1.4 12 1.4 Z"],
      ["gold", "M12 2.6 C15.4 2.6 18.6 3.4 20.4 4.2 L20.4 12.4 C20.4 16.8 17.0 20.2 12 21.5 C7.0 20.2 3.6 16.8 3.6 12.4 L3.6 4.2 C5.4 3.4 8.6 2.6 12 2.6 Z"],
      ["goldLight", "M12 2.6 C9.6 2.6 7.2 3.0 5.4 3.6 L5.4 12.4 C5.4 15.2 6.6 17.6 8.8 19.4 C5.6 18.0 3.6 15.4 3.6 12.4 L3.6 4.2 C5.4 3.4 8.6 2.6 12 2.6 Z"],
      ["goldDeep", "M12 2.6 C15.4 2.6 18.6 3.4 20.4 4.2 L20.4 12.4 C20.4 16.8 17.0 20.2 12 21.5 L12 20.2 C16.0 18.9 18.8 16.1 18.8 12.4 L18.8 5.0 C17.2 4.3 14.8 3.8 12 3.8 Z"],
      ["laurel", "M8.4 8.0 C6.8 6.6 6.6 4.6 8.0 3.8 C8.8 5.0 8.8 6.6 8.4 8.0 Z M15.6 8.0 C17.2 6.6 17.4 4.6 16.0 3.8 C15.2 5.0 15.2 6.6 15.6 8.0 Z M7.2 12.0 C5.4 11.4 4.6 9.6 5.6 8.4 C6.8 9.2 7.4 10.6 7.2 12.0 Z M16.8 12.0 C18.6 11.4 19.4 9.6 18.4 8.4 C17.2 9.2 16.6 10.6 16.8 12.0 Z M10.6 6.8 C9.8 5.2 10.4 3.6 12 3.4 C12.4 4.9 11.8 6.2 10.6 6.8 Z M13.4 6.8 C14.2 5.2 13.6 3.6 12 3.4 C11.6 4.9 12.2 6.2 13.4 6.8 Z M8.0 15.6 C6.4 15.6 5.2 14.2 5.8 12.8 C7.0 13.3 7.9 14.4 8.0 15.6 Z M16.0 15.6 C17.6 15.6 18.8 14.2 18.2 12.8 C17.0 13.3 16.1 14.4 16.0 15.6 Z"],
      ["laurelDark", "M8.0 3.8 C8.4 5.2 8.5 6.6 8.4 8.0 C7.8 6.7 7.6 5.3 8.0 3.8 Z M16.0 3.8 C15.6 5.2 15.5 6.6 15.6 8.0 C16.2 6.7 16.4 5.3 16.0 3.8 Z M5.6 8.4 C6.3 9.5 6.8 10.7 7.2 12.0 C6.2 11.1 5.6 9.8 5.6 8.4 Z M18.4 8.4 C17.7 9.5 17.2 10.7 16.8 12.0 C17.8 11.1 18.4 9.8 18.4 8.4 Z"],
      ["flesh", "M12 8.25 C13.4 8.25 14.39 9.38 14.39 11.13 C14.39 13.52 13.31 15.36 12 15.36 C10.7 15.36 9.62 13.52 9.62 11.13 C9.62 9.38 10.61 8.25 12 8.25 Z"],
      ["fleshShade", "M12 8.25 C13.4 8.25 14.39 9.38 14.39 11.13 C14.39 13.52 13.31 15.36 12 15.36 Z"],
      ["fleshShade", "M10.15 10.59 C10.47 10.14 11.06 10.05 11.46 10.32 L11.33 10.68 C11.01 10.5 10.65 10.55 10.43 10.86 Z M13.85 10.59 C13.53 10.14 12.95 10.05 12.54 10.32 L12.68 10.68 C12.99 10.5 13.35 10.55 13.58 10.86 Z"],
      ["fleshLight", "M10.11 11.45 C10.47 10.95 11.28 10.95 11.64 11.45 C11.28 11.94 10.47 11.94 10.11 11.45 Z M12.36 11.45 C12.72 10.95 13.53 10.95 13.89 11.45 C13.53 11.94 12.72 11.94 12.36 11.45 Z"],
      ["ink", "M10.49 11.45 A0.38 0.38 0 1 0 11.26 11.45 A0.38 0.38 0 1 0 10.49 11.45 Z M12.74 11.45 A0.38 0.38 0 1 0 13.51 11.45 A0.38 0.38 0 1 0 12.74 11.45 Z"],
      ["fleshShade", "M11.73 11.76 L12.27 11.76 L12.43 13.02 C12.43 13.29 11.57 13.29 11.57 13.02 Z"],
      ["ink", "M10.7 14.0 C11.2 13.6 12.8 13.6 13.3 14.0 C12.8 14.7 11.2 14.7 10.7 14.0 Z"],
      ["goldLight", "M11.1 14.1 L12.9 14.1 L12.8 14.5 L11.2 14.5 Z"],
      ["gold", "M9.8 7.2 C10.4 6.6 11.2 6.3 12 6.3 C12.8 6.3 13.6 6.6 14.2 7.2 L13.8 8.0 C13.2 7.6 12.6 7.4 12 7.4 C11.4 7.4 10.8 7.6 10.2 8.0 Z"],
    ],

    // persona comica / persona tragica — the masks. The Roman theatre took them
    // from the Greek one, so these are the same two faces the Greek pack draws;
    // what is different is the material they are painted in here.
    personaComica: [
      ["gold", "M4.6 8.4 C4.6 3.0 7.8 0.6 12 0.6 C16.2 0.6 19.4 3.0 19.4 8.4 L19.4 13.6 L17.0 13.6 L17.0 6.4 L7.0 6.4 L7.0 13.6 L4.6 13.6 Z"],
      ["goldDeep", "M12 0.6 C16.2 0.6 19.4 3.0 19.4 8.4 L19.4 13.6 L17.0 13.6 L17.0 6.4 L12 6.4 Z"],
      ["goldLight", "M8.0 2.2 C9.0 1.4 10.4 1.0 12 1.0 L12 2.0 C10.8 2.0 9.7 2.4 8.8 3.0 Z"],
      ["bone", "M6.2 5.6 L17.8 5.6 L17.8 12.8 C17.8 18.4 15.2 22.0 12 22.0 C8.8 22.0 6.2 18.4 6.2 12.8 Z"],
      ["stoneShade", "M12 5.6 L17.8 5.6 L17.8 12.8 C17.8 18.4 15.2 22.0 12 22.0 Z"],
      ["bone", "M6.2 10.4 C5.0 10.0 4.0 10.8 4.2 12.0 C4.4 13.2 5.4 13.8 6.5 13.4 Z M17.8 10.4 C19.0 10.0 20.0 10.8 19.8 12.0 C19.6 13.2 18.6 13.8 17.5 13.4 Z"],
      ["goldDeep", "M5.4 4.4 C8.0 6.0 9.8 6.6 12 6.6 C14.2 6.6 16.0 6.0 18.6 4.4 L18.6 6.6 C16.0 8.0 14.2 8.4 12 8.4 C9.8 8.4 8.0 8.0 5.4 6.6 Z"],
      ["gold", "M6.8 4.9 C7.8 5.6 8.8 6.1 9.6 6.4 L9.2 7.4 C8.2 7.1 7.4 6.6 6.6 5.9 Z M17.2 4.9 C16.2 5.6 15.2 6.1 14.4 6.4 L14.8 7.4 C15.8 7.1 16.6 6.6 17.4 5.9 Z"],
      ["woodDark", "M7.6 9.4 C8.6 8.2 10.2 8.2 11.1 9.2 L10.5 9.9 C9.8 9.3 8.8 9.4 8.1 10.1 Z M16.4 9.4 C15.4 8.2 13.8 8.2 12.9 9.2 L13.5 9.9 C14.2 9.3 15.2 9.4 15.9 10.1 Z"],
      ["ink", "M7.9 11.6 C8.7 10.4 10.5 10.4 11.3 11.6 C10.5 12.8 8.7 12.8 7.9 11.6 Z M12.7 11.6 C13.5 10.4 15.3 10.4 16.1 11.6 C15.3 12.8 13.5 12.8 12.7 11.6 Z"],
      ["stoneShade", "M11.3 12.2 L12.7 12.2 L13.05 15.0 C13.05 15.6 10.95 15.6 10.95 15.0 Z"],
      ["ink", "M7.4 16.2 L16.6 16.2 C15.8 19.6 14.0 21.4 12 21.4 C10.0 21.4 8.2 19.6 7.4 16.2 Z"],
      ["bone", "M8.8 16.2 L15.2 16.2 C14.9 17.2 14.4 17.7 13.7 17.7 L10.3 17.7 C9.6 17.7 9.1 17.2 8.8 16.2 Z"],
      ["blood", "M10.4 19.6 C11.0 19.2 13.0 19.2 13.6 19.6 C13.0 20.4 11.0 20.4 10.4 19.6 Z"],
    ],

    personaTragica: [
      ["woodDark", "M4.6 9.0 C4.6 3.4 7.8 0.8 12 0.8 C16.2 0.8 19.4 3.4 19.4 9.0 L19.4 14.2 L17.0 14.2 L17.0 6.6 L7.0 6.6 L7.0 14.2 L4.6 14.2 Z"],
      ["wood", "M7.0 7.4 C8.0 9.0 8.4 10.8 8.3 12.8 L7.0 12.8 Z M17.0 7.4 C16.0 9.0 15.6 10.8 15.7 12.8 L17.0 12.8 Z"],
      ["papyrus", "M6.2 5.8 L17.8 5.8 L17.8 13.0 C17.8 18.6 15.2 22.2 12 22.2 C8.8 22.2 6.2 18.6 6.2 13.0 Z"],
      ["stoneShade", "M12 5.8 L17.8 5.8 L17.8 13.0 C17.8 18.6 15.2 22.2 12 22.2 Z"],
      ["papyrus", "M6.2 10.6 C5.0 10.2 4.0 11.0 4.2 12.2 C4.4 13.4 5.4 14.0 6.5 13.6 Z M17.8 10.6 C19.0 10.2 20.0 11.0 19.8 12.2 C19.6 13.4 18.6 14.0 17.5 13.6 Z"],
      ["woodDark", "M5.2 4.2 C8.0 6.0 9.6 6.6 12 6.6 C14.4 6.6 16.0 6.0 18.8 4.2 L18.8 6.8 C16.0 8.2 14.4 8.6 12 8.6 C9.6 8.6 8.0 8.2 5.2 6.8 Z"],
      ["ink", "M7.4 8.6 C8.4 9.8 10.0 10.0 11.0 9.2 L10.6 10.2 C9.6 10.8 8.2 10.6 7.4 9.6 Z M16.6 8.6 C15.6 9.8 14.0 10.0 13.0 9.2 L13.4 10.2 C14.4 10.8 15.8 10.6 16.6 9.6 Z"],
      ["ink", "M7.9 11.8 C8.7 10.6 10.5 10.6 11.3 11.8 C10.5 13.0 8.7 13.0 7.9 11.8 Z M12.7 11.8 C13.5 10.6 15.3 10.6 16.1 11.8 C15.3 13.0 13.5 13.0 12.7 11.8 Z"],
      ["stoneShade", "M11.3 12.4 L12.7 12.4 L13.05 15.2 C13.05 15.8 10.95 15.8 10.95 15.2 Z"],
      ["ink", "M8.0 20.6 C8.4 17.6 10.0 16.0 12 16.0 C14.0 16.0 15.6 17.6 16.0 20.6 C15.0 18.6 13.6 17.6 12 17.6 C10.4 17.6 9.0 18.6 8.0 20.6 Z"],
      ["blood", "M9.6 19.0 C10.2 18.5 13.8 18.5 14.4 19.0 C13.8 19.5 10.2 19.5 9.6 19.0 Z"],
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

    // as — the bronze coin, which carried a ship's prow where the denarius
    // carries a head. Bronze and not silver, so the two never read alike.
    as: [
      ["bronze", "M1.2 12 A10.8 10.8 0 1 0 22.8 12 A10.8 10.8 0 1 0 1.2 12 Z"],
      ["goldDeep", "M1.2 12 A10.8 10.8 0 1 0 22.8 12 A10.8 10.8 0 1 0 1.2 12 Z M2.2 12 A9.8 9.8 0 1 0 21.8 12 A9.8 9.8 0 1 0 2.2 12 Z"],
      ["bronzeDark", "M2.5 12 A9.5 9.5 0 1 0 21.5 12 A9.5 9.5 0 1 0 2.5 12 Z M3.4 12 A8.6 8.6 0 1 0 20.6 12 A8.6 8.6 0 1 0 3.4 12 Z"],
      ["bronzeDark", "M11.4 2.4 A0.6 0.6 0 1 0 12.6 2.4 A0.6 0.6 0 1 0 11.4 2.4 Z M15.6 3.3 A0.6 0.6 0 1 0 16.8 3.3 A0.6 0.6 0 1 0 15.6 3.3 Z M18.7 6.1 A0.6 0.6 0 1 0 19.9 6.1 A0.6 0.6 0 1 0 18.7 6.1 Z M20.1 10.1 A0.6 0.6 0 1 0 21.3 10.1 A0.6 0.6 0 1 0 20.1 10.1 Z M19.6 14.2 A0.6 0.6 0 1 0 20.8 14.2 A0.6 0.6 0 1 0 19.6 14.2 Z M17.3 17.7 A0.6 0.6 0 1 0 18.5 17.7 A0.6 0.6 0 1 0 17.3 17.7 Z M13.8 20.1 A0.6 0.6 0 1 0 15.0 20.1 A0.6 0.6 0 1 0 13.8 20.1 Z M9.5 20.5 A0.6 0.6 0 1 0 10.7 20.5 A0.6 0.6 0 1 0 9.5 20.5 Z M5.7 18.6 A0.6 0.6 0 1 0 6.9 18.6 A0.6 0.6 0 1 0 5.7 18.6 Z M3.2 15.1 A0.6 0.6 0 1 0 4.4 15.1 A0.6 0.6 0 1 0 3.2 15.1 Z M2.9 10.8 A0.6 0.6 0 1 0 4.1 10.8 A0.6 0.6 0 1 0 2.9 10.8 Z M4.7 6.8 A0.6 0.6 0 1 0 5.9 6.8 A0.6 0.6 0 1 0 4.7 6.8 Z M7.9 3.7 A0.6 0.6 0 1 0 9.1 3.7 A0.6 0.6 0 1 0 7.9 3.7 Z"],
      ["bronzeDark", "M4.4 13.4 C7.6 14.6 12.4 15.2 17.4 14.8 L18.8 17.4 C13.0 18.4 7.6 17.6 4.2 15.6 Z"],
      ["goldDeep", "M4.4 13.4 C7.6 14.6 12.4 15.2 17.4 14.8 L17.7 15.4 C12.6 15.8 7.8 15.2 4.5 13.9 Z"],
      ["bronzeDark", "M17.0 14.4 C17.4 11.2 18.0 8.8 19.2 6.6 C19.8 5.4 19.2 4.6 18.4 5.0 C17.8 5.3 17.7 6.0 18.2 6.3 L17.7 7.3 C16.4 6.8 16.3 5.0 17.7 4.2 C19.1 3.4 20.9 4.3 20.5 6.2 C20.2 7.9 19.2 10.4 18.9 14.5 Z"],
      ["bronzeDark", "M4.2 15.6 L3.0 13.6 L5.4 13.5 Z"],
      ["goldDeep", "M6.4 11.8 A1.1 1.1 0 1 0 8.6 11.8 A1.1 1.1 0 1 0 6.4 11.8 Z"],
      ["bronzeDark", "M7.0 11.8 A0.5 0.5 0 1 0 8.0 11.8 A0.5 0.5 0 1 0 7.0 11.8 Z"],
    ],

    // prora — the warship's bow: the ram at the waterline, the painted eye
    // above it, and the stem curling back over the deck.
    prora: [
      ["wood", "M2.4 14.4 C7.0 16.2 13.2 16.8 19.2 16.0 L21.0 20.0 C13.4 21.4 6.0 20.2 1.6 17.4 Z"],
      ["woodLight", "M2.4 14.4 C7.0 16.2 13.2 16.8 19.2 16.0 L19.5 16.7 C13.4 17.5 7.0 16.9 2.3 15.1 Z"],
      ["woodDark", "M1.6 17.4 C6.0 20.2 13.4 21.4 21.0 20.0 L20.6 21.4 C13.0 22.6 5.6 21.4 1.2 18.6 Z"],
      ["bronze", "M1.6 17.4 L0.4 14.6 L3.6 14.9 Z"],
      ["bronzeDark", "M0.4 14.6 L3.6 14.9 L2.6 15.9 Z"],
      ["wood", "M19.2 16.0 C19.8 11.4 20.6 8.0 22.0 5.2 C22.8 3.6 21.8 2.2 20.4 2.6 C19.2 3.0 18.9 4.4 19.9 4.9 L19.2 6.4 C16.9 5.6 16.9 2.6 19.4 1.6 C21.8 0.6 24.2 2.4 23.4 5.2 C22.6 7.8 21.4 11.0 21.0 16.4 Z"],
      ["woodLight", "M19.9 4.9 C19.2 4.5 19.2 3.8 19.8 3.4 C19.2 4.2 19.6 4.7 20.2 4.8 Z M22.6 4.4 C22.0 6.6 21.0 9.4 20.6 13.0 L20.0 12.9 C20.4 9.4 21.4 6.4 22.0 4.4 Z"],
      ["bone", "M5.4 16.2 A2.0 1.5 0 1 0 9.4 16.2 A2.0 1.5 0 1 0 5.4 16.2 Z"],
      ["ink", "M6.5 16.2 A0.9 0.9 0 1 0 8.3 16.2 A0.9 0.9 0 1 0 6.5 16.2 Z"],
      ["blood", "M11.0 15.4 L13.0 15.4 L13.0 17.0 L11.0 17.0 Z M14.4 15.2 L16.4 15.2 L16.4 16.8 L14.4 16.8 Z"],
    ],

    // signum SPQR — the eagle over the lettered plaque. The letters are four
    // gold marks and not letters: at 17px anything finer is grey mush, and the
    // red board under a gold eagle is what the thing is recognised by anyway.
    signumSPQR: [
      ["gold", "M10.6 6.0 C8.6 5.2 6.4 3.6 4.6 1.2 C5.0 3.8 5.8 6.0 7.2 7.6 C8.2 6.8 9.4 6.3 10.6 6.0 Z M13.4 6.0 C15.4 5.2 17.6 3.6 19.4 1.2 C19.0 3.8 18.2 6.0 16.8 7.6 C15.8 6.8 14.6 6.3 13.4 6.0 Z"],
      ["goldDeep", "M5.6 3.0 C6.8 4.6 8.0 5.8 9.3 6.5 L8.9 7.2 C7.5 6.4 6.3 5.1 5.3 3.5 Z M18.4 3.0 C17.2 4.6 16.0 5.8 14.7 6.5 L15.1 7.2 C16.5 6.4 17.7 5.1 18.7 3.5 Z"],
      ["gold", "M12 1.8 C13.2 1.8 13.9 2.7 13.9 4.1 L13.9 8.6 L10.1 8.6 L10.1 4.1 C10.1 2.7 10.8 1.8 12 1.8 Z"],
      ["goldDeep", "M12 1.8 C13.2 1.8 13.9 2.7 13.9 4.1 L13.9 8.6 L12 8.6 Z"],
      ["gold", "M10.8 1.4 A1.25 1.25 0 1 0 13.3 1.4 A1.25 1.25 0 1 0 10.8 1.4 Z"],
      ["goldDeep", "M13.1 0.9 L14.8 1.6 L13.1 2.3 Z"],
      ["ink", "M12.4 1.1 A0.33 0.33 0 1 0 13.06 1.1 A0.33 0.33 0 1 0 12.4 1.1 Z"],
      ["goldDeep", "M10.2 8.4 L13.8 8.4 L13.3 11.0 L10.7 11.0 Z"],
      ["gold", "M11.1 8.6 L11.6 8.6 L11.5 10.8 L11.0 10.8 Z M12.4 8.6 L12.9 8.6 L13.0 10.8 L12.5 10.8 Z"],
      ["goldDeep", "M5.8 11.0 L18.2 11.0 L18.2 12.8 L5.8 12.8 Z"],
      ["goldLight", "M5.8 11.0 L18.2 11.0 L18.2 11.6 L5.8 11.6 Z"],
      ["goldDeep", "M5.2 13.0 L18.8 13.0 L18.8 21.4 L5.2 21.4 Z"],
      ["blood", "M6.2 13.9 L17.8 13.9 L17.8 20.5 L6.2 20.5 Z"],
      ["bloodDark", "M12 13.9 L17.8 13.9 L17.8 20.5 L12 20.5 Z"],
      ["gold", "M7.6 15.8 L9.2 15.8 L9.2 18.6 L7.6 18.6 Z M10.2 15.8 L11.8 15.8 L11.8 18.6 L10.2 18.6 Z M12.6 15.8 L14.2 15.8 L14.2 18.6 L12.6 18.6 Z M15.2 15.8 L16.8 15.8 L16.8 18.6 L15.2 18.6 Z"],
      ["woodDark", "M11.1 21.4 L12.9 21.4 L12.9 23.6 L11.1 23.6 Z"],
      ["woodLight", "M11.1 21.4 L11.7 21.4 L11.7 23.6 L11.1 23.6 Z"],
    ],

    // ---- first pass -------------------------------------------------
    // The drawings these replaced, kept beside them rather than instead of
    // them so the two can be compared and the better one chosen.

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
    ["spatha"], ["scutumAlatum"], ["spatha", "parma"],
    ["pugio"], ["pugioVagina"], ["pugio", "pugioVagina"],
    ["vexillum"], ["signum"], ["aquila"], ["aquila", "vexillum"],
    ["aquilaCoronata"], ["corona"], ["coronaMuralis"],
    ["rota"], ["rotaFerrata"], ["currus"], ["currus", "rota"],
    ["galea"], ["galeaPlumata"], ["cassis"], ["cassisClathrata"],
    ["cassisClathrata", "gladius"], ["cassis", "gladius"],
    ["volumen"], ["volumenApertum"], ["tabula"], ["tabulaDuplex"],
    ["stilus"], ["tabula", "stilus"], ["calamus"], ["calamus", "volumen"],
    ["fasces"], ["fascesCorona"], ["securis"],
    ["denarius"], ["aureus"], ["denarius", "aureus"],
    ["fuscina"], ["rete"], ["fuscina", "rete"], ["reteOnus"],
    ["fuscina", "reteOnus"],
    ["pilum"], ["hasta"], ["arcus"], ["funda"], ["parma"],
    ["lucerna"], ["bulla"], ["cornu"],
    ["denarius2"],
    ["gladius3"],
    ["scutum3"],
    ["gladius3", "scutum3"],
    ["galea3"],
    ["aquila3"],
    ["rota3"],
    ["corona3"],
    ["denarius3"],
    ["templum"], ["aquaeductus"], ["fornix"], ["amphitheatrum"],
    ["templum", "fornix"], ["aquaeductus", "amphitheatrum"],
    ["iuppiter"], ["minerva"], ["mars"], ["venus"],
    ["iuppiter", "minerva"], ["mars", "venus"],
    ["aegis"], ["minerva", "aegis"],
    ["lupa"], ["equus"], ["equus", "currus"],
    ["victoria"], ["victoria", "fornix"], ["victoria", "corona3"],
    ["pax"], ["pax", "corona3"],
    ["personaComica"], ["personaTragica"], ["personaComica", "personaTragica"],
    ["urna"], ["tuba"], ["carnyx"], ["tuba", "carnyx"],
    ["as"], ["as", "denarius3"],
    ["prora"], ["prora", "as"],
    ["signumSPQR"], ["signumSPQR", "vexillum"],
  ],
};
