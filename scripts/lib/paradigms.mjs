/**
 * `content/paradigms.txt.gz`, read the way a script wants it.
 *
 * The web reads this file by bisecting it in place, because a phone asking
 * about one word cannot afford to parse three quarters of a million forms
 * (`apps/web/src/paradigm-index.ts`). A script asking about every form in
 * every quotation wants the opposite trade, so this builds the whole map once
 * — some 12 MB of text into a Map of 18k keys — and then answers instantly.
 *
 * Same file, same encoding: line one interns the tag signatures, and every
 * cell after it is `<base-36 index>:<form>` under a `lemma|pos` key. The forms
 * carry their macrons; the key does not, because it is the dictionary's
 * headword. Callers matching a surface against a cell must fold both.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * `Map<"lemma|pos", TaggedForm[]>`, or an empty map if the pack ships none.
 *
 * A pack without paradigms is not an error here — Greek shipped for weeks
 * without them — but it is a pack whose morphological rules can license
 * nothing, and the caller is the one placed to say so.
 */
export function loadParadigms(dir) {
  const path = join(dir, "content", "paradigms.txt.gz");
  const out = new Map();
  if (!existsSync(path)) return out;
  const text = gunzipSync(readFileSync(path)).toString("utf8");
  const eol = text.indexOf("\n");
  if (eol === -1) return out;
  const signatures = text
    .slice(0, eol)
    .split("|")
    .map((sig) => (sig === "" ? [] : sig.split(",")));

  for (const line of text.slice(eol + 1).split("\n")) {
    if (!line) continue;
    const cells = line.split("\t");
    const forms = [];
    for (const cell of cells.slice(1)) {
      const split = cell.indexOf(":");
      if (split === -1) continue;
      const tags = signatures[parseInt(cell.slice(0, split), 36)];
      // A code the header does not have would mean a file built by a different
      // version of the builder. Skip the form rather than carry `undefined`.
      if (!tags) continue;
      forms.push({ form: cell.slice(split + 1), tags });
    }
    out.set(cells[0], forms);
  }
  return out;
}
