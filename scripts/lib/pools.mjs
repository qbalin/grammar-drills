/**
 * The quotation pools a pack may ship, and what each of them is.
 *
 * Latin has three ways of getting to a quotation and they are not alternatives
 * — the dump reaches sentences no grammar prints, and the grammars reach the
 * syntax the dump cannot be asked about. Same schema, different books, and a
 * pack may ship any of them, so a reader fails only when it can find none.
 *
 * --- why these carry their provenance, and nothing else does -----------------
 *
 * A quotation's licence had nowhere to live until this list. A pool record is
 * `{text, topics, prompt, source}` and a shipped question adds only
 * `Question.source` — author, work, locus — so the *book the sentence was
 * recovered from* was recorded in one place, a comment at the top of the script
 * that built it, and reached no artifact at all. `profile.grammar.source` is the
 * pack's only licence string that ships, and it names Bennett, who supplies the
 * syllabus and not one of these sentences.
 *
 * That is thin for material taken out of three separately-licensed
 * digitizations, so each run records what it read into
 * `content/quote-stats.json` beside its funnel. The Latin itself is nobody's:
 * these authors have been dead two thousand years. What is licensed is the
 * transcription, and A&G's is the one with terms attached.
 *
 * It lives here rather than in `quote-tests.mjs` because two scripts read the
 * pools now: the composer, and `inflection-topics.mjs`, which files the same
 * sentences under the topics a lookup can confirm. One list, so the two cannot
 * disagree about what a pool is.
 */
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

export const POOLS = [
  {
    file: "quotes.jsonl.gz",
    built: "scripts/build-quote-pool.mjs",
    from: "the kaikki.org Wiktionary extract behind the reference dictionary",
    licence: "CC BY-SA 4.0 (Wiktionary); the prompts are written here, not taken",
  },
  {
    file: "ag-quotes.jsonl.gz",
    built: "scripts/ag-quotes.mjs",
    from: "Allen & Greenough, New Latin Grammar (Boston, 1903), via Perseus/DCC as mirrored by alpheios-project/grammar-allen-greenough",
    licence: "text public domain; this digitization CC BY-NC-SA 3.0",
  },
  {
    file: "lane-quotes.jsonl.gz",
    built: "scripts/lane-quotes.mjs",
    from: "Lane, A Latin Grammar for Schools and Colleges (New York, 1898), Project Gutenberg #44653",
    licence: "public domain, text and transcription both",
  },
];

/** The pools actually on disk, in the order above, each with its path. */
export function poolsPresent(dir) {
  return POOLS.map((pool) => ({ ...pool, path: join(dir, "content", pool.file) })).filter(
    (pool) => existsSync(pool.path),
  );
}

/** What to say when a pack ships none of them. */
export function noPoolMessage(dir) {
  return (
    `No quote pool in ${join(dir, "content")} ` +
    `(looked for ${POOLS.map((p) => p.file).join(", ")}).\n` +
    `Build one with ${POOLS.map((p) => p.built).join(", ")}.`
  );
}

/** Every record of one pool, parsed. */
export function readPool(pool) {
  const out = [];
  for (const line of gunzipSync(readFileSync(pool.path)).toString("utf8").split("\n")) {
    if (line.trim()) out.push(JSON.parse(line));
  }
  return out;
}
