import { lookupForm } from "./lemmatizer.js";
import { compileFold, type Fold } from "./fold.js";
import { familyLabel, familyOf, type FamilyId } from "./families.js";
import type { Family, Profile } from "./pack.js";
import type {
  ContentData,
  Crosswalk,
  GrammarSection,
  LemmaEntry,
  Question,
  Test,
} from "./types.js";

/**
 * Read-only view over the frozen content bundle, and the way the language
 * itself reaches the engine.
 *
 * The CLI and web app each load the JSON their own way (fs vs fetch) and hand
 * the parsed data here along with the pack's profile. Everything downstream —
 * the session, both apps — asks `Content` rather than importing a language
 * fact from anywhere, which is what keeps `packages/core` free of them.
 */
export class Content {
  private readonly byId: Map<string, GrammarSection>;
  /** Every section of every book, by grammar id. The primary is first. */
  private readonly books: Map<string, GrammarSection[]>;
  /** Which book each section belongs to. */
  private readonly bookOf = new Map<string, string>();
  /** The compiled fold: what counts as the same word in this language. */
  readonly fold: Fold;

  constructor(
    private readonly data: ContentData,
    readonly profile: Profile,
  ) {
    this.books = new Map([[profile.grammar.idPrefix, data.grammar]]);
    for (const [id, sections] of Object.entries(data.grammars ?? {})) {
      this.books.set(id, sections);
    }
    /*
     * One index over every book, because a section id carries the book it
     * belongs to: `profile` forbids two grammars from sharing an id prefix, so
     * `bn-020-…` and `ln-0432-…` cannot collide. That is what lets almost
     * everything below take a section id and no grammar alongside it.
     */
    this.byId = new Map();
    for (const [id, sections] of this.books) {
      for (const s of sections) {
        this.byId.set(s.id, s);
        this.bookOf.set(s.id, id);
      }
    }
    this.fold = compileFold(profile.fold);
  }

  /** The books this pack ships, primary first. */
  grammarIds(): string[] {
    return [...this.books.keys()];
  }

  /**
   * Take on a further grammar that arrived after the bundle did.
   *
   * The same bargain the late-bound dictionary makes, and for the same reason:
   * `Content` is built once and handed to `Session`, so a book a student may
   * never open cannot be a condition of starting. The primary's grammar is 129
   * KB and Lane's is 416 KB, and precaching a syllabus nobody has switched to
   * would be most of the download spent on a page that never draws.
   *
   * Adding rather than replacing, so nothing already handed out goes stale.
   * Silently ignores a book that is already here — the caller is a UI switch,
   * and switching back is not an error.
   */
  addGrammar(id: string, sections: GrammarSection[], crosswalk: Crosswalk): void {
    if (this.books.has(id)) return;
    this.books.set(id, sections);
    for (const s of sections) {
      this.byId.set(s.id, s);
      this.bookOf.set(s.id, id);
    }
    this.data.grammars = { ...(this.data.grammars ?? {}), [id]: sections };
    this.data.crosswalk = { ...(this.data.crosswalk ?? {}), [id]: crosswalk };
  }

  /** The id of the book the questions were written against. */
  get primaryGrammar(): string {
    return this.profile.grammar.idPrefix;
  }

  /** Which book a section belongs to, or the primary if it names none. */
  grammarOf(sectionId: string): string {
    return this.bookOf.get(sectionId) ?? this.primaryGrammar;
  }

  /** The label a book is named by, e.g. "Lane". */
  grammarLabel(id: string): string {
    if (id === this.primaryGrammar) {
      return this.profile.grammar.source.title.split(",")[0];
    }
    return this.profile.grammars?.find((g) => g.id === id)?.label ?? id;
  }

  /**
   * A book's own family list and fallback, as `families.ts` wants them.
   *
   * Per book rather than per pack, because a family list is one book's table of
   * contents rather than a fact about the language: filing a second grammar
   * into the first one's nine families put 43.8% of Lane in one of them.
   */
  private familySpec(grammarId?: string) {
    const id = grammarId ?? this.primaryGrammar;
    if (id === this.primaryGrammar) return this.profile;
    const book = this.profile.grammars?.find((g) => g.id === id);
    return book ?? this.profile;
  }

  /** The families of a book, in the order its index is drawn. */
  families(grammarId?: string): readonly Family[] {
    return this.familySpec(grammarId).families;
  }

  familyOf(family: string | undefined, grammarId?: string): FamilyId {
    return familyOf(this.familySpec(grammarId), family);
  }

  familyLabel(id: FamilyId, grammarId?: string): string {
    return familyLabel(this.familySpec(grammarId), id);
  }

  /** A section reference as its own book writes it, e.g. "§ 20-22". */
  formatRef(ref: string, grammarId?: string): string {
    const id = grammarId ?? this.primaryGrammar;
    const prefix = id === this.primaryGrammar
      ? this.profile.grammar.refPrefix
      : (this.profile.grammars?.find((g) => g.id === id)?.refPrefix
        ?? this.profile.grammar.refPrefix);
    return `${prefix}${ref}`;
  }

  /** Whether a question's prompt is L1 and its answer L2 — the drillable direction. */
  isProduceKind(kind: string): boolean {
    return this.profile.questions.produceKinds.includes(kind);
  }

  /** One book's sections, in its own order. */
  sections(grammarId?: string): GrammarSection[] {
    const book = this.books.get(grammarId ?? this.primaryGrammar) ?? [];
    return [...book].sort((a, b) => a.order - b.order);
  }

  /** A section of any book: ids carry which one, so none has to be named. */
  getSection(id: string): GrammarSection | undefined {
    return this.byId.get(id);
  }

  /**
   * The primary topics a section teaches — itself, if it is one.
   *
   * This is the whole of how a second book is taught. The questions were
   * written against one syllabus, and a further grammar reaches them through
   * the crosswalk rather than by having any of its own. So a Lane topic on the
   * complementary dative and one on the predicative dative both resolve to
   * Bennett's single topic on the dative, and are served out of its bank.
   *
   * The consequence is worth stating rather than discovering: two topics that
   * resolve alike share their progress exactly, because there is one bank of
   * dative questions and no finer answer to give. A finer one would be invented.
   */
  primaryTopicsFor(sectionId: string): string[] {
    const book = this.grammarOf(sectionId);
    if (book === this.primaryGrammar) return [sectionId];
    return this.data.crosswalk?.[book]?.toPrimary[sectionId] ?? [];
  }

  /** The topics of a book that teach a primary topic — the way back. */
  topicsTeaching(primaryId: string, grammarId: string): string[] {
    if (grammarId === this.primaryGrammar) return [primaryId];
    return this.data.crosswalk?.[grammarId]?.fromPrimary[primaryId] ?? [];
  }

  /**
   * The bank behind a section, whichever book named it.
   *
   * A further grammar's topic is served the union of its primary topics' tests.
   * `sectionId` on each test still names the primary topic, which is what the
   * scheduler grades and what progress is filed under.
   */
  testsFor(sectionId: string): Test[] {
    const primary = this.primaryTopicsFor(sectionId);
    if (primary.length === 1) return this.data.tests[primary[0]] ?? [];
    return primary.flatMap((id) => this.data.tests[id] ?? []);
  }

  /**
   * Every question written for a section, across all its tests, in test order.
   * A section carries 6–25 tests of four, so this is the bank the scheduler
   * draws from — up to about a hundred questions.
   */
  questionsFor(sectionId: string): { testId: string; question: Question }[] {
    return this.testsFor(sectionId).flatMap((test) =>
      test.questions.map((question) => ({ testId: test.id, question })),
    );
  }

  /** Section ids that actually have tests, in book order — the teachable topics. */
  topicIds(grammarId?: string): string[] {
    return this.sections(grammarId)
      .filter((s) => this.testsFor(s.id).length > 0)
      .map((s) => s.id);
  }

  /**
   * Rank-ordered citations for an inflected form, most frequent first. Empty
   * when the form is unknown *or* when no dictionary has been supplied at all —
   * a miss is a hint to the student, never a verdict on their spelling.
   */
  lookup(form: string): LemmaEntry[] {
    if (this.data.lemmaLookup) return this.data.lemmaLookup.lookup(form);
    return this.data.lemmas ? lookupForm(this.data.lemmas, form, this.fold) : [];
  }
}
