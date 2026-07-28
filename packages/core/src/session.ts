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
  type Focus,
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
  /** More of a topic the student asked to stay on. */
  | { kind: "drill"; sectionId: string }
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
  /** Questions of this topic's bank that have been answered at least once. */
  answered: number;
  /** How many the bank holds — a test of four never exhausts it. */
  questions: number;
  /** Where this topic's family resumes; the topic a sweep would reach first. */
  frontier: boolean;
}

/** How much of a topic's question bank has actually been met. */
export interface Coverage {
  answered: number;
  total: number;
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
    // An empty frontier map means every family starts at its first topic,
    // which is what a file written before per-family frontiers was doing.
    // Nothing is derived from the old single `frontier`: it was never read, so
    // deriving from it now would move a returning student.
    this.p.frontiers ??= {};
    this.p.focus ??= { kind: "sweep" };
    this.p.openRound ??= null;
    // A placement stored in the old evenly-spaced shape cannot be resumed by
    // the per-family walk. It is at most a few sentences; start over.
    if (this.p.placement && !("familyIndex" in this.p.placement)) {
      this.p.placement = null;
    }
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
   * Start (or restart) a placement run and write it down. Returns the first
   * probe, or null when the bundle has no teachable topic at all.
   */
  beginPlacement(): PlacementRun | null {
    const run = this.openFamily(0);
    this.p.placement = run;
    this.touch();
    return run;
  }

  /**
   * The section the current probe is asking about, if a run is under way.
   */
  placementProbe(): string | undefined {
    return this.p.placement?.probe;
  }

  /**
   * How far through the run is, for a line that says so. `families` counts
   * only the families this bundle has topics for.
   */
  placementProgress():
    | { family: FamilyId; done: number; families: number; narrowing: boolean }
    | undefined {
    const run = this.p.placement;
    if (!run) return undefined;
    const probed = FAMILIES.filter(
      (f) => this.familyTopics(f.id).length > 0,
    ).map((f) => f.id);
    const current = FAMILIES[run.familyIndex]?.id;
    if (!current) return undefined;
    return {
      family: current,
      done: Math.max(0, probed.indexOf(current)),
      families: probed.length,
      // The second probe of a family is not a new area, it is the same one
      // being pinned down — so the counter holds and the word says why.
      narrowing: run.asked > 0,
    };
  }

  /**
   * Answer the probe on the table and move the run on. Returns the next probe,
   * or null when placement is over (which also ends the run).
   *
   * A failed probe settles that one family and moves to the next — it does not
   * stop the test. Stopping at the first failure was the whole reason a
   * student who knows the declensions but not the verbs could not say so.
   */
  answerPlacement(passed: boolean): PlacementRun | null {
    const run = this.p.placement;
    if (!run) return null;
    const family = FAMILIES[run.familyIndex]?.id;
    if (!family) {
      this.endPlacement();
      return null;
    }
    const topics = this.familyTopics(family);
    const index = topics.indexOf(run.probe);
    const highest = passed ? Math.max(run.passed, index) : run.passed;

    // A second probe is only worth asking above one that passed: below it,
    // there is nothing left to narrow.
    const second = passed && run.asked === 0 ? this.upperProbe(topics, index) : -1;
    if (second >= 0) {
      const next = { ...run, asked: 1, passed: highest, probe: topics[second]! };
      this.p.placement = next;
      this.touch();
      return next;
    }

    this.settleFamily(family, topics, highest);
    const next = this.openFamily(run.familyIndex + 1);
    this.p.placement = next;
    if (!next) {
      this.endPlacement();
      return null;
    }
    this.touch();
    return next;
  }

  /** Finish placement; normal study then begins at each family's frontier. */
  endPlacement(): void {
    this.p.placementDone = true;
    this.p.placement = null;
    this.touch();
  }

  // --- focus ---------------------------------------------------------------

  /**
   * Where new topics are coming from, with a spent focus reported as the sweep
   * it has effectively become — a drilled-out topic or a finished family is no
   * longer somewhere to be.
   */
  focusState(): Focus {
    const f = this.p.focus;
    if (f.kind === "topic") {
      const { answered, total } = this.coverage(f.sectionId);
      return total > 0 && answered < total ? f : { kind: "sweep" };
    }
    if (f.kind === "family") {
      return this.firstAvailable(familyOf(f.id)) ? f : { kind: "sweep" };
    }
    return f;
  }

  setFocus(focus: Focus): void {
    this.p.focus = focus;
    this.touch();
  }

  /**
   * Take the syllabus up from here: this section's family resumes at it, and
   * that family becomes the focus. The topics behind it are skipped rather
   * than marked known — the map goes on showing them unstudied, because they
   * are.
   */
  studyFrom(sectionId: string): void {
    const section = this.content.getSection(sectionId);
    if (!section) return;
    const family = familyOf(section.family);
    this.p.frontiers[family] = sectionId;
    this.p.focus = { kind: "family", id: family };
    this.touch();
  }

  /** Stay on this topic and work the rest of its bank. */
  drillTopic(sectionId: string): void {
    this.setFocus({ kind: "topic", sectionId });
  }

  /** How much of a topic's bank has been answered at least once. */
  coverage(sectionId: string): Coverage {
    const asked = new Set(
      (this.p.attempts[sectionId] ?? []).map((a) => a.prompt),
    );
    const questions = this.content.questionsFor(sectionId);
    return {
      answered: questions.filter((q) => asked.has(q.question.prompt)).length,
      total: questions.length,
    };
  }

  /** Decide the next step. Pure query — presenting is the caller's job. */
  next(now: Date = new Date()): Action {
    const dueTopic = this.earliestDueTopic(now);
    if (dueTopic) return { kind: "topic-review", sectionId: dueTopic };

    const dueVocab = this.earliestDueVocab(now);
    if (dueVocab) return { kind: "vocab-review", cardId: dueVocab };

    const focus = this.focusState();
    if (focus.kind === "topic") {
      return { kind: "drill", sectionId: focus.sectionId };
    }

    const fresh = this.nextNewTopic();
    if (fresh) return { kind: "new-topic", sectionId: fresh };

    return { kind: "done" };
  }

  /**
   * Choose a test for a section, preferring ones not served recently so the
   * same topic feels fresh across sessions. Records it as seen.
   *
   * `prefer: "unanswered"` is what a drill asks for: the test holding the most
   * questions never yet answered, so working a topic sweeps its bank instead
   * of circling the six tests the rotation happens to like.
   */
  serveTest(
    sectionId: string,
    opts?: { prefer?: "unanswered" },
  ): Test | undefined {
    const tests = this.content.testsFor(sectionId);
    if (tests.length === 0) return undefined;
    if (opts?.prefer === "unanswered") {
      const asked = new Set(
        (this.p.attempts[sectionId] ?? []).map((a) => a.prompt),
      );
      let best: Test[] = [];
      let most = 0;
      for (const test of tests) {
        const fresh = test.questions.filter((q) => !asked.has(q.prompt)).length;
        if (fresh > most) {
          most = fresh;
          best = [test];
        } else if (fresh === most && most > 0) {
          best.push(test);
        }
      }
      // Nothing unanswered left anywhere: fall through to the plain rotation.
      if (most > 0) return this.take(sectionId, best);
    }
    let seen = this.p.seenTests[sectionId] ?? [];
    let pool = tests.filter((t) => !seen.includes(t.id));
    if (pool.length === 0) {
      seen = [];
      pool = tests;
      this.p.seenTests[sectionId] = [];
    }
    return this.take(sectionId, pool);
  }

  /**
   * Apply a self-grade to a grammar topic, creating its card on first sight.
   *
   * `roundId` is the served test's id, and it makes the round — not the
   * question — the unit of scheduling. Every grade in a round rewinds the card
   * to where it stood before the round and re-rates it with the worst grade
   * given so far, so four questions cost one rep instead of four, and a round
   * abandoned halfway still leaves a card that is the result of exactly one.
   * Passing no `roundId` rates per call, which is what a placement probe — one
   * sentence, one verdict — wants.
   */
  gradeTopic(
    sectionId: string,
    rating: Rating,
    now: Date = new Date(),
    roundId?: string,
  ): void {
    const existing = this.p.topicCards[sectionId];
    const wasKnown = this.p.knownSections.includes(sectionId);
    const open = this.p.openRound;
    const continuing =
      roundId !== undefined &&
      open != null &&
      open.roundId === roundId &&
      open.sectionId === sectionId;

    const before = continuing ? open.cardBefore : (existing ?? null);
    const worst = (
      continuing ? Math.min(open.worst, rating) : rating
    ) as Rating;
    const card = rate(
      before ? deserializeCard(before) : newCard(now),
      worst,
      now,
    );
    this.p.topicCards[sectionId] = serializeCard(card);
    this.p.openRound =
      roundId === undefined
        ? null
        : { sectionId, roundId, cardBefore: before, worst };

    // Mastery moves gradually, so one good answer can't mark a topic mastered
    // and one bad day can't wipe it: good/easy +1, hard +0.5, again -1. It is
    // per question, not per round: it is the count of what you got right.
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
      }
    }
    // A topic drilled dry, or a family walked to its end, is no longer a place
    // to be; settle that here rather than in `next`, which stays a pure query.
    this.p.focus = this.focusState();
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
      const family = familyOf(s.family);
      const { answered, total } = this.coverage(s.id);
      return {
        sectionId: s.id,
        title: s.title,
        ref: s.ref,
        order: s.order,
        family,
        mastery: assumed ? MASTERY_MAX : scored,
        assumed,
        hasTests: this.content.testsFor(s.id).length > 0,
        due: card ? isDue(deserializeCard(card), now) : false,
        answered,
        questions: total,
        frontier: this.p.frontiers[family] === s.id,
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

  /** Teachable topics of one family, in book order. */
  private familyTopics(family: FamilyId): string[] {
    return this.content
      .sections()
      .filter(
        (s) =>
          familyOf(s.family) === family &&
          this.content.testsFor(s.id).length > 0,
      )
      .map((s) => s.id);
  }

  /** Where a family's new work resumes; 0 when it has no frontier yet. */
  private frontierIndex(family: FamilyId, topics: string[]): number {
    const at = this.p.frontiers[family];
    const i = at === undefined ? -1 : topics.indexOf(at);
    return i < 0 ? 0 : i;
  }

  /** Untouched, unknown, and not behind its family's frontier. */
  private firstAvailable(family: FamilyId): string | null {
    const topics = this.familyTopics(family);
    for (const id of topics.slice(this.frontierIndex(family, topics))) {
      if (!this.p.topicCards[id] && !this.p.knownSections.includes(id)) {
        return id;
      }
    }
    return null;
  }

  /**
   * The next topic to teach.
   *
   * Book order, but each family picks up at its own frontier — so a student
   * placed halfway through the nouns and nowhere in the verbs gets exactly
   * that, without choosing a mode. A focused family is asked first; when it
   * runs out, and when a sweep finds nothing ahead of the frontiers, the gaps
   * left behind are filled, so the book still finishes.
   */
  private nextNewTopic(): string | null {
    const focus = this.focusState();
    if (focus.kind === "family") {
      const inFamily = this.firstAvailable(familyOf(focus.id));
      if (inFamily) return inFamily;
    }
    for (const { id } of FAMILIES) {
      const ahead = this.firstAvailable(id);
      if (ahead) return ahead;
    }
    for (const id of this.content.topicIds()) {
      if (!this.p.topicCards[id] && !this.p.knownSections.includes(id)) {
        return id;
      }
    }
    return null;
  }

  /** Serve one of `pool` at random and remember it. */
  private take(sectionId: string, pool: Test[]): Test {
    const test = pool[Math.floor(Math.random() * pool.length)]!;
    const seen = this.p.seenTests[sectionId] ?? [];
    this.p.seenTests[sectionId] = [...seen, test.id].slice(-SEEN_HISTORY);
    this.touch();
    return test;
  }

  /**
   * The probe to ask above one that passed — the middle of what is left. -1
   * when the passed probe was the family's last topic and there is nothing
   * above it to narrow.
   */
  private upperProbe(topics: string[], passed: number): number {
    const lo = passed + 1;
    const hi = topics.length - 1;
    return lo > hi ? -1 : Math.floor((lo + hi) / 2);
  }

  /** Begin the first family from `from` on that has any topics at all. */
  private openFamily(from: number): PlacementRun | null {
    for (let i = from; i < FAMILIES.length; i++) {
      const topics = this.familyTopics(FAMILIES[i]!.id);
      if (topics.length === 0) continue;
      return {
        familyIndex: i,
        asked: 0,
        passed: -1,
        // The middle of the family: one sentence that halves it either way.
        probe: topics[Math.floor((topics.length - 1) / 2)]!,
      };
    }
    return null;
  }

  /**
   * Write down what a family's probes established: its topics up to the
   * highest one passed are taken as known, and it resumes just past them.
   * Only ever this family — a prefix of the whole book is precisely the claim
   * a per-family placement exists to stop making.
   */
  private settleFamily(
    family: FamilyId,
    topics: string[],
    passed: number,
  ): void {
    if (passed < 0) return;
    const known = new Set(this.p.knownSections);
    for (const id of topics.slice(0, passed + 1)) known.add(id);
    this.p.knownSections = [...known];
    const resume = topics[passed + 1];
    if (resume) this.p.frontiers[family] = resume;
  }
}
