import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, basename } from "node:path";
import {
  Content,
  LemmaIndex,
  compileFold,
  parseProfile,
  type GrammarSection,
  type LemmaEntry,
  type LemmaMap,
  type Profile,
  type Test,
} from "@lang-tutor/core";

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
 *   content/lemmas.json.gz         - gzipped LemmaEntry[]
 *   content/forms.txt.gz           - gzipped `form\tidx[,idx...]`, sorted
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

  // The dictionary ships split — a lemma table plus a sorted form index — and
  // is read here exactly as the web reads it. It used to be one denormalized
  // map parsed whole, which was free at 116 MB off a local disk and is not at
  // the ~300 MB the whole dictionary would take. A pack built before the split
  // still ships the old map; read that as it stands rather than demanding a
  // rebuild before the CLI will open it.
  const dictionary = JSON.parse(
    gunzipSync(readFileSync(join(dir, "lemmas.json.gz"))).toString("utf8"),
  ) as LemmaEntry[] | LemmaMap;
  const lemmas = Array.isArray(dictionary) ? undefined : dictionary;
  const lemmaLookup = Array.isArray(dictionary)
    ? new LemmaIndex(
        dictionary,
        gunzipSync(readFileSync(join(dir, "forms.txt.gz"))).toString("utf8"),
        compileFold(profile.fold),
      )
    : undefined;

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

  return new Content({ grammar, tests, lemmas, lemmaLookup }, profile);
}
