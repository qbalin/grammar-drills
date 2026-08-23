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
import { bisect, parseProfile } from "@lang-tutor/core";
import { joinLemmaIndex } from "./lemma-map.mjs";

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

/**
 * The flags a script was given.
 *
 * Written out sixteen times across `scripts/`, in two spellings — `at(name)`
 * and `opt(name, default)` — and identical in every one: find the flag, take
 * the next word. A helper nobody had, next to `packDir` which already did the
 * same indexOf for `--pack`.
 *
 *   const { at, has } = args();
 *   const dist = at("--dist", defaultDist);
 *   if (has("--apply")) …
 */
export function args(argv = process.argv.slice(2)) {
  return {
    /** The word after `name`, or `fallback` when the flag is absent. */
    at(name, fallback = undefined) {
      const i = argv.indexOf(name);
      return i >= 0 ? argv[i + 1] : fallback;
    },
    /** Whether a bare flag was passed. */
    has(name) {
      return argv.includes(name);
    },
    argv,
  };
}

export function loadProfile(dir) {
  return parseProfile(JSON.parse(readFileSync(join(dir, "profile.json"), "utf8")));
}

/**
 * Every grammar the pack ships, primary first.
 *
 * One entry per book, each carrying what a report needs to hold it to its own
 * standard: where its sections are, what it calls its families, and the shape
 * it was calibrated at. The primary grammar's fields live at the top of the
 * profile and a secondary's in `profile.grammars`, so this is the one place
 * that difference has to be known.
 */
export function grammarsOf(profile) {
  return [
    {
      id: profile.grammar.idPrefix,
      label: profile.grammar.label,
      primary: true,
      content: "grammar.json",
      manifest: "grammar-coverage.json",
      coverage: profile.coverage,
      style: profile.grammar,
      families: profile.families,
      fallbackFamily: profile.fallbackFamily,
      shape: profile.grammarShape,
    },
    ...(profile.grammars ?? []).map((g) => ({
      id: g.id,
      label: g.label,
      primary: false,
      content: g.content,
      manifest: g.manifest,
      coverage: g.coverage,
      // Typography is the language's, not the book's; only the prefixes differ.
      style: { ...profile.grammar, idPrefix: g.idPrefix, refPrefix: g.refPrefix, source: g.source },
      families: g.families,
      fallbackFamily: g.fallbackFamily,
      shape: g.grammarShape,
    })),
  ];
}

/** Resolve `--grammar <id>` against the pack, defaulting to the primary. */
export function grammarNamed(profile, id) {
  const all = grammarsOf(profile);
  if (!id) return all[0];
  const found = all.find((g) => g.id === id);
  if (!found) {
    throw new Error(
      `no grammar "${id}" in this pack; it ships ${all.map((g) => g.id).join(", ")}`,
    );
  }
  return found;
}

/**
 * The further dictionaries a pack declares, in the order it declares them.
 *
 * Unlike `grammarsOf` there is no primary to fold in, and that is the point:
 * the pack's own `lemmas.json.gz` is **not** one of these. It answers a
 * different question — what may this pack ship, which is what `attests` is
 * asked — and listing it here would put a lexicon on the same footing as the
 * evidence. A pack that declares none gets an empty list and every caller
 * below does nothing, which is the shape both packs had before there were two.
 */
export function dictionariesOf(profile) {
  return (profile.dictionaries ?? []).map((d) => ({ ...d }));
}

/** One declared dictionary by id, or a thrown list of the ones there are. */
export function dictionaryNamed(profile, id) {
  const books = dictionariesOf(profile);
  if (!id) return books[0];
  const hit = books.find((d) => d.id === id);
  if (!hit) {
    throw new Error(
      `no dictionary "${id}" in this pack; it declares ` +
        (books.length ? books.map((d) => d.id).join(", ") : "none"),
    );
  }
  return hit;
}

export function loadGrammar(dir, grammar) {
  return JSON.parse(
    readFileSync(join(dir, "content", grammar?.content ?? "grammar.json"), "utf8"),
  );
}

/**
 * The syllabus: the topics of a book that carry questions rather than only
 * prose.
 *
 * A pack ships every section of its source, prosody and word formation
 * included, because what a student cannot reach they can never read. Those
 * pages are declared `readingOnly` by the parser and are not part of what the
 * questions are measured against — asking a coverage gate to find six tests for
 * a page on the dactylic hexameter measures the gate, not the pack.
 *
 * Written once and imported everywhere rather than inlined, so that "is this a
 * topic a question can be written for" cannot come to mean two things.
 */
export function teachable(topics) {
  return topics.filter((t) => !t.readingOnly);
}

/** The section-accounting manifest, or null if the parser never wrote one. */
export function loadGrammarCoverage(dir, grammar) {
  const path = join(dir, "content", grammar?.manifest ?? "grammar-coverage.json");
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

/**
 * The pack's dictionary, in the split shape it ships: the distinct entries plus
 * the sorted form index over them. See `scripts/lib/lemma-map.mjs` for why it is
 * split, and `@lang-tutor/core`'s `LemmaIndex` for the reader a device uses.
 *
 * Packs built before the split shipped one denormalized `lemmas.json.gz`, and
 * this still reads those — `build-lemmas.mjs --merge` has to be able to open the
 * map a pack already shipped in order to keep the keys a rebuild would drop, and
 * that map is the old shape right up until the rebuild replaces it.
 *
 * `lookup` and `has` bisect rather than building a map, so asking about a
 * handful of forms costs a handful of probes. `forms()` streams the keys for the
 * few callers that want all of them.
 */
export function loadLemmaIndex(dir) {
  const entriesPath = join(dir, "content", "lemmas.json.gz");
  const formsPath = join(dir, "content", "forms.txt.gz");
  const parsed = JSON.parse(gunzipSync(readFileSync(entriesPath)).toString("utf8"));

  if (!Array.isArray(parsed)) {
    // The old shape. Adapt it rather than rejecting it, so a pack that has not
    // been rebuilt yet still answers every question this one does.
    const map = parsed;
    return {
      shape: "map",
      entries: null,
      index: null,
      lookup: (key) => map[key] ?? [],
      has: (key) => key in map,
      forms: () => Object.keys(map),
      size: () => Object.keys(map).length,
      toMap: () => map,
    };
  }

  if (!existsSync(formsPath)) {
    throw new Error(
      `${entriesPath} is a lemma table but ${formsPath} is missing — ` +
        `the two are written together by scripts/build-lemmas.mjs. Rebuild the pack.`,
    );
  }
  const index = gunzipSync(readFileSync(formsPath)).toString("utf8");
  const ids = (key) => {
    const line = bisect(index, key);
    return line === null
      ? []
      : line
          .split(",")
          .filter(Boolean)
          .map((n) => parsed[Number(n)])
          .filter(Boolean);
  };
  return {
    shape: "split",
    entries: parsed,
    index,
    lookup: ids,
    has: (key) => bisect(index, key) !== null,
    forms: function* () {
      let at = 0;
      while (at < index.length) {
        const eol = index.indexOf("\n", at);
        const end = eol === -1 ? index.length : eol;
        const tab = index.indexOf("\t", at);
        yield index.slice(at, tab === -1 || tab > end ? end : tab);
        at = end + 1;
      }
    },
    size: () => parsed.length,
    toMap: () => joinLemmaIndex({ entries: parsed, lines: index.split("\n") }),
  };
}

/**
 * Just the entry table — the distinct lemmas, without the form index.
 *
 * What a pack's `citations.mjs` wants: it rewrites one citation per lemma and
 * has no interest in which forms point at it. That used to mean collapsing a
 * map of 300k repeated records; now it is the file as written.
 */
export function loadLemmaTable(dir) {
  const path = join(dir, "content", "lemmas.json.gz");
  const parsed = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(
      `${path} is the old denormalized map, not a lemma table.\n` +
        `Rebuild the pack with scripts/build-lemmas.mjs first.`,
    );
  }
  return parsed;
}

/**
 * The whole dictionary as `Record<form, LemmaEntry[]>`.
 *
 * The expensive direction, and increasingly so — this is the object the split
 * shape exists to avoid building. Prefer `loadLemmaIndex`; reach for this only
 * when every form really is the question.
 */
export function loadLemmas(dir) {
  return loadLemmaIndex(dir).toMap();
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** A gate result the reports collect and `validate-pack` exits on. */
export function gate(id, ok, detail) {
  return { id, ok, detail };
}

/**
 * Print a report, or emit it as JSON.
 *
 * `measured` is what the report counted on its way to a verdict, and it exists
 * for `baseline.mjs`. A gate's `detail` already carries most of these numbers,
 * but only as English — "4 duplicate prompts of 9006 (0.04%, allowed 1%)" — and
 * a `BASELINE.json` built by regexing those sentences would break the first time
 * somebody improved the wording of a gate. So a report says what it measured
 * separately from how it phrased it.
 *
 * Absent for a report that has not been given one yet, which is why the key is
 * omitted rather than written empty: `baseline.mjs` has to be able to tell "this
 * report measures nothing" from "this run measured nothing".
 */
export function report(title, gates, { json = false, measured } = {}) {
  if (json) {
    console.log(JSON.stringify({ title, gates, ...(measured ? { measured } : {}) }, null, 2));
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
