import { Content } from "./content.js";
import { type FamilyId } from "./families.js";
import type { Fold } from "./fold.js";
import { foldKey, words } from "./question-vocab.js";
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
  type NewVocabContext,
  type PractiseRun,
  type Progress,
  type QuestionSource,
  type RoundDraft,
  type RoundVia,
  type SerializedCard,
  type Test,
  type VocabCardState,
  type VocabContext,
} from "./types.js";
import { mulberry32, nextSeed, randomSeed, shuffled } from "./shuffle.js";

const SEEN_HISTORY = 10; // remember this many recently-served tests per section

/**
 * A test whose every answer is quoted from somebody.
 *
 * `every` rather than `some`, and it is not pedantry: the packs generate their
 * quoted questions into tests of their own, so nothing mixed ships today and
 * either spelling would pass. What `every` buys is that the promise survives
 * content that does mix — the preference is about what a student is *asked*,
 * one question at a time, and a test three-quarters quoted still asks the
 * quarter that is not.
 *
 * An empty test is not quoted; it is empty.
 */
const isQuoted = (t: Test): boolean =>
  t.questions.length > 0 && t.questions.every((q) => q.source);

/**
 * The order one cycle hands a section's tests over in.
 *
 * Quoted first when the student has not asked otherwise, each half shuffled, so
 * that a topic's quotations are all met before any written sentence is and the
 * second time round is not the first time round again. Nothing is withheld:
 * this is where the written questions go, not whether they go anywhere.
 *
 * Both halves draw from ONE stream, and the quoted half draws first. That is
 * load-bearing rather than tidy. `serveTest` is called with the whole of a
 * section's tests on one path and with its quoted ones alone on another, and
 * both readings share a place in the cycle; because the quoted half is drawn
 * before the generated half exists to the generator, the two orders agree
 * exactly for as long as the cycle is inside the quotations. A student who
 * turns the preference on halfway through a topic therefore carries on where
 * they were rather than being sent back to a sentence they just answered.
 */
function serveOrder(tests: Test[], seed: number, quotedFirst: boolean): Test[] {
  const rng = mulberry32(seed);
  if (!quotedFirst) return shuffled(tests, rng);
  return [
    ...shuffled(
      tests.filter((t) => isQuoted(t)),
      rng,
    ),
    ...shuffled(
      tests.filter((t) => !isQuoted(t)),
      rng,
    ),
  ];
}

/**
 * How many sentences one word may keep.
 *
 * The commonest words are in hundreds of questions, and without a ceiling one
 * card's back becomes a wall and the progress file grows without a student ever
 * asking it to. A word met eight times does not need a ninth sentence to be
 * memorable. The limit is told to the caller rather than enforced in silence,
 * and deleting one makes room again.
 */
export const MAX_CONTEXTS = 8;

/**
 * What became of a sentence offered to a card. Four ways for it not to land,
 * said apart, because a surface that reported them all as "saved" would flash a
 * confirmation for a press that did nothing.
 */
export type ContextOutcome =
  | "added"
  | "duplicate"
  | "full"
  | "off"
  | "missing";

/**
 * What makes two contexts the same one.
 *
 * The question and the sentence, both through the pack's own fold, so the same
 * line typed once with the pack's editorial marks and once without is one
 * context and not two. `source` is deliberately out of the key: an answer typed
 * correctly folds equal to the reference, so holding a word in both texts of one
 * question keeps one sentence — which is the same judgement `answerMatches`
 * makes on the same two strings.
 *
 * `index` is out of it too. Same card, same sentence, different index only
 * happens when one lemma stands twice in a line, and that is one context with
 * two possible highlights; the first one wins.
 */
function contextKey(context: NewVocabContext, fold: Fold): string {
  return `${foldKey(context.prompt, fold)}\n${foldKey(context.sentence, fold)}`;
}

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
  /** Who the answer is quoted from, on the questions that quote somebody. */
  source?: QuestionSource;
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
    return this.content.families(this.grammarId);
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
    // A file written before topics were served in cycles has none. Absent means
    // "nothing has been served here yet", which is the honest reading of a file
    // that predates the field: the first serve on each topic draws a seed and
    // opens on the quotations, which is where a returning student would want to
    // be put anyway.
    this.p.testCycles ??= {};
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
  /** The book being read. Absent on the progress file means the primary. */
  get grammarId(): string {
    const id = this.p.grammarId;
    return id && this.content.grammarIds().includes(id)
      ? id
      : this.content.primaryGrammar;
  }

  /**
   * Open a different grammar of the same language.
   *
   * Nothing is migrated and nothing is recomputed, because nothing moved: the
   * cards, the mastery and the answers stay filed under the primary's topics,
   * and this changes only which book's topics are drawn over them.
   */
  setGrammar(id: string): void {
    if (!this.content.grammarIds().includes(id)) return;
    this.p.grammarId = id;
    this.touch();
  }

  /** This book's cursor. The primary's is `bookAt`; the rest are beside it. */
  private cursorAt(): string | null | undefined {
    return this.grammarId === this.content.primaryGrammar
      ? this.p.bookAt
      : this.p.bookAtByGrammar?.[this.grammarId];
  }

  private setCursor(at: string | null): void {
    if (this.grammarId === this.content.primaryGrammar) {
      this.p.bookAt = at;
      return;
    }
    this.p.bookAtByGrammar = { ...(this.p.bookAtByGrammar ?? {}), [this.grammarId]: at };
  }

  bookCursor(): string | null {
    const at = this.cursorAt();
    // A cursor left in another book is not this book's cursor, so it is placed
    // afresh rather than followed into a syllabus that does not hold it.
    if (
      at !== null && at !== undefined &&
      this.content.getSection(at) &&
      this.content.grammarOf(at) === this.grammarId
    ) {
      return at;
    }
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
    const ids = this.content.topicIds(this.grammarId);
    const at = this.bookCursor();
    const next = at === null ? -1 : ids.indexOf(at) + 1;
    this.setCursor(
      next > 0 && next < ids.length ? ids[next]! : this.earliestUnmastered(),
    );
    this.touch();
  }

  /** The first topic in book order that has not reached the top band. */
  private earliestUnmastered(): string | null {
    return this.content.topicIds(this.grammarId).find((id) => !this.mastered(id)) ?? null;
  }

  /**
   * The top mastery band — the bar full. Scores land on exact halves, so this
   * is an equality test wearing a comparison's clothes.
   */
  /**
   * The answers filed under a section, whichever book named it.
   *
   * A section of a further grammar has no trail of its own: progress is filed
   * under the primary topics that carry the questions, and this gathers them.
   * One topic almost always, so the common case does not copy the array.
   */
  private attemptTrail(sectionId: string): Attempt[] {
    const ids = this.content.primaryTopicsFor(sectionId);
    if (ids.length === 1) return this.p.attempts[ids[0]!] ?? [];
    return ids
      .flatMap((id) => this.p.attempts[id] ?? [])
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  /** The same, for the recency a practice run breaks its ties with. */
  private seenTrail(sectionId: string): string[] {
    const ids = this.content.primaryTopicsFor(sectionId);
    if (ids.length === 1) return this.p.seenTests[ids[0]!] ?? [];
    return ids.flatMap((id) => this.p.seenTests[id] ?? []);
  }

  /**
   * Which cycle a section is served out of.
   *
   * By the primary topics rather than by the section, so the two books share
   * one order over what is one list of tests: a further grammar's section that
   * teaches a single primary topic is served that topic's tests exactly, and a
   * second cycle over the same list would let a book switch hand back a test
   * the other book had just given. The rare section drawing on several topics
   * gets a key of its own, because its list is genuinely a different list.
   *
   * A primary topic keys as itself, so a deck that has never seen a second
   * grammar carries what it always did.
   */
  private cycleKey(sectionId: string): string {
    const ids = this.content.primaryTopicsFor(sectionId);
    return ids.length === 1 ? ids[0]! : ids.join("\n");
  }

  private mastered(sectionId: string): boolean {
    /*
     * Every topic it teaches, not the average of them. A section of a further
     * grammar may draw on two of the primary's, and a student who has finished
     * one of those two has not finished this. `every` on an empty list would
     * say yes, so a section the crosswalk does not reach is never mastered —
     * which is right: it has nothing to master.
     */
    const primary = this.content.primaryTopicsFor(sectionId);
    return (
      primary.length > 0 &&
      primary.every((id) => (this.p.topicMastery[id] ?? 0) >= MASTERY_MAX)
    );
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
   * Quoted tests lead, then whichever holds most of the run, tie-broken by
   * whichever was served longest ago — so a run over a bank that has already
   * been swept leads with what the student has not seen for longest.
   *
   * A run does not take a place in the topic's cycle, and this is where the two
   * rules part company: the cycle orders *what comes next on this topic*, while
   * a run is sweeping *what is left of this run*, read off the answer trail. An
   * index into a queue cannot know which tests still hold something unanswered,
   * so it would either hand over spent ones or skip its own slots. Quoted-first
   * is put back by hand instead, and put FIRST rather than as a tie-break: the
   * `left(t) > 0` filter already guarantees the sweep is complete, so all this
   * decides is the order a complete sweep happens in. Behind `left`, it would
   * stop deciding anything the moment the bank was partly swept, which is
   * exactly when a student has been here long enough to care.
   */
  servePractice(sectionId: string): Test | undefined {
    const run = this.practiseRun();
    if (!run || run.sectionId !== sectionId) return undefined;
    const { set, served } = this.runSet(sectionId, run.since);
    const left = (t: Test) =>
      t.questions.filter((q) => set.has(q.prompt) && !served.has(q.prompt)).length;
    const lead = this.quotedFirst()
      ? (a: Test, b: Test) => Number(isQuoted(b)) - Number(isQuoted(a))
      : () => 0;
    const seen = this.seenTrail(sectionId);
    const pick = this.content
      .testsFor(sectionId)
      .filter((t) => (!this.quotedOnly() || isQuoted(t)) && left(t) > 0)
      // `seenTests` is in serve order, so a test's *last* mention is when it
      // was last served — `indexOf` would rank a test served both first and
      // most recently as the oldest. A never-served test (-1) leads.
      .sort(
        (a, b) =>
          lead(a, b) ||
          left(b) - left(a) ||
          seen.lastIndexOf(a.id) - seen.lastIndexOf(b.id),
      )[0];
    return pick ? this.record(pick) : undefined;
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
    const trail = this.attemptTrail(sectionId);
    const before = new Set(trail.filter((a) => a.at < since).map((a) => a.prompt));
    const served = new Set(trail.filter((a) => a.at >= since).map((a) => a.prompt));
    // The run's set is what the run can actually serve. Counting the whole bank
    // while `servePractice` hands out only quoted tests would leave a drill
    // reporting questions left that never arrive, and `next` would keep calling
    // it a drill for ever.
    const bank = this.bank(sectionId).map((q) => q.question.prompt);
    const fresh = bank.filter((prompt) => !before.has(prompt));
    return { set: new Set(fresh.length > 0 ? fresh : bank), served };
  }

  /**
   * A section's questions as the preference leaves them — what exploring can
   * actually ask.
   *
   * By the question rather than by the test, unlike `serveTest`: what a test
   * is for is deciding whether to *serve* it, and a test three-quarters quoted
   * is not something the preference will hand over. What is being counted here
   * is questions, and a mixed test contributes the quoted ones. Nothing mixed
   * ships today, so the two agree; sharing the predicate with `runSet` is what
   * keeps a count and the run it describes agreeing if that changes.
   *
   * The one place the preference meets a question, now that `questionBank`
   * reads it too — which is what stops the index, a practice run and the list
   * of a topic's questions from ever quoting three different totals.
   */
  private bank(sectionId: string) {
    return this.content
      .questionsFor(sectionId)
      .filter((q) => !this.quotedOnly() || q.question.source);
  }

  /**
   * How much of a topic's bank has been answered at least once.
   *
   * The bank narrows with the preference, because this is the number that says
   * where the questions are. A student who asked for quoted sentences only and
   * reads "0/24 answered" against a topic holding no quotation has been sent
   * there by the one count on the row, and would find the topic stepped over on
   * arrival. Under the preference, 0 questions is the honest total, and it is
   * how the topics worth going to are picked out of the index.
   *
   * `answered` narrows with it: it is an intersection with the bank, so a
   * question the preference no longer asks stops counting towards a total it is
   * no longer part of.
   */
  coverage(sectionId: string): Coverage {
    const asked = new Set(
      this.attemptTrail(sectionId).map((a) => a.prompt),
    );
    const questions = this.bank(sectionId);
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
      /*
       * Words first, then grammar, and the order is not arbitrary. A card is
       * answered in seconds where a round of sentences is not, so a session cut
       * short — which is most of them, on a phone — has got through far more of
       * what was actually due. And a card served after the grammar is a card
       * behind a wall: stop on the third sentence of a hard topic and every
       * word waiting behind it misses its review, which is the one thing a
       * scheduler exists to prevent. Grammar keeps its place in the queue; it
       * simply does not stand in front of the quick work.
       */
      const dueVocab = this.earliestDueVocab(now);
      if (dueVocab) return { kind: "vocab-review", cardId: dueVocab };
      const dueTopic = this.earliestDueTopic(now);
      if (dueTopic) return { kind: "topic-review", sectionId: dueTopic };
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
   * Hand over the next test of a section's cycle, and step the cycle on.
   *
   * Every test of a topic arrives before any of them arrives twice, which a
   * draw from a pool could not promise and the ten-id memory this used to keep
   * could not even check: Latin's largest topic holds ninety tests, so "have
   * they all been seen" was a question the file had no way of answering. The
   * cycle answers it in two numbers, and what it buys beyond fairness is the
   * order — all of a topic's quotations, then everything else.
   *
   * Narrowed before the order is built, never inside it: `quotedOnly` decides
   * which tests are in the cycle at all, and a filter applied to the queue
   * afterwards would hand back a written test the moment the quoted ones ran
   * out — the one thing that preference promises cannot happen.
   */
  serveTest(sectionId: string, quotedOnly = false): Test | undefined {
    const tests = quotedOnly
      ? this.content.testsFor(sectionId).filter(isQuoted)
      : this.content.testsFor(sectionId);
    // Before the cycle is written, so a topic this cannot serve — and the walk
    // steps over hundreds of them — leaves nothing behind in the file.
    if (tests.length === 0) return undefined;
    const key = this.cycleKey(sectionId);
    const cycle = (this.p.testCycles[key] ??= { seed: randomSeed(), at: 0 });
    let queue = serveOrder(tests, cycle.seed, this.quotedFirst());
    // Checked before the serve rather than after it, so what a finished cycle
    // leaves on disk is the legible `at === queue.length` rather than a zero
    // that could equally mean "never served". The same branch catches a queue
    // that has grown shorter underneath it — the preference turned on, a book
    // switched to one whose section draws on more topics, or a regenerated
    // pack — where continuing would index past the end.
    if (cycle.at >= queue.length) {
      cycle.seed = nextSeed(cycle.seed);
      cycle.at = 0;
      queue = serveOrder(tests, cycle.seed, this.quotedFirst());
    }
    const test = queue[cycle.at]!;
    cycle.at += 1;
    return this.record(test);
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
    /*
     * The round is opened on the topic the test was written for, which is the
     * primary grammar's, and not on whatever section the student reached it
     * through. `sectionId` may name a further grammar's topic — one that draws
     * on two of the primary's — and grading that would file a card under an id
     * no question belongs to, invisibly, while the topic it was really about
     * stayed unscheduled.
     *
     * `viewedAs` keeps the section they were reading, so picking the round back
     * up puts them where they left off rather than in the other book.
     */
    const graded = test.sectionId || sectionId;
    this.p.openRound = {
      sectionId: graded,
      ...(graded === sectionId ? {} : { viewedAs: sectionId }),
      roundId: test.id,
      cardBefore: this.p.topicCards[graded] ?? null,
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
   * The test is found by id rather than served again: `serveTest` steps the
   * topic's cycle on, so re-calling it here would hand back the *next* test and
   * spend a place in the cycle on every reload.
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
    const attempt = this.content
      .primaryTopicsFor(sectionId)
      .flatMap((id) => this.p.attempts[id] ?? [])
      .find((a) => a.at === at);
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
    return [...this.attemptTrail(sectionId)].reverse();
  }

  /**
   * The same, narrowed to one question. The prompt is a question's identity —
   * it is what the student saw, and it is what the attempt recorded.
   */
  attemptsForQuestion(sectionId: string, prompt: string): Attempt[] {
    return this.attemptsFor(sectionId).filter((a) => a.prompt === prompt);
  }

  /**
   * Every question a section will ask, with its reference answer and its own
   * answer trail — the bank, not just what the scheduler has happened to serve.
   *
   * Narrowed by the preference, through the same `bank` that `coverage` and a
   * practice run read, so a topic cannot say one number here and another on the
   * index. This list is what a student reads *instead of* being tested, and a
   * deck that will ask twelve sentences and offers ninety to read through is
   * offering seventy-eight it has been asked not to ask. Nothing is lost by it:
   * the answers already written on the questions left out stay on the trail,
   * and come back with them when the preference goes off.
   */
  questionBank(sectionId: string): BankedQuestion[] {
    const byPrompt = new Map<string, Attempt[]>();
    for (const a of this.attemptsFor(sectionId)) {
      const kept = byPrompt.get(a.prompt);
      if (kept) kept.push(a);
      else byPrompt.set(a.prompt, [a]);
    }
    return this.bank(sectionId).map(({ testId, question }) => ({
      testId,
      prompt: question.prompt,
      answer: question.answer,
      note: question.note,
      source: question.source,
      attempts: byPrompt.get(question.prompt) ?? [],
    }));
  }

  /**
   * When each grade would bring a topic back. Self-grading is a judgement made
   * in the dark unless the four choices show what they cost; an untouched topic
   * previews against a fresh card, which is what grading it would create.
   *
   * Inside a round it has to preview what `gradeTopic` will actually do, which
   * is not what the stored card says: the card on disk has already been moved
   * by the round's earlier grades, and the next grade rewinds past it. So the
   * preview runs from `cardBefore` and floors each rating at the worst given so
   * far — the same two rules, or the buttons promise intervals the round can no
   * longer reach. Without a `roundId` it is the stored card, which is what a
   * verdict outside a round rates.
   */
  previewTopic(
    sectionId: string,
    now: Date = new Date(),
    roundId?: string,
  ): Record<Rating, Date> {
    const open = this.p.openRound;
    const continuing =
      roundId !== undefined &&
      open != null &&
      open.roundId === roundId &&
      open.sectionId === sectionId;

    const base = continuing ? open.cardBefore : (this.p.topicCards[sectionId] ?? null);
    const dates = preview(base ? deserializeCard(base) : newCard(now), now);
    if (!continuing || open.worst === null) return dates;

    const worst = open.worst;
    return {
      1: dates[1],
      2: dates[Math.min(worst, 2) as Rating],
      3: dates[Math.min(worst, 3) as Rating],
      4: dates[Math.min(worst, 4) as Rating],
    };
  }

  /**
   * The worst grade given in the round so far, or null outside one and before
   * its first grade. A UI reads this to say why its four buttons agree: once
   * `again` has been given the round is decided, and four identical intervals
   * look like a fault rather than the answer.
   */
  roundWorst(sectionId: string, roundId: string): Rating | null {
    const open = this.p.openRound;
    return open != null && open.roundId === roundId && open.sectionId === sectionId
      ? open.worst
      : null;
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
    const id = this.vocabIdFor(entry);
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

  /**
   * The card id a given entry would take, without creating one.
   *
   * The `v-` rule in one place, so a surface can ask "did I already have this
   * word" before recording it — which is the difference between *Saved* and
   * *another sentence on a word you already had*.
   */
  vocabIdFor(entry: LemmaEntry): string {
    return `v-${this.content.fold(entry.lemma)}`;
  }

  /** Every context on a card, in the student's own order. */
  vocabContexts(cardId: string): VocabContext[] {
    return this.p.vocabCards[cardId]?.contexts ?? [];
  }

  /** Whether a recorded word keeps the sentence it was met in. */
  keepsContext(): boolean {
    return this.p.keepContext !== false;
  }

  setKeepContext(on: boolean): void {
    this.p.keepContext = on;
    this.touch();
  }

  /**
   * Whether exploring is restricted to questions somebody wrote the answer to.
   *
   * Off unless turned on, so a deck that has never heard of this serves
   * everything — which is what it did before the preference existed.
   */
  quotedOnly(): boolean {
    return this.p.quotedOnly === true;
  }

  setQuotedOnly(on: boolean): void {
    this.p.quotedOnly = on;
    this.touch();
  }

  /**
   * Whether a topic's quoted questions all come before its written ones.
   *
   * On unless turned off, which is the other way round from `quotedOnly` and
   * deliberately so: this withholds nothing, and the half it puts first is the
   * half a student could otherwise study a topic for a week without meeting.
   */
  quotedFirst(): boolean {
    return this.p.quotedFirst !== false;
  }

  setQuotedFirst(on: boolean): void {
    this.p.quotedFirst = on;
    this.touch();
  }

  /**
   * Whether the section has any test at all, before the preference narrows it.
   *
   * The caller that passes a topic over needs to tell "nothing written for this
   * yet" from "nothing quoted for this yet". The first is a topic that cannot
   * be studied; the second is one this student has asked not to be shown, and
   * marking that one learned would be inventing a grade.
   */
  hasTests(sectionId: string): boolean {
    return this.content.testsFor(sectionId).length > 0;
  }

  /**
   * Offer a card the sentence its word was met in.
   *
   * Apart from `recordVocab` rather than an argument to it, because the two are
   * different questions with different answers: recording a word the student
   * already has is a no-op, and attaching a second sentence to that same word is
   * the whole point of this. `recordVocab` therefore keeps both its signature
   * and its promise never to rewrite a card that already exists — a second
   * recording that reset a corrected citation would be a silent one.
   *
   * The preference is checked here rather than at the call sites, so the phone
   * and the terminal cannot drift apart on it, and the outcome comes back so a
   * surface can say what actually happened instead of flashing a save.
   */
  addVocabContext(
    cardId: string,
    context: NewVocabContext,
    now: Date = new Date(),
  ): ContextOutcome {
    if (!this.keepsContext()) return "off";
    const card = this.p.vocabCards[cardId];
    if (!card) return "missing";
    const held = card.contexts ?? [];
    const key = contextKey(context, this.content.fold);
    if (held.some((c) => contextKey(c, this.content.fold) === key)) {
      return "duplicate";
    }
    if (held.length >= MAX_CONTEXTS) return "full";
    card.contexts = [...held, { ...context, at: this.freeStamp(held, now) }];
    this.touch();
    return "added";
  }

  /**
   * A timestamp no context on this card already carries.
   *
   * `at` is a context's identity — it is what a delete, an edit and a move all
   * name it by — so two sharing one would be one context that cannot be told
   * from another: deleting either would delete both. A hold gesture is
   * human-paced and will not collide, but nothing here is only ever driven by a
   * thumb: an import, a test, or two sentences attached in one turn all land in
   * the same millisecond. Nudged forward rather than made from a counter,
   * because the value still has to read as when the word was met.
   */
  private freeStamp(held: VocabContext[], now: Date): string {
    let at = now.getTime();
    const taken = new Set(held.map((c) => c.at));
    while (taken.has(new Date(at).toISOString())) at += 1;
    return new Date(at).toISOString();
  }

  /**
   * Correct one context's two texts.
   *
   * `source` is not patchable: rewriting the words of your own sentence does not
   * make it the reference, and the label is the only thing standing between a
   * card and quietly teaching back a mistake.
   */
  updateVocabContext(
    cardId: string,
    at: string,
    patch: Partial<Pick<VocabContext, "prompt" | "sentence">>,
  ): void {
    const context = this.p.vocabCards[cardId]?.contexts?.find((c) => c.at === at);
    if (!context) return;
    if (patch.prompt !== undefined) context.prompt = patch.prompt.trim();
    if (patch.sentence !== undefined) {
      // The picked-out word has to be found again in the rewritten sentence, or
      // the highlight would go on pointing at whatever word now sits in that
      // slot — which is worse than no highlight, because it looks deliberate.
      // The old sentence and the old index together are the word, right up
      // until the edit lands, so nothing needs to have been stored to do this.
      const held =
        context.index === undefined
          ? undefined
          : words(context.sentence)[context.index];
      context.sentence = patch.sentence.trim();
      if (held !== undefined) {
        const found = words(context.sentence).findIndex(
          (word) => this.content.fold(word) === this.content.fold(held),
        );
        if (found >= 0) context.index = found;
        else delete context.index;
      }
    }
    this.touch();
  }

  /** Forget one context. The card, and every other context on it, stay. */
  deleteVocabContext(cardId: string, at: string): void {
    const card = this.p.vocabCards[cardId];
    if (!card?.contexts) return;
    const left = card.contexts.filter((c) => c.at !== at);
    if (left.length === card.contexts.length) return;
    // Absent rather than empty, so a card cleared of contexts reads on disk
    // exactly like one that never had any.
    if (left.length === 0) delete card.contexts;
    else card.contexts = left;
    this.touch();
  }

  /**
   * Move one context one place towards the front (-1) or the back (1).
   *
   * A swap with its neighbour rather than a whole-order setter, because the
   * surface is a pair of buttons and a swap is exactly what a button press
   * knows. A setter would make every handler read the list, splice it and hand
   * back an array — and under a last-writer-wins sync, one device's whole order
   * would wipe the other's, where a swap at worst leaves a local disturbance.
   *
   * Clamped at the ends rather than wrapping: a button that teleports the top
   * row to the bottom is a bug report.
   */
  moveVocabContext(cardId: string, at: string, by: -1 | 1): void {
    const card = this.p.vocabCards[cardId];
    if (!card?.contexts) return;
    const from = card.contexts.findIndex((c) => c.at === at);
    const to = from + by;
    if (from < 0 || to < 0 || to >= card.contexts.length) return;
    const moved = [...card.contexts];
    [moved[from], moved[to]] = [moved[to]!, moved[from]!];
    card.contexts = moved;
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
   *
   * `answered` and `questions` come from `coverage`, so they say what exploring
   * will ask of this topic rather than what was ever written for it.
   * `hasTests` deliberately does not: it is "was anything written here at all",
   * which is what tells a topic nothing has been written for from one this
   * student has asked not to be shown. The caller wanting the second reads
   * `hasTests && questions === 0`, and the two absences are not the same thing
   * to say to a student.
   */
  grammarMap(now: Date = new Date()): TopicProgress[] {
    const cursor = this.bookCursor();
    return this.content.sections(this.grammarId).map((s) => {
      /*
       * A section of a further grammar reads the progress of the primary topics
       * it teaches, because those are what carry the questions. Usually one; two
       * where the books divide differently, and then the mastery shown is the
       * mean weighted by how much bank each side contributes, so a topic is not
       * reported finished on the strength of its smaller half.
       */
      const primary = this.content.primaryTopicsFor(s.id);
      const cards = primary
        .map((id) => this.p.topicCards[id])
        .filter((c): c is SerializedCard => Boolean(c));
      /*
       * Averaged over every topic it teaches, not only the ones that have been
       * graded — an ungraded one counts as the bottom of the scale, which is
       * what it is. Averaging the graded alone reported a section finished on
       * the strength of its answered half, while `mastered` went on saying it
       * was not, and the map and the cursor disagreed on screen.
       *
       * Undefined only when none of them has been graded, which is what tells a
       * topic never started from one going badly.
       */
      const scored = primary.some((id) => this.p.topicMastery[id] !== undefined);
      const weight = (id: string) => this.content.testsFor(id).length || 1;
      const total = primary.reduce((n, id) => n + weight(id), 0);
      const mastery = scored
        ? primary.reduce(
            (n, id) => n + (this.p.topicMastery[id] ?? MASTERY_MIN) * weight(id),
            0,
          ) / total
        : undefined;
      const { answered, total: questions } = this.coverage(s.id);
      return {
        sectionId: s.id,
        title: s.title,
        ref: s.ref,
        order: s.order,
        family: this.content.familyOf(s.family, this.grammarId),
        mastery,
        hasTests: this.content.testsFor(s.id).length > 0,
        due: cards.some((c) => isDue(deserializeCard(c), now)),
        answered,
        questions,
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
    // Standing preferences are not part of what an undo takes back. A snapshot
    // is taken before a grade and restored after it, and a student who changed
    // a setting in between would otherwise watch the undo silently change it
    // back — an undo that reaches past the thing it was offered for.
    //
    // `testCycles` is not one of those and goes back with the rest: the place a
    // topic had reached in its order is part of what the undone round did, so
    // an undone serve should genuinely un-serve, handing the same test back.
    const keepContext = this.p.keepContext;
    const quotedOnly = this.p.quotedOnly;
    const quotedFirst = this.p.quotedFirst;
    this.p = structuredClone(snapshot);
    this.p.keepContext = keepContext;
    this.p.quotedOnly = quotedOnly;
    this.p.quotedFirst = quotedFirst;
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

  /**
   * Note that a test has been handed over, and hand it over.
   *
   * Filed under the test's own section, which is the primary topic whichever
   * book named the section it was served for — the same key `seenTrail` reads
   * back, so a test met through one grammar is not fresh through the other.
   *
   * Both paths call this, so a test a review has just served is still not the
   * one a practice run reaches for next — which is what the shared memory
   * bought when it was also the rotation, and is worth keeping now that it is
   * only a tie-break.
   */
  private record(test: Test): Test {
    const key = test.sectionId;
    const seen = this.p.seenTests[key] ?? [];
    this.p.seenTests[key] = [...seen, test.id].slice(-SEEN_HISTORY);
    this.touch();
    return test;
  }

}
