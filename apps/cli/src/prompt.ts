/**
 * Reading a line at a time, from a terminal or from a pipe.
 *
 * `readline/promises` looks like the obvious way to do this and is not: with a
 * non-TTY stdin its first `question` resolves and every later one hangs
 * forever, so a piped setup — which is how this gets tested, and how anyone
 * scripts it — stops after the first answer with an unsettled await and no
 * error. Pulling from the interface's async iterator behaves the same way for
 * a person typing and for a heredoc.
 */
import { createInterface, type Interface } from "node:readline";
import { stdin, stdout } from "node:process";

export interface Prompter {
  /** Ask, returning `fallback` for an empty answer or a closed stdin. */
  ask(question: string, fallback?: string): Promise<string>;
  /** Ask without putting the answer on screen, where that is possible. */
  askSecret(question: string): Promise<string>;
  close(): void;
}

export function createPrompter(
  input: NodeJS.ReadStream = stdin,
  output: NodeJS.WriteStream = stdout,
): Prompter {
  const rl = createInterface({ input, output, terminal: input.isTTY });
  const lines = rl[Symbol.asyncIterator]();

  async function read(fallback: string): Promise<string> {
    const { value, done } = await lines.next();
    if (done) {
      output.write("\n");
      return fallback;
    }
    return String(value).trim() || fallback;
  }

  return {
    async ask(question, fallback = "") {
      output.write(question);
      return read(fallback);
    },

    /**
     * Echo is suppressed by silencing the interface's own writer, which is the
     * only hook readline offers. It works when a terminal is doing the echoing
     * and does nothing when the input is a pipe — where there is no echo to
     * suppress and nothing on screen to hide.
     */
    async askSecret(question) {
      output.write(question);
      const internal = rl as Interface & { _writeToOutput?: (s: string) => void };
      const original = internal._writeToOutput;
      internal._writeToOutput = () => {};
      try {
        const answer = await read("");
        if (input.isTTY) output.write("\n");
        return answer;
      } finally {
        internal._writeToOutput = original;
      }
    },

    close() {
      rl.close();
    },
  };
}
