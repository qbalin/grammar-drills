/**
 * Lane's citations, in words a reader can use.
 *
 * The sibling of `gen/sources.mjs`, which does the same job for Allen &
 * Greenough, and it exists separately because Lane's convention is not A&G's.
 * A&G prints one string — `(Fam. 5.1)` — that a single table can key on. Lane
 * prints a *typographic* distinction, and the whole expansion turns on it.
 *
 * --- the rule Lane states about itself, at §2745 ------------------------------
 *
 * > Roman letters are used in the abbreviations of the names of authors,
 * > *italics* in the abbreviations of the names of their works.
 *
 * That is load-bearing, because the two sets collide head-on. `V.` in roman is
 * Vergil and `V.` in italic is Cicero's *in Verrem*; `L.` is Livy or Cicero's
 * *Laelius*; `O.` is Ovid or Cicero's *Orator*; `Pl.`, `T.`, `E.`, `C.`, `D.`,
 * `G.`, `A.`, `Ph.` all mean two different things depending on the face they are
 * set in. Nine of Lane's commonest heads are ambiguous on their letters alone,
 * so a table keyed on the string — which is what `gen/sources.mjs` is — would
 * misattribute them silently, in exactly the way `REVIEW.md` records Bennett's
 * index misattributing its examples.
 *
 * So the citation reaching this module carries the distinction, written the way
 * Project Gutenberg's own plain-text edition writes it: `_Ph._ 11, 16` is
 * italic, `J. 14, 59` is roman. `lane-quotes.mjs` reconstructs that from the
 * HTML's `<i>` runs, which is the reason it reads the HTML edition and not the
 * text one.
 *
 * --- the three defaults Lane declares -----------------------------------------
 *
 * §2742  Figures alone are Caesar, *de Bello Gallico*: `1, 14, 7`.
 * §2743  An italic work with no roman author before it is CICERO — the same
 *        convention A&G follows and `gen/sources.mjs` documents at length.
 * §2744  Four authors, followed by figures alone, mean their principal work:
 *        V. the *Aeneid*, H. the *Odes*, O. the *Metamorphoses*, Ta. the
 *        *Annals*.
 *
 * --- how the names are spelled ------------------------------------------------
 *
 * Author names match `CLASSICAL` in `scripts/lib/quotes.mjs:58-99` exactly, and
 * work titles reuse `gen/sources.mjs`'s spellings wherever the two books cite
 * the same work, so that one sentence arriving from Lane and from A&G is
 * credited in identical words. `Titus Livius`, not `Livy`.
 *
 * An author this table does not name returns null and the example is dropped.
 * Cornificius, Lucilius and Macrobius are in Lane's list and deliberately absent
 * from this one: they are not in `CLASSICAL`, so a quotation credited to them
 * could not be reconciled with the other pools.
 */

const CICERO = "Cicero";

/**
 * Cicero's works, which Lane cites in italics with no author before them.
 *
 * Lane's own list, §2745. Where A&G cites the same work, the title is spelled as
 * `gen/sources.mjs` spells it rather than as Lane's Latin heading gives it.
 */
const CICERO_WORKS = {
  "Ac.": "Academica",
  "ad Br.": "Epistulae ad Brutum",
  "Agr.": "De Lege Agraria",
  "Arch.": "Pro Archia",
  "Att.": "Epistulae ad Atticum",
  "Balb.": "Pro Balbo",
  "Br.": "Brutus",
  "C.": "In Catilinam",
  "Caec.": "Pro Caecina",
  "Caecil.": "Divinatio in Caecilium",
  "Cael.": "Pro Caelio",
  "CM.": "Cato Maior de Senectute",
  "Clu.": "Pro Cluentio",
  "D.": "Pro Rege Deiotaro",
  "Div.": "De Divinatione",
  "DN.": "De Natura Deorum",
  "DO.": "De Oratore",
  "Fam.": "Epistulae ad Familiares",
  "Fat.": "De Fato",
  "Fin.": "De Finibus Bonorum et Malorum",
  "Fl.": "Pro Flacco",
  "Flacc.": "Pro Flacco",
  "HR.": "De Haruspicum Responsis",
  // Lane's title is `dē Imperiō Pompēī`; A&G calls the same speech Pro Lege
  // Manilia, and that is the spelling the other pool already ships.
  "IP.": "Pro Lege Manilia",
  "Inv.": "De Inventione",
  "L.": "Laelius de Amicitia",
  "LAgr.": "De Lege Agraria",
  "Leg.": "De Legibus",
  "Lig.": "Pro Ligario",
  "Marc.": "Pro Marcello",
  "Mil.": "Pro Milone",
  "Mur.": "Pro Murena",
  "O.": "Orator",
  "Off.": "De Officiis",
  "OG.": "De Optimo Genere Oratorum",
  "OP.": "Partitiones Oratoriae",
  "Par.": "Paradoxa Stoicorum",
  "PC.": "De Provinciis Consularibus",
  "Ph.": "Philippicae",
  "Pis.": "In Pisonem",
  "Pl.": "Pro Plancio",
  "Planc.": "Pro Plancio",
  "Q.": "Pro Quinctio",
  "Quint.": "Pro Quinctio",
  "QFr.": "Epistulae ad Quintum Fratrem",
  "RA.": "Pro Sexto Roscio Amerino",
  "RC.": "Pro Roscio Comoedo",
  "RP.": "De Re Publica",
  "Rab.": "Pro Rabirio Perduellionis Reo",
  "RabP.": "Pro Rabirio Postumo",
  "Scaur.": "Pro Scauro",
  "Sest.": "Pro Sestio",
  "Sull.": "Pro Sulla",
  "T.": "Topica",
  "Top.": "Topica",
  "TD.": "Tusculanae Disputationes",
  "Tim.": "Timaeus",
  "Tul.": "Pro Tullio",
  "V. a. pr.": "In Verrem",
  "V.": "In Verrem",
};

/**
 * The authors Lane abbreviates in roman, with the works they take in italics.
 *
 * `fallback` is the work a bare author plus figures means. It is set only where
 * Lane says so — §2744's four, and the authors whose surviving work is single —
 * and left undefined everywhere else, so `S. 4, 1` is dropped rather than filed
 * under a guess about which of Sallust's two monographs was meant.
 */
const AUTHORS = {
  "Caes.": {
    author: "Julius Caesar",
    // §2742: figures alone are the Gallic War, so `Caes.` with no work is it too.
    fallback: "Commentarii de bello Gallico",
    works: { "C.": "Commentarii de bello Civili" },
  },
  "Cat.": { author: "Catullus", fallback: "Carmina", works: {} },
  "E.": { author: "Ennius", fallback: "Fragmenta", works: {} },
  "Fest.": {
    author: "Sextus Pompeius Festus",
    fallback: "De Verborum Significatu",
    works: {},
  },
  "Gell.": { author: "Aulus Gellius", fallback: "Noctes Atticae", works: {} },
  "H.": {
    author: "Horatius",
    fallback: "Carmina", // §2744
    works: {
      "AP.": "Ars Poetica",
      "E.": "Epistulae",
      "Epod.": "Epodi",
      "S.": "Sermones",
    },
  },
  "J.": { author: "Juvenalis", fallback: "Saturae", works: {} },
  "L.": { author: "Titus Livius", fallback: "Ab Urbe Condita", works: {} },
  "Lucr.": { author: "Lucretius", fallback: "De Rerum Natura", works: {} },
  "Mart.": { author: "Martialis", fallback: "Epigrammata", works: {} },
  // Lane cites Nepos as life-number, chapter, section — `N. 15, 8, 2` is the
  // fifteenth life. The number is kept in the locus; naming the individual life
  // would mean numbering them here, which is a second claim to get wrong.
  "N.": { author: "Nepos", fallback: "Vitae", works: {} },
  "O.": {
    author: "Ovidius",
    fallback: "Metamorphoses", // §2744
    works: { "A.": "Amores", "AA.": "Ars Amatoria", "F.": "Fasti", "Tr.": "Tristia" },
  },
  "Pl.": {
    author: "Plautus",
    works: {
      "Am.": "Amphitruo",
      "As.": "Asinaria",
      "Aul.": "Aulularia",
      "B.": "Bacchides",
      "Cap.": "Captivi",
      "Cas.": "Casina",
      "Cist.": "Cistellaria",
      "Cu.": "Curculio",
      "Cur.": "Curculio",
      "E.": "Epidicus",
      "Men.": "Menaechmi",
      "Mer.": "Mercator",
      "MG.": "Miles Gloriosus",
      "Most.": "Mostellaria",
      "Per.": "Persa",
      "Poen.": "Poenulus",
      "Ps.": "Pseudolus",
      "R.": "Rudens",
      "St.": "Stichus",
      "Tri.": "Trinummus",
      "Tru.": "Truculentus",
      "Vid.": "Vidularia",
    },
  },
  // Lane's list gives these as one head each — `Plin. Ep.`, `Plin. NH.` — and
  // they are two different people, so the work is what picks the author.
  "Plin.": {
    author: "Plinius Minor",
    works: { "Ep.": "Epistulae", "NH.": "Naturalis Historia" },
    authorByWork: { "NH.": "Plinius Maior" },
  },
  "Prop.": { author: "Propertius", fallback: "Elegiae", works: {} },
  "Publil. Syr.": { author: "Publilius Syrus", fallback: "Sententiae", works: {} },
  "Quint.": { author: "Quintilianus", fallback: "Institutio Oratoria", works: {} },
  "Quintil.": { author: "Quintilianus", fallback: "Institutio Oratoria", works: {} },
  "S.": {
    author: "Gaius Sallustius Crispus",
    works: { "C.": "Bellum Catilinae", "I.": "Bellum Iugurthinum" },
  },
  "Sen.": {
    author: "Seneca Minor",
    works: { "Ben.": "De Beneficiis", "Ep.": "Epistulae Morales ad Lucilium" },
  },
  "St.": { author: "Statius", fallback: "Thebais", works: { "Th.": "Thebais" } },
  "Suet.": {
    author: "Suetonius",
    // A&G files every life under the collection and this follows it, so the two
    // pools agree; which life it was survives in the head, not the work.
    works: {
      "Aug.": "De Vita Caesarum",
      "Cal.": "De Vita Caesarum",
      "Cl.": "De Vita Caesarum",
      "Galb.": "De Vita Caesarum",
      "Iul.": "De Vita Caesarum",
      "Tib.": "De Vita Caesarum",
    },
  },
  "T.": {
    author: "Publius Terentius Afer",
    works: {
      "Ad.": "Adelphoe",
      "Andr.": "Andria",
      "Eu.": "Eunuchus",
      "Hau.": "Heauton Timorumenos",
      "Hec.": "Hecyra",
      "Ph.": "Phormio",
    },
  },
  "Ta.": {
    author: "Tacitus",
    fallback: "Annales", // §2744
    works: {
      "A.": "Agricola",
      "Agr.": "Agricola",
      "D.": "Dialogus de Oratoribus",
      "G.": "Germania",
      "H.": "Historiae",
    },
  },
  "Tib.": { author: "Tibullus", fallback: "Elegiae", works: {} },
  "V.": {
    author: "Vergilius",
    fallback: "Aeneis", // §2744
    works: { "E.": "Eclogae", "G.": "Georgica" },
  },
};

/*
 * In Lane's list and deliberately not here, so a later reader does not add them
 * back as an oversight. Each returns null and its example is dropped:
 *
 *   Corn., Cornif.   Cornificius — the Rhetorica ad Herennium, anonymous and
 *                    not Cicero's, and not in CLASSICAL.
 *   Lucil.           Lucilius: fragments, and not in CLASSICAL.
 *   Macrob. Sat.     Macrobius, fifth century. Correct Latin, not the Latin
 *                    this pack teaches — the same call `lib/quotes.mjs` makes
 *                    about Kepler and the entomologists.
 *   S. Fr. Lep.,     Sallust's speeches and letters preserved as fragments of
 *   S. Fr. Phil.     the Histories. The locus does not name a text anyone holds.
 *
 * Part First (§2740) cites `Plaut.`, `Ter.`, `Cic.`, `Verg.`, `Hor.` with no
 * locus at all. Those are not here either, and they never reach this function:
 * `lane-quotes.mjs` requires a digit in the citation, so a bare `(Plaut.)` is
 * dropped upstream as uncited.
 */

/**
 * Verse and the stage.
 *
 * The same set, and the same reason, as `VERSE` in `scripts/lib/quotes.mjs:109`
 * and `VERSE_AUTHORS` in `gen/sources.mjs:227`: word order in hexameter or in
 * stage dialogue is not the model answer a student translating prose should be
 * shown. A flag on the expansion, not a filter — the caller decides.
 */
const VERSE_AUTHORS = new Set([
  "Vergilius",
  "Horatius",
  "Ovidius",
  "Lucretius",
  "Propertius",
  "Juvenalis",
  "Martialis",
  "Catullus",
  "Publilius Syrus",
  "Plautus",
  "Publius Terentius Afer",
  "Statius",
  "Tibullus",
  "Ennius",
]);

/** One leading italic run: `_ad Br._ 15` → `ad Br.`. */
const ITALIC = /^_([^_]+)_\s*/;

/**
 * The author heads, longest first, so a prefix never wins over the whole.
 *
 * `Quintil.` must not be read as `Quint.` plus a stray `il.`, and `Publil. Syr.`
 * must be tried before anything shorter that opens the same way.
 */
const AUTHOR_KEYS = Object.keys(AUTHORS).sort((a, b) => b.length - a.length);

/**
 * How many chapters each book of *de Bello Gallico* actually has.
 *
 * This is a guard on §2742, and it was put here because the rule caught a real
 * misattribution rather than because one was imagined. Lane §1666 prints
 *
 *     Of all the Latin writers, Tacitus aims most at variety ...: as,
 *     <b>rēgem Rhamsēn ... potītum</b>, 2, 60, <i>that king Rhamses ...</i>
 *
 * — bare figures, which §2742 says are Caesar's. They are not. That is Tacitus,
 * *Annals* 2.60, and Lane is leaning on the sentence it just wrote rather than
 * on its own stated convention. Filed as printed it credited a sentence of
 * Tacitus to Caesar, and every automated check in this tree would have passed
 * it: the Latin is real, the Latin is attested, the citation parses, and
 * `verify-attribution` files the miss under the harmless `not-found`. It was
 * corroboration against the corpus that found it, which is the whole lesson
 * `REVIEW.md` draws from Bennett's index.
 *
 * The cheap deterministic half of the fix: book 2 of the Gallic War has 35
 * chapters, so `2, 60` is not a locus in it and cannot be filed under it. A
 * citation this rejects is dropped, not guessed at.
 *
 * Counts are the standard divisions of the received text, books I-VIII.
 */
const BG_CHAPTERS = [54, 35, 29, 38, 58, 44, 90, 55];

/** Is this locus a place that exists in de Bello Gallico? */
function inGallicWar(locus) {
  const figures = locus.match(/\d+/g)?.map(Number) ?? [];
  if (!figures.length) return false;
  const [book, chapter] = figures;
  if (!(book >= 1 && book <= BG_CHAPTERS.length)) return false;
  if (chapter !== undefined && chapter > BG_CHAPTERS[book - 1]) return false;
  return true;
}

/**
 * Split a Lane citation into author, work and locus.
 *
 * The citation arrives with italics marked as Project Gutenberg's plain-text
 * edition marks them — `_Ph._ 11, 16`, `Pl. _Most._ 563`, `J. 14, 59` — because
 * that distinction is the only thing separating Vergil from *in Verrem*.
 *
 * Reads left to right: an optional roman author head, an optional italic work,
 * then the figures. Returns null for anything this cannot name, so the caller
 * drops the example rather than shipping a confident-looking half-expansion.
 */
export function expandRef(ref) {
  /*
   * The separator between the quotation and its citation comes in with it.
   *
   * Lane sets `<b>tū mē amās, ego tē amō</b>, Pl. <i>Most.</i> 305, <i>...`, so
   * the extractor hands over `, Pl. _Most._ 305,` — leading comma and all. Left
   * on, that comma is the first whitespace-separated part, no author head
   * matches at position 0, and every citation that names an author or a work
   * falls through to the locus check and is dropped. Only the bare-figure ones
   * survived, which is why the first run of this came out 92% Caesar.
   */
  const raw = String(ref ?? "")
    .trim()
    .replace(/^[\s,;:]+/, "")
    .replace(/[\s,;:]+$/, "");
  if (!raw) return null;

  /*
   * Peeled off the string rather than off whitespace-separated tokens, because
   * both heads can contain a space. `Publil. Syr.` is a two-word author and
   * `_ad Br._`, `_V. a. pr._`, `_Fr. Lep._` are multi-word works that Lane sets
   * as ONE italic run — so the extractor hands over `_ad Br._ 15`, which splits
   * into `_ad` and `Br._`, neither of which is a marked run. Matching on tokens
   * dropped every multi-word work as an unnamed head.
   */
  let rest = raw;
  const roman = [];
  for (const key of AUTHOR_KEYS) {
    if (!rest.startsWith(key)) continue;
    // A head has to end where it ends: `Pl.` must not match inside `Plin.`.
    const after = rest[key.length];
    if (after !== undefined && !/[\s_]/.test(after)) continue;
    roman.push(key);
    rest = rest.slice(key.length).trim();
    break;
  }
  const italic = [];
  for (;;) {
    const run = ITALIC.exec(rest);
    if (!run) break;
    italic.push(run[1].trim());
    rest = rest.slice(run[0].length).trim();
  }
  const locus = rest.replace(/^[,\s]+|[,.\s]+$/g, "").trim();
  // A locus is required. Lane cites a bare author for a form rather than for a
  // sentence, and a quotation nobody can look up is not one this pack ships.
  if (!/\d/.test(locus)) return null;
  /*
   * And the locus must be figures, not a head this table failed to recognise.
   *
   * Without this, an abbreviation absent from the tables above leaves its own
   * letters sitting in the locus, the roman head comes back empty, and the
   * §2742 default files the quotation under Caesar. `Macrob. _Sat._ 1` came out
   * as *de Bello Gallico* "Macrob. Sat. 1" — a real author's sentence credited
   * to a different real author, with a locus that looks almost plausible. That
   * is the Bennett-index failure in miniature, and no gate downstream could see
   * it: the Latin attests, the citation parses, `verify-attribution` files the
   * miss under the harmless `not-found`. An unnamed head is dropped.
   */
  if (/[A-Za-z]/.test(locus)) return null;

  const workKey = italic.join(" ");

  if (!roman.length) {
    // §2743. An italic work with no author before it is Cicero's.
    if (!workKey) {
      // §2742. Figures alone are Caesar's Gallic War — if they are a place in it.
      return inGallicWar(locus)
        ? named("Julius Caesar", "Commentarii de bello Gallico", locus)
        : null;
    }
    const work = CICERO_WORKS[workKey];
    return work ? named(CICERO, work, locus) : null;
  }

  const entry = AUTHORS[roman[0]];
  if (!workKey) {
    // §2744, and the single-work authors.
    return entry.fallback ? named(entry.author, entry.fallback, locus) : null;
  }
  const work = entry.works[workKey];
  if (!work) return null;
  const author = entry.authorByWork?.[workKey] ?? entry.author;
  return named(author, work, locus);
}

function named(author, work, locus) {
  return {
    author,
    work,
    ...(locus ? { locus } : {}),
    verse: VERSE_AUTHORS.has(author),
  };
}

export { AUTHORS, CICERO_WORKS, VERSE_AUTHORS };
