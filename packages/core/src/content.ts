import { lookupForm } from "./lemmatizer.js";
import type {
  ContentData,
  GrammarSection,
  LemmaEntry,
  Question,
  Test,
} from "./types.js";

/**
 * Read-only view over the frozen content bundle. The CLI and web app each load
 * the JSON their own way (fs vs fetch) and hand the parsed data here.
 */
export class Content {
  private readonly byId: Map<string, GrammarSection>;

  constructor(private readonly data: ContentData) {
    this.byId = new Map(data.grammar.map((s) => [s.id, s]));
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
    return this.data.lemmas ? lookupForm(this.data.lemmas, form) : [];
  }
}
