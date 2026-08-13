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
  /**
   * A page of the book that carries no exercise — sounds, word formation,
   * prosody, a run of bare definitions. It is read and paged through like any
   * other, and it is never studied.
   *
   * Declared by the pack's parser, never derived from "this topic has no
   * tests". Derived, an orphaned test set would turn a teachable topic into a
   * reading page in silence, which is the defect C0 and C1 exist to catch. So
   * **absent means teachable, and a teachable topic must have questions** — a
   * pack that says nothing inherits the strict rule.
   */
  readingOnly?: true;
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
  /** Which conjugation the dictionary files a verb under. Verbs only: a
   *  `declension` on a verb is its participle's, and says nothing about this. */
  conjugation?: string;
  /** The handful of entry-level tags the pack keeps — see `classOf` in
   *  `scripts/lib/lemma-fields.mjs` for which, and why it is a short list. */
  tags?: string[];
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

/**
 * How a further grammar's topics reach the primary's, in both directions.
 *
 * Generated offline by `build-crosswalk.mjs` out of a table a model filled in
 * and a person can read back. Many-to-many on purpose and in both directions:
 * where one book has a single topic on the dative another has the complementary
 * and the predicative dative apart, so one id maps to two and two map back to
 * one. Collapsing either side would be tidier and would be a lie about the books.
 */
export interface Crosswalk {
  /** A topic of this book -> the primary topics whose grammar point it teaches. */
  toPrimary: Record<string, string[]>;
  /** A primary topic -> the topics of this book that teach it. */
  fromPrimary: Record<string, string[]>;
}

export interface ContentData {
  grammar: GrammarSection[];
  /**
   * Further grammars of the same language, by grammar id — the same language
   * cut into topics a second way, with its own order and its own prose.
   *
   * Absent for a pack with one book, which is the shape every pack had before
   * there was a second. The primary is *not* repeated here; it is `grammar`.
   */
  grammars?: Record<string, GrammarSection[]>;
  /** grammarId -> how that book's topics reach the primary's. */
  crosswalk?: Record<string, Crosswalk>;
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
 * Where a topic stands in one cycle through its tests.
 *
 * A topic's tests are handed over in an order rather than drawn one at a time,
 * so that every one of them arrives before any of them arrives twice — and so
 * that the quoted ones can all arrive before the written ones, which a draw
 * cannot promise. The order is not written down: `seed` names it and it is
 * derived again on every serve, which is what keeps this two numbers rather
 * than a list as long as the topic. `at` is how far into it the student is.
 *
 * When `at` reaches the end, the cycle is worked out: the next seed follows
 * from this one and the whole thing goes round again in a new order.
 */
export interface TestCycle {
  /** Which shuffle this cycle is; the next cycle's follows from it. */
  seed: number;
  /** How many of this cycle's tests have been handed over. */
  at: number;
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
  /**
   * The topic being graded: always one of the primary grammar's, because that
   * is the syllabus the questions were written against and what carries a card.
   */
  sectionId: string;
  /**
   * The section the student reached it through, when that is a further
   * grammar's topic. Absent when the two are the same, which is every round
   * read out of the primary book and every round written before there was
   * another one.
   */
  viewedAs?: string;
  /** The served test's id — how the same test is found again, not re-rolled. */
  roundId: string;
  /** The topic's card before the round, or null if the topic had none. */
  cardBefore: SerializedCard | null;
  /**
   * The topic's mastery before the round. Absent only on a round begun before
   * this was written down — a topic never graded stood at the floor, which is
   * what every bar already reads an absent mastery as, and the first round on a
   * topic is exactly the one whose movement is worth drawing.
   *
   * Beside `cardBefore` and for its reason. Mastery moves per question where
   * the card moves per round, so "what this round did to the topic" is a
   * question only the value from before the round's first grade can answer, and
   * by the time the round lands its own grades have moved everything the screen
   * could otherwise read. Held here rather than in the screen because a round
   * is resumable: reload on the last question of four, grade it, and a value
   * kept in the page's state was never taken.
   */
  masteryBefore?: number;
  /**
   * Authors this round introduced — ones no answer on the record was ever given
   * to before.
   *
   * A list, because a round of four quotations can introduce two, and it dies
   * with the round: what has been met is the attempt trail's business and is
   * derived from it. This is only so that a first meeting on question two is
   * still nameable when the round lands on question four, and so a reload
   * between the two does not lose it.
   */
  met?: string[];
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
   * Which of the pack's grammars the student is reading. Absent is the primary,
   * which is every file written before a pack had a second one.
   *
   * A view, not a state: everything below stays filed under the primary's topic
   * ids whichever book is open, because the questions were written against that
   * syllabus and a further grammar reaches them through the crosswalk. Switching
   * books changes what is drawn and what it is called, and no history at all.
   */
  grammarId?: string;
  /**
   * The same cursor as `bookAt`, for the books that are not the primary.
   *
   * Kept apart rather than folded in so that `bookAt` still means exactly what
   * it meant: a file written before this stays readable, and a student who never
   * opens a second grammar never grows the field.
   */
  bookAtByGrammar?: Record<string, string | null>;
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
  /**
   * sectionId -> ids of tests recently served, oldest first.
   *
   * Recency, and nothing more. It used to be the rotation's whole memory —
   * "serve what is not in here" — and could not be, because it is capped and a
   * topic can hold ninety tests. `testCycles` carries the rotation now, and
   * what is left for this is the one question a cap is fine for: which of two
   * tests was served longer ago, which is how a practice run breaks a tie.
   */
  seenTests: Record<string, string[]>;
  /**
   * sectionId -> the cycle through its tests that is in flight.
   *
   * Written the first time a topic serves anything, and only for topics that
   * can serve something: the walk steps over hundreds with nothing to offer,
   * and none of them should leave a cycle behind.
   */
  testCycles: Record<string, TestCycle>;
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
  /**
   * Whether a session serves only questions whose answer somebody wrote.
   *
   * Absent means no, which is what makes everything the default: a pack ships
   * quoted and generated questions together, and both are served until a
   * student says otherwise. Only a student who turned this on carries the field.
   *
   * It binds every errand that serves a sentence, but not identically, because
   * what stepping over a topic costs is not the same on each. Exploring — the
   * walk through the book and a practice run — takes the narrowing whole: a
   * topic with nothing quoted is stepped over, and nothing is lost by it,
   * since the topic is still there when the preference goes off. A review
   * takes it with a floor under it (`Session.serveReview`): a topic with
   * nothing quoted comes back on a written question rather than not coming
   * back, because a due card that is never served stays due for ever, and a
   * schedule that cannot empty its own pile has stopped being a schedule.
   *
   * Not to be confused with `quotedFirst`, which is an order rather than a
   * filter and therefore reaches every path, review included: nothing is
   * withheld by putting the quotations at the front of a queue.
   *
   * What it also narrows is what the deck *shows*: a topic's bank of questions
   * is listed and counted by the same rule, because a deck that will ask twelve
   * sentences and offers ninety to read through is offering seventy-eight it
   * will not ask. Nothing is destroyed by that — the answers already written on
   * those questions stay on the trail, and come back with them.
   *
   * Beside `keepContext` and for its reason: how you want to be taught is a
   * fact about your deck, not about the machine you happen to be holding.
   */
  quotedOnly?: boolean;
  /**
   * Whether a topic's quoted questions are all served before any written one.
   *
   * Absent means yes — `keepContext`'s shape rather than `quotedOnly`'s, and
   * for the same reason it is the shape of a default that is worth having:
   * quotations are the scarce half of both packs and the half a student can
   * otherwise study for weeks without meeting. Only a student who turned this
   * off carries the field, and what they get instead is one shuffle over the
   * whole topic.
   *
   * An order, not a filter. Everything is still served, and a cycle that has
   * handed over the last quotation goes on to the written questions rather
   * than stopping. Reviews draw from the same cycle as the walk does, so they
   * are led by the quotations for nothing — there is no second order to keep
   * in step with this one.
   */
  quotedFirst?: boolean;
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
    testCycles: {},
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
