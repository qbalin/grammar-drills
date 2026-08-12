#!/usr/bin/env node
/**
 * Ask which topic of the primary grammar a further grammar's topic teaches, for
 * the ones nothing has been asked about yet.
 *
 *   node --import tsx scripts/extend-crosswalk.mjs --pack languages/latin --grammar lane
 *     --plan          print what would be asked and what it would cost, spend nothing
 *     --batch <n>     topics per call (default 20)
 *     --model <id>    the model to ask
 *
 * Appends to `grammar/<id>-topics.tsv`, the same reviewable four-column table
 * `lane-quotes.mjs` writes, and `build-crosswalk.mjs` reads it unchanged.
 *
 * --- why there is a gap to fill at all ----------------------------------------
 *
 * `lane-topics.tsv` was built by the quotation pipeline, which walks the
 * sentences a grammar prints. Lane prints those in Part Second, so the table
 * covers §§1056-2421 and nothing else — not because Lane's Part First is
 * unteachable but because nobody had a reason to ask about it. The result is a
 * syllabus half of which has prose to read and nothing to answer: 148 of Lane's
 * inflection topics reach no Bennett topic, stranding 2,959 of the pack's
 * questions.
 *
 * --- the unit, and why it is the topic ----------------------------------------
 *
 * Asked once per topic and written once per section. The quotation run asked per
 * section because it had a sentence in hand and needed to know where that
 * sentence went; here the question is about the grammar point, which is what a
 * topic is, so asking about each of a topic's four sections separately would be
 * four chances to answer differently about one thing. The rows are still per
 * section, because that is the grain of the table and of the resume.
 *
 * --- what it will not do ------------------------------------------------------
 *
 * A topic already in the table is never asked about again, including one whose
 * answer was "no topic covers this" — an empty list is an answer, and a run that
 * re-asked it would overwrite a judgement somebody may have made by hand. This
 * is why the table is the resume rather than a log beside one.
 *
 * Some of the gap is not closable and should not be forced. Bennett's
 * `bn-353`-`bn-356` teach word order and style; Lane has no chapter on it, its
 * §§2429-2745 being prosody. A model asked to place them anyway would place
 * them somewhere, and a section filed under a topic it does not teach is worse
 * than one filed nowhere.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { plainText } from "@lang-tutor/core";
import {
  grammarNamed,
  grammarsOf,
  loadGrammar,
  loadGrammarCoverage,
  loadProfile,
  packDir,
} from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dir = packDir(argv);
const profile = loadProfile(dir);
const planning = argv.includes("--plan");
const BATCH = Number(at("--batch") ?? 20);
// The same default `lane-quotes.mjs` asked with, so one table is not half the
// judgement of one model and half another's.
const MODEL = at("--model") ?? "claude-opus-4-8";
/** How much of a topic's prose the model is shown. Enough to tell what it is. */
const PROSE = 420;

const [primary] = grammarsOf(profile);
const book = grammarNamed(profile, at("--grammar"));
if (book.primary) {
  console.error("--grammar must name a further grammar, not the pack's primary one.");
  process.exit(2);
}

const primaryTopics = loadGrammar(dir, primary);
const topics = loadGrammar(dir, book);
const manifest = loadGrammarCoverage(dir, book);
if (!manifest) {
  console.error(`no content/${book.manifest}; run this grammar's parser first.`);
  process.exit(2);
}

const titleOf = new Map(primaryTopics.map((t) => [t.id, t.title]));
const primaryIds = new Set(primaryTopics.map((t) => t.id));

/** Which sections each of this book's topics covers, off the parser's account. */
const sectionsOf = new Map();
for (const [section, id] of Object.entries(manifest.assigned)) {
  if (!sectionsOf.has(id)) sectionsOf.set(id, []);
  sectionsOf.get(id).push(section);
}

const mapPath = join(dir, "grammar", `${book.id}-topics.tsv`);
const HEADER = `${book.id}_section\t${primary.id}_topics\t${book.id}_says\t${primary.id}_says`;

function readMap() {
  const out = new Map();
  if (!existsSync(mapPath)) return out;
  for (const line of readFileSync(mapPath, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith(`${book.id}_section\t`)) continue;
    const [section, ids] = line.split("\t");
    out.set(section, ids ? ids.split(",").filter(Boolean) : []);
  }
  return out;
}

const map = readMap();
/** A topic nothing has been asked about: not one of its sections is in the table. */
const ask = topics.filter((t) => !(sectionsOf.get(t.id) ?? []).some((s) => map.has(s)));

const say = (t) => plainText(t.text).replace(/\s+/g, " ").trim().slice(0, PROSE);

console.log(
  `${book.label}: ${topics.length} topics, ${topics.length - ask.length} already in ` +
    `${mapPath}, ${ask.length} to ask about (${Math.ceil(ask.length / BATCH)} calls).`,
);

if (planning) {
  const byFamily = new Map();
  for (const t of ask) byFamily.set(t.family, (byFamily.get(t.family) ?? 0) + 1);
  console.log(
    `  by family: ${[...byFamily].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(" · ")}`,
  );
  for (const t of ask.slice(0, 3)) {
    console.log(`\n    ${t.id}  ${book.style.refPrefix}${t.ref}\n      ${say(t).slice(0, 200)}`);
  }
  console.log("\nStopping; nothing was asked and nothing was written.");
  process.exit(0);
}

const index = primaryTopics
  .map((t) => `${t.id}\t${primary.style.refPrefix}${t.ref} ${t.title}`)
  .join("\n");

const SYSTEM = `You are matching the topics of one Latin grammar onto the topics
of another.

The syllabus is ${primary.label}'s, and it is what the pack teaches:
${index}

You will be given topics of ${book.label}'s Latin Grammar — its own heading and
the opening of its text. For each, return:
  "id"      — the id you were given, exactly
  "topics"  — 1 or 2 ${primary.label} ids that teach the same grammar point.
              The two books divide the language differently, so a topic of one
              may need two of the other, and often the match is a heading away:
              ${book.label} names a declension by its stem where ${primary.label}
              numbers it, so "Stems in -ā-" is the first declension and "Stems in
              -o-" the second. Judge by what is being TAUGHT, not by wording.
              If no ${primary.label} topic covers it, return an empty list — a
              topic filed under one it does not teach is worse than one filed
              nowhere, and some of these genuinely have no counterpart.

Output ONLY a JSON object: {"items":[{"id":"ln-0432-...","topics":["bn-..."]}]}`;

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

function usageLimit(err) {
  const text = `${err.stdout ?? ""}\n${err.message ?? ""}`;
  if (!/session limit|usage limit|"api_error_status":\s*429/.test(text)) return null;
  return text.match(/"result":"([^"]+)"/)?.[1] ?? "usage limit reached";
}

/** What each topic said, kept for the table's third column. */
const saidBy = new Map(topics.map((t) => [t.id, `${t.title} — ${say(t)}`]));

function write() {
  const rows = [...map]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([section, ids]) => {
      const own = manifest.assigned[section];
      const said = (saidBy.get(own) ?? "").replace(/\s+/g, " ").slice(0, 90);
      return `${section}\t${ids.join(",")}\t${said}\t${ids.map((i) => titleOf.get(i) ?? "?").join("; ")}`;
    });
  writeFileSync(mapPath, `${[HEADER, ...rows].join("\n")}\n`);
}

const byId = new Map(topics.map((t) => [t.id, t]));
let asked = 0;
for (let start = 0; start < ask.length; start += BATCH) {
  const batch = ask.slice(start, start + BATCH);
  const body = batch
    .map((t) => `${t.id}  (${book.style.refPrefix}${t.ref})  ${t.title}\n   ${say(t)}`)
    .join("\n\n");

  let items = null;
  for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
    try {
      items = callClaude(`Match these ${batch.length} ${book.label} topics:\n\n${body}`);
      break;
    } catch (err) {
      const limit = usageLimit(err);
      if (limit) {
        console.error(
          `\nStopping: ${limit}\n` +
            `  ${asked} topics were saved to ${mapPath}.\n` +
            "  Rerun the same command once the limit resets; it picks up here.",
        );
        process.exit(3);
      }
      if (attempt === BACKOFF.length) throw err;
      console.log(`  ${err.message.slice(0, 80)} — waiting ${BACKOFF[attempt]}s`);
      await sleep(BACKOFF[attempt] * 1000);
    }
  }

  for (const item of items ?? []) {
    const topic = byId.get(String(item.id ?? "").trim());
    if (!topic) continue;
    const ids = [...new Set((item.topics ?? []).filter((i) => primaryIds.has(i)))].slice(0, 2);
    // One answer, written against every section the topic covers, which is the
    // grain the table and the resume are both in.
    for (const section of sectionsOf.get(topic.id) ?? []) map.set(section, ids);
    asked++;
  }
  write();   // after every batch: the table is the resume
  console.log(`  ${Math.min(start + BATCH, ask.length)}/${ask.length} topics matched`);
}

const placed = ask.filter((t) => (map.get((sectionsOf.get(t.id) ?? [])[0]) ?? []).length);
console.log(
  `\n${placed.length} of ${ask.length} newly asked topics were placed; ` +
    `${ask.length - placed.length} had no counterpart.`,
);
console.log(`  the table a reviewer reads: ${mapPath}`);
console.log("  next: node --import tsx scripts/build-crosswalk.mjs --pack " + dir);
