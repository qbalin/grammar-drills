import { Content } from "./content.js";
import { type FamilyId } from "./families.js";
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
  type AttemptMarks,
  type LegacyProgress,
  type LemmaEntry,
  type Mode,
  type PractiseRun,
  type Progress,
  type RoundDraft,
  type RoundVia,
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
  /** The topic the book has reached: never met, or met and come back to. */
  | { kind: "new-topic"; sectionId: string }
  /** More of a topic the student asked to stay on. */
  | { kind: "drill"; sectionId: string }
  /**
   * The practice run has nothing left to serve. Distinct from `done`, which
   * means there is nothing to do at all: here there is plenty to do and the
   * student asked to stay put, so the loop stops and says so rather than
   * sliding onto a topic they did not ask for.
   */
  | { kind: "practised"; sectionId: string }
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
  hasTests: boolean;
  due: boolean;
  /** Questions of this topic's bank that have been answered at least once. */
  answered: number;
  /** How many the bank holds — a test of four never exhausts it. */
  questions: number;
  /** Where the book cursor stands; the topic exploring would reach first. */
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

const ROUND_VIA: readonly RoundVia[] = ["review", "new", "drill", "sweep"];

/**
 * Whether a saved round says something this version still understands. Written
 * against the values rather than the type so a `via` that has since been
 * retired — "quiz" — is caught rather than trusted.
 */
function isRoundVia(via: unknown): via is RoundVia {
  return ROUND_VIA.some((v) => v === via);
}

/**
 * The runtime session engine. Holds the student's Progress and, given the
 * frozen Content, decides what to do next and applies self-grades — all
 * deterministic, no LLM. Ported from the reference `session.py` state machine
 * with the LLM's exercise/grading jobs removed.
 */
export class Session {
  private p: Progress;

  /**
   * The pack's families, in the order the grammar index is drawn.
   * Read through here rather than imported, so the engine carries no opinion
   * about which families a language has.
   */
  private get families(): readonly { id: string; label: string }[] {
    return this.content.families;
  }

  /** The generation of the shipped citations this pack is on. */
  private get citationsVersion(): number {
    return this.content.profile.citationsVersion;
  }

  constructor(
    private readonly content: Content,
    progress?: Progress,
  ) {
    this.p = progress ?? emptyProgress(content.profile.citationsVersion);
    // Progress files written before mastery tracking have no map; there is no
    // migration layer, so default it here. Same for the answer trail and the
    // citation generation — a file written before either simply has none.
    this.p.topicMastery ??= {};
    this.p.attempts ??= {};
    this.p.citationsVersion ??= 1;
    this.p.openRound ??= null;
    this.p.bookAt ??= null;
    this.p.practise ??= null;
    this.migrate();
    // A round stored before it recorded where the student was in it. There is
    // nowhere to resume such a round to, and the only job it had — holding the
    // card at one rep — it has already finished doing.
    if (this.p.openRound && !("answered" in this.p.openRound)) {
      this.p.openRound = null;
    }
  }

  /**
   * Fold what older versions of this app wrote down into what it writes now,
   * and drop the rest.
   *
   * Read through `LegacyProgress` rather than a cast: these fields are real,
   * they are on disk in every returning student's file, and the type system
   * should be told about them rather than lied to.
   */
  private migrate(): void {
    const old: LegacyProgress = this.p;

    // Placement is gone, but what it wrote down was a claim the student made
    // about themselves, and the map has always drawn those sections as fully
    // mastered. So they become exactly that: the bars are unchanged, and the
    // book cursor — which is placed by mastery — steps past them as it did.
    if (old.knownSections) {
      for (const id of old.knownSections) this.p.topicMastery[id] ??= MASTERY_MAX;
      delete old.knownSections;
    }
    delete old.placement;
    delete old.placementDone;
    // Which errand you are on resets with every launch; a file cannot say.
    delete old.exploring;

    // One book-wide cursor replaces the per-family map, and only where the
    // student had actually asked for one: a family focus is what "study from
    // here" used to leave behind, and its frontier is where. A drill focus has
    // no run marker to resume from, so it goes back to the book.
    if (this.p.bookAt === null && old.focus?.kind === "family") {
      this.p.bookAt = old.frontiers?.[old.focus.id] ?? null;
    }
    delete old.focus;
    delete old.frontiers;

    // "Quiz me" is gone. A round it opened is still four sentences on a topic,
    // and what it was shown as is the honest answer — the same reading a round
    // written before `via` existed gets.
    const round = this.p.openRound;
    if (round && !isRoundVia(round.via)) {
      round.via = round.isNew ? "new" : "review";
    }
  }

  // --- what exploring is doing ---------------------------------------------

  /**
   * The section exploring will serve next, placing the cursor if nothing has.
   *
   * An unplaced cursor lands on the earliest topic short of the top band,
   * which is what a fresh deck wants and what choosing book order asks for.
   * Null only when the whole book is mastered.
   */
  bookCursor(): string | null {
    const at = this.p.bookAt;
    if (at !== null && at !== undefined && this.content.getSection(at)) return at;
    return this.earliestUnmastered();
  }

  /**
   * Step the cursor on to the next section of the book, whatever happened on
   * this one.
   *
   * Forward regardless of the grade, and without skipping what is already
   * mastered. A cursor that waited for mastery could not move past a topic
   * going badly, which is the one topic a student most needs to be able to
   * leave; and a cursor that skipped would make "read on from here" mean
   * something other than reading on. Past the end it wraps to whatever the
   * book still has short of mastery, so nothing is stranded behind it.
   */
  advanceCursor(): void {
    const ids = this.content.topicIds();
    const at = this.bookCursor();
    const next = at === null ? -1 : ids.indexOf(at) + 1;
    this.p.bookAt =
      next > 0 && next < ids.length ? ids[next]! : this.earliestUnmastered();
    this.touch();
  }

  /** The first topic in book order that has not reached the top band. */
  private earliestUnmastered(): string | null {
    return this.content.topicIds().find((id) => !this.mastered(id)) ?? null;
  }

  /**
   * The top mastery band — the bar full. Scores land on exact halves, so this
   * is an equality test wearing a comparison's clothes.
   */
  private mastered(sectionId: string): boolean {
    return (this.p.topicMastery[sectionId] ?? 0) >= MASTERY_MAX;
  }

  /**
   * Whether this topic has ever been graded. What tells a genuinely new topic
   * from one the book has come back to, which is the difference between
   * teaching before testing and simply asking.
   */
  everGraded(sectionId: string): boolean {
    return this.p.topicMastery[sectionId] !== undefined;
  }

  /** Read the book in order, from the earliest thing not yet mastered. */
  bookOrder(): void {
    this.p.practise = null;
    this.p.bookAt = this.earliestUnmastered();
    this.touch();
  }

  /**
   * Take the book up from here and read on to the end of it, families and all.
   *
   * The topics behind it are skipped rather than marked known — the map goes
   * on showing them unstudied, because they are — and the walk comes back
   * round to them once it runs off the end.
   */
  studyFrom(sectionId: string): void {
    if (!this.content.getSection(sectionId)) return;
    this.p.practise = null;
    this.p.bookAt = sectionId;
    this.touch();
  }

  /** Stay on this topic and work a fresh run of its questions out. */
  drillTopic(sectionId: string, now: Date = new Date()): void {
    this.p.practise = { sectionId, since: now.toISOString() };
    this.touch();
  }

  /** The run of practice in flight, if the topic has anything to ask at all. */
  practiseRun(): PractiseRun | null {
    const run = this.p.practise;
    if (!run) return null;
    return this.content.testsFor(run.sectionId).length > 0 ? run : null;
  }

  /**
   * How a practice run stands: how many of its questions it has served, and
   * how many it is for.
   */
  practice(sectionId: string): { done: number; total: number } | null {
    const run = this.practiseRun();
    if (!run || run.sectionId !== sectionId) return null;
    const { set, served } = this.runSet(sectionId, run.since);
    let done = 0;
    for (const prompt of set) if (served.has(prompt)) done += 1;
    return { done, total: set.size };
  }

  /**
   * The next test of the practice run, or undefined once the run is worked out
   * (which `next` will already have said).
   *
   * Tests are picked by how much of the run they still hold, tie-broken by
   * whichever was served longest ago — so a run over a bank that has already
   * been swept leads with what the student has not seen for longest.
   */
  servePractice(sectionId: string): Test | undefined {
    const run = this.practiseRun();
    if (!run || run.sectionId !== sectionId) return undefined;
    const { set, served } = this.runSet(sectionId, run.since);
    const left = (t: Test) =>
      t.questions.filter((q) => set.has(q.prompt) && !served.has(q.prompt)).length;
    const seen = this.p.seenTests[sectionId] ?? [];
    const pick = this.content
      .testsFor(sectionId)
      .filter((t) => left(t) > 0)
      // `seenTests` is in serve order, so a test's *last* mention is when it
      // was last served — `indexOf` would rank a test served both first and
      // most recently as the oldest. A never-served test (-1) leads.
      .sort(
        (a, b) => left(b) - left(a) || seen.lastIndexOf(a.id) - seen.lastIndexOf(b.id),
      )[0];
    return pick ? this.take(sectionId, [pick]) : undefined;
  }

  /** How many of the run's questions are still to come. */
  private practiceLeft(run: PractiseRun): number {
    const { set, served } = this.runSet(run.sectionId, run.since);
    let left = 0;
    for (const prompt of set) if (!served.has(prompt)) left += 1;
    return left;
  }

  /**
   * What one run is for, and what it has met.
   *
   * A first run is the questions a four-question test never reached; once
   * there are none of those left, a run is the whole bank instead, which is
   * what asking to practise a swept topic again can only mean. Both sets are
   * read off the answer trail, so nothing has to be written down beside it and
   * kept true.
   *
   * `before` is fixed for the life of the run — answers given during it are
   * stamped at or after `since` — so which of the two sets this is cannot flip
   * halfway through.
   */
  private runSet(
    sectionId: string,
    since: string,
  ): { set: Set<string>; served: Set<string> } {
    const trail = this.p.attempts[sectionId] ?? [];
    const before = new Set(trail.filter((a) => a.at < since).map((a) => a.prompt));
    const served = new Set(trail.filter((a) => a.at >= since).map((a) => a.prompt));
    const bank = this.content.questionsFor(sectionId).map((q) => q.question.prompt);
    const fresh = bank.filter((prompt) => !before.has(prompt));
    return { set: new Set(fresh.length > 0 ? fresh : bank), served };
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

  /**
   * Decide the next step, for the errand the caller is on. Pure query —
   * presenting is the caller's job.
   *
   * The two modes share no rung. Reviewing serves what is due and nothing
   * else; exploring reads the book and nothing else. `done` therefore means
   * two different true things — "nothing is waiting" and "the book is worked
   * out" — and the caller, which knows which it asked for, is what says so.
   *
   * `now` stays the first argument so a call that only wants the reviews can
   * go on being `next(now)`.
   */
  next(now: Date = new Date(), mode: Mode = "review"): Action {
    if (mode === "review") {
      const dueTopic = this.earliestDueTopic(now);
      if (dueTopic) return { kind: "topic-review", sectionId: dueTopic };
      const dueVocab = this.earliestDueVocab(now);
      if (dueVocab) return { kind: "vocab-review", cardId: dueVocab };
      return { kind: "done" };
    }

    const run = this.practiseRun();
    if (run) {
      return this.practiceLeft(run) > 0
        ? { kind: "drill", sectionId: run.sectionId }
        : { kind: "practised", sectionId: run.sectionId };
    }

    const ahead = this.bookCursor();
    return ahead ? { kind: "new-topic", sectionId: ahead } : { kind: "done" };
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
      this.p.seenTests[sectionId] = [];
    }
    return this.take(sectionId, pool);
  }

  // --- the round in flight ---------------------------------------------------

  /**
   * Take up a served test as the round in flight.
   *
   * Called when a test reaches the screen, not when it is first answered. The
   * round used to open on its first grade, which meant a student one question
   * in had no record of being anywhere — and a test is entirely the screen's
   * own state, so anything that ended the page lost it. `cardBefore` is read
   * here for the same reason: "the card as it stood before the round began" is
   * what it says, and before the round began is now.
   */
  beginRound(
    sectionId: string,
    test: Test,
    isNew = false,
    via: RoundVia = isNew ? "new" : "review",
  ): void {
    this.p.openRound = {
      sectionId,
      roundId: test.id,
      cardBefore: this.p.topicCards[sectionId] ?? null,
      worst: null,
      answered: 0,
      isNew,
      via,
    };
    this.touch();
  }

  /** Let go of the round: its last question is graded, or study moved on. */
  endRound(): void {
    if (!this.p.openRound) return;
    this.p.openRound = null;
    this.touch();
  }

  /**
   * The round to put back on the screen, or null to ask `next` instead.
   *
   * The test is found by id rather than served again: `serveTest` picks at
   * random and records what it picked, so re-calling it here would hand back a
   * different test *and* spend a rotation slot on every reload.
   *
   * Null for a round whose questions are all graded, and for one naming a test
   * this bundle no longer carries — a pack can be regenerated under a student
   * mid-round, and the answer to that is the scheduler, not a crash.
   */
  resumableRound(): {
    sectionId: string;
    test: Test;
    qIndex: number;
    isNew: boolean;
    via: RoundVia;
    draft?: RoundDraft;
  } | null {
    const open = this.p.openRound;
    if (!open) return null;
    const test = this.content
      .testsFor(open.sectionId)
      .find((t) => t.id === open.roundId);
    if (!test || open.answered >= test.questions.length) return null;
    return {
      sectionId: open.sectionId,
      test,
      qIndex: open.answered,
      isNew: open.isNew,
      // A round written before rounds said why they were served: what it was
      // shown as is the honest answer, and that was the new badge or nothing.
      via: open.via ?? (open.isNew ? "new" : "review"),
      draft: open.draft,
    };
  }

  /**
   * Keep the answer being written, so a session that ends mid-sentence does
   * not cost the sentence.
   *
   * Deliberately does not `touch()`. `updatedAt` is what the remote mirror
   * compares, and a keystroke is not progress another device needs; bumping it
   * here would queue a commit per letter typed.
   */
  setDraft(draft: RoundDraft | null): void {
    if (!this.p.openRound) return;
    if (draft) this.p.openRound.draft = draft;
    else delete this.p.openRound.draft;
  }

  /**
   * Apply a self-grade to a grammar topic, creating its card on first sight.
   *
   * `roundId` is the served test's id, and it makes the round — not the
   * question — the unit of scheduling. Every grade in a round rewinds the card
   * to where it stood before the round and re-rates it with the worst grade
   * given so far, so four questions cost one rep instead of four, and a round
   * abandoned halfway still leaves a card that is the result of exactly one.
   * Passing no `roundId` rates per call, which is what a topic with no tests
   * written for it — one verdict, no round — wants.
   */
  gradeTopic(
    sectionId: string,
    rating: Rating,
    now: Date = new Date(),
    roundId?: string,
  ): void {
    const existing = this.p.topicCards[sectionId];
    const open = this.p.openRound;
    const continuing =
      roundId !== undefined &&
      open != null &&
      open.roundId === roundId &&
      open.sectionId === sectionId;

    const before = continuing ? open.cardBefore : (existing ?? null);
    // `worst` is null until the round's first grade, since a round now opens
    // when its test is served rather than when it is first answered.
    const worst = (
      continuing && open.worst !== null ? Math.min(open.worst, rating) : rating
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
        : {
            sectionId,
            roundId,
            cardBefore: before,
            worst,
            // One more of the round's questions is behind us, and the draft
            // was the answer to the one just graded.
            answered: (continuing ? open.answered : 0) + 1,
            isNew: continuing ? open.isNew : false,
            via: continuing ? (open.via ?? "review") : "review",
          };

    // Mastery moves gradually, so one good answer can't mark a topic mastered
    // and one bad day can't wipe it: good/easy +1, hard +0.5, again -1. It is
    // per question, not per round: it is the count of what you got right.
    const delta = rating >= 3 ? 1 : rating === 2 ? 0.5 : -1;
    const base = this.p.topicMastery[sectionId] ?? MASTERY_MIN;
    this.p.topicMastery[sectionId] = Math.min(
      MASTERY_MAX,
      Math.max(MASTERY_MIN, base + delta),
    );
    if (!existing) this.p.newTopicsIntroduced += 1;
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

  /**
   * Mark up an attempt already on the record — the words the student wants to
   * find again, on the sentences as they stood at the time.
   *
   * Addressed by its timestamp. An attempt has no id of its own and its
   * position moves as the trail grows, but two of them cannot share a
   * millisecond: grading is a tap, and the trail is one student's.
   *
   * Marks that pick nothing out are dropped rather than stored empty, so an
   * attempt marked and then unmarked reads on disk like one nobody touched.
   */
  markAttempt(sectionId: string, at: string, marks: AttemptMarks): void {
    const attempt = this.p.attempts[sectionId]?.find((a) => a.at === at);
    if (!attempt) return;
    const kept = Object.entries(marks).filter(
      ([, m]) => m && Object.keys(m).length > 0,
    );
    if (kept.length === 0) delete attempt.marks;
    else attempt.marks = Object.fromEntries(kept) as AttemptMarks;
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
    const id = `v-${this.content.fold(entry.lemma)}`;
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
      this.content.fold(a.citation).localeCompare(this.content.fold(b.citation)),
    );
  }

  /**
   * Correct a card's two sides. The id and the scheduling are left alone, so
   * fixing a citation months in never costs the card its history — which is the
   * only reason editing is safe to offer at any time.
   *
   * The edit reaches this card and nothing else. The dictionary is shipped
   * content, built offline and read-only here, so a corrected citation was
   * never going to be written back to it — but the reverse was true and is the
   * same mistake from the other side: `refreshCitations` used to overwrite a
   * hand-written citation the next time the pack shipped a new dictionary, so
   * the correction lasted only until the next rebuild and the dictionary still
   * effectively owned the card. A citation the student has written is theirs
   * from then on, and is marked as such here.
   */
  updateVocab(
    cardId: string,
    patch: Partial<Pick<VocabCardState, "citation" | "gloss">>,
  ): void {
    const card = this.p.vocabCards[cardId];
    if (!card) return;
    if (patch.citation !== undefined) {
      const citation = patch.citation.trim();
      // Only a real change claims the card. Opening the sheet and saving it
      // untouched is not the student saying the dictionary is wrong.
      if (citation !== card.citation) card.citationEdited = true;
      card.citation = citation;
    }
    // The gloss needs no such mark: nothing ever rewrites it from the
    // dictionary, so an edited meaning is already the student's for good.
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
   * words recorded afterwards. Runs once per generation.
   *
   * A card whose citation the student has written is skipped. This is what
   * makes editing one mean anything: a correction that a later rebuild undoes
   * is a correction the student has to make again, and they have no way to know
   * it was undone. The dictionary's improvements are for the cards that are
   * still the dictionary's.
   *
   * Returns how many cards changed. A no-op when the dictionary is not loaded:
   * every lookup misses, so nothing is overwritten with nothing.
   */
  refreshCitations(): number {
    if ((this.p.citationsVersion ?? 1) >= this.citationsVersion) return 0;
    let changed = 0;
    let looked = false;
    for (const card of Object.values(this.p.vocabCards)) {
      const candidates = this.content.lookup(card.lemma);
      // Looked up even when the card is the student's, so that a run which
      // skips every card still counts as a dictionary having been consulted
      // and stamps the generation. Otherwise this would re-run at every launch
      // for as long as the student's own cards were the only ones they had.
      if (candidates.length > 0) looked = true;
      if (card.citationEdited) continue;
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
      this.p.citationsVersion = this.citationsVersion;
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
        sub: this.content.formatRef(section.ref),
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
   * progress bars and the topic explorer.
   */
  grammarMap(now: Date = new Date()): TopicProgress[] {
    const cursor = this.bookCursor();
    return this.content.sections().map((s) => {
      const card = this.p.topicCards[s.id];
      const { answered, total } = this.coverage(s.id);
      return {
        sectionId: s.id,
        title: s.title,
        ref: s.ref,
        order: s.order,
        family: this.content.familyOf(s.family),
        mastery: this.p.topicMastery[s.id],
        hasTests: this.content.testsFor(s.id).length > 0,
        due: card ? isDue(deserializeCard(card), now) : false,
        answered,
        questions: total,
        frontier: cursor === s.id,
      };
    });
  }

  /** `grammarMap()` bucketed into families, in display order. */
  familyProgress(now: Date = new Date()): FamilyProgress[] {
    const map = this.grammarMap(now);
    return this.families.map(({ id, label }) => {
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
   * a deep clone is the whole story: grading, the book cursor and vocabulary all
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

  /** `skip` is what an explore run is holding; empty the rest of the time. */
  private earliestDueTopic(
    now: Date,
    skip: ReadonlySet<string> = new Set(),
  ): string | null {
    let best: string | null = null;
    let bestDue = Infinity;
    for (const [id, s] of Object.entries(this.p.topicCards)) {
      if (!this.content.getSection(id) || skip.has(id)) continue;
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

  private earliestDueVocab(
    now: Date,
    skip: ReadonlySet<string> = new Set(),
  ): string | null {
    let best: string | null = null;
    let bestDue = Infinity;
    for (const s of Object.values(this.p.vocabCards)) {
      if (skip.has(s.id)) continue;
      const card = deserializeCard(s.fsrs);
      if (isDue(card, now) && card.due.getTime() < bestDue) {
        bestDue = card.due.getTime();
        best = s.id;
      }
    }
    return best;
  }

  /** Serve one of `pool` at random and remember it. */
  private take(sectionId: string, pool: Test[]): Test {
    const test = pool[Math.floor(Math.random() * pool.length)]!;
    const seen = this.p.seenTests[sectionId] ?? [];
    this.p.seenTests[sectionId] = [...seen, test.id].slice(-SEEN_HISTORY);
    this.touch();
    return test;
  }

}
