/**
 * Latin quotations recovered from Lane's grammar, and filed under topics.
 *
 *   node --import tsx scripts/lane-quotes.mjs --pack languages/latin
 *     --plan            print the funnel and a sample of the filing, write nothing
 *     --why <bucket>    print what one funnel bucket actually threw away
 *     --pool <file>     write the unfiled pool as JSONL and stop, for the
 *                       corroboration check a new grammar has to pass
 *     --verse           keep the verse authors, which are dropped by default
 *
 * Writes `content/lane-quotes.jsonl.gz`, a third pool beside the dictionary
 * dump's `quotes.jsonl.gz` and Allen & Greenough's `ag-quotes.jsonl.gz`, in the
 * same schema. `quote-tests.mjs --from quotes` reads all three.
 *
 * --- why a third pool ---------------------------------------------------------
 *
 * `ag-quotes.mjs` makes the argument for the second one and this is the same
 * argument again: Lane, like A&G, prints a real sentence, credits it, and
 * translates it, so a model is asked for one thing rather than three. Lane is
 * the larger book of the two — 2,951 macronized sentence-shaped examples against
 * A&G's 592 kept — and it is public domain outright rather than CC BY-NC-SA,
 * because Project Gutenberg #44653 is a Distributed Proofreaders transcription
 * rather than a scan of one.
 *
 * It was measured before any of this was written, which is the rule `REVIEW.md`
 * generalises from the Gildersleeve & Lodge refusal: **98.2% of its Latin tokens
 * are attested by the pack's own shipped index**, against A&G's 97.7% and a bar
 * of roughly 95%. Proofread, not OCR, is the whole of the difference.
 *
 * --- the source, and what is public domain in it ------------------------------
 *
 * George M. Lane, "A Latin Grammar for Schools and Colleges" (New York, 1898),
 * completed by Morris H. Morgan. Both the text and this digitization are in the
 * public domain: Project Gutenberg #44653, released 2014.
 *
 * The file is pinned by SHA-256. Project Gutenberg re-releases ebooks, and a
 * source that can change under the artifact is a source that cannot be
 * reproduced — the same reason `ag-quotes.mjs` pins a git commit.
 *
 * --- why the HTML and not the plain text --------------------------------------
 *
 * Because Lane distinguishes an author from a work by the FACE IT IS SET IN, and
 * nothing else. §2745: "Roman letters are used in the abbreviations of the names
 * of authors, italics in the abbreviations of the names of their works." Nine of
 * its commonest heads mean two different things depending on that — `V.` is
 * Vergil or Cicero's *in Verrem*, `L.` is Livy or the *Laelius* — so the markup
 * is not decoration here, it is the citation. `gen/lane-sources.mjs` carries the
 * rest of that argument.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFold, words } from "@lang-tutor/core";
import { loadGrammar, loadProfile, packDir, REPO } from "./lib/pack.mjs";
import { openReference } from "./lib/reference.mjs";
import { makeClassifier } from "./lib/attestation.mjs";

const EBOOK = 44653;
const URL = `https://www.gutenberg.org/files/${EBOOK}/${EBOOK}-h/${EBOOK}-h.htm`;
const SHA256 = "485e60eb2cb1a17bcb38814621a464903d9140bc36824541d8371b17909882d2";

/**
 * Part Second — "SENTENCES" — which is the only part of Lane this reads.
 *
 * Lane runs §§1-2745 in four movements, and three of them are wrong for this:
 *
 *   §§2-1022     Part First, words and their inflection. Cites authors with no
 *                locus at all (`(Plaut.)`), and prints morphological analysis
 *                with the joints marked — `met-ū-culōsu-s`, `plō-is-imo-s` —
 *                which is not a sentence and not spelled as anyone wrote it.
 *   §§1023-2428  Part Second, syntax. What this wants.
 *   §§2429-2510  Prosody: quantity, hiatus, figures of prosody.
 *   §§2511-2745  Versification, and the abbreviation list at the very end.
 *
 * The last two do quote real authors with real loci, so they would survive the
 * funnel on their own merits, and they must not: they are scanned verse, printed
 * with tie glyphs for synizesis (`tu͡om`) and macron-over-breve for a doubtful
 * quantity (`sibī̆`), neither of which the pack has any way to write. Verse is
 * already refused for the reason `scripts/lib/quotes.mjs:109` gives, and this
 * range is refused twice over.
 */
const SYNTAX_FROM = 1023;
const SYNTAX_TO = 2428;

const argv = process.argv.slice(2);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dir = packDir(argv);
const profile = loadProfile(dir);
const grammar = loadGrammar(dir);
const planning = argv.includes("--plan");
const BATCH = Number(at("--batch") ?? 25);
const MODEL = at("--model") ?? "claude-opus-4-8";
const MIN_WORDS = Number(at("--min-words") ?? 4);
const MAX_WORDS = Number(at("--max-words") ?? 22);

const configPath = join(dir, "gen", "config.mjs");
const config = existsSync(configPath)
  ? (await import(pathToFileURL(configPath).href)).default
  : {};

const sourcesPath = join(dir, "gen", "lane-sources.mjs");
if (!existsSync(sourcesPath)) {
  console.error(`This pack has no ${sourcesPath}, so no citation can be named.`);
  process.exit(2);
}
const { expandRef } = await import(pathToFileURL(sourcesPath).href);

const fold = compileFold(profile.fold);
// The pack's own content, because that is what E1 and E2 judge by. No
// dictionary: Lane is macronized, so this pool needs no marks put back.
const own = openReference(dir, profile, []);
const { classify } = makeClassifier({ profile, config, ref: own });

// --- the source ---------------------------------------------------------------

const cache = at("--src") ?? join(REPO, ".cache", `lane-${EBOOK}`, `${EBOOK}-h.htm`);
if (!existsSync(cache)) {
  console.log(`fetching Project Gutenberg #${EBOOK}...`);
  mkdirSync(dirname(cache), { recursive: true });
  execFileSync("curl", ["-sfL", URL, "-o", cache], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}
const source = readFileSync(cache);
const digest = createHash("sha256").update(source).digest("hex");
if (digest !== SHA256) {
  /*
   * Refused rather than warned about. Project Gutenberg re-releases ebooks in
   * place, and a re-release can renumber, re-wrap or re-mark the text; the
   * italic runs this reads the citations out of are exactly the kind of thing a
   * cleanup pass touches. Checking the artifact was built from the file this
   * script was written against is cheap, and finding out later is not.
   */
  console.error(
    `${cache}\n  sha256 ${digest}\n  expected ${SHA256}\n` +
      "That is not the file this script was written against. Delete the cache to\n" +
      "refetch; if Gutenberg has genuinely re-released #44653, re-measure the\n" +
      "extraction against the new one before moving this constant.",
  );
  process.exit(2);
}
const html = source.toString("utf8");

// --- reading the markup --------------------------------------------------------

/*
 * Lane's examples are more regular than A&G's, and the shape is always this:
 *
 *   <b>hōc respōnsō datō discessit</b>, 1, 14, 7, <i>this answer given he
 *   went away</i>.
 *   <b>per iocum</b>, <i>Agr.</i> 2, 96, <i>in fun</i>,
 *
 * Latin in bold, English in italic, the citation between them. One thing about
 * that is not obvious and is the whole difficulty:
 *
 *   THE CITATION'S WORK ABBREVIATION IS ITALIC TOO.
 *
 * `<i>Agr.</i>` and `<i>in fun</i>` are the same tag. Told apart by position
 * rather than by shape: Lane's citation always ends in figures, so an italic run
 * reached before any digit is the work, and the first one reached after a digit
 * is the gloss. Guessing from the content instead — short, capitalised, ends in
 * a stop — misreads `<i>made</i>` and `<i>kept</i>`, which Lane italicises in
 * running prose all through the participle sections.
 */

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
  nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", hellip: "…", aelig: "æ", oelig: "œ",
};

function flat(fragment) {
  return fragment
    .replace(/<[^>]+>/g, "")
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Lane's own section marker: `<a id = "sec1362" ...>1362.</a>`. */
const SECTION = /<a id\s*=\s*"sec(\d+)"/g;
/** A run of one tag, non-greedy, with its contents. */
const RUN = /<(b|i)\b[^>]*>([\s\S]*?)<\/\1>/g;

/**
 * What each section of Lane says, as prose.
 *
 * The evidence the filing runs on, for the reason `ag-quotes.mjs:230-244` sets
 * out at length: shown a bare sentence a model has only its surface, and the
 * surfaces of a temporal clause and an indirect question are the same. Taken as
 * everything between one section anchor and the next.
 */
function sectionProse() {
  const marks = [...html.matchAll(SECTION)].map((m) => ({
    n: Number(m[1]),
    at: m.index,
  }));
  const prose = new Map();
  for (let i = 0; i < marks.length; i++) {
    const { n, at: from } = marks[i];
    if (n < SYNTAX_FROM || n > SYNTAX_TO) continue;
    const to = i + 1 < marks.length ? marks[i + 1].at : html.length;
    if (!prose.has(n)) prose.set(n, flat(html.slice(from, to)).slice(0, 700));
  }
  return prose;
}

/** Is this bold run Lane's printed section number rather than Latin? */
const SECTION_NUMBER = /^\d+\.?$/;

/**
 * Every `<b>Latin</b> citation <i>gloss</i>` Lane prints in Part Second.
 *
 * Walked over the whole document once, tracking the section anchor last passed,
 * because Lane sets a section's examples in the paragraphs after its number
 * rather than inside one container.
 */
function examples() {
  const out = [];
  const marks = [...html.matchAll(SECTION)].map((m) => ({
    n: Number(m[1]),
    at: m.index,
  }));
  let mark = -1;
  let section = null;

  RUN.lastIndex = 0;
  for (let m = RUN.exec(html); m; m = RUN.exec(html)) {
    while (mark + 1 < marks.length && marks[mark + 1].at < m.index) {
      mark++;
      section = marks[mark].n;
    }
    if (m[1] !== "b") continue;
    if (section === null || section < SYNTAX_FROM || section > SYNTAX_TO) continue;

    const text = flat(m[2]);
    if (!text || SECTION_NUMBER.test(text)) continue;

    /*
     * Everything up to the next bold run belongs to this example. Bounded the
     * way `ag-quotes.mjs:300` bounds its gloss joiner and for the same reason: a
     * paragraph holds several examples, and a scan to the end of it collects the
     * next example's citation and calls it this one's.
     */
    const after = html.slice(RUN.lastIndex);
    const stop = after.search(/<b\b[^>]*>/);
    const region = stop < 0 ? after : after.slice(0, stop);

    // Walk the region: plain text, then italic runs, until the citation's
    // figures have been seen and the next italic run is therefore the gloss.
    const cite = [];
    const glosses = [];
    let seenDigit = false;
    let at = 0;
    const ITALIC = /<i\b[^>]*>([\s\S]*?)<\/i>/g;
    ITALIC.lastIndex = 0;
    for (let g = ITALIC.exec(region); g; g = ITALIC.exec(region)) {
      const between = flat(region.slice(at, g.index));
      if (!seenDigit) {
        cite.push(between);
        if (/\d/.test(between)) seenDigit = true;
      }
      const inner = flat(g[1]);
      if (seenDigit) {
        /*
         * The gloss ends at the first full stop between two italic runs.
         *
         * Joining every italic run up to the next bold — which is what
         * `ag-quotes.mjs` does, correctly, for A&G — swallows Lane's sub-item
         * labels, because it sets them as `(<i>b.</i>)` immediately after the
         * example they follow:
         *
         *   <i>...trumpeted in market place and council hall</i>.
         *   (<i>b.</i>)&nbsp;With <b>atque</b>, ...
         *
         * so `bewitched with Dion b.` and `council hall b.` went into the pool
         * as prompts. A length or shape test on the fragment would also catch
         * those two, and would not catch the next thing Lane italicises in a
         * parenthesis. The stop is the real boundary: Lane's alternative
         * renderings — `<i>by letter</i>, <i>in writing</i>` — are separated by
         * a comma, and its literal-beside-free renderings by an unmarked
         * parenthesis, never by the end of a sentence. Question marks count:
         * Lane glosses a good many of its examples as questions, and `A B C's? b.`
         * is the same defect as `council hall b.`
         *
         * Applied only BETWEEN gloss fragments. The text before the first one is
         * the citation, and `L. 5, 27, 11,` is full of stops that mean an
         * abbreviation rather than the end of anything.
         *
         * Two conditions, because Lane puts the mark on either side of the tag.
         * `...council hall</i>. (<i>b.</i>)` leaves the stop in the text between
         * the runs; `...your A B C's?</i> (<i>b.</i>)` keeps it inside the run
         * and leaves only `(` between them. Checking only the gap fixed the
         * first twelve of these and left the other twelve.
         */
        if (
          glosses.length &&
          (/[.?!]/.test(flat(region.slice(at, g.index))) ||
            /[.?!]["'’)]?$/.test(glosses[glosses.length - 1]))
        ) {
          break;
        }
        glosses.push(inner);
      } else {
        // Lane's own convention, kept in the string the expander reads.
        cite.push(`_${inner}_`);
      }
      at = ITALIC.lastIndex;
    }
    if (!seenDigit) cite.push(flat(region.slice(at)));

    out.push({
      section,
      text,
      ref: cite.join(" ").replace(/\s+/g, " ").trim(),
      gloss: glosses.join(" ").replace(/\s+/g, " ").trim(),
      parts: glosses,
    });
  }
  return out;
}

// --- the funnel ----------------------------------------------------------------

/*
 * Ordered as the checks are applied, so the numbers read as a funnel rather than
 * as a tally: each count is of what reached that check and failed it.
 */
const funnel = {
  tooShort: 0,
  tooLong: 0,
  uncited: 0,
  elided: 0,
  analysed: 0,
  annotated: 0,
  doubtfulQuantity: 0,
  tied: 0,
  glossTooShort: 0,
  glossTooLong: 0,
  glossNotEnglish: 0,
  glossDoubled: 0,
  verse: 0,
  unattested: 0,
  duplicate: 0,
};

/** Lane's mark of omission. An answer with a hole in it is not a sentence. */
const ELLIPSIS = /\[…\]|\.\.\.|…|—\s*—/;
/**
 * Lane's morphological hyphen, which is not how anybody spelled the word.
 *
 * `met-ū-culōsu-s`, `plō-is-imo-s`, `-clo-`: Part First's way of showing where a
 * stem joins its suffix. Part Second is not supposed to hold any, and mostly
 * does not, but the word-formation cross-references reach into it.
 */
const ANALYSED = /\w-\w|^-|-$/;
/**
 * Macron over breve — Lane's mark for a quantity that varies.
 *
 * `sibī̆`, `tibī̆`: the book is saying the vowel is long in some authors and
 * short in others. The pack has one mark or none, so writing either would be
 * asserting something Lane declined to assert, and writing both is not a
 * spelling. Dropped, and counted, the way `ag-quotes.mjs` drops A&G's
 * circumflex — the same class of decision, and the same reason no gate could
 * catch a guess: the fold strips the mark before attestation ever sees it.
 */
const DOUBTFUL_QUANTITY = /[̄][̆]|[̆][̄]/;
/** The tie of synizesis — `tu͡om`, `fu͡isse` — scansion, not spelling. */
const TIE = /͡/;

/*
 * `--why <reason>` prints what a bucket actually caught. Every filter here is a
 * judgement about English or about Lane's typography rather than a fact the
 * gates can check, so the only way to know one is right is to read what it threw
 * away. `ag-quotes.mjs` records that three of its filters were wrong the first
 * time and that this is what showed it.
 */
const why = at("--why");
const samples = [];
const seen = new Set();
const pool = [];

function reject(reason, ex, note) {
  funnel[reason]++;
  if (why === reason && samples.length < 25) samples.push({ ...ex, note });
}

/**
 * Put back the stop Lane sets outside the quotation.
 *
 * Cosmetic, and it still has to be done. Every one of the pack's 7,470 answers
 * ends in a stop, because A&G and the dictionary dump both quote with one; a
 * Lane answer that ended bare would be the odd one on a screen beside them, and
 * that is a defect only a reader can catch — the same argument
 * `scripts/lib/macronize.mjs` makes about shipping unmarked Latin beside marked.
 *
 * A full stop is the right mark because the gloss ratio has already refused the
 * abridgements: what survives stands on its own. Lane punctuates its direct
 * questions inside the bold, so those already carry a `?` and are left alone.
 */
function stopped(s) {
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/**
 * Words too ordinary to mean a gloss is restating itself.
 *
 * Lifted from `ag-quotes.mjs:223`, and load-bearing for the same reason: a
 * continuation shares these with its first half all the time, while a
 * restatement shares the nouns and verbs that carry the sentence.
 */
const GLOSS_STOP = new Set([
  "that", "this", "these", "those", "with", "from", "have", "has", "had", "been",
  "were", "will", "would", "shall", "should", "when", "what", "whom", "which",
  "there", "their", "them", "they", "then", "than", "into", "upon", "your",
  "himself", "herself", "itself", "themselves", "does", "did", "not",
]);
const GLOSS_CROSS_REFERENCE = /^(§|cf\.|q\.v\.|sc\.|i\.e\.|N\.B\.|see\s*§)/i;

for (const ex of examples()) {
  /*
   * A&G's sentence test is not reusable here, and finding that out cost the
   * first run of this script: it kept 4 examples out of 8,600.
   *
   * A&G sets the stop inside the quotation and capitalises what it quotes.
   * Lane sets the stop OUTSIDE the bold run — `<b>...discessit</b>, 1, 14, 7,` —
   * and lowercases the first word whenever the original is not sentence-initial.
   * So "starts with a capital and ends with a stop" selected only the direct
   * questions, which are the one shape Lane does punctuate inside the bold.
   *
   * What replaces it is the gloss ratio below, and that is the better test
   * anyway. Lane quotes clauses as often as sentences, and a clause is not a
   * defect here — `cum tanta multitūdō lapidēs conicerent` / "when such a throng
   * were throwing stones" is the canonical drill for `cum` with the subjunctive,
   * which is the same argument REVIEW.md makes for A&G's phrases in the case
   * topics. What is a defect is a gloss that translates more than the Latin
   * beside it, and that is measurable where "is this a sentence" is not.
   */
  const text = ex.text;
  const n = words(text).length;
  if (n < MIN_WORDS) {
    reject("tooShort", ex);
    continue;
  }
  if (n > MAX_WORDS) {
    reject("tooLong", ex);
    continue;
  }
  /*
   * Counted after the length checks, not before them as `ag-quotes.mjs` counts
   * it, because the two books bold different things. A&G bolds its examples;
   * Lane bolds every Latin word it mentions anywhere in its prose, so 7,786 of
   * the 8,600 runs in Part Second are a word or two under discussion rather than
   * a quotation. Put first, `uncited` swallows all of them and the funnel says
   * nothing about how many real examples went unnamed. Put here, it counts only
   * sentence-shaped Latin whose citation this could not read — which is the
   * number worth watching, and the one to point `--why` at.
   */
  const source = expandRef(ex.ref);
  if (!source) {
    reject("uncited", ex);
    continue;
  }
  if (ELLIPSIS.test(text)) {
    reject("elided", ex);
    continue;
  }
  if (ANALYSED.test(text)) {
    reject("analysed", ex);
    continue;
  }
  /*
   * Anything in the Latin that the author did not write.
   *
   * Two things get in, and neither is visible to attestation, because `clean()`
   * strips a token to letters before looking it up: a digit becomes the empty
   * string and is waved through as `empty`, and a parenthesis is punctuation.
   * So both of these were in the pool with every gate green.
   *
   *   quō factō duās rēs cōnsecūtus est, quod animōs centuriōnum 313
   *     — Lane's cross-reference to its own §313, inside the quotation
   *   lēgātus capite vēlātō fīlō (lānae vēlāmen est) audī, Iuppiter
   *     — Lane explaining `fīlō` to the reader, mid-sentence
   *
   * A student shown either would be asked to write a section number, or an
   * editor's aside, as though Livy had. Dropped rather than repaired: stripping
   * them would leave a sentence nobody printed, and the pool is not the binding
   * constraint.
   */
  if (/\d/.test(text) || /[[\]()]/.test(text)) {
    reject("annotated", ex);
    continue;
  }
  if (DOUBTFUL_QUANTITY.test(text.normalize("NFD"))) {
    reject("doubtfulQuantity", ex);
    continue;
  }
  if (TIE.test(text.normalize("NFD"))) {
    reject("tied", ex);
    continue;
  }

  /*
   * The gloss becomes the prompt verbatim, so it has to be a translation rather
   * than a fragment or a pointer. `ag-quotes.mjs:414-431` records the check that
   * was tried here and thrown away — rejecting a gloss that contains a word of
   * its own Latin — and why: Latin lends English too many words for it to mean
   * anything, and it caught 71 false positives and no true ones.
   */
  const gloss = ex.gloss
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe")
    .replace(/\s*\([^)]{0,40}\)\s*$/, "")
    .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
    .trim();
  if (!gloss || GLOSS_CROSS_REFERENCE.test(gloss) || gloss.endsWith(":")) {
    reject("glossNotEnglish", ex, "cross-reference");
    continue;
  }
  const glossWords = gloss.split(/\s+/).length;
  if (glossWords < 0.6 * n) {
    reject("glossTooShort", ex);
    continue;
  }
  /*
   * And the other end of the same band, which is the check that replaces A&G's
   * sentence test and does more work than it did.
   *
   * Lane abridges the Latin far more freely than A&G does, and when it abridges
   * it still glosses the whole of what it abridged. §1060 prints
   * `et minus facile fīnitimīs bellum īnferre possent` — seven words — under
   * "so it came to pass that, in the first place, they did not roam round much,
   * and secondly, they could not so easily make aggressive war on their
   * neighbours", which is thirty and is Caesar's whole period. As a question
   * that is unanswerable: no student writes those seven words from that English,
   * and every automated check in the tree passes it, because the Latin is
   * genuinely Caesar's and genuinely attested.
   *
   * English runs about 1.3 to 1.6 times the word count of the Latin it renders,
   * and Lane's own verbose renderings of correlatives ("in the first place …
   * and secondly" for `et … et`) reach about 2.2. The bar is set above that, so
   * it catches abridgement rather than style.
   */
  if (glossWords > 2.5 * n) {
    reject("glossTooLong", ex, `${n} Latin, ${glossWords} English`);
    continue;
  }
  /*
   * A gloss that says it twice. Lane prints a free rendering and then a literal
   * one — `by letter`, `in writing` — as two italic runs with nothing between
   * them to say which is which. Both are true and the pair is a bad prompt.
   * Told apart by whether the later runs restate the first or continue it,
   * which is what sharing content words means.
   */
  const content = (s) =>
    new Set(s.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !GLOSS_STOP.has(w)) ?? []);
  if (ex.parts.length > 1) {
    const first = content(ex.parts[0]);
    const later = content(ex.parts.slice(1).join(" "));
    const shared = [...later].filter((w) => first.has(w));
    if (shared.length >= 2) {
      reject("glossDoubled", ex, shared.join(" "));
      continue;
    }
  }

  if (source.verse && !argv.includes("--verse")) {
    reject("verse", ex);
    continue;
  }

  const tokens = words(text);
  const first = tokens[0] ?? "";
  const missed = tokens.filter((t) => classify(t, first).verdict !== "ok");
  if (missed.length) {
    reject("unattested", ex, missed.join(" "));
    continue;
  }

  // Lane reuses a favourite sentence across sections as readily as A&G does.
  const key = tokens.map((t) => fold(t)).join(" ");
  if (seen.has(key)) {
    reject("duplicate", ex);
    continue;
  }
  seen.add(key);

  pool.push({ text: stopped(text), gloss: stopped(gloss), source, section: String(ex.section) });
}

console.log(`\n${profile.id} — Lane, Project Gutenberg #${EBOOK}\n`);
console.log(`  §§${SYNTAX_FROM}-${SYNTAX_TO} read (Part Second, syntax)`);
for (const [reason, n] of Object.entries(funnel)) {
  if (n) console.log(`  ${String(n).padStart(6)} ${reason}`);
}
console.log(`  ${pool.length} sentences cost the gates nothing and can be filed.`);

if (why) {
  console.log(`\n  ${funnel[why] ?? 0} dropped as ${why}; the first ${samples.length}:`);
  for (const s of samples) {
    console.log(`    §${s.section} ${s.text}`);
    console.log(`       ${s.ref ? `[${s.ref}] ` : ""}${s.gloss}${s.note ? `   {${s.note}}` : ""}`);
  }
}

const outPath = join(dir, "content", "lane-quotes.jsonl.gz");

/*
 * `--pool <file>` writes what survived the funnel, unfiled, and stops.
 *
 * This exists for the one check a new grammar has to pass before a model is
 * spent on it, and which nothing else in the tree can do: whether the book
 * QUOTES its authors or RECASTS them. `REVIEW.md` records Bennett's index
 * matching at 80% and being wrong anyway, because it named what an illustration
 * was drawn from rather than what anyone wrote, and the only thing that caught
 * it was corroboration against real text. A&G was held to the same test before
 * its pipeline was written. So is this.
 *
 * `verify-attribution.mjs` does that job for shipped questions; it cannot reach
 * a pool that has not been filed yet, and filing is the expensive half.
 */
const poolPath = at("--pool");
if (poolPath) {
  writeFileSync(
    poolPath,
    `${pool.map((q) => JSON.stringify({ text: q.text, prompt: q.gloss, source: q.source, lane: q.section })).join("\n")}\n`,
  );
  console.log(`\nwrote the unfiled pool to ${poolPath}`);
  own.close();
  process.exit(0);
}

// --- the one thing a model is for ----------------------------------------------

/*
 * Filed by section, not by sentence. `ag-quotes.mjs:530-551` and `REVIEW.md`
 * both record why at length: per-sentence filing scattered the sentences of 64
 * of 147 A&G sections across two topics or more, because a model shown a bare
 * sentence has only its surface and the surfaces collide. Lane prints each
 * example under a section that explains the construction, so the section is the
 * unit that carries the answer.
 */

const topicIds = new Set(grammar.map((t) => t.id));
const topicRanges = grammar
  .map((t) => {
    const m = String(t.ref).match(/^(\d+)(?:\s*-\s*(\d+))?/);
    return m ? { id: t.id, lo: Number(m[1]), hi: Number(m[2] ?? m[1]) } : null;
  })
  .filter(Boolean);
const titleOf = new Map(grammar.map((t) => [t.id, t.title]));

/** The syllabus id an answer meant — the same reading the other two builders do. */
function resolveTopic(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (topicIds.has(v)) return v;
  const prefixed = grammar.filter((t) => t.id.startsWith(`${v}-`));
  if (prefixed.length === 1) return prefixed[0].id;
  const m = v.match(/(\d+)/);
  if (m) {
    const n = Number(m[1]);
    const inRange = topicRanges.filter((t) => n >= t.lo && n <= t.hi);
    if (inRange.length === 1) return inRange[0].id;
  }
  return null;
}

const index = grammar
  .map((t) => `${t.id}\t${profile.grammar.refPrefix}${t.ref} ${t.title}`)
  .join("\n");

const SYSTEM = `You are matching the sections of one Latin grammar onto the topics
of another.

The syllabus is Bennett's, and it is what the pack teaches:
${index}

You will be given numbered sections of Lane's Latin Grammar — the text of the
section, and the sentences it prints to illustrate it. For each, return:
  "id"      — the number you were given
  "topics"  — 1 or 2 Bennett ids whose grammar point that Lane section teaches.
              Judge by what the SECTION is about, not by what any one sentence
              looks like on its surface: a subordinate clause with a subjunctive
              verb may be a temporal clause, an indirect question, a clause of
              result or of purpose, and these are different topics. Prefer the
              most specific. If no Bennett topic covers it, return an empty
              list — a section filed under a topic it does not teach is worse
              than one filed nowhere.

Output ONLY a JSON object: {"items":[{"id":1362,"topics":["bn-..."]}]}`;

function callClaude(prompt) {
  const out = execFileSync(
    "claude",
    ["-p", prompt, "--append-system-prompt", SYSTEM, "--model", MODEL,
      "--output-format", "json", "--tools", ""],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
  );
  const envelope = JSON.parse(out);
  if (envelope.is_error) {
    throw new Error(String(envelope.result ?? "claude -p error").slice(0, 300));
  }
  const text = (envelope.result ?? "").trim();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON in result");
  return JSON.parse(text.slice(s, e + 1)).items ?? [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BACKOFF = [30, 60, 120, 300, 600];

/** A limit no ladder can outlast, told apart from a failure worth retrying. */
function usageLimit(err) {
  const text = `${err.stdout ?? ""}\n${err.message ?? ""}`;
  if (!/session limit|usage limit|"api_error_status":\s*429/.test(text)) return null;
  return text.match(/"result":"([^"]+)"/)?.[1] ?? "usage limit reached";
}

// --- the map ------------------------------------------------------------------

/*
 * Committed, and read before anything is asked. A section already in it is never
 * asked about again, so correcting a row by hand is a change the pipeline keeps
 * rather than overwrites on the next run — which is the point of having a
 * reviewable map at all.
 */
const mapPath = join(dir, "grammar", "lane-topics.tsv");
const HEADER = "lane_section\tbn_topics\tlane_says\tbn_says";

function readMap() {
  const out = new Map();
  if (!existsSync(mapPath)) return out;
  for (const line of readFileSync(mapPath, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("lane_section\t")) continue;
    const [section, topics] = line.split("\t");
    out.set(section, topics ? topics.split(",").filter(Boolean) : []);
  }
  return out;
}

const prose = sectionProse();
const bySection = new Map();
for (const q of pool) {
  if (!bySection.has(q.section)) bySection.set(q.section, []);
  bySection.get(q.section).push(q);
}
const sections = [...bySection.keys()].sort((a, b) => Number(a) - Number(b));

const map = readMap();
const ask = sections.filter((s) => !map.has(s));
console.log(
  `\n  ${sections.length} Lane sections carry these sentences; ` +
    `${sections.length - ask.length} already in ${mapPath}, ${ask.length} to ask about.`,
);

if (planning) {
  const blank = sections.filter((s) => !prose.get(Number(s))).length;
  console.log(`  ${blank} of them have no readable text; those would be asked on their sentences alone.`);
  const step = Math.max(1, Math.floor(sections.length / 3));
  for (let i = 0; i < sections.length; i += step) {
    const s = sections[i];
    console.log(`\n    §${s} — ${bySection.get(s).length} sentence(s)`);
    console.log(`      ${(prose.get(Number(s)) ?? "(unreadable)").slice(0, 220)}`);
    for (const q of bySection.get(s).slice(0, 2)) {
      console.log(`        ${q.text}`);
      console.log(`          ${q.gloss}   — ${q.source.author}, ${q.source.work} ${q.source.locus ?? ""}`);
    }
  }
  console.log(`\n  ${Math.ceil(ask.length / BATCH)} calls would be made. Stopping.`);
  own.close();
  process.exit(0);
}

for (let start = 0; start < ask.length; start += BATCH) {
  const batch = ask.slice(start, start + BATCH);
  const body = batch
    .map((s) => {
      const said = prose.get(Number(s)) ?? "(the section's text could not be read)";
      const shown = bySection.get(s).slice(0, 4).map((q) => `     ${q.text}`).join("\n");
      return `${s}. ${said}\n   it illustrates this with:\n${shown}`;
    })
    .join("\n\n");

  let items = null;
  for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
    try {
      items = callClaude(`Match these ${batch.length} Lane sections:\n\n${body}`);
      break;
    } catch (err) {
      const limit = usageLimit(err);
      if (limit) {
        // Whatever was answered is already in the map on disk, so this costs the
        // batch in flight and nothing else.
        console.error(
          `\nStopping: ${limit}\n` +
            `  ${map.size} sections are saved in ${mapPath}.\n` +
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

  for (const item of items ?? []) {
    const section = String(item.id ?? "").trim();
    if (!bySection.has(section)) continue;
    map.set(
      section,
      [...new Set((item.topics ?? []).map(resolveTopic).filter(Boolean))].slice(0, 2),
    );
  }
  // Written after every batch, so the map is the resume.
  const rows = [...map]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([s, topics]) => {
      const said = (prose.get(Number(s)) ?? "").replace(/\s+/g, " ").slice(0, 90);
      const titles = topics.map((t) => titleOf.get(t) ?? "?").join("; ");
      return `${s}\t${topics.join(",")}\t${said}\t${titles}`;
    });
  writeFileSync(mapPath, `${[HEADER, ...rows].join("\n")}\n`);
  console.log(`  ${Math.min(start + BATCH, ask.length)}/${ask.length} sections matched`);
}

// --- file every sentence from the map ------------------------------------------

const filed = [];
let unmapped = 0;
for (const section of sections) {
  const topics = map.get(section) ?? [];
  if (!topics.length) {
    unmapped += bySection.get(section).length;
    continue;
  }
  for (const q of bySection.get(section)) {
    filed.push({
      text: q.text,
      topics,
      prompt: q.gloss,
      source: q.source,
      // Lane's own section. It is what the filing was decided from, so it is
      // also what a reviewer reads the filing back against.
      lane: section,
    });
  }
}

writeFileSync(outPath, gzipSync(filed.map((q) => JSON.stringify(q)).join("\n"), { level: 9 }));
console.log(`\nwrote ${filed.length} quotations to ${outPath}`);
if (unmapped) {
  console.log(`  ${unmapped} in sections no Bennett topic covers, dropped`);
}
console.log(`  ${new Set(filed.flatMap((q) => q.topics)).size} of ${grammar.length} topics named`);
console.log(`  the map a reviewer reads: ${mapPath}`);
own.close();
