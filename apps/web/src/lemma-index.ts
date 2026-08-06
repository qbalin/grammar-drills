import { LemmaIndex as CoreLemmaIndex, type LemmaEntry } from "@lang-tutor/core";
import { fold } from "./pack.js";

/**
 * `@lang-tutor/core`'s `LemmaIndex` with this build's fold already bound.
 *
 * The reader itself lives in core now, because the CLI reads the same two
 * files off disk that the web fetches. The only thing web-specific left is
 * which fold to key with, and that is compiled in from the pack — so callers
 * here still write `new LemmaIndex(entries, index)` and get the right one.
 */
export class LemmaIndex extends CoreLemmaIndex {
  constructor(entries: LemmaEntry[], index: string) {
    super(entries, index, fold);
  }
}
