import { render } from "ink";
import { homedir } from "node:os";
import { stdout } from "node:process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Session, type Progress, type StorageAdapter } from "@lang-tutor/core";
import { App } from "./app.js";
import { loadPack } from "./content-loader.js";
import { LocalFileStorage } from "./storage-local.js";
import { SyncingFileStorage } from "./storage-sync.js";
import { setupSync } from "./setup-sync.js";
import { createPrompter } from "./prompt.js";
import {
  loadSyncConfig,
  readSyncedMarker,
  syncConfigPath,
  syncedMarkerPath,
} from "./sync-config.js";

const here = dirname(fileURLToPath(import.meta.url));
const languages = join(here, "..", "..", "..", "languages");

const { values } = parseArgs({
  options: {
    pack: { type: "string" },
    language: { type: "string" },
    content: { type: "string" },
    progress: { type: "string" },
    "setup-sync": { type: "boolean" },
  },
});

// A pack is a directory; the language name is the short way to name one that
// lives in this repo.
const packDir =
  values.pack ?? join(languages, values.language ?? process.env.LANG_PACK ?? "latin");
const content = loadPack(packDir, values.content);
const profile = content.profile;
const progressPath =
  values.progress ?? join(homedir(), profile.storage.cliDir, "progress.json");
const configPath = syncConfigPath(profile, homedir());

if (values["setup-sync"]) {
  process.exit(await setupSync(profile, configPath));
}

const local = new LocalFileStorage(progressPath);
const syncConfig = await loadSyncConfig(configPath, profile);
const markerPath = syncedMarkerPath(profile, homedir());
const syncing = syncConfig
  ? new SyncingFileStorage(
      local,
      syncConfig,
      `Update ${profile.l2.name} progress`,
      { path: markerPath, at: await readSyncedMarker(markerPath) },
    )
  : null;
const storage: StorageAdapter = syncing ?? local;

let progress = await local.load();

/**
 * Whether to take the copy on GitHub instead of this machine's.
 *
 * The same rule as the web app's, and the same limits: whole-file, last writer
 * wins, and only checked at startup. Two devices studying at once will still
 * lose one of them — merging two spaced-repetition schedules is a different and
 * much larger problem than this is trying to solve.
 *
 * Asked only when both copies have moved since they last agreed. "Newer" is a
 * fine answer to "which of these is the catch-up?" and a poor one to "which of
 * these do you want?", so it decides the first and never the second — a machine
 * that has been offline all week holds the older copy and may still have the
 * real work on it. What is not worth asking about is the ordinary morning where
 * this machine has nothing of its own and the phone has last night.
 */
async function resolveConflict(remote: Progress, local: Progress): Promise<boolean> {
  const rl = createPrompter();
  try {
    stdout.write(
      `\nThe copy on GitHub was saved ${remote.updatedAt},\n` +
        `and this machine has been studied since it last synced\n` +
        `(${local.updatedAt}). Only one can be kept.\n\n`,
    );
    const answer = (await rl.ask("Use the copy from GitHub? [y/N] ")).toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

if (syncing) {
  try {
    const found = await syncing.checkRemote(progress);
    if (found.kind === "adopt") {
      await syncing.adopt(found.remote);
      progress = found.remote;
    } else if (found.kind === "diverged") {
      if (await resolveConflict(found.remote, progress!)) {
        await syncing.adopt(found.remote);
        progress = found.remote;
      }
      // Keeping this machine's copy means pushing over a newer one, which the
      // storage refuses unless it is told the overwrite was asked for. It was.
      else await syncing.saveNow(progress!, { force: true });
    }
  } catch {
    // Offline, or a token that has since been revoked. Study is local-first and
    // does not depend on this; the state is reported in the status line.
  }
}

const session = new Session(content, progress ?? undefined);

const { waitUntilExit } = render(
  <App session={session} content={content} storage={storage} />,
);

if (syncing) {
  // A terminal has no `visibilitychange`. Ctrl-C is how a session ends, and
  // without this the last few grades sit in the four-second debounce and are
  // never pushed. Ink handles the signal and resolves `waitUntilExit`, so the
  // flush hangs off that rather than off a handler of our own.
  await waitUntilExit();
  if (syncing.hasPending()) {
    stdout.write("Saving to GitHub…\n");
    await syncing.flush();
  }
  const state = syncing.currentState();
  if (state.kind === "error") stdout.write(`Sync failed: ${state.message}\n`);
  else if (state.kind === "offline") stdout.write("Offline — progress is saved locally.\n");
  else if (state.kind === "behind") {
    // Another machine pushed while this session was running. Nothing is lost —
    // this session is on disk — but it is not on GitHub either, and saying so
    // on the way out is the only chance to say it.
    stdout.write(
      "Another device pushed while you were studying, so this session\n" +
        "stayed on this machine. Start again to choose which copy to keep.\n",
    );
  }
}
