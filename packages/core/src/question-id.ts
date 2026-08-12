/**
 * A stable identity for a question, derived from what it asks.
 *
 * Not what progress is keyed by, and worth saying so plainly because it was
 * written to be. Two grammars cut the same language into different topics, and
 * the questions are the one thing they can agree on — so this looked like the
 * key that had to survive the disagreement. It turned out not to be needed: a
 * further grammar's topics reach the primary's *as topics*, so they share a
 * question bank exactly, and progress can stay where it is while a second book
 * reads it through the crosswalk. See `Content.testsFor`.
 *
 * Kept because it is cheap, tested, and load-bearing the moment a pack
 * generates questions against a second grammar's own topics — at which point
 * two books really would disagree about what a question belongs to, and the
 * question itself is the only thing left to file progress under.
 *
 * --- why it is derived rather than written down ------------------------------
 *
 * A generated id would have to be assigned once and never reassigned, which
 * means a counter in the content, a gate to keep it unique, and a rule nobody
 * can see being broken. Deriving it from `prompt` and `answer` needs none of
 * that: the id cannot drift out of step with the question, a rebuild of the
 * same content produces the same ids, and nothing has to be migrated when the
 * bank is regenerated.
 *
 * The alternative that looks simpler and is not is `testId` plus an index.
 * `prune-tests.mjs` rewrites a test's `questions` array in place when it takes
 * out an item carrying an unattested form, so every index after the removed one
 * shifts — silently renaming questions a student has answered.
 *
 * --- what two identical questions mean ---------------------------------------
 *
 * Two questions with the same prompt and the same answer hash alike and are
 * therefore one question here, wherever they were filed. That is the intended
 * reading rather than a collision to design around: a student who has answered
 * a sentence has answered it, and showing it again under a second topic to ask
 * whether they know it yet would be measuring the filing, not the student. The
 * pack keeps the duplicates themselves under 1% (§ C4) for its own reasons.
 *
 * --- the width -----------------------------------------------------------------
 *
 * 64 bits, in two lanes. A single 32-bit FNV — which `profileHash` uses, over
 * seven fold settings — is ample there and is not here: at ~9,000 questions the
 * birthday bound puts a real collision at about one chance in a hundred, and it
 * grows with the square of the bank. Two lanes with different bases put it out
 * of reach for any bank a pack could hold, and an accidental one is reported by
 * the pack's own gates rather than trusted to arithmetic.
 */

const FNV_PRIME = 0x01000193;

/** One FNV-1a lane over a string, seeded. */
function lane(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  // A final avalanche, so that inputs differing in one character do not leave
  // the difference sitting in the low bits of both lanes at once.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * The id of a question, as 16 hex characters.
 *
 * A NUL joins the two fields so that no prompt-and-answer pair can be spelled
 * as a different pair with the boundary moved: neither field can contain one.
 */
export function questionId(prompt: string, answer: string): string {
  const text = `${prompt}\u0000${answer}`;
  const hi = lane(text, 0x811c9dc5);
  const lo = lane(text, 0x9e3779b9);
  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}
