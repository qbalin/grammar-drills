/**
 * The dictionary's two shapes, and the one conversion between them.
 *
 * A lemma map is `Record<foldedForm, LemmaEntry[]>` — the shape every caller
 * wants to think in, and the shape the pack used to ship. It is also almost
 * entirely repetition: a lemma's gloss is written out again under every one of
 * its inflected forms, so Latin's 19k lemmas inflated to 116 MB of JSON. That
 * was survivable while the map held only what a corpus attested. It is not
 * survivable now the whole dictionary ships: 149k lemmas over 873k forms would
 * be some 300 MB, which is more than `apps/cli` can parse in one bite.
 *
 * So the shipped shape is the split one, which the web build already invented
 * and now everything reads:
 *
 *   content/lemmas.json.gz   LemmaEntry[], the distinct entries
 *   content/forms.txt.gz     `form\tidx[,idx...]` per line, sorted
 *
 * `@lang-tutor/core`'s `LemmaIndex` bisects the second in place, so no reader
 * builds the big object at all. This module is the writer's half of that.
 */

/**
 * The index is line-oriented and tab-separated, so a form may contain anything
 * except a tab or a line break. It need not be ASCII: 35 forms are ligatures or
 * medieval abbreviation glyphs (`quæ`, `cœlum`, `ꝯ`) that `normalize()` has no
 * reason to fold away, and they look up fine — the reader bisects a decoded JS
 * string, which compares by code unit whatever the alphabet.
 */
const UNREPRESENTABLE = /[\t\r\n]/;

/**
 * Collapse `Record<form, LemmaEntry[]>` into a table of distinct entries plus a
 * sorted `form\tidx[,idx...]` index into it.
 *
 * Two invariants the reader depends on:
 *  - candidate order within a form is preserved (`lookupForm` promises
 *    most-frequent-first, and the vocab picker offers them in that order);
 *  - lines are sorted by code unit, because the bisection compares that way.
 */
export function splitLemmaMap(map) {
  const entries = [];
  const indexOf = new Map(); // `lemma|pos` -> position in `entries`
  const lines = [];

  for (const form of Object.keys(map)) {
    if (form === "" || UNREPRESENTABLE.test(form)) {
      throw new Error(
        `form key ${JSON.stringify(form)} is empty or holds a tab/line break — ` +
          `the line-oriented index cannot represent it. normalize() should have ` +
          `folded it; check packages/core/src/normalize.ts.`,
      );
    }
    const ids = [];
    for (const entry of map[form]) {
      const key = `${entry.lemma}|${entry.pos}`;
      let id = indexOf.get(key);
      if (id === undefined) {
        id = entries.length;
        indexOf.set(key, id);
        entries.push(entry);
      }
      // Named once per form, however many entries collapsed onto it. The
      // dictionary has two `flumen` nouns and the repack makes them one, so
      // without this the crib offers a choice between a word and itself.
      if (!ids.includes(id)) ids.push(id);
    }
    lines.push(`${form}\t${ids.join(",")}`);
  }

  // Sort by code unit — `Array.sort()`'s default, and what the reader bisects
  // with. A locale-aware collation here would silently break lookups.
  lines.sort();

  return { entries, lines, keys: indexOf };
}

/**
 * The inverse, for the few callers that genuinely want every form at once.
 *
 * This is the expensive direction — it is the 300 MB object the split exists to
 * avoid — so it is used only where the whole map is the question being asked,
 * as in `build-lemmas.mjs --merge`, and never on a device.
 */
export function joinLemmaIndex({ entries, lines }) {
  const map = Object.create(null);
  for (const line of lines) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    const form = tab === -1 ? line : line.slice(0, tab);
    const ids = tab === -1 ? "" : line.slice(tab + 1);
    map[form] = ids
      .split(",")
      .filter(Boolean)
      .map((n) => entries[Number(n)])
      .filter(Boolean);
  }
  return map;
}
