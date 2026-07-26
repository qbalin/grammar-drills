import { Content } from "./content.js";
import { FAMILIES, familyOf, type FamilyId } from "./families.js";
import { normalize } from "./normalize.js";
import {
  deserializeCard,
  isDue,
  newCard,
  preview,
  rate,
  serializeCard,
  type Rating,
} from "./scheduler.js";
import {
  emptyProgress,
  type Attempt,
  type LemmaEntry,
  type Progress,
  type SerializedCard,
  type Test,
  type VocabCardState,
} from "./types.js";

const SEEN_HISTORY = 10; // remember this many recently-served tests per section

/**
 * Answered questions kept per topic. Capped, not unbounded: the whole progress
 * file is rewritten (and, on GitHub storage, committed) on every save.
 */
const ATTEMPT_HISTORY = 10;

/** Mastery runs 1 (not mastered) to 4 (mastered); the bars show the span between. */
const MASTERY_MIN = 1;
const MASTERY_MAX = 4;

export type Action =
  | { kind: "topic-review"; sectionId: string }
  | { kind: "new-topic"; sectionId: string }
  | { kind: "vocab-review"; cardId: string }
  | { kind: "done" };

/** One grammar section as the progress bars and topic explorer see it. */
export interface TopicProgress {
  sectionId: string;
  title: string;
  ref: string;
  order: number;
  family: FamilyId;
  /** Cumulative score in [1, 4], or undefined if never graded. */
  mastery?: number;
  /** Mastery taken from a passed placement rather than earned by grading. */
  assumed: boolean;
  hasTests: boolean;
  due: boolean;
}

export interface FamilyProgress {
  id: FamilyId;
  label: string;
  topics: TopicProgress[];
  /** Mean mastery across the family's topics, 0–1. Unseen topics count as 0. */
  percent: number;
}

/** Mastery as a 0–1 fraction; an ungraded topic is 0. */
function fraction(mastery: number | undefined): number {
  return ((mastery ?? MASTERY_MIN) - MASTERY_MIN) / (MASTERY_MAX - MASTERY_MIN);
}

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
    // Progress files written before mastery tracking have no map; there is no
    // migration layer, so default it here. Same for the answer trail.
    this.p.topicMastery ??= {};
    this.p.attempts ??= {};
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
    // Mastery moves gradually, so one good answer can't mark a topic mastered
    // and one bad day can't wipe it: good/easy +1, hard +0.5, again -1.
    const delta = rating >= 3 ? 1 : rating === 2 ? 0.5 : -1;
    const base = this.p.topicMastery[sectionId] ?? MASTERY_MIN;
    this.p.topicMastery[sectionId] = Math.min(
      MASTERY_MAX,
      Math.max(MASTERY_MIN, base + delta),
    );
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
   * Keep an answered question on its topic. Only the last `ATTEMPT_HISTORY` per
   * topic survive, oldest dropped first.
   */
  recordAttempt(
    sectionId: string,
    attempt: Omit<Attempt, "at">,
    now: Date = new Date(),
  ): void {
    const kept = this.p.attempts[sectionId] ?? [];
    this.p.attempts[sectionId] = [
      ...kept,
      { ...attempt, at: now.toISOString() },
    ].slice(-ATTEMPT_HISTORY);
    this.touch();
  }

  /** What was written on a topic before now, most recent first. */
  attemptsFor(sectionId: string): Attempt[] {
    return [...(this.p.attempts[sectionId] ?? [])].reverse();
  }

  /**
   * When each grade would bring a topic back. Self-grading is a judgement made
   * in the dark unless the four choices show what they cost; an untouched topic
   * previews against a fresh card, which is what grading it would create.
   */
  previewTopic(sectionId: string, now: Date = new Date()): Record<Rating, Date> {
    const stored = this.p.topicCards[sectionId];
    return preview(stored ? deserializeCard(stored) : newCard(now), now);
  }

  /** The same, for a vocabulary card; undefined if there is no such card. */
  previewVocab(
    cardId: string,
    now: Date = new Date(),
  ): Record<Rating, Date> | undefined {
    const stored = this.p.vocabCards[cardId];
    return stored ? preview(deserializeCard(stored.fsrs), now) : undefined;
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

  /**
   * The earliest moment anything comes back, or undefined if nothing is
   * scheduled. A rest screen that says when to return is a better ending than
   * one that just says there is nothing to do.
   */
  nextDue(now: Date = new Date()): Date | undefined {
    let soonest: number | undefined;
    const consider = (card: SerializedCard) => {
      const at = new Date(card.due).getTime();
      if (at > now.getTime() && (soonest === undefined || at < soonest)) {
        soonest = at;
      }
    };
    for (const [id, card] of Object.entries(this.p.topicCards)) {
      if (this.content.getSection(id)) consider(card);
    }
    for (const state of Object.values(this.p.vocabCards)) consider(state.fsrs);
    return soonest === undefined ? undefined : new Date(soonest);
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

  /**
   * Every grammar section in book order with its mastery — the model behind the
   * progress bars and the topic explorer. Sections passed in placement report a
   * full but `assumed` mastery, since they were taken as known rather than graded.
   */
  grammarMap(now: Date = new Date()): TopicProgress[] {
    const known = new Set(this.p.knownSections);
    return this.content.sections().map((s) => {
      const scored = this.p.topicMastery[s.id];
      const assumed = scored === undefined && known.has(s.id);
      const card = this.p.topicCards[s.id];
      return {
        sectionId: s.id,
        title: s.title,
        ref: s.ref,
        order: s.order,
        family: familyOf(s.family),
        mastery: assumed ? MASTERY_MAX : scored,
        assumed,
        hasTests: this.content.testsFor(s.id).length > 0,
        due: card ? isDue(deserializeCard(card), now) : false,
      };
    });
  }

  /** `grammarMap()` bucketed into families, in display order. */
  familyProgress(now: Date = new Date()): FamilyProgress[] {
    const map = this.grammarMap(now);
    return FAMILIES.map(({ id, label }) => {
      const topics = map.filter((t) => t.family === id);
      const percent =
        topics.length === 0
          ? 0
          : topics.reduce((sum, t) => sum + fraction(t.mastery), 0) /
            topics.length;
      return { id, label, topics, percent };
    });
  }

  /** Mean mastery across the whole syllabus, 0–1. */
  overallPercent(now: Date = new Date()): number {
    const map = this.grammarMap(now);
    if (map.length === 0) return 0;
    return (
      map.reduce((sum, t) => sum + fraction(t.mastery), 0) / map.length
    );
  }

  progress(): Progress {
    return this.p;
  }

  /**
   * A detached copy of everything the session mutates — the material for an
   * undo. Progress is plain JSON and the engine keeps no state outside it, so
   * a deep clone is the whole story: grading, placement and vocabulary all
   * take back together.
   */
  snapshot(): Progress {
    return structuredClone(this.p);
  }

  /**
   * Put a snapshot back, discarding everything done since it was taken. The
   * copy is cloned in, so the same snapshot can be restored more than once and
   * the caller's copy stays clean.
   */
  restore(snapshot: Progress): void {
    this.p = structuredClone(snapshot);
    // An undo is itself a change: the stored copy is now out of date, and the
    // sync comparison reads `updatedAt` to decide that.
    this.touch();
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
