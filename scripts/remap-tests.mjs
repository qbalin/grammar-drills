#!/usr/bin/env node
/**
 * Carry a pack's generated tests across a change in topic boundaries.
 *
 * A test file is named for its topic, so when the grammar parser regroups the
 * book — a heading it used to miss, a boundary it used to invent — the files
 * stop lining up with `grammar.json`. The tests themselves are still good:
 * they were written against sections that have only moved house. Regenerating
 * them would cost a model run and throw away work that is still correct, so
 * they are remapped instead.
 *
 * The map is the section numbers. A topic's `ref` is the range of sections it
 * covers, so an old topic belongs to whichever new topic covers the section it
 * started at. Several old topics can land on one new topic; their questions are
 * concatenated in the old reading order.
 *
 * Usage:
 *   node scripts/remap-tests.mjs --pack languages/latin [--rev HEAD] [--dry]
 *
 * Run it *after* the parser has rewritten `content/grammar.json` and *before*
 * committing: the old topic list is read from git, not from disk.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const pack = flag("pack");
const rev = flag("rev", "HEAD");
const dry = args.includes("--dry");
if (!pack) {
  console.error("usage: node scripts/remap-tests.mjs --pack languages/<name> [--rev HEAD] [--dry]");
  process.exit(2);
}

const grammarPath = path.join(pack, "content", "grammar.json");
const testsDir = path.join(pack, "content", "tests");

const newTopics = JSON.parse(fs.readFileSync(grammarPath, "utf8"));
const oldTopics = JSON.parse(
  execFileSync("git", ["show", `${rev}:${grammarPath}`], { encoding: "utf8" }),
);

/** The first and last section a topic covers. `ref` is "28" or "28-47". */
const span = (topic) => {
  const parts = String(topic.ref).split("-");
  return [parseInt(parts[0], 10), parseInt(parts[parts.length - 1], 10)];
};

const ranges = newTopics.map((t) => ({ topic: t, span: span(t) }));

/** Old topic id -> new topic id, or null when nothing covers it any more. */
const mapping = new Map();
for (const old of oldTopics) {
  const [start] = span(old);
  const hit = ranges.find(({ span: [lo, hi] }) => lo <= start && start <= hi);
  mapping.set(old.id, hit?.topic.id ?? null);
}

const moved = [...mapping].filter(([from, to]) => to && from !== to);
const lost = [...mapping].filter(([, to]) => to === null);
for (const [from, to] of moved) console.log(`  ${from}  ->  ${to}`);
for (const [from] of lost) console.log(`  ${from}  ->  (no covering topic — tests dropped)`);

/** New topic id -> the tests landing on it, in the old reading order. */
const collected = new Map(newTopics.map((t) => [t.id, []]));
let read = 0;
for (const old of oldTopics) {
  const file = path.join(testsDir, `${old.id}.json`);
  if (!fs.existsSync(file)) continue;
  const tests = JSON.parse(fs.readFileSync(file, "utf8"));
  read += tests.length;
  const to = mapping.get(old.id);
  if (to) collected.get(to).push(...tests);
}

let written = 0;
for (const [id, tests] of collected) {
  if (tests.length === 0) continue;
  // Both the file name and the ids inside it are derived from the topic, so
  // renaming the topic has to renumber the tests as well.
  const renumbered = tests.map((test, i) => ({
    ...test,
    id: `${id}-t${i + 1}`,
    sectionId: id,
  }));
  written += renumbered.length;
  if (!dry) {
    // Byte-for-byte the shape gen-tests.mjs writes, so a topic whose tests did
    // not move shows no diff at all.
    fs.writeFileSync(path.join(testsDir, `${id}.json`), JSON.stringify(renumbered, null, 1));
  }
}

const keep = new Set([...collected].filter(([, t]) => t.length > 0).map(([id]) => id));
const stale = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith(".json") && !keep.has(f.slice(0, -5)));
if (!dry) for (const f of stale) fs.unlinkSync(path.join(testsDir, f));

console.log(
  `\n${oldTopics.length} old topics -> ${newTopics.length} new; ` +
    `${moved.length} remapped, ${lost.length} lost; ` +
    `${read} tests read, ${written} written, ${stale.length} files removed` +
    (dry ? " (dry run — nothing written)" : ""),
);
