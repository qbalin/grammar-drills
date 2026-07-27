import type { ScheduleEntry } from "@latin-tutor/core";
import { Sheet, until } from "../ui.js";

/**
 * What is coming back, and when.
 *
 * Spaced repetition hides its own plan: the app serves one card at a time and
 * says nothing about the shape of the week, so a student cannot tell a quiet
 * Tuesday from the day forty topics land at once. `Rest` already says when the
 * next thing comes; this is the rest of the list.
 *
 * Grouped by day rather than listed by timestamp, because the only question
 * anyone asks of a schedule is "how much, and when".
 */

/** The day a due date falls on, as a heading. */
function dayLabel(due: Date, now: Date): string {
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(now)) / 86_400_000);
  if (due.getTime() <= now.getTime()) return "Waiting now";
  if (days <= 0) return "Later today";
  if (days === 1) return "Tomorrow";
  if (days < 7) {
    return due.toLocaleDateString(undefined, { weekday: "long" });
  }
  return due.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function ScheduleSheet({
  entries,
  vocabCount,
  now = new Date(),
  onClose,
  onOpenVocab,
}: {
  entries: ScheduleEntry[];
  vocabCount: number;
  now?: Date;
  onClose: () => void;
  onOpenVocab: () => void;
}) {
  // One pass, in the order `upcoming()` already sorted them, so a day's heading
  // appears exactly where that day begins.
  const days: { label: string; entries: ScheduleEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.due, now);
    const last = days.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }

  return (
    <Sheet title="Coming up" onClose={onClose}>
      {entries.length === 0 ? (
        <p className="field__hint" style={{ marginTop: 0 }}>
          Nothing is scheduled yet. Topics and words appear here once you have
          graded them.
        </p>
      ) : (
        days.map((day) => (
          <div key={day.label}>
            <div className="section-title">
              {day.label} · {day.entries.length}
            </div>
            <div className="list">
              {day.entries.map((e) => (
                <div className="row row--static" key={`${e.kind}-${e.id}`}>
                  <span className="row__main">
                    <span className="row__title">
                      {e.kind === "vocab" && <span className="row__ref">word</span>}
                      {e.kind === "topic" && e.sub && (
                        <span className="row__ref">{e.sub}</span>
                      )}
                      {e.title}
                    </span>
                    <span className="row__sub">
                      {e.kind === "vocab" ? `${e.sub} · ` : ""}
                      {e.overdue ? "waiting" : `in ${until(now, e.due)}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="actions">
        <button className="btn" onClick={onOpenVocab}>
          All {vocabCount} {vocabCount === 1 ? "word" : "words"}
        </button>
      </div>
    </Sheet>
  );
}
