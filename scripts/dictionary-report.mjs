#!/usr/bin/env node
/**
 * Is a further dictionary readable, whole, and about this pack's words?
 *
 * A pack that declares none passes in one line, which is every pack that
 * predates this and the Greek pack today.
 *
 * The gates are deliberately not called C-anything, for the reason
 * `crosswalk-report.mjs` gives about its own: a figure here is not the pack's
 * coverage with a different denominator. A lexicon that answers for 79% of the
 * pack's lemmas is a good lexicon — the missing fifth is words no student
 * meets — and a reader who saw `C`-something at 79% would read a hole in the
 * pack. There is none. Numbering them apart is what keeps that straight.
 *
 * The one thing this file must never do is reach for `scripts/lib/reference.mjs`.
 * Attestation asks what the pack may *ship*, and its answer comes from the
 * pack's own dictionary and a corpus rank. A further dictionary is reference
 * material a student reads; it is not evidence, and the day it becomes evidence
 * is a commit that argues for it rather than an import added here.
 *
 *   node --import tsx scripts/dictionary-report.mjs --pack languages/latin
 *   node --import tsx scripts/dictionary-report.mjs --pack languages/latin --json
 */
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { gunzipSync } from "node:zlib";
import { compileFold } from "@lang-tutor/core";
import {
  REPO, packDir, args, loadProfile, dictionariesOf, loadLemmaTable, gate, report,
} from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const { has } = args(argv);
const dir = packDir(argv);
const profile = loadProfile(dir);
const books = dictionariesOf(profile);

if (!books.length) {
  console.log(`${profile.id}: declares no further dictionaries; nothing to hold.`);
  process.exit(0);
}

const fold = compileFold(profile.fold);
const lemmas = loadLemmaTable(dir);
const ranked = lemmas.filter((e) => typeof e.rank === "number").sort((a, b) => a.rank - b.rank);

const gates = [];
const measured = {};

for (const book of books) {
  const content = join(dir, "content", book.content);
  const index = join(dir, "content", book.index);
  const manifestPath = join(dir, "content", book.manifest);

  for (const [what, path] of [["content", content], ["index", index]]) {
    if (!existsSync(path)) {
      gates.push(gate(`Y1 ${book.id}`, false, `no ${relative(REPO, path)} — build the ${what} first`));
    }
  }
  if (!existsSync(content) || !existsSync(index)) continue;

  const articles = JSON.parse(gunzipSync(readFileSync(content)).toString("utf8"));
  const lines = gunzipSync(readFileSync(index)).toString("utf8").split("\n").filter(Boolean);
  const keys = lines.map((l) => l.slice(0, l.indexOf("\t")));

  // --- Y1: the index is readable ------------------------------------------
  //
  // The two properties `bisect` assumes and cannot check for itself. B1/B2 hold
  // these for the pack's own dictionary; a further one gets its own, because it
  // is written by a different script.
  const unsorted = keys.findIndex((k, i) => i > 0 && !(keys[i - 1] < k));
  const unfolded = keys.filter((k) => fold(k) !== k);
  gates.push(gate(
    `Y1 ${book.id}`,
    unsorted === -1 && unfolded.length === 0,
    unsorted !== -1
      ? `index out of code-unit order at ${JSON.stringify(keys[unsorted])} — bisect would miss`
      : unfolded.length
        ? `${unfolded.length} keys are not fold output, e.g. ${JSON.stringify(unfolded[0])}`
        : `${keys.length} keys sorted and folded`,
  ));

  // --- Y2: the whole book arrived -----------------------------------------
  const { minEntries, maxEntries } = book.shape;
  gates.push(gate(
    `Y2 ${book.id}`,
    articles.length >= minEntries && articles.length <= maxEntries,
    `${articles.length} articles (want ${minEntries}–${maxEntries})`,
  ));

  // --- Y3: every article is worth opening ---------------------------------
  //
  // An id the index names but the article list has not is the failure that
  // looks like a word with no entry, which is indistinguishable from a word
  // this book does not hold — so it is checked rather than trusted.
  let dangling = 0;
  for (const line of lines) {
    for (const n of line.slice(line.indexOf("\t") + 1).split(",")) {
      if (articles[Number(n)] === undefined) dangling += 1;
    }
  }
  const empty = articles.filter((a) => !a.head && !(a.senses ?? []).length).length;
  const markup = articles.filter((a) => /<\/?[a-zA-Z][^>]*>/.test(a.head ?? "")).length;
  /*
   * Beta Code that survived transcoding.
   *
   * The signal is a Greek letter abutting an ASCII one — `ἀnh/nwr` — which is
   * what a half-converted string looks like and what nothing else looks like.
   *
   * The obvious test, ASCII punctuation between ASCII letters, was tried and
   * withdrawn: it flags L&S's own etymological equations. The dictionary
   * writes `dis=dives`, `mānus=bonus`, `cor(d)s` and the Sanskrit `c)ra`, and a
   * gate that cries wolf on seven real entries is a gate somebody turns off.
   */
  const beta = articles.filter((a) =>
    /[Ͱ-Ͽἀ-῿][A-Za-z]|[A-Za-z][Ͱ-Ͽἀ-῿]/.test(a.head ?? ""),
  ).length;
  gates.push(gate(
    `Y3 ${book.id}`,
    dangling === 0 && empty === 0 && markup === 0 && beta === 0,
    dangling || empty || markup || beta
      ? `${dangling} dangling ids, ${empty} empty, ${markup} with source markup, ${beta} with Beta Code`
      : `${articles.length} articles resolve, none empty, no source markup left`,
  ));

  // --- Y4: is it about this pack's words? ---------------------------------
  //
  // Gated on a band rather than on the whole ranked list. A lexicon and a
  // frequency list disagree most about rare words — one files a spelling the
  // other does not — so the figure over everything is dominated by words no
  // student meets. The whole-list figures are reported beside it and gate
  // nothing, which is the split `report` already makes.
  const held = new Set(keys);
  const pct = (list) =>
    list.length ? (100 * list.filter((e) => held.has(fold(e.lemma))).length) / list.length : 0;
  const band = ranked.filter((e) => e.rank <= book.reach.band);
  const inBand = pct(band);
  const allRanked = pct(ranked);
  const everything = pct(lemmas);
  gates.push(gate(
    `Y4 ${book.id}`,
    inBand >= book.reach.headwordsMatchedPct,
    `${inBand.toFixed(1)}% of the top ${book.reach.band} lemmas have an article ` +
      `(want ${book.reach.headwordsMatchedPct}%)`,
  ));

  // --- Y5: the parser accounted for its source ----------------------------
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;
  const droppedTotal = manifest
    ? Object.values(manifest.dropped ?? {}).reduce((a, b) => a + b, 0)
    : 0;
  gates.push(gate(
    `Y5 ${book.id}`,
    manifest !== null && manifest.entries + droppedTotal === manifest.entriesSeen,
    manifest === null
      ? `no content/${book.manifest} — the parser must account for every entry it saw`
      : `${manifest.entries} kept + ${droppedTotal} dropped = ${manifest.entriesSeen} seen` +
        (droppedTotal ? ` (${Object.entries(manifest.dropped).map(([k, v]) => `${v} ${k}`).join(", ")})` : ""),
  ));

  measured[book.id] = {
    articles: articles.length,
    keys: keys.length,
    senses: articles.reduce((n, a) => n + (a.senses ?? []).length, 0),
    reachBand: book.reach.band,
    reachInBandPct: Number(inBand.toFixed(1)),
    reachRankedPct: Number(allRanked.toFixed(1)),
    reachAllLemmasPct: Number(everything.toFixed(1)),
    bytes: readFileSync(content).length + readFileSync(index).length,
  };

  if (!has("--json")) {
    const bands = [
      ["top 500", ranked.filter((e) => e.rank <= 500)],
      ["501–2000", ranked.filter((e) => e.rank > 500 && e.rank <= 2000)],
      ["2001–10000", ranked.filter((e) => e.rank > 2000 && e.rank <= 10000)],
      ["the rest", ranked.filter((e) => e.rank > 10000)],
    ];
    console.log(`\n${book.label} — how much of the pack's vocabulary it answers for:`);
    for (const [label, list] of bands) {
      if (list.length) console.log(`  ${label.padEnd(12)} ${pct(list).toFixed(1)}%  (${list.length})`);
    }
    console.log(`  ${"all ranked".padEnd(12)} ${allRanked.toFixed(1)}%  (${ranked.length})`);
    console.log(`  ${"every lemma".padEnd(12)} ${everything.toFixed(1)}%  (${lemmas.length})`);
  }
}

const ok = report(`further dictionaries: ${profile.id}`, gates, {
  json: has("--json"),
  measured,
});
process.exit(ok ? 0 : 1);
