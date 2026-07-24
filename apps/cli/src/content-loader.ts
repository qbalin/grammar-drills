import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, basename } from "node:path";
import { Content, type GrammarSection, type LemmaMap, type Test } from "@latin-tutor/core";

/**
 * Load the frozen content bundle from a directory:
 *   grammar.json        - GrammarSection[]
 *   tests/<sectionId>.json - Test[]  (one file per generated topic)
 *   lemmas.json.gz      - gzipped LemmaMap
 */
export function loadContent(dir: string): Content {
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

  return new Content({ grammar, tests, lemmas });
}
