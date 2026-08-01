/**
 * What this pack throws when the confetti fires.
 *
 * Eighteen shapes: the pottery, the hoplite's kit, the theatre, the temple and
 * the owl off the coins. Four groups are thrown as pairs, because some things
 * are a kit and a burst holding both reads as one idea rather than two — the
 * helmet with the shield, the shield with the spear, the two masks, and the
 * amphora beside the crown, which is what a winner at the Panathenaia carried
 * home. The rest are thrown alone.
 *
 * A shape is a stack of layers, `[paint, path]`, painted back to front, each a
 * path in a 24x24 box. Every layer is filled `evenodd`, so a subpath nested
 * inside another *within one layer* is a hole — that is how the shield's rim
 * and the kylix's foot are cut. Across layers there is no such rule: a later
 * layer simply covers the one beneath, which is where the colour comes from.
 * Draw the terracotta body, then the black figures on it.
 *
 * That is the whole reason the format changed. A piece used to be one flat
 * colour, so a trireme's oars were the same gold as its hull and an olive had
 * neither green leaves nor black fruit.
 *
 * Paints are named, and resolved through `palette` below, so the pack's colours
 * are tuned in one place. `languages/ancient-greek/pack.test.ts` fails on a
 * name that is not there.
 *
 * Draw them at 40px, then look at them at 17px, which is the size they are
 * thrown at; anything that needs its fine detail to be recognized will not
 * survive. The playground in Settings shows both at once.
 *
 * Sits beside icon.mjs for the same reason that does: the look of a language is
 * the pack's business, and `packages/core` must not learn a language.
 */

/**
 * Attic pottery and the metal the rest of it was made of. The gold is the
 * icon's gold; the black is the glaze, which is warm rather than true black,
 * because a true black piece would read as a hole in the screen.
 */
const palette = {
  gold: "#e8c98a",
  goldDeep: "#c49a5c",
  bronze: "#b5793a",
  bronzeDark: "#7d4f22",
  terracotta: "#c8703f",
  glaze: "#241c16",
  marble: "#ece5d8",
  marbleShade: "#bdb4a2",
  olive: "#6f9147",
  oliveDark: "#4b6b2f",
  wood: "#8a6234",
  woodDark: "#59401f",
  linen: "#efe3c4",
  crimson: "#a8322b",
  sea: "#3d6f80",
};

export default {
  palette,

  /** Shapes, keyed by name, each a stack of layers painted back to front. */
  shapes: {
    // ἀμφορεύς — amphora, terracotta with the figures reserved out of a black
    // band. The handles are a shade darker than the body: drawn in the same
    // terracotta they disappeared into it, and a two-handled jar with no
    // handles visible is just a pot.
    amphora: [
      ["bronzeDark", "M9.8 3.4 C7.4 3.6 5.8 5.2 5.8 7.8 L7.6 8.0 C7.6 6.2 8.4 5.2 9.8 5.0 Z M14.2 3.4 C16.6 3.6 18.2 5.2 18.2 7.8 L16.4 8.0 C16.4 6.2 15.6 5.2 14.2 5.0 Z"],
      ["terracotta", "M9.8 2.0 L14.2 2.0 L14.2 7.0 C17.2 8.4 18.8 11.0 18.8 14.0 C18.8 17.6 16.2 20.4 13.0 21.0 L13.0 22.4 L11.0 22.4 L11.0 21.0 C7.8 20.4 5.2 17.6 5.2 14.0 C5.2 11.0 6.8 8.4 9.8 7.0 Z"],
      ["glaze", "M5.3 12.4 C5.2 12.9 5.2 13.5 5.2 14.0 C5.2 15.6 5.7 17.0 6.5 18.2 L17.5 18.2 C18.3 17.0 18.8 15.6 18.8 14.0 C18.8 13.5 18.8 12.9 18.7 12.4 Z"],
      ["terracotta", "M8.4 13.4 L9.9 13.4 L9.9 17.2 L8.4 17.2 Z M11.3 14.4 L12.7 14.4 L12.7 17.2 L11.3 17.2 Z M14.1 13.4 L15.6 13.4 L15.6 17.2 L14.1 17.2 Z"],
      ["glaze", "M9.4 1.6 L14.6 1.6 L14.6 3.2 L9.4 3.2 Z M10.6 21.0 L13.4 21.0 L13.4 22.6 L10.6 22.6 Z"],
    ],

    // ἐλαία — olive sprig: green leaves, black fruit, and a twig that is neither
    olive: [
      ["woodDark", "M4.2 20.8 C7.6 17.2 12.4 12.0 19.4 5.2 L20.6 6.4 C13.8 13.2 8.6 18.2 5.4 21.8 Z"],
      ["olive", "M11.6 12.2 C10.0 10.2 10.4 7.6 12.6 6.4 C13.6 8.8 13.4 10.8 11.6 12.2 Z M14.8 9.0 C13.4 6.8 14.0 4.4 16.2 3.4 C17.0 5.8 16.6 7.8 14.8 9.0 Z M9.2 14.6 C7.2 13.4 6.6 11.0 8.0 9.0 C9.8 10.8 10.4 12.8 9.2 14.6 Z M6.4 18.0 C4.6 17.2 3.8 14.9 5.0 13.0 C6.6 14.2 7.2 16.1 6.4 18.0 Z"],
      ["oliveDark", "M12.6 6.4 C12.3 8.4 12.0 10.4 11.6 12.2 C11.4 10.2 11.8 8.2 12.6 6.4 Z M16.2 3.4 C15.8 5.4 15.4 7.3 14.8 9.0 C14.7 7.0 15.2 5.1 16.2 3.4 Z"],
      ["glaze", "M15.6 11.0 A1.9 1.9 0 1 0 19.4 11.0 A1.9 1.9 0 1 0 15.6 11.0 Z M11.1 15.6 A1.9 1.9 0 1 0 14.9 15.6 A1.9 1.9 0 1 0 11.1 15.6 Z"],
      ["oliveDark", "M16.4 10.2 A0.6 0.6 0 1 0 17.6 10.2 A0.6 0.6 0 1 0 16.4 10.2 Z M11.9 14.8 A0.6 0.6 0 1 0 13.1 14.8 A0.6 0.6 0 1 0 11.9 14.8 Z"],
    ],

    // λύρα — the lyre, which was a tortoise before it was an instrument
    lyre: [
      ["bronzeDark", "M12 21.8 C9.0 21.8 6.8 19.9 6.8 17.2 C6.8 14.7 9.0 13.0 12 13.0 C15.0 13.0 17.2 14.7 17.2 17.2 C17.2 19.9 15.0 21.8 12 21.8 Z"],
      ["bronze", "M12 20.6 C10.0 20.6 8.4 19.3 8.4 17.4 C8.4 15.7 10.0 14.4 12 14.4 C14.0 14.4 15.6 15.7 15.6 17.4 C15.6 19.3 14.0 20.6 12 20.6 Z"],
      ["bronzeDark", "M10.4 15.6 A1.1 1.1 0 1 0 12.6 15.6 A1.1 1.1 0 1 0 10.4 15.6 Z M12.4 18.2 A1.1 1.1 0 1 0 14.6 18.2 A1.1 1.1 0 1 0 12.4 18.2 Z M9.2 18.4 A1.1 1.1 0 1 0 11.4 18.4 A1.1 1.1 0 1 0 9.2 18.4 Z"],
      ["wood", "M9.2 14.0 C6.6 11.4 5.4 8.2 6.0 4.8 L8.0 5.1 C7.5 8.0 8.4 10.7 10.5 13.0 Z M14.8 14.0 C17.4 11.4 18.6 8.2 18.0 4.8 L16.0 5.1 C16.5 8.0 15.6 10.7 13.5 13.0 Z"],
      ["gold", "M5.0 3.4 L19.0 3.4 L19.0 5.2 L5.0 5.2 Z"],
      ["linen", "M10.2 5.2 L10.8 5.2 L10.8 13.4 L10.2 13.4 Z M11.7 5.2 L12.3 5.2 L12.3 13.4 L11.7 13.4 Z M13.2 5.2 L13.8 5.2 L13.8 13.4 L13.2 13.4 Z"],
    ],

    // τριήρης — trireme: a dark hull, a linen sail, and oars that are not the hull
    trireme: [
      ["wood", "M5.6 20.0 L6.8 23.0 L5.6 23.0 L4.6 20.0 Z M9.2 20.2 L10.1 23.2 L8.9 23.2 L8.3 20.2 Z M14.8 20.2 L15.7 20.2 L15.1 23.2 L13.9 23.2 Z M18.4 20.0 L19.4 20.0 L18.4 23.0 L17.2 23.0 Z"],
      ["linen", "M4.6 4.7 C9.0 3.5 15.0 3.5 19.4 4.7 L19.4 10.0 L4.6 10.0 Z"],
      ["crimson", "M4.6 6.6 L19.4 6.6 L19.4 7.9 L4.6 7.9 Z"],
      ["woodDark", "M11.2 1.8 L12.8 1.8 L12.8 4.7 L11.2 4.7 Z M11.2 9.9 L12.8 9.9 L12.8 13.0 L11.2 13.0 Z"],
      ["glaze", "M2.4 13.2 L21.6 13.2 C20.7 17.3 17.2 20.0 12 20.0 C6.8 20.0 3.3 17.3 2.4 13.2 Z"],
      // A wale along the sheer, so a pitched hull is a ship and not a hole.
      ["bronze", "M2.4 13.2 L21.6 13.2 L21.3 14.6 L2.7 14.6 Z"],
      ["bronze", "M0.5 14.4 L3.2 12.2 L3.2 15.0 Z"],
      ["linen", "M4.8 14.6 A1.5 1.5 0 1 0 7.8 14.6 A1.5 1.5 0 1 0 4.8 14.6 Z"],
      ["crimson", "M5.6 14.6 A0.7 0.7 0 1 0 7.0 14.6 A0.7 0.7 0 1 0 5.6 14.6 Z"],
    ],

    // κιόκρανον — the Ionic capital, marble with the shaded side turned away
    capital: [
      ["marble", "M3.4 6.6 L20.6 6.6 L20.6 9.0 L3.4 9.0 Z"],
      ["marbleShade", "M12 6.6 L20.6 6.6 L20.6 9.0 L12 9.0 Z"],
      ["marble", "M4.0 9.6 C4.0 12.6 5.8 14.6 8.2 14.6 C10.0 14.6 11.2 13.4 11.2 11.9 C11.2 10.6 10.3 9.7 9.1 9.7 C8.1 9.7 7.4 10.4 7.4 11.3 C7.4 12.0 7.9 12.5 8.6 12.5 C9.0 12.5 9.3 12.3 9.5 12.0 C9.4 12.9 8.9 13.4 8.1 13.4 C6.8 13.4 6.0 12.2 6.0 10.4 L6.0 9.6 Z"],
      ["marbleShade", "M20.0 9.6 C20.0 12.6 18.2 14.6 15.8 14.6 C14.0 14.6 12.8 13.4 12.8 11.9 C12.8 10.6 13.7 9.7 14.9 9.7 C15.9 9.7 16.6 10.4 16.6 11.3 C16.6 12.0 16.1 12.5 15.4 12.5 C15.0 12.5 14.7 12.3 14.5 12.0 C14.6 12.9 15.1 13.4 15.9 13.4 C17.2 13.4 18.0 12.2 18.0 10.4 L18.0 9.6 Z"],
      ["marble", "M8.6 15.2 L15.4 15.2 L16.2 21.4 L7.8 21.4 Z"],
      ["marbleShade", "M12 15.2 L15.4 15.2 L16.2 21.4 L12 21.4 Z"],
    ],

    // κύλιξ — the drinking cup, black outside and terracotta within
    kylix: [
      ["glaze", "M3.6 7.6 L20.4 7.6 C19.6 12.2 16.4 15.0 12 15.0 C7.6 15.0 4.4 12.2 3.6 7.6 Z"],
      ["terracotta", "M5.2 7.6 L18.8 7.6 C18.2 8.9 17.4 9.6 16.2 9.6 L7.8 9.6 C6.6 9.6 5.8 8.9 5.2 7.6 Z"],
      ["glaze", "M11.1 14.6 L12.9 14.6 L12.9 18.6 L11.1 18.6 Z M7.2 18.6 L16.8 18.6 L16.8 20.6 L7.2 20.6 Z"],
      ["glaze", "M2.2 8.2 C1.0 9.4 1.4 11.2 3.0 11.6 L3.4 9.9 C2.9 9.7 2.8 9.2 3.1 8.8 Z M21.8 8.2 C23.0 9.4 22.6 11.2 21.0 11.6 L20.6 9.9 C21.1 9.7 21.2 9.2 20.9 8.8 Z"],
      ["terracotta", "M9.6 11.0 L10.9 11.0 L10.9 13.4 L9.6 13.4 Z M13.1 11.0 L14.4 11.0 L14.4 13.4 L13.1 13.4 Z"],
    ],

    // Ω — omega, the letter that means the language
    omega: [
      ["gold", "M12 2.6 C7.4 2.6 4.4 6.0 4.4 10.6 C4.4 13.4 5.6 15.8 7.6 17.2 L7.6 18.6 L3.6 18.6 L3.6 21.4 L10.4 21.4 L10.4 15.6 C8.4 14.8 7.4 13.0 7.4 10.8 C7.4 7.8 9.2 5.6 12 5.6 C14.8 5.6 16.6 7.8 16.6 10.8 C16.6 13.0 15.6 14.8 13.6 15.6 L13.6 21.4 L20.4 21.4 L20.4 18.6 L16.4 18.6 L16.4 17.2 C18.4 15.8 19.6 13.4 19.6 10.6 C19.6 6.0 16.6 2.6 12 2.6 Z"],
    ],

    // κεραυνός — the thunderbolt, white at the core the way lightning is
    keraunos: [
      ["gold", "M15.4 1.2 L6.0 13.4 L10.9 13.4 L8.6 22.8 L18.4 10.2 L13.3 10.2 Z"],
      ["linen", "M14.6 3.6 L8.4 12.4 L11.4 12.4 L9.8 19.4 L16.2 10.8 L13.0 10.8 Z"],
    ],

    // γλαύξ — the owl of Athena, as she stands on the tetradrachm: facing out,
    // the sprig behind one shoulder and the crescent behind the other
    glaux: [
      ["olive", "M2.6 8.4 C3.4 6.4 5.2 5.2 7.0 5.4 L6.6 7.0 C5.4 6.9 4.4 7.5 3.8 8.8 Z M3.0 5.0 C3.9 3.7 5.3 3.4 6.3 4.0 C5.7 5.0 4.5 5.4 3.0 5.0 Z M5.6 3.0 C6.7 2.0 8.1 2.1 8.8 3.0 C7.9 3.8 6.7 3.8 5.6 3.0 Z"],
      ["gold", "M17.4 2.6 C19.9 2.6 21.9 4.6 21.9 7.1 C21.9 9.6 19.9 11.6 17.4 11.6 C16.9 11.6 16.4 11.5 16.0 11.4 C17.8 10.7 19.1 9.0 19.1 7.1 C19.1 5.2 17.8 3.5 16.0 2.8 C16.4 2.7 16.9 2.6 17.4 2.6 Z"],
      ["goldDeep", "M6.6 12.4 C6.6 8.2 8.9 5.4 12 5.4 C15.1 5.4 17.4 8.2 17.4 12.4 L17.4 16.6 C17.4 19.6 15.0 21.6 12 21.6 C9.0 21.6 6.6 19.6 6.6 16.6 Z"],
      ["gold", "M8.2 12.6 C8.2 9.4 9.8 7.2 12 7.2 C14.2 7.2 15.8 9.4 15.8 12.6 L15.8 16.4 C15.8 18.6 14.2 20.0 12 20.0 C9.8 20.0 8.2 18.6 8.2 16.4 Z"],
      ["goldDeep", "M6.6 8.0 L9.0 4.0 L10.2 6.6 Z M17.4 8.0 L15.0 4.0 L13.8 6.6 Z"],
      ["linen", "M7.4 10.4 A2.5 2.5 0 1 0 12.4 10.4 A2.5 2.5 0 1 0 7.4 10.4 Z M11.6 10.4 A2.5 2.5 0 1 0 16.6 10.4 A2.5 2.5 0 1 0 11.6 10.4 Z"],
      ["glaze", "M8.4 10.4 A1.5 1.5 0 1 0 11.4 10.4 A1.5 1.5 0 1 0 8.4 10.4 Z M12.6 10.4 A1.5 1.5 0 1 0 15.6 10.4 A1.5 1.5 0 1 0 12.6 10.4 Z"],
      ["goldDeep", "M12 11.6 L13.4 13.6 L10.6 13.6 Z"],
      ["bronzeDark", "M9.6 21.4 L9.6 23.2 L8.0 23.2 M14.4 21.4 L14.4 23.2 L16.0 23.2 Z"],
    ],

    // κόρυς — the Corinthian helmet, in profile facing left, which is the only
    // view of it anyone would recognise. The eye slot and the mouth slot cut
    // out of the front are the whole of it; without them this is a bucket.
    korys: [
      ["crimson", "M5.4 9.6 C6.4 4.2 10.4 1.2 15.2 1.4 L15.0 3.6 C11.2 3.6 8.2 6.0 7.4 10.2 Z"],
      ["crimson", "M14.8 1.4 C18.6 1.8 21.2 4.2 21.6 7.6 L19.4 7.8 C19.0 5.4 17.4 3.8 14.8 3.6 Z"],
      ["bronze", "M4.8 13.2 C4.8 8.0 8.0 4.6 12.2 4.6 C16.2 4.6 19.0 7.8 19.0 12.4 L19.0 16.2 C19.0 19.6 16.6 21.9 13.2 21.9 C8.4 21.9 4.8 18.4 4.8 13.8 Z"],
      ["bronzeDark", "M12.2 4.6 C16.2 4.6 19.0 7.8 19.0 12.4 L19.0 16.2 C19.0 19.6 16.6 21.9 13.2 21.9 L13.2 4.6 Z"],
      ["glaze", "M6.4 10.2 C7.6 9.6 9.4 9.8 10.4 10.6 C10.4 12.0 8.2 12.6 6.4 12.0 Z"],
      ["glaze", "M5.4 15.4 C6.8 15.0 8.6 15.2 9.8 15.8 L9.8 18.6 C8.0 19.0 6.2 18.4 5.4 17.4 Z"],
    ],

    // ἀσπίς — the hoplite shield, with the lambda a Spartan painted on it
    aspis: [
      ["bronze", "M1.6 12 A10.4 10.4 0 1 0 22.4 12 A10.4 10.4 0 1 0 1.6 12 Z"],
      ["bronzeDark", "M2.8 12 A9.2 9.2 0 1 0 21.2 12 A9.2 9.2 0 1 0 2.8 12 Z M4.0 12 A8.0 8.0 0 1 0 20.0 12 A8.0 8.0 0 1 0 4.0 12 Z"],
      ["crimson", "M4.0 12 A8.0 8.0 0 1 0 20.0 12 A8.0 8.0 0 1 0 4.0 12 Z"],
      ["gold", "M10.4 5.6 L13.6 5.6 L17.6 18.0 L14.2 18.0 L12 10.8 L9.8 18.0 L6.4 18.0 Z"],
    ],

    // δόρυ — the spear, iron at the top and bronze at the butt
    doru: [
      ["wood", "M11.2 3.6 L12.8 3.6 L12.8 20.6 L11.2 20.6 Z"],
      ["marbleShade", "M12 0.4 L13.9 4.2 L13.4 7.4 L10.6 7.4 L10.1 4.2 Z"],
      ["marble", "M12 0.4 L13.9 4.2 L13.4 7.4 L12 7.4 Z"],
      ["bronze", "M10.6 20.6 L13.4 20.6 L12.8 23.2 L11.2 23.2 Z"],
      ["bronzeDark", "M11.0 11.4 L13.0 11.4 L13.0 12.8 L11.0 12.8 Z"],
    ],

    // βιβλίον — the scroll, papyrus wound on two rods
    biblion: [
      ["linen", "M5.0 4.6 L19.0 4.6 L19.0 19.4 L5.0 19.4 Z"],
      ["glaze", "M7.0 7.4 L17.0 7.4 L17.0 8.4 L7.0 8.4 Z M7.0 10.2 L17.0 10.2 L17.0 11.2 L7.0 11.2 Z M7.0 13.0 L17.0 13.0 L17.0 14.0 L7.0 14.0 Z M7.0 15.8 L13.6 15.8 L13.6 16.8 L7.0 16.8 Z"],
      ["wood", "M3.4 3.0 L20.6 3.0 C21.3 3.0 21.3 4.8 20.6 4.8 L3.4 4.8 C2.7 4.8 2.7 3.0 3.4 3.0 Z M3.4 19.2 L20.6 19.2 C21.3 19.2 21.3 21.0 20.6 21.0 L3.4 21.0 C2.7 21.0 2.7 19.2 3.4 19.2 Z"],
      ["woodDark", "M1.8 3.9 A1.2 1.2 0 1 0 4.2 3.9 A1.2 1.2 0 1 0 1.8 3.9 Z M19.8 3.9 A1.2 1.2 0 1 0 22.2 3.9 A1.2 1.2 0 1 0 19.8 3.9 Z M1.8 20.1 A1.2 1.2 0 1 0 4.2 20.1 A1.2 1.2 0 1 0 1.8 20.1 Z M19.8 20.1 A1.2 1.2 0 1 0 22.2 20.1 A1.2 1.2 0 1 0 19.8 20.1 Z"],
    ],

    // στέφανος — the olive crown, which is all a victor at Olympia was given
    stephanos: [
      ["oliveDark", "M11.6 21.4 C6.4 20.4 3.0 16.2 3.0 11.4 C3.0 7.8 4.8 4.8 7.4 3.2 L8.4 4.8 C6.2 6.2 4.8 8.6 4.8 11.4 C4.8 15.4 7.6 18.8 11.8 19.6 Z M12.4 21.4 C17.6 20.4 21.0 16.2 21.0 11.4 C21.0 7.8 19.2 4.8 16.6 3.2 L15.6 4.8 C17.8 6.2 19.2 8.6 19.2 11.4 C19.2 15.4 16.4 18.8 12.2 19.6 Z"],
      ["olive", "M4.2 8.6 C3.0 7.2 3.2 5.4 4.8 4.6 C5.6 6.2 5.4 7.6 4.2 8.6 Z M3.6 12.6 C2.2 11.8 1.8 10.0 3.0 8.8 C4.2 10.0 4.4 11.4 3.6 12.6 Z M4.6 16.4 C3.2 16.0 2.4 14.4 3.2 13.0 C4.6 13.8 5.2 15.0 4.6 16.4 Z M7.0 19.2 C5.6 19.2 4.4 17.9 4.8 16.4 C6.3 16.8 7.2 17.8 7.0 19.2 Z M8.4 5.0 C7.6 3.4 8.4 1.8 10.1 1.6 C10.2 3.3 9.6 4.5 8.4 5.0 Z"],
      ["olive", "M19.8 8.6 C21.0 7.2 20.8 5.4 19.2 4.6 C18.4 6.2 18.6 7.6 19.8 8.6 Z M20.4 12.6 C21.8 11.8 22.2 10.0 21.0 8.8 C19.8 10.0 19.6 11.4 20.4 12.6 Z M19.4 16.4 C20.8 16.0 21.6 14.4 20.8 13.0 C19.4 13.8 18.8 15.0 19.4 16.4 Z M17.0 19.2 C18.4 19.2 19.6 17.9 19.2 16.4 C17.7 16.8 16.8 17.8 17.0 19.2 Z M15.6 5.0 C16.4 3.4 15.6 1.8 13.9 1.6 C13.8 3.3 14.4 4.5 15.6 5.0 Z"],
      ["gold", "M9.0 21.4 L11.0 21.0 L11.4 22.9 L9.4 23.2 Z M15.0 21.4 L13.0 21.0 L12.6 22.9 L14.6 23.2 Z M10.6 20.0 L13.4 20.0 L13.4 22.0 L10.6 22.0 Z"],
    ],

    // τρίπους — the Delphic tripod, which the Pythia sat on
    tripous: [
      ["bronze", "M5.4 8.6 L18.6 8.6 L18.6 10.4 L5.4 10.4 Z"],
      ["bronzeDark", "M6.6 4.6 C6.6 2.4 8.8 1.0 12 1.0 C15.2 1.0 17.4 2.4 17.4 4.6 C17.4 6.8 15.2 8.6 12 8.6 C8.8 8.6 6.6 6.8 6.6 4.6 Z"],
      ["bronze", "M8.0 4.4 C8.0 3.0 9.8 2.2 12 2.2 C14.2 2.2 16.0 3.0 16.0 4.4 C16.0 5.8 14.2 6.8 12 6.8 C9.8 6.8 8.0 5.8 8.0 4.4 Z"],
      ["bronzeDark", "M5.0 3.0 C3.4 3.4 3.0 5.2 4.4 6.2 L5.6 5.0 C5.2 4.7 5.2 4.2 5.6 4.0 Z M19.0 3.0 C20.6 3.4 21.0 5.2 19.6 6.2 L18.4 5.0 C18.8 4.7 18.8 4.2 18.4 4.0 Z"],
      ["bronze", "M11.2 10.4 L12.8 10.4 L12.8 22.6 L11.2 22.6 Z M6.6 10.4 L8.2 10.4 L5.0 22.6 L3.4 22.6 Z M15.8 10.4 L17.4 10.4 L20.6 22.6 L19.0 22.6 Z"],
    ],

    // πρόσωπον κωμικόν — the comic mask, grinning
    komikon: [
      ["linen", "M5.4 4.0 L18.6 4.0 L18.6 12.4 C18.6 17.8 15.6 21.6 12 21.6 C8.4 21.6 5.4 17.8 5.4 12.4 Z"],
      ["marbleShade", "M12 4.0 L18.6 4.0 L18.6 12.4 C18.6 17.8 15.6 21.6 12 21.6 Z"],
      ["gold", "M4.6 2.0 C7.4 3.8 9.4 4.6 12 4.6 C14.6 4.6 16.6 3.8 19.4 2.0 L19.4 5.0 C16.6 6.4 14.6 7.0 12 7.0 C9.4 7.0 7.4 6.4 4.6 5.0 Z"],
      ["glaze", "M7.4 11.6 C7.8 10.0 9.0 9.2 10.2 9.6 C10.0 11.0 8.8 11.8 7.4 11.6 Z M16.6 11.6 C16.2 10.0 15.0 9.2 13.8 9.6 C14.0 11.0 15.2 11.8 16.6 11.6 Z"],
      ["glaze", "M7.6 14.6 C9.0 17.6 15.0 17.6 16.4 14.6 C15.4 18.4 8.6 18.4 7.6 14.6 Z"],
    ],

    // πρόσωπον τραγικόν — the tragic mask, which is the same face falling
    tragikon: [
      ["marbleShade", "M5.4 4.0 L18.6 4.0 L18.6 12.4 C18.6 17.8 15.6 21.6 12 21.6 C8.4 21.6 5.4 17.8 5.4 12.4 Z"],
      ["glaze", "M12 4.0 L18.6 4.0 L18.6 12.4 C18.6 17.8 15.6 21.6 12 21.6 Z"],
      ["crimson", "M4.6 2.0 C7.4 3.8 9.4 4.6 12 4.6 C14.6 4.6 16.6 3.8 19.4 2.0 L19.4 5.0 C16.6 6.4 14.6 7.0 12 7.0 C9.4 7.0 7.4 6.4 4.6 5.0 Z"],
      ["glaze", "M7.4 9.6 C7.8 11.2 9.0 12.0 10.2 11.6 C10.0 10.2 8.8 9.4 7.4 9.6 Z"],
      ["marble", "M16.6 9.6 C16.2 11.2 15.0 12.0 13.8 11.6 C14.0 10.2 15.2 9.4 16.6 9.6 Z"],
      ["glaze", "M9.2 17.6 C9.8 15.4 14.2 15.4 14.8 17.6 C13.4 16.4 10.6 16.4 9.2 17.6 Z"],
      ["marble", "M9.2 17.6 C9.8 15.4 14.2 15.4 14.8 17.6 C13.4 16.4 10.6 16.4 9.2 17.6 Z"],
    ],

    // γοργόνειον — the head Athena wore, meant to be looked at and not survived
    gorgoneion: [
      ["crimson", "M12 0.8 C13.2 2.4 14.6 3.0 16.4 2.8 C15.8 4.4 15.8 5.6 16.6 6.8 Z M12 0.8 C10.8 2.4 9.4 3.0 7.6 2.8 C8.2 4.4 8.2 5.6 7.4 6.8 Z M2.2 8.0 C4.0 8.2 5.4 7.8 6.6 6.6 C6.8 8.4 7.4 9.4 8.8 10.2 Z M21.8 8.0 C20.0 8.2 18.6 7.8 17.4 6.6 C17.2 8.4 16.6 9.4 15.2 10.2 Z M2.6 17.2 C4.2 16.2 5.0 15.0 5.2 13.4 C6.4 14.8 7.4 15.4 9.0 15.4 Z M21.4 17.2 C19.8 16.2 19.0 15.0 18.8 13.4 C17.6 14.8 16.6 15.4 15.0 15.4 Z"],
      ["gold", "M12 3.2 C16.6 3.2 20.0 7.0 20.0 12.0 C20.0 17.6 16.6 21.8 12 21.8 C7.4 21.8 4.0 17.6 4.0 12.0 C4.0 7.0 7.4 3.2 12 3.2 Z"],
      ["glaze", "M6.8 10.8 A2.2 2.2 0 1 0 11.2 10.8 A2.2 2.2 0 1 0 6.8 10.8 Z M12.8 10.8 A2.2 2.2 0 1 0 17.2 10.8 A2.2 2.2 0 1 0 12.8 10.8 Z"],
      ["goldDeep", "M12 12.2 L13.6 15.0 L10.4 15.0 Z"],
      ["glaze", "M7.6 16.6 L16.4 16.6 C15.8 19.0 14.0 20.2 12 20.2 C10.0 20.2 8.2 19.0 7.6 16.6 Z"],
      ["linen", "M9.0 17.2 L9.8 17.2 L9.8 19.6 L9.0 19.6 Z M11.6 17.2 L12.4 17.2 L12.4 20.0 L11.6 20.0 Z M14.2 17.2 L15.0 17.2 L15.0 19.6 L14.2 19.6 Z"],
    ],
  },

  /**
   * One burst draws from exactly one of these groups. A group with a single
   * name is a burst of only that shape; a group of two is a kit.
   *
   * The choice is uniform over groups rather than over shapes, so with a set
   * this size any one shape is rare — which is the intent. The student collects
   * them slowly rather than seeing all eighteen in a week.
   */
  throws: [
    ["amphora"], ["olive"], ["lyre"], ["trireme"], ["capital"], ["kylix"],
    ["omega"], ["keraunos"], ["glaux"],
    ["korys"], ["aspis"], ["korys", "aspis"],
    ["doru"], ["aspis", "doru"],
    ["biblion"], ["stephanos"], ["amphora", "stephanos"],
    ["tripous"], ["gorgoneion"],
    ["komikon"], ["tragikon"], ["komikon", "tragikon"],
  ],
};
