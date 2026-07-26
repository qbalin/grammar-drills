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

/** Display order, with a short label for the map's narrow columns. */
export const FAMILIES: ReadonlyArray<{ id: FamilyId; label: string; full: string }> = [
  { id: "nouns", label: "Nouns", full: "Nouns" },
  { id: "adj", label: "Adj/Adv", full: "Adjectives & adverbs" },
  { id: "pron", label: "Pron", full: "Pronouns" },
  { id: "verb-forms", label: "Verbs", full: "Verb forms" },
  { id: "particles", label: "Ptcl", full: "Particles" },
  { id: "noun-syntax", label: "N-syntax", full: "Noun syntax" },
  { id: "adj-pron-syntax", label: "A-syntax", full: "Adjective & pronoun syntax" },
  { id: "verb-syntax", label: "V-syntax", full: "Verb syntax" },
  { id: "style", label: "Style", full: "Word-order & style" },
];

const IDS = new Set<string>(FAMILIES.map((f) => f.id));

/** The family a section belongs to, defaulting sanely on unknown content. */
export function familyOf(family: string | undefined): FamilyId {
  return family && IDS.has(family) ? (family as FamilyId) : "style";
}

export function familyLabel(id: FamilyId): string {
  return FAMILIES.find((f) => f.id === id)?.label ?? id;
}

export function familyFull(id: FamilyId): string {
  return FAMILIES.find((f) => f.id === id)?.full ?? id;
}
