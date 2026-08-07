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

/**
 * Where a reference answer comes from, when somebody wrote it.
 *
 * Present only on questions whose answer is quoted rather than generated, and
 * absent everywhere else — which is the honest encoding: a question with no
 * `source` is one nobody can be credited for, and that is most of them.
 *
 * Not to be confused with `LemmaEntry.citation`, which is a dictionary headword.
 * This is a locus in a text: author, work, and where in it.
 */
export interface QuestionSource {
  /** As a reader would name them — "Cicero", "Thucydides". */
  author: string;
  /** The work, in the form the citing edition gives it. */
  work: string;
  /** Book, chapter and section, when the citation is that precise. */
  locus?: string;
}

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
  /** Where the answer is quoted from, on the questions that quote one. */
  source?: QuestionSource;
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

/**
 * A sentence the word was met in, kept on the card.
 *
 * A card is a dictionary entry, and a dictionary entry is the one thing a word
 * is *not* when you are learning it: the reason `manus` stuck is the line about
 * the soldiers raising their hands, and the card threw that line away the moment
 * it was made. This is that line, kept.
 *
 * A copy, like `Attempt.answer` is a copy of the reference and like the card
 * itself is a copy of a dictionary entry. Nothing here points back at the
 * question it came from, because the questions are generated content and can be
 * rebuilt underneath a card that has been saved for months.
 */
export interface VocabContext {
  /** The prompt that was on screen — the question this sentence answered. */
  prompt: string;
  /** The L2 sentence the word stood in. */
  sentence: string;
  /**
   * Whose sentence it is, named for `AttemptMarks`' own two fields because it
   * is the same distinction: `answer` is the reference, `submitted` is what the
   * student wrote — and what they wrote may be wrong. Annotated rather than
   * inferred, and shown rather than quietly dropped: a card that drew a mistake
   * as though it were a model would be teaching it back to the person who made
   * it.
   */
  source: "answer" | "submitted";
  /**
   * Which word of `sentence` was picked out, as `SentenceToken.index` — the
   * same cut the marks and the vocabulary crib make, so the highlight survives
   * being written to disk and read back by a surface that wraps the line
   * differently. Absent where nothing pointed at a word.
   */
  index?: number;
  /**
   * When it was attached, ISO. The context's identity, as `at` is an attempt's
   * — the array position, the one thing an id could otherwise be, is exactly
   * what reordering makes mutable.
   *
   * Unique among one card's contexts because the session makes it so, not
   * because the clock does: two attached in the same millisecond would be one
   * context that cannot be told from another, and deleting either would delete
   * both.
   */
  at: string;
}

/** A context before it is attached; the session stamps the `at`. */
export type NewVocabContext = Omit<VocabContext, "at">;

export interface VocabCardState extends LemmaEntry {
  id: string;
  created: string;
  fsrs: SerializedCard;
  /**
   * Where this word was met, in the order the student put them in.
   *
   * An array rather than a record, because the order is the student's and a
   * record has none. Absent rather than empty once the last one is deleted, so
   * a card that was cleared reads on disk like one that never had any.
   */
  contexts?: VocabContext[];
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
 * The two errands the app can be on.
 *
 * Reviewing serves what is due and nothing else; exploring moves through the
 * book and nothing else. Deliberately absent from `Progress`: which one you
 * are on is a decision about this sitting, and a file that could remember it
 * could also hide a waiting pile from you across a reload.
 */
export type Mode = "review" | "explore";

/**
 * A run of practice on one topic: stay here and work its questions out.
 *
 * `since` is what makes a second run a second run. What the run has served is
 * what has been answered since it began, read off the answer trail rather than
 * written down beside it — the trail already records every answer with its
 * timestamp, and a second list of the same facts is a second list to keep true.
 */
export interface PractiseRun {
  sectionId: string;
  since: string;
}

/**
 * Why a round is on the table, which is the one thing the screen cannot work
 * out for itself once the round is under way.
 *
 * `next` says all of this in its `Action`, and the surface then forgets it: a
 * due review, a drill and a topic the book has come back to are the same four
 * sentences on the same topic, and were shown as such. Kept on the round so it
 * also survives a reload, which nothing derived from `next` can.
 */
export type RoundVia = "review" | "new" | "drill" | "sweep";

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
   * How far the walk through the book has got: the section exploring will
   * serve next. Null until something places it.
   *
   * A cursor rather than a rule, and it steps forward whatever the grade. A
   * rule — "the first topic not yet mastered" — cannot move past a topic that
   * is going badly, which is the one topic a student most needs to be able to
   * leave. Mastery decides only where the cursor is *put*: choosing book order
   * drops it on the earliest topic short of the top band, and from there it
   * simply reads on, one section to the next.
   */
  bookAt?: string | null;
  /**
   * The run of practice in flight, if any. Exploring serves this when it is
   * set and the book cursor when it is not, which is the whole of what the
   * explore sub-mode amounts to.
   *
   * Beside the cursor rather than instead of it, so a detour onto one topic
   * does not cost a start point the student chose.
   */
  practise?: PractiseRun | null;
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
  /**
   * Which generation of the shipped citations the vocabulary cards carry. Cards
   * store their citation, so a rebuilt dictionary would otherwise never reach
   * the words already saved; `Session.refreshCitations` catches them up once.
   */
  citationsVersion?: number;
  /**
   * Whether a recorded word keeps the sentence it was met in. Absent means yes,
   * so only a student who turned it off carries this field at all.
   *
   * Here rather than beside the file, unlike the sync configuration: that is
   * per-device because it holds a credential, and a credential is a fact about
   * a machine. How you want your cards built is a fact about your deck, and a
   * student who turns this off on the phone means it in the terminal too.
   *
   * `Mode` is deliberately absent from this file and points the other way, but
   * for a stated reason — a remembered errand could hide a waiting pile across a
   * reload. A standing preference hides nothing.
   */
  keepContext?: boolean;
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
    bookAt: null,
    practise: null,
    openRound: null,
    topicCards: {},
    topicMastery: {},
    vocabCards: {},
    seenTests: {},
    attempts: {},
    newTopicsIntroduced: 0,
    // A fresh deck has no cards, so it is already current by definition.
    citationsVersion,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * What this app used to write down and no longer does.
 *
 * Named rather than cast through, so the migration in `Session`'s constructor
 * can read an old file without lying to the type checker, and so a deleted
 * field leaves behind a record of what it was and what became of it. Every one
 * of these is read once, folded into its replacement, and deleted.
 */
export interface LegacyProgress {
  /**
   * Shared with `Progress`, and the reason a `Progress` can be read as one of
   * these at all: a type whose every field is optional is one anything can be
   * assigned to, which is not a claim worth making about a saved file.
   */
  version: number;
  /** Sections a placement probe passed. Folded into `topicMastery` at the top band. */
  knownSections?: string[];
  /** Whether the placement test had been sat. There is no placement test. */
  placementDone?: boolean;
  /** A placement run in flight. */
  placement?: unknown;
  /** The backlog set aside; which errand you are on is no longer written down. */
  exploring?: unknown;
  /** familyId -> resume point. Replaced by the one `bookAt` cursor. */
  frontiers?: Record<string, string>;
  /** Where new topics came from. Replaced by `bookAt` and `practise`. */
  focus?:
    | { kind: "sweep" }
    | { kind: "family"; id: string }
    | { kind: "topic"; sectionId: string };
}
