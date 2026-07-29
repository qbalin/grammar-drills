import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, basename } from "node:path";
import {
  Content,
  parseProfile,
  type GrammarSection,
  type LemmaMap,
  type Profile,
  type Test,
} from "@latin-tutor/core";

/** Read and validate a pack's profile. Throws with the offending path named. */
export function loadProfile(packDir: string): Profile {
  return parseProfile(
    JSON.parse(readFileSync(join(packDir, "profile.json"), "utf8")),
  );
}

/**
 * Load a language pack: its profile, plus the frozen content bundle beneath it.
 *   profile.json        - the shape of the language
 *   content/grammar.json           - GrammarSection[]
 *   content/tests/<sectionId>.json - Test[]  (one file per generated topic)
 *   content/lemmas.json.gz         - gzipped LemmaMap
 *
 * `contentDir` overrides where the content is read from, for `--content`.
 */
export function loadPack(packDir: string, contentDir?: string): Content {
  return loadContent(contentDir ?? join(packDir, "content"), loadProfile(packDir));
}

export function loadContent(dir: string, profile: Profile): Content {
  const grammar = JSON.parse(
    readFileSync(join(dir, "grammar.json"), "utf8"),
  ) as GrammarSection[];

  const lemmas = JSON.parse(
    gunzipSync(readFileSync(join(dir, "lemmas.json.gz"))).toString("utf8"),
  ) as LemmaMap;

  const tests: Record<string, Test[]> = {};
  const testsDir = join(dir, "tests");
  if (existsSync(testsDir)) {
    for (const file of readdirSync(testsDir)) {
      if (!file.endsWith(".json")) continue;
      const sectionId = basename(file, ".json");
      tests[sectionId] = JSON.parse(
        readFileSync(join(testsDir, file), "utf8"),
      ) as Test[];
    }
  }

  return new Content({ grammar, tests, lemmas }, profile);
}
