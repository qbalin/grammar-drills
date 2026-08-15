#!/usr/bin/env node
/**
 * Stamp a new language pack, and hand back the command that judges it.
 *
 * `ADDING_A_LANGUAGE.md` is 586 lines and its first four steps are typing:
 * `profile.json` with its sixteen blocks, `fold.fixtures.json`, `gen/config.mjs`,
 * `icon.mjs`, `confetti.mjs`, `citations.mjs`, `pack.test.ts`, `package.json`,
 * `REVIEW.md`. All of it is the same every time apart from a dozen facts about
 * the language, and a document whose stated ideal is "each step ends in a
 * command whose exit code is the answer" should not open with four steps whose
 * answer is a text editor.
 *
 * So this writes the skeleton and then runs `validate-pack --profile-only`,
 * which is the first gate a pack can pass — A1, A2 and A3: the fold does what
 * its fixtures say, and the families are real. Everything downstream needs a
 * parsed grammar and cannot be scaffolded.
 *
 * **What it will not do is guess.** Every value it cannot derive is written as
 * a `TODO` that fails a gate rather than as a plausible default that passes
 * one. A fold nobody wrote is the worst thing this could produce: it would mark
 * wrong answers right for ever and no test would notice, which is the exact
 * failure `fold.fixtures.json` exists to catch.
 *
 *   node --import tsx scripts/new-pack.mjs --id old-english --name "Old English" \
 *     --code ang --endonym "Englisc"
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { REPO, args } from "./lib/pack.mjs";

const { at, has } = args();
const id = at("--id");
const name = at("--name");
const code = at("--code");
const endonym = at("--endonym", name);

if (!id || !name || !code) {
  console.error(
    "usage: node --import tsx scripts/new-pack.mjs --id <dir> --name <language> " +
      "--code <bcp47> [--endonym <native name>]\n\n" +
      "  --id       the directory under languages/, e.g. old-english\n" +
      "  --name     what English calls it, e.g. \"Old English\"\n" +
      "  --code     its BCP-47 code, e.g. ang — this becomes `lang=` on every\n" +
      "             line of it the app renders\n" +
      "  --endonym  what it calls itself; the app's own name. Defaults to --name.",
  );
  process.exit(1);
}

const dir = join(REPO, "languages", id);
if (existsSync(dir) && !has("--force")) {
  console.error(`${relative(REPO, dir)} already exists. Refusing to write over a pack.`);
  process.exit(1);
}

const TODO = "TODO";

/**
 * The profile, with every judgement left as a TODO.
 *
 * The numbers that *are* filled in are the two packs' shared calibration —
 * `coverage` is identical in both and `grammarShape` differs only in how many
 * topics a book has, which is the one thing a new pack cannot know before its
 * grammar is parsed. They are a starting point that `grammar-report` will
 * argue with, which is the right way round.
 */
const profile = {
  schema: 1,
  id,
  l2: {
    code,
    name,
    endonym,
    // Read by nothing yet; `direction` reaches the DOM through `l2Attrs`.
    script: TODO,
    direction: "ltr",
  },
  l1: { code: "en", name: "English" },
  /*
   * The whole of what "the same word" means in this language, and the one
   * block nothing can guess. Latin folds macrons away and v/u together; Greek
   * strips accents but keeps breathings and folds final sigma. What yours does
   * is a decision about the language, and `fold.fixtures.json` beside this is
   * where it is proved.
   */
  fold: {
    trim: true,
    caseFold: "lower",
    decompose: "NFD",
    stripMarks: [],
    keepMarks: [],
    map: [],
    recompose: "NFC",
  },
  paradigms: { primary: [], secondary: [], tables: {} },
  // One per part of the book. The grammar's own table of contents, once it is
  // parsed — `grammar-report`'s G4 fails on a family with nothing in it.
  families: [{ id: TODO, label: TODO }],
  fallbackFamily: TODO,
  /*
   * Everything but the four TODOs is structural: the labels a paradigm row can
   * be called, and how the parser recognises a heading. Filled in with values
   * that parse, so that the first run of `validate-pack --profile-only` fails on
   * the *fold fixtures* — which is the real first decision — rather than on a
   * missing key, which is a stack trace rather than a to-do list.
   */
  grammar: {
    source: { title: TODO, url: TODO, licence: TODO },
    label: TODO,
    idPrefix: "xx",
    refPrefix: "§ ",
    paradigmLabels: [
      "nom", "gen", "dat", "acc", "abl", "voc",
      "sing", "singular", "plur", "plural",
      "1st", "2nd", "3rd", "1", "2", "3",
    ],
    headingPattern: "^\\p{Lu}[\\p{Lu} .,'’—-]*\\.?$",
    headingFlags: "u",
    headingMaxLength: 40,
  },
  questions: {
    defaultKind: `translate-en-${code}`,
    produceKinds: [`translate-en-${code}`],
  },
  citationsVersion: 1,
  ui: {
    appName: endonym,
    manifestName: `${endonym} — ${name} tutor`,
    description: `A spaced-repetition ${name} tutor.`,
    promptDirection: `Translate into ${name}`,
    cliPlaceholder: `type your ${name}, then Enter…`,
    cliHint: `type your ${name}`,
    webPlaceholder: `write your ${name}…`,
    answerAriaLabel: `Your ${name}`,
    sayItIn: `say it in ${name}`,
    themeColor: "#12121a",
    backgroundColor: "#12121a",
  },
  // Namespaced, because one origin serves every pack and two sharing a key
  // would be two languages writing over each other's progress.
  storage: {
    webProgressKey: `${id}-tutor:progress`,
    webSyncKey: `${id}-tutor:sync`,
    cliDir: `.${id}-tutor`,
    githubPath: `${id}-progress.json`,
    exportPrefix: `${id}-progress`,
    dictionaryCacheName: `${id}-dictionary`,
  },
  grammarShape: {
    minTopics: 50,
    maxTopics: 700,
    minTextChars: 120,
    maxTextChars: 24000,
    medianTextCharsRange: [400, 4000],
    p90TextCharsMax: 8000,
    maxFamilySharePct: 40,
  },
  coverage: {
    minTestsPerTopic: 6,
    minQuestionsPerTopic: 16,
    topicsWithTestsPct: 100,
    maxDuplicatePromptPct: 1.0,
    minDictResolvedPct: 90,
    minBandUtilisationPct: 25,
    minKeptRatioPct: 40,
  },
  // Absent on purpose. A pack that declares no `attestation` is held to 0/0,
  // which is the strict rule a new language should inherit by saying nothing —
  // see CLAUDE.md. Add it in the commit that generates content needing it, and
  // say which questions bought the number.
};

/**
 * The fold's proof, and the file that decides whether this pack can be trusted.
 *
 * A1 wants five pairs that must fold alike and three that must not, and the
 * second list is the one that matters: an over-eager fold marks wrong answers
 * right for ever, and nothing else in the suite would notice. The examples here
 * are shaped like Latin's so the format is unmistakable, and every one is a
 * TODO because a fixture nobody wrote is worse than none.
 */
const fixtures = {
  _comment: [
    "Pairs this pack's fold must treat as the same word, and pairs it must not.",
    "",
    "Replace every TODO with real forms of this language. A1 wants at least 5",
    "equal pairs and 3 that differ; A2 runs them. The `differ` list is the",
    "load-bearing half — an over-eager fold marks wrong answers right forever,",
    "and no other test in this repo would catch it.",
  ],
  equal: Array.from({ length: 5 }, () => [TODO, TODO]),
  differ: Array.from({ length: 3 }, () => [TODO, TODO]),
};

const packageJson = {
  name: `@lang-tutor/pack-${id}`,
  version: "0.1.0",
  private: true,
  type: "module",
  scripts: { test: "vitest run" },
  dependencies: { "@lang-tutor/core": "workspace:*" },
  devDependencies: { typescript: "^5.6.3", vitest: "^4.1.10" },
};

const packTest = `/**
 * The pack's own gates: the fold against its fixtures, and against every key of
 * the shipped dictionary once there is one.
 *
 * Copied from the other packs deliberately rather than shared — a pack is meant
 * to stand on its own, and this is the file that says what standing means.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileFold, parseProfile } from "@lang-tutor/core";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const profile = parseProfile(JSON.parse(readFileSync(here("./profile.json"), "utf8")));
const fixtures = JSON.parse(readFileSync(here("./fold.fixtures.json"), "utf8"));
const fold = compileFold(profile.fold);

describe("the fold", () => {
  it.each(fixtures.equal)("folds %s and %s alike", (a, b) => {
    expect(fold(a)).toBe(fold(b));
  });

  it.each(fixtures.differ)("keeps %s and %s apart", (a, b) => {
    expect(fold(a)).not.toBe(fold(b));
  });
});
`;

const review = `# ${name} pack — human review record

Three of the gates cannot be automated, because they are about whether the thing
reads well rather than whether it parses. They are recorded here so a later run
can see what was actually looked at, by whom, and when — an unsigned gate is an
unchecked gate.

## H1 — grammar segmentation read-through

| date | who | sample | verdict |
| --- | --- | --- | --- |

## H2 — generated question review

| date | who | sample | verdict |
| --- | --- | --- | --- |

## H3 — quoted question review

| date | who | sample | verdict |
| --- | --- | --- | --- |

## Known state

Nothing has been generated yet. \`validate-pack --profile-only\` is the gate this
pack can currently pass; everything else waits on \`grammar/parse.py\`.
`;

const files = [
  ["profile.json", `${JSON.stringify(profile, null, 2)}\n`],
  ["fold.fixtures.json", `${JSON.stringify(fixtures, null, 2)}\n`],
  ["package.json", `${JSON.stringify(packageJson, null, 2)}\n`],
  ["pack.test.ts", packTest],
  ["REVIEW.md", review],
];

mkdirSync(join(dir, "gen"), { recursive: true });
mkdirSync(join(dir, "grammar"), { recursive: true });
mkdirSync(join(dir, "content"), { recursive: true });
for (const [name_, body] of files) writeFileSync(join(dir, name_), body);

console.log(`Wrote ${relative(REPO, dir)}:`);
for (const [name_] of files) console.log(`  ${name_}`);
console.log(`  gen/  grammar/  content/   (empty)`);
console.log(
  `\nEvery TODO is a decision this cannot make for you. The fold and its\n` +
    `fixtures come first: they decide what counts as the same word, and a fold\n` +
    `nobody wrote marks wrong answers right forever.\n` +
    `\nThen ADDING_A_LANGUAGE.md from step 4 — grammar/parse.py is the next gate.\n`,
);

console.log(`Running the gate this pack can already be held to:\n`);
try {
  execFileSync(
    process.execPath,
    ["--import", "tsx", join(REPO, "scripts", "validate-pack.mjs"), "--pack", dir, "--profile-only"],
    { stdio: "inherit" },
  );
} catch {
  // Expected on a fresh pack: the fixtures are TODOs. Saying so is the point —
  // the checklist's own ideal is a step that ends in an exit code.
  console.log(
    `\nFailing, as it should on a pack nobody has filled in yet. That output is\n` +
      `the to-do list, and it is the same command that will say when it is done.`,
  );
}
