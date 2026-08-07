/**
 * Which tests hold sentences somebody wrote, as opposed to sentences a model
 * wrote — asked in one place, by everything that asks it.
 *
 * The id is the discriminator, not `Question.source`. A quoted question carries
 * a source only when the book that printed it recorded one, and that is a
 * separate fact: the two are asked separately on purpose, because "is this
 * generated" and "can we credit it" have different answers and different
 * repairs. `-q<n>` is written by `quote-tests.mjs`, `-t<n>` by `gen-tests.mjs`,
 * and the two must not be able to collide.
 *
 * One definition rather than one per caller, for the reason `targetFor` lives
 * in this directory: "how much of this is quoted" and "which of it may be
 * displaced" drifting apart would be invisible in both, and the second is
 * destructive.
 */

/** A test id written by the quotation pipeline. */
export const QUOTED_ID = /-q\d+$/;

/** Is this test's answer set quoted rather than generated? */
export function isQuoted(test) {
  return QUOTED_ID.test(String(test?.id ?? ""));
}

/**
 * Split one topic's tests into the quoted and the generated.
 *
 * Returned as both lists rather than a predicate result, because every caller
 * so far wants to count one and act on the other.
 */
export function partition(tests = []) {
  const quoted = [];
  const generated = [];
  for (const test of tests) (isQuoted(test) ? quoted : generated).push(test);
  return { quoted, generated };
}

/** Tests, questions and how many of those questions can be credited. */
export function tally(tests = []) {
  const { quoted, generated } = partition(tests);
  const count = (list) => list.reduce((n, t) => n + (t.questions?.length ?? 0), 0);
  return {
    tests: tests.length,
    questions: count(quoted) + count(generated),
    quotedTests: quoted.length,
    quotedQuestions: count(quoted),
    generatedTests: generated.length,
    generatedQuestions: count(generated),
    sourced: quoted.reduce(
      (n, t) => n + (t.questions ?? []).filter((q) => q.source).length,
      0,
    ),
  };
}
