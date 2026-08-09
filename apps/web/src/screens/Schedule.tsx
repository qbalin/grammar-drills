import type { ScheduleEntry } from "@lang-tutor/core";
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
 *
 * What is waiting now is also a way in to itself. The list used to say what was
 * due and then refuse to serve any of it: the only route to the pile was the
 * Review switch, which hands over whatever the scheduler picked, so a student
 * looking at the one card they wanted could not say "that one". A row that has
 * come due is a button; a row still to come is not, because there is nothing
 * yet to start.
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

/** What one row says about itself, whether or not it can be tapped. */
function EntryBody({
  entry,
  now,
  untestable,
}: {
  entry: ScheduleEntry;
  now: Date;
  untestable: boolean;
}) {
  return (
    <span className="row__main">
      <span className="row__title">
        {entry.kind === "vocab" && <span className="row__ref">word</span>}
        {entry.kind === "topic" && entry.sub && (
          <span className="row__ref">{entry.sub}</span>
        )}
        {entry.title}
      </span>
      <span className="row__sub">
        {entry.kind === "vocab" ? `${entry.sub} · ` : ""}
        {entry.overdue
          ? // A waiting row that is not a button owes an account of itself, in
            // the words the grammar index already uses for the same topic.
            untestable
            ? "waiting · no tests written yet"
            : "waiting"
          : `in ${until(now, entry.due)}`}
      </span>
    </span>
  );
}

export function ScheduleSheet({
  entries,
  vocabCount,
  now = new Date(),
  onClose,
  onOpenVocab,
  onStart,
  hasTests,
}: {
  entries: ScheduleEntry[];
  vocabCount: number;
  now?: Date;
  onClose: () => void;
  onOpenVocab: () => void;
  /** Take this card now, rather than whichever one the scheduler would serve. */
  onStart: (entry: ScheduleEntry) => void;
  /**
   * Whether a topic has any questions written for it. A topic can come due
   * with none — the schedule knows when a card is waiting, not whether there
   * is anything to ask — and a row that cannot open a question should say so
   * rather than offer a button that does nothing.
   */
  hasTests: (sectionId: string) => boolean;
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
              {day.entries.map((e) => {
                const untestable = e.kind === "topic" && !hasTests(e.id);
                return e.overdue && !untestable ? (
                  <button
                    className="row"
                    key={`${e.kind}-${e.id}`}
                    onClick={() => onStart(e)}
                    aria-label={`Review ${e.title} now`}
                  >
                    <EntryBody entry={e} now={now} untestable={false} />
                    {/* What tells a thumb the difference before it lands. */}
                    <span className="row__chev">›</span>
                  </button>
                ) : (
                  <div className="row row--static" key={`${e.kind}-${e.id}`}>
                    <EntryBody entry={e} now={now} untestable={untestable} />
                  </div>
                );
              })}
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
