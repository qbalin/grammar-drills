/**
 * Is this form real? — asked once, by everything that asks it.
 *
 * The generator asks at generation time, before an item is written; the
 * attestation report asks of what is already on disk. Two copies of the rule
 * would drift, and drift here is invisible in the worst direction: a checker
 * stricter than the generator condemns sentences the generator was right to
 * keep, and one laxer waves through what generation would have caught. Gate C5
 * already drifted this way — it calls `ref.attests` bare, with neither the
 * function-word allowlist nor the proper-noun exemption, which is why `Numa`
 * reads as a miss there and as ordinary Latin in `gen-tests.mjs`.
 *
 * It is the same argument the generator already makes about the fold, one line
 * up from where this used to live: the pack's own rule, not a copy of it.
 *
 * Nothing here knows a language. The allowlist, the proper-noun heuristic and
 * the enclitics are all read from the pack.
 */

import { compileFold, stripPunctuation } from "@lang-tutor/core";

/**
 * Why a form was let through, or was not.
 *
 * The report buckets on this, and the buckets are what say whether a miss is a
 * question to regenerate or a dictionary to grow — so "the reference confirmed
 * it" and "the pack's allowlist covers it" have to stay distinguishable rather
 * than both collapsing to "ok".
 */
export const REASONS = /** @type {const} */ ([
  "empty",
  "function-word",
  "attested",
  "enclitic",
  "proper-noun",
  "miss",
]);

/**
 * One form as the checker sees it: leading and trailing non-letters gone.
 *
 * `stripPunctuation` rather than a private character class, because the report
 * reaches its forms through `words()`, which is built on it. A checker that cut
 * words differently from the thing feeding it words would call the difference a
 * miss — which is exactly what `ἐφ’` was: the generator's own class stripped the
 * ASCII apostrophe and left the U+2019 one, so the allowlist matched the elided
 * spelling it was written for and missed the other.
 */
export function clean(raw) {
  return stripPunctuation(String(raw ?? "").trim());
}

/**
 * A form's attestation under one reference, with the pack's rules applied.
 *
 * `ref` is an `openReference` result, so the same classifier answers from the
 * pack's committed content or from the full dictionary depending only on what
 * it was handed. The report runs two of these side by side; the difference
 * between them is the shipped index's shortfall, which is a different repair
 * from a bad sentence.
 *
 * `config` may be empty: a pack that has generated nothing has no gen/config,
 * and no allowlist is a truthful answer for it rather than a crash.
 */
export function makeClassifier({ profile, config = {}, ref }) {
  const fold = compileFold(profile.fold);

  /*
   * Each allowlisted word is registered under both its own folded key and its
   * punctuation-stripped one, so an elided form matches whether or not the
   * apostrophe survived the tokenizer that produced it. The stripped keys are
   * truncated stems — `ἐφ`, `δ`, `ταῦτ` — which are no other word, and they
   * only ever grant a pass to a form that has already failed the reference.
   */
  const functionWords = new Set();
  for (const word of config.functionWords ?? []) {
    functionWords.add(fold(word));
    functionWords.add(fold(clean(word)));
  }

  const enclitics = profile.enclitics ?? [];
  const midSentenceCapital = config.properNounExemption === "mid-sentence-capital";

  /**
   * The reference's verdict, looking through an enclitic if it has to.
   *
   * The whole form is tried first and wins whenever it resolves, because
   * `neque` and `quisque` are words in their own right and a rule that took the
   * ending off on sight would resolve them to the wrong thing. The same order,
   * and the same reason, as the crib's `readings` in `question-vocab.ts`.
   */
  function attests(form) {
    if (ref.attests(fold(form))) return "attested";
    for (const enclitic of enclitics) {
      if (form.length <= enclitic.length) continue;
      if (fold(form.slice(-enclitic.length)) !== fold(enclitic)) continue;
      if (ref.attests(fold(form.slice(0, -enclitic.length)))) return "enclitic";
    }
    return null;
  }

  /**
   * Classify one form against the reference and the pack's rules.
   *
   * `firstWord` is the answer's first word: a mid-sentence capital is a proper
   * noun and earns a pass, while the first word is capitalised by position and
   * earns nothing. Exempting every capital would wave through the opening word
   * of every answer, which is the whole failure the rule guards against.
   */
  function classify(raw, firstWord) {
    const word = clean(raw);
    if (!word) return { verdict: "ok", reason: "empty", form: "" };

    const folded = fold(word);
    if (functionWords.has(folded)) {
      return { verdict: "ok", reason: "function-word", form: word };
    }

    const found = attests(word);
    if (found) return { verdict: "ok", reason: found, form: word };

    if (
      midSentenceCapital &&
      word !== word.toLowerCase() &&
      folded !== fold(clean(firstWord ?? ""))
    ) {
      return { verdict: "ok", reason: "proper-noun", form: word };
    }

    return { verdict: "unverified", reason: "miss", form: word };
  }

  return { classify, clean, fold, enclitics, functionWords };
}
