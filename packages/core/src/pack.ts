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

/** Parse and validate a raw profile. Throws `PackError` naming the offending path. */
export function parseProfile(raw: unknown): Profile {
  const top = object(raw, "profile");
  const required = [
    "schema", "id", "l2", "l1", "fold", "families", "fallbackFamily", "grammar",
    "questions", "citationsVersion", "ui", "storage", "grammarShape", "coverage",
  ];
  /** Present or absent; a pack that predates them stays valid. */
  const optional = ["enclitics"];
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

  const families = array(top.families, "profile.families").map((f, i) =>
    fields<Family>(f, `profile.families[${i}]`, { id: "string", label: "string" }),
  );
  if (!families.length) throw new PackError("profile.families: at least one family is required");
  const seen = new Set<string>();
  for (const f of families) {
    if (seen.has(f.id)) throw new PackError(`profile.families: duplicate id "${f.id}"`);
    seen.add(f.id);
  }
  const fallbackFamily = top.fallbackFamily;
  if (typeof fallbackFamily !== "string" || !seen.has(fallbackFamily)) {
    throw new PackError("profile.fallbackFamily: must name one of profile.families");
  }

  const grammar = fields<GrammarStyle>(top.grammar, "profile.grammar", {
    source: "any", idPrefix: "string", refPrefix: "string", paradigmLabels: "any",
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
    grammarShape: fields<Profile["grammarShape"]>(top.grammarShape, "profile.grammarShape", {
      minTopics: "number", maxTopics: "number", minTextChars: "number",
      maxTextChars: "number", medianTextCharsRange: "any", p90TextCharsMax: "number",
      maxFamilySharePct: "number",
    }),
    coverage: fields<Profile["coverage"]>(top.coverage, "profile.coverage", {
      minTestsPerTopic: "number", minQuestionsPerTopic: "number",
      topicsWithTestsPct: "number", maxDuplicatePromptPct: "number",
      minDictResolvedPct: "number", minBandUtilisationPct: "number",
      minKeptRatioPct: "number",
    }),
  };
  oneOf(profile.l2.direction, "profile.l2.direction", ["ltr", "rtl"] as const);
  const range = array(profile.grammarShape.medianTextCharsRange, "profile.grammarShape.medianTextCharsRange");
  if (range.length !== 2 || typeof range[0] !== "number" || typeof range[1] !== "number") {
    throw new PackError("profile.grammarShape.medianTextCharsRange: expected [min, max] numbers");
  }
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
