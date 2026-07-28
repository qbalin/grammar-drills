/**
 * The trail of earlier answers on a topic, laid out for the terminal.
 *
 * Self-grading means the app never tells you whether you were right, so the
 * only record of what you actually wrote is the one it keeps. A topic comes
 * back weeks later; seeing the same prompt with last time's answer and the
 * correction beside it is where the learning is.
 *
 * Pre-wrapped, one entry per screen line, for the same reason the grammar
 * pager is: scrolling counts screen lines, and answers can outrun the pane.
 */

import {
  latinWords,
  normalize,
  type Attempt,
  type BankedQuestion,
  type ScheduleEntry,
} from "@latin-tutor/core";
import { wrapLines } from "./pager.js";

/** How a line is coloured: the same vocabulary the graded screen uses. */
export type Tone = "meta" | "prompt" | "yours" | "correct";

export interface HistoryLine {
  text: string;
  tone: Tone;
}

const RATING_LABELS: Record<number, string> = {
  1: "again",
  2: "hard",
  3: "good",
  4: "easy",
};

/** Labels wide enough to align the two answers under each other. */
const YOURS = "you     ";
const CORRECT = "correct ";
const MATCHED = "✓       ";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 days ago" — when you last met this question, in words. */
export function relativeTime(at: string, now: Date = new Date()): string {
  const then = new Date(at).getTime();
  if (Number.isNaN(then)) return "earlier";
  const ago = Math.max(0, now.getTime() - then);
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) {
    const n = Math.floor(ago / MINUTE);
    return n === 1 ? "a minute ago" : `${n} minutes ago`;
  }
  if (ago < DAY) {
    const n = Math.floor(ago / HOUR);
    return n === 1 ? "an hour ago" : `${n} hours ago`;
  }
  const days = Math.floor(ago / DAY);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/**
 * True when what was written is the reference answer. Compared the way the
 * rest of the app compares Latin — macrons are editorial, u/v and i/j are
 * spelling variants — so a right answer typed without macrons still reads as
 * right rather than as a correction.
 */
function matches(submitted: string, answer: string): boolean {
  const fold = (s: string) => latinWords(normalize(s)).join(" ");
  return fold(submitted) !== "" && fold(submitted) === fold(answer);
}

/**
 * One attempt as screen lines: when it was, what was asked, what you wrote,
 * and — only when they differ — what it should have been. Entries are
 * separated by a blank line; the caller renders them by tone.
 */
export function attemptLines(
  attempts: Attempt[],
  width: number,
  now: Date = new Date(),
): HistoryLine[] {
  const out: HistoryLine[] = [];
  const wrap = (text: string, tone: Tone) => {
    for (const line of wrapLines(text, width)) out.push({ text: line, tone });
  };
  attempts.forEach((a, i) => {
    if (i > 0) out.push({ text: "", tone: "meta" });
    const grade = RATING_LABELS[a.rating] ?? String(a.rating);
    wrap(`${relativeTime(a.at, now)} · graded ${grade}`, "meta");
    wrap(a.prompt, "prompt");
    const written = a.submitted.trim();
    if (matches(written, a.answer)) {
      wrap(`${MATCHED}${written}`, "correct");
    } else {
      wrap(`${YOURS}${written || "—"}`, "yours");
      wrap(`${CORRECT}${a.answer}`, "correct");
    }
  });
  return out;
}

/**
 * A section's whole question bank as screen lines: every question with the Latin
 * it wants, and under it what has been written on that question and when.
 *
 * One scrollable document rather than a list to walk with a cursor. The reason
 * is what it is for: revising a topic means reading the questions in a row, and
 * the answer trail belongs beside the question it answers rather than a keypress
 * away from it.
 */
export function questionBankLines(
  questions: BankedQuestion[],
  width: number,
  now: Date = new Date(),
): HistoryLine[] {
  const out: HistoryLine[] = [];
  const wrap = (text: string, tone: Tone) => {
    for (const line of wrapLines(text, width)) out.push({ text: line, tone });
  };
  questions.forEach((q, i) => {
    if (i > 0) out.push({ text: "", tone: "meta" });
    wrap(`${i + 1}. ${q.prompt}`, "prompt");
    wrap(`${CORRECT}${q.answer}`, "correct");
    if (q.note) wrap(`        ${q.note}`, "meta");
    for (const a of q.attempts) {
      const grade = RATING_LABELS[a.rating] ?? String(a.rating);
      const written = a.submitted.trim();
      wrap(
        `        ${relativeTime(a.at, now)} · graded ${grade}${
          matches(written, a.answer) ? " · matched" : ""
        }`,
        "meta",
      );
      // The reference is already above; only what was written is news here.
      if (!matches(written, a.answer)) {
        wrap(`${YOURS}${written || "—"}`, "yours");
      }
    }
  });
  return out;
}

/** "in 3 days" / "waiting" — the schedule reads forwards, not backwards. */
function untilTime(due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return "waiting";
  if (ms < HOUR) {
    const n = Math.max(1, Math.round(ms / MINUTE));
    return n === 1 ? "in a minute" : `in ${n} minutes`;
  }
  if (ms < DAY) {
    const n = Math.round(ms / HOUR);
    return n === 1 ? "in an hour" : `in ${n} hours`;
  }
  const days = Math.round(ms / DAY);
  if (days === 1) return "tomorrow";
  if (days < 30) return `in ${days} days`;
  const months = Math.round(days / 30);
  return months === 1 ? "in a month" : `in ${months} months`;
}

/** The day a due date falls on, as a heading. */
function dayHeading(due: Date, now: Date): string {
  if (due.getTime() <= now.getTime()) return "Waiting now";
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(now)) / DAY);
  if (days <= 0) return "Later today";
  if (days === 1) return "Tomorrow";
  return due.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * What is coming back, grouped by the day it lands on.
 *
 * Spaced repetition keeps its plan to itself: the app serves one card at a time
 * and never says whether tomorrow is quiet or forty topics deep. This is that
 * plan, and the only question anyone asks of it is "how much, and when".
 */
export function scheduleLines(
  entries: ScheduleEntry[],
  width: number,
  now: Date = new Date(),
): HistoryLine[] {
  const out: HistoryLine[] = [];
  const wrap = (text: string, tone: Tone) => {
    for (const line of wrapLines(text, width)) out.push({ text: line, tone });
  };
  if (entries.length === 0) {
    wrap("Nothing is scheduled yet — topics and words appear here once graded.", "meta");
    return out;
  }
  let heading: string | undefined;
  for (const entry of entries) {
    const day = dayHeading(entry.due, now);
    if (day !== heading) {
      if (heading !== undefined) out.push({ text: "", tone: "meta" });
      const count = entries.filter((e) => dayHeading(e.due, now) === day).length;
      wrap(`${day} · ${count}`, "prompt");
      heading = day;
    }
    const label =
      entry.kind === "topic" ? `${entry.sub ?? ""} ${entry.title}`.trim() : entry.title;
    wrap(
      `  ${label}  —  ${untilTime(entry.due, now)}`,
      entry.kind === "topic" ? "correct" : "yours",
    );
  }
  return out;
}
