/**
 * Latin quotations recovered from Allen & Greenough, and filed under topics.
 *
 *   node --import tsx scripts/ag-quotes.mjs --pack languages/latin [--plan]
 *
 * Writes `content/ag-quotes.jsonl.gz`, a second pool beside the dictionary
 * dump's `quotes.jsonl.gz` and in the same schema. `quote-tests.mjs --from
 * quotes` reads both.
 *
 * --- why a second pool at all ------------------------------------------------
 *
 * `build-quote-pool.mjs` exists because Bennett cites nobody, so Latin's
 * quotations had to be recovered from a 1.2 GB dictionary dump and matched to
 * topics from scratch. Allen & Greenough is the Latin book that does what Smyth
 * does for Greek: it prints a real sentence, credits it, and translates it. So
 * this route asks a model for one thing rather than three —
 *
 *     which topics a quotation exemplifies   still a model call
 *     which spelling an ambiguous word takes  not needed; A&G is macronized
 *     an English prompt                       not needed; A&G glosses it
 *
 * — and, because macron restoration is the only reason `build-quote-pool.mjs`
 * demands the dictionary backend, this script needs no dictionary at all. It
 * attests against the pack's own committed content, which is what E1 and E2
 * judge by anyway.
 *
 * --- the source, and what is public domain in it ------------------------------
 *
 * Allen & Greenough, "New Latin Grammar for Schools and Colleges" (Boston,
 * 1903) — the text is public domain. The digitization is the Perseus Project's
 * TEI as edited and published by Dickinson College Commentaries, mirrored as
 * HTML by the Alpheios Project, and is CC BY-NC-SA 3.0. The same project, and
 * the same licence, that `languages/ancient-greek/grammar/parse.py` already
 * takes Smyth from.
 *
 * The commit is pinned. A source that can change under the artifact is a source
 * that cannot be reproduced.
 *
 * --- what A&G was checked for before any of this was written ------------------
 *
 * `REVIEW.md` records that Bennett's index of sources was parsed, matched at
 * 80%, and thrown away: it names what an illustration was *drawn from*, not a
 * verbatim quotation, and only 4 of 54 of its Caesar citations were really
 * Caesar's words. So A&G was held to the same test before it was trusted.
 *
 * Of the 50 surviving sentences citing the four books of *de Bello Gallico* the
 * reference corpus holds, asking what fraction of A&G's words appear in Caesar
 * in order: 34 at 90% or better, 15 between 65% and 90%, and one below — A&G's
 * own ellipsis, correctly marking an omission. A&G abridges, the way Smyth
 * abridges. It does not invent.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFold, words } from "@lang-tutor/core";
import { loadGrammar, loadProfile, packDir, REPO } from "./lib/pack.mjs";
import { openReference } from "./lib/reference.mjs";
import { makeClassifier } from "./lib/attestation.mjs";

const REPOSITORY = "alpheios-project/grammar-allen-greenough";
const COMMIT = "faff261710872b42623c010635354b79e3bf350b";

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

const sourcesPath = join(dir, "gen", "sources.mjs");
if (!existsSync(sourcesPath)) {
  console.error(`This pack has no ${sourcesPath}, so no citation can be named.`);
  process.exit(2);
}
const { expandRef } = await import(pathToFileURL(sourcesPath).href);

const fold = compileFold(profile.fold);
// The pack's own content, because that is what E1 and E2 judge by. No
// dictionary: A&G supplies the marks this pool would otherwise need one for.
const own = openReference(dir, profile, []);
const { classify } = makeClassifier({ profile, config, ref: own });

// --- the source ---------------------------------------------------------------

const cache = at("--src") ?? join(REPO, ".cache", `allen-greenough-${COMMIT.slice(0, 7)}`);
if (!existsSync(cache)) {
  console.log(`fetching ${REPOSITORY} at ${COMMIT.slice(0, 7)}...`);
  mkdirSync(cache, { recursive: true });
  // One tarball at a pinned commit, not 66 live requests against a moving
  // branch: the artifact has to be reproducible from what this line names.
  execFileSync(
    "sh",
    [
      "-c",
      `curl -sfL https://codeload.github.com/${REPOSITORY}/tar.gz/${COMMIT} | ` +
        `tar -xz -C ${JSON.stringify(cache)} --strip-components=1 --include='*.htm'`,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
}
const files = readdirSync(cache).filter((f) => f.endsWith(".htm")).sort();
if (!files.length) {
  console.error(`No .htm files in ${cache}. Delete it and rerun to refetch.`);
  process.exit(2);
}

// --- reading the markup --------------------------------------------------------

/*
 * A&G's examples are regular, and three things about them are not obvious. Each
 * cost a wrong answer before it was handled.
 *
 *   <p><span class="foreign">Caesar <span underline>Rhēnum</span> trānsīre
 *      dēcrēverat.</span></strong> (B. G. 4.17)<br>
 *      <span class="gloss">Cæsar had determined to cross the Rhine.</span></p>
 *
 * ONE. The foreign span NESTS — the word the section is teaching sits in an
 * underline span inside it — so the first `</span>` is not the end of the
 * Latin. Depth has to be counted.
 *
 * TWO. The section number is set once, in its own paragraph, and every example
 * under it inherits it. Read per paragraph it is null for most of them.
 *
 * THREE. The gloss is SPLIT across several `class="gloss"` runs, around A&G's
 * own literal rendering, which is not classed:
 *
 *   <span class="gloss">My delight is</span> (it pleases me)
 *     <span class="gloss">to arrange words in measure.</span>
 *
 * Taking the first run alone silently truncates the prompt to "My delight is",
 * and an English prompt that says something other than the Latin beside it is
 * the one failure attestation cannot catch. Every fragment is joined and the
 * unclassed text between them dropped.
 */

const TAG = /<[^>]+>/g;
const SPAN = /<(\/?)span\b[^>]*>/g;
/**
 * A&G's section number, taken from what it printed rather than from the anchor.
 *
 * The anchor is not the number. Only 154 of 729 are `<a id="343">`; 288 are
 * `<a id="sect2">` and the rest are topical mnemonics — `abl1`, `dat1`, `dc3` —
 * with the section number set beside them as `<strong>339.</strong>`. Keying on
 * a numeric id, as this first did, does not merely lose those: the last numeric
 * anchor carries forward, so an example gets filed under a section it is
 * nowhere near, which is worse than filing it under none.
 *
 * The printed number is unambiguous except that footnotes and sub-items print
 * one too (`1.`, `2.`), and A&G's sections only ever climb. So a number that
 * does not exceed the last one seen in this chapter is not a section.
 */
const SECTION = /<a id="[^"]+"[^>]*>\s*(?:<strong>)?\s*(\d+)\s*\./g;
const LAST_SECTION = 642;
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

function flat(html) {
  return html
    .replace(TAG, "")
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of the span opening at `i`, and the offset past its close. */
function spanAt(html, i) {
  const open = html.indexOf(">", i) + 1;
  let depth = 1;
  let from = open;
  let last = html.length;
  SPAN.lastIndex = open;
  while (depth > 0) {
    const m = SPAN.exec(html);
    if (!m) return { text: flat(html.slice(open)), end: html.length };
    depth += m[1] ? -1 : 1;
    last = m.index;
    from = SPAN.lastIndex;
  }
  return { text: flat(html.slice(open, last)), end: from };
}

// The citation, between the Latin and the gloss, after whatever bold closes.
const CITATION = /^\s*(?:<\/(?:strong|em|b)>\s*)*\(\s*([^)<]{2,40}?)\s*\)/;
/**
 * A parenthesis that points at the grammar rather than at an author.
 *
 * `id.` and `ib.` mean "the last one again"; resolving them against the
 * preceding citation is possible and is not attempted here, so they are
 * dropped with everything else this catches.
 */
const CROSS_REFERENCE = /^(§|cf|see|sc\b|i\.e|N\.B|id\b|ib\b)/i;
/**
 * The same idea for a gloss, and deliberately much narrower.
 *
 * The citation form above cannot be reused: it drops anything opening `see`,
 * and A&G glosses imperatives that way — `Fac ut valētūdinem cūrēs.` is "See
 * that you take care of your health", an English sentence and not a pointer.
 * So a bare word is not enough; the stop has to be there too.
 */
const GLOSS_CROSS_REFERENCE = /^(§|cf\.|q\.v\.|sc\.|i\.e\.|N\.B\.|see\s*§)/i;
/**
 * Words too ordinary to mean a gloss is restating itself.
 *
 * A continuation shares these with its own first half all the time — "he",
 * "that", "which" — while a restatement shares the nouns and verbs that carry
 * the sentence. Only the latter is evidence.
 */
const GLOSS_STOP = new Set([
  "that", "this", "these", "those", "with", "from", "have", "has", "had", "been",
  "were", "will", "would", "shall", "should", "when", "what", "whom", "which",
  "there", "their", "them", "they", "then", "than", "into", "upon", "your",
  "himself", "herself", "itself", "themselves", "been", "does", "did", "not",
]);

/**
 * What each section of A&G says, as prose.
 *
 * This is the evidence the filing runs on, and leaving it out is what made the
 * first attempt wrong. Asked to place a bare sentence, a model has only the
 * sentence's surface to go on, and `Quid ipse sentiam expōnam` looks like
 * `Exspectās fortasse dum dīcat` — subordinate clause, subjunctive verb — while
 * being an indirect question rather than a temporal clause. A&G already knows
 * the difference, because it printed each under a section that explains it.
 *
 * Taken as everything between one accepted section anchor and the next, rather
 * than from a heading pattern: the headings are set half a dozen different ways
 * and only 42% of them can be matched, while the span between anchors is always
 * there.
 */
function sectionProse() {
  const prose = new Map();
  for (const file of files) {
    const html = readFileSync(join(cache, file), "utf8");
    const marks = [];
    let highest = 0;
    for (const m of html.matchAll(SECTION)) {
      const n = Number(m[1]);
      if (n > highest && n <= LAST_SECTION) {
        highest = n;
        marks.push({ n: m[1], at: m.index });
      }
    }
    for (let i = 0; i < marks.length; i++) {
      const to = i + 1 < marks.length ? marks[i + 1].at : html.length;
      // The Latin examples are in this span too and are shown separately, so
      // what matters here is A&G's English explanation around them.
      const text = flat(html.slice(marks[i].at, to)).slice(0, 700);
      if (!prose.has(marks[i].n)) prose.set(marks[i].n, text);
    }
  }
  return prose;
}

function examples() {
  const out = [];
  for (const file of files) {
    const html = readFileSync(join(cache, file), "utf8");
    let section = null;
    let highest = 0;
    for (const chunk of html.split(/(?=<p\b)|(?=<td\b)/)) {
      for (const m of chunk.matchAll(SECTION)) {
        const n = Number(m[1]);
        if (n > highest && n <= LAST_SECTION) {
          highest = n;
          section = m[1];
        }
      }
      const i = chunk.indexOf('<span class="foreign"');
      if (i < 0) continue;
      const latin = spanAt(chunk, i);
      const rest = chunk.slice(latin.end);

      // Every gloss fragment in the paragraph, joined.
      const parts = [];
      /*
       * Bounded by where the NEXT example starts.
       *
       * A chunk is a paragraph or a table cell and can hold more than one
       * example, so a joiner that scans to the end of it collects the next
       * example's gloss too: `Rērum cōpia verbōrum cōpiam gignit.` came out as
       * "ABUNDANCE of MATTER produces COPIOUSNESS of EXPRESSION. The laws VISIT
       * PUNISHMENTS upon the WICKED..." — two sentences, two examples, one
       * prompt. Joining the fragments was right; joining across the boundary
       * was not.
       */
      const next = rest.indexOf('<span class="foreign"');
      const mine = next < 0 ? rest : rest.slice(0, next);
      let at = 0;
      for (;;) {
        const g = mine.indexOf('<span class="gloss"', at);
        if (g < 0) break;
        const piece = spanAt(mine, g);
        parts.push(piece.text);
        at = piece.end;
      }
      if (!parts.length) continue;

      const cite = CITATION.exec(rest);
      out.push({
        chapter: file.replace(/\.htm$/, ""),
        section,
        text: latin.text,
        gloss: parts.join(" ").replace(/\s+/g, " ").trim(),
        // Kept apart as well as joined: whether the later runs continue the
        // first or restate it is the difference between a prompt and a doubled
        // prompt, and it cannot be recovered once they are one string.
        parts,
        ref: cite ? flat(cite[1]) : null,
      });
    }
  }
  return out;
}

// --- the funnel ----------------------------------------------------------------

/*
 * Ordered as the checks are applied, so the numbers read as a funnel rather
 * than as a tally: each count is of what reached that check and failed it.
 */
const funnel = {
  uncited: 0,
  notASentence: 0,
  tooShort: 0,
  tooLong: 0,
  elided: 0,
  circumflex: 0,
  glossTooShort: 0,
  glossDoubled: 0,
  glossNotEnglish: 0,
  refUnnamed: 0,
  verse: 0,
  unattested: 0,
  duplicate: 0,
};

/** A&G's own mark of omission. An answer with a hole in it is not a sentence. */
const ELLIPSIS = /\[…\]|\.\.\.|…/;
/**
 * A&G's circumflex, which the pack has no way to resolve.
 *
 * The book writes `Pompêī`, `cûius` where the pack writes a macron, and nothing
 * committed can turn one into the other: the keys in `content/forms.txt.gz` are
 * fold output with the marks already stripped, so the index cannot tell `Pompēī`
 * from `Pompêī`, and `spellingsOf` needs the dictionary backend. Mapping ê to ē
 * would be a guess that no gate could catch, because the fold strips the mark
 * before attestation ever sees it. `pack.test.ts` records what that costs: 26 of
 * 383 quoted answers once read `ēst` "he eats" where the author wrote `est`
 * "is", and nothing saw it. So these are dropped and counted.
 */
const CIRCUMFLEX = /[âêîôûŷÂÊÎÔÛŶ]/;

/*
 * `--why <reason>` prints what a bucket actually caught. Every filter here is a
 * judgement about English or about A&G's typography rather than a fact the
 * gates can check, so the only way to know one is right is to read what it
 * threw away. Three of them were wrong the first time and this is what showed
 * it.
 */
const why = at("--why");
const samples = [];
const seen = new Set();
const pool = [];

/** Count a rejection, and keep the first few of the bucket being asked about. */
function reject(reason, ex, note) {
  funnel[reason]++;
  if (why === reason && samples.length < 25) samples.push({ ...ex, note });
}

for (const ex of examples()) {
  if (!ex.ref || CROSS_REFERENCE.test(ex.ref) || !/\d/.test(ex.ref)) {
    funnel.uncited++;
    continue;
  }
  const text = ex.text;
  if (!/^[A-ZĀĒĪŌŪȲÂÊÎÔÛ]/.test(text) || !/[.!?]$/.test(text)) {
    funnel.notASentence++;
    continue;
  }
  const n = words(text).length;
  if (n < MIN_WORDS) {
    funnel.tooShort++;
    continue;
  }
  if (n > MAX_WORDS) {
    funnel.tooLong++;
    continue;
  }
  if (ELLIPSIS.test(text)) {
    funnel.elided++;
    continue;
  }
  if (CIRCUMFLEX.test(text)) {
    funnel.circumflex++;
    continue;
  }

  /*
   * The gloss becomes the prompt verbatim, so it has to be a translation rather
   * than a fragment or a pointer. Two checks, and one that was tried and thrown
   * away.
   *
   * Greek can reject a gloss for being Latin (`parse.py:219`); Latin cannot,
   * because its text and its gloss share an alphabet. The obvious substitute —
   * reject a gloss containing a word of its own Latin — was written, run, and
   * removed: every single thing it caught was English. `consul`, `orator`,
   * `animal`, `dictator`, `denarii`, `silent`, and `me` against `mē`. Latin
   * lends English too many words for that test to mean anything, and at 71
   * false positives and no true ones it was buying nothing with real content.
   */
  /*
   * `Cæsar`, `Pœtina`, `Œdipus` — 1903's way of setting an English word, not a
   * choice A&G made about what the Latin means. Undone here for the same reason
   * Smyth's marks of vowel quantity are taken off in `quote-tests.mjs`: the
   * prompt sits on screen beside 6,581 others and should not be the odd one.
   * Only the gloss. The Latin is left exactly as printed.
   */
  const gloss = ex.gloss
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe")
    // A&G's marginal apparatus, which the gloss spans pick up alongside the
    // translation: a bracketed label (`[Causal]`), or the ragged tail of a
    // cross-reference whose opening bracket is outside the span (`563)]`).
    .replace(/\s*\[[^\]]{0,30}\]\s*$/, "")
    .replace(/\s*\S{0,8}\)?\]\s*$/, "")
    .replace(/^\(|\)$/g, "")
    .trim();
  if (!gloss || GLOSS_CROSS_REFERENCE.test(gloss) || gloss.endsWith(":")) {
    reject("glossNotEnglish", ex, "cross-reference");
    continue;
  }
  if (gloss.split(/\s+/).length < 0.6 * n) {
    reject("glossTooShort", ex);
    continue;
  }
  /*
   * The other half of the same problem: a gloss that says it twice.
   *
   * A&G often prints a free rendering and then a literal one — "Caesar was
   * requested to make an investigation", then "it was requested that Caesar
   * should make an investigation" — as two gloss runs with nothing between them
   * to say which is which. Both are true and the pair is a bad prompt.
   *
   * Told apart by whether the later runs *restate* the first or continue it,
   * which is what sharing content words means. A length ratio was tried first
   * and was wrong: Latin is compact enough that `Dulcīs moriēns reminīscitur
   * Argōs` fairly needs "As he dies he calls to mind his beloved Argos", and
   * any threshold tight enough to catch a restatement threw that away too.
   */
  const content = (s) =>
    new Set(
      s.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !GLOSS_STOP.has(w)) ?? [],
    );
  if (ex.parts.length > 1) {
    const first = content(ex.parts[0]);
    const later = content(ex.parts.slice(1).join(" "));
    const shared = [...later].filter((w) => first.has(w));
    if (shared.length >= 2) {
      reject("glossDoubled", ex, shared.join(" "));
      continue;
    }
  }

  const source = expandRef(ex.ref);
  if (!source) {
    funnel.refUnnamed++;
    continue;
  }
  if (source.verse && !argv.includes("--verse")) {
    funnel.verse++;
    continue;
  }

  const tokens = words(text);
  const first = tokens[0] ?? "";
  const missed = tokens.filter((t) => classify(t, first).verdict !== "ok");
  if (missed.length) {
    reject("unattested", ex, missed.join(" "));
    continue;
  }

  // A&G reuses a favourite sentence across sections as readily as Smyth does.
  const key = tokens.map((t) => fold(t)).join(" ");
  if (seen.has(key)) {
    funnel.duplicate++;
    continue;
  }
  seen.add(key);

  pool.push({ text, gloss, source, section: ex.section, chapter: ex.chapter });
}

console.log(`\n${profile.id} — Allen & Greenough, ${REPOSITORY}@${COMMIT.slice(0, 7)}\n`);
console.log(`  ${files.length} chapters read`);
for (const [reason, n] of Object.entries(funnel)) {
  if (n) console.log(`  ${String(n).padStart(5)} ${reason}`);
}
console.log(`  ${pool.length} sentences cost the gates nothing and can be filed.`);

if (why) {
  console.log(`\n  ${funnel[why] ?? 0} dropped as ${why}; the first ${samples.length}:`);
  for (const s of samples) {
    console.log(`    §${s.section} ${s.text}`);
    console.log(`       ${s.gloss}${s.note ? `   [${s.note}]` : ""}`);
  }
}

const outPath = join(dir, "content", "ag-quotes.jsonl.gz");

// --- the one thing a model is for ----------------------------------------------

/*
 * Filed by section, not by sentence, and this is the whole design.
 *
 * The first version of this asked a model to place each of 593 sentences on its
 * own. It had only the sentence's surface to reason from, and the surfaces
 * collide: `Quid ipse sentiam expōnam` (an indirect question) and `Exspectās
 * fortasse dum dīcat` (a temporal clause) are both a subordinate clause with a
 * subjunctive verb. So one Bennett topic became a bin for the whole shape —
 * 38 of the 104 sentences filed under temporal clauses were not temporal — and
 * the sentences of 64 of 147 A&G sections were scattered across two topics or
 * more, up to seven.
 *
 * The information that fixes it was never asked for. A&G prints each sentence
 * *under a section that explains the construction*, so the section is the unit
 * that carries the answer, and every sentence beneath it inherits one decision.
 * That is 147 questions rather than 593, each with A&G's own prose attached,
 * and a section can no longer scatter.
 *
 * The map it produces is committed, one row per section, with A&G's words and
 * Bennett's side by side. This is the part that had no reviewer before: the
 * per-sentence filing lived only inside the artifact, where nobody could read
 * it. A row is a claim about two books and it belongs in the diff.
 */

const topicIds = new Set(grammar.map((t) => t.id));
const topicRanges = grammar
  .map((t) => {
    const m = String(t.ref).match(/^(\d+)(?:\s*-\s*(\d+))?/);
    return m ? { id: t.id, lo: Number(m[1]), hi: Number(m[2] ?? m[1]) } : null;
  })
  .filter(Boolean);
const titleOf = new Map(grammar.map((t) => [t.id, t.title]));

/** The syllabus id an answer meant — the same reading `build-quote-pool.mjs` does. */
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

You will be given numbered sections of Allen & Greenough — the text of the
section, and the sentences it prints to illustrate it. For each, return:
  "id"      — the number you were given
  "topics"  — 1 or 2 Bennett ids whose grammar point that A&G section teaches.
              Judge by what the SECTION is about, not by what any one sentence
              looks like on its surface: a subordinate clause with a subjunctive
              verb may be a temporal clause, an indirect question, a clause of
              result or of purpose, and these are different topics. Prefer the
              most specific. If no Bennett topic covers it, return an empty
              list — a section filed under a topic it does not teach is worse
              than one filed nowhere.

Output ONLY a JSON object: {"items":[{"id":338,"topics":["bn-..."]}]}`;

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
 * Committed, and read before anything is asked. A section already in it is
 * never asked about again, so correcting a row by hand is a change the pipeline
 * keeps rather than overwrites on the next run — which is the point of having a
 * reviewable map at all.
 */
const mapPath = join(dir, "grammar", "ag-topics.tsv");
const HEADER = "ag_section\tbn_topics\tag_says\tbn_says";

function readMap() {
  const out = new Map();
  if (!existsSync(mapPath)) return out;
  for (const line of readFileSync(mapPath, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("ag_section\t")) continue;
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
  `\n  ${sections.length} A&G sections carry these sentences; ` +
    `${sections.length - ask.length} already in ${mapPath}, ${ask.length} to ask about.`,
);

if (planning) {
  // The prose is the evidence the whole filing rests on, and the first version
  // of this got it wrong by not having any. Show what a section actually looks
  // like from here before spending a call on it.
  const blank = sections.filter((s) => !prose.get(s)).length;
  console.log(`  ${blank} of them have no readable text; those are asked on their sentences alone.`);
  const step = Math.max(1, Math.floor(sections.length / 3));
  for (let i = 0; i < sections.length; i += step) {
    const s = sections[i];
    console.log(`\n    §${s} — ${bySection.get(s).length} sentence(s)`);
    console.log(`      ${(prose.get(s) ?? "(unreadable)").slice(0, 220)}`);
  }
  console.log(`\n  ${Math.ceil(ask.length / BATCH)} calls would be made. Stopping.`);
  own.close();
  process.exit(0);
}

for (let start = 0; start < ask.length; start += BATCH) {
  const batch = ask.slice(start, start + BATCH);
  const body = batch
    .map((s) => {
      const said = prose.get(s) ?? "(the section's text could not be read)";
      const shown = bySection.get(s).slice(0, 4).map((q) => `     ${q.text}`).join("\n");
      return `${s}. ${said}\n   it illustrates this with:\n${shown}`;
    })
    .join("\n\n");

  let items = null;
  for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
    try {
      items = callClaude(`Match these ${batch.length} A&G sections:\n\n${body}`);
      break;
    } catch (err) {
      const limit = usageLimit(err);
      if (limit) {
        // Whatever was answered is already in the map on disk, so this costs
        // the batch in flight and nothing else.
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
      const said = (prose.get(s) ?? "").replace(/\s+/g, " ").slice(0, 90);
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
      // A&G's own section. It is what the filing was decided from, so it is
      // also what a reviewer reads the filing back against.
      ag: section,
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
