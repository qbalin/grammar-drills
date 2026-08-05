// ---------------------------------------------------------------------------
// Frozen content types (produced offline, shipped as JSON, read at runtime).
// ---------------------------------------------------------------------------

/**
 * One topic of the grammar reference: a run of consecutive numbered sections
 * of the pack's source grammar, extracted by that pack's own parser.
 */
export interface GrammarSection {
  /** Stable id, prefixed per pack, e.g. "bn-020-first-declension". */
  id: string;
  /** The book's own section reference, e.g. "20-22" or "100". */
  ref: string;
  title: string;
  /**
   * Display grouping, e.g. "nouns" — carried in the content, not inferred.
   * Optional: the loader does no validation, so a bundle without it must still
   * load. `familyOf` falls back for anything missing or unrecognised.
   */
  family?: string;
  /** The plain-text extract shown on demand. */
  text: string;
  /** Position in book order; used for topic sequencing. */
  order: number;
}

/**
 * What a question asks. Per pack, by convention `translate-<l1>-<l2>` and its
 * reverse, plus `cloze` and `parse`; the profile's `questions.produceKinds`
 * says which of them put L2 in the student's hands, which is the only
 * distinction the engine draws.
 */
export type QuestionKind = string;

/** A single self-graded prompt within a test. */
export interface Question {
  prompt: string;
  /** The reference answer, revealed on demand. */
  answer: string;
  kind: QuestionKind;
  /** Inflected L2 forms appearing in the item (validated against the dictionary). */
  vocab: string[];
  /** Optional teaching note shown with the answer. */
  note?: string;
}

/** A pre-generated test: a small bundle of questions on one section. */
export interface Test {
  id: string;
  sectionId: string;
  questions: Question[];
}

/** A dictionary citation for one lemma, e.g. `manus, ūs (f): the hand`. */
export interface LemmaEntry {
  lemma: string;
  /** Fully-formed citation form, e.g. "manus, ūs (f)". */
  citation: string;
  gloss: string;
  pos: string;
  gender?: string;
  declension?: string;
  /** Corpus rank, lower = more frequent; used to order ambiguous candidates. */
  rank?: number;
}

/** Normalized inflected form -> ranked lemma candidates. */
export type LemmaMap = Record<string, LemmaEntry[]>;

/**
 * Resolves an inflected form to ranked citations, however it likes.
 *
 * The CLI holds the whole `LemmaMap` in memory, which is free off a local disk.
 * The web app cannot: the map inflates to 43 MB. It supplies an index that
 * bisects a sorted blob instead, so the two surfaces share `Content` without
 * sharing a representation.
 */
export interface LemmaLookup {
  lookup(form: string): LemmaEntry[];
}

export interface ContentData {
  grammar: GrammarSection[];
  /** sectionId -> its ~50 pre-generated tests. */
  tests: Record<string, Test[]>;
  /** The whole form map, for callers that can afford to hold it. */
  lemmas?: LemmaMap;
  /** An alternative to `lemmas`; takes precedence when both are given. */
  lemmaLookup?: LemmaLookup;
}

// ---------------------------------------------------------------------------
// Progress / scheduling state (user data, persisted via a StorageAdapter).
// ---------------------------------------------------------------------------

/** A ts-fsrs Card with its Date fields serialized to ISO strings. */
export interface SerializedCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
  learning_steps?: number;
}

export interface VocabCardState extends LemmaEntry {
  id: string;
  created: string;
  fsrs: SerializedCard;
  /**
   * The student has written this card's citation themselves.
   *
   * A card is a copy of a dictionary entry, not a window onto one: editing it
   * has never reached the dictionary, which is shipped content and read-only at
   * runtime. This is the same rule pointing the other way — a citation the
   * student has corrected is not the dictionary's to revise back on the next
   * rebuild. Absent on the cards that were taken straight from an entry and
   * left alone, which is most of them.
   */
  citationEdited?: boolean;
}

/**
 * What is being said about a word: 1 bold, 2 italic, 3 struck through.
 *
 * Three things to say and not two loudnesses and their sum. Bold-italic was
 * the third step and nobody means it; struck is a verdict — *not this word* —
 * and it is the one a wrong answer most often wants.
 */
export type Emphasis = 1 | 2 | 3;

/**
 * Word index -> emphasis, over one text. The index counts words and not
 * characters — it is `SentenceToken.index`, the same cut the vocabulary crib
 * and the hold gesture make — so a mark survives being written to disk and
 * read back by a surface that wraps the sentence differently.
 */
export type Marks = Record<number, Emphasis>;

/**
 * What the student picked out in an attempt, per text.
 *
 * The three texts are marked separately because the pairing is the point: the
 * English that triggers an idiom against the form the idiom takes. Marking one
 * without the other says half of it.
 */
export interface AttemptMarks {
  prompt?: Marks;
  answer?: Marks;
  submitted?: Marks;
}

/**
 * One answered question, kept so the topic's earlier attempts can be re-read
 * after a later one. Self-grading leaves no other trace of what was actually
 * written, and a topic comes back for months: this is that trace.
 */
export interface Attempt {
  /** The English prompt that was asked. */
  prompt: string;
  /** The reference answer it was shown against. */
  answer: string;
  /** What the student typed; empty if they submitted nothing. */
  submitted: string;
  /** The self-grade given. Same scale as the scheduler's `Rating`. */
  rating: 1 | 2 | 3 | 4;
  /** When it was graded, ISO. */
  at: string;
  /**
   * The words the student picked out, on this attempt's own copies of the
   * three texts.
   *
   * A grade says a topic went badly; it never says which word. Very often the
   * topic under test was fine and something else in the sentence was not —
   * an idiom, a case, a preposition — and that is the thing worth finding
   * again months later. Absent on an attempt nobody marked, which is most.
   *
   * Held here rather than against the question because the question is
   * generated content and read-only at runtime: marking an answer must never
   * reach the bank.
   */
  marks?: AttemptMarks;
}

/**
 * A placement run in flight: which family is being probed and what the probes
 * so far have said.
 *
 * Held in progress rather than in the screen's own state so the test survives
 * whatever ends the page — a reload, a crash, closing the terminal. Without it
 * a half-finished placement is simply lost, and the student silently restarts
 * at chapter one.
 *
 * The walk is one family at a time, in the pack's family order, bisecting: a
 * probe in the middle, then — if it passed — a second in the middle of what is
 * left above it. Two probes per family at most, so the whole test is at most
 * twice as many sentences as the language has families, and usually far fewer.
 */
export interface PlacementRun {
  /**
   * Index into the pack's family list of the family under test. A position, so
   * a shipped pack must never reorder its families: a saved run would resume
   * against the wrong one.
   */
  familyIndex: number;
  /** How many probes this family has been asked (0, 1 or 2). */
  asked: number;
  /** Highest topic index passed within this family, or -1 for none yet. */
  passed: number;
  /** The section id being asked right now. */
  probe: string;
}

/**
 * Where new topics come from. Reviews are never affected: everything due comes
 * back on its own schedule in all three shapes.
 *
 * - `sweep` — the book in order, each family resuming at its own frontier.
 *   The default, and on a fresh deck it is chapter one onwards.
 * - `family` — one area at a time, for when a whole part of the grammar is the
 *   thing you came to work on.
 * - `topic` — stay on one section and work through the rest of its questions,
 *   which a four-question test does not exhaust.
 */
export type Focus =
  | { kind: "sweep" }
  | { kind: "family"; id: string }
  | { kind: "topic"; sectionId: string };

/**
 * Why a round is on the table, which is the one thing the screen cannot work
 * out for itself once the round is under way.
 *
 * `next` says all of this in its `Action`, and the surface then forgets it: a
 * due review, a drill and a topic picked off the map are the same four
 * sentences on the same topic, and were shown as such. Kept on the round so it
 * also survives a reload, which nothing derived from `next` can.
 */
export type RoundVia = "review" | "new" | "drill" | "quiz";

/**
 * The answer being written, kept so that whatever ends the page does not also
 * cost the sentence.
 *
 * Held on the round rather than beside it because it is only ever the answer
 * to the round's current question: when the round moves on, this goes.
 */
export interface RoundDraft {
  /** What is in the box. */
  input: string;
  /** Present once Submit or Reveal was tapped — that is, the graded screen. */
  graded?: { submitted: string; revealed: boolean };
  /** Words picked out before the grade, which the grade has not yet stored. */
  marks?: AttemptMarks;
}

/**
 * A round of questions in flight — one served test, where the student is in
 * it, and the card as it stood before it began.
 *
 * A test is four questions on one topic, and rating the topic's card once per
 * question drove it four reps deep in a single sitting. The round is the unit
 * instead: every grade in it rewinds the card to `cardBefore` and re-rates it
 * with the worst grade given so far. The card on disk is therefore always the
 * result of exactly one rep, whenever the round is abandoned.
 *
 * It is also where the student is. A test used to live entirely in the
 * screen's own state, so anything that ended the page — a reload, a swipe, the
 * phone reclaiming memory — put you back at question one of a different,
 * randomly rotated test. A round opens when a test is served and closes when
 * its last question is graded, and in between it is enough to put the same
 * sentence back on the screen.
 */
export interface OpenRound {
  sectionId: string;
  /** The served test's id — how the same test is found again, not re-rolled. */
  roundId: string;
  /** The topic's card before the round, or null if the topic had none. */
  cardBefore: SerializedCard | null;
  /** The lowest grade given in the round so far, or null before the first. */
  worst: 1 | 2 | 3 | 4 | null;
  /** How many of the round's questions have been graded — where to resume. */
  answered: number;
  /** Whether the topic was new when the round was served; teaches before testing. */
  isNew: boolean;
  /**
   * What asked for this round. Optional: rounds written before it resume as
   * `isNew ? "new" : "review"`, which is what they were being shown as anyway.
   */
  via?: RoundVia;
  draft?: RoundDraft;
}

export interface Progress {
  version: number;
  /**
   * Dead. One section id for the whole syllabus, which could say "past the
   * second declension" but never "past the second declension and nowhere near
   * the verbs". `frontiers` replaced it; old files still carry this and it is
   * left alone rather than migrated, so a returning student resumes exactly
   * where they were.
   */
  frontier: string | null;
  /**
   * familyId -> the section its new topics resume at. A family with no entry
   * starts at its first topic, which is what a fresh deck has for every family
   * — so an empty map is the plain sweep from chapter one.
   *
   * Per family rather than one pointer, because that is the shape of the
   * complaint: knowing the declensions says nothing about knowing the verbs.
   */
  frontiers: Record<string, string>;
  /** Where new topics come from. Defaults to the sweep. */
  focus: Focus;
  /**
   * A backlog set aside on purpose, so new ground can be reached while reviews
   * are waiting. The scheduler otherwise serves every due card before it will
   * teach anything, which is right for the student who came to study and wrong
   * for the one who came to get further.
   *
   * `since` is what makes it a backlog rather than a mute button: only cards
   * last reviewed *before* the run began are held. A topic met during the run
   * and graded "again" is due in a minute and comes straight back — it is the
   * thing being explored, not the pile being avoided. What is held is deferred
   * and never dropped: it is served once there is nothing left to learn.
   *
   * It lives in progress rather than screen state so a reload does not put the
   * pile silently back in the way.
   */
  exploring?: { since: string } | null;
  /** The round of questions in flight, if any. */
  openRound?: OpenRound | null;
  /** sectionId -> scheduling card for that grammar topic. */
  topicCards: Record<string, SerializedCard>;
  /**
   * sectionId -> cumulative mastery score in [1, 4], the number the progress
   * bars read: 1 = not mastered, 4 = mastered. Good/Easy +1, Hard +0.5,
   * Again -1. Absent means the topic has never been graded.
   */
  topicMastery: Record<string, number>;
  /** vocab card id -> state. */
  vocabCards: Record<string, VocabCardState>;
  /** Sections proven known without an active card. */
  knownSections: string[];
  /** sectionId -> ids of tests recently served (to rotate variety). */
  seenTests: Record<string, string[]>;
  /**
   * sectionId -> every answer given on it, oldest first. Uncapped: a question
   * you meet once a year is exactly the one whose earlier answers are worth
   * having, and the cost is a progress file that grows with study.
   */
  attempts: Record<string, Attempt[]>;
  /** Count of new topics introduced (drives spot-check cadence). */
  newTopicsIntroduced: number;
  /** Whether the initial placement test has been completed/skipped. */
  placementDone: boolean;
  /** The placement run under way, if any. Cleared when placement ends. */
  placement?: PlacementRun | null;
  /**
   * Which generation of the shipped citations the vocabulary cards carry. Cards
   * store their citation, so a rebuilt dictionary would otherwise never reach
   * the words already saved; `Session.refreshCitations` catches them up once.
   */
  citationsVersion?: number;
  updatedAt: string;
}

/**
 * A fresh deck.
 *
 * `citationsVersion` comes from the pack — it is that language's own count of
 * how many times its citation conventions have been rewritten. A deck with no
 * cards is current by definition, whatever the number, so the default is
 * harmless for callers that have no profile to hand.
 */
export function emptyProgress(citationsVersion = 0): Progress {
  return {
    version: 1,
    frontier: null,
    frontiers: {},
    focus: { kind: "sweep" },
    openRound: null,
    topicCards: {},
    topicMastery: {},
    vocabCards: {},
    knownSections: [],
    seenTests: {},
    attempts: {},
    newTopicsIntroduced: 0,
    placementDone: false,
    placement: null,
    // A fresh deck has no cards, so it is already current by definition.
    citationsVersion,
    updatedAt: new Date().toISOString(),
  };
}
