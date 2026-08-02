import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { testProfile } from "./profile.fixture.js";
import { compileFold } from "./fold.js";
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

const fold = compileFold(testProfile.fold);

describe("the compiled fold", () => {
  it("strips macrons and folds v/j", () => {
    expect(fold("Vī")).toBe("ui");
    expect(fold("Manibus")).toBe("manibus");
    expect(fold("iam")).toBe(fold("jam"));
    expect(fold("servō")).toBe("seruo");
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
    const c = new Content(fixture, testProfile);
    const hits = c.lookup("manibus");
    expect(hits[0]?.citation).toMatch(/^manus, ūs \(f\)/);
    // most frequent (lowest rank) comes first
    expect(hits[0]?.rank).toBeLessThan(hits[1]!.rank!);
  });

  it("lists teachable topics in book order", () => {
    const c = new Content(fixture, testProfile);
    expect(c.topicIds()).toEqual(["ag1", "ag2"]);
  });

  it("prefers an injected lookup over the in-memory map", () => {
    // What the web app does: no `lemmas` at all, just an index it can bisect.
    const entry = { lemma: "rex", citation: "rex, rēgis", gloss: "king", pos: "noun" };
    const c = new Content({
      ...fixture,
      lemmas: undefined,
      lemmaLookup: { lookup: (f) => (f === "regem" ? [entry] : []) },
    }, testProfile);
    expect(c.lookup("regem")).toEqual([entry]);
    expect(c.lookup("manibus")).toEqual([]);
  });

  it("reports a miss rather than throwing when no dictionary is loaded", () => {
    const c = new Content({ ...fixture, lemmas: undefined }, testProfile);
    expect(c.lookup("manibus")).toEqual([]);
  });
});

describe("Session", () => {
  it("introduces topics in order, then reviews and records vocab", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s = new Session(new Content(fixture, testProfile));

    // First action is the first new topic.
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "ag1" });

    // Serving a test marks it seen; a second serve rotates variety.
    const t1 = s.serveTest("ag1");
    expect(t1?.sectionId).toBe("ag1");

    // Grade it easy -> creates the card, which is what takes it off the list.
    s.gradeTopic("ag1", 4, now);
    expect(s.progress().newTopicsIntroduced).toBe(1);

    // ag1 no longer due, so the next new topic is ag2.
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "ag2" });

    // Record an unknown word from its inflected form.
    const hit = new Content(fixture, testProfile).lookup("manibus")[0]!;
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

  it("runs placement: a passed probe marks its family's topics known", () => {
    const s = new Session(new Content(fixture, testProfile));
    expect(s.needsPlacement()).toBe(true);
    // Two noun topics, so the probe is the first and the narrowing one is ag2.
    expect(s.beginPlacement()?.probe).toBe("ag1");

    expect(s.answerPlacement(true)?.probe).toBe("ag2");
    expect(s.answerPlacement(false)).toBeNull(); // no other family has topics
    expect(s.progress().knownSections).toContain("ag1");
    expect(s.progress().frontiers.nouns).toBe("ag2");
    expect(s.needsPlacement()).toBe(false);

    // ag1 is known and skipped; study begins at ag2.
    expect(s.next(new Date("2026-01-01T00:00:00Z"))).toEqual({
      kind: "new-topic",
      sectionId: "ag2",
    });
  });

  it("puts back a snapshot, undoing everything done since", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s = new Session(new Content(fixture, testProfile));
    s.gradeTopic("ag1", 3, now);

    const before = s.snapshot();

    // A grade, an answer and a word — the whole of a mistaken step.
    s.gradeTopic("ag2", 1, now);
    s.recordAttempt("ag2", { prompt: "p", answer: "a", submitted: "b", rating: 1 }, now);
    s.recordVocab(new Content(fixture, testProfile).lookup("manibus")[0]!, now);
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
    const s1 = new Session(new Content(fixture, testProfile));
    s1.gradeTopic("ag1", 3, now);
    const json = JSON.parse(JSON.stringify(s1.progress()));
    const s2 = new Session(new Content(fixture, testProfile), json);
    expect(s2.progress().topicCards.ag1).toBeDefined();
  });
});

describe("Session placement, resumed", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  /** Save and reload, the way closing the app and opening it again would. */
  const reload = (s: Session) =>
    new Session(new Content(fixture, testProfile), JSON.parse(JSON.stringify(s.progress())));

  it("remembers which probe is on the table across a restart", () => {
    const s = new Session(new Content(fixture, testProfile));
    expect(s.beginPlacement()?.probe).toBe("ag1");
    s.answerPlacement(true);

    // Passing a probe fills knownSections, which used to read as "placed".
    const back = reload(s);
    expect(back.needsPlacement()).toBe(true);
    expect(back.placementState()).toEqual({
      familyIndex: 0,
      asked: 1,
      passed: 0,
      probe: "ag2",
    });
  });

  it("stays in placement when a word is recorded mid-probe", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.beginPlacement();
    s.recordVocab(new Content(fixture, testProfile).lookup("manibus")[0]!, now);

    expect(s.needsPlacement()).toBe(true);
    expect(s.placementProbe()).toBe("ag1");
    expect(reload(s).placementProbe()).toBe("ag1");
  });

  it("forgets the run once placement is over", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.beginPlacement();
    s.endPlacement();
    expect(s.placementState()).toBeUndefined();
    expect(reload(s).needsPlacement()).toBe(false);
  });

  it("takes an undo back into placement", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.beginPlacement();
    const before = s.snapshot();
    s.answerPlacement(true);
    s.answerPlacement(true);

    s.restore(before);
    expect(s.placementProbe()).toBe("ag1");
    expect(s.progress().knownSections).toEqual([]);
    expect(s.progress().frontiers).toEqual({});
  });

  it("starts over on a run stored in the old evenly-spaced shape", () => {
    const s = new Session(new Content(fixture, testProfile));
    // What a file written before per-family placement carries.
    const old = { ...s.progress(), placement: { topics: ["ag1"], index: 0 } };
    const back = new Session(new Content(fixture, testProfile), JSON.parse(JSON.stringify(old)));
    expect(back.placementState()).toBeUndefined();
    expect(back.needsPlacement()).toBe(true);
  });
});

describe("Session schedule", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("lists what is waiting and what comes back, soonest first", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.gradeTopic("ag1", 4, now); // days away
    s.gradeTopic("ag2", 1, now); // minutes away
    const card = s.recordVocab(new Content(fixture, testProfile).lookup("manibus")[0]!, now);

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
    const s = new Session(new Content(fixture, testProfile));
    s.gradeTopic("ag1", 3, now);
    s.progress().topicCards.gone = s.progress().topicCards.ag1!;

    expect(s.upcoming(now).map((e) => e.id)).toEqual(["ag1"]);
    expect(s.upcoming(now)[0]!.due.getTime()).toBe(s.nextDue(now)!.getTime());
  });

  it("says nothing is scheduled on a fresh deck", () => {
    expect(new Session(new Content(fixture, testProfile)).upcoming(now)).toEqual([]);
  });
});

describe("Session vocabulary", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const record = (s: Session) =>
    s.recordVocab(new Content(fixture, testProfile).lookup("manibus")[0]!, now);

  it("lists, edits and deletes words without disturbing their schedule", () => {
    const s = new Session(new Content(fixture, testProfile));
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
    const s = new Session(new Content(fixture, testProfile));
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
    }, testProfile);
    const after = new Session(rebuilt, s.progress());
    expect(after.refreshCitations()).toBe(1);
    expect(after.vocabCard(id)?.citation).toBe("manus, manūs (f)");
    // Second launch: the generation is claimed, so nothing is re-read.
    expect(after.refreshCitations()).toBe(0);
  });

  /** The same rebuilt dictionary the test above uses, as a fresh Content. */
  const rebuiltContent = () =>
    new Content({
      ...fixture,
      lemmas: {
        manus: [
          { lemma: "manus", citation: "manus, manūs (f)", gloss: "hand", pos: "noun" },
        ],
      },
    }, testProfile);

  it("never rewrites a citation the student has written", () => {
    const s = new Session(new Content(fixture, testProfile));
    const id = record(s);
    // The form was ambiguous and the wrong candidate was saved, so the student
    // fixes the card. That correction is the point of the edit sheet.
    s.updateVocab(id, { citation: "manus, manūs (f), a company" });
    expect(s.vocabCard(id)?.citationEdited).toBe(true);
    s.progress().citationsVersion = 1;

    // A later rebuild ships its own wording. The card is not the dictionary's
    // any more, so it keeps the student's — and, being skipped, is not counted
    // among the cards changed.
    const after = new Session(rebuiltContent(), s.progress());
    expect(after.refreshCitations()).toBe(0);
    expect(after.vocabCard(id)?.citation).toBe("manus, manūs (f), a company");
    // The generation is still claimed: a dictionary was read, and a run that
    // skipped every card must not come back at every launch.
    expect(after.progress().citationsVersion).toBe(testProfile.citationsVersion);
  });

  it("does not claim the card when the edit changed nothing, or only the gloss", () => {
    const s = new Session(new Content(fixture, testProfile));
    const id = record(s);
    // Opening the sheet and saving the citation as it stands is not a
    // correction, and neither is rewording the meaning.
    s.updateVocab(id, { citation: "manus, ūs (f)", gloss: "hand, band" });
    expect(s.vocabCard(id)?.citationEdited).toBeUndefined();
    s.progress().citationsVersion = 1;

    const after = new Session(rebuiltContent(), s.progress());
    expect(after.refreshCitations()).toBe(1);
    expect(after.vocabCard(id)?.citation).toBe("manus, manūs (f)");
    // The rebuild improved the citation and left the student's meaning alone.
    expect(after.vocabCard(id)?.gloss).toBe("hand, band");
  });

  it("edits the card and not the dictionary behind it", () => {
    const content = new Content(fixture, testProfile);
    const s = new Session(content);
    const id = record(s);

    s.updateVocab(id, { citation: "not what the dictionary says", gloss: "nor this" });

    // The entry the card was made from is untouched, so the next student to
    // meet the form is offered the dictionary's word, not this one's.
    const [entry] = content.lookup("manibus");
    expect(entry?.citation).toBe("manus, ūs (f)");
    expect(entry?.gloss).toBe("hand");
    // And a card recorded from that same entry afterwards comes out clean —
    // the card is a copy of the entry, not a window onto it.
    const fresh = new Session(content);
    const again = fresh.recordVocab(content.lookup("manibus")[0]!, now);
    expect(fresh.vocabCard(again)?.citation).toBe("manus, ūs (f)");
  });

  it("leaves cards alone when no dictionary is loaded", () => {
    const s = new Session(new Content(fixture, testProfile));
    const id = record(s);
    s.progress().citationsVersion = 1;

    // Offline on the phone: the dictionary is a separate download.
    const offline = new Session(
      new Content({ ...fixture, lemmas: undefined }, testProfile),
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
    const s = new Session(new Content(fixture, testProfile));
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
    const s = new Session(new Content(fixture, testProfile));
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
    const s = new Session(new Content(fixture, testProfile));
    s.beginPlacement();
    s.answerPlacement(true); // ag1 passed
    s.answerPlacement(false); // ag2 failed, settling the family at ag1
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
    const s = new Session(new Content(fixture, testProfile));
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
    const s1 = new Session(new Content(fixture, testProfile));
    s1.gradeTopic("ag1", 3, now);
    const legacy = JSON.parse(JSON.stringify(s1.progress()));
    delete legacy.topicMastery; // as an older file on disk would be

    const s2 = new Session(new Content(fixture, testProfile), legacy);
    expect(s2.grammarMap(now).find((t) => t.sectionId === "ag1")?.mastery).toBeUndefined();
    s2.gradeTopic("ag1", 3, now);
    expect(mastery(s2, "ag1")).toBe(2); // accumulates from the floor onwards
  });

  it("keeps every answer written on a topic, newest first", () => {
    const s = new Session(new Content(fixture, testProfile));
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
    const s1 = new Session(new Content(fixture, testProfile));
    s1.gradeTopic("ag1", 3, now);
    const legacy = JSON.parse(JSON.stringify(s1.progress()));
    delete legacy.attempts; // as an older file on disk would be

    const s2 = new Session(new Content(fixture, testProfile), legacy);
    expect(s2.attemptsFor("ag1")).toEqual([]);
    s2.recordAttempt(
      "ag1",
      { prompt: "puella (nom. pl.)?", answer: "puellae", submitted: "puellā", rating: 2 },
      now,
    );
    expect(s2.attemptsFor("ag1")).toHaveLength(1);
  });

  /**
   * A grade says a topic went badly and never which word. These are the words
   * the student picked out afterwards, and they live on the attempt because
   * the question is generated content and read-only at runtime.
   */
  describe("marking up an answer", () => {
    const at = (day: number) =>
      new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`);
    const twoAttempts = () => {
      const s = new Session(new Content(fixture, testProfile));
      s.recordAttempt("ag1", { prompt: "p1", answer: "puellae", submitted: "puella", rating: 1 }, at(1));
      s.recordAttempt("ag1", { prompt: "p2", answer: "rosae", submitted: "rosa", rating: 2 }, at(2));
      return s;
    };

    it("finds the attempt by its timestamp and leaves the others alone", () => {
      const s = twoAttempts();
      s.markAttempt("ag1", at(1).toISOString(), { answer: { 0: 3 } });

      const trail = s.attemptsFor("ag1"); // newest first
      expect(trail[1]!.marks).toEqual({ answer: { 0: 3 } });
      expect(trail[0]!.marks).toBeUndefined();
    });

    it("keeps a mark through a save and a reload", () => {
      const s = twoAttempts();
      s.markAttempt("ag1", at(2).toISOString(), { prompt: { 1: 1 }, submitted: { 0: 2 } });

      const onDisk = JSON.parse(JSON.stringify(s.progress()));
      const reloaded = new Session(new Content(fixture, testProfile), onDisk);
      expect(reloaded.attemptsFor("ag1")[0]!.marks).toEqual({
        prompt: { 1: 1 },
        submitted: { 0: 2 },
      });
    });

    it("stores nothing rather than an empty mark, so unmarked stays unmarked", () => {
      const s = twoAttempts();
      s.markAttempt("ag1", at(1).toISOString(), { answer: { 0: 1 } });
      // Cycled back off: the field goes, not an empty object in its place.
      s.markAttempt("ag1", at(1).toISOString(), { answer: {} });

      const attempt = s.attemptsFor("ag1")[1]!;
      expect(attempt.marks).toBeUndefined();
      expect("marks" in attempt).toBe(false);
    });

    it("says nothing about an attempt or a topic it has never heard of", () => {
      const s = twoAttempts();
      s.markAttempt("ag1", at(9).toISOString(), { answer: { 0: 1 } });
      s.markAttempt("nope", at(1).toISOString(), { answer: { 0: 1 } });
      expect(s.attemptsFor("ag1").every((a) => a.marks === undefined)).toBe(true);
    });

    it("marks an answer written before marking existed", () => {
      const s = twoAttempts();
      // As an older file on disk: attempts, and no marks anywhere in them.
      const legacy = JSON.parse(JSON.stringify(s.progress()));
      expect(JSON.stringify(legacy)).not.toContain("marks");

      const s2 = new Session(new Content(fixture, testProfile), legacy);
      s2.markAttempt("ag1", at(1).toISOString(), { answer: { 0: 1 } });
      expect(s2.attemptsFor("ag1")[1]!.marks).toEqual({ answer: { 0: 1 } });
    });
  });

  it("groups a topic's answers by the question they answered", () => {
    const s = new Session(new Content(fixture, testProfile));
    const at = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`);
    s.recordAttempt("ag1", { prompt: "puella (nom. pl.)?", answer: "puellae", submitted: "puella", rating: 1 }, at(1));
    s.recordAttempt("ag1", { prompt: "rosa (gen. sg.)?", answer: "rosae", submitted: "rosae", rating: 3 }, at(2));
    s.recordAttempt("ag1", { prompt: "puella (nom. pl.)?", answer: "puellae", submitted: "puellae", rating: 4 }, at(3));

    const trail = s.attemptsForQuestion("ag1", "puella (nom. pl.)?");
    expect(trail.map((a) => a.rating)).toEqual([4, 1]); // newest first
    expect(s.attemptsForQuestion("ag1", "never asked")).toEqual([]);
  });

  it("lists a section's whole question bank with each question's history", () => {
    const s = new Session(new Content(fixture, testProfile));
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
    const s = new Session(new Content(withoutTests, testProfile));
    s.gradeTopic("ag1", 1, now); // 'again' -> due again almost immediately
    const map = s.grammarMap(new Date("2026-01-02T00:00:00Z"));
    expect(map.find((t) => t.sectionId === "ag1")?.due).toBe(true);
    expect(map.find((t) => t.sectionId === "ag3")?.hasTests).toBe(false);
    expect(map.find((t) => t.sectionId === "ag1")?.hasTests).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The three ways to move through the book. A wider fixture than `fixture`:
// two families, several topics each, and a bank per topic big enough that four
// questions do not exhaust it.
// ---------------------------------------------------------------------------

/** `n` topics in `family`, ids `<prefix>1..n`, each with `tests` tests of two. */
function topics(
  family: string,
  prefix: string,
  n: number,
  tests = 1,
): Pick<ContentData, "grammar" | "tests"> {
  const grammar: ContentData["grammar"] = [];
  const bank: ContentData["tests"] = {};
  for (let i = 1; i <= n; i++) {
    const id = `${prefix}${i}`;
    grammar.push({ id, ref: String(i), title: `${prefix} ${i}`, family, text: "…", order: i });
    bank[id] = Array.from({ length: tests }, (_, t) => ({
      id: `${id}-t${t + 1}`,
      sectionId: id,
      questions: [
        { prompt: `${id} q${t * 2 + 1}`, answer: "a", kind: "parse" as const, vocab: [] },
        { prompt: `${id} q${t * 2 + 2}`, answer: "b", kind: "parse" as const, vocab: [] },
      ],
    }));
  }
  return { grammar, tests: bank };
}

/** Families are laid out in book order, so `order` has to run across them. */
function book(...parts: Pick<ContentData, "grammar" | "tests">[]): ContentData {
  let order = 0;
  const grammar: ContentData["grammar"] = [];
  const tests: ContentData["tests"] = {};
  for (const part of parts) {
    for (const s of part.grammar) grammar.push({ ...s, order: ++order });
    Object.assign(tests, part.tests);
  }
  return { grammar, tests };
}

/** Three nouns and three verb-forms topics, three tests (six questions) each. */
const wide = book(topics("nouns", "n", 3, 3), topics("verb-forms", "v", 3, 3));

describe("Session progress: the sweep", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("walks the book in order on a fresh deck — the quick refresher", () => {
    const s = new Session(new Content(wide, testProfile));
    const served: string[] = [];
    for (let i = 0; i < 6; i++) {
      const action = s.next(now);
      expect(action.kind).toBe("new-topic");
      if (action.kind !== "new-topic") return;
      served.push(action.sectionId);
      // Graded 'easy' so it does not come back as a review mid-walk.
      s.gradeTopic(action.sectionId, 4, now);
    }
    expect(served).toEqual(["n1", "n2", "n3", "v1", "v2", "v3"]);
    expect(s.next(now)).toEqual({ kind: "done" });
  });

  it("starts each family at its own frontier, so one area can be ahead", () => {
    const s = new Session(new Content(wide, testProfile));
    // Placed halfway through the nouns and nowhere in the verbs.
    s.studyFrom("n3");
    s.setFocus({ kind: "sweep" });
    s.studyFrom("v1");
    s.setFocus({ kind: "sweep" });

    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "n3" });
    s.gradeTopic("n3", 4, now);
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "v1" });
  });

  it("comes back for the topics the frontiers skipped, once nothing is ahead", () => {
    const s = new Session(new Content(wide, testProfile));
    for (const id of ["n3", "v3"]) {
      s.studyFrom(id);
      s.gradeTopic(id, 4, now);
    }
    s.setFocus({ kind: "sweep" });
    // Both families are worked out from their frontiers on, but the book is
    // not: the topics jumped over are offered rather than reporting "done".
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "n1" });
    s.gradeTopic("n1", 4, now);
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "n2" });
  });
});

describe("Session progress: taking the syllabus up from a chosen topic", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("goes on from where you jumped to, not back to the beginning", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("v2");

    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "v2" });
    s.gradeTopic("v2", 4, now, "v2-t1");
    // The bug this fixes: `next` used to answer "n1" here, every time.
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "v3" });
  });

  it("leaves the skipped topics unstudied on the map rather than known", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("v2");
    const map = s.grammarMap(now);
    expect(map.find((t) => t.sectionId === "v1")?.mastery).toBeUndefined();
    expect(map.find((t) => t.sectionId === "v1")?.assumed).toBe(false);
    expect(map.find((t) => t.sectionId === "v2")?.frontier).toBe(true);
    expect(s.progress().knownSections).toEqual([]);
  });

  it("works the focused family out, then falls back to the sweep", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("v1");
    expect(s.focusState()).toEqual({ kind: "family", id: "verb-forms" });

    for (const id of ["v1", "v2", "v3"]) {
      expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: id });
      s.gradeTopic(id, 4, now);
    }
    // The family is spent, so the focus is too, and the nouns are next.
    expect(s.focusState()).toEqual({ kind: "sweep" });
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "n1" });
  });
});

describe("Session progress: staying on a topic", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  /** Answer one whole served test, the way the apps do. */
  const round = (s: Session, id: string, rating: 1 | 2 | 3 | 4 = 3) => {
    const test = s.serveTest(id, { prefer: "unanswered" })!;
    for (const q of test.questions) {
      s.recordAttempt(id, { prompt: q.prompt, answer: q.answer, submitted: q.answer, rating }, now);
      s.gradeTopic(id, rating, now, test.id);
    }
    return test;
  };

  it("keeps serving the same topic until its bank is worked out", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1");

    // Six questions in three tests of two: three rounds to sweep the bank.
    for (let i = 0; i < 3; i++) {
      expect(s.next(now)).toEqual({ kind: "drill", sectionId: "n1" });
      round(s, "n1");
    }
    expect(s.coverage("n1")).toEqual({ answered: 6, total: 6 });
    // Nothing left to practise here, so the drill releases itself.
    expect(s.focusState()).toEqual({ kind: "sweep" });
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "n2" });
  });

  it("serves questions never answered before, rather than rotating tests", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1");
    const asked: string[] = [];
    for (let i = 0; i < 3; i++) {
      asked.push(...round(s, "n1").questions.map((q) => q.prompt));
    }
    // Every question once — no repeat while any of the bank is untouched.
    expect(new Set(asked).size).toBe(6);
  });

  it("still lets reviews and words come back while a drill is on", () => {
    const s = new Session(new Content(wide, testProfile));
    s.gradeTopic("n2", 1, now); // due again in minutes
    s.drillTopic("n1");
    const soon = new Date("2026-01-01T00:30:00Z");
    expect(s.next(soon)).toEqual({ kind: "topic-review", sectionId: "n2" });
  });
});

describe("Session progress: a round of questions is one review", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("costs the card one rep however many questions the round holds", () => {
    const s = new Session(new Content(wide, testProfile));
    for (let i = 0; i < 4; i++) s.gradeTopic("n1", 3, now, "n1-t1");
    expect(s.progress().topicCards.n1!.reps).toBe(1);
    // Mastery is still per question — it counts what you got right.
    expect(s.grammarMap(now).find((t) => t.sectionId === "n1")?.mastery).toBe(4);
  });

  it("schedules the round by its worst grade", () => {
    const s = new Session(new Content(wide, testProfile));
    s.gradeTopic("n1", 4, now, "r");
    s.gradeTopic("n1", 1, now, "r"); // one failed, so the round failed
    s.gradeTopic("n1", 4, now, "r");

    const alone = new Session(new Content(wide, testProfile));
    alone.gradeTopic("n1", 1, now);
    expect(s.progress().topicCards.n1!.due).toBe(alone.progress().topicCards.n1!.due);
  });

  it("starts a new round on a new test, building on the last one", () => {
    const s = new Session(new Content(wide, testProfile));
    s.gradeTopic("n1", 3, now, "n1-t1");
    s.gradeTopic("n1", 3, now, "n1-t1");
    s.gradeTopic("n1", 3, now, "n1-t2");
    expect(s.progress().topicCards.n1!.reps).toBe(2);
  });

  it("rates per grade when no round is named, which is what a probe wants", () => {
    const s = new Session(new Content(wide, testProfile));
    for (let i = 0; i < 4; i++) s.gradeTopic("n1", 3, now);
    expect(s.progress().topicCards.n1!.reps).toBe(4);
    expect(s.progress().openRound).toBeNull();
  });

  it("leaves one rep behind when a round is abandoned halfway", () => {
    const s = new Session(new Content(wide, testProfile));
    s.gradeTopic("n1", 3, now, "n1-t1");
    s.gradeTopic("n1", 3, now, "n1-t1");
    // As if the terminal were closed here.
    const back = new Session(new Content(wide, testProfile), JSON.parse(JSON.stringify(s.progress())));
    expect(back.progress().topicCards.n1!.reps).toBe(1);
  });

  it("takes an undo back across a round's earlier questions", () => {
    const s = new Session(new Content(wide, testProfile));
    s.gradeTopic("n1", 4, now, "n1-t1");
    const before = s.snapshot();
    s.gradeTopic("n1", 1, now, "n1-t1"); // the round now stands at 'again'
    const failed = s.progress().topicCards.n1!.due;

    s.restore(before);
    expect(s.progress().topicCards.n1!.due).not.toBe(failed);
    // Re-grading from the restored point counts once, not twice.
    s.gradeTopic("n1", 1, now, "n1-t1");
    expect(s.progress().topicCards.n1!.due).toBe(failed);
    expect(s.progress().topicCards.n1!.reps).toBe(1);
  });
});

describe("Session placement, per family", () => {
  it("probes the middle of each family and narrows above a pass", () => {
    // Nine nouns, the shipped count, so the indices are the real ones.
    const s = new Session(new Content(book(topics("nouns", "n", 9)), testProfile));
    expect(s.beginPlacement()?.probe).toBe("n5"); // 5 of 9
    expect(s.answerPlacement(true)?.probe).toBe("n7"); // 7 of 9
    expect(s.answerPlacement(true)).toBeNull();
    expect(s.progress().frontiers.nouns).toBe("n8"); // start at 8
    expect(s.progress().knownSections).toHaveLength(7);
  });

  it("asks one probe of a family it fails, and stops narrowing there", () => {
    const s = new Session(new Content(book(topics("verb-forms", "v", 35)), testProfile));
    expect(s.beginPlacement()?.probe).toBe("v18"); // 18 of 35
    expect(s.answerPlacement(false)).toBeNull();
    expect(s.progress().frontiers["verb-forms"]).toBeUndefined(); // start at 1
    expect(s.progress().knownSections).toEqual([]);
  });

  it("carries on past a failed family — the declensions-but-not-the-verbs case", () => {
    const s = new Session(new Content(book(topics("nouns", "n", 3), topics("verb-forms", "v", 3)), testProfile));
    expect(s.beginPlacement()?.probe).toBe("n2");
    expect(s.answerPlacement(true)?.probe).toBe("n3"); // narrowing the nouns
    // Failing does not end the run: the verbs still get asked.
    expect(s.answerPlacement(false)?.probe).toBe("v2");
    expect(s.answerPlacement(false)).toBeNull();

    expect(s.progress().frontiers).toEqual({ nouns: "n3" });
    // Only nouns were claimed — never a prefix of the whole book.
    expect(s.progress().knownSections).toEqual(["n1", "n2"]);

    const now = new Date("2026-01-01T00:00:00Z");
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "n3" });
    s.gradeTopic("n3", 4, now);
    expect(s.next(now)).toEqual({ kind: "new-topic", sectionId: "v1" });
  });

  it("says which family is being asked and how far through the test is", () => {
    const s = new Session(new Content(wide, testProfile));
    s.beginPlacement();
    expect(s.placementProgress()).toEqual({
      family: "nouns",
      done: 0,
      families: 2,
      narrowing: false,
    });
    // A second probe pins the same family down; it is not a new area.
    s.answerPlacement(true);
    expect(s.placementProgress()).toMatchObject({ family: "nouns", done: 0, narrowing: true });
    s.answerPlacement(false);
    expect(s.placementProgress()).toMatchObject({ family: "verb-forms", done: 1 });
  });

  it("takes a family of one without asking a second probe", () => {
    const s = new Session(new Content(book(topics("nouns", "n", 1)), testProfile));
    expect(s.beginPlacement()?.probe).toBe("n1");
    expect(s.answerPlacement(true)).toBeNull();
    expect(s.progress().knownSections).toEqual(["n1"]);
    expect(s.progress().frontiers.nouns).toBeUndefined(); // nothing left to resume at
  });
});
