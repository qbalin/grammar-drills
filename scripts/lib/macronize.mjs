/**
 * Putting the marks back on a sentence that was printed without them.
 *
 * The pack's 6,581 Latin answers are macronized; the dictionary's quotations
 * mostly are not, and that mismatch is invisible to every gate there is, because
 * the fold strips marks before anything compares. So an unmarked sentence shipped
 * beside marked ones is a defect that only a reader can catch — which is the
 * argument `scripts/lib/quotes.mjs` makes when it cuts 3,158 prose quotations
 * down to 799.
 *
 * This is the attempt to not pay that cut. The fold is many-to-one and therefore
 * not invertible, but it is very nearly invertible in practice: most Latin
 * wordforms have exactly one marked spelling, and where a folded key has only
 * one, restoring it is a lookup rather than a guess.
 *
 * What is left over is genuinely ambiguous — `puella` is nominative and `puellā`
 * ablative and the letters cannot tell you which — and this module does not
 * pretend otherwise. It reports the candidates and lets the caller decide
 * whether to read the sentence, ask something that can, or ship it as printed.
 *
 * Needs the dictionary backend, for the reason `spellingsOf` gives: the pack's
 * own `forms.txt.gz` is keyed by fold output and has already thrown the marks
 * away. That puts this beside `build-lemmas.mjs` and `citations.mjs` on the
 * needs-a-reference side of the line, and it is why the artifact it feeds is
 * committed rather than rebuilt.
 */

import { words, stripPunctuation } from "@lang-tutor/core";

/** Marks the fold strips and this module is trying to put back. */
const COMBINING = /[̄̆]/;
const PRECOMPOSED = /[āēīōūȳĀĒĪŌŪȲăĕĭŏŭўĂĔĬŎŬ]/;

/** Does this text already carry vowel-length marks? */
export function marked(text) {
  return PRECOMPOSED.test(text) || COMBINING.test(text.normalize("NFD"));
}

/**
 * Re-apply a token's original capitalisation and surrounding punctuation.
 *
 * The dictionary stores `puellā`, lowercase and bare; the sentence had
 * `Puellā,`. Restoring a spelling means putting the shell back, or the sentence
 * comes out of this decapitalised and unpunctuated.
 */
function reshell(original, spelling) {
  const core = stripPunctuation(original);
  if (!core) return original;
  const at = original.indexOf(core);
  const before = original.slice(0, at);
  const after = original.slice(at + core.length);
  const cased =
    core[0] === core[0].toUpperCase() && core[0] !== core[0].toLowerCase()
      ? spelling[0].toUpperCase() + spelling.slice(1)
      : spelling;
  return before + cased + after;
}

/**
 * One token's verdict.
 *
 * `kept` is the token unchanged — either it was already marked, or the
 * dictionary had nothing to say. `restored` is a single-candidate lookup, the
 * only outcome that is a fact rather than a choice. `ambiguous` carries the
 * candidates so that something able to read the sentence can pick one.
 */
function resolve(token, { ref, fold }) {
  const core = stripPunctuation(token);
  if (!core) return { state: "kept", token, why: "empty" };
  if (marked(core)) return { state: "kept", token, why: "already-marked" };

  const spellings = ref.spellingsOf(fold(core));
  if (!spellings.length) return { state: "kept", token, why: "unknown" };

  // A folded key answers with every spelling filed under it, including the
  // unmarked one the sentence already has. Distinct *marked* spellings are the
  // only thing that constitutes a choice: if `puella` is the sole marked
  // reading, the bare form in the text is the same word and not a rival.
  const candidates = [...new Set(spellings.filter(marked))];
  if (!candidates.length) return { state: "kept", token, why: "no-marked-form" };
  if (candidates.length === 1) {
    return { state: "restored", token: reshell(token, candidates[0]), why: "unique" };
  }
  return {
    state: "ambiguous",
    token,
    candidates: candidates.map((c) => reshell(token, c)),
    why: "several",
  };
}

/**
 * Macronize a sentence as far as the dictionary can, and say what it could not.
 *
 * Returns the text with every unambiguous token restored, plus the ambiguous
 * ones as `{index, token, candidates}` so a caller can present a closed choice
 * rather than an open one. `unknown` counts tokens the dictionary has never
 * heard of — a proper name, usually, and not a failure.
 *
 * Deliberately does not decide anything about the leftovers. Whether an
 * ambiguous sentence is worth a second pass, and whether an unresolved one is
 * worth shipping unmarked, are policy, and policy belongs to the caller.
 */
export function macronize(text, { ref, fold }) {
  if (marked(text)) {
    return { text, restored: 0, ambiguous: [], unknown: 0, wasMarked: true };
  }

  const tokens = text.split(/(\s+)/);
  const ambiguous = [];
  let restored = 0;
  let unknown = 0;
  let wordIndex = -1;

  const out = tokens.map((token) => {
    if (!token.trim()) return token;
    wordIndex++;
    const verdict = resolve(token, { ref, fold });
    if (verdict.state === "restored") {
      restored++;
      return verdict.token;
    }
    if (verdict.state === "ambiguous") {
      ambiguous.push({
        index: wordIndex,
        token: verdict.token,
        candidates: verdict.candidates,
      });
      return verdict.token;
    }
    if (verdict.why === "unknown") unknown++;
    return verdict.token;
  });

  return { text: out.join(""), restored, ambiguous, unknown, wasMarked: false };
}

/**
 * Apply a chosen spelling per ambiguous position.
 *
 * `choices` is `{[index]: spelling}` — whatever read the sentence returns which
 * of the candidates it meant, and this puts them in. A position with no choice,
 * or a choice that is not one of the candidates offered, is left as it was:
 * an unmarked word is a smaller defect than a wrongly marked one.
 */
export function applyChoices(text, ambiguous, choices) {
  const wanted = new Map();
  for (const slot of ambiguous) {
    const pick = choices?.[slot.index];
    if (pick && slot.candidates.includes(pick)) wanted.set(slot.index, pick);
  }
  if (!wanted.size) return { text, applied: 0 };

  let wordIndex = -1;
  const out = text.split(/(\s+)/).map((token) => {
    if (!token.trim()) return token;
    wordIndex++;
    return wanted.get(wordIndex) ?? token;
  });
  return { text: out.join(""), applied: wanted.size };
}

/** How many of a sentence's words the fold could not put marks back on. */
export function unresolvedCount(result) {
  return result.ambiguous.length;
}

/** Word count as the rest of the pipeline counts it, for funnel arithmetic. */
export function wordCount(text) {
  return words(text).length;
}
