/**
 * Smyth's citations, in words a reader can use.
 *
 * The Alpheios TEI gives every `<bibl>` an `n` attribute holding Perseus's
 * normalized citation — `Xen. Anab. 1.2.3` — which is already unambiguous and
 * already looks-up-able. What it is not is readable: a student meeting
 * `Aeschin. 3.78` under a reference answer has been told the truth and nothing
 * useful. This turns the head of that string into "Aeschines, *Orations*".
 *
 * Deliberately a table of the heads that actually occur rather than a general
 * parser of Perseus abbreviations. There are 86 of them across the pack's
 * examples, all of them here; a citation whose head is not in this table keeps
 * the abbreviation, because a locus a reader must decode is still a locus and
 * a guessed expansion is not.
 *
 * The pairs are `head -> [author, work]`. Where Smyth cites an author with no
 * work — the orators, Thucydides, Herodotus — the first number of the locus is
 * the oration or book, so the work is the collection it belongs to.
 */

const SOURCES = {
  // --- Xenophon ---
  "Xen. Anab.": ["Xenophon", "Anabasis"],
  "Xen. Cyrop.": ["Xenophon", "Cyropaedia"],
  "Xen. Hell.": ["Xenophon", "Hellenica"],
  "Xen. Mem.": ["Xenophon", "Memorabilia"],
  "Xen. Ec.": ["Xenophon", "Oeconomicus"],
  "Xen. Sym.": ["Xenophon", "Symposium"],
  "Xen. Hiero": ["Xenophon", "Hiero"],
  "Xen. Ages.": ["Xenophon", "Agesilaus"],
  "Xen. Apol.": ["Xenophon", "Apology"],
  "Xen. Hunt.": ["Xenophon", "On Hunting"],
  "Xen. Horse.": ["Xenophon", "On Horsemanship"],
  "Xen. Cav.": ["Xenophon", "The Cavalry Commander"],

  // --- Plato ---
  "Plat. Apol.": ["Plato", "Apology"],
  "Plat. Rep.": ["Plato", "Republic"],
  "Plat. Gorg.": ["Plato", "Gorgias"],
  "Plat. Phaedo": ["Plato", "Phaedo"],
  "Plat. Prot.": ["Plato", "Protagoras"],
  "Plat. Laws": ["Plato", "Laws"],
  "Plat. Sym.": ["Plato", "Symposium"],
  "Plat. Phaedrus": ["Plato", "Phaedrus"],
  "Plat. Lach.": ["Plato", "Laches"],
  "Plat. Crito": ["Plato", "Crito"],
  "Plat. Theaet.": ["Plato", "Theaetetus"],
  "Plat. Euthyd.": ["Plato", "Euthydemus"],
  "Plat. Crat.": ["Plato", "Cratylus"],
  "Plat. Charm.": ["Plato", "Charmides"],
  "Plat. Euthyph.": ["Plato", "Euthyphro"],
  "Plat. Menex.": ["Plato", "Menexenus"],
  "Plat. Meno": ["Plato", "Meno"],
  "Plat. Phileb.": ["Plato", "Philebus"],
  "Plat. Hipp. Maj.": ["Plato", "Hippias Major"],
  "Plat. Lysis": ["Plato", "Lysis"],
  "Plat. Soph.": ["Plato", "Sophist"],
  "Plat. Tim.": ["Plato", "Timaeus"],
  "Plat. Stat.": ["Plato", "Statesman"],
  "Plat. Criti.": ["Plato", "Critias"],
  "Plat. Alc.": ["Plato", "Alcibiades"],

  // --- the historians ---
  "Thuc.": ["Thucydides", "History of the Peloponnesian War"],
  "Hdt.": ["Herodotus", "Histories"],

  // --- the orators, cited by oration number ---
  "Dem.": ["Demosthenes", "Orations"],
  "Lys.": ["Lysias", "Orations"],
  "Isoc.": ["Isocrates", "Orations"],
  "Aeschin.": ["Aeschines", "Orations"],
  "Andoc.": ["Andocides", "Orations"],
  "Antiph.": ["Antiphon", "Orations"],
  Isaeus: ["Isaeus", "Orations"],

  // --- epic ---
  "Hom. Il.": ["Homer", "Iliad"],
  "Hom. Od.": ["Homer", "Odyssey"],

  // --- tragedy ---
  "Soph. Ant.": ["Sophocles", "Antigone"],
  "Soph. El.": ["Sophocles", "Electra"],
  "Soph. OC": ["Sophocles", "Oedipus at Colonus"],
  "Soph. OT": ["Sophocles", "Oedipus Tyrannus"],
  "Soph. Phil.": ["Sophocles", "Philoctetes"],
  "Soph. Aj.": ["Sophocles", "Ajax"],
  "Soph. Trach.": ["Sophocles", "Trachiniae"],
  "Aesch. PB": ["Aeschylus", "Prometheus Bound"],
  "Aesch. Ag.": ["Aeschylus", "Agamemnon"],
  "Aesch. Seven": ["Aeschylus", "Seven against Thebes"],
  "Aesch. Eum.": ["Aeschylus", "Eumenides"],
  "Aesch. Supp.": ["Aeschylus", "Suppliants"],
  "Aesch. Lib.": ["Aeschylus", "Libation Bearers"],
  "Eur. Med.": ["Euripides", "Medea"],
  "Eur. Hipp.": ["Euripides", "Hippolytus"],
  "Eur. Hec.": ["Euripides", "Hecuba"],
  "Eur. IT": ["Euripides", "Iphigenia in Tauris"],
  "Eur. Orest.": ["Euripides", "Orestes"],
  "Eur. Andr.": ["Euripides", "Andromache"],
  "Eur. Hel.": ["Euripides", "Helen"],
  "Eur. El.": ["Euripides", "Electra"],
  "Eur. Alc.": ["Euripides", "Alcestis"],
  "Eur. IA": ["Euripides", "Iphigenia at Aulis"],
  "Eur. Phoen.": ["Euripides", "Phoenician Women"],
  "Eur. Her.": ["Euripides", "Heracles"],
  "Eur. Ba.": ["Euripides", "Bacchae"],
  "Eur. Supp.": ["Euripides", "Suppliants"],
  "Eur. Ion": ["Euripides", "Ion"],

  // --- comedy ---
  "Aristoph. Cl.": ["Aristophanes", "Clouds"],
  "Aristoph. Wasps": ["Aristophanes", "Wasps"],
  "Aristoph. Ach.": ["Aristophanes", "Acharnians"],
  "Aristoph. Kn.": ["Aristophanes", "Knights"],
  "Aristoph. Birds": ["Aristophanes", "Birds"],
  "Aristoph. Lys.": ["Aristophanes", "Lysistrata"],
  "Aristoph. Frogs": ["Aristophanes", "Frogs"],
  "Aristoph. Pl.": ["Aristophanes", "Plutus"],
  "Aristoph. Eccl.": ["Aristophanes", "Ecclesiazusae"],
  "Aristoph. Thes.": ["Aristophanes", "Thesmophoriazusae"],
};

/**
 * Verse, which Smyth cites as freely as prose.
 *
 * Kept as its own set for the same reason `scripts/lib/quotes.mjs` keeps one:
 * a trimeter's word order is not the model answer a student translating prose
 * should be shown. Whether to use it is the caller's switch, not this table's.
 */
const VERSE_AUTHORS = new Set([
  "Homer",
  "Sophocles",
  "Aeschylus",
  "Euripides",
  "Aristophanes",
]);

/**
 * Split a Perseus citation into author, work and locus.
 *
 * The head is everything before the first numeric part, which is exactly where
 * the work stops and the locus starts in every one of the 86 heads that occur.
 * Returns `null` for a citation this table cannot name, so a caller can decide
 * between dropping it and showing the abbreviation — rather than being handed a
 * confident-looking half-expansion.
 */
export function expandRef(ref) {
  const parts = String(ref ?? "").trim().split(/\s+/);
  const head = [];
  for (const part of parts) {
    if (/^[\d[]/.test(part)) break;
    head.push(part);
  }
  const key = head.join(" ");
  const locus = parts.slice(head.length).join(" ").trim();
  const named = SOURCES[key];
  if (!named) return null;
  return {
    author: named[0],
    work: named[1],
    ...(locus ? { locus } : {}),
    verse: VERSE_AUTHORS.has(named[0]),
  };
}

export { SOURCES, VERSE_AUTHORS };
