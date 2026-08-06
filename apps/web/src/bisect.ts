/**
 * The bisection reader moved into `@lang-tutor/core` when the CLI needed it
 * too: both apps now read the same sorted `forms.txt.gz` the pack ships, rather
 * than the web repacking a map the CLI parsed whole. Re-exported here so the
 * call sites that grew up around it — `paradigm-index.ts` and its tests — keep
 * reading as they did.
 */
export { bisect } from "@lang-tutor/core";
