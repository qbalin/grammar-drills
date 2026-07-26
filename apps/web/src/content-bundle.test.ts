// @vitest-environment node
// This one inspects files on disk rather than anything in a document, and the
// jsdom environment rewrites `import.meta.url` to an http URL.
import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GrammarSection, LemmaEntry, Test } from "@latin-tutor/core";
import { LemmaIndex } from "./lemma-index.js";

/**
 * The built bundle, checked end to end: `scripts/build-web-content.mjs` writes
 * it, and `LemmaIndex` reads it. The repack is only safe if a form that
 * resolved through the 43 MB map still resolves through the 4 MB index, and
 * only a test over the real data can say so.
 *
 * `public/content/` is generated, not committed, so this skips when it is
 * missing — `pnpm --filter @latin-tutor/web content` builds it.
 */
const dir = fileURLToPath(new URL("../public/content/", import.meta.url));
const built = existsSync(`${dir}forms.txt.gz`);

function read(name: string): string {
  return gunzipSync(readFileSync(`${dir}${name}`)).toString("utf8");
}

describe.skipIf(!built)("the built content bundle", () => {
  it("keeps every grammar section, with its family and text intact", () => {
    const grammar = JSON.parse(read("grammar.json.gz")) as GrammarSection[];
    expect(grammar).toHaveLength(135);
    for (const s of grammar) {
      expect(s.id, s.id).toMatch(/^bn-/);
      expect(s.text.length, s.id).toBeGreaterThan(0);
      expect(s.family, s.id).toBeTruthy();
    }
  });

  it("keeps a test for every section, each question answerable", () => {
    const tests = JSON.parse(read("tests.json.gz")) as Record<string, Test[]>;
    expect(Object.keys(tests)).toHaveLength(135);
    for (const [sectionId, list] of Object.entries(tests)) {
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

  it("resolves the README's worked examples through the repacked index", () => {
    const entries = JSON.parse(read("lemmas.json.gz")) as LemmaEntry[];
    const index = new LemmaIndex(entries, read("forms.txt.gz"));

    // Straight from the README's table of what recording a word should give.
    expect(index.lookup("manibus")[0]?.citation).toContain("manus");
    expect(index.lookup("regem")[0]?.citation).toContain("rēgis");
    expect(index.lookup("amāvērunt")[0]?.citation).toContain("amō");
    expect(index.lookup("bonīs")[0]?.citation).toContain("bonus");

    // `manibus` is the README's example of an ambiguous form: the adjective
    // mānis has to still be reachable behind the noun.
    const manibus = index.lookup("manibus");
    expect(manibus.length).toBeGreaterThan(1);
    expect(manibus.some((e) => e.pos === "adj")).toBe(true);
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
