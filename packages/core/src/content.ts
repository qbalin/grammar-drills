import { lookupForm } from "./lemmatizer.js";
import type {
  ContentData,
  GrammarSection,
  LemmaEntry,
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

  /** Section ids that actually have tests, in book order — the teachable topics. */
  topicIds(): string[] {
    return this.sections()
      .filter((s) => this.testsFor(s.id).length > 0)
      .map((s) => s.id);
  }

  lookup(form: string): LemmaEntry[] {
    return lookupForm(this.data.lemmas, form);
  }
}
