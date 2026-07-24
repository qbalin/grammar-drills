import type { Progress } from "../types.js";
import type { StorageAdapter } from "./index.js";

export interface GitHubConfig {
  /** A personal access token with `contents` write scope on the repo. */
  token: string;
  owner: string;
  repo: string;
  /** File path inside the repo. Defaults to `latin-progress.json`. */
  path?: string;
  /** Branch to commit to. Defaults to `main`. */
  branch?: string;
}

// UTF-8-safe base64 that works in Node and the browser.
function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64decode(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Commits the progress JSON to a private GitHub repo the user owns, using the
 * GitHub REST API directly — no backend required, works from CLI or browser.
 */
export class GitHubStorage implements StorageAdapter {
  private readonly path: string;
  private readonly branch: string;
  private sha: string | undefined;

  constructor(private readonly cfg: GitHubConfig) {
    this.path = cfg.path ?? "latin-progress.json";
    this.branch = cfg.branch ?? "main";
  }

  describe(): string {
    return `github:${this.cfg.owner}/${this.cfg.repo}/${this.path}`;
  }

  private url(): string {
    return `https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${this.path}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async load(): Promise<Progress | null> {
    const res = await fetch(`${this.url()}?ref=${this.branch}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GitHub load failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { content: string; sha: string };
    this.sha = body.sha;
    return JSON.parse(b64decode(body.content)) as Progress;
  }

  async save(progress: Progress): Promise<void> {
    const res = await fetch(this.url(), {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Update Latin progress (${progress.updatedAt})`,
        content: b64encode(JSON.stringify(progress, null, 2)),
        branch: this.branch,
        ...(this.sha ? { sha: this.sha } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`GitHub save failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { content: { sha: string } };
    this.sha = body.content.sha;
  }
}
