import { Content } from "./content.js";
import { type FamilyId } from "./families.js";
import { repairProgress } from "./repair.js";
import { VocabDeck, type ContextOutcome } from "./vocab.js";
import { SentenceDeck, type KeepOutcome } from "./sentences.js";
// Re-exported from here because this is where they used to live, and a caller
// importing them by their old path should not have to know they moved.
export { MAX_CONTEXTS, type ContextOutcome } from "./vocab.js";
export { type KeepOutcome } from "./sentences.js";
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
  type CardMarks,
  type LegacyProgress,
  type LemmaEntry,
  type Mode,
  type NewVocabContext,
  type PractiseRun,
  type Progress,
  type Question,
  type QuestionSource,
  type RoundDraft,
  type ResumableRound,
  type RoundVia,
  type OpenRound,
  type SentenceCardState,
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

export type Action =
  | { kind: "topic-review"; sectionId: string }
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
  /** A sentence the student kept, come round again. */
  | { kind: "sentence-review"; cardId: string }
  | { kind: "done" };

/** One grammar section as the index and the topic sheet see it. */
export interface TopicProgress {
  sectionId: string;
  title: string;
  ref: string;
  order: number;
  family: FamilyId;
  hasTests: boolean;
  /**
   * The book has no exercise on this page — see `GrammarSection.readingOnly`.
   * A third absence, distinct from the two `hasTests` tells apart: a topic
   * nothing has been written for *yet* is a gap somebody should close, and this
   * one is the book being what it is.
   */
  readingOnly: boolean;
  due: boolean;
  /**
   * In the review pile at all — it carries a card, whether or not that card is
   * due yet. What `enrolTopic` puts there and `dismissTopic` takes away.
   *
   * Deliberately not `due`. The two only agree on a topic waiting right now,
   * and the interesting case is the other one: a topic scheduled for next month
   * is in the pile, and a `due`-shaped answer would say it was not.
   *
   * No screen draws it at the moment — the dismissal that used to read it is on
   * the graded screen now, which knows it is on a review without asking. It
   * stays because it is the engine's one answer to "is this topic in the pile",
   * which is a question about a topic rather than about a screen.
   */
  scheduled: boolean;
  /** Questions of this topic's bank that have been answered at least once. */
  answered: number;
  /** How many the bank holds — no one round ever exhausts it. */
  questions: number;
  /**
   * The student marked this one to come back to. The one fact on a topic that
   * is not derived from the record of study.
   */
  starred: boolean;
  /**
   * The student took this one off the die — see `Progress.noRoll`.
   *
   * The second fact here that is not derived from the record of study, and the
   * mirror of `starred`: one says come back to this, the other says stop
   * offering me this at random. Neither touches the review pile.
   */
  noRoll: boolean;
  /**
   * How many times this topic has been failed outright — FSRS's own `lapses`,
   * summed over the topics a section teaches.
   *
   * It has been serialized and deserialized since the scheduler was written and
   * read by nothing, so a topic failed twenty times just kept coming back at
   * short intervals with no sign anywhere that it was the one going badly. That
   * matters more here than in an app that grades you: nothing else notices.
   *
   * A count, not a verdict, and it stays one. The app does not suspend a topic
   * on the student's behalf, because a topic taken out of the rotation for its
   * own good is a decision made for somebody, which is not how anything else
   * here behaves. What the student may do is take it out themselves —
   * `dismissTopic` — and this is the number that tells them there is something
   * to decide.
   */
  lapses: number;
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
}

/** One thing the scheduler will ask for, and when. */
export interface ScheduleEntry {
  kind: "topic" | "vocab" | "sentence";
  /** Section id, or vocabulary card id, or sentence card id. */
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

const ROUND_VIA: readonly RoundVia[] = ["review", "new", "drill"];

/**
 * Whether a saved round says something this version still understands, and what
 * it says. Written against the values rather than the type so a `via` that has
 * since been retired — "quiz" — is caught rather than trusted.
 *
 * `"sweep"` is the one retired value that is *translated* rather than rejected.
 * It meant the book's walk coming back round to a topic already graded, and
 * files written before the walk was removed carry rounds stamped with it. Such
 * a round is a run of practice on one topic, which is what `"drill"` is; read
 * as unknown it would fall back to `"review"` and the badge would call a
 * practice round a review it never was.
 */
function readRoundVia(via: unknown): RoundVia | null {
  if (via === "sweep") return "drill";
  return ROUND_VIA.find((v) => v === via) ?? null;
}

/**
 * Which errand a round belongs to, and so which slot it is put down in.
 *
 * `RoundVia` has three values where `Mode` has two, because `via` says what the
 * round is *shown as* — a topic met for the first time carries a badge a repeat
 * drill does not — while the errand says which pile it came out of. Reviewing
 * is reviewing; everything else is somebody having chosen a topic, which is
 * exploring.
 *
 * Written down once because the app was already asking this question by hand,
 * spelled `(open.via === "review") === (mode === "review")` on the launch path,
 * and a second copy of it is how the two would come to disagree about where a
 * round had been put.
 */
export function errandOf(via: RoundVia): Mode {
  return via === "review" ? "review" : "explore";
}

/**
 * The runtime session engine. Holds the student's Progress and, given the
 * frozen Content, decides what to do next and applies self-grades — all
 * deterministic, no LLM. Ported from the reference `session.py` state machine
 * with the LLM's exercise/grading jobs removed.
 */
/** Which of these cards are due — the count behind the badge. */
function dueAmong(cards: readonly [string, SerializedCard][], now: Date): string[] {
  return cards.filter(([, c]) => isDue(deserializeCard(c), now)).map(([id]) => id);
}

/**
 * The one that has been waiting longest, or null if none is due.
 *
 * This used to be written twice, and both copies carried a `skip` set that no
 * caller ever passed — documented as "what an explore run is holding", from a
 * design that went another way. A parameter nothing supplies is a branch nothing
 * exercises.
 */
function earliestDue(
  cards: readonly [string, SerializedCard][],
  now: Date,
): string | null {
  let best: string | null = null;
  let bestDue = Infinity;
  for (const [id, serialized] of cards) {
    const card = deserializeCard(serialized);
    if (isDue(card, now) && card.due.getTime() < bestDue) {
      bestDue = card.due.getTime();
      best = id;
    }
  }
  return best;
}

export class Session {
  private p: Progress;

  /**
   * Fields of the stored file that were not the shape they claimed and were put
   * back to their defaults. Empty for every ordinary file. See `repair.ts`.
   */
  readonly repaired: readonly string[];

  /**
   * Bumped by `touch()`, which every mutation goes through. What `grammarMap`
   * caches against, so a run of reads between two grades computes once.
   */
  private revision = 0;

  /**
   * The vocabulary half, lifted out. See `vocab.ts`.
   *
   * `() => this.p` rather than `this.p.vocabCards`: `restore()` replaces the
   * whole progress object for an undo, and a deck holding the old record would
   * go on writing to what the undo threw away.
   */
  private readonly deck: VocabDeck;
  /**
   * The sentences the student kept, lifted out the same way. See `sentences.ts`.
   *
   * A third store of cards rather than a second kind of vocabulary card: a
   * vocabulary card is a dictionary entry and is shaped like one, and a kept
   * sentence has no lemma, no citation and no part of speech to put in those
   * fields.
   */
  private readonly sentences: SentenceDeck;
  private mapCache: {
    revision: number;
    grammarId: string;
    second: number;
    map: TopicProgress[];
  } | null = null;

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
    /*
     * Repaired before anything reads it. The adapters all end in
     * `JSON.parse(...) as Progress`, and the cast is a claim nobody checks — a
     * file with `topicCards: null` satisfies the compiler and crashes on the
     * first `Object.entries` in `next()`. See `repair.ts`; what it found is on
     * `this.repaired` for a caller that wants to say so.
     */
    const fixed = repairProgress(
      progress ?? emptyProgress(content.profile.citationsVersion),
      content.profile.citationsVersion,
    );
    this.p = fixed.progress;
    this.repaired = fixed.repaired;
    this.deck = new VocabDeck(
      () => this.p,
      this.content.fold,
      (lemma) => this.content.lookup(lemma),
      this.citationsVersion,
      () => this.touch(),
    );
    this.sentences = new SentenceDeck(
      () => this.p,
      () => this.touch(),
    );
    // A file written before the answer trail existed simply has none; there is
    // no migration layer, so default it here. Same for the citation generation.
    this.p.attempts ??= {};
    // A file written before topics were served in cycles has none. Absent means
    // "nothing has been served here yet", which is the honest reading of a file
    // that predates the field: the first serve on each topic draws a seed and
    // opens on the quotations, which is where a returning student would want to
    // be put anyway.
    this.p.testCycles ??= {};
    // A file written before sentences could be kept has no deck to keep them
    // in. Absent means empty, which is what every such file means.
    this.p.sentenceCards ??= {};
    this.p.citationsVersion ??= 1;
    this.p.openRound ??= null;
    this.p.practise ??= null;
    this.migrate();
    // A round stored before it recorded where the student was in it. There is
    // nowhere to resume such a round to, and the only job it had — holding the
    // card at one rep — it has already finished doing.
    if (this.p.openRound && !("answered" in this.p.openRound)) {
      this.p.openRound = null;
    }
    // The same guard on the rounds put down, for the same reason: there is
    // nowhere to resume such a round to, and the one job it had — holding the
    // card at one rep — it has already finished doing.
    for (const mode of ["review", "explore"] as const) {
      const parked = this.p.suspended?.[mode];
      if (parked && !("answered" in parked)) delete this.p.suspended![mode];
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

    delete old.placement;
    delete old.placementDone;
    // Which errand you are on resets with every launch; a file cannot say.
    delete old.exploring;
    delete old.focus;
    delete old.frontiers;

    /*
     * The three fields the walk through the book was made of, and the score
     * that placed it. All dropped rather than folded, because there is nothing
     * left for them to fold into — see `LegacyProgress`.
     *
     * `knownSections` is the one worth a word. It was a claim the student made
     * about themselves at placement, and it folded into mastery at the top
     * band, which kept the cursor off those sections. Nothing skips sections
     * now — the student names the topic — so the claim has no work to do, and
     * the only trace of it is that such a topic teaches itself once more the
     * first time it is practised, since `everGraded` reads the answer trail and
     * a placement claim left no answers on it.
     */
    delete old.knownSections;
    delete old.topicMastery;
    delete old.bookAt;
    delete old.bookAtByGrammar;

    // "Quiz me" is gone, and so is the book's sweep. A round either opened is
    // still four sentences on a topic, and what it was shown as is the honest
    // answer — the same reading a round written before `via` existed gets.
    //
    // The rounds put down take it too, and they need it more: `errandOf` reads
    // `via` to decide which slot a round belongs in, so one left unreadable
    // would be filed by a fallback rather than by what it was.
    for (const round of [
      this.p.openRound,
      this.p.suspended?.review,
      this.p.suspended?.explore,
    ]) {
      if (round) {
        round.via = readRoundVia(round.via) ?? (round.isNew ? "new" : "review");
      }
    }
  }

  // --- what studying is doing ----------------------------------------------

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
   * cards, the stars and the answers stay filed under the primary's topics,
   * and this changes only which book's topics are drawn over them.
   */
  setGrammar(id: string): void {
    if (!this.content.grammarIds().includes(id)) return;
    this.p.grammarId = id;
    this.touch();
  }

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

  /**
   * Whether this topic has ever been answered. What tells a genuinely new topic
   * from one being come back to, which is the difference between teaching
   * before testing and simply asking.
   *
   * Read off the answer trail rather than off the topic's card, and the
   * difference now matters twice over. `dismissTopic` deletes the card: keyed
   * on it, a topic taken out of the review pile would come back as though it
   * had never been studied and teach itself from the top the next time it was
   * practised — the opposite of what dismissing it said. And a topic can be
   * worked through without ever being enrolled at all, so the card is not even
   * written for the topics somebody has spent the most time exploring. The
   * trail is uncapped and nothing deletes it.
   */
  everGraded(sectionId: string): boolean {
    return this.attemptTrail(sectionId).length > 0;
  }

  /**
   * Mark a topic to come back to, or unmark it.
   *
   * Filed under the primary topics the section teaches, like every other fact
   * about a topic here, so a star survives a book switch and a section of a
   * further grammar that teaches two of the primary's stars both — the lockstep
   * `grammars.test.ts` asserts for the rest of progress.
   *
   * A section the crosswalk does not reach has no primary topic to file under
   * and cannot be starred. That is the same silence as its having no questions:
   * there is nothing there to come back to.
   */
  star(sectionId: string): void {
    const ids = this.content.primaryTopicsFor(sectionId);
    const starred = this.p.starred ?? [];
    const added = ids.filter((id) => !starred.includes(id));
    if (added.length === 0) return;
    this.p.starred = [...starred, ...added];
    this.touch();
  }

  unstar(sectionId: string): void {
    const ids = new Set(this.content.primaryTopicsFor(sectionId));
    const starred = this.p.starred ?? [];
    const left = starred.filter((id) => !ids.has(id));
    if (left.length === starred.length) return;
    this.p.starred = left;
    this.touch();
  }

  /**
   * Whether the star is on. Any of the section's primary topics, matching
   * `star`, which sets them all: the two only disagree on a file where one of
   * them was starred through a book that teaches them separately.
   */
  isStarred(sectionId: string): boolean {
    const starred = this.p.starred;
    if (!starred || starred.length === 0) return false;
    return this.content
      .primaryTopicsFor(sectionId)
      .some((id) => starred.includes(id));
  }

  /**
   * Take a topic off the die, or put it back.
   *
   * `star` and `unstar` in every respect — the same fan-out over
   * `primaryTopicsFor`, the same absent-field-means-empty — because it is the
   * same kind of fact: something the student said about a topic that nothing
   * could work out for them. What it is *not* is a dismissal. The review pile is
   * untouched, the index still lists it, and practising it by hand still works;
   * the only thing this decides is whether `rollTopic` may hand it over.
   *
   * A section the crosswalk does not reach has no primary topic to file under
   * and cannot be excluded — the same silence as its having no questions, and
   * the die would never roll it either.
   */
  excludeFromRoll(sectionId: string): void {
    const ids = this.content.primaryTopicsFor(sectionId);
    const off = this.p.noRoll ?? [];
    const added = ids.filter((id) => !off.includes(id));
    if (added.length === 0) return;
    this.p.noRoll = [...off, ...added];
    this.touch();
  }

  allowInRoll(sectionId: string): void {
    const ids = new Set(this.content.primaryTopicsFor(sectionId));
    const off = this.p.noRoll ?? [];
    const left = off.filter((id) => !ids.has(id));
    if (left.length === off.length) return;
    this.p.noRoll = left;
    this.touch();
  }

  /**
   * Whether the die skips this one. Any of the section's primary topics, to
   * match `excludeFromRoll`, which sets them all — the reading `isStarred` takes
   * for the same reason.
   */
  isExcludedFromRoll(sectionId: string): boolean {
    const off = this.p.noRoll;
    if (!off || off.length === 0) return false;
    return this.content
      .primaryTopicsFor(sectionId)
      .some((id) => off.includes(id));
  }

  /**
   * A topic to study, chosen for the student.
   *
   * Picking one is the whole of how a run begins — see "One way forward" in
   * `README.md` — and that is right when there is a topic in mind and a burden
   * when there is not. So the die: one tap and the app has chosen, and choosing
   * badly costs one more tap.
   *
   * **Weighted by how little of the topic has been answered**, and only a
   * little. The weight is `1/sqrt(1 + answered)`, so a topic nobody has touched
   * is five times as likely as one twenty-four questions in rather than
   * twenty-five times: the point is a nudge towards the unopened parts of the
   * book, not a rule that the die may never revisit anything. Answers, not
   * grades — how well a topic went is the student's business and the app keeps
   * no figure for it.
   *
   * `questions` is already narrowed by the `quotedOnly` preference (see
   * `bank`), so a preference that leaves a topic with nothing to serve also
   * takes it off the die. Handing over a run that opens on "practised all 0"
   * would be a roll that wasted the tap.
   *
   * `avoid` is whatever is on screen already: rolling the topic you are on is a
   * die that did nothing, and the one case where it is the honest answer — it is
   * the only candidate left — is allowed through.
   *
   * `null` when nothing is eligible at all, so a caller can say so rather than
   * pretend.
   */
  rollTopic(
    rng: () => number = Math.random,
    now: Date = new Date(),
    avoid?: string,
  ): TopicProgress | null {
    const eligible = this.grammarMap(now).filter(
      (t) => t.questions > 0 && !t.readingOnly && !t.noRoll,
    );
    const pool =
      avoid !== undefined && eligible.some((t) => t.sectionId !== avoid)
        ? eligible.filter((t) => t.sectionId !== avoid)
        : eligible;
    if (pool.length === 0) return null;
    const weights = pool.map((t) => 1 / Math.sqrt(1 + t.answered));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let cut = rng() * total;
    for (let i = 0; i < pool.length; i += 1) {
      cut -= weights[i]!;
      // `<= 0` rather than `< 0`, so an rng that returns exactly 0 lands on the
      // first candidate instead of falling out of the loop.
      if (cut <= 0) return pool[i]!;
    }
    // Only reachable on floating-point drift in the sum; the last candidate is
    // the one the cut was heading for.
    return pool[pool.length - 1]!;
  }

  /**
   * Take a topic out of the review pile.
   *
   * The way back from a topic that keeps coming due and is not what the student
   * needs — the same way back `deleteVocab` is for a word saved by a stray
   * press, and it deletes the same kind of thing: the scheduling card, and only
   * that. The answer trail stays, the star stays, the questions were never the
   * student's to delete.
   *
   * Nothing is hidden by it and nothing is suspended. The topic is on the index
   * as it always was, and practising it *offers* to put it back when the round
   * lands — which is the difference between this and a suspension: it is a
   * decision the student made about their own pile, and one tap undoes it.
   *
   * It used to be undone by the next grade, silently, which sat badly with
   * calling it the student's decision: a dismissal survived exactly until they
   * next answered a question on the topic. A dismissed topic is now an
   * unenrolled one like any other, and the only way back in is `enrolTopic`.
   *
   * The open round goes with the card. `gradeTopic` rebuilds a topic's card
   * from `cardBefore` on every grade of a round, so a dismissal taken mid-round
   * would be undone silently by the round's next answer.
   */
  dismissTopic(sectionId: string): void {
    const ids = this.content.primaryTopicsFor(sectionId);
    let dropped = false;
    for (const id of ids) {
      if (this.p.topicCards[id] === undefined) continue;
      delete this.p.topicCards[id];
      dropped = true;
    }
    const open = this.p.openRound;
    if (open && ids.includes(open.sectionId)) {
      this.p.openRound = null;
      dropped = true;
    }
    // And any round put down on it, which is the same hazard with a longer
    // fuse: a dismissal is undone by the next grade of any round still holding
    // the topic's old card, and one waiting in a slot can be picked up next
    // week rather than in the next minute.
    if (this.unparkTopics(ids)) dropped = true;
    if (dropped) this.touch();
  }

  /**
   * Put a topic into the review pile, because the student said so.
   *
   * `dismissTopic` read backwards, and the only thing that writes a card for a
   * topic that has none. Answering questions does not: a student turning the
   * pages of a grammar and trying what is on them would otherwise collect a
   * card per topic looked at, and a pile that grows by being curious is a
   * reason to stop being curious.
   *
   * Rated at the round's own worst grade rather than at a neutral one, so the
   * card the student gets is the card the grade they gave has already been
   * shown to buy — under the grade button when they pressed it, and on the
   * screen that made this offer. A topic enrolled with no round behind it takes
   * the 3 that `enrolRating` falls back to.
   *
   * Files under every primary topic the section teaches, like `star` and
   * `dismissTopic`: a further grammar's section that teaches two of the
   * primary's enrols both, which is the lockstep `grammars.test.ts` asserts.
   * A section the crosswalk does not reach enrols nothing — the same silence
   * as its having no questions.
   *
   * Idempotent, and deliberately so: a topic that already has a card keeps it
   * untouched rather than being reset to a fresh one. That is what makes this
   * safe to offer to somebody who is already reviewing the topic, and it is
   * what grandfathers every card written before this existed.
   */
  enrolTopic(sectionId: string, rating?: Rating, now: Date = new Date()): void {
    const worst = rating ?? this.enrolRating(sectionId);
    const ids = this.content.primaryTopicsFor(sectionId);
    let added = false;
    for (const id of ids) {
      if (this.p.topicCards[id] !== undefined) continue;
      this.p.topicCards[id] = serializeCard(rate(newCard(now), worst, now));
      this.p.newTopicsIntroduced += 1;
      added = true;
    }
    // A card where there was none is the card moving, so a round put down on
    // this topic goes: its `cardBefore` is the absence, and resuming it would
    // rewind the card just enrolled to a fresh one. See `unparkTopics`.
    if (this.unparkTopics(ids)) added = true;
    if (added) this.touch();
  }

  /** Whether this topic is in the review pile at all. */
  isScheduled(sectionId: string): boolean {
    return this.content
      .primaryTopicsFor(sectionId)
      .some((id) => this.p.topicCards[id] !== undefined);
  }

  /**
   * Stay on this topic and work a fresh run of its questions out.
   *
   * **Fresh**, and that word decides what happens to the round put down under
   * exploring. A run asks the topic's whole bank again — asking again is asking
   * for the whole thing a second time — so a new run is not something the old
   * one's half-finished round should survive, whether or not the topic is the
   * same one.
   *
   * It has to be dropped *here* rather than left to the loop, because of the
   * order the two run in: choosing a topic writes the run and *then* moves the
   * loop on, and moving on is what puts a round down. Judged later, the old
   * round would be parked after the new run had already been written and picked
   * straight back up — the topic just chosen would never be served, which from
   * outside is a button that does nothing.
   *
   * What is deliberately *not* touched is a round put down under **reviewing**.
   * That is the whole of the die: it leaves a review to start a run, and the
   * review it left is still waiting when the switch is thrown back.
   *
   * Nor is the round *in flight* touched, though a new run does end one. That
   * is the loop's to do and it does it a line later — this records the run, and
   * a caller that only wants a run recorded (a test setting a scene, a screen
   * arriving on a topic) must not lose a stored round by saying so.
   */
  drillTopic(sectionId: string, now: Date = new Date()): void {
    this.p.practise = { sectionId, since: now.toISOString() };
    if (this.p.suspended?.explore) delete this.p.suspended.explore;
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
   * A first run is the questions the rounds so far never reached; once
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
      const dueVocab = earliestDue(this.vocabCardList(), now);
      if (dueVocab) return { kind: "vocab-review", cardId: dueVocab };
      /*
       * Then the sentences, and the rung is the one the paragraph above argues
       * for rather than a new claim. A kept sentence is a card: it is answered
       * in about the time a word takes and nothing like the time a round of
       * four takes, and put behind the grammar it would be the thing that
       * misses its review when a session is cut short — which is most of them,
       * on a phone. Words still lead it, being quicker again.
       */
      const dueSentence = earliestDue(this.sentenceCardList(), now);
      if (dueSentence) return { kind: "sentence-review", cardId: dueSentence };
      const dueTopic = earliestDue(this.topicCardList(), now);
      if (dueTopic) return { kind: "topic-review", sectionId: dueTopic };
      return { kind: "done" };
    }

    // Nothing chosen is nothing to do. This used to fall through to a cursor
    // walking the book, so the app always had a next section to hand over and
    // a student always had somewhere to be put; what they did not have was a
    // say in it. `done` here is the screen that asks for a topic.
    const run = this.practiseRun();
    if (!run) return { kind: "done" };
    return this.practiceLeft(run) > 0
      ? { kind: "drill", sectionId: run.sectionId }
      : { kind: "practised", sectionId: run.sectionId };
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
    // Before the cycle is written, so a topic this cannot serve leaves nothing
    // behind in the file.
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

  /**
   * Hand over the next test for a topic whose card has come due.
   *
   * The quoted-only preference reaches this as it reaches exploring, with one
   * floor under it: a topic holding no quotation is served out of its whole
   * cycle rather than served nothing. The two errands can afford opposite
   * answers because stepping over costs them different things. A topic the
   * walk steps over is still waiting — it comes back when the preference goes
   * off, and nothing about it is lost meanwhile. A review that stepped over
   * one would leave the card due, and due is not a state that clears itself:
   * `next` would name that topic again on the next turn and every turn after,
   * with the pile never going down.
   *
   * So the narrowed call is asked first and is allowed to decline. It declines
   * before it writes anything — an empty filtered list returns above the cycle
   * — so the fallback takes the cycle up exactly where it stood, and a topic
   * with nothing quoted rotates as though the preference had never been on.
   */
  serveReview(sectionId: string): Test | undefined {
    if (this.quotedOnly()) {
      const quoted = this.serveTest(sectionId, true);
      if (quoted) return quoted;
    }
    return this.serveTest(sectionId);
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
    /*
     * Which questions the round holds, written down rather than worked out
     * again later.
     *
     * `record` narrowed the test on the way out and this reaches the same
     * answer from the same trail a moment later — but only this once. As the
     * round is answered the trail fills up underneath it, so a window derived
     * afresh on the next launch would name the questions that are *still*
     * unanswered and hand back a round the student is already halfway through
     * as though it were a new one.
     *
     * Absent when the round is the whole test, which is every round a deck with
     * no cap serves and every round in every file written before there was one.
     */
    const full =
      this.content.testsFor(sectionId).find((t) => t.id === test.id) ?? test;
    const window = this.roundWindow(full);
    // A fresh round on the topic takes the place of anything put down on it.
    // Two rounds holding one topic's card is the stale park `unparkTopics`
    // exists to prevent: whichever was resumed second would rewind the card
    // past the other one's rep.
    this.unparkTopics(this.content.primaryTopicsFor(graded));
    this.p.openRound = {
      sectionId: graded,
      ...(graded === sectionId ? {} : { viewedAs: sectionId }),
      roundId: test.id,
      ...(window.length === full.questions.length ? {} : { questions: window }),
      cardBefore: this.p.topicCards[graded] ?? null,
      worst: null,
      answered: 0,
      isNew,
      via,
    };
    this.touch();
  }

  /**
   * The round's own copy of a test, and how long the round is.
   *
   * One place, because `landedRound` and `resumableRound` ask the same two
   * questions of the same stored window and disagreeing about the answer would
   * mean a round that can neither finish nor be picked back up.
   *
   * Null where the window names a question the bundle no longer holds. A pack
   * can be regenerated under a student mid-round, and a window pointing past
   * the end of a shortened test is the same situation as a round naming a test
   * that has gone: the answer is the scheduler, not a crash.
   */
  private roundOf(open: OpenRound, test: Test): Test | null {
    if (!open.questions) return test;
    const kept = open.questions.filter((i) => i < test.questions.length);
    if (kept.length !== open.questions.length) return null;
    return this.narrow(test, kept);
  }

  /** Let go of the round: its last question is graded, or study moved on. */
  endRound(): void {
    if (!this.p.openRound) return;
    this.p.openRound = null;
    this.touch();
  }

  /**
   * Put the round in flight down under its errand, rather than throw it away.
   *
   * What leaving a round costs, and it used to cost the round. Every way out
   * ran through `endRound`, so the die — which leaves a review and starts a run
   * in one tap — took the review's place with it, and coming back served a
   * different test of a different topic. The card was never what was lost: it
   * is at one rep either way, which is the whole reason the round is the unit.
   * The place was.
   *
   * **A finished round is ended rather than put down.** Which of the two this
   * is, is the round's own answer and not the caller's — `roundBack` is asked
   * here exactly as `resumableRound` asks it — so every way out of a round gets
   * the right verdict without each of them having to work it out. It is what
   * keeps the landing intact: a round graded out is left on file for
   * `landedRound` to make its offer from, and a slot holding one would sit
   * there for ever in front of the next round put down.
   *
   * A round naming a test this bundle has stopped carrying is not resumable
   * either, so it is not put down — the same answer, for the same reason.
   */
  suspendRound(): void {
    const open = this.p.openRound;
    if (!open) return;
    if (!this.roundBack(open)) {
      this.endRound();
      return;
    }
    (this.p.suspended ??= {})[errandOf(open.via ?? (open.isNew ? "new" : "review"))] =
      open;
    this.p.openRound = null;
    this.touch();
  }

  /**
   * Take the round an errand put down and put it back in flight.
   *
   * It **moves**, which is the half that matters: a round read out of its slot
   * and merely drawn would take its grades nowhere, because `gradeTopic` writes
   * to `openRound` and to nothing else.
   *
   * Every caller has already let go of whatever was in flight, so `openRound`
   * is null by the time this is asked. Said here rather than assumed, because a
   * caller that had not would drop the round in flight without a word.
   *
   * A round that cannot be picked up is dropped rather than left: a slot
   * holding one would stand in front of the next round put down, for ever.
   */
  resumeRound(mode: Mode): ResumableRound | null {
    if (!this.p.suspended?.[mode]) return null;
    const parked = this.pickUpFrom(mode);
    const back = this.roundBack(parked);
    // Taken out of the slot either way. A round that cannot be picked up would
    // otherwise stand in front of the next one put down, for ever.
    delete this.p.suspended[mode];
    if (back) this.p.openRound = parked;
    this.touch();
    return back;
  }

  /**
   * The round an errand is holding, if it is still one worth having.
   *
   * One verdict, because `parkedRound` draws a switch off it and `resumeRound`
   * acts on it: a switch offered over a round that then declined itself is a
   * tap that does nothing, and the two disagreeing is the fault `roundBack` is
   * written to prevent one level down.
   *
   * Deliberately does not mutate. Drawing a button must not spend a round.
   */
  private pickUpFrom(mode: Mode): OpenRound | null {
    return this.p.suspended?.[mode] ?? null;
  }

  /**
   * Drop any round put down on these topics, whichever errand holds it.
   *
   * The rule that makes a round put down safe to pick back up: **at most one
   * round per topic, anywhere.** A round holds `cardBefore` and every grade in
   * it rewinds the topic's card to that and re-rates it, which is a lock on the
   * card for as long as the round exists. A round in flight holds that lock for
   * a minute; one put down can hold it for a week, and anything that moved the
   * card in between would be silently rewound the moment it was picked up.
   *
   * So rather than detect a stale round on the way back in, the three things
   * that move a topic's card — a fresh round on it, enrolling it, dismissing it
   * — each drop what was put down. The situation is prevented rather than
   * caught, which is why no card is stamped here and no comparison is made.
   */
  private unparkTopics(ids: readonly string[]): boolean {
    let dropped = false;
    for (const mode of ["review", "explore"] as const) {
      const parked = this.p.suspended?.[mode];
      if (parked && ids.includes(parked.sectionId)) {
        delete this.p.suspended![mode];
        dropped = true;
      }
    }
    return dropped;
  }

  /**
   * The round that has just been worked out, as the screen landing on it reads
   * it. Null when no round is in flight, and null while one still has questions
   * to give.
   *
   * Symmetric with `resumableRound` — the same lookup, on the other side of the
   * same line. What that one is for is putting an unfinished round back; this
   * is for the moment a finished one is stood still in.
   *
   * The one fact that has to agree with `gradeTopic`'s and `enrolTopic`'s own
   * arithmetic: when the topic comes back. A screen assembling that out of
   * `progress()` would drift the first time the scheduler moved, and would
   * drift in two apps rather than in one.
   *
   * For a topic already in the pile that is the card's own `due`. For one that
   * is not, it is what enrolling *would* buy — the same `worst` the round has
   * been accumulating, applied to a fresh card — because the screen has to
   * quote a number before the student decides, and quoting a different one
   * afterwards is the lie the grade-button labels are built to avoid. The two
   * differ only by the seconds between reading this and tapping the button.
   *
   * Deliberately silent about how the round was graded. What belongs on that
   * screen is which topic was worked on and when it returns; the grades are the
   * schedule's business and are already spent on the card. Adding them up is
   * how four self-assessments turn into a score.
   *
   * Null outside a round is the whole of the rule that keeps this off a
   * vocabulary card and off the pass-over grade a topic with no tests takes:
   * neither opens one, so neither has anything to land on. Written as a
   * condition rather than as a list of what to exclude, so the next kind of
   * single-question grade needs no line here.
   */
  landedRound(now: Date = new Date()): {
    sectionId: string;
    /** The section it was being read in, when that is another book's. */
    viewedAs?: string;
    /** When the topic comes back — from its card, or from the offer. */
    due: Date;
    /** Whether that date is on disk, or only what enrolling would buy. */
    scheduled: boolean;
    /** Authors this round introduced, in the order they were met. */
    met: string[];
  } | null {
    const open = this.p.openRound;
    if (!open) return null;
    const test = this.content
      .testsFor(open.sectionId)
      .find((t) => t.id === open.roundId);
    if (!test) return null;
    const round = this.roundOf(open, test);
    if (!round || open.answered < round.questions.length) return null;
    const card = this.p.topicCards[open.sectionId];
    return {
      sectionId: open.sectionId,
      ...(open.viewedAs ? { viewedAs: open.viewedAs } : {}),
      due: card
        ? new Date(card.due)
        : rate(newCard(now), this.enrolRating(open.sectionId), now).due,
      scheduled: card !== undefined,
      met: open.met ?? [],
    };
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
  resumableRound(): ResumableRound | null {
    return this.roundBack(this.p.openRound);
  }

  /**
   * The round an errand put down, read without taking it back up.
   *
   * What a switch asks before it decides whether it is a place to go: drawing a
   * button must not spend a round. `resumeRound` is the other half, and both go
   * through `roundBack`, so a switch offered is a switch that leads somewhere.
   */
  parkedRound(mode: Mode): ResumableRound | null {
    return this.roundBack(this.pickUpFrom(mode));
  }

  /**
   * One reading of a stored round, wherever it is being held.
   *
   * The same argument `roundOf` makes one method up, one level out: a round in
   * flight and a round put down are the same record, and two readers of it that
   * disagreed would mean a round that could be picked up on one path and not on
   * the other. So the checks live here once — the test still in the bundle, the
   * window still naming questions it holds, questions still left to give — and
   * `resumableRound`, `parkedRound` and `resumeRound` all get that one answer.
   */
  private roundBack(open: OpenRound | null | undefined): ResumableRound | null {
    if (!open) return null;
    const test = this.content
      .testsFor(open.sectionId)
      .find((t) => t.id === open.roundId);
    if (!test) return null;
    const round = this.roundOf(open, test);
    if (!round || open.answered >= round.questions.length) return null;
    return {
      sectionId: open.sectionId,
      test: round,
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
   * Apply a self-grade to a grammar topic that is in the review pile.
   *
   * It does **not** create a card for one that is not. Grading says how well
   * the answer went; it does not say the topic should start coming back, and
   * conflating the two is what made exploring the book expensive. `enrolTopic`
   * is the one thing that puts a topic in the pile, and the student asks for
   * it. The grade is not wasted meanwhile: the round goes on accumulating
   * `worst`, and that is the rating the offer is priced at.
   *
   * `roundId` is the served test's id, and it makes the round — not the
   * question — the unit of scheduling. Every grade in a round rewinds the card
   * to where it stood before the round and re-rates it with the worst grade
   * given so far, so a round costs one rep however many questions it holds, and
   * a round abandoned halfway on an enrolled topic still leaves a card that is
   * the result of exactly one. Abandoned on a topic that is not enrolled it
   * leaves nothing, which is the whole point.
   *
   * Passing no `roundId` rates per call, which is what a topic with no tests
   * written for it — one verdict, no round — wants.
   */
  /**
   * The round this grade belongs to, if it belongs to one.
   *
   * Written out twice — once in `gradeTopic` and once in `previewTopic` — and
   * the two must agree exactly or the app lies to the student: the grade
   * buttons are labelled with the interval each one buys, and the preview
   * computes that against `cardBefore` only when it believes the round is
   * continuing. A guard that drifted here would put a number under a button
   * that the grade then does not honour.
   *
   * Returns the round rather than a boolean, because every caller wants
   * `cardBefore` and `worst` off it the moment the answer is yes, and a
   * boolean makes them narrow `openRound` again by hand.
   */
  private continuingRound(sectionId: string, roundId?: string): OpenRound | null {
    const open = this.p.openRound;
    return roundId !== undefined &&
      open != null &&
      open.roundId === roundId &&
      open.sectionId === sectionId
      ? open
      : null;
  }

  /**
   * What a fresh card for this topic should be rated.
   *
   * The round's worst grade when one is in flight on it, which is what the
   * whole round was priced at, and `fallback` otherwise. In one place because
   * three things have to agree to the letter — the interval under the grade
   * button, the interval the offer quotes, and the card enrolling writes — and
   * a second copy of this is how they would come to disagree.
   */
  private enrolRating(sectionId: string, fallback: Rating = 3): Rating {
    const open = this.p.openRound;
    return open && open.sectionId === sectionId && open.worst !== null
      ? open.worst
      : fallback;
  }

  gradeTopic(
    sectionId: string,
    rating: Rating,
    now: Date = new Date(),
    roundId?: string,
  ): void {
    const existing = this.p.topicCards[sectionId];
    const continuing = this.continuingRound(sectionId, roundId);

    const before = continuing ? continuing.cardBefore : (existing ?? null);
    // `worst` is null until the round's first grade, since a round now opens
    // when its test is served rather than when it is first answered.
    const worst = (
      continuing && continuing.worst !== null
        ? Math.min(continuing.worst, rating)
        : rating
    ) as Rating;
    /*
     * Written only for a topic already in the pile.
     *
     * Answering a topic does not enrol it — `enrolTopic` does, and the student
     * asks for it at the end of the round. Exploring the book used to cost a
     * card per topic looked at, which is a standing reason not to look.
     *
     * The guard reads `existing` — the card on disk *now* — rather than
     * `before`, which is the round's snapshot. That is what makes a dismissal
     * taken mid-round stick: `before` still holds the card the round opened on,
     * and rating it would quietly put back what the student just removed.
     * `dismissTopic` also nulls the round, so this is the second lock on the
     * same door; both are cheap and the failure is silent.
     */
    if (existing) {
      const card = rate(
        before ? deserializeCard(before) : newCard(now),
        worst,
        now,
      );
      this.p.topicCards[sectionId] = serializeCard(card);
    }
    /*
     * The round, updated rather than rewritten.
     *
     * This literal used to be built from scratch on every grade, with five
     * conditional spreads carrying forward what the round already knew. Its own
     * comment recorded the cost: a round opened in a further grammar forgot
     * `viewedAs` on question two and resumed in the other book, because the new
     * literal simply did not mention it. Every field added to `OpenRound` after
     * that had to remember to be re-listed, and the one that forgot would fail
     * the same way — silently, on the second question.
     *
     * Starting from the round in flight makes that class of bug impossible: a
     * field nobody names here is carried. What is left is the two that must
     * *not* be, and they are worth naming for the opposite reason.
     *
     * `draft` is the answer to the question just graded. It was dropped by the
     * old literal by never being mentioned, which was right by accident; here it
     * has to be dropped on purpose, or a graded sentence would reappear in the
     * box on the next question.
     *
     * `via` says why this round is on screen. It is written once when the round
     * opens and read on every resume, and the old code defaulted a missing one
     * to `"review"` — a file written before `via` existed has none, and a round
     * resumed from it must still be able to say something.
     */
    if (roundId === undefined) {
      this.p.openRound = null;
    } else {
      const opening: OpenRound = {
        sectionId,
        roundId,
        cardBefore: before,
        isNew: false,
        worst,
        answered: 0,
      };
      const { draft: _spent, ...carried } = continuing ?? opening;
      this.p.openRound = {
        ...carried,
        via: continuing?.via ?? "review",
        worst,
        // One more of the round's questions is behind us.
        answered: (continuing?.answered ?? 0) + 1,
      };
    }

    this.touch();
  }

  /**
   * Every author the student has ever answered a question by.
   *
   * Derived from the attempt trail rather than written down, and that is the
   * whole point rather than an economy. A stored set could only have started
   * empty, so the release that added it would have announced a first meeting
   * with every author a student had been reading for a year. The trail already
   * holds the answer — it is uncapped on purpose — so the honest set is the one
   * read back out of it.
   *
   * Memoized on the instance and never persisted. Built at most once per
   * launch, and only ever asked for by a question that quotes somebody at all:
   * the questions written for this app are the great majority and cost nothing.
   * Sections whose bank quotes nobody are skipped whole, which is most of them.
   */
  private met?: Set<string>;

  private authorsMet(): Set<string> {
    if (this.met) return this.met;
    const met = new Set<string>();
    for (const [sectionId, attempts] of Object.entries(this.p.attempts)) {
      if (!attempts?.length) continue;
      // The prompt is a question's identity here as it is everywhere else in
      // the trail: it is what the student saw, and it is what was recorded.
      const byPrompt = new Map<string, string>();
      for (const test of this.content.testsFor(sectionId)) {
        for (const q of test.questions) {
          if (q.source) byPrompt.set(q.prompt, q.source.author);
        }
      }
      if (byPrompt.size === 0) continue;
      for (const a of attempts) {
        const author = byPrompt.get(a.prompt);
        if (author) met.add(author);
      }
    }
    this.met = met;
    return met;
  }

  /**
   * The author this question introduces, if the record holds no answer to any
   * question by them — and note it on the round, so it can be named when the
   * round lands.
   *
   * Asked *before* the attempt is recorded, or the attempt being made is itself
   * what proves the author already met. One call rather than a query and a
   * write, so those two cannot come to be made in the wrong order.
   *
   * Undefined for the questions nobody is credited for, which is most of them,
   * and undefined the second time — meeting somebody happens once.
   */
  meetAuthor(question: Question): string | undefined {
    const author = question.source?.author;
    if (!author) return undefined;
    const met = this.authorsMet();
    if (met.has(author)) return undefined;
    met.add(author);
    const open = this.p.openRound;
    if (open) open.met = [...(open.met ?? []), author];
    this.touch();
    return author;
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
    const continuing = this.continuingRound(sectionId, roundId);

    const base = continuing
      ? continuing.cardBefore
      : (this.p.topicCards[sectionId] ?? null);
    const dates = preview(base ? deserializeCard(base) : newCard(now), now);
    if (continuing === null || continuing.worst === null) return dates;

    const worst = continuing.worst;
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
   * How many questions a round is for, or 0 for however many the test holds.
   *
   * 0 rather than `undefined` at this boundary, so a surface asking the
   * question gets a number and the "absent means the whole test" rule is
   * spelled once, here, rather than at every call.
   */
  questionsPerRound(): number {
    const n = this.p.questionsPerRound;
    return typeof n === "number" && n > 0 ? Math.floor(n) : 0;
  }

  setQuestionsPerRound(n: number): void {
    // Anything at or above the longest test a pack ships means the same thing
    // as no cap, and is stored as no cap so the file does not carry a number
    // that a regenerated bank could quietly turn into a truncation.
    if (n > 0) this.p.questionsPerRound = Math.floor(n);
    else delete this.p.questionsPerRound;
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
    for (const state of Object.values(this.p.sentenceCards)) consider(state.fsrs);
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
    for (const card of Object.values(this.p.sentenceCards)) {
      const due = new Date(card.fsrs.due);
      out.push({
        kind: "sentence",
        id: card.id,
        // The L2 leads and the English goes under it, which is the other way
        // round from how the card is *answered* — because a schedule is read to
        // recognise what is waiting, and the sentence is what a student would
        // know it by. Nothing is given away: the card is not being asked here.
        title: card.answer,
        sub: card.prompt,
        due,
        overdue: due.getTime() <= now.getTime(),
      });
    }
    out.sort((a, b) => a.due.getTime() - b.due.getTime());
    return limit === undefined ? out : out.slice(0, limit);
  }

  /**
   * Counts for a status line.
   *
   * `due` is the pile itself, and it is here rather than left to callers to add
   * up. Every screen that asks "is anything waiting" was answering it by naming
   * the kinds of card it happened to know about — `dueTopics + dueVocab` — so
   * the day a third kind arrived, each of them went on saying the pile was
   * clear over a card that was due, in six places across two apps. A total the
   * engine works out cannot fall behind the engine.
   */
  stats(now: Date = new Date()): {
    dueTopics: number;
    dueVocab: number;
    dueSentences: number;
    /** Everything due, whatever kind of card it is. */
    due: number;
    topics: number;
    vocab: number;
    sentences: number;
  } {
    const dueTopics = dueAmong(this.topicCardList(), now).length;
    const dueVocab = dueAmong(this.vocabCardList(), now).length;
    const dueSentences = dueAmong(this.sentenceCardList(), now).length;
    return {
      dueTopics,
      dueVocab,
      dueSentences,
      due: dueTopics + dueVocab + dueSentences,
      topics: Object.keys(this.p.topicCards).length,
      vocab: Object.keys(this.p.vocabCards).length,
      sentences: Object.keys(this.p.sentenceCards).length,
    };
  }

  /**
   * Every grammar section in book order with how it stands — the model behind
   * the index and the topic sheet.
   *
   * `answered` and `questions` come from `coverage`, so they say what exploring
   * will ask of this topic rather than what was ever written for it.
   * `hasTests` deliberately does not: it is "was anything written here at all",
   * which is what tells a topic nothing has been written for from one this
   * student has asked not to be shown. The caller wanting the second reads
   * `hasTests && questions === 0`, and the two absences are not the same thing
   * to say to a student.
   *
   * `readingOnly` is a third, and the only one of the three that is not an
   * absence at all: the book has no exercise on that page and never will. Every
   * section is here whichever it is, because reading is what this list is drawn
   * for — what a student cannot reach, they can never learn.
   */
  /**
   * Memoized, because this is the most expensive read in the engine and the
   * most repeated.
   *
   * Per section it does a `primaryTopicsFor`, up to two `testsFor`, a
   * `coverage()` that walks the **whole** attempt trail, and a
   * `deserializeCard` — and the trail is deliberately uncapped, so it grows
   * with years of study. Greek has 556 sections, and both apps call this on
   * every render.
   *
   * Keyed on three things. The **revision**, bumped by `touch()`, so any grade
   * or edit drops it. The **grammar**, because a further book's sections are a
   * different map entirely. And the **second**, because `due` is a fact about
   * the clock rather than about progress: without it the two calls in one paint
   * arrive a millisecond apart and miss.
   *
   * That last one bounds the staleness at one second, against a `due` whose own
   * granularity is minutes at best — a card cannot come due and be answered
   * inside the window.
   */
  grammarMap(now: Date = new Date()): TopicProgress[] {
    const second = Math.floor(now.getTime() / 1000);
    const hit = this.mapCache;
    if (
      hit &&
      hit.revision === this.revision &&
      hit.grammarId === this.grammarId &&
      hit.second === second
    ) {
      return hit.map;
    }
    const map = this.computeGrammarMap(now);
    this.mapCache = { revision: this.revision, grammarId: this.grammarId, second, map };
    return map;
  }

  private computeGrammarMap(now: Date): TopicProgress[] {
    const starred = new Set(this.p.starred ?? []);
    const noRoll = new Set(this.p.noRoll ?? []);
    return this.content.sections(this.grammarId).map((s) => {
      /*
       * A section of a further grammar reads the progress of the primary topics
       * it teaches, because those are what carry the questions. Usually one; two
       * where the books divide differently, and then every fact below is over
       * both of them.
       */
      const primary = this.content.primaryTopicsFor(s.id);
      const cards = primary
        .map((id) => this.p.topicCards[id])
        .filter((c): c is SerializedCard => Boolean(c));
      const { answered, total: questions } = this.coverage(s.id);
      return {
        sectionId: s.id,
        title: s.title,
        ref: s.ref,
        order: s.order,
        family: this.content.familyOf(s.family, this.grammarId),
        hasTests: this.content.testsFor(s.id).length > 0,
        readingOnly: s.readingOnly === true,
        due: cards.some((c) => isDue(deserializeCard(c), now)),
        scheduled: cards.length > 0,
        answered,
        questions,
        // Any of them, matching `star`, which sets them all.
        starred: primary.some((id) => starred.has(id)),
        // Likewise `excludeFromRoll`.
        noRoll: primary.some((id) => noRoll.has(id)),
        lapses: cards.reduce((n, c) => n + (c.lapses ?? 0), 0),
      };
    });
  }

  /**
   * The starred topics, in book order — the section the index pins at its top.
   *
   * Out of `grammarMap` rather than out of `starred` directly, so a star set in
   * one book is drawn here as the *open* book's section, with that book's title
   * and reference on it.
   */
  starredTopics(now: Date = new Date()): TopicProgress[] {
    return this.grammarMap(now).filter((t) => t.starred);
  }

  /**
   * `grammarMap()` bucketed into families, in display order.
   *
   * `topics` is every topic, because the family is a shelf of the book and a
   * page with no exercise is still on it.
   *
   * There is no figure beside the label. There used to be — a mean mastery over
   * the family, drawn as a bar and a percentage, with a second one over the
   * whole syllabus above it. What it actually measured was how many of the
   * family's topics had been *visited*, since three good answers filled a
   * topic's score, so it rewarded touching every topic once over working one
   * out; and it decided where the book's walk began, which is the only reason
   * the engine computed it at all. Neither the walk nor the number is here now.
   */
  familyProgress(now: Date = new Date()): FamilyProgress[] {
    const map = this.grammarMap(now);
    return this.families.map(({ id, label }) => ({
      id,
      label,
      topics: map.filter((t) => t.family === id),
    }));
  }

  /**
   * The live progress, for saving and exporting — **not** a copy.
   *
   * `Readonly` rather than a clone, and the difference is the keystroke path:
   * this is called by the draft-keeper every 400ms while somebody is typing, on
   * a file whose attempt trail is deliberately uncapped and grows with years of
   * study. Cloning it there would be work done on every fourth keypress for a
   * caller that only wanted to write it out.
   *
   * What that buys is a compile error on `session.progress().practise = …`,
   * which is the mutation worth stopping: it would change what the engine is running
   * on *without moving `updatedAt`*, so the corruption would also never sync and
   * never be noticed. What it does not reach is a write inside one of the
   * records — `topicCards[id] = …` — because a deep readonly type would have to
   * be threaded through `StorageAdapter` and every adapter besides. `snapshot()`
   * is the detached copy for anyone who wants one.
   */
  progress(): Readonly<Progress> {
    return this.p;
  }

  /**
   * A detached copy of everything the session mutates — the material for an
   * undo. Progress is plain JSON and the engine keeps no state outside it, so
   * a deep clone is the whole story: grading, the run in flight and vocabulary
   * all take back together.
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
    const quotedOnly = this.p.quotedOnly;
    const quotedFirst = this.p.quotedFirst;
    const questionsPerRound = this.p.questionsPerRound;
    this.p = structuredClone(snapshot);
    this.p.quotedOnly = quotedOnly;
    this.p.quotedFirst = quotedFirst;
    this.p.questionsPerRound = questionsPerRound;
    // The set of authors met is read out of the trail, and the grade being
    // taken back may be the one whose attempt first met somebody. Thrown away
    // rather than mended: it is rebuilt on the next quoted question and nothing
    // else asks for it.
    this.met = undefined;
    // An undo is itself a change: the stored copy is now out of date, and the
    // sync comparison reads `updatedAt` to decide that.
    this.touch();
  }

  // --- internals -----------------------------------------------------------

  // --- vocabulary ------------------------------------------------------------
  //
  // Every one of these is `this.deck`'s, and they are kept here so that no
  // caller and no test had to move in the commit that moved the code. See
  // `vocab.ts` for what they do and why.

  previewVocab(cardId: string, now: Date = new Date()) {
    return this.deck.previewVocab(cardId, now);
  }
  recordVocab(entry: LemmaEntry, now: Date = new Date()): string {
    return this.deck.recordVocab(entry, now);
  }
  gradeVocab(cardId: string, rating: Rating, now: Date = new Date()): void {
    this.deck.gradeVocab(cardId, rating, now);
  }
  vocabCard(cardId: string): VocabCardState | undefined {
    return this.deck.vocabCard(cardId);
  }
  vocabList(): VocabCardState[] {
    return this.deck.vocabList();
  }
  updateVocab(
    cardId: string,
    patch: Partial<Pick<VocabCardState, "citation" | "gloss">>,
  ): void {
    this.deck.updateVocab(cardId, patch);
  }
  vocabIdFor(entry: LemmaEntry): string {
    return this.deck.vocabIdFor(entry);
  }
  vocabContexts(cardId: string): VocabContext[] {
    return this.deck.vocabContexts(cardId);
  }
  addVocabContext(
    cardId: string,
    context: NewVocabContext,
    now: Date = new Date(),
  ): ContextOutcome {
    return this.deck.addVocabContext(cardId, context, now);
  }
  updateVocabContext(
    cardId: string,
    at: string,
    patch: Partial<Pick<VocabContext, "prompt" | "sentence">>,
  ): void {
    this.deck.updateVocabContext(cardId, at, patch);
  }
  deleteVocabContext(cardId: string, at: string): void {
    this.deck.deleteVocabContext(cardId, at);
  }
  moveVocabContext(cardId: string, at: string, by: -1 | 1): void {
    this.deck.moveVocabContext(cardId, at, by);
  }
  deleteVocab(cardId: string): void {
    this.deck.deleteVocab(cardId);
  }
  restoreVocab(card: VocabCardState): void {
    this.deck.restoreCard(card);
  }
  refreshCitations(): number {
    return this.deck.refreshCitations();
  }

  // --- kept sentences --------------------------------------------------------
  //
  // Every one of these is `this.sentences`', kept here for the reason the
  // vocabulary block above is: a caller talks to the session. See
  // `sentences.ts` for what they do and why.

  sentenceIdFor(prompt: string, answer: string): string {
    return this.sentences.sentenceIdFor(prompt, answer);
  }
  hasSentence(prompt: string, answer: string): boolean {
    return this.sentences.hasSentence(prompt, answer);
  }
  keepSentence(
    question: Question,
    sectionId: string,
    marks?: CardMarks,
    now: Date = new Date(),
  ): { id: string; outcome: KeepOutcome } {
    return this.sentences.keepSentence(question, sectionId, marks, now);
  }
  sentenceCard(cardId: string): SentenceCardState | undefined {
    return this.sentences.sentenceCard(cardId);
  }
  sentenceList(): SentenceCardState[] {
    return this.sentences.sentenceList();
  }
  gradeSentence(cardId: string, rating: Rating, now: Date = new Date()): void {
    this.sentences.gradeSentence(cardId, rating, now);
  }
  previewSentence(cardId: string, now: Date = new Date()) {
    return this.sentences.previewSentence(cardId, now);
  }
  deleteSentence(cardId: string): void {
    this.sentences.deleteSentence(cardId);
  }
  restoreSentence(card: SentenceCardState): void {
    this.sentences.restoreCard(card);
  }

  private touch(): void {
    this.p.updatedAt = new Date().toISOString();
    this.revision += 1;
  }

  /**
   * The two review tracks, each as `[id, card]`.
   *
   * They are separate stores with separate shapes — topics are keyed by section
   * id, vocabulary carries its own — and the four functions that read them were
   * written out four times: the same "is this due" predicate in `dueTopicIds`
   * and `earliestDueTopic`, and again in the vocabulary pair. Reduced to the one
   * difference that is real, which is how the ids are got at.
   *
   * A topic whose section is no longer in the bundle is dropped here. The
   * syllabus was rebuilt once already, and a card left over from the old ids is
   * a card nothing can serve.
   */
  private topicCardList(): [string, SerializedCard][] {
    return Object.entries(this.p.topicCards).filter(
      ([id]) => this.content.getSection(id) !== undefined,
    );
  }

  private sentenceCardList(): [string, SerializedCard][] {
    return Object.entries(this.p.sentenceCards).map(([id, c]) => [id, c.fsrs]);
  }

  private vocabCardList(): [string, SerializedCard][] {
    return Object.values(this.p.vocabCards).map((s) => [s.id, s.fsrs]);
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
    return this.narrow(test, this.roundWindow(test));
  }

  /**
   * Which of a test's questions this round is for, as indices into it.
   *
   * A test is what a pack generated — four questions, or three where an
   * unattested form was pruned out — and until this it was also the round. A
   * student who finds four sentences too much to start on was choosing between
   * four and none, which is the choice that ends in none.
   *
   * The window is **read off the answer trail** rather than written down, the
   * way `runSet` reads what a practice run has left: the questions of this test
   * that were answered longest ago, and the ones never answered at all before
   * any of those. A plain first-N cap would mean the third and fourth questions
   * of every test were never asked — against the promise `TestCycle` makes,
   * that every one of a topic's questions arrives before any of them arrives
   * twice. Least-recently-answered keeps that promise and keeps it twice over.
   *
   * The second time is the one worth spelling out, because getting it wrong is
   * not a slow leak but a loop. A practice run serves whichever test still
   * holds questions the run has not reached (`servePractice`), and stops when
   * none does. Take the *first* two questions of a swept topic's tests every
   * time and a run can never reach the other two: `left` never drains,
   * `practiceLeft` never reaches nought, and `next` calls it a drill for ever —
   * the same two sentences on the screen, and `Practised` unreachable. Sorting
   * by when each was last answered rules that out by construction. A question
   * answered during this run is the most recent thing on the trail, so it sorts
   * to the back, and the round always leads with something the run still owes.
   *
   * Ties keep the order the test was written in — which is the whole of what
   * happens on a topic never touched, where nothing has a date at all.
   *
   * Deterministic given the test, the preference and the trail, which is what
   * lets `beginRound` work the same window out a moment after the serve did
   * without either of them having to hand it to the other. Nothing writes to
   * the trail in between: a question is only recorded when it is graded.
   */
  private roundWindow(test: Test): number[] {
    const all = test.questions.map((_, i) => i);
    const cap = this.questionsPerRound();
    if (cap === 0 || cap >= all.length) return all;
    // The trail is oldest first, so the last mention of a prompt is the latest.
    const last = new Map<string, string>();
    for (const a of this.attemptTrail(test.sectionId)) last.set(a.prompt, a.at);
    const at = (i: number) => last.get(test.questions[i]!.prompt);
    const ranked = [...all].sort((i, j) => {
      const ai = at(i);
      const aj = at(j);
      if (ai === undefined || aj === undefined) {
        // Never answered leads. Both never answered is a tie, and a tie is the
        // order the questions were written in.
        return ai === aj ? i - j : ai === undefined ? -1 : 1;
      }
      return ai.localeCompare(aj) || i - j;
    });
    // Back into the test's own order once they are chosen: which questions the
    // round is for is this function's business, what order they arrive in is
    // the pack's.
    return ranked.slice(0, cap).sort((i, j) => i - j);
  }

  /**
   * A test as the round holds it: the same test, under the same id, carrying
   * only the questions the window named.
   *
   * The id is deliberately untouched. It is what `gradeTopic` files the round
   * under so that a round costs the topic one review rather than one per
   * question, what `resumableRound` finds the test by, and what `seenTests`
   * remembers — and a shortened round is still one round of that test.
   */
  private narrow(test: Test, window: number[]): Test {
    if (window.length === test.questions.length) return test;
    return { ...test, questions: window.map((i) => test.questions[i]!) };
  }

}
