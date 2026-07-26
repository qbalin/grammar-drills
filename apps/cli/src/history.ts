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

import { normalize, type Attempt } from "@latin-tutor/core";
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
  const fold = (s: string) =>
    normalize(s)
      .replace(/[^\p{Letter}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
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
