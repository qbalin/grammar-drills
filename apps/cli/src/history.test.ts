import { describe, expect, it } from "vitest";
import type { Attempt } from "@latin-tutor/core";
import { attemptLines, relativeTime } from "./history.js";

const now = new Date("2026-01-10T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  prompt: "The girl loves the rose.",
  answer: "puella rosam amat",
  submitted: "puella rosa amat",
  rating: 2,
  at: ago(3 * 86_400_000),
  ...over,
});

const text = (lines: { text: string }[]) => lines.map((l) => l.text).join("\n");

describe("relativeTime", () => {
  it("says how long ago in words", () => {
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(60_000), now)).toBe("a minute ago");
    expect(relativeTime(ago(20 * 60_000), now)).toBe("20 minutes ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 hours ago");
    expect(relativeTime(ago(86_400_000), now)).toBe("yesterday");
    expect(relativeTime(ago(5 * 86_400_000), now)).toBe("5 days ago");
    expect(relativeTime(ago(70 * 86_400_000), now)).toBe("2 months ago");
  });

  it("does not choke on an unreadable timestamp", () => {
    expect(relativeTime("not a date", now)).toBe("earlier");
  });
});

describe("attemptLines", () => {
  it("shows the question, the answer written, and the correction", () => {
    const lines = attemptLines([attempt()], 60, now);
    expect(text(lines)).toContain("3 days ago · graded hard");
    expect(text(lines)).toContain("The girl loves the rose.");
    expect(text(lines)).toContain("you     puella rosa amat");
    expect(text(lines)).toContain("correct puella rosam amat");
    // Each part is coloured by what it is.
    expect(lines.find((l) => l.text.startsWith("you"))!.tone).toBe("yours");
    expect(lines.find((l) => l.text.startsWith("correct"))!.tone).toBe("correct");
  });

  it("marks an answer that was right instead of correcting it", () => {
    // Macrons are editorial and u/v spelling variants: neither makes a
    // correction out of an answer that was right.
    const lines = attemptLines(
      [attempt({ submitted: "  puella rosam amat! " }), attempt({ submitted: "PVELLA rosam amat" })],
      60,
      now,
    );
    expect(text(lines)).toContain("✓       puella rosam amat!");
    expect(text(lines)).toContain("✓       PVELLA rosam amat");
    expect(text(lines)).not.toContain("correct");
  });

  it("keeps a blank answer legible and still corrects it", () => {
    const lines = attemptLines([attempt({ submitted: "   " })], 60, now);
    expect(text(lines)).toContain("you     —");
    expect(text(lines)).toContain("correct puella rosam amat");
  });

  it("separates entries and wraps to the pane, one entry per screen line", () => {
    const long = attempt({
      prompt: "The girl who lives in the great house loves the rose in the garden.",
      submitted: "puella quae in magna casa habitat rosam in horto amat bene",
    });
    const lines = attemptLines([long, attempt()], 30, now);
    expect(lines.every((l) => l.text.length <= 30)).toBe(true);
    expect(lines.some((l) => l.text === "")).toBe(true); // one blank between entries
  });
});
