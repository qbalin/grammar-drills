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
import { parseBlocks } from "@lang-tutor/core";
import {
  gate,
  loadGrammar,
  loadGrammarCoverage,
  loadProfile,
  packDir,
  percentile,
  report,
} from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const dir = packDir(argv);
const profile = loadProfile(dir);
const grammar = loadGrammar(dir);
const coverage = loadGrammarCoverage(dir);
const shape = profile.grammarShape;

const lengths = grammar.map((t) => t.text.length).sort((a, b) => a - b);
const median = percentile(lengths, 0.5);
const p90 = percentile(lengths, 0.9);

const counts = new Map(profile.families.map((f) => [f.id, 0]));
for (const t of grammar) {
  if (counts.has(t.family)) counts.set(t.family, counts.get(t.family) + 1);
}
const share = (n) => (n / grammar.length) * 100;

const gates = [];

// --- G1-G3: there are enough topics, none is empty, and they are small -------

gates.push(
  gate(
    "G1",
    grammar.length >= shape.minTopics && grammar.length <= shape.maxTopics,
    `${grammar.length} topics (want ${shape.minTopics}–${shape.maxTopics})`,
  ),
);

const tooThin = grammar.filter((t) => t.text.trim().length < shape.minTextChars);
gates.push(
  gate("G2", tooThin.length === 0,
    tooThin.length
      ? `${tooThin.length} topics under ${shape.minTextChars} chars: ${tooThin.slice(0, 3).map((t) => t.id).join(", ")}`
      : `every topic has at least ${shape.minTextChars} chars (min ${lengths[0]})`),
);

const tooBig = grammar.filter((t) => t.text.length > shape.maxTextChars);
const inRange = median >= shape.medianTextCharsRange[0] && median <= shape.medianTextCharsRange[1];
gates.push(
  gate("G3", inRange && p90 <= shape.p90TextCharsMax && tooBig.length === 0,
    `min ${lengths[0]} · median ${median} · p90 ${p90} · max ${lengths[lengths.length - 1]}` +
      (tooBig.length ? ` — ${tooBig.length} over ${shape.maxTextChars}: ${tooBig.map((t) => t.id).join(", ")}` : "")),
);

// A topic several times the median is the one a single set of tests can never
// cover; flag it for splitting rather than failing the pack over it.
const outsized = grammar.filter((t) => t.text.length > median * 4);
if (outsized.length) {
  console.log(
    `note: ${outsized.length} topics exceed 4× the median length and are candidates for splitting:\n` +
      outsized.map((t) => `      ${t.id} (${t.text.length} chars)`).join("\n"),
  );
}

// --- G4: every family valid, none empty, none dominant ----------------------

const known = new Set(profile.families.map((f) => f.id));
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

const idPattern = new RegExp(`^${profile.grammar.idPrefix}-\\d{3}-[a-z0-9-]+$`);
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
  for (const block of parseBlocks(t.text, profile.grammar)) {
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
  const blocks = parseBlocks(t.text, profile.grammar);
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
  console.log(`dropped by reason: ${Object.entries(reasons).map(([r, n]) => `${r} ${n}`).join(" · ")}`);
} else {
  gates.push(
    gate("G8", false,
      "no content/grammar-coverage.json — the parser must account for every source section"),
  );
}

// --- G9: the part a human has to do ------------------------------------------

const sampleAt = argv.indexOf("--sample");
if (sampleAt >= 0) {
  const n = Number(argv[sampleAt + 1] ?? 12);
  // Stratified: the smallest and the largest are where segmentation goes wrong,
  // so they are never left to chance.
  const bySize = [...grammar].sort((a, b) => a.text.length - b.text.length);
  const picked = [bySize[0], bySize[bySize.length - 1]];
  const step = Math.max(1, Math.floor(grammar.length / (n - 2)));
  for (let i = 0; picked.length < n && i < grammar.length; i += step) picked.push(grammar[i]);

  console.log(`\n${"=".repeat(72)}\nRead these ${picked.length} topics and record the verdict in the pack's REVIEW.md.\n${"=".repeat(72)}`);
  for (const t of picked) {
    console.log(`\n--- ${t.id}  ${profile.grammar.refPrefix}${t.ref}  [${t.family}]  ${t.text.length} chars`);
    console.log(`    ${t.title}\n`);
    if (argv.includes("--render")) {
      for (const block of parseBlocks(t.text, profile.grammar)) {
        if (block.kind === "table") {
          for (const row of block.rows) console.log("    " + row.cells.join("  "));
        } else {
          console.log("    " + (block.text ?? "").slice(0, 800).replace(/\n/g, "\n    "));
        }
        console.log("");
      }
    }
  }
}

const ok = report(`Grammar shape — ${profile.id} (${grammar.length} topics)`, gates, {
  json: argv.includes("--json"),
});
process.exit(ok ? 0 : 1);
