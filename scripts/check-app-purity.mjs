#!/usr/bin/env node
/**
 * The apps' half of the rule `check-core-purity.mjs` keeps for the engine: an
 * app built for one language may not put **another** language's name on screen.
 *
 * The engine's rule is that it must not know a language at all. The apps' rule
 * cannot be that — a build *is* one pack, the profile is aliased in, and every
 * screen names the language it teaches. What went wrong is narrower and was
 * live in the shipped Greek app for months: four strings that said "Latin"
 * because Latin was the only pack when they were written. One of them was
 * thrown at a Greek student importing a file; another sat two hundred lines
 * from its own twin, which had been parameterised and left the first behind.
 *
 * So this checks the **built bundle** rather than the source. Nothing about how
 * a string is written matters — a JSX text node, an `aria-label`, a thrown
 * `Error`, a class name — only whether it survives into what ships. That is the
 * question, and it is the only form of it with no way round.
 *
 * What counts as forbidden is derived, never listed: every *other* pack in
 * `languages/` supplies its own names, so adding a third language extends the
 * check by existing. A pack's own names are of course allowed, and so is the
 * shared vocabulary of the field — see `SHARED`.
 *
 *   node scripts/check-app-purity.mjs --pack languages/ancient-greek
 *   node scripts/check-app-purity.mjs --pack languages/latin --dist apps/web/dist
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO, packDir, loadProfile } from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const at = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dir = packDir(argv);
const dist = at("--dist") ?? join(REPO, "apps", "web", "dist");
const profile = loadProfile(dir);

/**
 * What a pack calls the language it teaches — the three proper nouns, and
 * deliberately not the books.
 *
 * `grammar.label` is left out because a book is named after a person and people
 * are named after ordinary words. React's scheduler calls a field `lane`, so
 * including Lane made every build fail fourteen times over minified vendor code
 * — and a guard that cries wolf is a guard somebody turns off. A book label in
 * the wrong build is a real but much smaller fault than a language name, and it
 * is not worth buying at that price.
 */
function namesOf(p) {
  return [p.l2.name, p.l2.endonym, p.ui.appName].filter(Boolean);
}

/**
 * Words that belong to the subject rather than to any one language.
 *
 * "Ancient" describes a quotation in either pack, and refusing it would push
 * the copy into circumlocution to satisfy a checker. Kept short on purpose:
 * every entry is a hole in the guard.
 */
const SHARED = /^(classical|ancient|modern|tutor|grammar)$/i;

/**
 * Every term another pack uses for itself that this one does not.
 *
 * Phrases are split as well as kept whole — "Ancient Greek" has to be caught by
 * a stray "Greek", which is how such a string is actually spelled — and then
 * anything this pack says about itself is subtracted, so a shared word can
 * never be forbidden to the pack that legitimately uses it.
 */
function forbidden() {
  const split = (phrase) => phrase.split(/[\s—–-]+/).filter(Boolean);
  const mine = new Set(namesOf(profile).flatMap(split).map((w) => w.toLowerCase()));
  const terms = new Map();
  for (const name of readdirSync(join(REPO, "languages"))) {
    const other = join(REPO, "languages", name);
    if (other === dir || !existsSync(join(other, "profile.json"))) continue;
    for (const phrase of namesOf(loadProfile(other))) {
      for (const word of split(phrase)) {
        const key = word.toLowerCase();
        if (key.length < 4 || mine.has(key) || SHARED.test(key)) continue;
        if (!terms.has(key)) terms.set(key, { word, from: `${name}: ${phrase}` });
      }
    }
  }
  return terms;
}

/**
 * One term as a pattern.
 *
 * `\b` is defined on `\w`, which is ASCII, so an endonym in its own script —
 * Ἑλληνικά — anchored that way would match nothing at all and the check would
 * pass by never looking. Those are matched literally instead; there is no word
 * inside them for a boundary to be wrong about.
 */
function patternFor(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return /^[\w\s-]+$/.test(word)
    ? new RegExp(`\\b${escaped}\\b`, "giu")
    : new RegExp(escaped, "giu");
}

function bundleFiles(root) {
  if (!existsSync(root)) {
    console.error(
      `no build at ${relative(REPO, root)} — this checks what ships, so build first:\n` +
        `  LANG_PACK=${profile.id} pnpm --filter @lang-tutor/web build`,
    );
    process.exit(1);
  }
  const out = [];
  const walk = (at) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      // The shell and the stylesheet. Not `content/`: that is the pack's own
      // grammar and questions, which say whatever the book says.
      else if (/\.(js|css|html|webmanifest)$/.test(path)) out.push(path);
    }
  };
  walk(root);
  return out;
}

const terms = forbidden();
if (!terms.size) {
  console.log(`app purity: ${profile.id} is the only pack; nothing to confuse it with.`);
  process.exit(0);
}

const problems = [];
for (const file of bundleFiles(dist)) {
  const text = readFileSync(file, "utf8");
  for (const { word, from } of terms.values()) {
    for (const hit of text.matchAll(patternFor(word))) {
      // Enough either side to recognise the string, and no more: a minified
      // bundle is one line, and printing the line is printing the bundle.
      const at = Math.max(0, hit.index - 60);
      problems.push(
        `${relative(REPO, file)}  says "${hit[0]}" (${from})\n` +
          `      …${text.slice(at, hit.index + 60).replace(/\s+/g, " ")}…`,
      );
    }
  }
}

if (problems.length) {
  console.error(
    `the ${profile.id} build names another pack's language:\n` +
      problems.map((p) => `  ${p}`).join("\n") +
      `\n\nThe app is built per pack, so it may name the language it teaches —\n` +
      `through the profile (\`profile.l2.name\`, \`profile.ui.appName\`), never as\n` +
      `a literal. A literal is right until there is a second pack, and then it\n` +
      `is wrong on somebody's phone.`,
  );
  process.exit(1);
}
console.log(
  `app purity: the ${profile.id} build names no other pack's language ` +
    `(checked ${terms.size} terms).`,
);
