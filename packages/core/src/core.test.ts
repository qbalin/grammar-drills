import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { normalize } from "./normalize.js";
import { newCard, preview, rate } from "./scheduler.js";
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

  it("previews each grade's due date without applying one", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const card = newCard(now);
    const p = preview(card, now);
    // The four grades run from soonest to latest, and every one is in future.
    expect(p[1].getTime()).toBeLessThan(p[2].getTime());
    expect(p[2].getTime()).toBeLessThan(p[3].getTime());
    expect(p[3].getTime()).toBeLessThan(p[4].getTime());
    expect(p[1].getTime()).toBeGreaterThan(now.getTime());
    // A preview is not a review: the card is untouched.
    expect(card.reps).toBe(0);
    expect(card.due.getTime()).toBe(now.getTime());
  });

  it("previews the same due date the matching grade then applies", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const card = newCard(now);
    expect(rate(card, 3, now).due.getTime()).toBe(preview(card, now)[3].getTime());
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

  it("prefers an injected lookup over the in-memory map", () => {
    // What the web app does: no `lemmas` at all, just an index it can bisect.
    const entry = { lemma: "rex", citation: "rex, rēgis", gloss: "king", pos: "noun" };
    const c = new Content({
      ...fixture,
      lemmas: undefined,
      lemmaLookup: { lookup: (f) => (f === "regem" ? [entry] : []) },
    });
    expect(c.lookup("regem")).toEqual([entry]);
    expect(c.lookup("manibus")).toEqual([]);
  });

  it("reports a miss rather than throwing when no dictionary is loaded", () => {
    const c = new Content({ ...fixture, lemmas: undefined });
    expect(c.lookup("manibus")).toEqual([]);
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

  it("puts back a snapshot, undoing everything done since", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s = new Session(new Content(fixture));
    s.gradeTopic("ag1", 3, now);

    const before = s.snapshot();

    // A grade, an answer and a word — the whole of a mistaken step.
    s.gradeTopic("ag2", 1, now);
    s.recordAttempt("ag2", { prompt: "p", answer: "a", submitted: "b", rating: 1 }, now);
    s.recordVocab(new Content(fixture).lookup("manibus")[0]!, now);
    expect(s.progress().topicCards.ag2).toBeDefined();

    s.restore(before);
    expect(s.progress().topicCards.ag2).toBeUndefined();
    expect(s.progress().topicMastery.ag2).toBeUndefined();
    expect(s.attemptsFor("ag2")).toHaveLength(0);
    expect(Object.keys(s.progress().vocabCards)).toHaveLength(0);
    // What came before the snapshot is untouched.
    expect(s.progress().topicCards.ag1).toBeDefined();

    // The snapshot is a copy, not a window: grading on does not edit it, and
    // it can be restored again.
    s.gradeTopic("ag2", 4, now);
    expect(before.topicCards.ag2).toBeUndefined();
    s.restore(before);
    expect(s.progress().topicCards.ag2).toBeUndefined();
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

describe("Session placement, resumed", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  /** Save and reload, the way closing the app and opening it again would. */
  const reload = (s: Session) =>
    new Session(new Content(fixture), JSON.parse(JSON.stringify(s.progress())));

  it("remembers the probes and the position across a restart", () => {
    const s = new Session(new Content(fixture));
    const run = s.beginPlacement();
    expect(run.topics).toEqual(["ag1", "ag2"]);
    s.passPlacement("ag1");
    s.advancePlacement(1);

    // Passing a probe fills knownSections, which used to read as "placed".
    const back = reload(s);
    expect(back.needsPlacement()).toBe(true);
    expect(back.placementState()).toEqual({ topics: ["ag1", "ag2"], index: 1 });
  });

  it("stays in placement when a word is recorded mid-probe", () => {
    const s = new Session(new Content(fixture));
    s.beginPlacement();
    s.recordVocab(new Content(fixture).lookup("manibus")[0]!, now);

    expect(s.needsPlacement()).toBe(true);
    expect(s.placementState()?.index).toBe(0);
    expect(reload(s).placementState()?.index).toBe(0);
  });

  it("forgets the run once placement is over", () => {
    const s = new Session(new Content(fixture));
    s.beginPlacement();
    s.endPlacement();
    expect(s.placementState()).toBeUndefined();
    expect(reload(s).needsPlacement()).toBe(false);
  });

  it("takes an undo back into placement", () => {
    const s = new Session(new Content(fixture));
    s.beginPlacement();
    const before = s.snapshot();
    s.passPlacement("ag1");
    s.advancePlacement(1);

    s.restore(before);
    expect(s.placementState()?.index).toBe(0);
    expect(s.progress().knownSections).toEqual([]);
  });
});

describe("Session schedule", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("lists what is waiting and what comes back, soonest first", () => {
    const s = new Session(new Content(fixture));
    s.gradeTopic("ag1", 4, now); // days away
    s.gradeTopic("ag2", 1, now); // minutes away
    const card = s.recordVocab(new Content(fixture).lookup("manibus")[0]!, now);

    const later = new Date("2026-01-01T00:01:00Z");
    const due = s.upcoming(later);
    expect(due.map((e) => e.id)).toEqual([card, "ag2", "ag1"]);
    // A minute on, the word and the topic graded 'again' are both waiting; the
    // one graded 'easy' is days out.
    expect(due[0]).toMatchObject({ kind: "vocab", title: "manus, ūs (f)", overdue: true });
    expect(due[1]).toMatchObject({ kind: "topic", sub: "§ 2", overdue: true });
    expect(due.at(-1)).toMatchObject({ kind: "topic", sub: "§ 1", overdue: false });
    expect(s.upcoming(later, 2)).toHaveLength(2);
  });

  it("agrees with nextDue, and skips cards for sections this bundle lost", () => {
    const s = new Session(new Content(fixture));
    s.gradeTopic("ag1", 3, now);
    s.progress().topicCards.gone = s.progress().topicCards.ag1!;

    expect(s.upcoming(now).map((e) => e.id)).toEqual(["ag1"]);
    expect(s.upcoming(now)[0]!.due.getTime()).toBe(s.nextDue(now)!.getTime());
  });

  it("says nothing is scheduled on a fresh deck", () => {
    expect(new Session(new Content(fixture)).upcoming(now)).toEqual([]);
  });
});

describe("Session vocabulary", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const record = (s: Session) =>
    s.recordVocab(new Content(fixture).lookup("manibus")[0]!, now);

  it("lists, edits and deletes words without disturbing their schedule", () => {
    const s = new Session(new Content(fixture));
    const id = record(s);
    s.gradeVocab(id, 3, now);
    const scheduled = s.vocabCard(id)!.fsrs.due;

    expect(s.vocabList().map((c) => c.id)).toEqual([id]);

    s.updateVocab(id, { citation: "manus, manūs (f)", gloss: "  hand, band  " });
    expect(s.vocabCard(id)?.citation).toBe("manus, manūs (f)");
    expect(s.vocabCard(id)?.gloss).toBe("hand, band"); // trimmed
    // The edit is not a review: the card keeps its history and its due date.
    expect(s.vocabCard(id)?.fsrs.reps).toBe(1);
    expect(s.vocabCard(id)?.fsrs.due).toBe(scheduled);

    s.deleteVocab(id);
    expect(s.vocabCard(id)).toBeUndefined();
    expect(s.vocabList()).toEqual([]);
    s.deleteVocab(id); // deleting twice is not an error
  });

  it("brings saved cards up to a rebuilt dictionary's citations, once", () => {
    const s = new Session(new Content(fixture));
    const id = record(s);
    s.progress().citationsVersion = 1; // as a file written before the rebuild

    // The dictionary now cites the word differently — four principal parts, a
    // corrected termination, or as here a fuller genitive.
    const rebuilt = new Content({
      ...fixture,
      lemmas: {
        manus: [
          { lemma: "manus", citation: "manus, manūs (f)", gloss: "hand", pos: "noun" },
        ],
      },
    });
    const after = new Session(rebuilt, s.progress());
    expect(after.refreshCitations()).toBe(1);
    expect(after.vocabCard(id)?.citation).toBe("manus, manūs (f)");
    // Second launch: the generation is claimed, so nothing is re-read.
    expect(after.refreshCitations()).toBe(0);
  });

  it("leaves cards alone when no dictionary is loaded", () => {
    const s = new Session(new Content(fixture));
    const id = record(s);
    s.progress().citationsVersion = 1;

    // Offline on the phone: the dictionary is a separate download.
    const offline = new Session(
      new Content({ ...fixture, lemmas: undefined }),
      s.progress(),
    );
    expect(offline.refreshCitations()).toBe(0);
    expect(offline.vocabCard(id)?.citation).toBe("manus, ūs (f)");
    // And the generation is not claimed, so the next launch tries again.
    expect(offline.progress().citationsVersion).toBe(1);
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

  it("keeps every answer written on a topic, newest first", () => {
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
    // Nothing is dropped — the trail used to stop at ten.
    expect(trail).toHaveLength(12);
    expect(trail[0]!.prompt).toBe("q12");
    expect(trail[0]!.submitted).toBe("a12");
    expect(trail[0]!.at).toBe(at(12).toISOString());
    expect(trail.at(-1)!.prompt).toBe("q1");
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

  it("groups a topic's answers by the question they answered", () => {
    const s = new Session(new Content(fixture));
    const at = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`);
    s.recordAttempt("ag1", { prompt: "puella (nom. pl.)?", answer: "puellae", submitted: "puella", rating: 1 }, at(1));
    s.recordAttempt("ag1", { prompt: "rosa (gen. sg.)?", answer: "rosae", submitted: "rosae", rating: 3 }, at(2));
    s.recordAttempt("ag1", { prompt: "puella (nom. pl.)?", answer: "puellae", submitted: "puellae", rating: 4 }, at(3));

    const trail = s.attemptsForQuestion("ag1", "puella (nom. pl.)?");
    expect(trail.map((a) => a.rating)).toEqual([4, 1]); // newest first
    expect(s.attemptsForQuestion("ag1", "never asked")).toEqual([]);
  });

  it("lists a section's whole question bank with each question's history", () => {
    const s = new Session(new Content(fixture));
    s.recordAttempt(
      "ag1",
      { prompt: "rosa (gen. sg.)?", answer: "rosae", submitted: "rosā", rating: 2 },
      now,
    );

    const bank = s.questionBank("ag1");
    // Both tests' questions, not only the one that has been served.
    expect(bank.map((q) => q.prompt)).toEqual(["puella (nom. pl.)?", "rosa (gen. sg.)?"]);
    expect(bank[0]!.answer).toBe("puellae");
    expect(bank[0]!.attempts).toEqual([]);
    expect(bank[1]!.attempts).toHaveLength(1);
    expect(bank[1]!.attempts[0]!.submitted).toBe("rosā");
    expect(s.questionBank("nope")).toEqual([]);
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
