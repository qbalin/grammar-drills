import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { ArticleIndex } from "./lemma-index.js";
import { decodeRuns } from "./grammar-blocks.js";
import { compileFold } from "./fold.js";
import { testProfile } from "./profile.fixture.js";
import type { ContentData, DictionaryArticle, LemmaEntry, Profile } from "./types.js";

/**
 * A further dictionary, beside the one the pack builds.
 *
 * The design is one sentence: a lexicon is indexed by headword, a student is
 * looking at a word in a sentence, and the pack's own dictionary is what gets
 * from one to the other. These take that apart — because every part of it is a
 * place where a wrong answer looks exactly like "this book has no entry", which
 * is a thing the book is entitled to say.
 */

const profile: Profile = {
  ...testProfile,
  dictionaries: [
    {
      id: "lexicon",
      label: "A Lexicon",
      content: "dictionaries/lexicon.json.gz",
      index: "dictionaries/lexicon-forms.txt.gz",
      manifest: "dictionaries/lexicon-coverage.json",
      source: { title: "A Lexicon", url: "https://example.invalid/", licence: "n/a" },
      shape: { minEntries: 1, maxEntries: 10 },
      reach: { band: 10, headwordsMatchedPct: 50 },
    },
  ],
};

const fold = compileFold(profile.fold);

const articles: DictionaryArticle[] = [
  { headword: "amō", homograph: 1, head: "to love", senses: [{ n: "I", level: 1, text: "to love" }] },
  { headword: "amō", homograph: 2, head: "a hook", senses: [] },
  { headword: "et", head: "and", senses: [] },
];

/** `amo` names both homographs; `et` names one. Sorted, as the writer sorts it. */
const index = ["amo\t0,1", "et\t2"].join("\n");

const lemma = (l: string, pos: string): LemmaEntry => ({
  lemma: l, citation: l, gloss: "", pos,
});

/** The pack's own dictionary: the inflected `amavi` resolves to the lemma `amō`. */
const lemmas = { amaui: [lemma("amō", "verb")], et: [lemma("et", "conj")] };

function content(withBook = true): Content {
  const data: ContentData = { grammar: [], tests: {}, lemmas };
  const c = new Content(data, profile);
  if (withBook) c.addArticles("lexicon", new ArticleIndex(articles, index, fold));
  return c;
}

describe("a further dictionary", () => {
  it("reaches an article through the lemma the pack resolved", () => {
    // The point of the whole design: `amavi` is nowhere in the lexicon's index,
    // which knows only headwords. The pack's dictionary supplies `amō`.
    expect(content().articlesFor("amavi", "lexicon").map((a) => a.head)).toEqual([
      "to love",
      "a hook",
    ]);
  });

  it("keeps every homograph, in the order the book numbered them", () => {
    const found = content().articlesFor("amavi", "lexicon");
    expect(found.map((a) => a.homograph)).toEqual([1, 2]);
  });

  it("falls back to the form itself, for a word the pack cannot resolve", () => {
    // An indeclinable the lemma index happens to miss still has an article, and
    // refusing to try the form would hide it for no reason.
    const bare = new Content({ grammar: [], tests: {}, lemmas: {} }, profile);
    bare.addArticles("lexicon", new ArticleIndex(articles, index, fold));
    expect(bare.articlesFor("et", "lexicon").map((a) => a.head)).toEqual(["and"]);
  });

  it("names an article once, however many ways it was reached", () => {
    // `et` resolves to the lemma `et` *and* matches the form fallback. Listed
    // twice, the sheet would print the same entry above itself.
    expect(content().articlesFor("et", "lexicon")).toHaveLength(1);
  });

  it("is empty rather than absent before it has been fetched", () => {
    // The sheet is complete without it — citation, gloss and paradigm are all
    // there — so a dictionary still downloading must not read as a failure.
    expect(content(false).articlesFor("amavi", "lexicon")).toEqual([]);
    expect(content(false).hasArticles("lexicon")).toBe(false);
    expect(content(false).dictionaryIds()).toEqual(["lexicon"]);
  });

  it("is empty for a dictionary the pack does not declare", () => {
    expect(content().articlesFor("amavi", "no-such-book")).toEqual([]);
  });

  it("ignores a second load of a book already held", () => {
    // Matching `addGrammar`: the prefetch and a retry can both arrive, and the
    // later one must not replace an index the sheet is already reading from.
    const c = content();
    c.addArticles("lexicon", new ArticleIndex([], "", fold));
    expect(c.articlesFor("amavi", "lexicon")).toHaveLength(2);
  });
});

describe("article markup", () => {
  /*
   * Articles carry the emphasis encoding grammar prose carries, and are decoded
   * by the same function — but they are never classified by `parseBlocks`,
   * whose markers are the pack grammar's. That is the one thing about this
   * shape somebody would undo, so it is asserted rather than only written down.
   */
  it("decodes the emphasis runs a book set", () => {
    expect(decodeRuns("plain ⟦i:italic⟧ and ⟦b:bold⟧")).toEqual([
      { text: "plain " },
      { text: "italic", i: true },
      { text: " and " },
      { text: "bold", b: true },
    ]);
  });

  it("hands back one plain run when a line carries no emphasis", () => {
    expect(decodeRuns("nothing marked")).toEqual([{ text: "nothing marked" }]);
  });

  it("cannot be made to emit markup by a source that writes brackets", () => {
    // A doubled delimiter is a literal one. This is the property that lets an
    // article be rendered without escaping anything at the other end.
    expect(decodeRuns("⟦⟦i:not italic⟧⟧")).toEqual([{ text: "⟦i:not italic⟧" }]);
  });
});
