/**
 * Language packs — the shape of a language, as data.
 *
 * Everything the runtime needs to know about a language arrives through this
 * one object: how to fold a word, what the grammar families are called, how a
 * section reference is written, which question kinds are answerable in L2, and
 * what the app calls itself. Core reads it; core never reads `languages/`.
 *
 * A pack's profile is parsed once at startup — on disk for the CLI, at build
 * time for the web app, which is built one language at a time.
 */
import type { FoldSpec } from "./fold.js";
import type { ParadigmAxes, ParadigmBlock } from "./paradigm.js";

export interface Family {
  id: string;
  label: string;
}

/** How this language's reference grammar is laid out and rendered. */
export interface GrammarStyle {
  /**
   * Provenance: who wrote the book, where it can be read, and under what.
   * Printed by validate-pack, and set under the web app's grammar map — the
   * whole syllabus is someone else's work and says so.
   */
  source: { title: string; url: string; licence: string };
  /**
   * What to call the book where there is no room for the citation — the switch
   * between a pack's grammars, which needs a word rather than a title page.
   */
  label: string;
  /** Section ids must start with this, e.g. "bn" for Bennett. */
  idPrefix: string;
  /** Rendered before a section reference, e.g. "§ ". */
  refPrefix: string;
  /** Row stubs that mark a paradigm table, e.g. nom/gen/dat or their Greek equivalents. */
  paradigmLabels: string[];
  /** Regex source matching an all-caps heading line in this book's typography. */
  headingPattern: string;
  /** Flags for `headingPattern` — Greek needs "u" for \p{Lu}. */
  headingFlags: string;
  /** Longer than this and a caps line is prose, not a heading. */
  headingMaxLength: number;
}

/**
 * A further grammar of the same language, shipped beside the pack's primary one.
 *
 * The same syllabus taught out of a different book: its own sections, its own
 * order, its own prose. Not a translation of the primary grammar and not a
 * subset of it — two grammars of one language agree on the language and on
 * nothing else, cutting it into topics that only sometimes line up.
 *
 * Only what actually differs is carried. Typography is a property of the
 * language rather than of the book — the case stubs that mark a paradigm and
 * the shape of a heading are the same in any Latin grammar — so `paradigmLabels`
 * and the heading rules are inherited from `Profile.grammar` and not restated.
 * `families` and `grammarShape` are *not* inherited, because they are exactly
 * where two books disagree: a family list is one book's table of contents, and a
 * shape gate is calibrated against one book's idea of how long a topic is.
 *
 * Nothing at runtime reads this yet. It is here so the offline gates can hold a
 * second grammar to the same standard as the first while it is being built.
 */
export interface SecondaryGrammar {
  /** Short id, used in filenames and as the grammar's key, e.g. "lane". */
  id: string;
  /** Human name for reports, e.g. "Lane". */
  label: string;
  /** Where its sections live, relative to `content/`. */
  content: string;
  /** Where its section-accounting manifest lives, relative to `content/`. */
  manifest: string;
  source: GrammarStyle["source"];
  /** Section ids must start with this, e.g. "ln" for Lane. */
  idPrefix: string;
  /** Rendered before a section reference, e.g. "§ ". */
  refPrefix: string;
  /** This book's own table of contents, in the order it draws. */
  families: Family[];
  fallbackFamily: string;
  grammarShape: Profile["grammarShape"];
  /**
   * How much of this book the pack's questions actually reach.
   *
   * Only the two gates that can differ. A further grammar's questions are the
   * primary's, reached through the crosswalk, so everything the pack measures
   * about the questions themselves — how many are attested, how much of the
   * vocabulary band they use, how many prompts repeat — is already answered once
   * for the pack and is not answered again per book.
   *
   * What is genuinely this book's is how much of it can be taught at all:
   * `topicsWithTestsPct` is 100 for the syllabus the questions were written
   * against and is not for any other, because no crosswalk reaches every topic
   * of a book nobody has generated questions for.
   */
  coverage: {
    topicsWithTestsPct: number;
    minTestsPerTopic: number;
    minQuestionsPerTopic: number;
  };
}

/**
 * A further dictionary of the same language, beside the one the pack builds.
 *
 * The pack's own `lemmas.json.gz` answers "what is this word" in one line, and
 * is bound to attestation: what it holds is what the pack may ship. A further
 * dictionary answers a different question — what a word *means*, divided into
 * senses, with the constructions and the citations a real lexicon prints — and
 * is bound to nothing. It is reference material a student can read, never
 * evidence about the pack, which is why nothing that gates it may reach
 * `scripts/lib/reference.mjs`.
 *
 * Declared like `SecondaryGrammar` and for the same reason: so a book is gated
 * from the day it is parsed rather than from the day it is displayed.
 */
export interface SecondaryDictionary {
  /** Short id, used in filenames and as the book's key, e.g. "lewis-short". */
  id: string;
  /** Human name, for reports and for the sheet: "Lewis & Short". */
  label: string;
  /** Where its articles live, relative to `content/`. */
  content: string;
  /** Where its sorted headword index lives, relative to `content/`. */
  index: string;
  /** Where its entry-accounting manifest lives, relative to `content/`. */
  manifest: string;
  source: GrammarStyle["source"];
  /**
   * How many articles this book has, so a truncated parse cannot ship quietly.
   *
   * Only a count, deliberately — no length distribution. `grammarShape` bands
   * topic lengths because a grammar parser is *guessing* a book's divisions out
   * of its prose and can silently take half a topic; a walk over explicit
   * `<entryFree>` elements cannot. And a lexicon's lengths are not bandable
   * anyway: L&S runs from a ten-character cross-reference to the thirty-thousand
   * of `sum`, so any band wide enough to be true is too wide to catch anything.
   */
  shape: {
    minEntries: number;
    maxEntries: number;
  };
  /**
   * How much of the pack's own vocabulary this book answers for.
   *
   * Gated on a *band* rather than on the whole ranked list, on purpose. A
   * lexicon and a frequency list disagree most about rare words — one files a
   * spelling the other does not — so the figure over everything is dominated by
   * words no student meets, and gating it would gate noise. `band` is how far
   * down the ranks the gate looks; the whole-list figures are reported beside
   * it and gate nothing.
   */
  reach: {
    band: number;
    headwordsMatchedPct: number;
  };
}

export interface Profile {
  schema: 1;
  /** Pack directory name; namespaces storage and caches. */
  id: string;
  l2: {
    code: string;
    name: string;
    endonym: string;
    script: string;
    direction: "ltr" | "rtl";
  };
  /** The prompt language. Selects the L1 adapter; only "en" ships today. */
  l1: { code: string; name: string };
  fold: FoldSpec;
  /**
   * How each part of speech's forms are laid out when a word is inspected.
   *
   * `tables` holds, by `pos`, a list of tables; each axis position is
   * `["tag,tag", "Stub"]`, matched against the feature tags the reference
   * gives a form. A form goes in every cell whose tags it carries, most
   * specific winning — which is why a future perfect must name its tense in
   * full or land under the perfect, and why one dative plural serving three
   * genders is printed under all three. `primary` and `secondary` name the
   * tags that mark which variety of the language a form belongs to, so a cell
   * can prefer the spelling this pack teaches. Forms that fit no cell are
   * shown under the tables, not dropped. See `buildParadigm`.
   *
   * Absent where a pack has not written them yet, which is a pack whose words
   * show their citation and no table rather than a pack that fails to build.
   */
  paradigms?: ParadigmAxes;
  /**
   * Particles the language writes joined to the end of the word before them,
   * so `ēloquentiam` + `que` is written `ēloquentiamque` — one token to the
   * crib, and one the dictionary has never heard of. Listed unaccented and
   * without their hyphen. Empty or absent where the language has none.
   *
   * Only the vocabulary lookup uses these, and only as a fallback when the
   * whole form resolves to nothing: a word that is already in the dictionary
   * is never taken apart on suspicion.
   */
  enclitics?: string[];
  /** Display order — the order the grammar index is drawn in. */
  families: Family[];
  fallbackFamily: string;
  grammar: GrammarStyle;
  /**
   * Further grammars of the same language. Absent where a pack has one book,
   * which is every pack today — so saying nothing keeps the old shape valid.
   */
  grammars?: SecondaryGrammar[];
  /**
   * Further dictionaries beside the one the pack builds. Absent where a pack
   * ships only its own, which is the shape every pack had before there were
   * two — so saying nothing stays valid.
   */
  dictionaries?: SecondaryDictionary[];
  questions: {
    defaultKind: string;
    /** Kinds whose prompt is L1 and whose answer is L2: alignable, and drilled. */
    produceKinds: string[];
  };
  citationsVersion: number;
  ui: {
    /** Short name: the splash, the tab title, the PWA short_name. */
    appName: string;
    /** Full name for the PWA manifest, e.g. "Latina — Latin tutor". */
    manifestName: string;
    description: string;
    /** "Translate into Latin" — shown over every question. */
    promptDirection: string;
    cliPlaceholder: string;
    /** The short form in the CLI's key hint line. */
    cliHint: string;
    webPlaceholder: string;
    answerAriaLabel: string;
    /** "say it in Latin" — the vocabulary card's eyebrow, minus its chrome. */
    sayItIn: string;
    themeColor: string;
    backgroundColor: string;
  };
  storage: {
    webProgressKey: string;
    webSyncKey: string;
    cliDir: string;
    githubPath: string;
    exportPrefix: string;
    dictionaryCacheName: string;
  };
  /** Shape gates for the parsed grammar (§ grammar-report). */
  grammarShape: {
    minTopics: number;
    maxTopics: number;
    minTextChars: number;
    maxTextChars: number;
    medianTextCharsRange: [number, number];
    p90TextCharsMax: number;
    maxFamilySharePct: number;
  };
  /** Coverage gates for the generated tests (§ coverage-report). */
  coverage: {
    minTestsPerTopic: number;
    minQuestionsPerTopic: number;
    topicsWithTestsPct: number;
    maxDuplicatePromptPct: number;
    minDictResolvedPct: number;
    minBandUtilisationPct: number;
    minKeptRatioPct: number;
  };
  /**
   * What the pack is allowed to ship that its reference cannot confirm
   * (§ attestation-report), and what the generator may write.
   *
   * Absent means nothing is allowed. A pack that has generated nothing has
   * nothing to excuse, so a language added later inherits the strict rule by
   * saying nothing at all — which is the only default that cannot be forgotten.
   *
   * Both numbers are measurements a pack was admitted at, not targets. They go
   * down as cleanups earn it and are never raised to make a red build green.
   */
  attestation?: {
    /** Distinct unconfirmed forms one question may carry. */
    maxMissesPerQuestion: number;
    /** Unconfirmed answer tokens the whole pack may carry. */
    maxUnattestedForms: number;
  };
}

export class PackError extends Error {}

// --- parsing ---------------------------------------------------------------

type Shape = Record<string, "string" | "number" | "boolean" | "any">;

function object(raw: unknown, path: string): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PackError(`${path}: expected an object`);
  }
  return raw as Record<string, unknown>;
}

/**
 * Check a flat record against a shape and reject unknown keys.
 *
 * Rejecting is the point: a profile is hand-written, and a mistyped key that
 * silently defaults would surface months later as a subtly wrong app. A pack
 * must fail at parse time or not at all.
 */
function fields<T>(raw: unknown, path: string, shape: Shape): T {
  const obj = object(raw, path);
  for (const key of Object.keys(obj)) {
    if (!(key in shape)) throw new PackError(`${path}.${key}: unknown key`);
  }
  for (const [key, kind] of Object.entries(shape)) {
    if (!(key in obj)) throw new PackError(`${path}.${key}: missing`);
    if (kind !== "any" && typeof obj[key] !== kind) {
      throw new PackError(`${path}.${key}: expected ${kind}`);
    }
  }
  return obj as T;
}

function array(raw: unknown, path: string): unknown[] {
  if (!Array.isArray(raw)) throw new PackError(`${path}: expected an array`);
  return raw;
}

function oneOf<T extends string>(raw: unknown, path: string, allowed: readonly T[]): T {
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    throw new PackError(`${path}: expected one of ${allowed.join(", ")}`);
  }
  return raw as T;
}

/**
 * An axis position, written `["tag,tag", "Stub"]` because a profile is read by
 * people and `{ "tags": ["dative", "plural"], "label": "Dat." }` twelve times
 * over is a wall. Tags are compared as a set, so their order here is free.
 */
function parseAxis(raw: unknown, path: string) {
  const pair = array(raw, path);
  if (pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") {
    throw new PackError(`${path}: expected ["tag,tag", "label"] strings`);
  }
  const tags = pair[0].split(",").map((t) => t.trim()).filter(Boolean);
  if (!tags.length) throw new PackError(`${path}: names no tags`);
  return { tags, label: pair[1] };
}

function parseParadigms(raw: unknown): ParadigmAxes {
  const top = object(raw, "profile.paradigms");
  for (const key of Object.keys(top)) {
    if (!["primary", "secondary", "tables"].includes(key)) {
      throw new PackError(`profile.paradigms.${key}: unknown key`);
    }
  }
  const tags = (raw: unknown, where: string) =>
    raw === undefined
      ? undefined
      : array(raw, where).map((tag, i) => {
          if (typeof tag !== "string" || !tag) {
            throw new PackError(`${where}[${i}]: expected a non-empty string`);
          }
          return tag;
        });
  const primary = tags(top.primary, "profile.paradigms.primary");
  const secondary = tags(top.secondary, "profile.paradigms.secondary");

  const byPos = object(top.tables, "profile.paradigms.tables");
  const tables: Record<string, ParadigmBlock[]> = {};
  for (const [pos, value] of Object.entries(byPos)) {
    const where = `profile.paradigms.tables.${pos}`;
    tables[pos] = array(value, where).map((block, i): ParadigmBlock => {
      const b = object(block, `${where}[${i}]`);
      for (const key of Object.keys(b)) {
        if (!["title", "rows", "columns"].includes(key)) {
          throw new PackError(`${where}[${i}].${key}: unknown key`);
        }
      }
      if (b.title !== undefined && typeof b.title !== "string") {
        throw new PackError(`${where}[${i}].title: expected a string`);
      }
      const rows = array(b.rows, `${where}[${i}].rows`).map((r, j) =>
        parseAxis(r, `${where}[${i}].rows[${j}]`),
      );
      const columns = array(b.columns, `${where}[${i}].columns`).map((c, j) =>
        parseAxis(c, `${where}[${i}].columns[${j}]`),
      );
      if (!rows.length || !columns.length) {
        throw new PackError(`${where}[${i}]: a table needs both rows and columns`);
      }
      return { title: b.title as string | undefined, rows, columns };
    });
  }
  return { primary, secondary, tables };
}

function parseFold(raw: unknown): FoldSpec {
  const f = object(raw, "fold");
  for (const key of Object.keys(f)) {
    if (!["trim", "caseFold", "decompose", "stripMarks", "keepMarks", "map", "recompose"].includes(key)) {
      throw new PackError(`fold.${key}: unknown key`);
    }
  }
  const spec: FoldSpec = {
    trim: f.trim === undefined ? true : Boolean(f.trim),
    caseFold: oneOf(f.caseFold, "fold.caseFold", ["lower", "none"] as const),
    decompose: oneOf(f.decompose, "fold.decompose", ["NFD", "NFC", "none"] as const),
    stripMarks: array(f.stripMarks, "fold.stripMarks").map((s, i) => {
      if (typeof s !== "string") throw new PackError(`fold.stripMarks[${i}]: expected a string`);
      return s;
    }),
    keepMarks: (f.keepMarks === undefined ? [] : array(f.keepMarks, "fold.keepMarks")).map(
      (s, i) => {
        if (typeof s !== "string") throw new PackError(`fold.keepMarks[${i}]: expected a string`);
        return s;
      },
    ),
    map: array(f.map, "fold.map").map((pair, i) => {
      const p = array(pair, `fold.map[${i}]`);
      if (p.length !== 2 || typeof p[0] !== "string" || typeof p[1] !== "string") {
        throw new PackError(`fold.map[${i}]: expected [from, to] strings`);
      }
      return [p[0], p[1]] as [string, string];
    }),
    recompose: oneOf(f.recompose, "fold.recompose", ["NFD", "NFC", "none"] as const),
  };
  // A bad class body would otherwise throw on the first word folded, far from here.
  if (spec.stripMarks.length) {
    try {
      new RegExp("[" + spec.stripMarks.join("") + "]", "gu");
    } catch (e) {
      throw new PackError(`fold.stripMarks: not a valid character class (${(e as Error).message})`);
    }
  }
  return spec;
}

/** A family list and the fallback that must name one of them. */
function parseFamilies(raw: unknown, fallback: unknown, path: string) {
  const families = array(raw, `${path}.families`).map((f, i) =>
    fields<Family>(f, `${path}.families[${i}]`, { id: "string", label: "string" }),
  );
  if (!families.length) throw new PackError(`${path}.families: at least one family is required`);
  const seen = new Set<string>();
  for (const f of families) {
    if (seen.has(f.id)) throw new PackError(`${path}.families: duplicate id "${f.id}"`);
    seen.add(f.id);
  }
  if (typeof fallback !== "string" || !seen.has(fallback)) {
    throw new PackError(`${path}.fallbackFamily: must name one of ${path}.families`);
  }
  return { families, fallbackFamily: fallback };
}

function parseShape(raw: unknown, path: string): Profile["grammarShape"] {
  const shape = fields<Profile["grammarShape"]>(raw, path, {
    minTopics: "number", maxTopics: "number", minTextChars: "number",
    maxTextChars: "number", medianTextCharsRange: "any", p90TextCharsMax: "number",
    maxFamilySharePct: "number",
  });
  const range = array(shape.medianTextCharsRange, `${path}.medianTextCharsRange`);
  if (range.length !== 2 || typeof range[0] !== "number" || typeof range[1] !== "number") {
    throw new PackError(`${path}.medianTextCharsRange: expected [min, max] numbers`);
  }
  return shape;
}

function parseSecondaryGrammars(raw: unknown, primaryPrefix: string): SecondaryGrammar[] {
  const seen = new Set<string>([primaryPrefix]);
  return array(raw, "profile.grammars").map((g, i) => {
    const path = `profile.grammars[${i}]`;
    const entry = fields<SecondaryGrammar>(g, path, {
      id: "string", label: "string", content: "string", manifest: "string",
      source: "any", idPrefix: "string", refPrefix: "string", families: "any",
      fallbackFamily: "string", grammarShape: "any", coverage: "any",
    });
    fields(entry.coverage, `${path}.coverage`, {
      topicsWithTestsPct: "number", minTestsPerTopic: "number",
      minQuestionsPerTopic: "number",
    });
    fields(entry.source, `${path}.source`, { title: "string", url: "string", licence: "string" });
    // A shared id prefix would make two books' section ids collide, and a
    // collision here is silent: the ids look well-formed and name the wrong book.
    if (seen.has(entry.idPrefix)) {
      throw new PackError(`${path}.idPrefix: "${entry.idPrefix}" is already used by another grammar`);
    }
    seen.add(entry.idPrefix);
    const { families, fallbackFamily } = parseFamilies(entry.families, entry.fallbackFamily, path);
    return { ...entry, families, fallbackFamily, grammarShape: parseShape(entry.grammarShape, `${path}.grammarShape`) };
  });
}

function parseDictionaries(raw: unknown): SecondaryDictionary[] {
  const seen = new Set<string>();
  return array(raw, "profile.dictionaries").map((d, i) => {
    const path = `profile.dictionaries[${i}]`;
    const entry = fields<SecondaryDictionary>(d, path, {
      id: "string", label: "string", content: "string", index: "string",
      manifest: "string", source: "any", shape: "any", reach: "any",
    });
    fields(entry.source, `${path}.source`, {
      title: "string", url: "string", licence: "string",
    });
    fields(entry.reach, `${path}.reach`, {
      band: "number", headwordsMatchedPct: "number",
    });
    const shape = fields<SecondaryDictionary["shape"]>(entry.shape, `${path}.shape`, {
      minEntries: "number", maxEntries: "number",
    });
    // Two books under one id write over each other's files, and the second
    // wins silently — having been built from the first one's source.
    if (seen.has(entry.id)) {
      throw new PackError(`${path}.id: "${entry.id}" is already used by another dictionary`);
    }
    seen.add(entry.id);
    return { ...entry, shape };
  });
}

/** Parse and validate a raw profile. Throws `PackError` naming the offending path. */
export function parseProfile(raw: unknown): Profile {
  const top = object(raw, "profile");
  const required = [
    "schema", "id", "l2", "l1", "fold", "families", "fallbackFamily", "grammar",
    "questions", "citationsVersion", "ui", "storage", "grammarShape", "coverage",
  ];
  /** Present or absent; a pack that predates them stays valid. */
  const optional = ["enclitics", "paradigms", "attestation", "grammars", "dictionaries"];
  const allowed = [...required, ...optional];
  for (const key of Object.keys(top)) {
    if (!allowed.includes(key)) throw new PackError(`profile.${key}: unknown key`);
  }
  for (const key of required) {
    if (!(key in top)) throw new PackError(`profile.${key}: missing`);
  }
  if (top.schema !== 1) {
    throw new PackError(`profile.schema: unsupported version ${String(top.schema)} (this build reads 1)`);
  }
  if (typeof top.id !== "string" || !top.id) throw new PackError("profile.id: expected a non-empty string");

  const { families, fallbackFamily } = parseFamilies(top.families, top.fallbackFamily, "profile");

  const grammar = fields<GrammarStyle>(top.grammar, "profile.grammar", {
    source: "any", label: "string", idPrefix: "string", refPrefix: "string",
    paradigmLabels: "any",
    headingPattern: "string", headingFlags: "string", headingMaxLength: "number",
  });
  fields(grammar.source, "profile.grammar.source", {
    title: "string", url: "string", licence: "string",
  });
  array(grammar.paradigmLabels, "profile.grammar.paradigmLabels").forEach((l, i) => {
    if (typeof l !== "string") throw new PackError(`profile.grammar.paradigmLabels[${i}]: expected a string`);
  });
  try {
    new RegExp(grammar.headingPattern, grammar.headingFlags);
  } catch (e) {
    throw new PackError(`profile.grammar.headingPattern: ${(e as Error).message}`);
  }

  const questions = fields<Profile["questions"]>(top.questions, "profile.questions", {
    defaultKind: "string", produceKinds: "any",
  });
  const produce = array(questions.produceKinds, "profile.questions.produceKinds");
  if (!produce.length) throw new PackError("profile.questions.produceKinds: at least one kind is required");
  produce.forEach((k, i) => {
    if (typeof k !== "string") throw new PackError(`profile.questions.produceKinds[${i}]: expected a string`);
  });

  const profile: Profile = {
    schema: 1,
    id: top.id,
    l2: fields<Profile["l2"]>(top.l2, "profile.l2", {
      code: "string", name: "string", endonym: "string", script: "string", direction: "string",
    }),
    l1: fields<Profile["l1"]>(top.l1, "profile.l1", { code: "string", name: "string" }),
    fold: parseFold(top.fold),
    paradigms: top.paradigms === undefined ? undefined : parseParadigms(top.paradigms),
    enclitics:
      top.enclitics === undefined
        ? undefined
        : array(top.enclitics, "profile.enclitics").map((e, i) => {
            if (typeof e !== "string" || !e) {
              throw new PackError(`profile.enclitics[${i}]: expected a non-empty string`);
            }
            return e;
          }),
    families,
    fallbackFamily,
    grammar,
    questions,
    citationsVersion: typeof top.citationsVersion === "number"
      ? top.citationsVersion
      : (() => { throw new PackError("profile.citationsVersion: expected a number"); })(),
    ui: fields<Profile["ui"]>(top.ui, "profile.ui", {
      appName: "string", manifestName: "string", description: "string",
      promptDirection: "string", cliPlaceholder: "string", cliHint: "string",
      webPlaceholder: "string", answerAriaLabel: "string", sayItIn: "string",
      themeColor: "string", backgroundColor: "string",
    }),
    storage: fields<Profile["storage"]>(top.storage, "profile.storage", {
      webProgressKey: "string", webSyncKey: "string", cliDir: "string",
      githubPath: "string", exportPrefix: "string", dictionaryCacheName: "string",
    }),
    grammarShape: parseShape(top.grammarShape, "profile.grammarShape"),
    coverage: fields<Profile["coverage"]>(top.coverage, "profile.coverage", {
      minTestsPerTopic: "number", minQuestionsPerTopic: "number",
      topicsWithTestsPct: "number", maxDuplicatePromptPct: "number",
      minDictResolvedPct: "number", minBandUtilisationPct: "number",
      minKeptRatioPct: "number",
    }),
  };
  if (top.attestation !== undefined) {
    profile.attestation = fields<NonNullable<Profile["attestation"]>>(
      top.attestation, "profile.attestation",
      { maxMissesPerQuestion: "number", maxUnattestedForms: "number" },
    );
  }
  if (top.grammars !== undefined) {
    profile.grammars = parseSecondaryGrammars(top.grammars, grammar.idPrefix);
  }
  if (top.dictionaries !== undefined) {
    profile.dictionaries = parseDictionaries(top.dictionaries);
  }
  oneOf(profile.l2.direction, "profile.l2.direction", ["ltr", "rtl"] as const);
  return profile;
}

// --- fold identity ---------------------------------------------------------

/**
 * A short stable digest of the fold rules.
 *
 * The built dictionary index is keyed by folded forms, so a profile whose fold
 * has changed since the bundle was built would miss every lookup while looking
 * perfectly healthy. The web loader compares this against the value baked into
 * the bundle and refuses to start on a mismatch.
 *
 * FNV-1a rather than SHA: this detects change, it does not defend against
 * anyone, and it must run in the browser without pulling in `node:crypto`.
 */
export function profileHash(spec: FoldSpec): string {
  const canonical = JSON.stringify([
    spec.trim !== false,
    spec.caseFold,
    spec.decompose,
    [...spec.stripMarks],
    [...(spec.keepMarks ?? [])],
    [...spec.map].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    spec.recompose,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
