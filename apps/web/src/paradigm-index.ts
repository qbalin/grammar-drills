import type { TaggedForm } from "@lang-tutor/core";
import { bisect } from "./bisect.js";

/**
 * Every word's own inflection table, as a phone can afford to hold it.
 *
 * `content/paradigms.txt.gz` is 10 MB of text over 18,302 words and three
 * quarters of a million forms — far too much to parse into objects for a
 * gesture that asks about one word. So it is held as the string it arrived as
 * and bisected in place, the same as the dictionary index beside it.
 *
 * The file's first line interns the tag signatures: there are only a few
 * hundred distinct ones, so every form after it names its features by a
 * base-36 index rather than spelling them out. `${lemma}|${pos}` is the key,
 * which is what `build-web-content.mjs` already dedupes lemma entries by, so a
 * `LemmaEntry` resolves its own paradigm without an index in between.
 */
export class ParadigmIndex {
  private readonly signatures: string[][];
  /** Where the keyed lines start — past the signature header. */
  private readonly body: number;

  constructor(private readonly index: string) {
    const eol = index.indexOf("\n");
    const header = eol === -1 ? index : index.slice(0, eol);
    this.signatures = header
      .split("|")
      .map((sig) => (sig === "" ? [] : sig.split(",")));
    this.body = eol === -1 ? index.length : eol + 1;
  }

  /** The tagged forms of one lemma, or an empty list if it has none. */
  formsFor(lemma: string, pos: string): TaggedForm[] {
    const line = bisect(this.index, `${lemma}|${pos}`, this.body);
    if (line === null || line === "") return [];
    const forms: TaggedForm[] = [];
    for (const cell of line.split("\t")) {
      const split = cell.indexOf(":");
      if (split === -1) continue;
      const tags = this.signatures[parseInt(cell.slice(0, split), 36)];
      // A code the header does not have would mean a file built by a different
      // version of the builder. Skip the form rather than render `undefined`.
      if (!tags) continue;
      forms.push({ form: cell.slice(split + 1), tags });
    }
    return forms;
  }
}
