#!/usr/bin/env node
/**
 * The rule that keeps the split honest: `packages/core` may not know any
 * language.
 *
 * Enforced rather than trusted, because this is exactly the kind of rule that
 * erodes one convenient import at a time. If the engine needs to know
 * something about a language, that is a missing field on the profile, not a
 * reason to reach into `languages/`.
 *
 * Doc comments may name a language — "Greek needs `u` for \p{Lu}" is the
 * clearest way to say why a field exists — so comments are stripped before the
 * check. What is forbidden is a language name in the *code*.
 *
 *   node scripts/check-core-purity.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const CORE = join(REPO, "packages", "core", "src");

/** Files that exist to stand in for a language and are exempt by their nature. */
const EXEMPT = /\.test\.tsx?$|\.fixture\.ts$/;

/** Language names and source-grammar names that must not appear in engine code. */
const LANGUAGES =
  /\b(latin|latina|latino|greek|graec\w*|smyth|bennett|macron|gutenberg|classical)\b/i;

/** A path into the packs, however it is spelled. */
const PACK_IMPORT = /["'`][^"'`]*\blanguages\//;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/**
 * Drop comments and leave the code. Crude on purpose — a string containing
 * "//" would be mangled, but mangling it can only cause a false *pass* on that
 * one line, never a false failure, and no such string exists in core.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const problems = [];
for (const file of walk(CORE)) {
  if (EXEMPT.test(file)) continue;
  const source = readFileSync(file, "utf8");
  const code = codeOnly(source);
  code.split("\n").forEach((line, i) => {
    const where = `${relative(REPO, file)}:${i + 1}`;
    if (PACK_IMPORT.test(line)) {
      problems.push(`${where}  reaches into languages/: ${line.trim()}`);
    }
    const named = line.match(LANGUAGES);
    if (named) {
      problems.push(`${where}  names a language in code ("${named[0]}"): ${line.trim()}`);
    }
  });
}

if (problems.length) {
  console.error(
    `packages/core must not know about any particular language, but:\n` +
      problems.map((p) => `  ${p}`).join("\n") +
      `\n\nIf the engine needs this, add a field to the profile (packages/core/src/pack.ts)\n` +
      `and let the pack supply it.`,
  );
  process.exit(1);
}
console.log("core purity: packages/core names no language in code.");
