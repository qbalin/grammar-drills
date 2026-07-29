/**
 * What the generator needs to know about Ancient Greek.
 *
 * `scripts/gen-tests.mjs` is the driver — it talks to the model, retries,
 * validates against the reference dictionary and writes the files. Everything
 * in this file is the part that would be wrong for another language.
 */

export default {
  /** The kind every generated question carries. Must be in profile.produceKinds. */
  kind: "translate-en-grc",

  model: "claude-opus-4-8",

  /** Exactly this many sentences per test. */
  questionsPerTest: 4,

  /** A test needs at least this many surviving questions to be kept. */
  minQuestionsPerTest: 3,

  /** How many dictionary misses one sentence may carry before it is dropped. */
  allowUnverified: 2,

  /**
   * The frequency band the vocabulary hints are drawn from. Below 400 is the
   * function words the student already has. The ceiling is lower than Latin's
   * because this corpus is Attic prose plus Homer: past about 4500 the ranks
   * are epic hapaxes like ἐμμεμαώς, which are real words and useless ones to
   * build a prose exercise from.
   */
  band: { min: 400, max: 4500, pos: ["noun", "verb", "adj"] },

  /** How many tests a topic should end up with; see scripts/lib/target.mjs. */
  target: { minTests: 6, maxTests: 25, baseChars: 400, spanChars: 5600 },

  /**
   * A capital mid-sentence is a proper noun and earns a pass; the first word is
   * capitalised by position and earns nothing. Greek has letter case, so the
   * heuristic means what it means in Latin.
   */
  properNounExemption: "mid-sentence-capital",

  /**
   * Elided forms, and only elided forms.
   *
   * Greek's indeclinables are in far better shape than Latin's: every one of
   * καί, δέ, μέν, γάρ, ἀλλά, οὐ/οὐκ/οὐχ, ἄν, ὡς, ὥστε, ἵνα, ὅπως, ἐπεί, the
   * prepositions and the particles was checked against dictionary.db and every
   * one is there, because this dictionary is built from a morphological
   * analyser rather than from a dump of inflected forms. Nothing needs
   * whitelisting on that account.
   *
   * What is absent is the elided spellings — δ’ for δέ, ἀλλ’ for ἀλλά, ὑπ’ for
   * ὑπό — which no analyser lists and which the answer validator cannot strip:
   * it removes ASCII apostrophes and Greek elision is set with U+2019. The
   * prompt below asks for unelided forms so these should not arise at all;
   * this is the net under that, in both spellings, and it whitelists nothing
   * that is inflected.
   */
  functionWords: [
    "δ'", "τ'", "ἀλλ'", "οὐδ'", "μηδ'", "ἐπ'", "ἀπ'", "ὑπ'", "δι'", "καθ'",
    "μεθ'", "παρ'", "ἀφ'", "ὑφ'", "ἐφ'", "κατ'", "μετ'", "ἀνθ'", "ταῦτ'",
    "δ’", "τ’", "ἀλλ’", "οὐδ’", "μηδ’", "ἐπ’", "ἀπ’", "ὑπ’", "δι’", "καθ’",
    "μεθ’", "παρ’", "ἀφ’", "ὑφ’", "ἐφ’", "κατ’", "μετ’", "ἀνθ’", "ταῦτ’",
  ],

  /** The prompt. `{{VOCAB}}` is replaced with a sample of the band. */
  rules: `You write Ancient Greek practice items for a spaced-repetition tutor. Each item is an English sentence the student translates INTO Greek; the student writes their Greek, then compares it with your reference answer and self-grades. So every item needs ONE clear, correct Greek translation.

Rules:
- EVERY question is an English→Greek translation. Never Greek→English, never fill-in-the-blank, never a parsing drill.
- Write classical ATTIC prose of the fifth and fourth centuries — the Greek of Xenophon, Plato and Lysias. Not Homeric, not Ionic, not koine.
- Make the sentences genuinely interesting and non-trivial: use subordinate clauses, participles, genitive absolutes, the article's attributive position, and varied word order where the grammar point allows — pitch them at an intermediate/advanced learner, not a first-week beginner. Length ~6–14 words.
- Each sentence must clearly exercise the SPECIFIC grammar point below, but may combine it with other grammar the learner already knows.
- Use rich, varied classical vocabulary — do NOT keep reusing ἄνθρωπος/λόγος/ἵππος. Draw on words like these (and others you know): {{VOCAB}}. Vary vocabulary across the whole set.
- Write FULL POLYTONIC orthography: every accent, every breathing, every iota subscript.
- Write every word UNELIDED and UNCONTRACTED across word boundaries: δὲ αὐτός, never δ' αὐτός; καὶ ἐγώ, never κἀγώ; ἀλλὰ οὐ, never ἀλλ' οὐ. Use movable ν before a vowel and at the end of a sentence.
- "prompt" = the English sentence. "answer" = a correct classical Attic translation, fully accented.
- "vocab" = EVERY distinct inflected Greek WORD FORM in your Greek answer, exactly as written with its accents and breathings — these are checked against a dictionary, so never invent forms.
Output ONLY a JSON object, no markdown fences, no commentary:
{"tests":[{"questions":[{"prompt":"<English>","answer":"<Greek>","vocab":["..."]}]}]}`,
};
