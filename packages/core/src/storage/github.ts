import type { Progress } from "../types.js";
import type { StorageAdapter } from "./index.js";

export interface GitHubConfig {
  /** A personal access token with `contents` write scope on the repo. */
  token: string;
  owner: string;
  repo: string;
  /**
   * File path inside the repo. Both apps pass the pack's own
   * `storage.githubPath`; the fallback is only for a caller that has none.
   */
  path?: string;
  /** Branch to commit to. Defaults to `main`. */
  branch?: string;
  /** Commit subject; the timestamp is appended. */
  message?: string;
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
 * Read the file from GitHub, never from the browser's copy of it.
 *
 * The contents API answers with `cache-control: max-age=60`, so a plain `fetch`
 * is free to serve a minute-old body — and does, on a desktop browser with a
 * real HTTP cache. "Pull the copy from GitHub" then returns the progress from
 * before the other device pushed, which looks exactly like a pull that did
 * nothing, and the stale `sha` that comes with it is the one the next save
 * sends. Node's fetch has no such cache, so the CLI never saw it.
 */
const NO_STORE = { cache: "no-store" } as const;

/**
 * Thrown instead of overwriting a remote that has moved on.
 *
 * It carries what the remote holds, because the check that found it had to read
 * it: the caller deciding what to do next — adopt it, ask about it — would
 * otherwise fetch the same file a second time to see what it is deciding about.
 */
export class RemoteMovedError extends Error {
  constructor(
    readonly remote: Progress | null,
    readonly sha?: string,
  ) {
    super("The copy on GitHub is newer than this device's.");
    this.name = "RemoteMovedError";
  }
}

/**
 * Two progress files compared as a person would: the same, or not the same.
 *
 * Keys are sorted because the two sides are serialized from different places —
 * one parsed out of the remote file, one built in memory — and an object's key
 * order follows how it was made. Unsorted, a file that changed in no way would
 * read as changed the first time it came back from GitHub.
 *
 * `updatedAt` is left out: it moves on every save whether or not anything was
 * studied, so a comparison including it can only ever say "different".
 */
function sameProgress(a: Progress, b: Progress): boolean {
  return stable({ ...a, updatedAt: "" }) === stable({ ...b, updatedAt: "" });
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * Commits the progress JSON to a private GitHub repo the user owns, using the
 * GitHub REST API directly — no backend required, works from CLI or browser.
 */
export class GitHubStorage implements StorageAdapter {
  private readonly path: string;
  private readonly branch: string;
  private sha: string | undefined;
  /**
   * The last copy this instance knows the remote to have held — read from it,
   * or written to it. `null` once the file is known not to exist; `undefined`
   * while the remote has never been seen, which is not the same thing.
   */
  private known: Progress | null | undefined;

  constructor(private readonly cfg: GitHubConfig) {
    this.path = cfg.path ?? "progress.json";
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
    return (await this.loadMeta()).progress;
  }

  /**
   * `load()`, but also reporting the blob sha it read. The web app compares the
   * remote `updatedAt` against the local one before deciding whose progress
   * wins, and would otherwise have to fetch the file a second time to commit.
   */
  async loadMeta(): Promise<{ progress: Progress | null; sha?: string }> {
    // The read's own return, rather than `this.known` afterwards: the field
    // carries a third state (`undefined`, never seen) that cannot survive a
    // read, and re-deriving the answer from it would mean asserting that here.
    return { progress: await this.readRemote(), sha: this.sha };
  }

  /**
   * Commit the progress, unless the remote is ahead of it.
   *
   * A write can find the remote ahead in two quite different ways, and only one
   * of them is an error GitHub reports.
   *
   * The loud one is the sha mismatch: another device committed between our read
   * and our write. This used to be answered by re-reading the sha and putting
   * again, which is to say the conflict was detected and then deliberately
   * overwritten.
   *
   * The quiet one loses more and says nothing. A tab that has just opened holds
   * no sha, so it reads the current one and writes against it. There is no
   * mismatch — the sha really is current — and GitHub accepts a week-old copy
   * over a fresh one without a murmur. That is what "it pushes before it
   * fetches" costs, and no amount of handling 409 better would have caught it.
   *
   * So both are refused the same way, by throwing rather than putting, and
   * `force` is the deliberate overwrite: a person told the app to make GitHub
   * match this device. Nothing else may decide that.
   */
  async save(progress: Progress, opts: { force?: boolean } = {}): Promise<void> {
    // Updating an existing file needs its current sha. In the CLI a `load()`
    // always precedes the first `save()`, so one was in hand; a browser tab
    // reloads with an empty instance and would send none, which GitHub rejects.
    if (this.sha === undefined) await this.readRemote();

    // Nothing to say. `updatedAt` moves whether or not anything was answered —
    // opening the app is enough — and a commit per open is a commit per open on
    // someone's real repository.
    if (this.known && sameProgress(this.known, progress)) return;

    if (!opts.force && this.remoteIsAhead(progress)) {
      throw new RemoteMovedError(this.known ?? null, this.sha);
    }

    let res = await this.put(progress);
    if (res.status === 409 || res.status === 422) {
      await this.readRemote();
      if (!opts.force) throw new RemoteMovedError(this.known ?? null, this.sha);
      res = await this.put(progress);
    }
    if (!res.ok) {
      throw new Error(`GitHub save failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { content: { sha: string } };
    this.sha = body.content.sha;
    // What we just wrote is what the remote holds, so the next save compares
    // against it without reading the file again.
    this.known = progress;
  }

  /** Whether what the remote last showed us was written after this copy. */
  private remoteIsAhead(progress: Progress): boolean {
    return !!this.known && this.known.updatedAt > progress.updatedAt;
  }

  private put(progress: Progress): Promise<Response> {
    return fetch(this.url(), {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${this.cfg.message ?? "Update progress"} (${progress.updatedAt})`,
        content: b64encode(JSON.stringify(progress, null, 2)),
        branch: this.branch,
        ...(this.sha ? { sha: this.sha } : {}),
      }),
    });
  }

  /**
   * Learn the current blob sha *and what it holds*, leaving both unset when the
   * file doesn't exist.
   *
   * Reading only the sha was enough to write, which is why it did — but a write
   * that has to decide whether it would be overwriting someone's afternoon
   * needs the file, and the file is in the same response.
   */
  private async readRemote(): Promise<Progress | null> {
    const res = await fetch(`${this.url()}?ref=${this.branch}`, {
      headers: this.headers(),
      ...NO_STORE,
    });
    if (res.status === 404) {
      this.sha = undefined;
      this.known = null;
      return null;
    }
    if (!res.ok) {
      throw new Error(`GitHub load failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { content: string; sha: string };
    this.sha = body.sha;
    // Guarded, because the alternative is a bare `SyntaxError: Unexpected
    // token` arriving from inside a debounced background push, four seconds
    // after a grade and with the next question already on screen. Whatever is
    // up there is not progress, and the one thing that must not follow is a
    // save that treats the mismatch as ours to resolve.
    try {
      this.known = JSON.parse(b64decode(body.content)) as Progress;
    } catch {
      // Forget the sha as well as the file. Keeping it would leave `save()`
      // holding exactly what it needs to overwrite a file nobody can read —
      // it skips the read when a sha is in hand, so the next grade would put
      // straight over it and the message below would be a lie. Cleared, the
      // next save reads again and refuses again, which is the whole rule this
      // class is built on: a remote we do not understand is never ours to
      // resolve.
      this.sha = undefined;
      throw new Error(
        `${this.cfg.owner}/${this.cfg.repo}/${this.path} is not readable as progress. ` +
          `Nothing has been written over it.`,
      );
    }
    return this.known;
  }
}
