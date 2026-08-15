import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";
import type { SerializedCard } from "./types.js";

/**
 * Self-grade values, matching the reference project's FSRS ratings:
 *   1 = again (failed), 2 = hard (faltered), 3 = good, 4 = easy (effortless).
 * These map directly onto ts-fsrs Rating.Again..Rating.Easy (1..4).
 */
export type Rating = 1 | 2 | 3 | 4;

/**
 * Two departures from the stock parameters, and the rest left alone.
 *
 * **Fuzz.** Off by default, which means a cohort of topics introduced in one
 * sitting comes back on the same day for ever — a student who spent an evening
 * on the declensions meets all of them again in one lump, then again in one
 * lump, until something breaks the tie. Fuzz spreads them.
 *
 * It has to be checked against this app's own promise rather than assumed
 * harmless: the grade buttons are labelled with the interval each one buys, and
 * `previewTopic` exists so they never name one the round cannot reach. Fuzz that
 * rolled fresh each call would make the label a guess. It does not — verified
 * against a matured card, where `repeat()` and `next()` agree and two previews
 * of the same card agree with each other, so the number under the button is
 * still the number.
 *
 * **A hundred years is not an interval.** `maximum_interval` defaults to 36500
 * days, and a card really does reach it: eight *easy* grades in a row put one
 * due in the year 2555, which is a card the student will never see again and a
 * date the schedule screen would print. Five years is still far longer than any
 * course and is a length somebody could actually come back from.
 */
const engine = fsrs({ enable_fuzz: true, maximum_interval: 365 * 5 });

export function newCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/** Apply a self-grade, returning the rescheduled card. */
export function rate(card: Card, rating: Rating, now: Date = new Date()): Card {
  return engine.next(card, now, rating as Grade).card;
}

export function isDue(card: Card, now: Date = new Date()): boolean {
  return card.due.getTime() <= now.getTime();
}

/**
 * When each of the four grades would bring the card back — the numbers a UI
 * can put on its grade buttons, so a self-grade shows its consequence.
 *
 * Due dates rather than day counts: a card in its learning steps comes back in
 * minutes, and `scheduled_days` rounds all of those to 0.
 */
export function preview(
  card: Card,
  now: Date = new Date(),
): Record<Rating, Date> {
  const log = engine.repeat(card, now);
  return {
    1: log[1].card.due,
    2: log[2].card.due,
    3: log[3].card.due,
    4: log[4].card.due,
  };
}

export function serializeCard(card: Card): SerializedCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
    learning_steps: (card as { learning_steps?: number }).learning_steps,
  };
}

export function deserializeCard(s: SerializedCard): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
    learning_steps: s.learning_steps ?? 0,
  } as Card;
}
