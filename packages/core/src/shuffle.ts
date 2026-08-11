/**
 * A shuffle that can be asked what it did.
 *
 * `Math.random` is enough to pick one thing out of a pool, and it was all this
 * engine needed while serving a test meant picking one. An order is different:
 * a topic's order has to survive the app being closed, and it has to be the
 * same order on the next call or "how far through it are we" means nothing. So
 * the order is not stored — the *seed* is, and the order is derived from it
 * again on every serve, which costs two numbers per topic instead of a list of
 * ids as long as the topic.
 *
 * mulberry32 because it is a dozen lines, has no state beyond one 32-bit word,
 * and is more than even enough for shuffling twenty tests. Nothing here is
 * cryptographic and nothing here should be.
 */

/**
 * A generator over the stream `seed` names.
 *
 * Callers take a stream and pass it around rather than taking numbers one at a
 * time, so that two shuffles drawing from the same stream stay in step: the
 * second one's result depends on how much the first one drew, which is the
 * property `session.ts` leans on to keep a narrowed order and a whole one
 * agreeing on their first half.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `items` in a shuffled order, as a new array.
 *
 * A copy, and it is not politeness: the array this is handed is usually the one
 * `Content` holds for a section, and Fisher-Yates over it in place would leave
 * the shipped bundle scrambled for the life of the process — every later reader
 * of that section, including the one drawing the next order, seeing a list that
 * nothing wrote.
 */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A seed for something that has never been shuffled before. */
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}

/**
 * The seed after this one.
 *
 * Chained rather than drawn afresh, so that everything a topic will ever do
 * follows from the one number it started with. That is what makes "the second
 * time round is not the first time round again" a thing a test can assert
 * instead of a thing that is true one run in four billion.
 */
export function nextSeed(seed: number): number {
  return (mulberry32(seed)() * 4294967296) >>> 0;
}
