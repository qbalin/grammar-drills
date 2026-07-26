/**
 * Grammar families — the coarse grouping the syllabus is displayed in.
 *
 * These follow the part/chapter structure of Bennett's *New Latin Grammar*:
 * Part II splits into the declension topics (nouns, adjectives, pronouns) and
 * the conjugation topics; Part III is the particles; Part V's chapters give
 * the syntax families. Each `GrammarSection` carries its family in the
 * content bundle, so nothing is inferred from the id here.
 */

export type FamilyId =
  | "nouns"
  | "adj"
  | "pron"
  | "verb-forms"
  | "particles"
  | "noun-syntax"
  | "adj-pron-syntax"
  | "verb-syntax"
  | "style";

/**
 * Display order, each family named the way it would be said aloud. There is no
 * abbreviated form: a map is for finding your way, and "Ptcl" tells a student
 * nothing about where they are.
 */
export const FAMILIES: ReadonlyArray<{ id: FamilyId; label: string }> = [
  { id: "nouns", label: "Nouns" },
  { id: "adj", label: "Adjectives & adverbs" },
  { id: "pron", label: "Pronouns" },
  { id: "verb-forms", label: "Verb forms" },
  { id: "particles", label: "Particles" },
  { id: "noun-syntax", label: "Noun syntax" },
  { id: "adj-pron-syntax", label: "Adjective & pronoun syntax" },
  { id: "verb-syntax", label: "Verb syntax" },
  { id: "style", label: "Word-order & style" },
];

const IDS = new Set<string>(FAMILIES.map((f) => f.id));

/** The family a section belongs to, defaulting sanely on unknown content. */
export function familyOf(family: string | undefined): FamilyId {
  return family && IDS.has(family) ? (family as FamilyId) : "style";
}

export function familyLabel(id: FamilyId): string {
  return FAMILIES.find((f) => f.id === id)?.label ?? id;
}
