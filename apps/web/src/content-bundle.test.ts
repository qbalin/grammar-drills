// @vitest-environment node
// This one inspects files on disk rather than anything in a document, and the
// jsdom environment rewrites `import.meta.url` to an http URL.
import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildParadigm, type GrammarSection, type LemmaEntry, type Test } from "@lang-tutor/core";
import { LemmaIndex } from "./lemma-index.js";
import { ParadigmIndex } from "./paradigm-index.js";
import { profile } from "./pack.js";

/**
 * The built bundle, checked end to end: the pack writes the lemma table and the
 * form index, `scripts/build-web-content.mjs` copies them through, and
 * `LemmaIndex` reads them. The split is only safe if a form that resolved
 * through the map still resolves through the index, and only a test over the
 * real data can say so.
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
  "ancient-greek": [
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
    const form = profile.id === "ancient-greek" ? "ἀρετήν" : "manibus";
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

  /**
   * The bug this is here to keep out: every part of the chain was correct on
   * its own — the paradigms were built, the keys matched, `buildParadigm` laid
   * them out — and a student still got "this word does not change" for
   * `frater`. Nothing in the suite walked the whole chain over the real
   * bundle, so nothing noticed. This does: dictionary form in, filled-in table
   * out, through the same two classes the app uses.
   */
  it("lays out a real table for a word looked up through the real index", () => {
    const entries = JSON.parse(read("lemmas.json.gz")) as LemmaEntry[];
    const index = new LemmaIndex(entries, read("forms.txt.gz"));
    const paradigms = new ParadigmIndex(read("paradigms.txt.gz"));

    // A noun and a verb per pack, given as the form a student would meet
    // rather than as the headword — the lemma is the app's job to find.
    const worked =
      profile.id === "ancient-greek"
        ? ["ἀδελφοῦ", "ἔλυσαν"]
        : ["fratrem", "aedificavit"];

    for (const form of worked) {
      const entry = index.lookup(form)[0];
      expect(entry, form).toBeDefined();
      const forms = paradigms.formsFor(entry!.lemma, entry!.pos);
      expect(forms.length, `${form} -> ${entry!.lemma}|${entry!.pos}`).toBeGreaterThan(0);

      const blocks = profile.paradigms?.tables[entry!.pos];
      expect(blocks, `${entry!.pos} has no table`).toBeDefined();
      const paradigm = buildParadigm(forms, blocks!, profile.paradigms);
      expect(paradigm.tables.length, form).toBeGreaterThan(0);
      // A table of empty cells would satisfy the count and help nobody.
      const filled = paradigm.tables.flatMap((t) =>
        t.rows.flatMap((r) => r.cells.flat()),
      );
      expect(filled.length, form).toBeGreaterThan(3);
    }
  });

  /**
   * Every `pos` the dictionary carries in quantity should either have a table
   * or be genuinely uninflected. Latin's proper names had neither for a while:
   * 1,789 of them shipped with full paradigms and no grid to print them in.
   */
  it("declares a table for every part of speech it ships paradigms for in bulk", () => {
    const entries = JSON.parse(read("lemmas.json.gz")) as LemmaEntry[];
    const keys = new Set(entries.map((e) => `${e.lemma}|${e.pos}`));
    const withForms = new Map<string, number>();
    for (const line of read("paradigms.txt.gz").split("\n").slice(1)) {
      const key = line.slice(0, line.indexOf("\t"));
      if (!keys.has(key)) continue;
      const pos = key.slice(key.indexOf("|") + 1);
      withForms.set(pos, (withForms.get(pos) ?? 0) + 1);
    }
    const tables = profile.paradigms?.tables ?? {};
    // Not every inflecting `pos` can be a grid. A Latin adverb's whole
    // paradigm is `celerius` and `celerrimē` — a comparative and a superlative
    // with no third axis to cross them against, and `parseAxis` rightly
    // refuses an axis that names no tags. Those are listed under "Other forms"
    // instead, which is why the sheet lays forms out with or without blocks.
    const LISTED = new Set(["adv"]);
    const missing = [...withForms]
      .filter(([pos, n]) => n >= 100 && !tables[pos] && !LISTED.has(pos))
      .map(([pos, n]) => `${pos} (${n})`);
    expect(missing).toEqual([]);
  });

  it("is sorted the way the bisection compares", () => {
    const lines = read("forms.txt.gz").split("\n");
    // The comparison is the cheap part and `expect` is not: a quarter of a
    // million assertions took this test past the timeout whenever the machine
    // was busy with the rest of the suite. Find the first pair out of order,
    // then assert once — the same check, and it names the pair either way.
    let wrong = "";
    for (let i = 1; i < lines.length; i++) {
      // Code-unit order, and no duplicate keys.
      if (!(lines[i - 1]! < lines[i]!)) {
        wrong = `${lines[i - 1]} then ${lines[i]}`;
        break;
      }
    }
    expect(wrong, "out of order at").toBe("");
  });
});
