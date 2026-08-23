#!/usr/bin/env node
/**
 * A further dictionary's articles, as the app can afford to hold them.
 *
 * The pack's parser produced one JSON object per article. This folds their
 * headwords, builds the sorted index that `ArticleIndex` bisects, and writes
 * the pair the web app fetches:
 *
 *   content/dictionaries/<id>.json.gz         DictionaryArticle[]
 *   content/dictionaries/<id>-forms.txt.gz    `key\tidx[,idx…]`, sorted
 *
 * Split from the parser for the reason `build-lemmas.mjs` is split from
 * `parse.py`: the fold is `profile.json`'s and is compiled by
 * `packages/core/src/fold.ts`. A second implementation of it in Python is
 * exactly what gate D2 exists to catch, so the Python side never folds
 * anything — it hands over the spellings and this keys them.
 *
 * Every spelling an article prints becomes a key for it. A lexicon's headword
 * and the pack's lemma disagree more often than you would expect — `fulcīmen`
 * against `fulcimen`, `sum1` against `sum` — and the entry usually prints both.
 * Taking all of them is worth 3.7 points of ranked reach over the entry key
 * alone, and it costs nothing: they are already in the article.
 *
 *   node --import tsx scripts/build-dictionary.mjs --pack languages/latin
 *   node --import tsx scripts/build-dictionary.mjs --pack languages/latin --dictionary lewis-short
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { compileFold } from "@lang-tutor/core";
import { REPO, packDir, args, loadProfile, dictionariesOf, dictionaryNamed } from "./lib/pack.mjs";

const argv = process.argv.slice(2);
const { at } = args(argv);
const dir = packDir(argv);
const profile = loadProfile(dir);

const books = at("--dictionary")
  ? [dictionaryNamed(profile, at("--dictionary"))]
  : dictionariesOf(profile);

if (!books.length) {
  console.log(`${profile.id}: declares no further dictionaries; nothing to build.`);
  process.exit(0);
}

const fold = compileFold(profile.fold);

/** A tab or a newline cannot be represented in a line-oriented index. */
const UNREPRESENTABLE = /[\t\r\n]/;

for (const book of books) {
  const src = join(dir, "content", "dictionaries", `${book.id}.jsonl`);
  if (!existsSync(src)) {
    console.error(
      `no ${relative(REPO, src)} — run the pack's parser for "${book.id}" first.`,
    );
    process.exit(1);
  }

  const rows = readFileSync(src, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

  /** Folded key -> the article ids filed under it, in the order they arrived. */
  const under = new Map();
  const articles = rows.map((row, id) => {
    // Every spelling this article prints, plus the entry key the source filed
    // it under. Deduped after folding, because `sum` and `sum1` collapse.
    for (const raw of [row.key, ...(row.orths ?? [])]) {
      const key = fold(String(raw ?? ""));
      if (!key || UNREPRESENTABLE.test(key)) continue;
      let ids = under.get(key);
      if (!ids) under.set(key, (ids = []));
      if (!ids.includes(id)) ids.push(id);
    }
    // What ships is the article, not the keying. `key` and `orths` were the
    // way in; carrying them too would repeat every headword twice on disk.
    const article = { headword: row.headword, head: row.head, senses: row.senses };
    if (row.homograph) article.homograph = row.homograph;
    return article;
  });

  const lines = [...under.entries()].map(([key, ids]) => `${key}\t${ids.join(",")}`);
  // Code unit order — `Array.sort()`'s default, and what `bisect` compares
  // with. A locale-aware collation here would silently break every lookup.
  lines.sort();

  // Prove the two invariants the reader depends on, here rather than only in
  // the gate: a build that cannot be read back should not be written.
  const keys = lines.map((l) => l.slice(0, l.indexOf("\t")));
  for (let i = 1; i < keys.length; i += 1) {
    if (!(keys[i - 1] < keys[i])) {
      throw new Error(`index out of code-unit order at ${JSON.stringify(keys[i])}`);
    }
  }
  for (const key of keys) {
    if (fold(key) !== key) {
      throw new Error(`index key ${JSON.stringify(key)} is not fold output`);
    }
  }

  const out = join(dir, "content", "dictionaries", `${book.id}.json.gz`);
  const idx = join(dir, "content", "dictionaries", `${book.id}-forms.txt.gz`);
  writeFileSync(out, gzipSync(Buffer.from(JSON.stringify(articles), "utf8"), { level: 9 }));
  writeFileSync(idx, gzipSync(Buffer.from(lines.join("\n"), "utf8"), { level: 9 }));

  const mb = (p) => (readFileSync(p).length / 1e6).toFixed(2);
  console.log(
    `${book.id}: ${articles.length} articles (${mb(out)} MB gz), ` +
      `${lines.length} keys (${mb(idx)} MB gz)`,
  );
}
