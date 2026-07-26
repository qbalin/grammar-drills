import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { normalize } from "./normalize.js";
import { newCard, rate } from "./scheduler.js";
import { Session } from "./session.js";
import type { ContentData } from "./types.js";

const fixture: ContentData = {
  grammar: [
    { id: "ag1", ref: "1", title: "First declension", family: "nouns", text: "The first declension...", order: 1 },
    { id: "ag2", ref: "2", title: "Second declension", family: "nouns", text: "The second declension...", order: 2 },
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

describe("Session mastery", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const mastery = (s: Session, id: string) =>
    s.grammarMap(now).find((t) => t.sectionId === id)?.mastery;

  it("accumulates good grades and clamps at 4", () => {
    const s = new Session(new Content(fixture));
    expect(mastery(s, "ag1")).toBeUndefined(); // never graded
    s.gradeTopic("ag1", 3, now);
    expect(mastery(s, "ag1")).toBe(2);
    s.gradeTopic("ag1", 3, now);
    s.gradeTopic("ag1", 3, now);
    expect(mastery(s, "ag1")).toBe(4);
    s.gradeTopic("ag1", 4, now); // already mastered, stays there
    expect(mastery(s, "ag1")).toBe(4);
  });

  it("gives back ground on 'again' and half a step on 'hard', floored at 1", () => {
    const s = new Session(new Content(fixture));
    s.gradeTopic("ag1", 3, now);
    s.gradeTopic("ag1", 1, now);
    s.gradeTopic("ag1", 3, now);
    expect(mastery(s, "ag1")).toBe(2);

    s.gradeTopic("ag2", 2, now);
    expect(mastery(s, "ag2")).toBe(1.5);

    s.gradeTopic("ag2", 1, now);
    s.gradeTopic("ag2", 1, now);
    expect(mastery(s, "ag2")).toBe(1); // not mastered, never below
  });

  it("reports placement-passed topics as mastered but assumed", () => {
    const s = new Session(new Content(fixture));
    s.passPlacement("ag1");
    s.endPlacement();
    const t = s.grammarMap(now).find((x) => x.sectionId === "ag1")!;
    expect(t.mastery).toBe(4);
    expect(t.assumed).toBe(true);

    // Grading it for real replaces the assumption with an earned score.
    s.gradeTopic("ag1", 3, now);
    const after = s.grammarMap(now).find((x) => x.sectionId === "ag1")!;
    expect(after.assumed).toBe(false);
    expect(after.mastery).toBe(2);
  });

  it("groups topics into families with a mastery percentage", () => {
    const s = new Session(new Content(fixture));
    s.gradeTopic("ag1", 3, now);
    s.gradeTopic("ag1", 3, now);
    s.gradeTopic("ag1", 3, now); // ag1 -> 4 (100%), ag2 untouched (0%)

    const nouns = s.familyProgress(now).find((f) => f.id === "nouns")!;
    // Both fixture sections declare family "nouns".
    expect(nouns.topics.map((t) => t.sectionId)).toEqual(["ag1", "ag2"]);
    expect(nouns.percent).toBeCloseTo(0.5);
    expect(s.overallPercent(now)).toBeCloseTo(0.5);

    const empty = s.familyProgress(now).find((f) => f.id === "verb-forms")!;
    expect(empty.topics).toHaveLength(0);
    expect(empty.percent).toBe(0);
  });

  it("loads progress files written before mastery tracking", () => {
    const s1 = new Session(new Content(fixture));
    s1.gradeTopic("ag1", 3, now);
    const legacy = JSON.parse(JSON.stringify(s1.progress()));
    delete legacy.topicMastery; // as an older file on disk would be

    const s2 = new Session(new Content(fixture), legacy);
    expect(s2.grammarMap(now).find((t) => t.sectionId === "ag1")?.mastery).toBeUndefined();
    s2.gradeTopic("ag1", 3, now);
    expect(mastery(s2, "ag1")).toBe(2); // accumulates from the floor onwards
  });

  it("keeps a capped trail of what was written on a topic, newest first", () => {
    const s = new Session(new Content(fixture));
    const at = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`);
    for (let i = 1; i <= 12; i++) {
      s.recordAttempt(
        "ag1",
        { prompt: `q${i}`, answer: "puellae", submitted: `a${i}`, rating: 3 },
        at(i),
      );
    }
    const trail = s.attemptsFor("ag1");
    // Ten kept, the two oldest dropped; most recent first for reading.
    expect(trail).toHaveLength(10);
    expect(trail[0]!.prompt).toBe("q12");
    expect(trail[0]!.submitted).toBe("a12");
    expect(trail[0]!.at).toBe(at(12).toISOString());
    expect(trail.at(-1)!.prompt).toBe("q3");
    // Trails are per topic.
    expect(s.attemptsFor("ag2")).toEqual([]);
  });

  it("loads progress files written before answers were kept", () => {
    const s1 = new Session(new Content(fixture));
    s1.gradeTopic("ag1", 3, now);
    const legacy = JSON.parse(JSON.stringify(s1.progress()));
    delete legacy.attempts; // as an older file on disk would be

    const s2 = new Session(new Content(fixture), legacy);
    expect(s2.attemptsFor("ag1")).toEqual([]);
    s2.recordAttempt(
      "ag1",
      { prompt: "puella (nom. pl.)?", answer: "puellae", submitted: "puellā", rating: 2 },
      now,
    );
    expect(s2.attemptsFor("ag1")).toHaveLength(1);
  });

  it("marks due topics and topics that have no tests", () => {
    const withoutTests: ContentData = {
      ...fixture,
      grammar: [
        ...fixture.grammar,
        { id: "ag3", ref: "3", title: "Third declension", family: "nouns", text: "...", order: 3 },
      ],
    };
    const s = new Session(new Content(withoutTests));
    s.gradeTopic("ag1", 1, now); // 'again' -> due again almost immediately
    const map = s.grammarMap(new Date("2026-01-02T00:00:00Z"));
    expect(map.find((t) => t.sectionId === "ag1")?.due).toBe(true);
    expect(map.find((t) => t.sectionId === "ag3")?.hasTests).toBe(false);
    expect(map.find((t) => t.sectionId === "ag1")?.hasTests).toBe(true);
  });
});
