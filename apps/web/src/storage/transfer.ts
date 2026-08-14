import { emptyProgress, type Content, type Progress } from "@lang-tutor/core";
import { profile } from "../pack.js";

/**
 * Moving progress between devices without GitHub.
 *
 * Sync needs a personal access token, which most people will never make. A file
 * they can mail themselves is the difference between the app being movable and
 * being trapped on one phone.
 */

export function exportProgress(progress: Progress): void {
  download(JSON.stringify(progress, null, 2), stamped());
}

/**
 * Hand over a file this app could not read itself.
 *
 * Deliberately the raw text rather than anything parsed — there is nothing to
 * parse, which is why it was set aside. Whatever can be got out of a truncated
 * write is got out of it by a person with an editor, and the app's only job is
 * not to have destroyed it first. `-damaged` in the name so it is never mailed
 * to another device in the belief that it will import.
 */
export function exportSalvaged(raw: string): void {
  download(raw, stamped("-damaged"));
}

/** Today, and the pack: a folder of exports should say which language each is. */
function stamped(suffix = ""): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${profile.storage.exportPrefix}-${stamp}${suffix}.json`;
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse a progress file, keeping only what this content bundle can still use.
 *
 * The syllabus was rebuilt once already — topic ids moved from Allen &
 * Greenough's (`ag-*`) to Bennett's (`bn-*`) — and a file from before that
 * carries ids for topics that no longer exist. The scheduler ignores them, but
 * the mastery percentages would count them, so they are dropped on the way in.
 */
export function importProgress(raw: string, content: Content): Progress {
  const parsed = JSON.parse(raw) as Partial<Progress>;
  if (!parsed || typeof parsed !== "object" || !parsed.version) {
    throw new Error(`That does not look like a ${profile.ui.appName} progress file.`);
  }

  const known = (id: string) => content.getSection(id) !== undefined;
  const keepKeys = <T>(record: Record<string, T> | undefined) =>
    Object.fromEntries(
      Object.entries(record ?? {}).filter(([id]) => known(id)),
    );

  const base = emptyProgress();
  return {
    ...base,
    ...parsed,
    topicCards: keepKeys(parsed.topicCards),
    topicMastery: keepKeys(parsed.topicMastery),
    seenTests: keepKeys(parsed.seenTests),
    testCycles: keepKeys(parsed.testCycles),
    attempts: keepKeys(parsed.attempts),
    vocabCards: parsed.vocabCards ?? {},
    updatedAt: parsed.updatedAt ?? base.updatedAt,
  };
}

/** Prompt for a file and read it as text. Resolves to null if nothing chosen. */
export function pickProgressFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      void file.text().then(resolve);
    });
    // A cancelled picker fires nothing in some browsers, so the promise is
    // simply left unresolved rather than reporting a failure that never was.
    input.click();
  });
}
