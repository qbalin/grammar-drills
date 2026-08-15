#!/usr/bin/env node
/**
 * Is this pack's syllabus split into small, self-contained, teachable topics?
 *
 * Splitting the grammar is the step everything downstream rests on: the map is
 * drawn from it, the placement bisect walks it, and every generated question is
 * about one of its topics. A parser that quietly drops sections, runs twenty of
 * them together, or leaves a topic that reads as "see § 217" produces a
 * syllabus that looks fine in aggregate and teaches badly in every particular.
 *
 * So the shape is measured rather than assumed. The thresholds live in the
 * pack's `profile.grammarShape`, calibrated against a syllabus known to work.
 *
 *   node --import tsx scripts/grammar-report.mjs [--pack languages/latin]
 *                                               [--json] [--sample N] [--render]
 *
 * `--sample N --render` prints N topics as the reader would meet them. That one
 * is not automatable: a human has to read them and record the verdict in the
 * pack's REVIEW.md. Everything above it is.
 */
import { parseBlocks, plainText } from "@lang-tutor/core";
import {
  gate,
  grammarNamed,
  loadGrammar,
  loadGrammarCoverage,
  loadProfile,
  packDir,
  percentile,
  report,
  teachable,
} from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
/*
 * Which book. A pack with one grammar takes no flag and behaves as it always
 * has; a pack with two is reported once per book, because a shape gate measures
 * one book's idea of how long a topic is and averaging two of them measures
 * neither.
 */
const book = grammarNamed(profile, at("--grammar"));
const grammar = loadGrammar(dir, book);
const coverage = loadGrammarCoverage(dir, book);
const shape = book.shape;

/*
 * The syllabus, and the whole book.
 *
 * Two populations, and which gate measures which is the point of the split. The
 * shape gates below — how long a topic is, how long the longest is — calibrate
 * what one set of questions can cover, so they read `taught`. The rest —
 * families, ids, order, whether a page renders at all — read `grammar`, because
 * they are about anything a student can open.
 */
const taught = teachable(grammar);
const readingTopics = grammar.length - taught.length;

// Measured on the words, not on the inline emphasis markup around them.
const size = new Map(grammar.map((t) => [t.id, plainText(t.text).trim().length]));
const lengths = taught.map((t) => size.get(t.id)).sort((a, b) => a - b);
const median = percentile(lengths, 0.5);
const p90 = percentile(lengths, 0.9);

const counts = new Map(book.families.map((f) => [f.id, 0]));
for (const t of grammar) {
  if (counts.has(t.family)) counts.set(t.family, counts.get(t.family) + 1);
}
const share = (n) => (n / grammar.length) * 100;

/**
 * The report's running commentary — the distributions and the notes beside the
 * gates, which are for a person reading the run.
 *
 * Under `--json` it stands down, so that stdout is one JSON document and
 * nothing has to hunt for the first `{`. `coverage-report.mjs` already guarded
 * its prose this way; this one did not, so `--json` emitted five lines of
 * English and then an object.
 */
const asJson = argv.includes("--json");
const say = (...args) => {
  if (!asJson) console.log(...args);
};

const gates = [];

// --- G1-G3: there are enough topics, none is empty, and they are small -------

gates.push(
  gate(
    "G1",
    grammar.length >= shape.minTopics && grammar.length <= shape.maxTopics,
    `${grammar.length} topics, ${readingTopics} of them reading only ` +
      `(want ${shape.minTopics}–${shape.maxTopics})`,
  ),
);

// Of the taught topics. A reading page is as long as the book made it, and a
// run of six words under a structural heading is honestly six words; failing
// the pack for it would be failing the pack for shipping the book.
const tooThin = taught.filter((t) => size.get(t.id) < shape.minTextChars);
gates.push(
  gate("G2", tooThin.length === 0,
    tooThin.length
      ? `${tooThin.length} taught topics under ${shape.minTextChars} chars: ${tooThin.slice(0, 3).map((t) => t.id).join(", ")}`
      : `every taught topic has at least ${shape.minTextChars} chars (min ${lengths[0]})`),
);

// The same, and for the same reason: this band is the calibration of how much
// grammar one set of questions can cover.
const tooBig = taught.filter((t) => size.get(t.id) > shape.maxTextChars);
const inRange = median >= shape.medianTextCharsRange[0] && median <= shape.medianTextCharsRange[1];
gates.push(
  gate("G3", inRange && p90 <= shape.p90TextCharsMax && tooBig.length === 0,
    `taught: min ${lengths[0]} · median ${median} · p90 ${p90} · max ${lengths[lengths.length - 1]}` +
      (tooBig.length ? ` — ${tooBig.length} over ${shape.maxTextChars}: ${tooBig.map((t) => t.id).join(", ")}` : "")),
);

// The reading pages are not gated on size, but a page nobody sized is a page
// nobody looked at, so the distribution is printed beside the syllabus's.
if (readingTopics) {
  const rl = grammar.filter((t) => t.readingOnly).map((t) => size.get(t.id))
    .sort((a, b) => a - b);
  say(
    `reading: ${readingTopics} topics · min ${rl[0]} · median ${percentile(rl, 0.5)} ` +
      `· p90 ${percentile(rl, 0.9)} · max ${rl[rl.length - 1]}`,
  );
}

// A topic several times the median is the one a single set of tests can never
// cover; flag it for splitting rather than failing the pack over it.
const outsized = grammar.filter((t) => size.get(t.id) > median * 4);
if (outsized.length) {
  say(
    `note: ${outsized.length} topics exceed 4× the median length and are candidates for splitting:\n` +
      outsized.map((t) => `      ${t.id} (${size.get(t.id)} chars)`).join("\n"),
  );
}

// --- G4: every family valid, none empty, none dominant ----------------------

const known = new Set(book.families.map((f) => f.id));
const strays = grammar.filter((t) => !known.has(t.family));
const empty = [...counts].filter(([, n]) => n === 0).map(([id]) => id);
const dominant = [...counts].filter(([, n]) => share(n) > shape.maxFamilySharePct);
gates.push(
  gate("G4", strays.length === 0 && empty.length === 0 && dominant.length === 0,
    strays.length ? `${strays.length} sections in an unknown family`
      : empty.length ? `empty families (they render as dead bars): ${empty.join(", ")}`
      : dominant.length ? `${dominant[0][0]} holds ${share(dominant[0][1]).toFixed(1)}% of topics`
      : `${counts.size} families, all populated, largest ${Math.max(...[...counts.values()].map(share)).toFixed(1)}%`),
);

// --- G5: ids, order and titles ----------------------------------------------

// Three digits is the floor, not the width: Bennett stops at § 371 and Smyth
// runs to § 3048, and a book with more than 999 sections cannot pad down to it.
const idPattern = new RegExp(`^${book.style.idPrefix}-\\d{3,}-[a-z0-9-]+$`);
const badIds = grammar.filter((t) => !idPattern.test(t.id));
const dupIds = grammar.length !== new Set(grammar.map((t) => t.id)).size;
const ordered = [...grammar].sort((a, b) => a.order - b.order);
const orderStrict = ordered.every((t, i) => i === 0 || t.order > ordered[i - 1].order);
// A duplicate title is an unnavigable map: reference grammars reuse headings
// across parts, and the parser has to disambiguate them.
const titles = grammar.map((t) => t.title.toLowerCase());
const dupTitles = titles.filter((t, i) => titles.indexOf(t) !== i);
gates.push(
  gate("G5", badIds.length === 0 && !dupIds && orderStrict && dupTitles.length === 0,
    badIds.length ? `${badIds.length} ids do not match ${idPattern}`
      : dupIds ? "duplicate section ids"
      : !orderStrict ? "order is not strictly increasing"
      : dupTitles.length ? `duplicate titles: ${[...new Set(dupTitles)].slice(0, 3).join(" · ")}`
      : "ids unique and prefixed, order strict, titles distinct"),
);

// --- G6: no paradigm row was lost or run together ---------------------------
// The flattened text holds one table row per line, cells held apart by two
// spaces. Every one of those lines has to come back as a row of some kind —
// a form row, a caption, or a divider. A line that does not is a paradigm the
// reader will meet as a run-on sentence, which is invisible in aggregate and
// glaring to a student staring at a broken declension.
//
// Roman-numeral points (`I.  Pure Consonant-Stems.`) are row-shaped by accident
// and are meant to be rendered as points, so they are counted as accounted for.

let rowLines = 0;
let parsedRows = 0;
let romanPoints = 0;
const mangled = [];
for (const t of grammar) {
  const lines = t.text.split("\n").filter((l) => /\S {2}\S/.test(l));
  const roman = lines.filter((l) => /^[IVXL]+\.\s{2,}/.test(l.trim())).length;
  let rows = 0;
  for (const block of parseBlocks(t.text, book.style)) {
    if (block.kind === "table") rows += block.rows.length;
  }
  rowLines += lines.length;
  parsedRows += rows;
  romanPoints += roman;
  if (rows + roman < lines.length) mangled.push(`${t.id} (${lines.length - rows - roman} lost)`);
}
gates.push(
  gate("G6", mangled.length === 0,
    mangled.length
      ? `${mangled.length} topics lose paradigm rows: ${mangled.slice(0, 3).join(", ")}`
      : `all ${rowLines} row-shaped lines recovered (${parsedRows} table rows, ${romanPoints} roman points)`),
);

// --- G7: every topic renders as something ------------------------------------

const blank = grammar.filter((t) => {
  const blocks = parseBlocks(t.text, book.style);
  return blocks.length === 0 || blocks.every((b) => b.kind === "heading");
});
gates.push(
  gate("G7", blank.length === 0,
    blank.length ? `${blank.length} topics render as nothing but headings`
      : "every topic renders as prose, points or tables"),
);

// --- G8: the section account balances ----------------------------------------

if (coverage) {
  const assigned = Object.keys(coverage.assigned).length;
  const dropped = coverage.dropped.length;
  const total = coverage.sourceSections.length;
  gates.push(
    gate("G8", assigned + dropped === total,
      `${assigned} assigned + ${dropped} dropped = ${assigned + dropped} of ${total} source sections`),
  );
  const reasons = coverage.dropped.reduce((acc, d) => {
    acc[d.reason] = (acc[d.reason] ?? 0) + 1;
    return acc;
  }, {});
  say(`dropped by reason: ${Object.entries(reasons).map(([r, n]) => `${r} ${n}`).join(" · ")}`);
} else {
  gates.push(
    gate("G8", false,
      `no content/${book.manifest} — the parser must account for every source section`),
  );
}

// --- G10: the whole book is readable -----------------------------------------
//
// The gate G8 never was. G8 checks that the account adds up, which it does just
// as well when half the book is dropped; this checks that nothing is. A section
// with no exercise on it is a topic marked `readingOnly`, not a section left
// out — "cannot be drilled" was never a reason a student should be unable to
// read the page.
//
// One exception, and it must be declared as one: a book's own apparatus — an
// index of cited sources, a key to author abbreviations — is not grammar and is
// not shipped. Lane's is §§2740-2745 and is 317,000 characters of "Ter. =
// Terentius". `dropped` may hold that and nothing else.
const APPARATUS = new Set(["apparatus"]);

if (coverage) {
  const stowaways = coverage.dropped.filter((d) => !APPARATUS.has(d.reason));
  gates.push(
    gate("G10", stowaways.length === 0,
      stowaways.length
        ? `${stowaways.length} source sections are dropped for a reason other than ` +
          `apparatus and so can be read nowhere: ` +
          `${stowaways.slice(0, 5).map((d) => `§${d.n} (${d.reason})`).join(", ")}`
        : coverage.dropped.length
          ? `every section is readable except ${coverage.dropped.length} of declared apparatus`
          : "every source section is readable"),
  );

  // --- G11: the content and the manifest say the same thing ------------------
  //
  // `readingOnly` is a declaration, and a declaration nobody checks is a way to
  // dodge C1 — mark a topic unteachable and its missing questions stop being a
  // gap. So the flag in the shipped content and the reason in the reviewable
  // manifest have to agree exactly, both ways round. A hand-edit of `content/`
  // cannot invent a reading page, and a parser cannot forget to record one.
  const declared = new Set(Object.keys(coverage.reading ?? {}));
  const flagged = new Set(grammar.filter((t) => t.readingOnly).map((t) => t.id));
  const unrecorded = [...flagged].filter((id) => !declared.has(id));
  const unflagged = [...declared].filter((id) => !flagged.has(id));
  gates.push(
    gate("G11", unrecorded.length === 0 && unflagged.length === 0,
      unrecorded.length
        ? `${unrecorded.length} topics are marked readingOnly with no reason recorded: ` +
          `${unrecorded.slice(0, 3).join(", ")}`
        : unflagged.length
          ? `${unflagged.length} topics have a reason recorded but ship as teachable: ` +
            `${unflagged.slice(0, 3).join(", ")}`
          : `${flagged.size} reading topics, each with a recorded reason`),
  );
  if (flagged.size) {
    const why = Object.values(coverage.reading ?? {}).reduce((acc, r) => {
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {});
    say(`reading by reason: ${Object.entries(why).map(([r, n]) => `${r} ${n}`).join(" · ")}`);
  }
}

// --- H1 (was G9): the part a human has to do ---------------------------------

const sampleAt = argv.indexOf("--sample");
if (sampleAt >= 0) {
  const n = Number(argv[sampleAt + 1] ?? 12);
  // Stratified: the smallest and the largest are where segmentation goes wrong,
  // so they are never left to chance.
  const bySize = [...grammar].sort((a, b) => size.get(a.id) - size.get(b.id));
  const picked = [bySize[0], bySize[bySize.length - 1]];
  const step = Math.max(1, Math.floor(grammar.length / (n - 2)));
  for (let i = 0; picked.length < n && i < grammar.length; i += step) picked.push(grammar[i]);

  say(`\n${"=".repeat(72)}\nRead these ${picked.length} topics and record the verdict in the pack's REVIEW.md.\n${"=".repeat(72)}`);
  for (const t of picked) {
    say(`\n--- ${t.id}  ${book.style.refPrefix}${t.ref}  [${t.family}]  ${size.get(t.id)} chars`);
    say(`    ${t.title}\n`);
    if (argv.includes("--render")) {
      for (const block of parseBlocks(t.text, book.style)) {
        if (block.kind === "table") {
          for (const row of block.rows) say("    " + row.cells.join("  "));
        } else {
          say("    " + (block.text ?? "").slice(0, 800).replace(/\n/g, "\n    "));
        }
        say("");
      }
    }
  }
}

/**
 * What this run counted, for `baseline.mjs` — one book's worth.
 *
 * Keyed by book rather than merged, because `grammar-report` runs once per book
 * and two books' shapes must never be averaged: a family list is one book's
 * table of contents and a shape gate is calibrated against one book's idea of
 * how long a topic is.
 */
const readingLengths = grammar
  .filter((t) => t.readingOnly)
  .map((t) => size.get(t.id))
  .sort((a, b) => a - b);

const measured = {
  // `id`, not `label`. A baseline's `book` line is often a fuller citation than
  // the profile's short label — "Lane, A Latin Grammar for Schools and Colleges
  // (1898)" against "Lane" — and that is a person's note about which edition was
  // parsed. Emitting the short one here would overwrite it with less.
  id: book.id,
  topics: grammar.length,
  taughtTopics: taught.length,
  readingTopics,
  families: book.families.length,
  familyCounts: Object.fromEntries(counts),
  textChars: {
    min: lengths[0] ?? 0,
    median,
    p90,
    max: lengths[lengths.length - 1] ?? 0,
  },
  ...(readingLengths.length
    ? {
        readingTextChars: {
          min: readingLengths[0],
          median: percentile(readingLengths, 0.5),
          p90: percentile(readingLengths, 0.9),
          max: readingLengths[readingLengths.length - 1],
        },
      }
    : {}),
  ...(coverage
    ? {
        sourceSections: coverage.sourceSections.length,
        assigned: Object.keys(coverage.assigned).length,
        dropped: coverage.dropped.reduce((acc, d) => {
          acc[d.reason] = (acc[d.reason] ?? 0) + 1;
          return acc;
        }, {}),
        // `coverage.reading` is `{topicId: reason}`, the same map G11 holds the
        // shipped flags against — not a field on the assignment.
        reading: Object.values(coverage.reading ?? {}).reduce((acc, r) => {
          acc[r] = (acc[r] ?? 0) + 1;
          return acc;
        }, {}),
      }
    : {}),
  rowShapedLines: rowLines,
  tableRowsRecovered: parsedRows,
  romanPoints,
};

const ok = report(`Grammar shape — ${profile.id} / ${book.label} (${grammar.length} topics)`, gates, {
  json: asJson,
  measured,
});
process.exit(ok ? 0 : 1);
