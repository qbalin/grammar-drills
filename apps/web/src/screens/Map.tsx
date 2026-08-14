import { useState } from "react";
import { answerMatches } from "@lang-tutor/core";
import type {
  Attempt,
  AttemptMarks,
  FamilyProgress,
  TopicProgress,
} from "@lang-tutor/core";
import { Ring, Sentence, Sheet, ago, cycleEmphasis } from "../ui.js";
import { fold, profile } from "../pack.js";

/** One section of another book, as the topic sheet shows it. */
export interface Elsewhere {
  sectionId: string;
  /** Already written the way that book writes it, e.g. "§ 1077-1082". */
  ref: string;
  title: string;
}

/**
 * The syllabus as a map: nine families, each opening to a row per topic.
 *
 * The CLI draws fixed-width bars with a caret walking along them, which suits
 * arrow keys and a wide terminal. Neither holds here — 135 topics in one row
 * needs ~161 columns, and a thumb wants a target, not a cursor. So the families
 * become a list that expands, and each topic becomes a tappable row.
 *
 * The rows say what they are in words. They used to be a grid of squares
 * numbered 1, 2, 3… — the topic's position inside its family, so the "3" under
 * Particles and the "3" under Verb forms were different things and neither
 * matched the § numbers the rest of the app cites. The title lived in `title=`,
 * which a touch screen never shows; mastery, due and untested lived in colour,
 * a pip and a dashed border, which nothing on the page explained.
 */

/** Mastery band 1–4, or 0 for a topic never graded. */
function band(t: TopicProgress): number {
  if (t.mastery === undefined) return 0;
  return Math.min(4, Math.max(1, Math.floor(t.mastery)));
}

function masteryLabel(t: TopicProgress): string {
  if (t.mastery === undefined) return "not started";
  const pct = Math.round((((t.mastery ?? 1) - 1) / 3) * 100);
  return `${pct}% mastered`;
}

/**
 * Everything about a topic's standing, in words rather than in colour.
 *
 * The counts are already the preference's counts — `coverage` narrows them —
 * so the row reads "2/5 questions answered" of the quoted ones alone, and a
 * topic with nothing quoted reads 0 and is the one to walk past. That leaves
 * two different silences to tell apart, which is what `quotedOnly` is for here:
 * nothing was written for this topic, or nothing quoted was. Only the second
 * comes back when the preference is turned off.
 */
/**
 * Nothing here for exploring to hand over.
 *
 * One predicate for both silences, because `questions` is already the narrowed
 * count — `bank()` filters by the preference and `coverage` counts off it — so
 * "nothing was written here" and "nothing quoted was" both land on 0 and a row
 * does not have to know which of the two it is. `topicState` is where they are
 * told apart, in words; this is only where the eye is told there is nothing.
 *
 * Deliberately not keyed on `quotedOnly`. With the preference off it still
 * catches the genuinely test-less topics, which are also worth seeing greyed.
 */
function isEmpty(t: TopicProgress): boolean {
  return t.questions === 0;
}

/**
 * The same fact about a whole family, for its heading.
 *
 * A family is only worth greying when there is nothing under it at all: one
 * topic with a quotation in it is a reason to open the family, and greying the
 * head over a single live topic would hide the very row this is for.
 *
 * A family holding no topics whatever is not this — it has no questions because
 * it has nothing, which "0 topics" on the same line already says. Every family
 * in both shipped packs has topics, so this only keeps the odd case quiet.
 */
function familyEmpty(f: FamilyProgress): boolean {
  return f.topics.length > 0 && f.topics.every(isEmpty);
}

/**
 * A family the book sets no exercise anywhere in — Bennett's prosody, Lane's
 * sound and word formation. Its bar can never fill, so it does not draw one.
 */
function familyReadingOnly(f: FamilyProgress): boolean {
  return f.topics.length > 0 && f.topics.every((t) => t.readingOnly);
}

/** Which silence a family's heading is reporting, in the words the rows use. */
function familySilence(f: FamilyProgress, quotedOnly: boolean): string {
  if (familyReadingOnly(f)) return "reading only";
  return quotedOnly ? "nothing quoted" : "no questions";
}

function topicState(t: TopicProgress, quotedOnly: boolean): string {
  return [
    // A page with no exercise on it has no mastery to be at the start of, and
    // "not started" over a page of prosody reads as a reproach for not having
    // done something there is nothing to do.
    t.readingOnly ? "" : masteryLabel(t),
    // A topic is not finished when its mastery is: four questions do not sweep
    // a bank of twenty-odd, and this is where that shows.
    t.questions > 0 ? `${t.answered}/${t.questions} questions answered` : "",
    t.due ? "due now" : "",
    t.frontier ? "study resumes here" : "",
    /*
     * Three ways a topic can have nothing to serve, and they are three
     * different things to say.
     *
     * `readingOnly` is not an absence at all — the book has no exercise on this
     * page and never will, so there is nothing here anybody should go and
     * write. The other two are: one is a gap in the pack, the other is the
     * student's own preference, and turning the preference off brings the
     * second back while nothing brings the first.
     */
    t.readingOnly
      ? "reading only"
      : !t.hasTests
        ? "no tests written yet"
        : quotedOnly && t.questions === 0
          ? "nothing quoted here yet"
          : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function TopicRows({
  topics,
  quotedOnly,
  onPick,
}: {
  topics: TopicProgress[];
  quotedOnly: boolean;
  onPick: (t: TopicProgress) => void;
}) {
  return (
    <div className="list list--topics">
      {topics.map((t) => (
        // Dimmed, never disabled. A topic with nothing to serve is still one to
        // read and still one to start the walk from — `TopicSheet` refuses the
        // drill alone — so the row stays a button and stays tappable, and the
        // grey is only there to let the eye skip what the words already say.
        <button
          className={`row${isEmpty(t) ? " row--empty" : ""}`}
          key={t.sectionId}
          onClick={() => onPick(t)}
        >
          {/* The mastery colour is kept as a swatch, but it is now a second way
              of saying what the row already says. */}
          <span
            className={`band band--m${band(t)}`}
            aria-hidden="true"
          />
          <span className="row__main">
            <span className="row__title">
              <span className="row__ref">§ {t.ref}</span>
              {t.title}
            </span>
            <span className="row__sub">{topicState(t, quotedOnly)}</span>
          </span>
          <span className="row__chev">›</span>
        </button>
      ))}
    </div>
  );
}

export function MapSheet({
  families,
  overall,
  quotedOnly,
  onClose,
  onPick,
  /** The topic being studied, so the map opens where the student is. */
  currentFamily,
  books,
  grammarId,
  onGrammar,
  switching,
}: {
  families: FamilyProgress[];
  overall: number;
  /** Whether the counts on the rows are the quoted questions alone. */
  quotedOnly: boolean;
  onClose: () => void;
  onPick: (t: TopicProgress) => void;
  currentFamily?: string;
  /** The grammars this pack ships, in profile order. One means no switch. */
  books: { id: string; label: string }[];
  grammarId: string;
  onGrammar: (id: string) => void;
  /** The book being fetched, if one is; its button says so rather than hanging. */
  switching: string | null;
}) {
  const firstStarted = families.find((f) => f.percent > 0)?.id;
  const [open, setOpen] = useState<string | null>(
    currentFamily ?? firstStarted ?? families[0]?.id ?? null,
  );
  // Counted, not quoted: a hardcoded 135 would go stale the day a topic moves.
  //
  // The topics the ring is a proportion *of*, which is not every topic in the
  // book: a page the book sets no exercise on is not something to be part-way
  // through, and `overallPercent` leaves it out. Counting it here would put a
  // denominator on screen that the number above it was never divided by.
  const total = families.reduce(
    (n, f) => n + f.topics.filter((t) => !t.readingOnly).length,
    0,
  );
  const reading = families.reduce(
    (n, f) => n + f.topics.filter((t) => t.readingOnly).length,
    0,
  );

  return (
    <Sheet title="Grammar index" onClose={onClose}>
      {/* Which book the index is drawn from. Only when there is more than one:
          a pack with a single grammar should not grow a control that offers a
          choice of one. The percentage below moves when this does, because the
          two books hold different numbers of topics over the same answers —
          which is the honest thing for it to do and worth seeing happen. */}
      {books.length > 1 && (
        <div className="books">
          <div className="books__list" role="group" aria-label="Grammar">
          {books.map((b) => (
            <button
              key={b.id}
              className={`books__pick${b.id === grammarId ? " books__pick--on" : ""}`}
              aria-pressed={b.id === grammarId}
              disabled={switching !== null}
              onClick={() => onGrammar(b.id)}
            >
              {switching === b.id ? "opening…" : b.label}
            </button>
          ))}
          </div>
        </div>
      )}
      <div className="centered" style={{ padding: "0 0 1.2rem" }}>
        <Ring percent={overall} />
        <p>
          mastered across all {total} topics
          {/* Said rather than left to be discovered by scrolling: the index is
              longer than the syllabus, and a reader who counts the rows should
              not have to wonder why the two numbers differ. */}
          {reading > 0 && `, and ${reading} more to read`}
        </p>
        {/* Said once, at the top, rather than on every row: the rows are
            counting something narrower than they usually do, and a student who
            set the preference days ago is owed the reason their banks shrank. */}
        {quotedOnly && (
          <p className="row__sub">
            counting the quoted questions only — Settings
          </p>
        )}
      </div>

      {families.map((f) => {
        // Nine headings are what is read first, and a family with nothing under
        // it is nine-ninths of a wasted expansion. Greyed but still an
        // accordion: opening it is how you see *why* it is empty.
        const empty = familyEmpty(f);
        // Nothing here is studied, so there is no proportion of it to be at.
        // "0% mastered" over the prosody of a book that sets no exercise in it
        // is a bar reporting a failure that never happened.
        const reading = familyReadingOnly(f);
        // Split the same way the ring above is, and for the same reason: the
        // percentage is over what can be studied, so a count beside it that
        // includes the reading pages is a denominator the number never used.
        const taught = f.topics.filter((t) => !t.readingOnly).length;
        const toRead = f.topics.length - taught;
        return (
          <div className="family" key={f.id}>
            <button
              className={`family__head${empty ? " family__head--empty" : ""}`}
              onClick={() => setOpen(open === f.id ? null : f.id)}
              aria-expanded={open === f.id}
            >
              <span className="family__main">
                <span className="family__name">{f.label}</span>
                {/* The percentage in words: a bare "50%" beside a bar said
                    neither what was measured nor over how much. And the
                    emptiness in words too: the rows under it say which silence
                    they are, and a heading greyed in silence would be the one
                    thing on this sheet living in colour alone. */}
                <span className="family__sub">
                  {reading ? f.topics.length : taught} topics
                  {reading ? "" : ` · ${Math.round(f.percent * 100)}% mastered`}
                  {!reading && toRead > 0 ? ` · ${toRead} to read` : ""}
                  {empty ? ` · ${familySilence(f, quotedOnly)}` : ""}
                </span>
              </span>
              {!reading && (
                <span className="family__meter">
                  <i style={{ width: `${Math.round(f.percent * 100)}%` }} />
                </span>
              )}
              <span className="row__chev">{open === f.id ? "▾" : "▸"}</span>
            </button>
            {open === f.id && (
              <TopicRows
                topics={f.topics}
                quotedOnly={quotedOnly}
                onPick={onPick}
              />
            )}
          </div>
        );
      })}

      <Colophon />
    </Sheet>
  );
}

/**
 * Whose book this is, under the contents page of it.
 *
 * Not one line of this app's syllabus was written here: the families, the
 * topics and the § numbers are a scholar's book, out of copyright, parsed into
 * JSON by `grammar/parse.py`. The reader is entitled to know whose work they
 * are being taught out of and to go and read the original — which is also the
 * only honest way to ship someone else's book, whatever its licence permits.
 *
 * Here rather than at the foot of every section: it is the whole grammar being
 * credited, not the page in hand, and a credit repeated under all 114 sections
 * is furniture in the way of the reading. The index is the one place it is the
 * subject.
 *
 * Everything in it is the pack's own `profile.grammar.source`, so a second
 * language credits its own author.
 */
function Colophon() {
  const { title, url, licence } = profile.grammar.source;
  return (
    <p className="colophon">
      <a
        className="colophon__link"
        href={url}
        target="_blank"
        // `noreferrer` as well as `noopener`: this is a study app, and where
        // someone is reading from is nobody else's business.
        rel="noopener noreferrer"
      >
        {title}
        <span className="colophon__out" aria-hidden="true">
          ↗
        </span>
      </a>
      <span className="colophon__licence">{licence}</span>
    </p>
  );
}

/**
 * One topic, chosen from the map: what it is, how it has gone, and the things
 * worth doing with it.
 *
 * Reading the grammar leaves nothing behind. The other three are the whole of
 * what exploring can be doing, gathered here so that choosing one is also how
 * you leave the last: **Book order** reads from the earliest topic still short
 * of mastery, **Study from here** reads on from this one instead, and
 * **Practise these** stays put and works this topic's questions out.
 */
export function TopicSheet({
  topic,
  attempts,
  quotedOnly,
  onClose,
  onRead,
  onBookOrder,
  onStudyFrom,
  onDrill,
  onQuestions,
  onMark,
  onHoldWord,
  onInspectWord,
  elsewhere,
  onElsewhere,
}: {
  topic: TopicProgress;
  attempts: Attempt[];
  /** Whether the counts below are the quoted questions alone. */
  quotedOnly: boolean;
  onClose: () => void;
  onRead: () => void;
  onBookOrder: () => void;
  onStudyFrom: () => void;
  onDrill: () => void;
  onQuestions: () => void;
  onMark?: (at: string, marks: AttemptMarks) => void;
  /** The trail's own two gestures, passed through. */
  onHoldWord?: HoldPastWord;
  onInspectWord?: (word: string) => void;
  /**
   * The same grammar point as the other books of the pack put it — one entry
   * per book, already formatted, so this file learns nothing about how a
   * reference is written.
   */
  elsewhere?: { grammarId: string; label: string; sections: Elsewhere[] }[];
  onElsewhere?: (grammarId: string, sectionId: string) => void;
}) {
  const left = topic.questions - topic.answered;
  // Nothing the preference will serve. Practising it would open a run of no
  // questions and close it again on "practised all 0", so the button says so
  // instead of doing it. Studying from here is left alone: starting the walk
  // at a topic with nothing quoted is a fine thing to ask for — it steps over
  // this one and reads on to the next topic that has some.
  const nothingToServe = topic.hasTests && topic.questions === 0;
  return (
    <Sheet title={topic.title} subtitle={`§ ${topic.ref}`} onClose={onClose}>
      <p className="row__sub" style={{ marginTop: 0 }}>
        {topicState(topic, quotedOnly)}
      </p>

      <div className="actions">
        {/* Reading is the one thing every page of every book can do, which is
            why this button is never the one that goes grey. On a page the book
            sets no exercise on it is also the only thing, so it leads. */}
        <button
          className={`btn${topic.readingOnly ? " btn--primary" : ""}`}
          onClick={onRead}
        >
          Read § {topic.ref}
        </button>
        <button
          className={`btn${topic.readingOnly ? "" : " btn--primary"}`}
          onClick={onStudyFrom}
          disabled={!topic.hasTests}
        >
          Study from here
        </button>
      </div>
      <div className="actions">
        {/* Never disabled once the topic has tests: a bank with nothing
            unanswered left is exactly the one a second run is for. */}
        <button
          className="btn"
          onClick={onDrill}
          disabled={!topic.hasTests || nothingToServe}
        >
          {topic.readingOnly
            ? "No exercise here"
            : nothingToServe
              ? "Nothing quoted here"
              : left > 0
                ? `Practise these ${left}`
                : `Practise all ${topic.questions}`}
        </button>
        <button className="btn" onClick={onBookOrder}>
          Book order
        </button>
      </div>
      <div className="actions">
        {/* The bank narrows with the preference too. It used to be argued that
            it should not — that the bank is the book rather than the errand —
            but the preference is not an errand: an errand is what this sitting
            is for and is deliberately never written down, while this is written
            beside `keepContext` because it is how the deck wants to be taught.
            A deck that will ask twelve sentences and offers ninety to read
            through is offering seventy-eight it will not ask. Worded apart from
            the practice button above it because the two silences refuse
            different things — a run there, a list here. */}
        <button
          className="btn btn--quiet"
          onClick={onQuestions}
          disabled={topic.questions === 0}
        >
          {nothingToServe ? "Nothing quoted to read" : `All ${topic.questions} questions`}
        </button>
      </div>

      {/* The same grammar point in somebody else's words. Worth having on its
          own account — a rule that will not go in often goes in when a second
          author puts it differently — and it costs nothing to know: the table
          that makes the other book teachable is the table that answers this. */}
      {elsewhere?.map((book) =>
        book.sections.length === 0 ? null : (
          <div className="elsewhere" key={book.grammarId}>
            <p className="row__sub">Also explained at</p>
            <div className="list">
              {book.sections.map((s) => (
                <button
                  className="row"
                  key={s.sectionId}
                  onClick={() => onElsewhere?.(book.grammarId, s.sectionId)}
                >
                  <span className="row__main">
                    <span className="row__title">
                      <span className="row__ref">{s.ref}</span>
                      {s.title}
                    </span>
                    <span className="row__sub">{book.label}</span>
                  </span>
                  <span className="row__chev">›</span>
                </button>
              ))}
            </div>
          </div>
        ),
      )}

      {attempts.length > 0 && (
        <AttemptTrail
          attempts={attempts}
          onMark={onMark}
          onHoldWord={onHoldWord}
          onInspectWord={onInspectWord}
        />
      )}
    </Sheet>
  );
}

const RATING_WORD = ["", "again", "hard", "good", "easy"];

/**
 * A word held in one of an attempt's two Latin lines — see `AttemptTrail`.
 *
 * Named once because four components pass it along untouched: a trail is drawn
 * on the graded screen and inside three sheets, and a signature written out four
 * times is four chances for one of them to name the lines differently.
 */
export type HoldPastWord = (
  word: string,
  attempt: Attempt,
  where: "answer" | "submitted",
  index: number,
) => void;

/**
 * What was written here before, and what it should have been.
 *
 * Grading yourself leaves no record of the actual sentence, and a topic can be
 * away for months. Without this the only evidence a topic was ever studied is a
 * number on a bar.
 *
 * The correction is half the point and used to be missing: a trail of your own
 * sentences with nothing to read them against says you answered, not how. Each
 * attempt carries the reference it was shown at the time — `a.answer`, not the
 * question's answer today — so a trail stays true to what was on the screen
 * even if the pack's questions are regenerated under it.
 *
 * It appears only where it is news. A right answer is marked and left alone,
 * because printing the same sentence twice under "you" and "correct" is how a
 * trail becomes unreadable; the terminal has drawn it this way all along.
 *
 * Whatever the student picked out is shown wherever the trail is, and with
 * `onMark` it can be picked out here too — which is the only way a trail
 * written before marking existed ever gets any.
 *
 * The two Latin lines also answer to the hold and the double-tap, on the terms
 * the graded screen sets. A trail is where a student reads the correction of an
 * answer they got wrong, which is the moment a word in it is worth keeping, and
 * until now it was the one place a sentence could be compared but not used.
 * There is no hint line for it: the trail's own idiom is a hint inside a mode
 * (`.attempt__hint`), and a line repeated under every row of a list of five
 * costs more than it teaches for a gesture that is an enhancement.
 */
export function AttemptTrail({
  attempts,
  title = "Earlier answers",
  /** Off when every attempt answers the same question, which is then the title. */
  showPrompt = true,
  /** Off where the reference already stands above the trail, unrepeated. */
  showAnswer = true,
  onMark,
  onHoldWord,
  onInspectWord,
}: {
  /** Empty when the trail is already under a heading of its own. */
  title?: string;
  attempts: Attempt[];
  showPrompt?: boolean;
  showAnswer?: boolean;
  /**
   * Mark up a recorded attempt, named by its timestamp. Every tap saves: the
   * app commits on every action everywhere else, and a trail with its own
   * Save button would be the one place that does not.
   */
  onMark?: (at: string, marks: AttemptMarks) => void;
  /**
   * A word held down in one of an attempt's two Latin lines.
   *
   * The attempt goes up whole, because the sentence a card keeps has to be the
   * one that was on the screen at the time: `a.answer` is already that copy, and
   * a pack's questions can be regenerated under a trail that is months old.
   * Which of the two lines it was is named the way `AttemptMarks` names them,
   * since a card taken from what the student wrote is kept beside Latin that may
   * be wrong.
   *
   * Optional like `onMark`, because a trail is drawn in four places and each one
   * says for itself what it offers.
   */
  onHoldWord?: HoldPastWord;
  /** Double-click: look the word up rather than record it. Rides with the hold. */
  onInspectWord?: (word: string) => void;
}) {
  /** The one attempt being marked, by `at`. One at a time, like the hold. */
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      {title && <div className="section-title">{title}</div>}
      {attempts.map((a, i) => {
        const written = a.submitted.trim();
        const right = answerMatches(written, a.answer, fold);
        const marking = editing === a.at;
        const marks = a.marks ?? {};
        const mark = (field: keyof AttemptMarks, index: number) => {
          const of = marks[field] ?? {};
          const next = cycleEmphasis(of[index]);
          const { [index]: _gone, ...rest } = of;
          onMark?.(a.at, {
            ...marks,
            [field]: next ? { ...rest, [index]: next } : rest,
          });
        };
        // Under the marker everything is shown, whatever the surface usually
        // hides. `showPrompt`/`showAnswer` are there to keep a trail readable,
        // but the question sheet turns both off — and a row with nothing on it
        // to mark is not a row you can mark.
        const prompt = showPrompt || marking;
        const answer = (showAnswer && !right) || marking;
        return (
          <div className={`attempt${marking ? " attempt--marking" : ""}`} key={`${a.at}-${i}`}>
            <div className="attempt__meta">
              <span>{ago(a.at)}</span>
              <span>· {RATING_WORD[a.rating]}</span>
              {right && <span className="attempt__matched">· matched</span>}
              {onMark && (
                <button
                  className="attempt__mark"
                  aria-pressed={marking}
                  aria-label={
                    marking ? "Done marking this answer" : "Mark up this answer"
                  }
                  onClick={() => setEditing(marking ? null : a.at)}
                >
                  {marking ? "✓ done" : "✱"}
                </button>
              )}
            </div>
            {prompt && (
              <div className="attempt__prompt">
                {/* No hold and no lookup: the prompt is the language the student
                    already reads, which is what the graded screen says of its
                    own. */}
                <Sentence
                  text={a.prompt}
                  marks={marks.prompt}
                  onMark={marking ? (n) => mark("prompt", n) : undefined}
                />
              </div>
            )}
            <div
              className={`attempt__written${written ? "" : " attempt__written--empty"}`}
            >
              {written ? (
                // No `marking` guard on the hold: `Sentence` gives `onMark`
                // precedence and does not wire the hold up at all while it is
                // there, which is the exclusivity the mode already relies on.
                // The trimmed string, because that is the line drawn — a card
                // must keep the sentence that was on the screen.
                <Sentence
                  text={written}
                  marks={marks.submitted}
                  onMark={marking ? (n) => mark("submitted", n) : undefined}
                  onHold={
                    onHoldWord && ((word, n) => onHoldWord(word, a, "submitted", n))
                  }
                  onInspect={onInspectWord}
                />
              ) : (
                "— nothing written"
              )}
            </div>
            {answer && (
              <div className="attempt__answer">
                <span className="attempt__answer-label">correct</span>
                <Sentence
                  text={a.answer}
                  marks={marks.answer}
                  onMark={marking ? (n) => mark("answer", n) : undefined}
                  onHold={onHoldWord && ((word, n) => onHoldWord(word, a, "answer", n))}
                  onInspect={onInspectWord}
                />
              </div>
            )}
            {marking && (
              <div className="attempt__hint">Tap a word: bold, italic, struck, off.</div>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * The same trail, folded away on the graded screen.
 *
 * Seeing the reference answer is the moment "have I written this before, and
 * what did I write?" is worth asking, and until now the answer was two sheets
 * away — grammar, then its ↺. It is a disclosure rather than a sheet for the
 * reason the vocabulary crib is: what it is being compared against is on this
 * screen, and a sheet would cover it.
 *
 * Closed by default, and closed again on every new question. The trail is a
 * reference, not part of the question.
 */
export function EarlierAnswers({
  attempts,
  open,
  onToggle,
  onMark,
  onHoldWord,
  onInspectWord,
}: {
  attempts: Attempt[];
  open: boolean;
  onToggle: () => void;
  onMark?: (at: string, marks: AttemptMarks) => void;
  /** Pass-through: this is the graded screen's own trail, folded away, so the
   *  gestures it carries are that screen's. */
  onHoldWord?: HoldPastWord;
  onInspectWord?: (word: string) => void;
}) {
  if (attempts.length === 0) return null;
  return (
    <div className="crib">
      <button
        className="crib__toggle"
        aria-expanded={open}
        aria-controls="earlier-answers"
        onClick={onToggle}
      >
        <span className="crib__caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        Earlier answers — {attempts.length} on this topic
      </button>
      {open && (
        <div className="crib__list crib__list--trail" id="earlier-answers">
          <AttemptTrail
            attempts={attempts}
            title=""
            onMark={onMark}
            onHoldWord={onHoldWord}
            onInspectWord={onInspectWord}
          />
        </div>
      )}
    </div>
  );
}
