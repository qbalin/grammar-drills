// ---------------------------------------------------------------------------
// Frozen content types (produced offline, shipped as JSON, read at runtime).
// ---------------------------------------------------------------------------

/** One numbered section of the grammar reference (Allen & Greenough). */
export interface GrammarSection {
  /** Stable id, e.g. "ag34". */
  id: string;
  /** The book's own reference, e.g. "34" or "34.a". */
  ref: string;
  title: string;
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

export interface ContentData {
  grammar: GrammarSection[];
  /** sectionId -> its ~50 pre-generated tests. */
  tests: Record<string, Test[]>;
  lemmas: LemmaMap;
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

export interface Progress {
  version: number;
  /** Section id of the student's placed level, or null before placement. */
  frontier: string | null;
  /** sectionId -> scheduling card for that grammar topic. */
  topicCards: Record<string, SerializedCard>;
  /** vocab card id -> state. */
  vocabCards: Record<string, VocabCardState>;
  /** Sections proven known without an active card. */
  knownSections: string[];
  /** sectionId -> ids of tests recently served (to rotate variety). */
  seenTests: Record<string, string[]>;
  /** Count of new topics introduced (drives spot-check cadence). */
  newTopicsIntroduced: number;
  /** Whether the initial placement test has been completed/skipped. */
  placementDone: boolean;
  updatedAt: string;
}

export function emptyProgress(): Progress {
  return {
    version: 1,
    frontier: null,
    topicCards: {},
    vocabCards: {},
    knownSections: [],
    seenTests: {},
    newTopicsIntroduced: 0,
    placementDone: false,
    updatedAt: new Date().toISOString(),
  };
}
