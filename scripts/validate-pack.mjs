#!/usr/bin/env node
/**
 * Every gate a language pack has to pass, in one command.
 *
 * This is what "the pack is ready" means, and what CI runs. It composes the two
 * reports rather than duplicating them, and adds the checks that belong to
 * neither: the profile parses, the fold fixtures hold, and the reference data
 * was written with the same fold the app folds with.
 *
 *   node --import tsx scripts/validate-pack.mjs [--pack languages/latin]
 *        [--ref /path/to/ref] [--built apps/web/public/content]
 *        [--profile-only] [--require-ref] [--allow-incomplete]
 *
 * Every gate here runs anywhere, against data the pack ships. `--ref` points at
 * the full reference databases when you have them, which answers the same
 * questions from a larger corpus; `--require-ref` insists on them, which is
 * what you want before shipping a pack and not what CI can ask for.
 *
 * `--allow-incomplete` reports the question-coverage gates without letting them
 * decide the exit code. A pack whose questions are still being generated fails
 * them by definition — a topic with no tests is exactly what C1 is for — and
 * that is a reason to publish it knowingly rather than a reason to call the
 * build broken. It never relaxes anything about correctness: the fold, the
 * families, the syllabus and the dictionary invariant are gates either way, and
 * so is every question that HAS been written. Use it to ship a draft, and take
 * it away again when the set is finished.
 *
 * Exit code is the answer: 0 means every gate passed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFold, profileHash } from "@lang-tutor/core";
import { REPO, gate, loadProfile, packDir, report } from "./lib/pack.mjs";
import { openReference, requireDictionary } from "./lib/reference.mjs";

const argv = process.argv.slice(2);
const REQUIRE_REF = argv.includes("--require-ref");
const dir = packDir(argv);
const profile = loadProfile(dir);
const fold = compileFold(profile.fold);
const gates = [];

console.log(`Validating ${profile.l2.name} (${dir})`);
console.log(`  source grammar: ${profile.grammar.source.title}`);
console.log(`  licence:        ${profile.grammar.source.licence}`);

// --- A: the profile and its fold fixtures ------------------------------------
// The fold decides whether a written answer is marked right, and an over-eager
// one is silent: it marks wrong answers right forever and nothing else notices.
// Hence fixtures in both directions, and a floor on how many.

const fixturesPath = join(dir, "fold.fixtures.json");
if (existsSync(fixturesPath)) {
  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
  const equal = fixtures.equal ?? [];
  const differ = fixtures.differ ?? [];
  const wrongEqual = equal.filter(([a, b]) => fold(a) !== fold(b));
  const wrongDiffer = differ.filter(([a, b]) => fold(a) === fold(b));
  gates.push(
    gate("A1", equal.length >= 5 && differ.length >= 3,
      `${equal.length} must-equal and ${differ.length} must-differ pairs (want ≥5 and ≥3)`),
  );
  gates.push(
    gate("A2", wrongEqual.length === 0 && wrongDiffer.length === 0,
      wrongEqual.length ? `${wrongEqual.length} pairs that must match do not: ${wrongEqual.slice(0, 2).map((p) => p.join("/")).join(", ")}`
        : wrongDiffer.length ? `${wrongDiffer.length} pairs that must differ collide: ${wrongDiffer.slice(0, 2).map((p) => p.join("/")).join(", ")}`
        : "every fold fixture holds"),
  );
} else {
  gates.push(gate("A1", false, `no fold.fixtures.json in ${dir} — the fold is untested`));
}

gates.push(
  gate("A3", profile.families.length > 0 && profile.families.some((f) => f.id === profile.fallbackFamily),
    `${profile.families.length} families, fallback "${profile.fallbackFamily}"`),
);

// --- B: the reference data -----------------------------------------------------

if (!argv.includes("--profile-only")) {
  // Both of these throw rather than return a verdict, because everywhere else
  // they are called there is nothing sensible to do afterwards. Here there is:
  // report it as the gate it is, and carry on to the ones that do not need it.
  let ref;
  try {
    ref = openReference(dir, profile, argv);
    if (REQUIRE_REF) requireDictionary(ref, profile);
  } catch (e) {
    gates.push(gate("D1", false, e.message.split("\n")[0]));
  }
  if (ref && !gates.some((g) => g.id === "D1")) {
    console.log(`  reference:      ${ref.label}`);

    // D2, and the reason this indirection exists at all. Every lookup in the
    // pack is keyed by folded text, so a fold that has drifted from whatever
    // normalised the reference turns every lookup into a miss while both halves
    // look perfectly healthy on their own. What gets sampled depends on which
    // reference answered — see reference.mjs — but the invariant is one.
    const { checked, bad, what } = ref.foldAgreement();
    gates.push(
      gate("D2", bad.length === 0,
        bad.length
          ? `fold disagrees with ${what} on ${bad.length} of ${checked} rows ` +
            `(e.g. ${bad[0].shown} folds to ${fold(bad[0].shown)}, stored as ${bad[0].stored})`
          : `fold matches ${what} on ${checked} rows`),
    );

    const ranks = ref.allRanks();
    const dense = ranks.length > 0 && ranks[0] === 1 && ranks[ranks.length - 1] === ranks.length;
    gates.push(
      gate("D3", dense,
        dense ? `${ranks.length} lemmas ranked 1..${ranks.length} with no gaps`
          : `ranks are not dense 1..N (first ${ranks[0]}, last ${ranks[ranks.length - 1]}, count ${ranks.length})`),
    );

    // D5 is a human check; print the evidence it needs.
    console.log(
      `\n  top 20 by frequency (these must read like the language's commonest words):\n    ` +
        ref.top(20).map((r) => `${r.lemma}${r.pos ? `/${r.pos}` : ""}`).join(" "),
    );

    ref.close();
  }
}

// --- C: the built bundle ------------------------------------------------------
// The web app bisects `forms.txt` as raw text, so the keys must be sorted by
// code unit and be fold output already. Both are cheap to check and impossible
// to notice by hand.

const builtAt = argv.indexOf("--built");
if (builtAt >= 0) {
  const built = argv[builtAt + 1] ?? join(REPO, "apps", "web", "public", "content");
  const formsPath = join(built, "forms.txt.gz");
  if (existsSync(formsPath)) {
    const lines = gunzipSync(readFileSync(formsPath)).toString("utf8").split("\n").filter(Boolean);
    const keys = lines.map((l) => l.split("\t")[0]);
    let unsorted = 0;
    for (let i = 1; i < keys.length; i++) if (keys[i] < keys[i - 1]) unsorted++;
    const unfolded = keys.filter((k) => fold(k) !== k).slice(0, 3);
    gates.push(
      gate("B1", unsorted === 0,
        unsorted ? `${unsorted} of ${keys.length} index keys are out of code-unit order`
          : `all ${keys.length} index keys in code-unit order`),
    );
    gates.push(
      gate("B2", unfolded.length === 0,
        unfolded.length ? `index keys are not fold output: ${unfolded.join(", ")}`
          : "every index key is already folded"),
    );
  } else {
    gates.push(gate("B1", false, `no forms.txt.gz under ${built} — run the content build first`));
  }
}

console.log(`\n  fold digest: ${profileHash(profile.fold)}`);

// --- run the two reports ------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const ALLOW_INCOMPLETE = argv.includes("--allow-incomplete");
let reportsOk = true;
if (!argv.includes("--profile-only")) {
  for (const script of ["grammar-report.mjs", "coverage-report.mjs"]) {
    // The flag is handed to the coverage report rather than used to ignore its
    // exit code: only it knows which of its gates are about how much has been
    // written and which are about whether it is right, and a draft is excused
    // the first kind alone. The grammar report gets no such licence — a
    // syllabus is either sound or it is not.
    const args = ["--import", "tsx", join(here, script), "--pack", dir];
    // Forwarded, or the coverage report answers C5 and C7 from the pack while
    // the gates above answered from the dictionary — one command, two
    // references, and no sign in the output that they differed.
    const refAt = argv.indexOf("--ref");
    if (refAt >= 0) args.push("--ref", argv[refAt + 1]);
    if (ALLOW_INCOMPLETE && script === "coverage-report.mjs") args.push("--allow-incomplete");
    try {
      execFileSync(process.execPath, args, { stdio: "inherit" });
    } catch {
      reportsOk = false;
    }
  }
}

const ok = report(`Pack gates — ${profile.id}`, gates) && reportsOk;
console.log(
  ok
    ? `\n${profile.l2.name} passes every gate${ALLOW_INCOMPLETE ? " it was asked to" : ""}.`
    : `\n${profile.l2.name} is not ready; see the failures above.`,
);
process.exit(ok ? 0 : 1);
