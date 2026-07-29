/**
 * How many tests a topic should have.
 *
 * A flat target across the syllabus is what makes coverage uneven in practice:
 * a 300-character note on the locative and a 16,000-character treatment of
 * conditional sentences are not the same amount of grammar, and giving them the
 * same twelve tests over-serves the first and under-serves the second. So the
 * target scales with how much there is to say.
 *
 * The generator and the coverage report share this function deliberately —
 * "how many should there be" and "are there enough" have to be the same
 * question, or `--only-thin` would chase a number the report never checks.
 *
 * A pack overrides the shape in `gen/config.mjs`; the defaults are calibrated
 * against a syllabus whose realized spread is 6–25 tests per topic.
 */
const DEFAULTS = {
  minTests: 6,
  maxTests: 25,
  /** Text length at which the target is still the floor. */
  baseChars: 400,
  /** Additional characters that buy the whole range from floor to ceiling. */
  spanChars: 5600,
};

export function targetFor(topic, profile, config = {}) {
  const { minTests, maxTests, baseChars, spanChars } = {
    ...DEFAULTS,
    ...(config.target ?? {}),
  };
  const over = Math.max(0, (topic.text?.length ?? 0) - baseChars);
  const scaled = minTests + (maxTests - minTests) * (over / spanChars);
  return Math.min(maxTests, Math.max(minTests, Math.round(scaled)));
}

export { DEFAULTS as TARGET_DEFAULTS };
