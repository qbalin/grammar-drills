import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { normalize } from "./normalize.js";
import { newCard, rate } from "./scheduler.js";
import { Session } from "./session.js";
import type { ContentData } from "./types.js";

const fixture: ContentData = {
  grammar: [
    { id: "ag1", ref: "1", title: "First declension", text: "The first declension...", order: 1 },
    { id: "ag2", ref: "2", title: "Second declension", text: "The second declension...", order: 2 },
  ],
  tests: {
    ag1: [
      { id: "ag1-t1", sectionId: "ag1", questions: [{ prompt: "puella (nom. pl.)?", answer: "puellae", kind: "parse", vocab: ["puellae"] }] },
      { id: "ag1-t2", sectionId: "ag1", questions: [{ prompt: "rosa (gen. sg.)?", answer: "rosae", kind: "parse", vocab: ["rosae"] }] },
    ],
    ag2: [
      { id: "ag2-t1", sectionId: "ag2", questions: [{ prompt: "servus (dat. sg.)?", answer: "servō", kind: "parse", vocab: ["servo"] }] },
    ],
  },
  lemmas: {
    manibus: [
      { lemma: "manus", citation: "manus, ūs (f)", gloss: "hand", pos: "noun", gender: "feminine", declension: "4", rank: 120 },
      { lemma: "manis", citation: "manis, e (adj)", gloss: "good", pos: "adj", rank: 9000 },
    ],
  },
};

describe("normalize", () => {
  it("strips macrons and folds v/j", () => {
    expect(normalize("Vī")).toBe("ui");
    expect(normalize("Manibus")).toBe("manibus");
    expect(normalize("iam")).toBe(normalize("jam"));
    expect(normalize("servō")).toBe("seruo");
  });
});

describe("scheduler", () => {
  it("schedules 'again' sooner than 'easy'", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const again = rate(newCard(now), 1, now);
    const easy = rate(newCard(now), 4, now);
    expect(again.due.getTime()).toBeLessThan(easy.due.getTime());
  });
});

describe("Content + lemmatizer", () => {
  it("resolves an inflected form to a ranked citation", () => {
    const c = new Content(fixture);
    const hits = c.lookup("manibus");
    expect(hits[0]?.citation).toMatch(/^manus, ūs \(f\)/);
    // most frequent (lowest rank) comes first
    expect(hits[0]?.rank).toBeLessThan(hits[1]!.rank!);
  });

  it("lists teachable topics in book order", () => {
    const c = new Content(fixture);
    expect(c.topicIds()).toEqual(["ag1", "ag2"]);
  });
});

describe("Session", () => {
  it("introduces topics in order, then reviews and records vocab", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s = new Session(new Content(fixture));

    // First action is the first new topic.
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "ag1" });

    // Serving a test marks it seen; a second serve rotates variety.
    const t1 = s.serveTest("ag1");
    expect(t1?.sectionId).toBe("ag1");

    // Grade it easy -> creates the card, advances the frontier.
    s.gradeTopic("ag1", 4, now);
    expect(s.progress().frontier).toBe("ag1");
    expect(s.progress().newTopicsIntroduced).toBe(1);

    // ag1 no longer due, so the next new topic is ag2.
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "ag2" });

    // Record an unknown word from its inflected form.
    const hit = new Content(fixture).lookup("manibus")[0]!;
    const id = s.recordVocab(hit, now);
    expect(s.vocabCard(id)?.citation).toMatch(/^manus/);
    // Dedupe: recording again returns the same id, no growth.
    expect(s.recordVocab(hit, now)).toBe(id);
    expect(Object.keys(s.progress().vocabCards)).toHaveLength(1);

    // Vocab becomes due immediately on creation; grade it.
    expect(s.next(now)).toEqual({ kind: "vocab-review", cardId: id });
    s.gradeVocab(id, 3, now);
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "ag2" });
  });

  it("runs placement: passing a topic marks it (and earlier) known and sets the frontier", () => {
    const s = new Session(new Content(fixture));
    expect(s.needsPlacement()).toBe(true);
    expect(s.placementTopics()).toEqual(["ag1", "ag2"]); // both, evenly spaced

    s.passPlacement("ag1");
    s.endPlacement();
    expect(s.progress().knownSections).toContain("ag1");
    expect(s.progress().frontier).toBe("ag1");
    expect(s.needsPlacement()).toBe(false);

    // ag1 is known and skipped; study begins at ag2.
    expect(s.next(new Date("2026-01-01T00:00:00Z"))).toEqual({
      kind: "new-topic",
      sectionId: "ag2",
    });
  });

  it("serializes and restores progress round-trip", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s1 = new Session(new Content(fixture));
    s1.gradeTopic("ag1", 3, now);
    const json = JSON.parse(JSON.stringify(s1.progress()));
    const s2 = new Session(new Content(fixture), json);
    expect(s2.progress().topicCards.ag1).toBeDefined();
  });
});
