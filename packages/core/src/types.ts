// ---------------------------------------------------------------------------
// Frozen content types (produced offline, shipped as JSON, read at runtime).
// ---------------------------------------------------------------------------

/**
 * One topic of the grammar reference: a run of consecutive numbered sections
 * in Bennett's *New Latin Grammar*, extracted by `scripts/parse-grammar.py`.
 */
export interface GrammarSection {
  /** Stable id, e.g. "bn-020-first-declension". */
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

export type QuestionKind =
  | "translate-la-en"
  | "translate-en-la"
  | "cloze"
  | "parse";

/** A single self-graded prompt within a test. */
export interface Question {
  prompt: string;
  /** The reference answer, revealed on demand. */
  answer: string;
  kind: QuestionKind;
  /** Inflected Latin forms appearing in the item (validated against the dictionary). */
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
 * The walk is one family at a time, in `FAMILIES` order, bisecting: a probe in
 * the middle, then — if it passed — a second in the middle of what is left
 * above it. Two probes per family at most, so the whole test is at most
 * eighteen sentences and usually eleven.
 */
export interface PlacementRun {
  /** Index into `FAMILIES` of the family under test. */
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
 * A round of questions in flight — one served test — and the card as it stood
 * before the round began.
 *
 * A test is four questions on one topic, and rating the topic's card once per
 * question drove it four reps deep in a single sitting. The round is the unit
 * instead: every grade in it rewinds the card to `cardBefore` and re-rates it
 * with the worst grade given so far. The card on disk is therefore always the
 * result of exactly one rep, whenever the round is abandoned.
 */
export interface OpenRound {
  sectionId: string;
  /** The served test's id — the round's identity, so no explicit end is needed. */
  roundId: string;
  /** The topic's card before the round, or null if the topic had none. */
  cardBefore: SerializedCard | null;
  /** The lowest grade given in the round so far. */
  worst: 1 | 2 | 3 | 4;
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
   * starts at its first topic, which is what a fresh deck has for all nine —
   * so an empty map is the plain sweep from chapter one.
   *
   * Per family rather than one pointer, because that is the shape of the
   * complaint: knowing the declensions says nothing about knowing the verbs.
   */
  frontiers: Record<string, string>;
  /** Where new topics come from. Defaults to the sweep. */
  focus: Focus;
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
 * The generation of the shipped dictionary citations. Bumped whenever
 * `scripts/canonical-forms.mjs` changes what a citation says — v2 gave verbs
 * their four principal parts and adjectives their proper terminations.
 */
export const CITATIONS_VERSION = 2;

export function emptyProgress(): Progress {
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
    citationsVersion: CITATIONS_VERSION,
    updatedAt: new Date().toISOString(),
  };
}
