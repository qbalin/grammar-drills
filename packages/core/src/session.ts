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
  CITATIONS_VERSION,
  emptyProgress,
  type Attempt,
  type LemmaEntry,
  type PlacementRun,
  type Progress,
  type SerializedCard,
  type Test,
  type VocabCardState,
} from "./types.js";

const SEEN_HISTORY = 10; // remember this many recently-served tests per section

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

/** One thing the scheduler will ask for, and when. */
export interface ScheduleEntry {
  kind: "topic" | "vocab";
  /** Section id, or vocabulary card id. */
  id: string;
  /** The section's title, or the word's citation. */
  title: string;
  /** The section's `ref`, or the word's gloss. */
  sub?: string;
  due: Date;
  /** Already waiting rather than still to come. */
  overdue: boolean;
}

/** One question of a section's bank, with what has been written on it. */
export interface BankedQuestion {
  testId: string;
  prompt: string;
  answer: string;
  note?: string;
  /** Earlier answers to this very question, newest first. */
  attempts: Attempt[];
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
    // migration layer, so default it here. Same for the answer trail, the
    // stored placement run, and the citation generation — a file written before
    // any of them simply has none.
    this.p.topicMastery ??= {};
    this.p.attempts ??= {};
    this.p.placement ??= null;
    this.p.citationsVersion ??= 1;
  }

  // --- placement -----------------------------------------------------------

  /**
   * True on a fresh deck, and true again for a placement left half-finished.
   *
   * The second clause is what makes the test survive a restart: passing a probe
   * fills `knownSections`, so the fresh-deck test alone would report "no
   * placement needed" the moment one was passed, and everything after it would
   * be skipped. The stored run outranks that.
   */
  needsPlacement(): boolean {
    if (this.p.placementDone) return false;
    if (this.p.placement) return true;
    return (
      Object.keys(this.p.topicCards).length === 0 &&
      this.p.knownSections.length === 0
    );
  }

  /** The placement run under way, or undefined if none was started. */
  placementState(): PlacementRun | undefined {
    return this.p.placement ?? undefined;
  }

  /**
   * Start (or restart) a placement run and write it down. Returns the run, so
   * a caller can begin without reading it back.
   */
  beginPlacement(count = 7): PlacementRun {
    const run = { topics: this.placementTopics(count), index: 0 };
    this.p.placement = run;
    this.touch();
    return run;
  }

  /** Remember which probe the student is on, so a restart resumes there. */
  advancePlacement(index: number): void {
    if (!this.p.placement) return;
    this.p.placement = { ...this.p.placement, index };
    this.touch();
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
    this.p.placement = null;
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
   * Keep an answered question on its topic. Nothing is dropped: a question can
   * be away for a year, and the whole point of the trail is to still be there
   * when it comes back.
   */
  recordAttempt(
    sectionId: string,
    attempt: Omit<Attempt, "at">,
    now: Date = new Date(),
  ): void {
    const kept = this.p.attempts[sectionId] ?? [];
    this.p.attempts[sectionId] = [...kept, { ...attempt, at: now.toISOString() }];
    this.touch();
  }

  /** What was written on a topic before now, most recent first. */
  attemptsFor(sectionId: string): Attempt[] {
    return [...(this.p.attempts[sectionId] ?? [])].reverse();
  }

  /**
   * The same, narrowed to one question. The prompt is a question's identity —
   * it is what the student saw, and it is what the attempt recorded.
   */
  attemptsForQuestion(sectionId: string, prompt: string): Attempt[] {
    return this.attemptsFor(sectionId).filter((a) => a.prompt === prompt);
  }

  /**
   * Every question written for a section, with its reference answer and its own
   * answer trail — the section's whole bank, not just what the scheduler has
   * happened to serve.
   */
  questionBank(sectionId: string): BankedQuestion[] {
    const byPrompt = new Map<string, Attempt[]>();
    for (const a of this.attemptsFor(sectionId)) {
      const kept = byPrompt.get(a.prompt);
      if (kept) kept.push(a);
      else byPrompt.set(a.prompt, [a]);
    }
    return this.content.questionsFor(sectionId).map(({ testId, question }) => ({
      testId,
      prompt: question.prompt,
      answer: question.answer,
      note: question.note,
      attempts: byPrompt.get(question.prompt) ?? [],
    }));
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

  /** Every word recorded, in dictionary order. */
  vocabList(): VocabCardState[] {
    return Object.values(this.p.vocabCards).sort((a, b) =>
      normalize(a.citation).localeCompare(normalize(b.citation)),
    );
  }

  /**
   * Correct a card's two sides. The id and the scheduling are left alone, so
   * fixing a citation months in never costs the card its history — which is the
   * only reason editing is safe to offer at any time.
   */
  updateVocab(
    cardId: string,
    patch: Partial<Pick<VocabCardState, "citation" | "gloss">>,
  ): void {
    const card = this.p.vocabCards[cardId];
    if (!card) return;
    if (patch.citation !== undefined) card.citation = patch.citation.trim();
    if (patch.gloss !== undefined) card.gloss = patch.gloss.trim();
    this.touch();
  }

  /** Forget a word — the way back from a card saved by a stray press. */
  deleteVocab(cardId: string): void {
    if (!this.p.vocabCards[cardId]) return;
    delete this.p.vocabCards[cardId];
    this.touch();
  }

  /**
   * Bring saved cards up to the shipped dictionary's current citations.
   *
   * A card keeps its own copy of the citation, so rebuilding the dictionary —
   * giving verbs their four principal parts, say — would otherwise reach only
   * words recorded afterwards. Runs once per generation, and never touches a
   * citation the student has edited into something the dictionary does not say
   * beyond replacing it with the dictionary's own newer form.
   *
   * Returns how many cards changed. A no-op when the dictionary is not loaded:
   * every lookup misses, so nothing is overwritten with nothing.
   */
  refreshCitations(): number {
    if ((this.p.citationsVersion ?? 1) >= CITATIONS_VERSION) return 0;
    let changed = 0;
    let looked = false;
    for (const card of Object.values(this.p.vocabCards)) {
      const candidates = this.content.lookup(card.lemma);
      if (candidates.length > 0) looked = true;
      const match = candidates.find(
        (c) => c.lemma === card.lemma && c.pos === card.pos,
      );
      if (match && match.citation !== card.citation) {
        card.citation = match.citation;
        changed += 1;
      }
    }
    // Only claim the generation once a dictionary was actually consulted;
    // otherwise an offline launch would mark the cards done without reading one.
    if (looked || Object.keys(this.p.vocabCards).length === 0) {
      this.p.citationsVersion = CITATIONS_VERSION;
    }
    if (changed > 0 || looked) this.touch();
    return changed;
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

  /**
   * Everything scheduled, soonest first — what is waiting now and what comes
   * back when. `nextDue` answers the same question with one date; this is the
   * whole list, for a screen that shows the week rather than the next minute.
   */
  upcoming(now: Date = new Date(), limit?: number): ScheduleEntry[] {
    const out: ScheduleEntry[] = [];
    for (const [id, card] of Object.entries(this.p.topicCards)) {
      const section = this.content.getSection(id);
      // A card for a section this bundle no longer carries is unshowable, and
      // the rest of the engine already skips those.
      if (!section) continue;
      const due = new Date(card.due);
      out.push({
        kind: "topic",
        id,
        title: section.title,
        sub: `§ ${section.ref}`,
        due,
        overdue: due.getTime() <= now.getTime(),
      });
    }
    for (const card of Object.values(this.p.vocabCards)) {
      const due = new Date(card.fsrs.due);
      out.push({
        kind: "vocab",
        id: card.id,
        title: card.citation,
        sub: card.gloss,
        due,
        overdue: due.getTime() <= now.getTime(),
      });
    }
    out.sort((a, b) => a.due.getTime() - b.due.getTime());
    return limit === undefined ? out : out.slice(0, limit);
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
