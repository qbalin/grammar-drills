import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createPrompter } from "./prompt.js";

/** A pipe standing in for stdin, and a sink that remembers what was printed. */
function pipes(input: string) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const printed: string[] = [];
  stdout.on("data", (c: Buffer) => printed.push(c.toString()));
  stdin.end(input);
  return {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    printed,
  };
}

describe("createPrompter", () => {
  it("answers every question, not just the first", async () => {
    // The whole reason this exists. `readline/promises` resolves question one
    // against a pipe and then hangs forever on question two, so a scripted
    // setup stopped after the first answer with an unsettled await.
    const { stdin, stdout } = pipes("someone\nmyrepo\ntoken\n");
    const rl = createPrompter(stdin, stdout);
    expect(await rl.ask("owner: ")).toBe("someone");
    expect(await rl.ask("repo: ")).toBe("myrepo");
    expect(await rl.askSecret("token: ")).toBe("token");
    rl.close();
  });

  it("takes the fallback for a blank line", async () => {
    const { stdin, stdout } = pipes("\n\n");
    const rl = createPrompter(stdin, stdout);
    expect(await rl.ask("file: ", "progress.json")).toBe("progress.json");
    expect(await rl.ask("branch: ", "main")).toBe("main");
    rl.close();
  });

  it("takes the fallback when stdin ends early, rather than hanging", async () => {
    // Someone hits Ctrl-D halfway through. The caller checks what it got and
    // reports that nothing was written; what it must not do is wait forever.
    const { stdin, stdout } = pipes("someone\n");
    const rl = createPrompter(stdin, stdout);
    expect(await rl.ask("owner: ")).toBe("someone");
    expect(await rl.ask("repo: ")).toBe("");
    expect(await rl.askSecret("token: ")).toBe("");
    rl.close();
  });

  it("writes each prompt, and never the secret", async () => {
    const { stdin, stdout, printed } = pipes("someone\nhunter2\n");
    const rl = createPrompter(stdin, stdout);
    await rl.ask("owner: ");
    await rl.askSecret("token: ");
    rl.close();
    const out = printed.join("");
    expect(out).toContain("owner: ");
    expect(out).toContain("token: ");
    expect(out).not.toContain("hunter2");
  });

  it("trims what was typed", async () => {
    const { stdin, stdout } = pipes("  someone  \n");
    const rl = createPrompter(stdin, stdout);
    expect(await rl.ask("owner: ")).toBe("someone");
    rl.close();
  });
});
