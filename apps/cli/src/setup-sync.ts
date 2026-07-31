/**
 * `--setup-sync`: ask for the repo, check it, write the file.
 *
 * Plain readline rather than Ink, because this runs before the app is rendered
 * and has to be able to fail with a message and an exit code. It is the one
 * part of the terminal that is a form.
 *
 * The connection is verified before anything is written. A token with the wrong
 * scope fails at the first push otherwise — which is four seconds after a grade,
 * with the tutor already showing the next question, and is the worst possible
 * moment to learn that the setup did not take.
 */
import { stdout } from "node:process";
import { GitHubStorage, describeSyncError, type Profile } from "@lang-tutor/core";
import { createPrompter } from "./prompt.js";
import { saveSyncConfig, type CliSyncConfig } from "./sync-config.js";

export async function setupSync(
  profile: Profile,
  configPath: string,
): Promise<number> {
  const rl = createPrompter();
  try {
    stdout.write(
      `Sync ${profile.l2.name} progress to a GitHub repo.\n` +
        `It needs a fine-grained token with read and write on that repo's contents.\n` +
        `Settings are written to ${configPath}.\n\n`,
    );
    const owner = await rl.ask("Repository owner: ");
    const repo = await rl.ask("Repository name: ");
    const path = await rl.ask(
      `File in the repo [${profile.storage.githubPath}]: `,
      profile.storage.githubPath,
    );
    const branch = await rl.ask("Branch [main]: ", "main");
    const token = await rl.askSecret("Access token (not shown): ");

    if (!owner || !repo || !token) {
      stdout.write("\nOwner, repository and token are all needed. Nothing written.\n");
      return 1;
    }

    const config: CliSyncConfig = { token, owner, repo, path, branch };
    stdout.write(`\nChecking ${owner}/${repo}…\n`);
    const remote = new GitHubStorage({ ...config, message: "check" });
    let existing: Awaited<ReturnType<GitHubStorage["loadMeta"]>>;
    try {
      existing = await remote.loadMeta();
    } catch (err) {
      const state = describeSyncError(err);
      stdout.write(
        `Could not reach it: ${state.kind === "error" ? state.message : state.kind}\n` +
          `Nothing written.\n`,
      );
      return 1;
    }

    // The token is kept out of the file when the environment already carries
    // it, so a machine that sources it per shell never has it on disk.
    const fromEnv = process.env.GITHUB_TOKEN === token;
    const { mode } = await saveSyncConfig(configPath, config, {
      keepTokenOnDisk: !fromEnv,
    });

    stdout.write(`\nConnected. Settings written to ${configPath}`);
    stdout.write(
      fromEnv
        ? " (token left out; it is already in GITHUB_TOKEN).\n"
        : mode === "0600"
          ? " (mode 0600 — it holds your token).\n"
          : ".\nCould not restrict its permissions; it holds your token.\n",
    );
    stdout.write(
      existing.progress
        ? `${owner}/${repo}/${path} already holds progress saved ${existing.progress.updatedAt}. ` +
            `The next run will offer to use it.\n`
        : `${owner}/${repo}/${path} does not exist yet; it will be created on the first push.\n`,
    );
    return 0;
  } finally {
    rl.close();
  }
}
