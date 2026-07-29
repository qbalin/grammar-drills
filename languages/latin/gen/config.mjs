/**
 * What the generator needs to know about Latin.
 *
 * `scripts/gen-tests.mjs` is the driver — it talks to the model, retries,
 * validates against the reference dictionary and writes the files. Everything
 * in this file is the part that would be wrong for another language.
 */

export default {
  /** The kind every generated question carries. Must be in profile.produceKinds. */
  kind: "translate-en-la",

  model: "claude-opus-4-8",

  /** Exactly this many sentences per test. */
  questionsPerTest: 4,

  /** A test needs at least this many surviving questions to be kept. */
  minQuestionsPerTest: 3,

  /** How many dictionary misses one sentence may carry before it is dropped. */
  allowUnverified: 2,

  /**
   * The frequency band the vocabulary hints are drawn from. Below 400 is the
   * function words the student already has; above 6000 is where a reference
   * grammar's own examples stop going.
   */
  band: { min: 400, max: 6000, pos: ["noun", "verb", "adj"] },

  /** How many tests a topic should end up with; see scripts/lib/target.mjs. */
  target: { minTests: 6, maxTests: 25, baseChars: 400, spanChars: 5600 },

  /**
   * A capital mid-sentence is a proper noun and earns a pass; the first word is
   * capitalised by position and earns nothing. Set to "none" for a script with
   * no letter case, where the heuristic means nothing.
   */
  properNounExemption: "mid-sentence-capital",

  /**
   * Indeclinable function words — prepositions, conjunctions, particles, adverbs.
   *
   * `dictionary.db` is a Wiktionary dump built around *inflected* forms, and it
   * simply has no `forms` row for most indeclinables: 47 of the commonest are
   * absent, `utinam`, `antequam`, `priusquam`, `quoad`, `inter` and `invicem`
   * among them. Since a test is dropped when any one of its words fails, a topic
   * defined by such a word loses everything — optative subjunctive, temporal
   * clauses and reciprocal pronouns each scored a literal 0 out of 72 before
   * this list was extended.
   *
   * Every entry below was verified absent from dictionary.db. A new pack must
   * do the same rather than guessing: this whitelists indeclinables only, and
   * inflected forms are still checked, which is the point.
   */
  functionWords: [
    // prepositions
    "a","ab","ad","ante","apud","circum","contra","coram","cum","de","e","ex",
    "extra","in","infra","inter","intra","ob","per","post","prae","praeter",
    "pro","prope","propter","sine","sub","super","supra","trans","ultra",
    // coordinating conjunctions and connectives
    "ac","atque","aut","autem","enim","ergo","et","etiam","igitur","itaque",
    "nam","namque","nec","neque","nisi","quia","quod","quoniam","sed","seu",
    "sive","tamen","vel","verum","-que","que","-ne",
    // subordinators
    "antequam","priusquam","postquam","dum","donec","quoad","simulac","ubi",
    "ut","uti","quin","quominus","quasi","tamquam","velut","ne","si","nedum",
    // particles and common adverbs
    "an","cur","haud","ita","iam","modo","non","num","nunc","quam","quidem",
    "quoque","saepe","semper","sic","tam","tandem","tum","tunc","unde",
    "utinam","vix","invicem","vicissim","mutuo","dumtaxat",
    // the copula, which appears constantly
    "est","sunt",
  ],

  /** The prompt. `{{VOCAB}}` is replaced with a sample of the band. */
  rules: `You write Latin practice items for a spaced-repetition tutor. Each item is an English sentence the student translates INTO Latin; the student writes their Latin, then compares it with your reference answer and self-grades. So every item needs ONE clear, correct Latin translation.

Rules:
- EVERY question is an English→Latin translation. Never Latin→English, never fill-in-the-blank, never a parsing drill.
- Make the sentences genuinely interesting and non-trivial: use subordinate clauses, participles, ablative phrases, adjectives, and varied word order where the grammar point allows — pitch them at an intermediate/advanced learner, not a first-week beginner. Length ~6–14 words.
- Each sentence must clearly exercise the SPECIFIC grammar point below, but may combine it with other grammar the learner already knows.
- Use rich, varied classical vocabulary — do NOT keep reusing puella/rosa/nauta/servus. Draw on words like these (and others you know): {{VOCAB}}. Vary vocabulary across the whole set.
- "prompt" = the English sentence. "answer" = a correct classical Latin translation, with macrons on all long vowels.
- "vocab" = EVERY distinct inflected Latin WORD FORM in your Latin answer, exactly as written with macrons — these are checked against a dictionary, so never invent forms.
Output ONLY a JSON object, no markdown fences, no commentary:
{"tests":[{"questions":[{"prompt":"<English>","answer":"<Latin>","vocab":["..."]}]}]}`,
};
