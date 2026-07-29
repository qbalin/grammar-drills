/**
 * The language this build is for.
 *
 * The web app is built one language at a time, so the profile is a compile-time
 * constant rather than something fetched: no extra request, no ordering problem
 * against the service worker, and the manifest and the running app cannot
 * disagree about which language they are.
 */
import { compileFold, parseProfile } from "@latin-tutor/core";
import raw from "@pack/profile";

export const profile = parseProfile(raw);

/** What counts as the same word in this language. */
export const fold = compileFold(profile.fold);
