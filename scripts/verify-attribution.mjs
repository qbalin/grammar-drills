#!/usr/bin/env node
/**
 * Is the sentence really by the author the pack credits?
 *
 * A quoted question carries a `source`, and nothing in the pipeline can check
 * it. Attestation asks whether the words are real; coverage asks whether there
 * are enough of them; neither has any opinion about whether Xenophon wrote this
 * line. A citation matched to the wrong example — an off-by-one in a grammar's
 * index, a mis-split entry — ships green and puts someone else's Greek under
 * Xenophon's name, which is a worse failure than shipping no attribution at all.
 *
 * So this checks the attributions against text the authors actually wrote:
 *
 *   node --import tsx scripts/verify-attribution.mjs [--pack languages/latin]
 *        [--min-tokens 4] [--examples] [--json] [--texts <dir>]
 *
 * The corpus it reads is `languages/<pack>/reference/texts/`, the same plain
 * text `ingest_frequency.py` builds the frequency list from. It is gitignored
 * and it is not a dependency of anything — which is exactly why this is a tool
 * you run and read, like `probe-quotes.mjs`, and not a gate. Without a corpus
 * it says so and stops rather than reporting a green it did not earn.
 *
 * --- what it can and cannot confirm ------------------------------------------
 *
 * It confirms the AUTHOR, and the WORK when the corpus happens to hold it. It
 * says nothing whatever about the locus: a citation can name the wrong book and
 * chapter of the right work and pass here.
 *
 * Four outcomes per attributed sentence:
 *
 *   confirmed      found in a text by the author credited
 *   CONTRADICTED   the author IS in the corpus, this sentence is not in their
 *                  work, and a long run of it is verbatim in another author --
 *                  the error class, and the only one that is a defect on its own
 *   not-found      the cited WORK is in the corpus and the sentence is not.
 *                  Grammars abridge, normalize and stitch their examples, so
 *                  this is expected in bulk and means nothing about any one
 *                  sentence
 *   unchecked      the cited work is not in the corpus, or the sentence is too
 *                  short to be evidence
 *
 * The decision rule the attribution has to clear before it ships:
 *
 *   CONTRADICTED == 0    and    confirmed / (confirmed + not-found) >= 0.70
 *
 * A contradiction is a bug to find, never a threshold to tune. Find it, though,
 * rather than assuming it: the other thing it can be is one ancient author
 * quoting another. Augustine quotes Cicero at length and both are in the Latin
 * corpus, so a correct Cicero citation surviving only in a grammar's abridged
 * form can turn up verbatim in the *Confessions*. Which of the two it is has to
 * be settled by looking before anything is shipped or reverted.
 *
 * --- two things this got wrong the first time, and why ------------------------
 *
 * Both were found by running it, and both made it accuse correct citations.
 *
 * ONE: the denominator has to be the cited WORK, not the cited author. Joining
 * on the author alone puts "I do not hold that work" in the same bucket as "the
 * attribution is wrong". The Greek pack cites Xenophon's *Cyropaedia* 104 times
 * and the corpus holds three other works of his; every one of those citations
 * scored as a failure to confirm, and the reported rate was measuring the shape
 * of the corpus rather than the quality of the matcher.
 *
 * TWO: accusing needs a higher bar than corroborating. Four tokens is enough to
 * say "this is consistent with Xenophon"; it is nowhere near enough to say "this
 * is not Xenophon's, it is Thucydides'". Formulaic openings — ἐν τῷ πρὸ τοῦ
 * χρόνῳ, οὐ γὰρ ἦν ὅ τι — are shared by every prose author alive, and at four
 * tokens they produced confident, entirely false contradictions. So a
 * contradiction needs a long verbatim run (`--long-tokens`, default 10) and a
 * sentence long enough to supply one, while a confirmation still needs only the
 * short prefix.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { compileFold, words } from "@lang-tutor/core";
import { loadGrammar, loadProfile, loadTests, packDir } from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const fold = compileFold(profile.fold);
const JSON_OUT = argv.includes("--json");
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const MIN_TOKENS = Number(opt("--min-tokens", 4));
const LONG_TOKENS = Number(opt("--long-tokens", 10));

/** Lowercased, unaccented, hyphen-joined — the shape a filename is in. */
const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- the corpus --------------------------------------------------------------

/*
 * `--texts <dir>` for a corpus that is not the frequency corpus.
 *
 * `reference/texts/` is two things at once: what this reads, and what
 * `ingest_frequency.py` ranks to produce the committed `frequency.tsv.gz` that
 * the vocabulary band and gate C7 are built on. So widening it to check an
 * attribution is not free — it silently changes what a later frequency rebuild
 * would call a common word, and every number downstream of that.
 *
 * Which is a real problem, because the two corpora want different things. The
 * frequency corpus should be the kind of Latin the pack teaches. An attribution
 * corpus should hold whatever the pack happens to cite, however lopsided — all
 * of Cicero, because a grammar quotes Cicero. Keeping them apart costs one flag.
 */
const textsDir = opt("--texts", join(dir, "reference", "texts"));
if (!existsSync(textsDir)) {
  console.error(
    `No corpus at ${textsDir}, and nothing in the repo is one.\n` +
      "It is plain text, one work per file, named <author>-<work>.txt, and it is\n" +
      "gitignored — see scripts/reference/README.md for how the pack's was built.",
  );
  process.exit(2);
}

/*
 * Every work by one author folded into a single haystack, with the individual
 * works kept beside it.
 *
 * One haystack per author rather than per file because the search is the cost
 * here: a thousand sentences against fifty files is fifty thousand scans of a
 * multi-megabyte string, and against eight authors it is eight thousand.
 * Tokens are re-joined with single spaces and the whole thing is space-padded,
 * so `includes` on a space-delimited needle is a whole-word match and no
 * separate boundary check is needed.
 */
function loadCorpus() {
  const byAuthor = new Map();
  for (const file of readdirSync(textsDir).filter((f) => f.endsWith(".txt"))) {
    const stem = file.replace(/\.txt$/, "");
    const author = stem.split("-")[0];
    const work = stem.slice(author.length + 1);
    const text = ` ${words(readFileSync(join(textsDir, file), "utf8"))
      .map(fold).filter(Boolean).join(" ")} `;
    const entry = byAuthor.get(author) ?? { works: [], all: [] };
    entry.works.push({ work, text });
    entry.all.push(text);
    byAuthor.set(author, entry);
  }
  for (const entry of byAuthor.values()) entry.all = entry.all.join(" ");
  return byAuthor;
}

/*
 * Does any run of `n` consecutive tokens of this sentence appear in that text?
 *
 * Any run, not the opening one. A grammar quoting a text is not transcribing
 * it: Smyth starts a quotation at the word the construction needs, drops what
 * is between two halves of an example and marks it with an ellipsis, and prints
 * a subject the original leaves to be understood. Anchoring on the first four
 * tokens missed 146 of the 542 sentences this corpus can actually confirm —
 * more than a quarter of them — and every one of those looked like a failure of
 * the attribution rather than of the anchor.
 */
function somewhereIn(hay, tokens, n) {
  for (let i = 0; i + n <= tokens.length; i++) {
    if (hay.includes(` ${tokens.slice(i, i + n).join(" ")} `)) return true;
  }
  return false;
}

const corpus = loadCorpus();
if (!corpus.size) {
  console.error(`No .txt files in ${textsDir}.`);
  process.exit(2);
}

/*
 * Which corpus author, if any, a cited author names.
 *
 * A token match in either direction, because the two are written differently on
 * purpose: the pack cites people as a reader would name them ("Julius Caesar",
 * "Plato") and the corpus files are stems ("caesar-de-bello-gallico"). Matching
 * on any shared token joins those without a table of aliases to maintain, and
 * the false-positive risk is a corpus file whose author stem is also somebody
 * else's forename, which no ancient author in either pack is.
 */
function corpusAuthorFor(cited) {
  const tokens = new Set(slug(cited).split("-").filter(Boolean));
  for (const key of corpus.keys()) if (tokens.has(key)) return key;
  return null;
}

const STOP = new Set(["of", "the", "a", "and", "on", "in", "to"]);
/** Tokens cut to five characters, so `histories` and `history` are one word. */
const stems = (s) =>
  new Set(slug(s).split("-").filter((t) => t && !STOP.has(t)).map((t) => t.slice(0, 5)));

/*
 * The files, if any, holding the work a citation names.
 *
 * Titles are written for a reader and filenames for a filesystem, and the gap
 * between them is wider than an equality test survives: *History of the
 * Peloponnesian War* is `thucydides-histories`, and Lysias's *Orations* is
 * thirty-four files called `lysias-oration-NN`. A shared five-character stem
 * bridges both without a table of titles to maintain, and it has to, because
 * this is the join that decides whether a sentence counts as checkable at all.
 */
function corpusWorksFor(author, work) {
  const entry = corpus.get(author);
  if (!entry) return [];
  const want = stems(work);
  if (!want.size) return [];
  return entry.works.filter((w) => {
    for (const s of stems(w.work)) if (want.has(s)) return true;
    return false;
  });
}

// --- what is being checked ---------------------------------------------------

/*
 * By default the shipped questions, because those are what a student is told.
 * `--examples` reads the attributions on `grammar.json`'s examples instead,
 * which is the same data one step earlier and is the form to check while a
 * pack's parser is still being written.
 */
function attributedItems() {
  if (argv.includes("--examples")) {
    const out = [];
    let total = 0;
    for (const topic of loadGrammar(dir)) {
      for (const ex of topic.examples ?? []) {
        total++;
        /*
         * `author` is the split-out shape. A pack whose parser records the
         * citation only as the string its book printed has nothing this can
         * join on, and saying "nothing to verify" would read as "nothing to
         * worry about" — so the caller is told which of the two it is.
         */
        if (!ex.author) continue;
        out.push({
          where: topic.id,
          text: ex.text,
          author: ex.author,
          work: ex.work ?? "",
          locus: ex.locus ?? "",
        });
      }
    }
    return {
      what: "grammar.json examples",
      items: out,
      empty: total
        ? `${total} examples, none carrying a split-out author/work — this pack ` +
          `records the citation as its book printed it — check the questions instead`
        : "no examples at all",
    };
  }
  const out = [];
  for (const list of Object.values(loadTests(dir))) {
    for (const test of list) {
      for (const q of test.questions) {
        if (!q.source) continue;
        out.push({
          where: test.id,
          text: q.answer,
          author: q.source.author,
          work: q.source.work ?? "",
          locus: q.source.locus ?? "",
        });
      }
    }
  }
  return {
    what: "shipped questions",
    items: out,
    empty: "no question carries an attribution yet",
  };
}

const { what, items, empty } = attributedItems();
if (!items.length) {
  console.log(`\n${profile.id} — nothing to verify in ${what}: ${empty}.`);
  process.exit(0);
}

// --- the check ---------------------------------------------------------------

const verdicts = { confirmed: 0, contradicted: 0, "not-found": 0, unchecked: 0 };
const contradictions = [];
const byAuthor = new Map();
let workConfirmed = 0;

for (const item of items) {
  const cited = corpusAuthorFor(item.author);
  const tokens = words(item.text).map(fold).filter(Boolean);
  /*
   * Too short to be evidence. Four tokens of running Greek or Latin are already
   * unlikely to repeat across authors by chance; two are not, and a false
   * "contradicted" would send someone hunting a bug that is not there.
   */
  if (tokens.length < MIN_TOKENS) {
    verdicts.unchecked++;
    continue;
  }
  const inCited = cited && somewhereIn(corpus.get(cited).all, tokens, MIN_TOKENS);
  const works = cited ? corpusWorksFor(cited, item.work) : [];

  let verdict;
  if (inCited) {
    verdict = "confirmed";
    if (works.some((w) => somewhereIn(w.text, tokens, MIN_TOKENS))) workConfirmed++;
  } else {
    /*
     * Only now is an accusation worth making, and only on a long verbatim run.
     * The short prefix that was good enough to corroborate is not good enough to
     * contradict — see "two things this got wrong" above.
     */
    const elsewhere = [];
    if (cited && tokens.length >= LONG_TOKENS) {
      for (const [author, entry] of corpus) {
        if (author !== cited && somewhereIn(entry.all, tokens, LONG_TOKENS)) {
          elsewhere.push(author);
        }
      }
    }
    if (elsewhere.length) {
      verdict = "contradicted";
      contradictions.push({ ...item, foundIn: elsewhere });
    } else if (works.length) {
      // The work itself is on disk and the sentence is not in it. This is the
      // only case that belongs in the denominator.
      verdict = "not-found";
    } else {
      verdict = "unchecked";
    }
  }
  verdicts[verdict]++;

  const a = byAuthor.get(item.author) ?? { confirmed: 0, contradicted: 0, "not-found": 0, unchecked: 0 };
  a[verdict]++;
  byAuthor.set(item.author, a);
}

// --- the report --------------------------------------------------------------

const checkable = verdicts.confirmed + verdicts["not-found"];
const rate = checkable ? verdicts.confirmed / checkable : 0;
const passes = verdicts.contradicted === 0 && rate >= 0.7;

if (JSON_OUT) {
  console.log(JSON.stringify({
    pack: profile.id, what, items: items.length, minTokens: MIN_TOKENS,
    verdicts, confirmedRate: Number(rate.toFixed(4)), workConfirmed,
    passes, contradictions,
  }, null, 2));
  process.exit(passes ? 0 : 1);
}

console.log(
  `\n${profile.id} — attribution against the corpus (${what})\n` +
    `  ${items.length} attributed sentences, ` +
    `${corpus.size} authors in ${textsDir}, any run of ${MIN_TOKENS} tokens ` +
    `confirms, ${LONG_TOKENS} contradicts\n`,
);
for (const key of ["confirmed", "contradicted", "not-found", "unchecked"]) {
  console.log(`  ${String(verdicts[key]).padStart(6)}  ${key}`);
}
console.log(
  `\n  confirmed rate over what could be checked: ` +
    `${(rate * 100).toFixed(1)}% of ${checkable}  (want ≥70%)\n` +
    `  of the ${verdicts.confirmed} confirmed, ${workConfirmed} were found in ` +
    `the work cited and not merely somewhere in the author`,
);

const spread = [...byAuthor].sort(
  (a, b) => (b[1].confirmed + b[1]["not-found"]) - (a[1].confirmed + a[1]["not-found"]),
);
console.log("\n  by cited author (checkable ones first):");
for (const [author, v] of spread.slice(0, 12)) {
  const n = v.confirmed + v["not-found"];
  console.log(
    `    ${author.padEnd(24)} ${String(v.confirmed).padStart(4)} confirmed` +
      `${n ? ` of ${String(n).padEnd(5)}` : "      ".padEnd(9)}` +
      `${v.contradicted ? `  ${v.contradicted} CONTRADICTED` : ""}` +
      `${v.unchecked ? `  ${v.unchecked} unchecked` : ""}`,
  );
}

if (contradictions.length) {
  console.log(
    `\n  ${contradictions.length} CONTRADICTED — each of these is a bug, not a ` +
      `statistic:`,
  );
  for (const c of contradictions.slice(0, 20)) {
    console.log(
      `    ${c.where}\n      credited: ${c.author}, ${c.work} ${c.locus}\n` +
        `      found in: ${c.foundIn.join(", ")}\n      ${c.text}`,
    );
  }
  if (contradictions.length > 20) {
    console.log(`    … and ${contradictions.length - 20} more (--json for all)`);
  }
}

console.log(
  passes
    ? "\nPasses: no contradictions, and the confirmed rate clears 70%.\n"
    : "\nDoes NOT pass. " +
      (verdicts.contradicted
        ? "Find the contradictions above before shipping these attributions.\n"
        : "The confirmed rate is below 70%; the matcher is attaching citations " +
          "it cannot support.\n"),
);
process.exit(passes ? 0 : 1);
