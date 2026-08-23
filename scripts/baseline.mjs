#!/usr/bin/env node
/**
 * What a pack measures now, against what its `BASELINE.json` says it measured.
 *
 * The file is a record rather than an input — the gates live in `profile.json`
 * — and its use is to answer "did a number move, and by how much", which a
 * threshold cannot. That only works if it is current, and it was not: Greek's
 * said 27,002 questions against a real 30,214, because every figure in it was
 * transcribed by hand from a run somebody read. Its own header said "regenerate
 * with `validate-pack`", and `validate-pack` prints.
 *
 * So this composes the four reports' `--json` and writes the file. Nothing is
 * recomputed here: each report already counted these on its way to a verdict,
 * and it now says what it counted separately from how it phrased it. A baseline
 * built by regexing gate sentences would break the first time somebody improved
 * the wording of a gate.
 *
 * **Diff by default.** Writing is the rarer errand — the common one is "has
 * anything drifted", which is the question the file exists to answer. `--write`
 * writes.
 *
 *   node --import tsx scripts/baseline.mjs --pack languages/latin
 *   node --import tsx scripts/baseline.mjs --pack languages/latin --write
 *
 * `--ref` is passed through to the two reports that can use one. It matters
 * here more than anywhere: the attestation block of a `--ref` run and of a
 * plain one are different measurements — Latin's committed file records 53,214
 * answer tokens where the pack's own content says 65,323 — and the gate figures
 * agree while the accounting does not, which is what makes it easy to blend
 * them by accident. The backend is recorded beside the numbers.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { REPO, grammarsOf, loadProfile, packDir,
  args,
} from "./lib/pack.mjs";

const { at: flag, has } = args();
const argv = process.argv.slice(2);
const write = has("--write");
const dir = packDir(argv);
const profile = loadProfile(dir);
const path = join(dir, "BASELINE.json");

/** Flags a report should see if this run was given them. */
const passthrough = [];
for (const flag of ["--ref", "--built"]) {
  const i = argv.indexOf(flag);
  if (i >= 0) passthrough.push(flag, argv[i + 1]);
}

function run(script, extra = []) {
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", join(REPO, "scripts", script), "--pack", dir, "--json", ...passthrough, ...extra],
    // A failing gate still measured something, and a baseline that refused to
    // record a pack's numbers because one of them is red would be useless in
    // exactly the situation somebody wants it.
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(out);
}

const books = grammarsOf(profile);
const grammar = run("grammar-report.mjs");
const secondary = books
  .filter((b) => !b.primary)
  .map((b) => run("grammar-report.mjs", ["--grammar", b.id]));
const coverage = run("coverage-report.mjs");
const attestation = runAttestation();
const crosswalk = books.length > 1 ? run("crosswalk-report.mjs") : { measured: {} };
// What each further dictionary measured. Recorded rather than merely gated,
// because reach is the figure that moves when Perseus re-releases a lexicon or
// the pack rebuilds its lemmas, and a number nobody wrote down is a number
// nobody can see move.
const dictionaries = (profile.dictionaries ?? []).length
  ? run("dictionary-report.mjs")
  : { measured: {} };

/**
 * Attestation writes its report and then a second, fuller object — the flagged
 * questions, every form and its count — so its stdout is two JSON documents.
 * Reading the first is enough and is what the other three give directly.
 */
function runAttestation() {
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", join(REPO, "scripts", "attestation-report.mjs"), "--pack", dir, "--json", ...passthrough],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] },
  );
  const at = out.indexOf("{");
  let depth = 0;
  for (let i = at; i < out.length; i++) {
    if (out[i] === "{") depth++;
    else if (out[i] === "}" && --depth === 0) return JSON.parse(out.slice(at, i + 1));
  }
  throw new Error("attestation-report --json produced nothing parseable");
}

/**
 * The shipped bundle's weight, if one has been built **for this pack**.
 *
 * The check is not paranoia. There is one `public/content` and one build at a
 * time, so `LANG_PACK=latin … build` followed by a Greek baseline would file
 * Latin's four file sizes under Greek — silently, since a size looks like a
 * size. `content-bundle.test.ts` stands down on the same mismatch for the same
 * reason; this stands down too, and keeps whatever the file already recorded.
 */
function bundle() {
  const at = join(REPO, "apps", "web", "public", "content");
  const grammarPath = join(at, "grammar.json.gz");
  if (!existsSync(grammarPath)) return {};
  const built = JSON.parse(gunzipSync(readFileSync(grammarPath)).toString("utf8"));
  const prefix = `${profile.grammar.idPrefix}-`;
  if (!built[0]?.id?.startsWith(prefix)) {
    console.log(
      `  (bundle sizes skipped — public/content holds ${built[0]?.id?.split("-")[0]}, ` +
        `not ${profile.grammar.idPrefix}; build this pack to measure them)`,
    );
    return {};
  }
  const kb = (name) => {
    const p = join(at, name);
    return existsSync(p) ? `${Math.round(statSync(p).size / 1024)} KB` : null;
  };
  const out = {
    grammarJsonGz: kb("grammar.json.gz"),
    testsJsonGz: kb("tests.json.gz"),
    lemmasJsonGz: kb("lemmas.json.gz"),
    formsTxtGz: kb("forms.txt.gz"),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};

/**
 * Overlay what was measured onto what the file already held.
 *
 * Anything this run did not measure survives. That is deliberate and it is not
 * only about `_comment` and `_note` — though those matter most, being the
 * paragraphs explaining why the 2026-08-12 rebuild moved `assigned` from 325 to
 * 376, which nothing here can regenerate. It is also `grammars.lane.book`,
 * naming the edition parsed, and `grammars.lane.range`, and the whole
 * `dictionary` block that only a `--ref` run can produce.
 *
 * A record should lose a figure only when somebody decides to drop it, never
 * because the run that rewrote the file happened not to know about it. The
 * drift list below is what makes that safe: a stale leftover is visible rather
 * than silent.
 */
function overlay(was, now) {
  if (!was || typeof was !== "object" || Array.isArray(was)) return now;
  if (!now || typeof now !== "object" || Array.isArray(now)) return now;
  const out = { ...was };
  for (const [k, v] of Object.entries(now)) out[k] = overlay(was[k], v);
  return out;
}

const measuredWith =
  attestation.measured?.reference ?? "the pack's own content";

/**
 * The attestation figures that depend on which backend answered.
 *
 * Everything else in that block is backend-independent and was checked: a plain
 * run and the `--ref` run behind the committed Latin file agree exactly on all
 * four gate figures — 105 unattested tokens, 89 distinct forms, 104 questions
 * affected, worst 2. They disagree on the *accounting* — 65,323 answer tokens
 * against 53,214, 10,656 function words against 8,181 — because the wide
 * backend classifies a different set as exempt.
 *
 * So a run without the dictionary keeps what the dictionary measured rather
 * than replacing it with a number that means something else under the same
 * name. The gate figures are rewritten either way, because those are the ones
 * that move when the content moves, which is what a baseline is for.
 */
const BACKEND_SENSITIVE = [
  "answerTokens",
  "exemptFunctionWords",
  "exemptEnclitic",
  "exemptProperNoun",
  "indexGapTokensVsDictionary",
];

const usingReference = Boolean(attestation.measured?.split);
const attestationBlock = { ...attestation.measured };
if (!usingReference && previous.attestation) {
  for (const key of BACKEND_SENSITIVE) {
    if (previous.attestation[key] !== undefined) {
      attestationBlock[key] = previous.attestation[key];
    }
  }
}

const next = overlay(previous, {
  measuredAt: new Date().toISOString().slice(0, 10),
  measuredWith,
  ...(usingReference || !previous.attestation
    ? {}
    : { _attestationNote: "the accounting fields were measured with the reference and are kept; re-run with --ref to remeasure them" }),
  profileFoldDigest: previous.profileFoldDigest,
  grammar: grammar.measured,
  ...(secondary.length
    ? {
        grammars: Object.fromEntries(
          secondary.map((g) => [
            g.measured.id,
            {
              ...g.measured,
              ...(crosswalk.measured?.[g.measured.id]
                ? { crosswalk: crosswalk.measured[g.measured.id] }
                : {}),
            },
          ]),
        ),
      }
    : {}),
  ...(Object.keys(dictionaries.measured ?? {}).length
    ? { dictionaries: dictionaries.measured }
    : {}),
  questions: coverage.measured,
  // Only what this run could measure. The dictionary block comes from the
  // reference databases, which are not in this repo, so a run without `--ref`
  // keeps what is there rather than deleting a measurement it cannot make.
  ...(previous.dictionary ? { dictionary: previous.dictionary } : {}),
  attestation: attestationBlock,
  bundle: { ...previous.bundle, ...bundle() },
});

// --- what moved ---------------------------------------------------------------

const drift = [];
(function walk(was, now, at = "") {
  if (typeof now !== "object" || now === null) {
    if (was !== now) drift.push([at, was, now]);
    return;
  }
  for (const [k, v] of Object.entries(now)) {
    if (k.startsWith("_") || k === "measuredAt") continue;
    walk(was?.[k], v, at ? `${at}.${k}` : k);
  }
})(previous, next);

console.log(`Baseline — ${relative(REPO, dir)}`);
console.log(`  measured against: ${measuredWith}`);
if (!drift.length) {
  console.log("  nothing has moved since the file was written.");
} else {
  console.log(`  ${drift.length} figure${drift.length === 1 ? "" : "s"} moved:`);
  for (const [at, was, now] of drift) {
    console.log(`    ${at.padEnd(46)} ${was === undefined ? "(new)" : was} → ${now}`);
  }
}

if (write) {
  writeFileSync(path, `${JSON.stringify(next, null, 1)}\n`);
  console.log(`\nWritten to ${relative(REPO, path)}.`);
} else if (drift.length) {
  console.log("\nNothing written. Pass --write to record these.");
}
