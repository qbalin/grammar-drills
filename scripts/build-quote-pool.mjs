/**
 * The Latin pack's quotations, recovered from the dictionary dump and filed
 * under the topics they illustrate.
 *
 *   node --import tsx scripts/build-quote-pool.mjs --pack languages/latin \
 *     --dump <kaikki.jsonl> --ref languages/latin/reference
 *
 * Writes `content/quotes.jsonl.gz`, which is committed. That file is the input
 * to `quote-tests.mjs`, so only this step needs the 1.2 GB dump and only this
 * step needs the dictionary — the rest of the pipeline, and a fresh checkout,
 * read the artifact.
 *
 * Why Latin needs this at all, when Greek does not: Smyth cites an attested
 * sentence for most of what he teaches and the TEI keeps quotation, gloss and
 * locus apart, so Greek's examples arrive already filed under the topic they
 * illustrate. Bennett cites nobody in his body text. His back index does name
 * sources — but for *illustrations he wrote*, not for quotations: `Orgetorīx
 * Helvētiīs persuāsit` is filed under B.G. i, 2, and Caesar's own sentence
 * there is `Orgetorix ... civitati persuasit`. Crediting that to Caesar would
 * be inventing a quotation, so the index is not usable and Latin's real
 * quotations have to come from somewhere else. They come from here.
 *
 * Three things happen that need a model, and they are done together in one
 * batched call each so the whole pack costs a couple of dozen:
 *
 *   1. which topics a quotation exemplifies  — Bennett's syllabus is prose, and
 *      no feature query over an unparsed sentence answers "is this an ablative
 *      absolute"
 *   2. which of a closed set of spellings an ambiguous word takes — `puella` or
 *      `puellā`, decided by reading the sentence, never invented
 *   3. an English prompt — written here rather than taken from the dump, which
 *      keeps the pack clear of Wiktionary's CC BY-SA translations and makes the
 *      prompt read like the other 6,581
 *
 * None of it invents Latin. The answer is the quotation as printed; every
 * model-supplied field is a choice among things already on the table.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, appendFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFold, words } from "@lang-tutor/core";
import { loadGrammar, loadProfile, packDir, teachable } from "./lib/pack.mjs";
import { openReference } from "./lib/reference.mjs";
import { makeClassifier } from "./lib/attestation.mjs";
import { macronize, applyChoices } from "./lib/macronize.mjs";
import { classicalAuthor, readQuotes, rejectionOf } from "./lib/quotes.mjs";

const argv = process.argv.slice(2);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dump = at("--dump") ?? process.env.KAIKKI_LATIN;
if (!dump) {
  console.error(
    "This needs the reference dictionary's raw dump, and nothing in the repo is one.\n" +
      "Point at it with --dump /path/to/kaikki.org-dictionary-<Language>.jsonl,\n" +
      "or fetch one with scripts/reference/ (see its README).",
  );
  process.exit(2);
}

const dir = packDir(argv);
const profile = loadProfile(dir);
// The syllabus, not the whole book. A pack ships every section of its source,
// and the pages the book sets no exercise on are read rather than taught — so
// nothing here may file a question or a quotation under one of them.
const grammar = teachable(loadGrammar(dir));
const planning = argv.includes("--plan");
const BATCH = Number(at("--batch") ?? 25);
const MODEL = at("--model") ?? "claude-opus-4-8";

const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};

const fold = compileFold(profile.fold);
const dictionary = openReference(dir, profile, argv);
if (dictionary.source !== "dictionary") {
  console.error("This needs the dictionary backend, for the marks. Pass --ref.");
  process.exit(2);
}
// The pack's own content, because that is what E1 and E2 judge by.
const own = openReference(dir, profile, []);
const { classify } = makeClassifier({ profile, config, ref: own });

const policy = {
  era: "classical",
  verse: argv.includes("--verse"),
  minWords: Number(at("--min-words") ?? 4),
  maxWords: Number(at("--max-words") ?? 22),
  marks: "any",
};

// --- gather -----------------------------------------------------------------

console.log("reading the dump...");
const pool = [];
for await (const quote of readQuotes(dump)) {
  if (rejectionOf(quote, policy)) continue;
  const marked = macronize(quote.text, { ref: dictionary, fold });
  // Only what can ship without moving a gate. Both packs sit at their
  // `maxUnattestedForms` exactly, and a raise bought by a feature rather than
  // by the content that needs it is what CLAUDE.md calls an excuse.
  const tokens = words(marked.text);
  const missed = new Set();
  for (const token of tokens) {
    const { verdict, form } = classify(token, tokens[0]);
    if (verdict !== "ok") missed.add(fold(form));
  }
  if (missed.size > 0) continue;
  // More than two words needing a judgement call is a sentence the dictionary
  // cannot really spell, and guessing four marks to save one quotation is a bad
  // trade when the pool is not the binding constraint.
  if (marked.ambiguous.length > 2) continue;

  pool.push({
    text: marked.text,
    ambiguous: marked.ambiguous,
    source: {
      author: classicalAuthor(quote.refParsed.author) ?? quote.refParsed.author,
      work: quote.refParsed.work,
      ...(quote.refParsed.locus ? { locus: quote.refParsed.locus } : {}),
    },
  });
}
console.log(`  ${pool.length} quotations cost the gates nothing and can be spelled.`);
dictionary.close();

if (planning) {
  console.log(`  ${Math.ceil(pool.length / BATCH)} calls would be made. Stopping.`);
  own.close();
  process.exit(0);
}

// --- the one thing a model is for -------------------------------------------

/**
 * The syllabus as a list the model can point at.
 *
 * Titles and section numbers only. The full text of 114 topics is far more than
 * a classification needs, and a prompt that carried it would cost more than the
 * whole run does.
 */
const index = grammar
  .map((t) => `${t.id}\t${profile.grammar.refPrefix}${t.ref} ${t.title}`)
  .join("\n");

const SYSTEM = `You are filing genuine quotations from classical authors under the
sections of a Latin grammar, and choosing how to spell them.

The syllabus:
${index}

For each quotation you are given, return:
  "id"      — the number you were given
  "topics"  — 1 or 2 ids from the syllabus above whose grammar point the
              sentence actually exemplifies. Prefer the most specific. If none
              fits, return an empty list; a quotation filed under a section it
              does not illustrate is worse than one filed nowhere.
  "marks"   — for each ambiguous word you are given, the ONE spelling from its
              candidate list that the sentence's grammar requires. Choose only
              from the list. Omit a word you cannot decide.
  "prompt"  — a faithful, natural English rendering of the Latin, as a single
              sentence a student could be asked to translate back. Match the
              Latin's meaning exactly. Do not paraphrase away a construction:
              the point of the exercise is that the student reaches for it.

Output ONLY a JSON object: {"items":[{"id":1,"topics":["bn-..."],"marks":{"3":"puellā"},"prompt":"..."}]}`;

function callClaude(prompt) {
  const out = execFileSync(
    "claude",
    // `--tools ""` for the reason gen-tests.mjs gives: `claude -p` is an agent,
    // and asked for JSON it may reach for Write instead and answer in prose.
    ["-p", prompt, "--append-system-prompt", SYSTEM, "--model", MODEL,
      "--output-format", "json", "--tools", ""],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
  );
  const envelope = JSON.parse(out);
  if (envelope.is_error) throw new Error(String(envelope.result ?? "claude -p error").slice(0, 300));
  const text = (envelope.result ?? "").trim();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON in result");
  // The raw text comes back too. A batch can parse cleanly and still file
  // nothing, and when that happens the answer is in what was actually said.
  return { items: JSON.parse(text.slice(s, e + 1)).items ?? [], text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BACKOFF = [30, 60, 120, 300, 600];

/**
 * A limit no ladder can outlast, told apart from a failure worth retrying.
 *
 * The whole ladder is about nineteen minutes. A session limit is measured in
 * hours, so retrying one is not patience, it is nineteen minutes of certain
 * failure followed by a stack trace — which is how the 2026-08-09 run ended
 * with fourteen of eighteen batches done and no word of what to do about it.
 *
 * `execFileSync` throws before the envelope is ever parsed, so the reason is in
 * the failed process's stdout rather than in the message. Both are searched.
 */
function usageLimit(err) {
  const text = `${err.stdout ?? ""}\n${err.message ?? ""}`;
  if (!/session limit|usage limit|"api_error_status":\s*429/.test(text)) return null;
  return text.match(/"result":"([^"]+)"/)?.[1] ?? "usage limit reached";
}

const topicIds = new Set(grammar.map((t) => t.id));

/**
 * The syllabus id an answer meant, from the shorter forms it sometimes uses.
 *
 * Asked for ids out of the list it was given, a reply sometimes answers in a
 * convention of its own — `bn-218` for `bn-218-instrumental-uses-of-the-ablative`
 * — and, being one reply, does it for every item at once. That is what made
 * whole batches file nothing: 25 perfectly good answers dropped over the shape
 * of one field, with the Latin, the marks and the translations all correct.
 *
 * Accepting the short form is the right repair rather than insisting harder in
 * the prompt, because it cannot go wrong in the direction that matters: every
 * branch below resolves to an id that is already in `grammar` or to nothing at
 * all, and an ambiguous short form resolves to nothing rather than to a guess.
 * A topic cannot be invented here, which is the same rule the marks follow.
 */
const topicRanges = grammar
  .map((t) => {
    const m = String(t.ref).match(/^(\d+)(?:\s*-\s*(\d+))?/);
    return m ? { id: t.id, lo: Number(m[1]), hi: Number(m[2] ?? m[1]) } : null;
  })
  .filter(Boolean);

function resolveTopic(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (topicIds.has(v)) return v;
  // `bn-218` against `bn-218-instrumental-uses-of-the-ablative`, but only when
  // exactly one topic starts that way.
  const prefixed = grammar.filter((t) => t.id.startsWith(`${v}-`));
  if (prefixed.length === 1) return prefixed[0].id;
  // A bare section number, against the range each topic covers.
  const m = v.match(/(\d+)/);
  if (m) {
    const n = Number(m[1]);
    const inRange = topicRanges.filter((t) => n >= t.lo && n <= t.hi);
    if (inRange.length === 1) return inRange[0].id;
  }
  return null;
}

/**
 * The batches already answered, kept so a run that dies is worth what it spent.
 *
 * The gather above is deterministic — same dump, same dictionary, same order —
 * so a batch is identified by where it starts in the pool, and a resumed run
 * re-derives everything except the model's answers. Those are the only
 * expensive part and the only part written down.
 *
 * Recovering by filed-count would be wrong: a batch files fewer quotations than
 * it consumes, because topics can come back empty and the post-marks check can
 * still reject. Only the start index says what was actually asked.
 */
const partialPath = join(dir, "content", ".quotes.partial.jsonl");
// Where to keep the raw answer of a batch that filed nothing, for the times
// that has to be explained rather than guessed at. Off unless asked for.
const debugDir = at("--debug-dir");
if (debugDir) mkdirSync(debugDir, { recursive: true });
const fingerprint = createHash("sha256")
  .update(pool.map((q) => q.text).join("\n"))
  .digest("hex")
  .slice(0, 16);

const out = [];
const done = new Set();

if (existsSync(partialPath)) {
  const lines = readFileSync(partialPath, "utf8").split("\n").filter(Boolean);
  const header = JSON.parse(lines[0]);
  // A pool that shifted under a resume would mis-file every remaining batch
  // against the wrong sentences, silently. Refuse rather than guess.
  if (header.fingerprint !== fingerprint || header.batch !== BATCH) {
    console.error(
      `${partialPath}\nwas written against a different pool (${header.pool} quotations, ` +
        `batch ${header.batch}) than this run gathered (${pool.length}, batch ${BATCH}).\n` +
        `Resuming would file answers against the wrong sentences. Delete it to start over:\n` +
        `  rm ${partialPath}`,
    );
    own.close();
    process.exit(2);
  }
  // Keyed by start so a batch asked twice — which re-asking makes possible —
  // is read as its latest answer rather than both of them.
  const answered = new Map();
  for (const line of lines.slice(1)) {
    // A process killed mid-append leaves a torn last line. It is the only line
    // that can be torn, so stopping at the first unreadable one costs exactly
    // the batch that was in flight — which is re-asked below.
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      console.log("  (last record was written torn; that batch is re-asked)");
      break;
    }
    answered.set(record.start, record.items);
  }

  // A batch that filed nothing is asked again rather than counted as answered.
  // The filters reject one sentence at a time and so produce counts in between;
  // only a whole answer arriving in a shape the reader does not understand
  // zeroes a batch outright. Retiring 25 quotations on the strength of one
  // malformed reply is the loss this file exists to prevent, so `done` means
  // "answered usefully". `--keep-empty` restores the more literal reading.
  const keepEmpty = argv.includes("--keep-empty");
  let empty = 0;
  for (const [start, items] of answered) {
    if (items.length > 0 || keepEmpty) {
      done.add(start);
      out.push(...items);
    } else {
      empty++;
    }
  }
  console.log(
    `resuming: ${done.size} of ${Math.ceil(pool.length / BATCH)} batches already answered, ` +
      `${out.length} quotations filed.` +
      (empty ? `\n  ${empty} batch(es) filed nothing and are being asked again.` : ""),
  );
} else {
  appendFileSync(
    partialPath,
    JSON.stringify({ fingerprint, pool: pool.length, batch: BATCH }) + "\n",
  );
}

let filed = out.length;

for (let start = 0; start < pool.length; start += BATCH) {
  if (done.has(start)) continue;
  const batch = pool.slice(start, start + BATCH);
  const body = batch
    .map((q, i) => {
      const marks = q.ambiguous.length
        ? `\n  ambiguous: ${q.ambiguous
            .map((a) => `${a.index}=${a.candidates.join("|")}`)
            .join("  ")}`
        : "";
      return `${i + 1}. ${q.text}${marks}`;
    })
    .join("\n");

  let items = null;
  let raw = "";
  for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
    try {
      ({ items, text: raw } = callClaude(`File these ${batch.length} quotations:\n\n${body}`));
      break;
    } catch (err) {
      const limit = usageLimit(err);
      if (limit) {
        // Stop where the work is, and say so. Every batch already answered is
        // on disk, so this costs the run nothing but the waiting.
        console.error(
          `\nStopping: ${limit}\n` +
            `  ${filed} quotations are saved in ${partialPath}.\n` +
            "  Rerun the same command once the limit resets; it picks up here.",
        );
        own.close();
        process.exit(3);
      }
      if (attempt === BACKOFF.length) throw err;
      console.log(`  ${err.message.slice(0, 80)} — waiting ${BACKOFF[attempt]}s`);
      await sleep(BACKOFF[attempt] * 1000);
    }
  }

  const kept = [];
  // Which check dropped what. A batch that files nothing at all is not the
  // filters working — they reject one sentence at a time, so they produce
  // numbers in between. An all-or-nothing batch means the whole answer came
  // back in a shape this loop does not read, and this says which shape.
  const dropped = { unknownId: 0, badTopic: 0, noPrompt: 0, unattested: 0 };
  for (const item of items ?? []) {
    const quote = batch[Number(item.id) - 1];
    if (!quote) {
      dropped.unknownId++;
      continue;
    }
    const topics = [
      ...new Set((item.topics ?? []).map(resolveTopic).filter(Boolean)),
    ].slice(0, 2);
    if (!topics.length) {
      dropped.badTopic++;
      continue;
    }
    if (!item.prompt) {
      dropped.noPrompt++;
      continue;
    }

    // The chosen marks are applied through `applyChoices`, which ignores
    // anything not in the candidate list. A model cannot spell a new word here.
    const { text } = applyChoices(quote.text, quote.ambiguous, item.marks ?? {});
    // Re-checked after the marks land: a chosen spelling is still a spelling,
    // and the gate budget is the whole reason this pool was filtered.
    const tokens = words(text);
    let clean = true;
    for (const token of tokens) {
      if (classify(token, tokens[0]).verdict !== "ok") clean = false;
    }
    if (!clean) {
      dropped.unattested++;
      continue;
    }

    filed++;
    kept.push({ text, topics, prompt: String(item.prompt).trim(), source: quote.source });
  }
  // Before the next call, not after the last one: this line is the difference
  // between a run that dies costing twenty minutes and one costing two hours.
  appendFileSync(partialPath, JSON.stringify({ start, items: kept }) + "\n");
  out.push(...kept);
  if (debugDir && kept.length === 0) {
    // Kept only for the batches that need explaining, because that is the only
    // time anyone reads them.
    writeFileSync(join(debugDir, `batch-${start}.raw.txt`), raw);
  }
  const why = Object.entries(dropped)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  console.log(
    `  ${Math.min(start + BATCH, pool.length)}/${pool.length} — ${filed} filed` +
      `  (+${kept.length} of ${items?.length ?? 0} answered${why ? `; dropped ${why}` : ""})`,
  );
}

const path = join(dir, "content", "quotes.jsonl.gz");
writeFileSync(path, gzipSync(out.map((q) => JSON.stringify(q)).join("\n"), { level: 9 }));
// Only once the artifact it was standing in for exists.
rmSync(partialPath, { force: true });
console.log(`\nwrote ${out.length} quotations to ${path}`);
console.log(`  ${new Set(out.flatMap((q) => q.topics)).size} of ${grammar.length} topics named`);
own.close();
