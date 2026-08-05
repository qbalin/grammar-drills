/**
 * Grammar families — the coarse grouping the syllabus is displayed in.
 *
 * Which families exist is a fact about the language's reference grammar, so the
 * list lives in the pack's profile rather than here: Bennett's parts give Latin
 * nine, Smyth would give Greek its own, and the engine only needs them to be
 * ordered and named. Each `GrammarSection` carries its family in the content
 * bundle, so nothing is inferred from the id.
 *
 * The order is load-bearing: it is the order the grammar index is drawn in, and
 * so the order a student comes to look things up in.
 */
import type { Family, Profile } from "./pack.js";

/**
 * A family id. Plain string: the set is per-language, so there is no union to
 * check against here. `familyOf` is what makes an unknown value safe.
 */
export type FamilyId = string;

export type { Family };

/** The family a section belongs to, defaulting sanely on unknown content. */
export function familyOf(profile: Profile, family: string | undefined): FamilyId {
  return family && profile.families.some((f) => f.id === family)
    ? family
    : profile.fallbackFamily;
}

/**
 * The family's label, named the way it would be said aloud. There is no
 * abbreviated form: a map is for finding your way, and "Ptcl" tells a student
 * nothing about where they are.
 */
export function familyLabel(profile: Profile, id: FamilyId): string {
  return profile.families.find((f) => f.id === id)?.label ?? id;
}
