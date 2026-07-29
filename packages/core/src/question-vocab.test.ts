import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { testProfile } from "./profile.fixture.js";
import { words, questionVocabulary } from "./question-vocab.js";
import type { LemmaMap, Question } from "./types.js";

/**
 * Real entries, copied from `content/lemmas.json.gz` rather than invented: the
 * whole point of the crib is which reading of an ambiguous form it picks, and a
 * hand-written dictionary would let the test agree with itself.
 */
const lemmas: LemmaMap = {
  filiae: [
    { lemma: "filia", citation: "filia, fīliae", gloss: "daughter; any female offspring", pos: "noun", declension: "1", rank: 1512 },
  ],
  agricolae: [
    { lemma: "agricola", citation: "agricola, agricolae (m)", gloss: "farmer", pos: "noun", gender: "masculine", rank: 3706 },
  ],
  aquam: [
    { lemma: "aqua", citation: "aqua, aquae (f)", gloss: "water", pos: "noun", gender: "feminine", rank: 168 },
  ],
  ex: [{ lemma: "ex", citation: "ex (prep)", gloss: "out of, from; down from", pos: "prep", rank: 53 }],
  alto: [
    { lemma: "altus", citation: "altus, alta, altum", gloss: "tall, lofty; high (of measurement); deep, profound", pos: "adj", rank: 764 },
    { lemma: "alto", citation: "alto, altāre", gloss: "to make high, raise, elevate", pos: "verb", rank: 980 },
  ],
  puteo: [
    { lemma: "pūteō", citation: "pūteō, pūtēre", gloss: "to stink, be rotten, putrid", pos: "verb", rank: 1794 },
  ],
  portabant: [
    { lemma: "portō", citation: "portō, portāre, portāvī, portātum", gloss: "to carry, bear; to convey, bring", pos: "verb", rank: 1204 },
  ],
  bellum: [
    { lemma: "bellus", citation: "bellus, bella, bellum", gloss: "beautiful, pretty, handsome; pleasant, agreeable, charming", pos: "adj", rank: 561 },
    { lemma: "bellum", citation: "bellum, bellī (n)", gloss: "war", pos: "noun", gender: "neuter", rank: 583 },
  ],
  dona: [
    { lemma: "dono", citation: "dōnō, dōnāre, dōnāvī, dōnātum", gloss: "to give; to present (someone with something)", pos: "verb", rank: 921 },
    { lemma: "dōnum", citation: "dōnum, dōnī", gloss: "gift, present; offering, sacrifice", pos: "noun", rank: 1322 },
  ],
  regina: [
    { lemma: "rex", citation: "rex, rēgis", gloss: "king, ruler; despot, tyrant", pos: "noun", rank: 475 },
    { lemma: "regina", citation: "regina, rēgīnae", gloss: "queen; princess", pos: "noun", rank: 2216 },
  ],
  mare: [
    { lemma: "mās", citation: "mās, mare", gloss: "male, masculine, manly", pos: "adj", rank: 1249 },
    { lemma: "mare", citation: "mare, maris (n)", gloss: "sea", pos: "noun", gender: "neuter", rank: 1344 },
  ],
  fortiter: [
    { lemma: "fortis", citation: "fortis, forte", gloss: "strong, powerful; firm, resolute, steadfast, stout", pos: "adj", rank: 332 },
    { lemma: "fortiter", citation: "fortiter (adv)", gloss: "strongly, powerfully; bravely, boldly", pos: "adv", rank: 1613 },
  ],
  duxit: [
    { lemma: "dūcō", citation: "dūcō, dūcere, dūxī, ductum", gloss: "to lead, guide, conduct, lead away; to take", pos: "verb", rank: 276 },
  ],
  legiones: [
    { lemma: "legio", citation: "legio, legiōnis", gloss: "a Roman legion", pos: "noun", rank: 700 },
  ],
  manibus: [
    { lemma: "manus", citation: "manus, manūs (f)", gloss: "hand; bravery, valor", pos: "noun", gender: "feminine", rank: 157 },
  ],
  manu: [
    { lemma: "manus", citation: "manus, manūs (f)", gloss: "hand; bravery, valor", pos: "noun", gender: "feminine", rank: 157 },
  ],
};

const content = new Content({ grammar: [], tests: {}, lemmas }, testProfile);

/** Only `prompt` and `answer` matter here; the rest is the shipped shape. */
const ask = (prompt: string, answer: string): Question => ({
  prompt,
  answer,
  kind: "translate-en-la",
  vocab: [],
});

const crib = (prompt: string, answer: string) =>
  questionVocabulary(content, ask(prompt, answer));

/** `english → citation`, which is what the panel actually shows. */
const pairs = (prompt: string, answer: string) =>
  crib(prompt, answer).map((w) => [w.english ?? null, w.entry?.citation ?? null]);

describe("words", () => {
  it("strips the punctuation around a word but not inside it", () => {
    expect(words("Fīliae agricolae aquam, ex altō puteō portābant.")).toEqual([
      "Fīliae", "agricolae", "aquam", "ex", "altō", "puteō", "portābant",
    ]);
  });

  it("has nothing to say about an empty sentence", () => {
    expect(words("   ")).toEqual([]);
  });
});

describe("questionVocabulary", () => {
  it("pairs the prompt's words with canonical Latin, in the prompt's order", () => {
    expect(
      pairs(
        "The farmer's daughters were carrying water from the deep well.",
        "Fīliae agricolae aquam ex altō puteō portābant.",
      ),
    ).toEqual([
      ["farmer's", "agricola, agricolae (m)"],
      ["daughters", "filia, fīliae"],
      ["carrying", "portō, portāre, portāvī, portātum"],
      ["water", "aqua, aquae (f)"],
      ["deep", "altus, alta, altum"],
      // Words the English never says. `puteō` resolves to the verb "to stink":
      // the dictionary has no noun for this form, and the crib says so by
      // pairing it with nothing rather than by asserting "well".
      [null, "ex (prep)"],
      [null, "pūteō, pūtēre"],
    ]);
  });

  it("never puts the Latin word order on screen", () => {
    // `portābant` is last in the Latin and third in the English.
    const forms = crib(
      "The farmer's daughters were carrying water from the deep well.",
      "Fīliae agricolae aquam ex altō puteō portābant.",
    ).map((w) => w.form);
    expect(forms.indexOf("portābant")).toBeLessThan(forms.indexOf("altō"));
  });

  describe("the prompt decides which reading of an ambiguous form is shown", () => {
    it.each([
      ["war", "For nine years the war raged before the city fell.", "Bellum", "bellum, bellī (n)", "bellus, bella, bellum"],
      ["gift", "The queen gave gifts to the gods.", "dōna", "dōnum, dōnī", "dōnō, dōnāre, dōnāvī, dōnātum"],
      ["queen", "The queen was mourning her son.", "Rēgīna", "regina, rēgīnae", "rex, rēgis"],
      ["sea", "The ships were carried across the sea.", "mare", "mare, maris (n)", "mās, mare"],
      ["bravely", "Defend the walls of the town bravely!", "fortiter", "fortiter (adv)", "fortis, forte"],
    ])("reads %s where frequency alone would not", (_sense, prompt, form, chosen, mostFrequent) => {
      const [word] = crib(prompt, form);
      expect(word?.entry?.citation).toBe(chosen);
      // The reading it beat is kept, not discarded: it is still a reading.
      expect(word?.others.map((o) => o.citation)).toContain(mostFrequent);
    });
  });

  it("falls back to the most frequent reading when the prompt says nothing", () => {
    const [word] = crib("They gathered there at dawn.", "mare");
    expect(word?.entry?.citation).toBe("mās, mare");
    expect(word?.english).toBeUndefined();
  });

  it("reaches an irregular English past tense", () => {
    expect(pairs("The general led the legions.", "Legiōnēs dūxit.")).toEqual([
      ["led", "dūcō, dūcere, dūxī, ductum"],
      ["legions", "legio, legiōnis"],
    ]);
  });

  it("prefers the word it had to bend least", () => {
    // "gifts"→"gift" is a plural; "gave"→"give" is an irregular past. The noun
    // is the nearer reading, so `dōna` is a gift and not a giving — which is
    // also the reading that leaves "gave" free for the verb of the sentence.
    const [word] = crib("The queen gave gifts to the gods.", "dōna");
    expect(word?.english).toBe("gifts");
    expect(word?.entry?.citation).toBe("dōnum, dōnī");
  });

  it("gives a prompt word to one Latin word only", () => {
    // Both forms gloss as "hand"; there is one "hands" to go round.
    const words = crib("He raised his hands.", "manibus manū");
    expect(words.filter((w) => w.english === "hands")).toHaveLength(1);
  });

  it("lists a word the dictionary has never heard of rather than dropping it", () => {
    const words = crib("Frightened by the trumpets, the horses fled.", "Territī equī fūgērunt.");
    expect(words.map((w) => w.form)).toEqual(["Territī", "equī", "fūgērunt"]);
    for (const word of words) {
      expect(word.entry).toBeUndefined();
      expect(word.others).toEqual([]);
    }
  });

  it("counts a word repeated in the answer once", () => {
    // Folded the way the rest of the app folds Latin: macrons are editorial.
    const words = crib("Water, and more water.", "aquam Aquam aquam");
    expect(words).toHaveLength(1);
    expect(words[0]?.english).toBe("Water");
  });

  it("still names the words when no dictionary has been loaded at all", () => {
    const bare = new Content({ grammar: [], tests: {} }, testProfile);
    const words = questionVocabulary(bare, ask("The girl loves the rose.", "puella rosam amat"));
    expect(words.map((w) => w.form)).toEqual(["puella", "rosam", "amat"]);
    expect(words.every((w) => w.entry === undefined)).toBe(true);
  });
});
