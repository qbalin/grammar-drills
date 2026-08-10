import { useEffect, useState, type ReactNode } from "react";
import type {
  AttemptMarks,
  Question,
  Rating,
  VocabCardState,
} from "@lang-tutor/core";
import { CopyButton, GradeBar, Ring, Sentence } from "../ui.js";
import { profile } from "../pack.js";

/**
 * The question, being answered.
 *
 * The loop is the CLI's, unchanged: read the English, write the Latin, see it
 * beside the reference, grade yourself. Nothing checks the answer — that is the
 * design, not an omission, and it is why no model runs here.
 *
 * The one concession to the phone is **Reveal**. Typing a full Latin sentence
 * on glass is real work, and the alternative to an escape hatch is not more
 * rigour but a skipped session. Writing stays the default and the primary
 * button; revealing is the quieter one beside it.
 */
export function Answering({
  question,
  index,
  total,
  value,
  onChange,
  onSubmit,
  onReveal,
  vocabulary,
}: {
  question: Question;
  /** Where this question sits in the test, and how many the test holds. */
  index: number;
  total: number;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onReveal: () => void;
  /**
   * The question's words, folded away. It sits above the box rather than below
   * it because this is the screen where a beginner is stuck on a word, and a
   * crib under the fold of a phone is a crib nobody finds.
   */
  vocabulary?: ReactNode;
}) {
  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">
          {profile.ui.promptDirection}
          {total > 0 ? ` · ${index + 1}/${total}` : ""}
        </p>
        <p className="prompt">{question.prompt}</p>
        {vocabulary}
        <textarea
          className="answer-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // A hardware keyboard should be able to submit; a soft one gets the
            // button, since Enter there is how you write a second line.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
          }}
          placeholder={profile.ui.webPlaceholder}
          // Mobile autocorrect mangles Latin into English words; all of these
          // are needed, and `spellCheck` alone is not enough.
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={profile.ui.answerAriaLabel}
        />
      </div>
      <div className="actions">
        <button className="btn" onClick={onReveal}>
          Reveal
        </button>
        <button className="btn btn--primary" onClick={onSubmit}>
          Submit
        </button>
      </div>
    </>
  );
}

/**
 * The answer beside the reference, and the grade.
 *
 * The two are stacked rather than diffed: a Latin sentence has several right
 * word orders, and highlighting the differences would assert a precision the
 * app does not have and the language does not want.
 *
 * Every word in both is holdable: this is the screen where you meet a word you
 * did not know, and the word is already here — asking for it to be retyped into
 * a sheet is how a vocabulary list stays empty.
 *
 * And every word in all three — the English too — can be picked out, which is
 * the other thing this screen is for. Very often the topic under test went
 * fine and something else in the sentence did not, and a grade cannot say
 * which. Marking is a mode, entered from the link row, so the hold keeps its
 * meaning outside it.
 */
export function Graded({
  question,
  submitted,
  revealed,
  index,
  total,
  schedule,
  settled,
  marks,
  marking,
  onGrade,
  onResume,
  onRecordWord,
  onHoldWord,
  onInspectWord,
  onReadGrammar,
  onToggleMarking,
  onMark,
  onCopy,
  vocabulary,
  history,
}: {
  question: Question;
  submitted: string;
  /** True when the answer was shown rather than written. */
  revealed: boolean;
  /** As on `Answering`. */
  index: number;
  total: number;
  schedule?: Record<Rating, Date>;
  /**
   * Whether the round is already settled at `again`, so every grade brings the
   * topic back at the same time. The bar says so once rather than printing one
   * interval four times.
   */
  settled?: boolean;
  /** What has been picked out so far, riding along until the grade stores it. */
  marks: AttemptMarks;
  /** Whether a tap marks a word rather than doing nothing. */
  marking: boolean;
  onGrade: (r: Rating) => void;
  /** Back to the box: Submit or Reveal was tapped too early. */
  onResume: () => void;
  onRecordWord: () => void;
  /**
   * A word held down in either sentence: the word, which of the two it was in,
   * and where it stands among that sentence's words.
   *
   * Which sentence is the card's business, not this screen's: a word taken from
   * the reference is kept beside Latin that is right by construction, and one
   * taken from what the student wrote is kept beside Latin that may not be. The
   * two texts are named the way `AttemptMarks` names them, so this screen goes
   * on talking about its own three texts and the mapping happens once, above.
   */
  onHoldWord: (
    word: string,
    where: "answer" | "submitted",
    index: number,
  ) => void;
  /** Double-click: look the word up rather than record it. */
  onInspectWord: (word: string) => void;
  onReadGrammar: () => void;
  onToggleMarking: () => void;
  /** A word tapped while marking: which text, and the word's index in it. */
  onMark: (field: keyof AttemptMarks, index: number) => void;
  /**
   * One of the three texts onto the clipboard, named the way `onMark` names
   * them and for the same reason: the strings themselves live above, and this
   * screen only ever says which of its three it means.
   */
  onCopy: (field: keyof AttemptMarks) => void;
  /** The question's words, folded away — the same panel as while writing. */
  vocabulary?: ReactNode;
  /**
   * What was written on this topic before, folded away. Below the comparison
   * rather than above it: the reference answer is what the screen is for, and
   * this is what you reach for once you have read it.
   */
  history?: ReactNode;
}) {
  // Named the way the trail names it, and worked out once: three places asked
  // the same question of it, and a fourth — whether there is anything here to
  // copy — made that one too many.
  const written = submitted.trim();

  return (
    <>
      <div className="study__scroll">
        {/* The eyebrow is the only line above the prompt, so it doubles as that
            text's label and carries its copy button. Beside the eyebrow rather
            than inside it, and nothing goes inside `.prompt`: that is one serif
            line of English, and a control in the middle of it would read as
            part of the sentence. */}
        <div className="prompt-head">
          <p className="eyebrow">
            {profile.ui.promptDirection}
            {total > 0 ? ` · ${index + 1}/${total}` : ""}
          </p>
          <CopyButton what="the question" onCopy={() => onCopy("prompt")} />
        </div>
        <p className="prompt">
          <Sentence
            text={question.prompt}
            marks={marks.prompt}
            /* No hold: the prompt is the language the student already reads,
               and there is nothing there worth a vocabulary card. */
            onMark={marking ? (i) => onMark("prompt", i) : undefined}
          />
        </p>
        {vocabulary}

        <div className={`compare${marking ? " compare--marking" : ""}`}>
          {!revealed && (
            <div className="compare__block">
              <div className="compare__head">
                <div className="compare__label">You wrote</div>
                {/* Only when there is something here. The block still stands
                    when nothing was written, saying so in italics, and a button
                    that put the word "nothing" on the clipboard would be a
                    small lie — the same reason the hint button below goes away
                    once it has run out rather than greying itself out. */}
                {written !== "" && (
                  <CopyButton
                    what="what you wrote"
                    onCopy={() => onCopy("submitted")}
                  />
                )}
              </div>
              <div
                className={`compare__text${written ? "" : " compare__text--empty"}`}
              >
                {written ? (
                  <Sentence
                    text={written}
                    marks={marks.submitted}
                    onHold={(word, i) => onHoldWord(word, "submitted", i)}
                    onInspect={onInspectWord}
                    onMark={marking ? (i) => onMark("submitted", i) : undefined}
                  />
                ) : (
                  "nothing"
                )}
              </div>
            </div>
          )}
          <div className="compare__block compare__block--reference">
            <div className="compare__head">
              <div className="compare__label">Reference</div>
              {/* The sentence alone. The note and the attribution stay on the
                  screen and off the clipboard: what is wanted elsewhere is the
                  Latin, and a citation pasted into a dictionary is noise. */}
              <CopyButton
                what="the reference answer"
                onCopy={() => onCopy("answer")}
              />
            </div>
            <div className="compare__text compare__text--reference">
              <Sentence
                text={question.answer}
                marks={marks.answer}
                onHold={(word, i) => onHoldWord(word, "answer", i)}
                onInspect={onInspectWord}
                onMark={marking ? (i) => onMark("answer", i) : undefined}
              />
            </div>
            {question.note && <div className="note">{question.note}</div>}
            {question.source && (
              <div className="attribution">
                — {question.source.author}, <cite>{question.source.work}</cite>
                {question.source.locus ? ` ${question.source.locus}` : ""}
              </div>
            )}
          </div>
        </div>
        <p className="hint">
          {marking
            ? "Tap a word: bold, italic, struck, off."
            : "Hold a word to save it to your vocabulary; double-tap it to look it up."}
        </p>
        {history}
      </div>

      <div className="linkrow">
        <button onClick={onResume}>✎ keep writing</button>
        <button onClick={onRecordWord}>+ record a word</button>
        <button onClick={onReadGrammar}>§ grammar</button>
        {/* What the grade cannot say. `↻ more of this` had this slot and gave
            it up: it only ever called the drill, which the map's topic sheet
            offers by name and this screen was the second way to. */}
        <button onClick={onToggleMarking} aria-pressed={marking}>
          {marking ? "✓ done marking" : "✱ mark"}
        </button>
      </div>
      <GradeBar onGrade={onGrade} schedule={schedule} settled={settled} />
    </>
  );
}

/**
 * A vocabulary card. English on the front throughout the app: the student
 * always produces the Latin, never recognises it.
 *
 * The back carries the sentences the word was met in, under the citation. A
 * card is a dictionary entry, and a dictionary entry is the one thing a word is
 * *not* while it is being learnt — the reason it stuck is the line it was read
 * in, and until this existed the card threw that line away.
 *
 * In front of the reveal there is a **hint**, on a card that has one: the
 * *English* half of a context and nothing else. Being reminded that this was the
 * line about the soldiers raising their hands is very often the whole of what
 * was missing, and it costs none of the answer — the Latin stays behind Show.
 * Nothing is written down about how much help was taken; that is the student's
 * to weigh when they grade themselves, which is the bargain Reveal already
 * strikes on a question.
 */
export function VocabReview({
  card,
  revealed,
  schedule,
  onReveal,
  onGrade,
  onEdit,
}: {
  card: VocabCardState;
  revealed: boolean;
  schedule?: Record<Rating, Date>;
  onReveal: () => void;
  onGrade: (r: Rating) => void;
  /** A wrong citation is never more obvious than when it is being reviewed. */
  onEdit: () => void;
}) {
  const contexts = card.contexts ?? [];
  const [hinted, setHinted] = useState(0);
  // The next card is a different word: its hints are not this one's, and a
  // count carried over would open it half-helped.
  useEffect(() => setHinted(0), [card.id]);

  return (
    <>
      <div className="study__scroll">
        <p className="eyebrow">Vocabulary · {profile.ui.sayItIn}</p>
        <p className="prompt">{card.gloss}</p>
        {/* Only while the answer is still hidden. Once it is revealed every
            prompt is on screen again inside its own sentence's block, and a
            hint left standing above them is the same line printed twice. */}
        {!revealed &&
          contexts.slice(0, hinted).map((c) => (
            <p className="context__prompt" key={c.at}>
              {c.prompt}
            </p>
          ))}
        {revealed && (
          <div className="compare">
            <div className="compare__block compare__block--reference">
              <div className="compare__label">Citation</div>
              <div className="compare__text compare__text--reference">
                {card.citation}
              </div>
              {(card.pos || card.declension) && (
                <div className="note">
                  {[card.pos, card.gender, card.declension && `declension ${card.declension}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
            {contexts.map((c) => (
              <div
                className={`compare__block${
                  c.source === "answer" ? " compare__block--reference" : ""
                }`}
                key={c.at}
              >
                {/* The graded screen's own two labels, so the card back reads
                    like the screen the word was taken from — and so a sentence
                    the student wrote, which may be wrong, never passes for the
                    reference. */}
                <div className="compare__label">
                  {c.source === "answer" ? "Reference" : "You wrote"}
                </div>
                <div className="context__prompt">{c.prompt}</div>
                <div
                  className={`compare__text${
                    c.source === "answer" ? " compare__text--reference" : ""
                  }`}
                >
                  {/* No hold and no marking, so this takes `Sentence`'s plain
                      branch and the held word picks up `.mark--b` — the
                      emphasis that already means *this word*. An index naming
                      no token simply highlights nothing, which is why the
                      index is handed over rather than used to slice the text. */}
                  <Sentence
                    text={c.sentence}
                    marks={c.index === undefined ? undefined : { [c.index]: 1 }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="linkrow">
        <button onClick={onEdit}>✎ edit this word</button>
        {/* Only while there is another one to give: a hint button that has run
            out is a button that answers a press with nothing. */}
        {!revealed && hinted < contexts.length && (
          <button onClick={() => setHinted((n) => n + 1)}>
            ◔ {hinted === 0 ? "hint" : "another hint"}
          </button>
        )}
      </div>
      {revealed ? (
        <GradeBar onGrade={onGrade} schedule={schedule} />
      ) : (
        <div className="actions">
          <button className="btn btn--primary" onClick={onReveal}>
            Show
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The book is worked out. A rest screen rather than an empty one: the work is
 * finished, which is the good outcome, and the index is right there for anyone
 * who wants to push on anyway.
 *
 * Only ever reached from exploring. Clearing the reviews throws the switch
 * back to the book rather than stopping, so "nothing due" is a thing the app
 * passes through and never a screen it leaves you on.
 */
export function Rest({
  overall,
  nextDue,
  onOpenMap,
  onOpenSchedule,
}: {
  overall: number;
  nextDue?: Date;
  onOpenMap: () => void;
  onOpenSchedule: () => void;
}) {
  return (
    <div className="centered">
      <Ring percent={overall} />
      <h1>The book is worked out.</h1>
      <p>
        {nextDue
          ? `The next topic comes back ${nextDue.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}.`
          : "Well done."}
      </p>
      <div
        className="actions"
        style={{ width: "100%", maxWidth: "18rem", flexDirection: "column" }}
      >
        <button className="btn" onClick={onOpenMap}>
          Explore the grammar index
        </button>
        <button className="btn" onClick={onOpenSchedule}>
          See what's coming
        </button>
      </div>
    </div>
  );
}

/**
 * A practice run worked out.
 *
 * The loop stops here rather than moving on. "Stay on this topic" was an
 * instruction, and sliding quietly off it is not how an instruction ends — the
 * student would find a different topic on screen and have to work out that
 * anything had happened. It is also the one moment when "what now" is a real
 * question, so it is asked, with the three answers to it.
 */
export function Practised({
  title,
  total,
  onAgain,
  onBook,
  onOpenMap,
}: {
  title: string;
  /** How many questions the bank holds — what another run would be for. */
  total: number;
  onAgain: () => void;
  onBook: () => void;
  onOpenMap: () => void;
}) {
  return (
    <div className="centered">
      <h1>All practised.</h1>
      <p>
        Every question on {title} has been through this run.
      </p>
      <div
        className="actions"
        style={{ width: "100%", maxWidth: "18rem", flexDirection: "column" }}
      >
        <button className="btn btn--primary" onClick={onAgain}>
          Practise all {total} again
        </button>
        <button className="btn" onClick={onBook}>
          Back to the book in order
        </button>
        <button className="btn btn--quiet" onClick={onOpenMap}>
          Grammar index
        </button>
      </div>
    </div>
  );
}

