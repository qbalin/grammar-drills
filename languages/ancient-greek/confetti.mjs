/**
 * What this pack throws when the confetti fires.
 *
 * The pottery, the hoplite's kit, the theatre, the temple, the Acropolis on
 * its rock, and Poseidon with the ships that are his.
 *
 * Twenty-three shapes, which is what is left of three times that many. The pack
 * spent four passes drawing everything the reference sheets had and a bench in
 * Settings to look at them on; this is the set that survived being looked at,
 * and the rest has gone rather than being kept around to be compared against.
 * Git remembers it.
 *
 * A shape is a stack of layers, `[paint, path]`, painted back to front, each a
 * path in a 24x24 box. Every layer is filled `evenodd`, so a subpath nested
 * inside another *within one layer* is a hole — that is how the shield's rim
 * and the volutes of the Ionic capital are cut. Across layers there is no such rule: a later
 * layer simply covers the one beneath, which is where the colour comes from.
 * Draw the terracotta body, then the black figures on it.
 *
 * That is the whole reason the format changed. A piece used to be one flat
 * colour, so a trireme's oars were the same gold as its hull and an amphora had
 * no black figures on it.
 *
 * Paints are named, and resolved through `palette` below, so the pack's colours
 * are tuned in one place. `languages/ancient-greek/pack.test.ts` fails on a
 * name that is not there.
 *
 * Draw them at 40px, then look at them at 17px, which is the size they are
 * thrown at; anything that needs its fine detail to be recognized will not
 * survive. That is what took the count down.
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
  crimsonDark: "#71201c",
  sea: "#3d6f80",
  silver: "#cbd2d8",
  silverDark: "#9aa3ad",
  // Added for the third pass, which models light on a shape rather than
  // filling it flat: every material wants a lit face and a turned-away one.
  terracottaDark: "#96482a",
  terracottaLight: "#dd9160",
  marbleLight: "#f8f4ec",
  bronzeLight: "#d0975a",
  goldLight: "#f7e8c6",
  // Added for the fourth pass — Poseidon, who needs skin, and the Acropolis,
  // which needs the rock under it. The marble was already here; nothing else
  // in the pack had ever been alive.
  flesh: "#f0c8a0",
  fleshShade: "#cf9a6f",
  fleshLight: "#fbe2c6",
  // Not marble: marble is what the temple is cut from, and the crag it stands
  // on has to read as the thing that was there first.
  rock: "#cdbfa4",
  rockShade: "#a3947a",
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

    // Ω — omega, the letter that means the language.
    //
    // One closed contour: Ω has no counter, because the bay between its legs is
    // open at the bottom. That is the whole shape, and getting it wrong is what
    // the drawing before this one did — its bay was a circle with a narrow slot
    // under it, and a circle with a slot under it is a padlock. At icon size
    // that is what it read as.
    //
    // So the bay is a bowl open at the bottom rather than a ring with a slot:
    // 11.2 across at its widest and still 5.2 between the feet, where the old
    // one was 3.2 all the way down. Each terminal scoops outward into its foot
    // instead of being butted onto a circle at a right angle.
    //
    // The weight is modulated, which is what the drawing before this one was
    // changed from capsules to a path in order to get and then did not do —
    // 2.2 across the apex against 3.2 at the shoulders, where a pen drawing
    // this would be at its broadest.
    //
    // Arcs would say some of this in fewer numbers, and are not available:
    // `make-icons.mjs` throws on any path command it does not draw, and the
    // app icon is this very shape.
    omega: [
      ["gold", "M12 3.2 C7.14 3.2 3.2 7.05 3.2 11.8 C3.2 15.0 4.3 16.8 5.9 17.4 C5.5 18.2 4.9 19.0 4.4 19.0 L2.8 19.0 L2.8 21.6 L9.4 21.6 L9.4 19.3 C9.2 18.7 9.0 18.2 8.8 17.6 C7.5 16.0 6.4 14.3 6.4 12.0 C6.4 8.3 8.9 5.4 12 5.4 C15.1 5.4 17.6 8.3 17.6 12.0 C17.6 14.3 16.5 16.0 15.2 17.6 C15.0 18.2 14.8 18.7 14.6 19.3 L14.6 21.6 L21.2 21.6 L21.2 19.0 L19.6 19.0 C19.1 19.0 18.5 18.2 18.1 17.4 C19.7 16.8 20.8 15.0 20.8 11.8 C20.8 7.05 16.86 3.2 12 3.2 Z"],
    ],

    // κεραυνός — the thunderbolt, white at the core the way lightning is
    keraunos: [
      ["gold", "M15.4 1.2 L6.0 13.4 L10.9 13.4 L8.6 22.8 L18.4 10.2 L13.3 10.2 Z"],
      ["linen", "M14.6 3.6 L8.4 12.4 L11.4 12.4 L9.8 19.4 L16.2 10.8 L13.0 10.8 Z"],
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

    // στέφανος — the olive crown, which is all a victor at Olympia was given
    stephanos: [
      ["oliveDark", "M11.6 21.4 C6.4 20.4 3.0 16.2 3.0 11.4 C3.0 7.8 4.8 4.8 7.4 3.2 L8.4 4.8 C6.2 6.2 4.8 8.6 4.8 11.4 C4.8 15.4 7.6 18.8 11.8 19.6 Z M12.4 21.4 C17.6 20.4 21.0 16.2 21.0 11.4 C21.0 7.8 19.2 4.8 16.6 3.2 L15.6 4.8 C17.8 6.2 19.2 8.6 19.2 11.4 C19.2 15.4 16.4 18.8 12.2 19.6 Z"],
      ["olive", "M4.2 8.6 C3.0 7.2 3.2 5.4 4.8 4.6 C5.6 6.2 5.4 7.6 4.2 8.6 Z M3.6 12.6 C2.2 11.8 1.8 10.0 3.0 8.8 C4.2 10.0 4.4 11.4 3.6 12.6 Z M4.6 16.4 C3.2 16.0 2.4 14.4 3.2 13.0 C4.6 13.8 5.2 15.0 4.6 16.4 Z M7.0 19.2 C5.6 19.2 4.4 17.9 4.8 16.4 C6.3 16.8 7.2 17.8 7.0 19.2 Z M8.4 5.0 C7.6 3.4 8.4 1.8 10.1 1.6 C10.2 3.3 9.6 4.5 8.4 5.0 Z"],
      ["olive", "M19.8 8.6 C21.0 7.2 20.8 5.4 19.2 4.6 C18.4 6.2 18.6 7.6 19.8 8.6 Z M20.4 12.6 C21.8 11.8 22.2 10.0 21.0 8.8 C19.8 10.0 19.6 11.4 20.4 12.6 Z M19.4 16.4 C20.8 16.0 21.6 14.4 20.8 13.0 C19.4 13.8 18.8 15.0 19.4 16.4 Z M17.0 19.2 C18.4 19.2 19.6 17.9 19.2 16.4 C17.7 16.8 16.8 17.8 17.0 19.2 Z M15.6 5.0 C16.4 3.4 15.6 1.8 13.9 1.6 C13.8 3.3 14.4 4.5 15.6 5.0 Z"],
      ["gold", "M9.0 21.4 L11.0 21.0 L11.4 22.9 L9.4 23.2 Z M15.0 21.4 L13.0 21.0 L12.6 22.9 L14.6 23.2 Z M10.6 20.0 L13.4 20.0 L13.4 22.0 L10.6 22.0 Z"],
    ],

    // πρόσωπον κωμικόν — the comic mask, grinning
    komikon2: [
      ["linen", "M5.4 4.2 L18.6 4.2 L18.6 12.4 C18.6 17.8 15.6 21.8 12 21.8 C8.4 21.8 5.4 17.8 5.4 12.4 Z"],
      ["marbleShade", "M12 4.2 L18.6 4.2 L18.6 12.4 C18.6 17.8 15.6 21.8 12 21.8 Z"],
      ["linen", "M5.4 10.4 C4.2 10.0 3.2 10.8 3.4 12.0 C3.6 13.2 4.6 13.8 5.7 13.4 Z M18.6 10.4 C19.8 10.0 20.8 10.8 20.6 12.0 C20.4 13.2 19.4 13.8 18.3 13.4 Z"],
      ["gold", "M4.4 1.8 C7.3 3.7 9.4 4.6 12 4.6 C14.6 4.6 16.7 3.7 19.6 1.8 L19.6 5.0 C16.7 6.5 14.6 7.1 12 7.1 C9.4 7.1 7.3 6.5 4.4 5.0 Z"],
      ["goldDeep", "M6.2 2.9 C7.1 4.2 8.0 5.1 8.8 5.6 L8.2 6.4 C7.2 5.8 6.4 4.9 5.8 3.8 Z M17.8 2.9 C16.9 4.2 16.0 5.1 15.2 5.6 L15.8 6.4 C16.8 5.8 17.6 4.9 18.2 3.8 Z"],
      ["bronzeDark", "M6.8 9.6 C7.6 8.2 9.2 7.8 10.4 8.6 L10.0 9.4 C9.1 8.9 8.1 9.2 7.5 10.1 Z M17.2 9.6 C16.4 8.2 14.8 7.8 13.6 8.6 L14.0 9.4 C14.9 8.9 15.9 9.2 16.5 10.1 Z"],
      ["glaze", "M7.0 11.8 C7.7 10.4 9.5 10.0 10.6 10.9 C10.1 12.3 8.2 12.8 7.0 11.8 Z M17.0 11.8 C16.3 10.4 14.5 10.0 13.4 10.9 C13.9 12.3 15.8 12.8 17.0 11.8 Z"],
      ["marbleShade", "M11.3 12.2 L12.7 12.2 L13.1 15.2 C13.1 15.9 10.9 15.9 10.9 15.2 Z"],
      ["glaze", "M6.8 15.6 L17.2 15.6 C16.4 19.0 14.4 20.9 12 20.9 C9.6 20.9 7.6 19.0 6.8 15.6 Z"],
      ["linen", "M8.0 15.6 L16.0 15.6 C15.6 16.6 15.0 17.2 14.2 17.2 L9.8 17.2 C9.0 17.2 8.4 16.6 8.0 15.6 Z"],
      ["crimson", "M10.0 19.2 C10.8 18.5 13.2 18.5 14.0 19.2 C13.4 20.4 10.6 20.4 10.0 19.2 Z"],
    ],

    // πρόσωπον τραγικόν — the tragic mask, which is the same face falling
    tragikon2: [
      ["marbleShade", "M5.4 4.2 L18.6 4.2 L18.6 12.4 C18.6 17.8 15.6 21.8 12 21.8 C8.4 21.8 5.4 17.8 5.4 12.4 Z"],
      ["glaze", "M12 4.2 L18.6 4.2 L18.6 12.4 C18.6 17.8 15.6 21.8 12 21.8 Z"],
      ["marbleShade", "M5.4 10.4 C4.2 10.0 3.2 10.8 3.4 12.0 C3.6 13.2 4.6 13.8 5.7 13.4 Z M18.6 10.4 C19.8 10.0 20.8 10.8 20.6 12.0 C20.4 13.2 19.4 13.8 18.3 13.4 Z"],
      ["crimson", "M4.4 1.6 C7.3 3.6 9.4 4.6 12 4.6 C14.6 4.6 16.7 3.6 19.6 1.6 L19.6 5.2 C16.7 6.7 14.6 7.3 12 7.3 C9.4 7.3 7.3 6.7 4.4 5.2 Z"],
      ["crimsonDark", "M6.2 2.7 C7.1 4.1 8.0 5.0 8.8 5.6 L8.2 6.5 C7.2 5.9 6.4 4.9 5.8 3.7 Z M17.8 2.7 C16.9 4.1 16.0 5.0 15.2 5.6 L15.8 6.5 C16.8 5.9 17.6 4.9 18.2 3.7 Z"],
      // Brows driven up and together at the inner ends: the one line that makes
      // a face grieve rather than merely not smile.
      ["glaze", "M6.6 10.0 C7.6 8.0 9.6 7.6 10.9 8.9 L10.2 9.7 C9.3 8.9 8.1 9.2 7.4 10.5 Z M17.4 10.0 C16.4 8.0 14.4 7.6 13.1 8.9 L13.8 9.7 C14.7 8.9 15.9 9.2 16.6 10.5 Z"],
      ["glaze", "M7.2 12.2 C8.0 11.0 9.8 10.9 10.7 11.8 C10.0 13.0 8.2 13.2 7.2 12.2 Z"],
      ["marble", "M16.8 12.2 C16.0 11.0 14.2 10.9 13.3 11.8 C14.0 13.0 15.8 13.2 16.8 12.2 Z"],
      ["glaze", "M11.3 12.4 L12.7 12.4 L13.1 15.4 C13.1 16.1 10.9 16.1 10.9 15.4 Z"],
      ["glaze", "M7.4 20.0 C8.2 16.6 15.8 16.6 16.6 20.0 C15.2 18.2 8.8 18.2 7.4 20.0 Z"],
      ["marble", "M8.8 19.0 C9.8 17.6 14.2 17.6 15.2 19.0 C13.8 18.4 10.2 18.4 8.8 19.0 Z"],
    ],

    // κιθάρα — the concert lyre, which is a box where the lyre is a shell
    kithara: [
      ["wood", "M6.6 4.2 L9.0 4.2 L9.0 13.6 L6.6 13.6 Z M15.0 4.2 L17.4 4.2 L17.4 13.6 L15.0 13.6 Z"],
      ["wood", "M5.2 3.4 C5.2 1.8 6.6 0.9 8.2 1.3 L7.9 3.1 C7.2 3.0 6.8 3.3 6.9 4.2 Z M18.8 3.4 C18.8 1.8 17.4 0.9 15.8 1.3 L16.1 3.1 C16.8 3.0 17.2 3.3 17.1 4.2 Z"],
      ["gold", "M5.6 3.4 L18.4 3.4 L18.4 5.2 L5.6 5.2 Z"],
      ["wood", "M7.0 13.4 L17.0 13.4 L17.0 20.4 C17.0 21.6 16.2 22.4 15.0 22.4 L9.0 22.4 C7.8 22.4 7.0 21.6 7.0 20.4 Z"],
      ["bronzeDark", "M12 15.4 A2.4 2.4 0 1 0 16.8 15.4 A2.4 2.4 0 1 0 12 15.4 Z"],
      ["linen", "M9.0 5.2 L9.6 5.2 L9.6 13.6 L9.0 13.6 Z M10.6 5.2 L11.2 5.2 L11.2 13.6 L10.6 13.6 Z M12.2 5.2 L12.8 5.2 L12.8 13.6 L12.2 13.6 Z M13.8 5.2 L14.4 5.2 L14.4 13.6 L13.8 13.6 Z"],
    ],

    // πρῷρα — the bow of the trireme in profile: the ram at the waterline, the
    // stem post curling up, and the one eye painted on the cheek.
    //
    // Drawn head-on instead, with an eye either side of a rising stem, this
    // came out as a face — and a pack with three theatre masks in it cannot
    // afford a fourth by accident.
    prora: [
      ["wood", "M6.0 20.6 L7.0 23.4 L5.8 23.4 L5.0 20.6 Z M10.0 20.8 L10.9 23.6 L9.7 23.6 L9.2 20.8 Z M14.0 20.6 L14.9 23.4 L13.7 23.4 L13.2 20.6 Z"],
      ["glaze", "M3.0 13.4 C2.4 9.0 3.6 5.4 6.6 3.0 L8.6 4.8 C6.2 6.8 5.4 9.6 5.8 13.4 Z"],
      ["bronze", "M6.0 2.2 C6.0 1.0 7.6 0.6 8.4 1.6 L7.2 2.8 C6.9 2.5 6.6 2.6 6.6 3.2 Z"],
      ["glaze", "M3.0 13.4 L21.4 13.4 L20.4 18.8 C19.0 20.4 15.4 21.2 11.2 21.2 C7.0 21.2 4.4 19.6 3.4 17.2 Z"],
      ["bronze", "M3.0 13.4 L21.4 13.4 L21.1 15.0 L3.1 15.0 Z"],
      ["bronze", "M0.2 15.6 L3.2 13.0 L3.2 17.6 Z"],
      ["linen", "M6.6 17.4 A2.3 2.3 0 1 0 11.2 17.4 A2.3 2.3 0 1 0 6.6 17.4 Z"],
      ["crimson", "M7.9 17.4 A1.0 1.0 0 1 0 9.9 17.4 A1.0 1.0 0 1 0 7.9 17.4 Z"],
    ],

    // κράνος — the open-faced helmet, which let a man see and be recognised
    kranos: [
      ["crimson", "M8.0 6.2 C8.4 2.2 10.0 0.8 12 0.8 C14.0 0.8 15.6 2.2 16.0 6.2 Z"],
      ["bronze", "M6.0 12.6 C6.0 8.0 8.6 5.0 12 5.0 C15.4 5.0 18.0 8.0 18.0 12.6 Z"],
      ["bronzeDark", "M12 5.0 C15.4 5.0 18.0 8.0 18.0 12.6 L12 12.6 Z"],
      ["gold", "M5.6 12.6 L18.4 12.6 L18.4 14.2 L5.6 14.2 Z M11.4 14.2 L12.6 14.2 L12.6 16.6 L11.4 16.6 Z"],
      ["bronze", "M6.4 14.2 L9.8 14.2 L9.8 20.2 C9.8 21.2 9.1 21.9 8.1 21.9 C7.1 21.9 6.4 21.0 6.4 20.0 Z M17.6 14.2 L14.2 14.2 L14.2 20.2 C14.2 21.2 14.9 21.9 15.9 21.9 C16.9 21.9 17.6 21.0 17.6 20.0 Z"],
    ],

    // σάρισσα — the Macedonian pike, so long it was carried in two halves and
    // joined by the sleeve in the middle
    sarissa: [
      ["silver", "M12 0.4 L13.4 3.4 L12.9 6.2 L11.1 6.2 L10.6 3.4 Z"],
      ["silverDark", "M12 0.4 L13.4 3.4 L12.9 6.2 L12 6.2 Z"],
      ["wood", "M11.2 6.2 L12.8 6.2 L12.8 21.0 L11.2 21.0 Z"],
      ["bronze", "M10.4 12.0 L13.6 12.0 L13.6 14.8 L10.4 14.8 Z"],
      ["bronzeDark", "M10.4 13.0 L13.6 13.0 L13.6 13.8 L10.4 13.8 Z"],
      ["bronze", "M10.8 21.0 L13.2 21.0 L12.6 23.6 L11.4 23.6 Z"],
    ],

    // τόξον — the bow, recurved, with the arrow on the string
    toxon: [
      ["wood", "M16.4 2.0 C13.0 3.2 12.2 6.2 12.8 8.8 C13.2 10.6 13.2 13.4 12.8 15.2 C12.2 17.8 13.0 20.8 16.4 22.0 L17.2 20.2 C14.8 19.2 14.4 17.2 14.8 15.4 C15.3 13.2 15.3 10.8 14.8 8.6 C14.4 6.8 14.8 4.8 17.2 3.8 Z"],
      ["linen", "M16.0 2.0 L16.8 2.0 L16.8 22.0 L16.0 22.0 Z"],
      ["wood", "M3.6 11.5 L16.4 11.5 L16.4 12.5 L3.6 12.5 Z"],
      ["silver", "M0.8 12.0 L4.4 10.0 L4.4 14.0 Z"],
      ["crimson", "M14.0 11.5 L16.6 9.8 L17.3 10.5 L15.6 12.0 L17.3 13.5 L16.6 14.2 L14.0 12.5 Z"],
    ],

    // ---- third pass ---------------------------------------------------
    // Modelled rather than filled: a lit face and a turned-away one, an edge
    // treatment, and the surface an object actually has — the scutes on a
    // tortoise shell, the flutes on a shaft, the scales on a shield's rim.

    amphora3: [
      ["glaze", "M9.4 4.0 C5.8 4.2 3.8 6.8 4.1 10.4 L6.3 10.2 C6.2 7.7 7.4 6.0 9.4 5.8 Z M14.6 4.0 C18.2 4.2 20.2 6.8 19.9 10.4 L17.7 10.2 C17.8 7.7 16.6 6.0 14.6 5.8 Z"],
      ["terracotta", "M9.5 3.2 L14.5 3.2 L14.5 7.4 C18.1 8.9 19.9 11.7 19.9 14.8 C19.9 18.7 16.4 21.6 12 21.6 C7.6 21.6 4.1 18.7 4.1 14.8 C4.1 11.7 5.9 8.9 9.5 7.4 Z"],
      ["terracottaLight", "M9.5 3.2 L11.0 3.2 L11.0 7.8 C8.4 9.2 7.0 11.6 7.0 14.8 C7.0 17.4 8.0 19.6 9.6 21.0 C6.4 20.0 4.1 17.6 4.1 14.8 C4.1 11.7 5.9 8.9 9.5 7.4 Z"],
      ["terracottaDark", "M13.4 3.2 L14.5 3.2 L14.5 7.4 C18.1 8.9 19.9 11.7 19.9 14.8 C19.9 17.9 17.7 20.4 14.6 21.3 C16.6 19.9 17.8 17.6 17.8 14.8 C17.8 11.8 16.3 9.3 13.4 7.9 Z"],
      ["glaze", "M7.2 1.2 L16.8 1.2 L16.8 3.4 L7.2 3.4 Z"],
      ["terracottaLight", "M7.2 1.2 L16.8 1.2 L16.8 1.8 L7.2 1.8 Z"],
      ["glaze", "M9.6 4.4 L14.4 4.4 L14.4 4.9 L9.6 4.9 Z M9.6 5.6 C10.2 4.9 10.8 4.9 11.0 5.8 C11.2 4.9 11.8 4.9 12.0 5.8 C12.2 4.9 12.8 4.9 13.0 5.8 C13.2 4.9 13.8 4.9 14.4 5.6 L14.4 6.6 L9.6 6.6 Z"],
      ["glaze", "M4.4 12.2 C4.2 13.1 4.1 14.0 4.1 14.8 C4.1 16.2 4.5 17.5 5.3 18.6 L18.7 18.6 C19.5 17.5 19.9 16.2 19.9 14.8 C19.9 14.0 19.8 13.1 19.6 12.2 Z"],
      ["terracotta", "M10.6 13.4 C11.6 13.4 12.0 14.0 12.0 14.8 L12.4 17.6 L11.6 17.6 L11.0 15.6 L10.2 17.6 L9.4 17.6 L9.8 14.8 C9.8 14.0 10.0 13.4 10.6 13.4 Z M15.0 13.4 C15.8 13.4 16.2 14.0 16.2 14.8 L16.4 17.6 L15.6 17.6 L15.2 15.6 L14.4 17.6 L13.6 17.6 L13.8 14.8 C13.8 14.0 14.2 13.4 15.0 13.4 Z"],
      ["terracottaLight", "M10.2 12.6 A0.9 0.9 0 1 0 12.0 12.6 A0.9 0.9 0 1 0 10.2 12.6 Z M14.4 12.6 A0.9 0.9 0 1 0 16.2 12.6 A0.9 0.9 0 1 0 14.4 12.6 Z"],
      ["glaze", "M5.4 19.2 L18.6 19.2 L18.6 20.0 L5.4 20.0 Z M6.4 19.2 L7.0 19.2 L7.0 20.0 L6.4 20.0 Z M8.4 19.2 L9.0 19.2 L9.0 20.0 L8.4 20.0 Z M10.4 19.2 L11.0 19.2 L11.0 20.0 L10.4 20.0 Z M12.4 19.2 L13.0 19.2 L13.0 20.0 L12.4 20.0 Z M14.4 19.2 L15.0 19.2 L15.0 20.0 L14.4 20.0 Z M16.4 19.2 L17.0 19.2 L17.0 20.0 L16.4 20.0 Z"],
      ["glaze", "M9.0 21.0 L15.0 21.0 L15.0 22.8 L9.0 22.8 Z"],
    ],

    lyre3: [
      ["bronzeDark", "M12 22.2 C8.6 22.2 6.2 20.0 6.2 17.1 C6.2 14.4 8.6 12.5 12 12.5 C15.4 12.5 17.8 14.4 17.8 17.1 C17.8 20.0 15.4 22.2 12 22.2 Z"],
      ["bronze", "M12 21.0 C9.5 21.0 7.7 19.4 7.7 17.3 C7.7 15.3 9.5 13.8 12 13.8 C14.5 13.8 16.3 15.3 16.3 17.3 C16.3 19.4 14.5 21.0 12 21.0 Z"],
      ["bronzeDark", "M12 14.9 L13.5 16.0 L12.9 17.8 L11.1 17.8 L10.5 16.0 Z M9.0 17.0 L10.2 18.2 L9.5 19.8 L8.0 19.4 L7.9 17.7 Z M15.0 17.0 L16.1 17.7 L16.0 19.4 L14.5 19.8 L13.8 18.2 Z M12 19.0 L13.4 20.0 L12.7 21.0 L11.3 21.0 L10.6 20.0 Z"],
      ["bronzeLight", "M9.6 14.6 C10.3 14.2 11.1 14.0 12 14.0 L12 14.7 C11.2 14.7 10.5 14.9 9.9 15.2 Z"],
      ["wood", "M9.0 13.6 C6.2 10.9 5.0 7.4 5.7 3.8 L7.9 4.2 C7.4 7.2 8.3 10.0 10.5 12.5 Z M15.0 13.6 C17.8 10.9 19.0 7.4 18.3 3.8 L16.1 4.2 C16.6 7.2 15.7 10.0 13.5 12.5 Z"],
      ["woodDark", "M9.0 13.6 C6.2 10.9 5.0 7.4 5.7 3.8 L6.4 3.9 C5.9 7.4 7.1 10.8 9.7 13.4 Z M15.0 13.6 C17.8 10.9 19.0 7.4 18.3 3.8 L17.6 3.9 C18.1 7.4 16.9 10.8 14.3 13.4 Z"],
      ["bronze", "M4.6 2.6 C4.6 1.3 5.8 0.6 7.0 1.0 L6.6 2.8 C6.1 2.7 5.7 2.9 5.8 3.6 Z M19.4 2.6 C19.4 1.3 18.2 0.6 17.0 1.0 L17.4 2.8 C17.9 2.7 18.3 2.9 18.2 3.6 Z"],
      ["gold", "M5.0 3.0 L19.0 3.0 L19.0 5.0 L5.0 5.0 Z"],
      ["goldLight", "M5.0 3.0 L19.0 3.0 L19.0 3.7 L5.0 3.7 Z"],
      ["goldDeep", "M7.4 5.0 L8.0 5.0 L8.0 6.0 L7.4 6.0 Z M9.4 5.0 L10.0 5.0 L10.0 6.0 L9.4 6.0 Z M11.4 5.0 L12.0 5.0 L12.0 6.0 L11.4 6.0 Z M13.4 5.0 L14.0 5.0 L14.0 6.0 L13.4 6.0 Z M15.4 5.0 L16.0 5.0 L16.0 6.0 L15.4 6.0 Z"],
      ["linen", "M7.5 5.6 L8.0 5.6 L8.6 13.4 L8.1 13.4 Z M9.5 5.6 L10.0 5.6 L10.2 13.4 L9.7 13.4 Z M11.5 5.6 L12.0 5.6 L11.9 13.4 L11.4 13.4 Z M13.5 5.6 L14.0 5.6 L13.6 13.4 L13.1 13.4 Z M15.5 5.6 L16.0 5.6 L15.2 13.4 L14.7 13.4 Z"],
    ],

    capital3: [
      ["marble", "M2.8 5.6 L21.2 5.6 L21.2 8.2 L2.8 8.2 Z"],
      ["marbleLight", "M2.8 5.6 L21.2 5.6 L21.2 6.4 L2.8 6.4 Z"],
      ["marbleShade", "M12 5.6 L21.2 5.6 L21.2 8.2 L12 8.2 Z"],
      ["marble", "M3.4 8.2 L20.6 8.2 L20.6 10.2 C20.6 13.2 18.6 15.2 15.8 15.2 C13.6 15.2 12.2 13.8 12.2 12.0 C12.2 10.4 13.3 9.3 14.8 9.3 C16.0 9.3 16.9 10.2 16.9 11.3 C16.9 12.2 16.3 12.8 15.4 12.8 C14.9 12.8 14.5 12.6 14.3 12.2 C14.4 13.3 15.0 13.9 16.0 13.9 C17.6 13.9 18.6 12.5 18.6 10.3 L18.6 9.4 L5.4 9.4 L5.4 10.3 C5.4 12.5 6.4 13.9 8.0 13.9 C9.0 13.9 9.6 13.3 9.7 12.2 C9.5 12.6 9.1 12.8 8.6 12.8 C7.7 12.8 7.1 12.2 7.1 11.3 C7.1 10.2 8.0 9.3 9.2 9.3 C10.7 9.3 11.8 10.4 11.8 12.0 C11.8 13.8 10.4 15.2 8.2 15.2 C5.4 15.2 3.4 13.2 3.4 10.2 Z"],
      ["marbleShade", "M12 8.2 L20.6 8.2 L20.6 10.2 C20.6 13.2 18.6 15.2 15.8 15.2 C13.6 15.2 12.2 13.8 12.2 12.0 C12.2 10.4 13.3 9.3 14.8 9.3 C16.0 9.3 16.9 10.2 16.9 11.3 C16.9 12.2 16.3 12.8 15.4 12.8 C14.9 12.8 14.5 12.6 14.3 12.2 C14.4 13.3 15.0 13.9 16.0 13.9 C17.6 13.9 18.6 12.5 18.6 10.3 L18.6 9.4 L12 9.4 Z"],
      ["marbleShade", "M6.6 9.6 L7.3 9.6 C7.0 10.9 7.2 12.0 7.8 12.8 C6.9 12.2 6.5 11.1 6.6 9.6 Z M17.4 9.6 L16.7 9.6 C17.0 10.9 16.8 12.0 16.2 12.8 C17.1 12.2 17.5 11.1 17.4 9.6 Z"],
      ["marble", "M4.6 15.4 L19.4 15.4 L19.4 17.0 L4.6 17.0 Z"],
      ["marbleShade", "M12 15.4 L19.4 15.4 L19.4 17.0 L12 17.0 Z"],
      ["marble", "M7.6 17.0 L16.4 17.0 L16.4 22.4 L7.6 22.4 Z"],
      ["marbleShade", "M12 17.0 L16.4 17.0 L16.4 22.4 L12 22.4 Z M8.9 17.0 L9.6 17.0 L9.6 22.4 L8.9 22.4 Z M10.6 17.0 L11.3 17.0 L11.3 22.4 L10.6 22.4 Z M12.7 17.0 L13.4 17.0 L13.4 22.4 L12.7 22.4 Z M14.4 17.0 L15.1 17.0 L15.1 22.4 L14.4 22.4 Z"],
      ["marbleLight", "M7.6 17.0 L8.2 17.0 L8.2 22.4 L7.6 22.4 Z"],
    ],

    // ---- fourth pass: the rock, the order, and the twelve --------------
    // The pack had the pottery and the hoplite's kit but neither the city nor
    // anyone who lived in it. These are the buildings and the gods, which is
    // why the palette above grew flesh and rock.

    // ἀκρόπολις — the temple and the rock it stands on. The rock is half of it:
    // a Parthenon drawn on flat ground is just a temple, and the pack has one.
    akropolis: [
      ["rock", "M0.8 16.0 C2.6 15.2 4.6 15.0 6.6 15.4 L18.0 15.4 C20.2 15.4 21.8 16.4 23.2 18.2 L23.2 22.6 L0.8 22.6 Z"],
      ["rockShade", "M0.8 18.6 C4.0 17.6 8.0 17.2 12.6 17.4 C17.0 17.6 20.6 18.4 23.2 19.6 L23.2 22.6 L0.8 22.6 Z"],
      ["rock", "M2.6 19.4 C5.4 18.8 8.6 18.6 12.2 18.8 C16.0 19.0 19.2 19.6 21.6 20.4 L21.6 21.2 C19.0 20.4 15.8 19.9 12.2 19.7 C8.6 19.5 5.4 19.7 2.6 20.2 Z"],
      ["rockShade", "M4.2 15.2 C5.6 15.9 6.6 16.7 7.2 17.6 L5.4 17.8 C5.0 16.9 4.4 16.1 3.6 15.4 Z M19.4 15.8 C20.4 16.4 21.2 17.2 21.8 18.2 L19.8 18.4 C19.4 17.6 18.9 16.9 18.2 16.4 Z"],
      ["marble", "M12 2.6 L21.2 8.0 L2.8 8.0 Z"],
      ["marbleShade", "M12 2.6 L21.2 8.0 L12 8.0 Z"],
      ["marbleLight", "M12 2.6 L13.0 3.2 L4.6 8.0 L2.8 8.0 Z"],
      ["marbleShade", "M12 4.6 L17.6 7.9 L6.4 7.9 Z"],
      ["marble", "M3.4 8.0 L20.6 8.0 L20.6 9.6 L3.4 9.6 Z"],
      ["marbleLight", "M3.4 8.0 L20.6 8.0 L20.6 8.6 L3.4 8.6 Z"],
      ["marble", "M4.8 9.6 L6.5 9.6 L6.5 14.2 L4.8 14.2 Z M7.98 9.6 L9.67 9.6 L9.67 14.2 L7.98 14.2 Z M11.15 9.6 L12.85 9.6 L12.85 14.2 L11.15 14.2 Z M14.33 9.6 L16.02 9.6 L16.02 14.2 L14.33 14.2 Z M17.5 9.6 L19.2 9.6 L19.2 14.2 L17.5 14.2 Z"],
      ["marbleLight", "M4.8 9.6 L5.3 9.6 L5.3 14.2 L4.8 14.2 Z M7.98 9.6 L8.48 9.6 L8.48 14.2 L7.98 14.2 Z M11.15 9.6 L11.65 9.6 L11.65 14.2 L11.15 14.2 Z M14.33 9.6 L14.83 9.6 L14.83 14.2 L14.33 14.2 Z M17.5 9.6 L18 9.6 L18 14.2 L17.5 14.2 Z"],
      ["marbleShade", "M6 9.6 L6.5 9.6 L6.5 14.2 L6 14.2 Z M9.17 9.6 L9.67 9.6 L9.67 14.2 L9.17 14.2 Z M12.35 9.6 L12.85 9.6 L12.85 14.2 L12.35 14.2 Z M15.52 9.6 L16.02 9.6 L16.02 14.2 L15.52 14.2 Z M18.7 9.6 L19.2 9.6 L19.2 14.2 L18.7 14.2 Z"],
      ["marble", "M3.6 14.2 L20.4 14.2 L20.4 15.6 L3.6 15.6 Z"],
      ["marbleShade", "M3.6 15.0 L20.4 15.0 L20.4 15.6 L3.6 15.6 Z"],
    ],

    // κιονόκρανον Ἰωνικόν — the Ionic capital, which the pack was missing
    // between the plain Doric one and the leafy Corinthian. It is two volutes
    // and a cushion; drawn without the spirals it is Doric again.
    capitalIonike: [
      ["marble", "M2.6 3.2 L21.4 3.2 L21.4 5.4 L2.6 5.4 Z"],
      ["marbleLight", "M2.6 3.2 L21.4 3.2 L21.4 3.9 L2.6 3.9 Z"],
      ["marbleShade", "M12 3.2 L21.4 3.2 L21.4 5.4 L12 5.4 Z"],
      ["marble", "M6.6 5.4 L17.4 5.4 L17.4 10.4 L6.6 10.4 Z"],
      ["marbleShade", "M12 5.4 L17.4 5.4 L17.4 10.4 L12 10.4 Z"],
      ["marbleShade", "M8.4 6.2 C9.4 7.2 10.0 8.4 10.2 9.8 L9.4 9.8 C9.2 8.6 8.7 7.6 7.9 6.8 Z M15.6 6.2 C14.6 7.2 14.0 8.4 13.8 9.8 L14.6 9.8 C14.8 8.6 15.3 7.6 16.1 6.8 Z"],
      ["marble", "M2.4 8.0 A4.0 4.0 0 1 0 10.4 8.0 A4.0 4.0 0 1 0 2.4 8.0 Z M13.6 8.0 A4.0 4.0 0 1 0 21.6 8.0 A4.0 4.0 0 1 0 13.6 8.0 Z"],
      ["marbleShade", "M2.4 8.0 A4.0 4.0 0 1 0 10.4 8.0 A4.0 4.0 0 1 0 2.4 8.0 Z M3.6 8.0 A2.8 2.8 0 1 0 9.2 8.0 A2.8 2.8 0 1 0 3.6 8.0 Z M13.6 8.0 A4.0 4.0 0 1 0 21.6 8.0 A4.0 4.0 0 1 0 13.6 8.0 Z M14.8 8.0 A2.8 2.8 0 1 0 20.4 8.0 A2.8 2.8 0 1 0 14.8 8.0 Z"],
      ["marbleShade", "M4.6 8.0 A1.8 1.8 0 1 0 8.2 8.0 A1.8 1.8 0 1 0 4.6 8.0 Z M5.6 8.0 A0.8 0.8 0 1 0 7.2 8.0 A0.8 0.8 0 1 0 5.6 8.0 Z M15.8 8.0 A1.8 1.8 0 1 0 19.4 8.0 A1.8 1.8 0 1 0 15.8 8.0 Z M16.8 8.0 A0.8 0.8 0 1 0 18.4 8.0 A0.8 0.8 0 1 0 16.8 8.0 Z"],
      ["marbleLight", "M3.4 6.0 C4.3 4.9 5.7 4.4 7.0 4.5 L6.9 5.4 C5.8 5.4 4.8 5.8 4.1 6.6 Z"],
      ["marble", "M8.0 10.4 L16.0 10.4 L16.0 11.6 L8.0 11.6 Z"],
      ["marbleShade", "M12 10.4 L16.0 10.4 L16.0 11.6 L12 11.6 Z"],
      ["marble", "M8.4 11.6 L15.6 11.6 L15.6 22.4 L8.4 22.4 Z"],
      ["marbleShade", "M12 11.6 L15.6 11.6 L15.6 22.4 L12 22.4 Z"],
      ["marbleShade", "M8.6 11.4 L9.3 11.4 L9.3 22.2 L8.6 22.2 Z M10.63 11.4 L11.33 11.4 L11.33 22.2 L10.63 22.2 Z M12.67 11.4 L13.37 11.4 L13.37 22.2 L12.67 22.2 Z M14.7 11.4 L15.4 11.4 L15.4 22.2 L14.7 22.2 Z"],
      ["marbleLight", "M8.4 11.6 L9.0 11.6 L9.0 22.4 L8.4 22.4 Z"],
    ],

    // The gods are drawn full-face, on the same construction the masks and
    // Medusa already use here — brow, two eyes, the nose as a shadow, the mouth
    // as a curve. A three-quarter profile like the reference draws has one eye,
    // and one eye at 17px is a smudge.
    //
    // None of them is told apart by the face. It is the attribute that does it,
    // so the attribute is drawn first and given room: the bolt and the trident
    // push the head off centre rather than being tucked in beside it.

    // Ποσειδῶν — the same old man as Zeus, told apart by what he is holding.
    // The beard is combed to a point and shaded toward the sea rather than the
    // grey Zeus keeps, because the two of them side by side must not be one.
    poseidon: [
      ["flesh", "M10.2 12.6 C11.0 12.6 11.3 13.4 11.3 14.4 C14.4 15.0 16.4 17.4 16.4 21.0 L16.4 23.6 L4.0 23.6 L4.0 21.0 C4.0 17.4 6.0 15.0 9.1 14.4 C9.1 13.4 9.4 12.6 10.2 12.6 Z"],
      ["sea", "M9.1 14.4 C6.0 15.0 4.0 17.4 4.0 21.0 L4.0 23.6 L16.4 23.6 L16.4 21.0 C16.4 17.4 14.4 15.0 11.3 14.4 C11.3 16.2 9.1 16.2 9.1 14.4 Z"],
      ["glaze", "M11.3 14.4 C14.4 15.0 16.4 17.4 16.4 21.0 L16.4 23.6 L13.6 23.6 L13.6 20.6 C13.6 17.6 12.8 15.6 11.3 15.2 Z"],
      ["silver", "M10.2 1.6 C14.3 1.6 16.4 4.4 16.4 8.6 C16.4 10.0 16.2 11.4 15.8 12.6 L13.6 11.8 C13.9 10.8 14.0 9.6 14.0 8.4 C14.0 6.4 12.8 5.4 10.2 5.4 C7.6 5.4 6.4 6.4 6.4 8.4 C6.4 9.6 6.5 10.8 6.8 11.8 L4.6 12.6 C4.2 11.4 4.0 10.0 4.0 8.6 C4.0 4.4 6.1 1.6 10.2 1.6 Z"],
      ["silverDark", "M14.0 8.4 C14.0 9.8 13.9 11.0 13.6 11.8 L15.8 12.6 C16.2 11.4 16.4 10.0 16.4 8.6 C16.4 5.6 15.3 3.4 13.2 2.3 C14.4 3.8 14.0 6.2 14.0 8.4 Z"],
      ["flesh", "M10.2 3.6 C12.43 3.6 14.02 5.4 14.02 8.2 C14.02 12.02 12.29 14.97 10.2 14.97 C8.11 14.97 6.38 12.02 6.38 8.2 C6.38 5.4 7.97 3.6 10.2 3.6 Z"],
      ["fleshShade", "M10.2 3.6 C12.43 3.6 14.02 5.4 14.02 8.2 C14.02 12.02 12.29 14.97 10.2 14.97 Z"],
      ["silver", "M6.0 4.6 C7.2 3.2 8.6 2.6 10.2 2.6 C11.8 2.6 13.2 3.2 14.4 4.6 L14.4 6.2 C13.6 5.4 13.0 5.6 12.4 6.0 C11.9 5.2 11.3 4.9 10.2 4.9 C9.1 4.9 8.5 5.2 8.0 6.0 C7.4 5.6 6.8 5.4 6.0 6.2 Z"],
      ["silverDark", "M7.25 7.34 C7.75 6.62 8.69 6.48 9.34 6.91 L9.12 7.48 C8.62 7.2 8.04 7.27 7.68 7.77 Z M13.15 7.34 C12.65 6.62 11.71 6.48 11.06 6.91 L11.28 7.48 C11.78 7.2 12.36 7.27 12.72 7.77 Z"],
      ["fleshLight", "M7.18 8.71 C7.75 7.92 9.05 7.92 9.62 8.71 C9.05 9.5 7.75 9.5 7.18 8.71 Z M10.78 8.71 C11.35 7.92 12.65 7.92 13.22 8.71 C12.65 9.5 11.35 9.5 10.78 8.71 Z"],
      ["sea", "M7.79 8.71 A0.61 0.61 0 1 0 9.01 8.71 A0.61 0.61 0 1 0 7.79 8.71 Z M11.39 8.71 A0.61 0.61 0 1 0 12.61 8.71 A0.61 0.61 0 1 0 11.39 8.71 Z"],
      ["glaze", "M8.11 8.71 A0.29 0.29 0 1 0 8.69 8.71 A0.29 0.29 0 1 0 8.11 8.71 Z M11.71 8.71 A0.29 0.29 0 1 0 12.29 8.71 A0.29 0.29 0 1 0 11.71 8.71 Z"],
      ["fleshShade", "M9.77 9.21 L10.63 9.21 L10.88 11.23 C10.88 11.66 9.52 11.66 9.52 11.23 Z"],
      ["silver", "M7.2 11.4 C6.6 15.8 7.6 19.4 9.4 21.8 C9.8 22.4 10.6 22.4 11.0 21.8 C12.8 19.4 13.8 15.8 13.2 11.4 C13.2 13.6 12.2 14.6 10.2 14.6 C8.2 14.6 7.2 13.6 7.2 11.4 Z"],
      ["silverDark", "M13.2 11.4 C13.8 15.8 12.8 19.4 11.0 21.8 C10.8 22.1 10.5 22.2 10.2 22.3 C11.6 20.0 12.5 16.8 12.7 13.0 C12.9 13.5 13.1 12.8 13.2 11.4 Z"],
      ["silver", "M8.0 11.2 C8.6 10.7 9.4 10.6 10.2 10.9 C11.0 10.6 11.8 10.7 12.4 11.2 C11.8 12.2 11.0 12.5 10.2 12.2 C9.4 12.5 8.6 12.2 8.0 11.2 Z"],
      ["bronze", "M19.0 6.0 L20.4 6.0 L20.4 22.6 L19.0 22.6 Z"],
      ["bronzeDark", "M19.7 6.0 L20.4 6.0 L20.4 22.6 L19.7 22.6 Z"],
      ["bronze", "M16.4 6.6 L17.6 6.6 L17.6 2.4 L17.0 0.6 L16.4 2.4 Z M19.1 6.6 L20.3 6.6 L20.3 1.8 L19.7 0.0 L19.1 1.8 Z M21.8 6.6 L23.0 6.6 L23.0 2.4 L22.4 0.6 L21.8 2.4 Z"],
      ["bronze", "M15.8 5.6 L23.6 5.6 L23.6 7.2 L15.8 7.2 Z"],
      ["bronzeLight", "M15.8 5.6 L23.6 5.6 L23.6 6.1 L15.8 6.1 Z"],
      ["bronzeDark", "M15.8 6.7 L23.6 6.7 L23.6 7.2 L15.8 7.2 Z"],
      ["gold", "M18.8 12.4 L20.6 12.4 L20.6 14.0 L18.8 14.0 Z"],
    ],
  },

  /**
   * One burst draws from exactly one of these groups.
   *
   * A group of one is a burst of that shape alone; a group of more is a kit,
   * and a burst holding all of it reads as one idea rather than three — the
   * shield with the spear and the helmet, the two masks, Poseidon with the
   * ships he owns, the crown with the column and the lyre.
   *
   * The choice is uniform over groups rather than over shapes, so a shape in
   * two groups shows up twice as often. That is the point of listing the
   * column alone as well as under the crown.
   */
  throws: [
    ["omega"],
    ["aspis", "doru", "korys"],
    ["kranos", "sarissa", "toxon"],
    ["keraunos"],
    ["keraunos", "capital"],
    ["stephanos", "capital", "lyre3"],
    ["capitalIonike"],
    ["amphora3"],
    ["lyre3", "kithara"],
    ["capital", "lyre"],
    ["capital"],
    ["tragikon2", "komikon2"],
    ["poseidon", "trireme"],
    ["prora"],
    ["poseidon", "prora"],
    ["poseidon", "prora", "trireme"],
    ["akropolis"],
    ["capital3"],
    ["amphora"],
    ["trireme"],
  ],
};
