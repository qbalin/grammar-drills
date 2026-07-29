// @vitest-environment node
// This one inspects files on disk rather than anything in a document, and the
// jsdom environment rewrites `import.meta.url` to an http URL.
import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GrammarSection, LemmaEntry, Test } from "@lang-tutor/core";
import { LemmaIndex } from "./lemma-index.js";
import { profile } from "./pack.js";

/**
 * The built bundle, checked end to end: `scripts/build-web-content.mjs` writes
 * it, and `LemmaIndex` reads it. The repack is only safe if a form that
 * resolved through the 43 MB map still resolves through the 4 MB index, and
 * only a test over the real data can say so.
 *
 * `public/content/` is generated, not committed, so this skips when it is
 * missing — `pnpm --filter @lang-tutor/web content` builds it.
 *
 * Which pack it holds is whatever was built last, so nothing here may assume
 * Latin. The counts are read from the pack the bundle came from rather than
 * written down, which also makes them a check on the repack itself instead of
 * a number to update by hand.
 */
const dir = fileURLToPath(new URL("../public/content/", import.meta.url));
const packDir = fileURLToPath(
  new URL(`../../../languages/${profile.id}/content/`, import.meta.url),
);

function read(name: string): string {
  return gunzipSync(readFileSync(`${dir}${name}`)).toString("utf8");
}

/**
 * The bundle is built one language at a time and the tests are not, so the
 * pack the suite is compiled against and the pack sitting in public/content
 * can be different ones — a Greek build followed by a plain `pnpm -r test`.
 * Comparing the two would fail on a mismatch that is not a defect, so the
 * suite runs against the bundle it was given and stands down when that bundle
 * belongs to another pack.
 */
const built =
  existsSync(`${dir}forms.txt.gz`) &&
  (JSON.parse(read("grammar.json.gz")) as GrammarSection[])[0]?.id.startsWith(
    `${profile.grammar.idPrefix}-`,
  ) === true;

/** What the pack ships, before the repack — the bundle's own source of truth. */
function shipped<T>(name: string): T {
  return JSON.parse(readFileSync(`${packDir}${name}`, "utf8")) as T;
}

/**
 * A form whose citation the built index has to be able to produce, per pack.
 * Latin's are straight from the README's table of what recording a word gives;
 * Greek's are the equivalent — a noun cited with its article, a verb with its
 * principal parts.
 */
const WORKED: Record<string, Array<[string, string]>> = {
  latin: [
    ["manibus", "manus"],
    ["regem", "rēgis"],
    ["amāvērunt", "amō"],
    ["bonīs", "bonus"],
  ],
  greek: [
    ["λόγοις", "τοῦ λόγου"],
    ["πόλεως", "ἡ πόλις"],
    ["ἔλυσαν", "λύσω"],
    ["ἀνθρώπου", "ὁ ἄνθρωπος"],
  ],
};

describe.skipIf(!built)("the built content bundle", () => {
  it("keeps every grammar section, with its family and text intact", () => {
    const grammar = JSON.parse(read("grammar.json.gz")) as GrammarSection[];
    expect(grammar).toHaveLength(shipped<GrammarSection[]>("grammar.json").length);
    for (const s of grammar) {
      expect(s.id, s.id).toMatch(new RegExp(`^${profile.grammar.idPrefix}-`));
      expect(s.text.length, s.id).toBeGreaterThan(0);
      expect(s.family, s.id).toBeTruthy();
    }
  });

  it("files every test under a section it has, each question answerable", () => {
    // Not "a test for every section": whether the syllabus is fully covered is
    // gate C1's question, and a pack mid-generation would fail it here without
    // anything being wrong with the repack.
    const grammar = JSON.parse(read("grammar.json.gz")) as GrammarSection[];
    const ids = new Set(grammar.map((s) => s.id));
    const tests = JSON.parse(read("tests.json.gz")) as Record<string, Test[]>;
    expect(Object.keys(tests).length).toBeGreaterThan(0);
    for (const [sectionId, list] of Object.entries(tests)) {
      expect(ids.has(sectionId), sectionId).toBe(true);
      expect(list.length, sectionId).toBeGreaterThan(0);
      for (const t of list) {
        expect(t.questions.length, t.id).toBeGreaterThan(0);
        for (const q of t.questions) {
          expect(q.prompt, t.id).toBeTruthy();
          expect(q.answer, t.id).toBeTruthy();
        }
      }
    }
  });

  it("resolves the pack's worked examples through the repacked index", () => {
    const entries = JSON.parse(read("lemmas.json.gz")) as LemmaEntry[];
    const index = new LemmaIndex(entries, read("forms.txt.gz"));

    for (const [form, citation] of WORKED[profile.id] ?? []) {
      expect(index.lookup(form)[0]?.citation, form).toContain(citation);
    }
  });

  it("keeps an ambiguous form's rarer reading reachable behind its commoner one", () => {
    const entries = JSON.parse(read("lemmas.json.gz")) as LemmaEntry[];
    const index = new LemmaIndex(entries, read("forms.txt.gz"));
    // Latin's `manibus` is the README's example: the adjective mānis has to
    // still be there behind the noun. Greek's fold is the more aggressive of
    // the two, so ambiguity is the rule rather than the exception — λόγῳ and
    // λόγω, dative and Doric genitive, arrive as one key.
    const form = profile.id === "greek" ? "ἀρετήν" : "manibus";
    const hits = index.lookup(form);
    expect(hits.length, form).toBeGreaterThan(1);
  });

  it("finds every form the index claims to hold", () => {
    const entries = JSON.parse(read("lemmas.json.gz")) as LemmaEntry[];
    const raw = read("forms.txt.gz");
    const index = new LemmaIndex(entries, raw);
    const lines = raw.split("\n");

    // Sampled rather than exhaustive: 242k bisections is a slow test, and a
    // spread across the whole blob catches an off-by-one just as well.
    for (let i = 0; i < lines.length; i += 97) {
      const line = lines[i]!;
      const form = line.slice(0, line.indexOf("\t"));
      const ids = line.slice(line.indexOf("\t") + 1).split(",");
      const hits = index.lookup(form);
      expect(hits, form).toHaveLength(ids.length);
      expect(hits[0], form).toEqual(entries[Number(ids[0])]);
    }
  });

  it("is sorted the way the bisection compares", () => {
    const lines = read("forms.txt.gz").split("\n");
    for (let i = 1; i < lines.length; i++) {
      // Code-unit order, and no duplicate keys.
      expect(lines[i - 1]! < lines[i]!, `${lines[i - 1]} then ${lines[i]}`).toBe(true);
    }
  });
});
