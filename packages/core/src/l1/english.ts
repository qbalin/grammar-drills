/**
 * English as the prompt language.
 *
 * The crib pairs each L2 word of the answer with the prompt word it translates,
 * which means reading the prompt as a language rather than as a string: knowing
 * that *daughters* and *daughter* are the same word, that *led* comes from
 * *lead*, and that "the" is not worth matching on. All of that is about English
 * and none of it is about the language being taught, so it lives here and the
 * profile's `l1` chooses it.
 *
 * A pack prompting in another language needs a sibling of this file. Until one
 * exists the crib degrades honestly: the rows come back unpaired rather than
 * wrongly paired.
 */
import type { Candidate, L1Adapter, PromptIndex } from "./index.js";

/**
 * English words carrying no meaning to match on. Matching against these would
 * pair an L2 word with whichever "the" or "having" came first, which is worse
 * than leaving it unpaired: an unpaired word says "work this one out", a wrongly
 * paired one says something false.
 */
const ENGLISH_STOP = new Set(
  ("a an the and or but of to in on at by for from with as so that this these those" +
    " is are was were be been being am has have had having do does did will would" +
    " shall should may might must can could not no nor if then than when while" +
    " he she it they we you i him her them us his hers its their our your my mine" +
    " there here who whom whose which what").split(/\s+/),
);

/**
 * Irregular English, which no suffix rule can reach. The prompts are ordinary
 * narrative English, so past tenses like *led*, *fled* and *sought* are common,
 * and each one missing costs a word its partner.
 */
const ENGLISH_IRREGULAR: Record<string, string> = {
  led: "lead", fled: "flee", went: "go", gone: "go", took: "take",
  taken: "take", saw: "see", seen: "see", gave: "give", given: "give",
  came: "come", sent: "send", built: "build", fought: "fight",
  brought: "bring", bought: "buy", caught: "catch", taught: "teach",
  sought: "seek", thought: "think", told: "tell", sold: "sell",
  held: "hold", heard: "hear", kept: "keep", left: "leave", lost: "lose",
  made: "make", met: "meet", paid: "pay", ran: "run", said: "say",
  sat: "sit", spoke: "speak", spoken: "speak", stood: "stand",
  struck: "strike", wrote: "write", written: "write", knew: "know",
  known: "know", grew: "grow", threw: "throw", thrown: "throw",
  drove: "drive", driven: "drive", rose: "rise", risen: "rise",
  chose: "choose", chosen: "choose", began: "begin", begun: "begin",
  broke: "break", broken: "break", fell: "fall", fallen: "fall",
  felt: "feel", found: "find", forgot: "forget", froze: "freeze",
  hid: "hide", hidden: "hide", sang: "sing", sung: "sing",
  drank: "drink", drunk: "drink", swam: "swim", flew: "fly",
  flown: "fly", slew: "slay", slain: "slay", bore: "bear", borne: "bear",
  won: "win", shone: "shine", rode: "ride", ridden: "ride",
  wore: "wear", worn: "wear", arose: "arise", arisen: "arise",
  beheld: "behold", bound: "bind", burnt: "burn", dealt: "deal",
  dug: "dig", drew: "draw", drawn: "draw", fed: "feed", laid: "lay",
  lain: "lie", lent: "lend", lit: "light", shot: "shoot",
  shut: "shut", slept: "sleep", spent: "spend", spread: "spread",
  sprang: "spring", stole: "steal", stolen: "steal", swore: "swear",
  sworn: "swear", swept: "sweep", tore: "tear", torn: "tear",
  woke: "wake", wound: "wind",
  men: "man", women: "woman", children: "child", feet: "foot",
  teeth: "tooth", geese: "goose", mice: "mouse", oxen: "ox",
  wives: "wife", lives: "life", knives: "knife", leaves: "leaf",
  thieves: "thief", wolves: "wolf", selves: "self",
};

/**
 * How far a spelling is from the word the prompt actually used. A match that
 * bent the word less is a better match, and the tiers are tried in order.
 *
 * It is what separates the two readings of `dōna` in "the queen gave gifts to
 * the gods": *gift*→*gifts* is a plural, *give*→*gave* is an irregular past, so
 * the noun is offered and `dōnum, dōnī` wins over `dōnō, dōnāre`. Without the
 * tiers whichever L2 word came first would simply take the prompt word it
 * happened to reach.
 */
const AS_WRITTEN = 0;
const INFLECTED = 1;
const IRREGULAR = 2;

/**
 * Every spelling of an English word worth matching on — the word itself, what it
 * looks like stripped of an inflection, and what it looks like carrying one —
 * each with how far it was bent to get there.
 *
 * Both directions are needed because either side may be the inflected one: the
 * prompt says *carrying* where the gloss says *carry*, and *daughters* where it
 * says *daughter*, but it also says *war* where a gloss says *wars*.
 */
function englishForms(word: string): Map<string, number> {
  const out = new Map<string, number>();
  // Kept only if nothing nearer claims the spelling first.
  const at = (form: string, tier: number) => {
    // Two letters match too much: "an" would pair with half the glosses in the
    // dictionary.
    if (form.length < 3) return;
    const known = out.get(form);
    if (known === undefined || tier < known) out.set(form, tier);
  };

  // "the farmer's daughters" is the only place the farmer is named, and no
  // dictionary glosses anything as "farmer's".
  const w = word.toLowerCase().replace(/'s$|'$/, "");
  at(w, AS_WRITTEN);

  const irregular = ENGLISH_IRREGULAR[w];
  if (irregular) at(irregular, IRREGULAR);

  // Strip an inflection.
  if (w.endsWith("ies") && w.length > 4) at(`${w.slice(0, -3)}y`, INFLECTED);
  if (w.endsWith("ves") && w.length > 4) {
    at(`${w.slice(0, -3)}f`, INFLECTED);
    at(`${w.slice(0, -3)}fe`, INFLECTED);
  }
  for (const suffix of ["es", "s", "ed", "ing", "ly", "er", "est", "en"]) {
    if (!w.endsWith(suffix) || w.length - suffix.length < 3) continue;
    const base = w.slice(0, -suffix.length);
    at(base, INFLECTED);
    // "loved" -> "love". "carrying" -> "carrye" is junk, but harmless: it only
    // ever has to *fail* to match.
    at(`${base}e`, INFLECTED);
    // "stopped" -> "stop", "running" -> "run".
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      at(base.slice(0, -1), INFLECTED);
    }
  }

  // Add one.
  for (const suffix of ["s", "es", "ed", "ing", "d"]) at(`${w}${suffix}`, INFLECTED);
  if (w.endsWith("y")) at(`${w.slice(0, -1)}ies`, INFLECTED);
  if (w.endsWith("e")) at(`${w.slice(0, -1)}ing`, INFLECTED);

  return out;
}

export const english: L1Adapter = {
  code: "en",

  // Nearest matches first; `questionVocabulary` walks these in order.
  tiers: [AS_WRITTEN, INFLECTED, IRREGULAR],

  indexPrompt(prompt: string): PromptIndex {
    const words = (prompt.match(/[A-Za-z']+/g) ?? []).filter(
      (w) => !ENGLISH_STOP.has(w.toLowerCase()),
    );
    const byForm = new Map<string, Candidate[]>();
    words.forEach((word, position) => {
      for (const [form, tier] of englishForms(word)) {
        const at = byForm.get(form);
        if (at) at.push({ position, tier });
        else byForm.set(form, [{ position, tier }]);
      }
    });
    return { words, byForm };
  },

  /**
   * A dictionary gloss cut into the senses it lists.
   *
   * "to carry, bear; to convey, bring" is four senses, and the citation form of
   * a verb is glossed with the infinitive marker the prompt will never use.
   */
  glossSenses(gloss: string): string[] {
    return gloss
      .split(/[;,]/)
      .map((sense) => sense.trim().toLowerCase().replace(/^(?:to|an?|the)\s+/, ""))
      .filter((sense) => sense !== "");
  },

  /** The words of one sense, for when the sense is a phrase. */
  senseWords(sense: string): string[] {
    return sense.match(/[a-z']+/g) ?? [];
  },
};
