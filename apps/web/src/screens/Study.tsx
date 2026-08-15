import { useEffect, useState, type ReactNode } from "react";
import type {
  AttemptMarks,
  Question,
  Rating,
  VocabCardState,
  VocabContext,
} from "@lang-tutor/core";
import { comesBack, CopyButton, GradeBar, l2Attrs, Sentence } from "../ui.js";
import { profile } from "../pack.js";

/**
 * How the two word gestures work, said once.
 *
 * One constant because it is one gesture: the graded screen and a card's back
 * offer exactly the same press, and two wordings for it are how a student
 * concludes there are two of them.
 */
const GESTURE_HINT =
  "Hold a word to save it to your vocabulary; double-tap it to look it up.";

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
  onDismiss,
  dismissing,
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
  /**
   * Take this topic out of the review pile. Absent on a round that is not a
   * review, where there is no pile to take it off.
   */
  onDismiss?: () => void;
  /** Whether the first press has been given and the next one goes ahead. */
  dismissing?: boolean;
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
                {...l2Attrs}
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
            <div {...l2Attrs} className="compare__text compare__text--reference">
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
          {marking ? "Tap a word: bold, italic, struck, off." : GESTURE_HINT}
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
        {/*
         * Only on a review, and that is the whole of the rule: this is the
         * moment a topic has just proved it is not what the student needs, in
         * the same way `✎ edit this word` is on the vocabulary card that has
         * just proved it. On a run of practice there is nothing to stop — the
         * topic was chosen a moment ago, and leaving is picking another.
         *
         * Two presses, like every other deletion here. The first press says
         * what will happen; the topic is not hidden, only taken off the pile,
         * and a grade puts it back.
         */}
        {onDismiss && (
          <button onClick={onDismiss}>
            {dismissing ? "⊘ confirm — stop reviewing" : "⊘ stop reviewing this"}
          </button>
        )}
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
 *
 * Those sentences answer to the same two gestures the graded screen's do, and
 * for the same reason they exist at all: a line kept because of one word is
 * still a line, full of others. Reading `mīlitum` on the back of `manus` and
 * being able to do nothing with it was the card keeping the context and then
 * withholding it.
 */
export function VocabReview({
  card,
  revealed,
  schedule,
  onReveal,
  onGrade,
  onEdit,
  onHoldWord,
  onInspectWord,
  onCopy,
}: {
  card: VocabCardState;
  revealed: boolean;
  schedule?: Record<Rating, Date>;
  onReveal: () => void;
  onGrade: (r: Rating) => void;
  /** A wrong citation is never more obvious than when it is being reviewed. */
  onEdit: () => void;
  /**
   * A word held down in one of the card's sentences: the word, the context it
   * stood in, and where it stands among that sentence's words.
   *
   * The context goes up whole rather than being named the way the graded screen
   * names its two texts, because unlike those it lives nowhere above this
   * screen — it is the record being drawn, and the card that gets written keeps
   * a copy of it. The index rides along for the reason it does on a question:
   * the word alone cannot say which `rosam` of two was under the thumb.
   */
  onHoldWord: (word: string, kept: VocabContext, index: number) => void;
  /** Double-click: look the word up rather than record it, as on a question. */
  onInspectWord: (word: string) => void;
  /**
   * One block's Latin onto the clipboard. It earns its place for the reason the
   * graded screen's buttons do: the words are `.word` spans now, and `.word`
   * gives up text selection to keep iOS's magnifier off the 500 ms hold — which
   * leaves the sentence readable and un-liftable.
   */
  onCopy: (kept: VocabContext) => void;
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
              <div {...l2Attrs} className="compare__text compare__text--reference">
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
                <div className="compare__head">
                  {/* The graded screen's own two labels, so the card back reads
                      like the screen the word was taken from — and so a sentence
                      the student wrote, which may be wrong, never passes for the
                      reference. */}
                  <div className="compare__label">
                    {c.source === "answer" ? "Reference" : "You wrote"}
                  </div>
                  {/* The button names the sentence and not the block, because a
                      card keeps up to eight of them and several can share a
                      source: "the reference" announced three times is three
                      identical controls to anyone who cannot see which block
                      each one stands in. Naming it by its text is the edit
                      sheet's own convention — `Move “…” up`, `Edit “…”` — and
                      two blocks holding the same sentence copy the same thing,
                      so two identical labels there are the truth. */}
                  <CopyButton what={`the sentence “${c.sentence}”`} onCopy={() => onCopy(c)} />
                </div>
                <div className="context__prompt">{c.prompt}</div>
                <div
                  {...l2Attrs}
                  className={`compare__text${
                    c.source === "answer" ? " compare__text--reference" : ""
                  }`}
                >
                  {/* The holdable branch, so the word the card was made from
                      wears `.word--b` where it wore `.mark--b`; the two are one
                      rule in the stylesheet, so nothing moves on screen. Still
                      no marking: a card is not an attempt, and a context has
                      nowhere for a student's emphasis to live. An index naming
                      no token simply highlights nothing, which is why the index
                      is handed over rather than used to slice the text. */}
                  <Sentence
                    text={c.sentence}
                    marks={c.index === undefined ? undefined : { [c.index]: 1 }}
                    onHold={(word, i) => onHoldWord(word, c, i)}
                    onInspect={onInspectWord}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Only where there is a sentence to use it on. The citation above is
            plain text, and a card that has kept none would be promising a
            gesture with nothing to act on. */}
        {revealed && contexts.length > 0 && <p className="hint">{GESTURE_HINT}</p>}
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
 * Nothing on the table: no topic has been chosen, and nothing is due.
 *
 * This used to say "the book is worked out", because there was always something
 * to hand over — a cursor walked the syllabus and the only way to run out was to
 * finish it. Nothing walks now. The app studies the topic you asked for, so with
 * no topic asked for the honest screen is the one that asks, and the index leads
 * because it is the answer rather than a consolation.
 *
 * Only ever reached from exploring. Clearing the reviews throws the switch here
 * rather than leaving a student on a rest screen beside a pile of nothing.
 */
export function Rest({
  dueNow,
  nextDue,
  onOpenMap,
  onOpenSchedule,
}: {
  /**
   * How much is waiting on the *other* errand.
   *
   * This screen is only ever reached while exploring, and exploring is reached
   * by choice — so a pile can be waiting behind it. Saying "nothing is due"
   * over a switch reading `3 due` is the kind of small lie that makes a reader
   * stop believing the rest of the screen.
   */
  dueNow: number;
  nextDue?: Date;
  onOpenMap: () => void;
  onOpenSchedule: () => void;
}) {
  return (
    <div className="centered">
      <h1>Pick a topic.</h1>
      <p>
        No topic is being practised. Choose one from the index and stay on it
        for as long as you like.
        {dueNow > 0
          ? ` ${dueNow} review${dueNow === 1 ? " is" : "s are"} waiting, whenever you want ${dueNow === 1 ? "it" : "them"}.`
          : nextDue
            ? ` Nothing is due; the next review comes back ${nextDue.toLocaleDateString(
                undefined,
                { weekday: "long", month: "short", day: "numeric" },
              )}.`
            : " Nothing is due."}
      </p>
      <div
        className="actions"
        style={{ width: "100%", maxWidth: "18rem", flexDirection: "column" }}
      >
        <button className="btn btn--primary" onClick={onOpenMap}>
          Grammar index
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
 * question, so it is asked, with the two answers to it: this topic again, or a
 * different one. There is no third, because there is nowhere else to be sent.
 */
export function Practised({
  title,
  total,
  onAgain,
  onOpenMap,
}: {
  title: string;
  /** How many questions the bank holds — what another run would be for. */
  total: number;
  onAgain: () => void;
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
        <button className="btn" onClick={onOpenMap}>
          Pick another topic
        </button>
      </div>
    </div>
  );
}

/**
 * Where the loop stands still.
 *
 * A round finished, or the pile emptied, or both — which is one moment, and is
 * drawn as one card rather than as two to dismiss in a row. Before this the
 * burst fired and `advance` was called in the same breath, so the confetti for
 * the round just finished played over the *next* topic's first prompt and the
 * thing being celebrated was already off the screen.
 *
 * It says two things and refuses a third: what was worked on, and when it comes
 * back. Not how it was graded. Every grade in the round has already been given
 * and has already moved the schedule, and a screen that added them up would turn
 * four self-assessments into a score — for a loop whose whole design is that
 * nothing marks you.
 *
 * It used to say a third thing: four cells drawing where the topic's mastery
 * stood and which of them this round moved. That score is gone — it filled after
 * three good answers, so what it drew was how many questions a topic had been
 * asked, in the clothes of how well they had gone.
 *
 * `round` is absent when a vocabulary card emptied the pile, since a word has no
 * round behind it. `cleared` is false on the great majority of rounds, which
 * finish with plenty still waiting.
 */
export function Landed({
  title,
  round,
  cleared,
  met,
  nextDue,
  onKeepGoing,
  onStop,
}: {
  /** The topic just finished; absent with `round`. */
  title?: string;
  round?: { due: Date };
  /** The last thing waiting went with this grade. */
  cleared: boolean;
  /**
   * An author met for the first time, named.
   *
   * In words rather than only in confetti, and that is the point of it: a
   * burst says something happened without saying what, and for a reader who
   * has asked for reduced motion there is no burst at all. The line is what
   * they get, and it is the half that carries the meaning.
   */
  met?: string;
  nextDue?: Date;
  onKeepGoing: () => void;
  onStop: () => void;
}) {
  return (
    <div className="centered">
      <h1>{round ? title : "The pile is clear."}</h1>
      {met && <p className="landed__met">Your first line of {met}.</p>}
      {round && <p>{comesBack(round.due)}</p>}
      {cleared && round && (
        <p className="landed__cleared">And that was the last thing waiting.</p>
      )}
      {cleared && !round && (
        <p>
          {nextDue
            ? `The next comes back ${nextDue.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}.`
            : "Nothing is waiting."}
        </p>
      )}
      <div
        className="actions"
        style={{ width: "100%", maxWidth: "18rem", flexDirection: "column" }}
      >
        {/* Clearing the pile leaves nothing on the table but the topic you
            chose, if you chose one — so the primary is what to do next rather
            than a claim there is more of the same waiting. */}
        <button className="btn btn--primary" onClick={onKeepGoing}>
          {cleared ? "Carry on" : "Keep going"}
        </button>
        {/*
         * Not a fourth screen to land on. There is no session in this app, and
         * inventing one to give this button somewhere to go would mean passing
         * a verdict on how much was done today — which is a countable reward
         * wearing another hat. What somebody who is stopping actually wants is
         * to know when this comes back, and the schedule already says so. The
         * card is underneath it either way: a screen with no question on it,
         * which is the resting place.
         */}
        <button className="btn btn--quiet" onClick={onStop}>
          Stop here
        </button>
      </div>
    </div>
  );
}

