import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";
import type { SerializedCard } from "./types.js";

/**
 * Self-grade values, matching the reference project's FSRS ratings:
 *   1 = again (failed), 2 = hard (faltered), 3 = good, 4 = easy (effortless).
 * These map directly onto ts-fsrs Rating.Again..Rating.Easy (1..4).
 */
export type Rating = 1 | 2 | 3 | 4;

const engine = fsrs();

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
