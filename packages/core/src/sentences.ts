import {
  deserializeCard,
  newCard,
  preview,
  rate,
  serializeCard,
  type Rating,
} from "./scheduler.js";
import { questionId } from "./question-id.js";
import type {
  CardMarks,
  Progress,
  Question,
  SentenceCardState,
} from "./types.js";

/**
 * What became of a question offered to the deck.
 *
 * Two ways rather than one, because a surface that reported both as "kept"
 * would flash a confirmation for a press that did nothing — the same reason
 * `ContextOutcome` is four values and not a boolean.
 */
export type KeepOutcome = "kept" | "duplicate";

/**
 * The sentences the student decided to keep.
 *
 * The app teaches out of a bank of questions filed under grammar topics, and a
 * sentence arrives because its topic came round. Some of them are worth more
 * than that: a line of Cicero met while working through the ablative is a line
 * of Cicero, and the ablative is not what makes it worth meeting again. A word
 * could be lifted out of an answer and kept since the vocabulary deck existed.
 * A whole sentence could not, and this is that.
 *
 * Beside `VocabDeck` and built the same way — a store of cards and a scheduler
 * track of its own, knowing nothing about topics, rounds or the syllabus. It is
 * smaller: a sentence needs no dictionary to resolve it and no fold to dedupe
 * it, because the question it came from already carries its own identity.
 *
 * It reads the progress through a **getter** rather than holding the record,
 * for the reason written over `VocabDeck`: `Session.restore` replaces `this.p`
 * wholesale for an undo, and a deck that had captured `sentenceCards` at
 * construction would go on writing to the object the undo threw away —
 * silently, since both are real objects and neither read throws.
 */
export class SentenceDeck {
  constructor(
    private readonly progress: () => Progress,
    private readonly touch: () => void,
  ) {}

  private get p(): Progress {
    return this.progress();
  }

  /**
   * The card id a question would take, without making one.
   *
   * `questionId` derived from the prompt and the answer, which is what that
   * function was written for and kept for: its own note says it is "load-bearing
   * the moment" something has to file progress against a question rather than a
   * topic. This is that moment. What it buys here is that the id survives the
   * bank being regenerated — the same sentence rebuilds to the same id, so a
   * card kept a year ago is still the card for the question in front of you —
   * and that keeping the same sentence twice is a no-op rather than a second
   * card of the same line.
   *
   * The `s-` mirrors `vocabIdFor`'s `v-`, so no id of one deck can ever be read
   * as an id of the other.
   */
  sentenceIdFor(prompt: string, answer: string): string {
    return `s-${questionId(prompt, answer)}`;
  }

  /** Whether this question is already kept — what the button asks before it draws. */
  hasSentence(prompt: string, answer: string): boolean {
    return this.p.sentenceCards[this.sentenceIdFor(prompt, answer)] !== undefined;
  }

  /**
   * Keep a question, with whatever was picked out in it at that moment.
   *
   * The marks are copied rather than referenced, and only the two texts the
   * card draws: what the student wrote is not on the card, so an emphasis over
   * it would be an emphasis over a sentence that is not there.
   *
   * Keeping one already kept changes nothing at all — not the schedule, not the
   * marks. A card is what it was when it was made, and a second press months
   * later is far likelier to be a student forgetting they had it than a student
   * asking for the marks to be rewritten. Forgetting it and keeping it again is
   * the way to say the other thing, and forgetting has a way back.
   */
  keepSentence(
    question: Question,
    sectionId: string,
    marks?: CardMarks,
    now: Date = new Date(),
  ): { id: string; outcome: KeepOutcome } {
    const id = this.sentenceIdFor(question.prompt, question.answer);
    if (this.p.sentenceCards[id]) return { id, outcome: "duplicate" };
    const kept = marks && (marks.prompt || marks.answer);
    this.p.sentenceCards[id] = {
      id,
      created: now.toISOString(),
      fsrs: serializeCard(newCard(now)),
      prompt: question.prompt,
      answer: question.answer,
      sectionId,
      // Absent rather than empty on the great majority, which nobody marked —
      // so a card made without marking reads on disk exactly as it would have
      // before marking existed.
      ...(question.note ? { note: question.note } : {}),
      ...(question.source ? { source: question.source } : {}),
      ...(kept
        ? {
            marks: {
              ...(marks.prompt ? { prompt: { ...marks.prompt } } : {}),
              ...(marks.answer ? { answer: { ...marks.answer } } : {}),
            },
          }
        : {}),
    };
    this.touch();
    return { id, outcome: "kept" };
  }

  sentenceCard(cardId: string): SentenceCardState | undefined {
    return this.p.sentenceCards[cardId];
  }

  /**
   * Every sentence kept, newest first.
   *
   * The other way round from `vocabList`, which sorts by citation, and the
   * asymmetry is the point rather than an oversight: a vocabulary deck is a
   * dictionary and has an order of its own to be read in, while a kept sentence
   * has none — what a commonplace book is looked at for is the last thing put
   * into it.
   */
  sentenceList(): SentenceCardState[] {
    return Object.values(this.p.sentenceCards).sort((a, b) =>
      b.created.localeCompare(a.created),
    );
  }

  gradeSentence(cardId: string, rating: Rating, now: Date = new Date()): void {
    const state = this.p.sentenceCards[cardId];
    if (!state) return;
    state.fsrs = serializeCard(rate(deserializeCard(state.fsrs), rating, now));
    this.touch();
  }

  previewSentence(
    cardId: string,
    now: Date = new Date(),
  ): Record<Rating, Date> | undefined {
    const stored = this.p.sentenceCards[cardId];
    return stored ? preview(deserializeCard(stored.fsrs), now) : undefined;
  }

  /** Forget a sentence — the way back from a card kept by a stray press. */
  deleteSentence(cardId: string): void {
    if (!this.p.sentenceCards[cardId]) return;
    delete this.p.sentenceCards[cardId];
    this.touch();
  }

  /**
   * Put a forgotten card back exactly as it was — id, schedule, marks and all.
   *
   * One card rather than a snapshot of the whole progress, for the reason
   * written over `VocabDeck.restoreCard`: the toast offering this lasts a few
   * seconds, a student can answer a question inside it, and a whole-progress
   * restore would quietly take that grade back too.
   *
   * A no-op if something already sits under that id. Keeping the sentence again
   * by hand before pressing undo is the student saying what they want, and the
   * older copy must not overwrite it.
   */
  restoreCard(card: SentenceCardState): void {
    if (this.p.sentenceCards[card.id]) return;
    this.p.sentenceCards[card.id] = card;
    this.touch();
  }
}
