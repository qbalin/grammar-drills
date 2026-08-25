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

/**
 * One sense of a dictionary article, at the depth its book set it.
 *
 * `n` is the book's own marker rather than anything derived — L&S runs
 * `I.` `A.` `2.` `(b)`, mixing numerals, letters and parentheses across five
 * levels — because a reader recognises a lexicon by its markers, and renumbering
 * them would be inventing a structure the book did not print.
 */
export interface DictionarySense {
  /** The marker as printed: "I.", "A.", "2.", "(b)". Empty where none. */
  n: string;
  /** How deep the book set it; 1 is the top. */
  level: number;
  /** The sense, as one line of `⟦b:…⟧` / `⟦i:…⟧` markup. */
  text: string;
}

/**
 * One article of a further dictionary, as that book printed it.
 *
 * Deliberately not a `LemmaEntry`. A `LemmaEntry` is one line — a citation form
 * and a joined gloss — sized for the crib above an answer box. An article is
 * what a lexicon prints: the senses divided, the constructions named, the
 * authors cited. Squeezing one into the other would throw away the only thing
 * the further book was shipped for.
 *
 * The senses arrive already divided, from the source's own markup, rather than
 * being recovered from flat text the way a grammar section's are. That is the
 * whole difference between the two: a grammar parser is guessing at a book's
 * shape from its prose, and a TEI walk is reading a shape the book states. So
 * nothing here goes through `parseBlocks` — see `decodeRuns`.
 *
 * `head` and `text` carry the same `⟦b:…⟧` / `⟦i:…⟧` inline markup grammar prose
 * does, which is what keeps a source document's own markup from ever becoming
 * markup here.
 */
export interface DictionaryArticle {
  /** The headword as the book printed it, quantities and all: "amō". */
  headword: string;
  /**
   * Which of several same-spelled headwords this is, where the book numbered
   * them: `sum¹` *to be* against `sum²` *him*. Absent when it stands alone.
   */
  homograph?: number;
  /**
   * What the article says before its first sense — inflection, gender,
   * etymology. Often the whole of a short entry, which then has no senses.
   */
  head: string;
  senses: DictionarySense[];
}

/** Resolves a folded headword to the articles filed under it. */
export interface ArticleLookup {
  lookup(headword: string): DictionaryArticle[];
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
  /**
   * Further dictionaries by id, each already keyed by folded headword.
   *
   * Absent until one is fetched, and absent for good on a pack that declares
   * none. Nothing the engine does depends on one being here: an article is
   * something a student reads, never something a question is graded against.
   */
  articles?: Record<string, ArticleLookup>;
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
 *
 * That rule is about the *question*, and `sectionId` below is not one. A topic
 * is the syllabus rather than the bank written against it: it outlives a
 * regeneration, which is exactly why progress is filed under topic ids and why
 * `SentenceCardState.sectionId` is allowed to say the same thing. So the line is
 * where it is drawn everywhere else in this file — a context may name the page
 * it came off, and may not name the question.
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
  /**
   * The topic the question was met under, where there was a question on screen.
   *
   * Provenance and never a key, the same standing `SentenceCardState.sectionId`
   * has: nothing looks a context up by it, nothing schedules against it, and a
   * card whose topic id has moved is still a word worth knowing. It is here so
   * that a card come round can offer the page of the book its line came off,
   * which is the one thing a student stuck on a sentence most often wants and
   * the two card screens had no way to give.
   *
   * **Absent is a real answer**, and there are two ways to give it: a word typed
   * into the vocabulary list with no question on screen, and every context
   * attached before this field existed. Neither is a card missing a field —
   * both are cards that cannot honestly say, and a surface reading this must
   * draw nothing rather than guess.
   */
  sectionId?: string;
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
 * The emphasis a kept sentence carries, which is the two texts it draws.
 *
 * `AttemptMarks` minus `submitted`, said as a type rather than left to each
 * caller to remember. A card is the question and the answer to it — what the
 * student wrote is not on the card, so marks on it would be marks over a
 * sentence that is not there.
 */
export type CardMarks = Pick<AttemptMarks, "prompt" | "answer">;

/**
 * A question the student kept: the English, the reference answer, and whatever
 * they had picked out in either when they kept it.
 *
 * The app's whole shape is a bank of questions filed under grammar topics, and
 * a question arrives because its topic came round. Some of them are worth more
 * than the topic that carried them — the ones quoted out of an ancient author
 * above all — and until this there was nothing to do about that but hope the
 * shuffle brought it back. A word could be lifted out of a sentence and kept; a
 * sentence could not.
 *
 * **The card carries its own copies of the strings**, as a vocabulary card
 * carries its own citation rather than pointing at the dictionary. The question
 * bank is generated content and is regenerated — it is why `resumableRound`
 * tolerates a test that has gone — and a commonplace book whose entries empty
 * themselves on a rebuild is not a commonplace book.
 *
 * **`marks` is frozen where it stood.** A card is not an attempt: it does not
 * follow later answers on the same sentence, and there is no editor for it. The
 * way out of a bad one is to forget the card, which has a way back.
 */
export interface SentenceCardState {
  /** `s-` and the question's own id — see `questionId`. */
  id: string;
  created: string;
  fsrs: SerializedCard;
  /** The English, as it was asked. */
  prompt: string;
  /** The reference answer, as it was shown. */
  answer: string;
  /** The teaching note the question carried, on the ones that carry one. */
  note?: string;
  /** Who it is quoted from — the reason most of these cards will exist. */
  source?: QuestionSource;
  /**
   * The primary topic the question was met under.
   *
   * Provenance, and never a key: nothing looks a card up by it, and a card
   * whose topic id has moved is still a sentence worth keeping. Kept so the
   * deck can say where a sentence came from.
   */
  sectionId: string;
  /** What was picked out, at the moment it was kept. Absent on most. */
  marks?: CardMarks;
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
 * Reviewing serves what is due and nothing else; practising serves the topic
 * you chose and nothing else. Deliberately absent from `Progress`: which one
 * you are on is a decision about this sitting, and a file that could remember
 * it could also hide a waiting pile from you across a reload.
 *
 * `"explore"` is the name it has always had, kept because it is what the mode
 * switch says and what every caller passes. What it used to mean was a walk
 * through the book from a cursor; what it means now is the run of practice in
 * flight, and with no run there is nothing to explore — the app asks for a
 * topic rather than choosing one.
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
 * due review and a run of practice are the same four sentences on the same
 * topic, and were shown as such. Kept on the round so it also survives a
 * reload, which nothing derived from `next` can.
 *
 * Two values are written now, because there are two errands. **`"new"` and
 * `"sweep"` are read but never written**: they distinguished the book's walk
 * arriving at a topic for the first time from its coming back round to one
 * already graded, and there is no walk — a topic is on screen because somebody
 * asked for it, whether or not they have been here before. Files written
 * before carry rounds stamped with both; `readRoundVia` keeps `"new"` as it
 * stands and reads `"sweep"` as `"drill"`, which is what such a round is now.
 *
 * They are read rather than rejected because a round whose `via` failed
 * validation loses its provenance and resumes as a review it never was.
 *
 * (Whether a topic is being met for the first time is still a live question —
 * it decides whether the grammar is shown before the questions — but it is
 * asked of the answer trail, and `OpenRound.isNew` records the answer.)
 */
export type RoundVia = "review" | "new" | "drill";

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
 * A test is three or four questions on one topic, and rating the topic's card
 * once per question drove it that many reps deep in a single sitting. The round
 * is the unit instead: every grade in it rewinds the card to `cardBefore` and
 * re-rates it with the worst grade given so far. The card on disk is therefore
 * always the result of exactly one rep, whenever the round is abandoned.
 *
 * A round is a test, or the part of one the student asked for — see
 * `questions` below and `Progress.questionsPerRound`. Shortening it changes how
 * many sentences arrive at a sitting and nothing else: it is still one round,
 * under the test's own id, and still one rep.
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
  /**
   * Which of that test's questions this round is for, as indices into it.
   *
   * Absent means all of them, which is every round a deck with no length
   * preference serves and every round in every file written before there was
   * one. Present only where `questionsPerRound` shortened the round.
   *
   * Written down rather than derived, unlike almost everything else here, and
   * the exception is worth stating: the window is chosen from the questions of
   * the test that have no answer on the trail, and the round itself fills that
   * trail in as it goes. Worked out afresh on the next launch it would name
   * what is *still* unanswered and hand back a half-finished round as a new
   * one.
   */
  questions?: number[];
  /** The topic's card before the round, or null if the topic had none. */
  cardBefore: SerializedCard | null;
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

/**
 * A round put back on the screen — what a caller needs to draw it and nothing
 * more.
 *
 * Named rather than written inline because two methods hand it back now: the
 * round in flight, and the round an errand had put down. Two spellings of one
 * shape is how the second one would come to be restored with a field the first
 * one had.
 */
export interface ResumableRound {
  sectionId: string;
  test: Test;
  qIndex: number;
  isNew: boolean;
  via: RoundVia;
  draft?: RoundDraft;
}

export interface Progress {
  /**
   * Set to 1 and never compared — migration here is by field presence, in the
   * `Session` constructor and `migrate()`, reading through `LegacyProgress`.
   *
   * Not vestigial, though it looks it: `importProgress` uses its presence as the
   * one cheap test of "is this file a progress file at all", which is what
   * stands between a student and a stack trace after picking the wrong JSON out
   * of their downloads. That is the whole of its job and it is worth saying so,
   * because the obvious tidy-up is to delete it.
   */
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
   * The run of practice in flight, if any — the whole of what the app studies
   * when it is not reviewing.
   *
   * It used to sit beside a cursor that walked the book, and exploring served
   * whichever of the two was set. There is no cursor: a topic arrives because
   * somebody chose it, and the run stays on that topic until somebody chooses
   * another. Null therefore means "nothing is on the table", which is a screen
   * asking for a topic rather than one handing over the next section.
   */
  practise?: PractiseRun | null;
  /**
   * Topics the student marked to come back to, in the order they were marked.
   *
   * Filed under **primary** topic ids, like everything else here: a further
   * grammar's section that teaches two primary topics stars both, and the star
   * is still there when the other book is opened. A file that never starred
   * anything does not carry the field.
   *
   * The one thing on a topic that the app does not derive. Everything else the
   * index shows — what is due, what has been answered, what keeps being failed
   * — is read off the record of study; this is the student saying "this one
   * matters to me", which nothing can work out for them.
   */
  starred?: string[];
  /**
   * Topics the die never lands on.
   *
   * The roulette in the header rolls a topic to study, weighted towards the
   * ones least answered — and a student who has worked the declensions out does
   * not want them coming up again, however few of their questions are left. So
   * they can be taken off the die, one at a time, from the topic's own sheet.
   *
   * Filed under **primary** topic ids like `starred`, and for the same reason:
   * a further grammar's section that teaches two primary topics takes both off,
   * and the exclusion is still there when the other book is opened. A file that
   * has never excluded anything does not carry the field.
   *
   * It is not a dismissal and does not touch the review pile. What is due is
   * still due, the topic is still on the index, and practising it by hand still
   * works. The only thing this decides is what the die may hand over — which is
   * why it is a toggle rather than a two-press deletion: nothing is lost by it.
   */
  noRoll?: string[];
  /** The round of questions in flight, if any. */
  openRound?: OpenRound | null;
  /**
   * The rounds put down rather than finished, one per errand.
   *
   * `openRound` is where the student is; this is where they were. A round left
   * behind used to be ended outright, so the die — which leaves a review and
   * starts a run in one tap — cost the review its place, and coming back served
   * a different test of a different topic. The card was never the casualty: it
   * is at one rep either way, which is what the round is the unit for. The
   * place was, and the place is the one thing on this file nothing can derive.
   *
   * One slot per errand rather than one slot, because the two errands interrupt
   * each other in both directions. A single slot would be filled by the
   * practice round the die had just begun — which is to say by the interruption
   * rather than by what was interrupted.
   *
   * One slot each and not a stack: a second round put down in the same errand
   * overwrites the first. That is the honest limit of "where was I", and it is
   * cheaper to say than a history nobody asked for.
   *
   * **Absent means nothing is put down**, which is every file written before
   * this existed. Left out of `emptyProgress` for that reason — an empty object
   * in every new file would make the absence two cases instead of one.
   */
  suspended?: { review?: OpenRound; explore?: OpenRound };
  /**
   * sectionId -> scheduling card for that grammar topic.
   *
   * A topic with no entry here is not in the review pile. That is the ordinary
   * state of a topic nobody has studied, and it is also what `dismissTopic`
   * leaves behind — the student's way of saying "stop asking me about this".
   * What it is *not* is a record of whether the topic has ever been studied:
   * the answer trail is, and it survives a dismissal.
   */
  topicCards: Record<string, SerializedCard>;
  /** vocab card id -> state. */
  vocabCards: Record<string, VocabCardState>;
  /**
   * sentence card id -> state: the questions the student kept.
   *
   * Beside `vocabCards` and shaped like it — the whole payload inline, because
   * the questions behind these are generated content and are rebuilt. Not like
   * `topicCards`, which store the scheduling card alone and let the content
   * carry the rest, because a topic id is a promise the book keeps and a
   * question is not.
   */
  sentenceCards: Record<string, SentenceCardState>;
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
  /**
   * How many topics have been graded for the first time.
   *
   * It drives nothing. It said "drives spot-check cadence" for a long time and
   * that was true of a design this app went away from — nothing has read it
   * since. Kept rather than removed: it is written on every first grade, so it
   * is in every progress file ever saved, and dropping a field from a persisted
   * shape to tidy a line of prose is a migration bought for nothing.
   *
   * Left honest instead, which is the point of this note. A field documented as
   * load-bearing and read by nothing is worse than an idle one, because the next
   * person to touch the scheduler will go looking for what it feeds.
   */
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
  /**
   * How many questions a round is for, when the student has asked for fewer
   * than the test holds.
   *
   * Absent means the whole test, which is what a round has always been. Only a
   * student who shortened it carries the field — `keepContext`'s shape, and for
   * the same reason: the default is the thing worth having, and a file that
   * never touched the setting should read exactly as it did before the setting
   * existed.
   *
   * A cap and never a floor. It can only take questions out of a round, never
   * put more in: a round is one test, that is what makes it one review of the
   * topic rather than four, and a number above what a test holds would be a
   * promise the content cannot keep. Four sentences is a real reason to put the
   * phone down, and a student who would do one is doing more than a student who
   * does none.
   *
   * Beside `keepContext` and `quotedOnly` and for their reason: how much you
   * want to be asked at a time is a fact about how you study, not about the
   * machine you are holding, so it travels with the deck to the terminal.
   */
  questionsPerRound?: number;
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
    practise: null,
    openRound: null,
    topicCards: {},
    vocabCards: {},
    sentenceCards: {},
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
 * field leaves behind a record of what it was and what became of it. Most of
 * these are read once, folded into their replacement, and deleted; the ones
 * that have no replacement are dropped, and say here that they were.
 */
export interface LegacyProgress {
  /**
   * Shared with `Progress`, and the reason a `Progress` can be read as one of
   * these at all: a type whose every field is optional is one anything can be
   * assigned to, which is not a claim worth making about a saved file.
   */
  version: number;
  /**
   * Sections a placement probe passed. It folded into `topicMastery` at the top
   * band, and there is no mastery to fold into: dropped.
   */
  knownSections?: string[];
  /** Whether the placement test had been sat. There is no placement test. */
  placementDone?: boolean;
  /** A placement run in flight. */
  placement?: unknown;
  /** The backlog set aside; which errand you are on is no longer written down. */
  exploring?: unknown;
  /** familyId -> resume point. Replaced by the one `bookAt` cursor, then dropped with it. */
  frontiers?: Record<string, string>;
  /** Where new topics came from. Replaced by `bookAt` and `practise`. */
  focus?:
    | { kind: "sweep" }
    | { kind: "family"; id: string }
    | { kind: "topic"; sectionId: string };
  /**
   * sectionId -> a cumulative 1–4 score the index drew as a percentage.
   *
   * Dropped rather than folded, because there is nothing it could fold into.
   * It moved by ±1 per answer from a floor of 1, so three good answers filled
   * it and in practice it read 0% or 100%; what it measured was how many
   * questions a topic had been asked, drawn as though it measured how well they
   * had gone. Its one non-decorative job was placing the book cursor, and there
   * is no cursor.
   *
   * What survives it: the FSRS card, which is the schedule and was always the
   * thing that knew when a topic was due, and the answer trail, which is the
   * record of what was actually studied.
   */
  topicMastery?: Record<string, number>;
  /**
   * How far a walk through the book had got. There is no walk: a topic is
   * studied because the student chose it, and `practise` is where that is
   * written down. Dropped, along with `bookAtByGrammar`.
   */
  bookAt?: string | null;
  /** The same cursor for the books that were not the primary. Dropped with it. */
  bookAtByGrammar?: Record<string, string | null>;
}
