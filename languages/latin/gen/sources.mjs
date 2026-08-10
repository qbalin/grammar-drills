/**
 * Allen & Greenough's citations, in words a reader can use.
 *
 * A&G prints its locus as a bare parenthesis after the example — `(Fam. 5.1)`,
 * `(B. G. 4.17)` — which is unambiguous to a classicist and useless to a
 * student. This turns the head of that string into "Cicero, *Epistulae ad
 * Familiares*".
 *
 * The Latin sibling of `languages/ancient-greek/gen/sources.mjs`, and the same
 * kind of object: a table of the heads that actually occur rather than a
 * general parser of classical abbreviations. There are 145 of them across A&G's
 * cited examples; a head this table cannot name returns null, because a guessed
 * expansion is worse than a dropped example.
 *
 * --- the one rule that has to be stated, because it is invisible --------------
 *
 * **A bare work is Cicero.** A&G writes `Fam.`, `Tusc.`, `Off.`, `Verr.` with no
 * author, and names the author for everyone else. This is not an inference from
 * how the abbreviations look; it is what the book does. Across its 1,656 cited
 * examples:
 *
 *     Fam.        130        Cic. Fam.      0
 *     Tusc.        74        Cic. Tusc.     0
 *     Off.         35        Cic. Off.      0
 *     Sall. Cat.   29        Cic.           0
 *
 * Every bare head below is therefore filed under Cicero deliberately, and the
 * author-qualified ones — `Sall.`, `Tac.`, `Nep.`, `Hor.`, `Pl.` — are the
 * book's own way of saying "not Cicero".
 *
 * --- how the names are spelled ------------------------------------------------
 *
 * Author names match `CLASSICAL` in `scripts/lib/quotes.mjs:58-99` exactly, so
 * that a sentence reaching the pack from A&G and the same sentence reaching it
 * from the dictionary dump are credited to the same person in the same words.
 * `Titus Livius`, not `Livy`; `Julius Caesar`, not `Caesar`.
 *
 * Work titles are spelled so `scripts/verify-attribution.mjs` can join them onto
 * `reference/texts/<author>-<work>.txt`: it intersects the author's slug tokens
 * with the filename's author stem (`:169-173`) and matches five-character stems
 * of the work title (`:190-198`).
 *
 * The pairs are `head -> [author, work]`.
 */

const CICERO = "Cicero";

const SOURCES = {
  // --- Cicero, whom A&G cites without naming ---
  // Letters.
  "Fam.": [CICERO, "Epistulae ad Familiares"],
  "Att.": [CICERO, "Epistulae ad Atticum"],
  "Q. Fr.": [CICERO, "Epistulae ad Quintum Fratrem"],
  // Speeches.
  "Verr.": [CICERO, "In Verrem"],
  "Cat.": [CICERO, "In Catilinam"],
  "Phil.": [CICERO, "Philippicae"],
  "Rosc. Am.": [CICERO, "Pro Sexto Roscio Amerino"],
  "Mil.": [CICERO, "Pro Milone"],
  "Manil.": [CICERO, "Pro Lege Manilia"],
  "Clu.": [CICERO, "Pro Cluentio"],
  "Quinct.": [CICERO, "Pro Quinctio"],
  "Arch.": [CICERO, "Pro Archia"],
  "Mur.": [CICERO, "Pro Murena"],
  "Leg. Agr.": [CICERO, "De Lege Agraria"],
  "Flacc.": [CICERO, "Pro Flacco"],
  "Deiot.": [CICERO, "Pro Rege Deiotaro"],
  "Sest.": [CICERO, "Pro Sestio"],
  "Cael.": [CICERO, "Pro Caelio"],
  "Marc.": [CICERO, "Pro Marcello"],
  "Tull.": [CICERO, "Pro Tullio"],
  "Font.": [CICERO, "Pro Fonteio"],
  "Pison.": [CICERO, "In Pisonem"],
  "Rosc. Com.": [CICERO, "Pro Roscio Comoedo"],
  "Caec.": [CICERO, "Pro Caecina"],
  "Sull.": [CICERO, "Pro Sulla"],
  "Vat.": [CICERO, "In Vatinium"],
  "Dom.": [CICERO, "De Domo Sua"],
  "Lig.": [CICERO, "Pro Ligario"],
  "Scaur.": [CICERO, "Pro Scauro"],
  "Rab. Post.": [CICERO, "Pro Rabirio Postumo"],
  "Prov. Cons.": [CICERO, "De Provinciis Consularibus"],
  "Planc.": [CICERO, "Pro Plancio"],
  "Har. Resp.": [CICERO, "De Haruspicum Responsis"],
  // Philosophy and rhetoric.
  "Tusc.": [CICERO, "Tusculanae Disputationes"],
  "Cat. M.": [CICERO, "Cato Maior de Senectute"],
  "Fin.": [CICERO, "De Finibus Bonorum et Malorum"],
  "Lael.": [CICERO, "Laelius de Amicitia"],
  "Off.": [CICERO, "De Officiis"],
  "De Or.": [CICERO, "De Oratore"],
  "N. D.": [CICERO, "De Natura Deorum"],
  "Brut.": [CICERO, "Brutus"],
  "Acad.": [CICERO, "Academica"],
  "Or.": [CICERO, "Orator"],
  "Div.": [CICERO, "De Divinatione"],
  "Legg.": [CICERO, "De Legibus"],
  "Leg.": [CICERO, "De Legibus"],
  "Rep.": [CICERO, "De Re Publica"],
  "Par.": [CICERO, "Paradoxa Stoicorum"],
  "Inv.": [CICERO, "De Inventione"],
  "Fat.": [CICERO, "De Fato"],
  "Top.": [CICERO, "Topica"],
  "Tim.": [CICERO, "Timaeus"],

  // --- Caesar ---
  "B. G.": ["Julius Caesar", "Commentarii de bello Gallico"],
  "B. C.": ["Julius Caesar", "Commentarii de bello Civili"],
  // Set once without its space, in a book that sets it with one 140 times.
  "B.G.": ["Julius Caesar", "Commentarii de bello Gallico"],

  // --- the historians ---
  "Liv.": ["Titus Livius", "Ab Urbe Condita"],
  "Sall. Cat.": ["Gaius Sallustius Crispus", "Bellum Catilinae"],
  "Iug.": ["Gaius Sallustius Crispus", "Bellum Iugurthinum"],
  "Tac. Ann.": ["Tacitus", "Annales"],
  "Tac. H.": ["Tacitus", "Historiae"],
  "Tac. Agr.": ["Tacitus", "Agricola"],
  "Q. C.": ["Curtius Rufus", "Historiae Alexandri Magni"],
  "Vell.": ["Velleius Paterculus", "Historiae Romanae"],
  "Iust.": ["Justinus", "Epitoma Historiarum Philippicarum"],
  "Val. Max.": ["Valerius Maximus", "Facta et Dicta Memorabilia"],
  "Suet. Aug.": ["Suetonius", "De Vita Caesarum"],
  "Suet. Dom.": ["Suetonius", "De Vita Caesarum"],

  // --- Nepos, cited by the life ---
  "Nep. Att.": ["Nepos", "Atticus"],
  "Nep. Eum.": ["Nepos", "Eumenes"],
  "Nep. Ages.": ["Nepos", "Agesilaus"],
  "Nep. Hann.": ["Nepos", "Hannibal"],
  "Nep. Paus.": ["Nepos", "Pausanias"],
  "Nep. Alc.": ["Nepos", "Alcibiades"],
  "Nep. Epam.": ["Nepos", "Epaminondas"],
  "Nep. Dion.": ["Nepos", "Dion"],

  // --- the technical writers ---
  "Plin. Ep.": ["Plinius Minor", "Epistulae"],
  "Plin. H. N.": ["Plinius Maior", "Naturalis Historia"],
  "Plin. N. H.": ["Plinius Maior", "Naturalis Historia"],
  "Quint.": ["Quintilianus", "Institutio Oratoria"],
  "Cato R. R.": ["Marcus Porcius Cato", "De Agri Cultura"],
  "Varr. R. R.": ["Marcus Terentius Varro", "Res Rusticae"],
  "Sen. Ep.": ["Seneca Minor", "Epistulae Morales ad Lucilium"],

  // --- verse: epic and lyric ---
  "Aen.": ["Vergilius", "Aeneis"],
  "Ecl.": ["Vergilius", "Eclogae"],
  "Georg.": ["Vergilius", "Georgica"],
  "Hor. S.": ["Horatius", "Sermones"],
  "Hor. Od.": ["Horatius", "Carmina"],
  "Hor. Ep.": ["Horatius", "Epistulae"],
  "Hor. A. P.": ["Horatius", "Ars Poetica"],
  "Hor. Epod.": ["Horatius", "Epodi"],
  "Ov. M.": ["Ovidius", "Metamorphoses"],
  "Ov. A. A.": ["Ovidius", "Ars Amatoria"],
  "Ov. Tr.": ["Ovidius", "Tristia"],
  "Ov. Fast.": ["Ovidius", "Fasti"],
  "Ov. Am.": ["Ovidius", "Amores"],
  "Ov. H.": ["Ovidius", "Heroides"],
  "Ov. P.": ["Ovidius", "Epistulae ex Ponto"],
  "Lucr.": ["Lucretius", "De Rerum Natura"],
  "Prop.": ["Propertius", "Elegiae"],
  "Iuv.": ["Juvenalis", "Saturae"],
  "Mart.": ["Martialis", "Epigrammata"],
  "Pers.": ["Persius", "Saturae"],
  "Pub. Syr.": ["Publilius Syrus", "Sententiae"],

  // --- verse: the stage ---
  "Ter. And.": ["Publius Terentius Afer", "Andria"],
  "Ter. Ad.": ["Publius Terentius Afer", "Adelphoe"],
  "Ter. Eun.": ["Publius Terentius Afer", "Eunuchus"],
  "Ter. Ph.": ["Publius Terentius Afer", "Phormio"],
  "Ter. Hec.": ["Publius Terentius Afer", "Hecyra"],
  "Ter. Haut.": ["Publius Terentius Afer", "Heauton Timorumenos"],
  "Ter. Heaut.": ["Publius Terentius Afer", "Heauton Timorumenos"],
  "Caecil.": ["Caecilius Statius", "Fragmenta"],
  // A&G abbreviates Plautus both ways, in the same chapter.
  "Pl. Am.": ["Plautus", "Amphitruo"],
  "Pl. Asin.": ["Plautus", "Asinaria"],
  "Pl. Aul.": ["Plautus", "Aulularia"],
  "Pl. Capt.": ["Plautus", "Captivi"],
  "Pl. Cist.": ["Plautus", "Cistellaria"],
  "Pl. Curc.": ["Plautus", "Curculio"],
  "Pl. Men.": ["Plautus", "Menaechmi"],
  "Pl. Merc.": ["Plautus", "Mercator"],
  "Pl. Mil.": ["Plautus", "Miles Gloriosus"],
  "Pl. Most.": ["Plautus", "Mostellaria"],
  "Pl. Per.": ["Plautus", "Persa"],
  "Pl. Pseud.": ["Plautus", "Pseudolus"],
  "Pl. Rud.": ["Plautus", "Rudens"],
  "Pl. Stich.": ["Plautus", "Stichus"],
  "Pl. Trin.": ["Plautus", "Trinummus"],
  "Pl. Truc.": ["Plautus", "Truculentus"],
  "Plaut. Capt.": ["Plautus", "Captivi"],
  "Plaut. Mil.": ["Plautus", "Miles Gloriosus"],
  "Plaut. Most.": ["Plautus", "Mostellaria"],
  "Plaut. Ps.": ["Plautus", "Pseudolus"],
  "Plaut. Rud.": ["Plautus", "Rudens"],
  "Plaut. Trin.": ["Plautus", "Trinummus"],
};

/*
 * Deliberately absent, and why — so that a later reader does not add them back
 * as an oversight. Each returns null and its example is dropped:
 *
 *   Balbus in Att.        a letter by Balbus that Cicero's correspondence
 *   Caesar ap. Cic. Att.  preserves, and Caesar quoted inside a letter. Real
 *                         Latin by a named author, but crediting it to the
 *                         author of the book it survives in would be wrong and
 *                         crediting it to the writer needs a locus in a work
 *                         nobody holds.
 *   B. Al., B. Afr.       the Alexandrian and African wars — the Corpus
 *                         Caesarianum, not Caesar, and anonymous.
 *   S. C. de Bac.         an inscription. No author to credit.
 *   Sall. Ep. Mith.       the letter of Mithridates, spurious.
 *   Gesta Romanorum       medieval, and A&G cites it as a curiosity.
 */

/**
 * Verse and the stage.
 *
 * The same set, and the same reason, as `VERSE` in `scripts/lib/quotes.mjs:109`:
 * word order in hexameter or in stage dialogue is not the model answer a student
 * translating prose should be shown. Kept as a flag on the expansion rather than
 * a filter here, so the caller decides.
 */
const VERSE_AUTHORS = new Set([
  "Vergilius",
  "Horatius",
  "Ovidius",
  "Lucretius",
  "Propertius",
  "Juvenalis",
  "Martialis",
  "Persius",
  "Publilius Syrus",
  "Plautus",
  "Publius Terentius Afer",
  "Caecilius Statius",
]);

/**
 * Split an A&G citation into author, work and locus.
 *
 * The head is every leading whitespace-separated part that does not start with
 * a digit, which is where the work stops and the locus starts in all 145 heads
 * that occur — the same rule Greek's `expandRef` uses, and for the same reason:
 * splitting on the first digit would cut `Phil.` to `Ph`, because `i` and `l`
 * are Roman numerals too.
 *
 * Returns null for a head this table cannot name, so the caller drops the
 * example rather than shipping a confident-looking half-expansion.
 */
export function expandRef(ref) {
  const parts = String(ref ?? "")
    .trim()
    .split(/\s+/);
  const head = [];
  for (const part of parts) {
    if (/^[\d[]/.test(part)) break;
    head.push(part);
  }
  const key = head.join(" ");
  const locus = parts.slice(head.length).join(" ").trim();
  // A&G's compositor drops the stop occasionally — `Brut` for `Brut.` — and the
  // difference is a typo rather than a different work.
  const named = SOURCES[key] ?? SOURCES[`${key}.`];
  if (!named) return null;
  return {
    author: named[0],
    work: named[1],
    ...(locus ? { locus } : {}),
    verse: VERSE_AUTHORS.has(named[0]),
  };
}

export { SOURCES, VERSE_AUTHORS };
