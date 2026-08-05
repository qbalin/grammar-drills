import { lookupForm } from "./lemmatizer.js";
import { compileFold, type Fold } from "./fold.js";
import { familyLabel, familyOf, type FamilyId } from "./families.js";
import type { Family, Profile } from "./pack.js";
import type {
  ContentData,
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
  /** The compiled fold: what counts as the same word in this language. */
  readonly fold: Fold;

  constructor(
    private readonly data: ContentData,
    readonly profile: Profile,
  ) {
    this.byId = new Map(data.grammar.map((s) => [s.id, s]));
    this.fold = compileFold(profile.fold);
  }

  /** The families, in the order the grammar index is drawn. */
  get families(): readonly Family[] {
    return this.profile.families;
  }

  familyOf(family: string | undefined): FamilyId {
    return familyOf(this.profile, family);
  }

  familyLabel(id: FamilyId): string {
    return familyLabel(this.profile, id);
  }

  /** A section reference as the book writes it, e.g. "§ 20-22". */
  formatRef(ref: string): string {
    return `${this.profile.grammar.refPrefix}${ref}`;
  }

  /** Whether a question's prompt is L1 and its answer L2 — the drillable direction. */
  isProduceKind(kind: string): boolean {
    return this.profile.questions.produceKinds.includes(kind);
  }

  /** All grammar sections in book order. */
  sections(): GrammarSection[] {
    return [...this.data.grammar].sort((a, b) => a.order - b.order);
  }

  getSection(id: string): GrammarSection | undefined {
    return this.byId.get(id);
  }

  testsFor(sectionId: string): Test[] {
    return this.data.tests[sectionId] ?? [];
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
  topicIds(): string[] {
    return this.sections()
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
