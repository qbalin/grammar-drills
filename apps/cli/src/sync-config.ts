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
import type { Profile } from "@lang-tutor/core";

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
