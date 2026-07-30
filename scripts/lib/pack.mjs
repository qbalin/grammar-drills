/**
 * Shared pack loading for the offline scripts.
 *
 * Every script here works on a pack directory rather than on a hardcoded path,
 * which is the whole point of the exercise: `--pack languages/ancient-greek` has to be
 * the only difference between running these for one language and another.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProfile } from "@lang-tutor/core";

export const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Resolve `--pack`, `--language`, `$LANG_PACK`, then the default. */
export function packDir(argv = process.argv.slice(2)) {
  const at = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const explicit = at("--pack");
  if (explicit) return explicit;
  const named = at("--language") ?? process.env.LANG_PACK ?? "latin";
  return join(REPO, "languages", named);
}

export function loadProfile(dir) {
  return parseProfile(JSON.parse(readFileSync(join(dir, "profile.json"), "utf8")));
}

export function loadGrammar(dir) {
  return JSON.parse(readFileSync(join(dir, "content", "grammar.json"), "utf8"));
}

/** The section-accounting manifest, or null if the parser never wrote one. */
export function loadGrammarCoverage(dir) {
  const path = join(dir, "content", "grammar-coverage.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

/** sectionId -> Test[], read from the per-topic files. */
export function loadTests(dir) {
  const out = {};
  const testsDir = join(dir, "content", "tests");
  if (!existsSync(testsDir)) return out;
  for (const file of readdirSync(testsDir)) {
    if (!file.endsWith(".json")) continue;
    out[basename(file, ".json")] = JSON.parse(
      readFileSync(join(testsDir, file), "utf8"),
    );
  }
  return out;
}

export function loadLemmas(dir) {
  return JSON.parse(
    gunzipSync(readFileSync(join(dir, "content", "lemmas.json.gz"))).toString("utf8"),
  );
}

/**
 * The reference dictionary/frequency dir: --ref, $LANG_REF, then the sibling.
 *
 * The sibling project names its language directories with underscores
 * (`ancient_greek`) and this one names its packs with hyphens
 * (`ancient-greek`), so a single guess misses for every pack whose id is more
 * than one word. It missed silently, too: the caller went straight to
 * `new DatabaseSync(...)` and got `unable to open database file` with no path
 * in it, which reads like a corrupt database rather than a wrong directory.
 * Try both spellings and keep the first that is actually there.
 */
export function refDir(profile, argv = process.argv.slice(2)) {
  const i = argv.indexOf("--ref");
  if (i >= 0) return argv[i + 1];
  const explicit =
    process.env.LANG_REF ??
    // Kept for the pack that predates the rename.
    (profile.id === "latin" ? process.env.LATIN_REF : undefined);
  if (explicit) return explicit;
  const siblings = join(REPO, "..", "language_learning", "languages");
  const candidates = [profile.id, profile.id.replace(/-/g, "_")];
  for (const name of candidates) {
    if (existsSync(join(siblings, name, "dictionary.db"))) return join(siblings, name);
  }
  // Nothing found: hand back the canonical guess so the caller's own
  // "is the reference here?" check reports a path a person can go and look at.
  return join(siblings, profile.id);
}

/**
 * Fail with the path when the reference databases are missing.
 *
 * `validate-pack` and `coverage-report` treat an absent reference as "gates
 * skipped", which is right for them. `gen-tests` and `build-lemmas` cannot do
 * their job without it and should say so in the one sentence that fixes it.
 */
export function requireRef(ref, profile) {
  const missing = ["dictionary.db", "frequencies.db"].filter(
    (db) => !existsSync(join(ref, db)),
  );
  if (!missing.length) return ref;
  throw new Error(
    `reference databases not found for ${profile.id}: ${missing.join(", ")} missing from ${ref}\n` +
    `Point at them with --ref /path/to/languages/${profile.id} or LANG_REF=...`,
  );
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** A gate result the reports collect and `validate-pack` exits on. */
export function gate(id, ok, detail) {
  return { id, ok, detail };
}

export function report(title, gates, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify({ title, gates }, null, 2));
  } else {
    console.log(`\n${title}`);
    for (const g of gates) {
      console.log(`  ${g.ok ? "✓" : "✗"} ${g.id.padEnd(4)} ${g.detail}`);
    }
    const failed = gates.filter((g) => !g.ok);
    console.log(
      failed.length
        ? `\n${failed.length} of ${gates.length} gates failed.`
        : `\nAll ${gates.length} gates pass.`,
    );
  }
  return gates.every((g) => g.ok);
}
