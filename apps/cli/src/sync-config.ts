/**
 * Where the terminal keeps its GitHub sync settings.
 *
 * The web app puts these in `localStorage`, which the terminal has no version
 * of, so they go in a file beside `progress.json` in the pack's own `cliDir`
 * (`~/.latin-tutor/sync.json`). Beside it rather than inside it deliberately:
 * progress is exported, imported and adopted wholesale between devices, and a
 * token riding along inside it would travel with it.
 *
 * The token may instead come from `GITHUB_TOKEN`, which takes precedence. That
 * is for the machine you would rather not leave a credential on: everything
 * except the secret can sit in the file, and the secret arrives per shell.
 */
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readSyncedAt, type Profile, type SyncedAt } from "@lang-tutor/core";

export interface CliSyncConfig {
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
}

/** What is on disk: the token is optional, since the env may supply it. */
type StoredSyncConfig = Omit<CliSyncConfig, "token"> & { token?: string };

export function syncConfigPath(profile: Profile, home: string): string {
  return join(home, profile.storage.cliDir, "sync.json");
}

/**
 * Where this machine records when it last agreed with GitHub.
 *
 * Its own file rather than a field in either of the other two. Not in
 * `progress.json`, because that is the thing that syncs and a marker travelling
 * inside it would describe whichever machine wrote it last — the exact fact we
 * are trying to tell apart. Not in `sync.json`, because that is rewritten
 * wholesale whenever the settings change, and a marker is not a setting.
 */
export function syncedMarkerPath(profile: Profile, home: string): string {
  return join(home, profile.storage.cliDir, "synced");
}

/**
 * When this machine last pushed or took a copy, from both sides, or null if it
 * never has. See `SyncedAt` in core for why that is two values.
 */
export async function readSyncedMarker(path: string): Promise<SyncedAt | null> {
  try {
    return readSyncedAt((await readFile(path, "utf8")).trim());
  } catch {
    // Absent is the ordinary state on a machine that has not synced yet, and
    // unreadable is no worse: both mean "assume this machine has its own work".
    return null;
  }
}

export async function writeSyncedMarker(path: string, marker: SyncedAt): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(marker)}\n`);
  } catch {
    /* the marker is an optimisation; losing it only costs an extra question */
  }
}

/**
 * The configuration to sync with, or null when there is not enough of one.
 *
 * Null rather than throwing: no sync configured is the ordinary case, not an
 * error, and the tutor has always run perfectly well without it.
 */
export async function loadSyncConfig(
  path: string,
  profile: Profile,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CliSyncConfig | null> {
  let stored: StoredSyncConfig;
  try {
    stored = JSON.parse(await readFile(path, "utf8")) as StoredSyncConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`could not read ${path}: ${(err as Error).message}`);
  }
  const token = env.GITHUB_TOKEN || stored.token;
  if (!token || !stored.owner || !stored.repo) return null;
  return {
    token,
    owner: stored.owner,
    repo: stored.repo,
    path: stored.path || profile.storage.githubPath,
    branch: stored.branch || "main",
  };
}

/**
 * Write the settings, readable only by their owner.
 *
 * `chmod` after the write rather than a mode on the open, because an existing
 * file keeps its old mode and this is exactly the file where that matters. It
 * is best-effort: a filesystem with no permission bits should not stop sync
 * from being set up, so a failure here is reported rather than fatal.
 */
export async function saveSyncConfig(
  path: string,
  config: CliSyncConfig,
  { keepTokenOnDisk = true } = {},
): Promise<{ mode: "0600" | "unprotected" }> {
  await mkdir(dirname(path), { recursive: true });
  const stored: StoredSyncConfig = {
    owner: config.owner,
    repo: config.repo,
    path: config.path,
    branch: config.branch,
  };
  if (keepTokenOnDisk) stored.token = config.token;
  await writeFile(path, `${JSON.stringify(stored, null, 2)}\n`);
  try {
    await chmod(path, 0o600);
    return { mode: "0600" };
  } catch {
    return { mode: "unprotected" };
  }
}
