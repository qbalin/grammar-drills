/**
 * A profile for the engine's own tests.
 *
 * Deliberately not a copy of any shipped pack: these tests are about the
 * machinery — that the book cursor walks the sections it is given, that the
 * fold is whatever the profile says — so the fixture is a small invented
 * language whose families are just enough to walk. Pack-specific facts are
 * tested in the pack.
 *
 * The fold matches the one the word fixtures were written under (diacritics are
 * editorial, u/v and i/j are spelling variants), because the sample forms in
 * `core.test.ts` are real dictionary forms rather than invented ones.
 */
import type { Profile } from "./pack.js";

export const testProfile: Profile = {
  schema: 1,
  id: "test",
  l2: { code: "l2", name: "Second", endonym: "Secunda", script: "latn", direction: "ltr" },
  l1: { code: "en", name: "English" },
  fold: {
    trim: true,
    caseFold: "lower",
    decompose: "NFD",
    stripMarks: ["\\u0300-\\u036f"],
    keepMarks: [],
    map: [["j", "i"], ["v", "u"]],
    recompose: "none",
  },
  families: [
    { id: "nouns", label: "Nouns" },
    { id: "adj", label: "Adjectives & adverbs" },
    { id: "pron", label: "Pronouns" },
    { id: "verb-forms", label: "Verb forms" },
    { id: "particles", label: "Particles" },
    { id: "noun-syntax", label: "Noun syntax" },
    { id: "adj-pron-syntax", label: "Adjective & pronoun syntax" },
    { id: "verb-syntax", label: "Verb syntax" },
    { id: "style", label: "Word-order & style" },
  ],
  fallbackFamily: "style",
  grammar: {
    source: { title: "A test grammar", url: "https://example.invalid/", licence: "n/a" },
    label: "Test",
    idPrefix: "tg",
    refPrefix: "§ ",
    paradigmLabels: [
      "nom", "gen", "dat", "acc", "abl", "voc", "loc",
      "sing", "singular", "plur", "plural",
      "1st", "2nd", "3rd", "1", "2", "3",
    ],
    headingPattern: "^[A-Z][A-Z .,'’—-]*\\.?$",
    headingFlags: "",
    headingMaxLength: 40,
  },
  questions: { defaultKind: "translate-en-la", produceKinds: ["translate-en-la"] },
  citationsVersion: 2,
  ui: {
    appName: "Secunda",
    manifestName: "Secunda — a tutor",
    description: "A tutor for tests.",
    promptDirection: "Translate into Second",
    // Deliberately not the words "your answer": the CLI labels the submitted
    // text that way, and a fixture that collided with it would make the
    // undo tests assert nothing.
    cliPlaceholder: "type it in Second, then Enter…",
    cliHint: "type it in Second",
    webPlaceholder: "write it in Second…",
    answerAriaLabel: "Your Second",
    sayItIn: "say it in Second",
    themeColor: "#12121a",
    backgroundColor: "#12121a",
  },
  storage: {
    webProgressKey: "test-tutor:progress",
    webSyncKey: "test-tutor:sync",
    cliDir: ".test-tutor",
    githubPath: "test-progress.json",
    exportPrefix: "test-progress",
    dictionaryCacheName: "test-dictionary",
  },
  grammarShape: {
    minTopics: 1,
    maxTopics: 1000,
    minTextChars: 1,
    maxTextChars: 100000,
    medianTextCharsRange: [1, 100000],
    p90TextCharsMax: 100000,
    maxFamilySharePct: 100,
  },
  coverage: {
    minTestsPerTopic: 0,
    minQuestionsPerTopic: 0,
    topicsWithTestsPct: 0,
    maxDuplicatePromptPct: 100,
    minDictResolvedPct: 0,
    minBandUtilisationPct: 0,
    minKeptRatioPct: 0,
  },
};
