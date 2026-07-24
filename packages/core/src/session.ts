import { Content } from "./content.js";
import { normalize } from "./normalize.js";
import {
  deserializeCard,
  isDue,
  newCard,
  rate,
  serializeCard,
  type Rating,
} from "./scheduler.js";
import {
  emptyProgress,
  type LemmaEntry,
  type Progress,
  type Test,
  type VocabCardState,
} from "./types.js";

const SEEN_HISTORY = 10; // remember this many recently-served tests per section

export type Action =
  | { kind: "topic-review"; sectionId: string }
  | { kind: "new-topic"; sectionId: string }
  | { kind: "vocab-review"; cardId: string }
  | { kind: "done" };

/**
 * The runtime session engine. Holds the student's Progress and, given the
 * frozen Content, decides what to do next and applies self-grades — all
 * deterministic, no LLM. Ported from the reference `session.py` state machine
 * with the LLM's exercise/grading jobs removed.
 */
export class Session {
  private p: Progress;

  constructor(
    private readonly content: Content,
    progress?: Progress,
  ) {
    this.p = progress ?? emptyProgress();
  }

  // --- placement -----------------------------------------------------------

  /** True on a fresh deck: run the placement test before normal study. */
  needsPlacement(): boolean {
    return (
      !this.p.placementDone &&
      Object.keys(this.p.topicCards).length === 0 &&
      this.p.knownSections.length === 0
    );
  }

  /** Evenly-spaced teachable topics for the placement quiz, easiest first. */
  placementTopics(count = 7): string[] {
    const ids = this.content.topicIds();
    if (ids.length <= count) return ids;
    const step = (ids.length - 1) / (count - 1);
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(ids[Math.round(i * step)]!);
    return [...new Set(out)];
  }

  /**
   * Record that the student passed a placement topic: everything up to and
   * including it is taken as already known, and the frontier advances there.
   */
  passPlacement(sectionId: string): void {
    const sec = this.content.getSection(sectionId);
    if (!sec) return;
    const known = new Set(this.p.knownSections);
    for (const s of this.content.sections()) {
      if (this.content.testsFor(s.id).length > 0 && s.order <= sec.order) {
        known.add(s.id);
      }
    }
    this.p.knownSections = [...known];
    this.p.frontier = sectionId;
    this.touch();
  }

  /** Finish placement; normal study then begins just past the frontier. */
  endPlacement(): void {
    this.p.placementDone = true;
    this.touch();
  }

  /** Decide the next step. Pure query — presenting is the caller's job. */
  next(now: Date = new Date()): Action {
    const dueTopic = this.earliestDueTopic(now);
    if (dueTopic) return { kind: "topic-review", sectionId: dueTopic };

    const dueVocab = this.earliestDueVocab(now);
    if (dueVocab) return { kind: "vocab-review", cardId: dueVocab };

    const fresh = this.nextNewTopic();
    if (fresh) return { kind: "new-topic", sectionId: fresh };

    return { kind: "done" };
  }

  /**
   * Choose a test for a section, preferring ones not served recently so the
   * same topic feels fresh across sessions. Records it as seen.
   */
  serveTest(sectionId: string): Test | undefined {
    const tests = this.content.testsFor(sectionId);
    if (tests.length === 0) return undefined;
    let seen = this.p.seenTests[sectionId] ?? [];
    let pool = tests.filter((t) => !seen.includes(t.id));
    if (pool.length === 0) {
      seen = [];
      pool = tests;
    }
    const test = pool[Math.floor(Math.random() * pool.length)]!;
    this.p.seenTests[sectionId] = [...seen, test.id].slice(-SEEN_HISTORY);
    this.touch();
    return test;
  }

  /** Apply a self-grade to a grammar topic, creating its card on first sight. */
  gradeTopic(sectionId: string, rating: Rating, now: Date = new Date()): void {
    const existing = this.p.topicCards[sectionId];
    const wasKnown = this.p.knownSections.includes(sectionId);
    let card = existing ? deserializeCard(existing) : newCard(now);
    card = rate(card, rating, now);
    this.p.topicCards[sectionId] = serializeCard(card);
    if (!existing) {
      if (wasKnown) {
        this.p.knownSections = this.p.knownSections.filter(
          (s) => s !== sectionId,
        );
      } else {
        this.p.newTopicsIntroduced += 1;
        this.p.frontier = sectionId;
      }
    }
    this.touch();
  }

  /**
   * Record an unknown word from its inflected form. The canonical citation is
   * supplied by the caller after resolving it via `content.lookup`. Deduped by
   * lemma so re-recording the same word is a no-op. Returns the card id.
   */
  recordVocab(entry: LemmaEntry, now: Date = new Date()): string {
    const id = `v-${normalize(entry.lemma)}`;
    if (!this.p.vocabCards[id]) {
      this.p.vocabCards[id] = {
        ...entry,
        id,
        created: now.toISOString(),
        fsrs: serializeCard(newCard(now)),
      };
      this.touch();
    }
    return id;
  }

  gradeVocab(cardId: string, rating: Rating, now: Date = new Date()): void {
    const state = this.p.vocabCards[cardId];
    if (!state) return;
    const card = rate(deserializeCard(state.fsrs), rating, now);
    state.fsrs = serializeCard(card);
    this.touch();
  }

  vocabCard(cardId: string): VocabCardState | undefined {
    return this.p.vocabCards[cardId];
  }

  /** Counts for a status line. */
  stats(now: Date = new Date()): {
    dueTopics: number;
    dueVocab: number;
    topics: number;
    vocab: number;
  } {
    return {
      dueTopics: this.dueTopicIds(now).length,
      dueVocab: this.dueVocabIds(now).length,
      topics: Object.keys(this.p.topicCards).length,
      vocab: Object.keys(this.p.vocabCards).length,
    };
  }

  progress(): Progress {
    return this.p;
  }

  // --- internals -----------------------------------------------------------

  private touch(): void {
    this.p.updatedAt = new Date().toISOString();
  }

  private dueTopicIds(now: Date): string[] {
    return Object.entries(this.p.topicCards)
      .filter(
        ([id, s]) =>
          this.content.getSection(id) && isDue(deserializeCard(s), now),
      )
      .map(([id]) => id);
  }

  private earliestDueTopic(now: Date): string | null {
    let best: string | null = null;
    let bestDue = Infinity;
    for (const [id, s] of Object.entries(this.p.topicCards)) {
      if (!this.content.getSection(id)) continue;
      const card = deserializeCard(s);
      if (isDue(card, now) && card.due.getTime() < bestDue) {
        bestDue = card.due.getTime();
        best = id;
      }
    }
    return best;
  }

  private dueVocabIds(now: Date): string[] {
    return Object.values(this.p.vocabCards)
      .filter((s) => isDue(deserializeCard(s.fsrs), now))
      .map((s) => s.id);
  }

  private earliestDueVocab(now: Date): string | null {
    let best: string | null = null;
    let bestDue = Infinity;
    for (const s of Object.values(this.p.vocabCards)) {
      const card = deserializeCard(s.fsrs);
      if (isDue(card, now) && card.due.getTime() < bestDue) {
        bestDue = card.due.getTime();
        best = s.id;
      }
    }
    return best;
  }

  /** First teachable topic in book order not yet carded or known. */
  private nextNewTopic(): string | null {
    for (const id of this.content.topicIds()) {
      if (!this.p.topicCards[id] && !this.p.knownSections.includes(id)) {
        return id;
      }
    }
    return null;
  }
}
