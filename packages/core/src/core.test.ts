import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { testProfile } from "./profile.fixture.js";
import { compileFold } from "./fold.js";
import { deserializeCard, newCard, preview, rate, serializeCard } from "./scheduler.js";
import { MAX_CONTEXTS, Session } from "./session.js";
import { mulberry32 } from "./shuffle.js";
import {
  emptyProgress,
  type ContentData,
  type NewVocabContext,
  type RoundVia,
  type Test,
} from "./types.js";

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

  /**
   * The fuzz is on, and the grade buttons name an interval.
   *
   * Those two facts have to be checked against each other rather than assumed
   * compatible: the buttons are labelled with what each grade buys, so a fuzz
   * rolled fresh on every call would make the label a guess. The case above
   * covers a new card, where FSRS applies no fuzz at all; this one matures the
   * card first, which is where the fuzz actually lands.
   */
  it("still previews what it will apply, once the interval is long enough to fuzz", () => {
    let card = newCard(new Date("2026-01-01T00:00:00Z"));
    let at = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 6; i++) {
      card = rate(card, 4, at);
      at = new Date(card.due);
    }
    expect(card.due.getTime() - at.getTime()).toBe(0);
    // Twice, so an unstable fuzz shows up as a preview disagreeing with itself.
    expect(preview(card, at)[3].getTime()).toBe(preview(card, at)[3].getTime());
    expect(rate(card, 3, at).due.getTime()).toBe(preview(card, at)[3].getTime());
  });

  /**
   * A hundred years is not an interval.
   *
   * `maximum_interval` defaults to 36500 days and a card really reaches it —
   * eight easy grades in a row put one due in the year 2555, which the schedule
   * screen would have printed.
   */
  it("never schedules a card beyond a length somebody could come back from", () => {
    let card = newCard(new Date("2026-01-01T00:00:00Z"));
    let at = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 12; i++) {
      card = rate(card, 4, at);
      at = new Date(card.due);
    }
    const years = (card.due.getTime() - Date.parse("2026-01-01T00:00:00Z")) / 31557600000;
    expect(years).toBeLessThan(60);
  });

  /**
   * What the leech note on a topic reads. It was serialized and read by nothing.
   *
   * A lapse is not simply "a failure": FSRS counts one only against a card that
   * has reached the review state, so failing a card still in its learning steps
   * adds nothing. That is the right behaviour and it is why the note's threshold
   * is about a topic being genuinely stuck rather than about a bad first
   * evening — but it has to be written down, because "failed four times" and
   * "four lapses" are not the same sentence.
   */
  it("counts a failure as a lapse once the card is in review, and round-trips it", () => {
    let at = new Date("2026-01-01T00:00:00Z");
    let card = newCard(at);
    // Out of the learning steps first.
    for (let i = 0; i < 3; i++) {
      card = rate(card, 3, at);
      at = new Date(card.due);
    }
    expect(card.lapses).toBe(0);

    card = rate(card, 1, at);
    expect(card.lapses).toBe(1);
    expect(deserializeCard(serializeCard(card)).lapses).toBe(1);
  });
});

/**
 * `grammarMap` is the most expensive read in the engine and the most repeated —
 * both apps call it on every render, twice, since `familyProgress` and
 * `overallPercent` each go through it. It walks the whole attempt trail per
 * section, and the trail is deliberately uncapped.
 */
describe("the grammar map cache", () => {
  const built = () => new Session(new Content(fixture, testProfile));

  it("hands back the same map to two reads in one paint", () => {
    const s = built();
    const now = new Date("2026-01-01T00:00:00Z");
    // Identity, not equality: a fresh array would mean the walk ran again.
    expect(s.grammarMap(now)).toBe(s.grammarMap(now));
  });

  const scheduled = (s: Session, now: Date) =>
    s.grammarMap(now).filter((t) => t.scheduled).length;

  it("drops it when anything is graded", () => {
    const s = built();
    const now = new Date("2026-01-01T00:00:00Z");
    const before = s.grammarMap(now);
    expect(scheduled(s, now)).toBe(0);

    // Answering does not put a topic in the pile, so the thing that moves the
    // index is the enrolment the student asked for.
    s.enrolTopic("ag1", 4, now);
    const after = s.grammarMap(now);

    expect(after).not.toBe(before);
    // And not merely a different array: it says something different. A stale
    // cache would draw an index that did not move when the student answered.
    expect(scheduled(s, now)).toBe(1);

    // A grade on the enrolled topic drops it again — the card moved, so `due`
    // and `lapses` may have too.
    s.gradeTopic("ag1", 1, now);
    expect(s.grammarMap(now)).not.toBe(after);
  });

  it("drops it when a snapshot is restored", () => {
    const s = built();
    const now = new Date("2026-01-01T00:00:00Z");
    const clean = s.snapshot();
    s.gradeTopic("ag1", 4, now);
    const graded = s.grammarMap(now);

    s.restore(clean);
    const back = s.grammarMap(now);
    expect(back).not.toBe(graded);
    expect(scheduled(s, now)).toBe(0);
  });

  it("drops it when a topic is bookmarked, which nothing else could tell it", () => {
    // The bookmark is the one fact on the map no grade and no clock moves, so
    // it is the one that would sit stale behind an unbumped revision.
    const s = built();
    const now = new Date("2026-01-01T00:00:00Z");
    const before = s.grammarMap(now);
    s.bookmark("ag1");
    expect(s.grammarMap(now)).not.toBe(before);
    expect(s.grammarMap(now).find((t) => t.sectionId === "ag1")!.bookmarked).toBe(true);
  });

  it("re-reads it as the clock moves, since `due` is about the clock", () => {
    const s = built();
    const at = new Date("2026-01-01T00:00:00Z");
    const later = new Date("2026-01-01T00:00:02Z");
    expect(s.grammarMap(at)).not.toBe(s.grammarMap(later));
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
  it("studies the topic it was asked for, then reviews and records vocab", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s = new Session(new Content(fixture, testProfile));

    // Nothing chosen and nothing due: the app has nothing to hand over, and
    // says so rather than picking a topic on the student's behalf.
    expect(s.next(now, "explore")).toEqual({ kind: "done" });
    expect(s.next(now)).toEqual({ kind: "done" });

    s.drillTopic("ag1", now);
    expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "ag1" });

    // Serving a test marks it seen; a second serve rotates variety.
    const t1 = s.serveTest("ag1");
    expect(t1?.sectionId).toBe("ag1");

    // Grade it easy. That alone does not put the topic in the pile — nothing
    // is scheduled and nothing was introduced — and the run stays where it was.
    s.gradeTopic("ag1", 4, now);
    expect(s.progress().topicCards).toEqual({});
    expect(s.progress().newTopicsIntroduced).toBe(0);

    // Asking for it is what creates the card.
    s.enrolTopic("ag1", 4, now);
    expect(s.progress().newTopicsIntroduced).toBe(1);
    expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "ag1" });

    // Record an unknown word from its inflected form.
    const hit = new Content(fixture, testProfile).lookup("manibus")[0]!;
    const id = s.recordVocab(hit, now);
    expect(s.vocabCard(id)?.citation).toMatch(/^manus/);
    // Dedupe: recording again returns the same id, no growth.
    expect(s.recordVocab(hit, now)).toBe(id);
    expect(Object.keys(s.progress().vocabCards)).toHaveLength(1);

    // Vocab becomes due immediately on creation, so the reviews have it.
    expect(s.next(now)).toEqual({ kind: "vocab-review", cardId: id });
    s.gradeVocab(id, 3, now);
    expect(s.next(now)).toEqual({ kind: "done" });
  });

  it("serves every due word before any due grammar", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const s = new Session(new Content(fixture, testProfile));

    // A topic in the pile, graded hard enough to come back, then left until it does.
    s.enrolTopic("ag1", 1, start);
    const later = new Date("2026-02-01T00:00:00Z");
    expect(s.next(later)).toEqual({ kind: "topic-review", sectionId: "ag1" });

    // Two words, both due the moment they are recorded — and both ahead of the
    // topic, though the topic came due a month before either existed.
    const content = new Content(fixture, testProfile);
    const hits = content.lookup("manibus");
    const first = s.recordVocab(hits[0]!, later);
    const second = s.recordVocab(hits[1]!, new Date("2026-02-01T00:01:00Z"));
    expect(second).not.toBe(first);

    const after = new Date("2026-02-01T00:02:00Z");
    expect(s.next(after)).toEqual({ kind: "vocab-review", cardId: first });
    s.gradeVocab(first, 3, after);
    expect(s.next(after)).toEqual({ kind: "vocab-review", cardId: second });
    s.gradeVocab(second, 3, after);

    // Only once the words are done does the grammar come back.
    expect(s.next(after)).toEqual({ kind: "topic-review", sectionId: "ag1" });
  });

  it("puts back a snapshot, undoing everything done since", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s = new Session(new Content(fixture, testProfile));
    s.enrolTopic("ag1", 3, now);

    const before = s.snapshot();

    // An enrolment, an answer and a word — the whole of a mistaken step.
    s.enrolTopic("ag2", 1, now);
    s.recordAttempt("ag2", { prompt: "p", answer: "a", submitted: "b", rating: 1 }, now);
    s.recordVocab(new Content(fixture, testProfile).lookup("manibus")[0]!, now);
    expect(s.progress().topicCards.ag2).toBeDefined();

    s.restore(before);
    expect(s.progress().topicCards.ag2).toBeUndefined();
    expect(s.attemptsFor("ag2")).toHaveLength(0);
    expect(Object.keys(s.progress().vocabCards)).toHaveLength(0);
    // What came before the snapshot is untouched.
    expect(s.progress().topicCards.ag1).toBeDefined();

    // The snapshot is a copy, not a window: grading on does not edit it, and
    // it can be restored again.
    s.enrolTopic("ag2", 4, now);
    expect(before.topicCards.ag2).toBeUndefined();
    s.restore(before);
    expect(s.progress().topicCards.ag2).toBeUndefined();
  });

  it("serializes and restores progress round-trip", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const s1 = new Session(new Content(fixture, testProfile));
    s1.enrolTopic("ag1", 3, now);
    const json = JSON.parse(JSON.stringify(s1.progress()));
    const s2 = new Session(new Content(fixture, testProfile), json);
    expect(s2.progress().topicCards.ag1).toBeDefined();
  });
});

describe("Session: reading a file this app no longer writes", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  /** Load a saved shape the way opening the app on an old file would. */
  const load = (saved: object) =>
    new Session(
      new Content(fixture, testProfile),
      JSON.parse(JSON.stringify({ ...emptyProgress(), ...saved })),
    );

  it("keeps the schedule and the answers of a file written for the old walk", () => {
    // The three fields the walk was made of, and the score that placed it, all
    // go — nothing is left for them to fold into. What the file is actually
    // worth is the schedule and the trail, and neither is touched.
    const s = load({
      knownSections: ["ag1"],
      topicMastery: { ag2: 4 },
      bookAt: "ag2",
      bookAtByGrammar: { second: "ag2" },
      attempts: { ag1: [{ prompt: "p", answer: "a", submitted: "a", rating: 3, at: now.toISOString() }] },
    });
    s.enrolTopic("ag2", 3, now);

    expect(s.progress().topicCards.ag2).toBeDefined();
    expect(s.attemptsFor("ag1")).toHaveLength(1);
    // Nothing was chosen, so nothing is on the table.
    expect(s.next(now, "explore")).toEqual({ kind: "done" });
  });

  it("teaches a placement claim once more, since it left no answers behind", () => {
    // The one visible trace of dropping `knownSections`, stated rather than
    // discovered: `everGraded` reads the answer trail, and a claim made at
    // placement put nothing on it.
    const s = load({ knownSections: ["ag1"] });
    expect(s.everGraded("ag1")).toBe(false);
  });

  it("drops a drill stored under the old rule rather than resuming it", () => {
    const s = load({ focus: { kind: "topic", sectionId: "ag2" } });
    // There is no run marker to resume from, and nothing invents one.
    expect(s.practiseRun()).toBeNull();
    expect(s.next(now, "explore")).toEqual({ kind: "done" });
  });

  it("forgets a backlog that had been set aside", () => {
    const s = load({ exploring: { since: "2025-12-01T00:00:00Z" } });
    // Which errand you are on is not a thing a file gets to say any more.
    expect(s.progress()).not.toHaveProperty("exploring");
  });

  it("reads a round opened by the old Quiz me as what it was shown as", () => {
    const round = {
      sectionId: "ag1",
      roundId: "ag1-t1",
      cardBefore: null,
      worst: null,
      answered: 0,
      isNew: false,
      via: "quiz",
    };
    expect(load({ openRound: round }).progress().openRound?.via).toBe("review");
    expect(
      load({ openRound: { ...round, isNew: true } }).progress().openRound?.via,
    ).toBe("new");
  });

  it("reads a round the book's walk came back to as the practice it now is", () => {
    // `sweep` is the one retired value that is translated rather than rejected.
    // Read as unknown it would fall back to "review", and the badge would call
    // a run of practice a review it never was.
    const s = load({
      openRound: {
        sectionId: "ag1",
        roundId: "ag1-t1",
        cardBefore: null,
        worst: null,
        answered: 0,
        isNew: false,
        via: "sweep",
      },
    });
    expect(s.progress().openRound?.via).toBe("drill");
  });

  it("leaves the fields it has retired out of what it writes back", () => {
    const saved = load({
      knownSections: ["ag1"],
      placementDone: true,
      placement: { familyIndex: 0, asked: 0, passed: -1, probe: "ag1" },
      frontiers: { nouns: "ag2" },
      focus: { kind: "sweep" },
      topicMastery: { ag1: 4 },
      bookAt: "ag2",
      bookAtByGrammar: { second: "ag2" },
    }).progress();
    for (const gone of [
      "knownSections",
      "placementDone",
      "placement",
      "frontiers",
      "focus",
      "topicMastery",
      "bookAt",
      "bookAtByGrammar",
    ]) {
      expect(saved).not.toHaveProperty(gone);
    }
  });
});

describe("Session schedule", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("lists what is waiting and what comes back, soonest first", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.enrolTopic("ag1", 4, now); // days away
    s.enrolTopic("ag2", 1, now); // minutes away
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
    s.enrolTopic("ag1", 3, now);
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

describe("Session vocabulary: the sentence a word was met in", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const later = (minutes: number) =>
    new Date(now.getTime() + minutes * 60_000);
  const entry = () => new Content(fixture, testProfile).lookup("manibus")[0]!;
  const start = () => {
    const s = new Session(new Content(fixture, testProfile));
    return { s, id: s.recordVocab(entry(), now) };
  };
  const reference: NewVocabContext = {
    prompt: "The girls praise the rose.",
    sentence: "Puellae rosam laudant.",
    source: "answer",
    index: 1,
  };

  it("keeps the reference and what was written as two contexts", () => {
    const { s, id } = start();
    expect(s.addVocabContext(id, reference, now)).toBe("added");
    expect(
      s.addVocabContext(
        id,
        { ...reference, sentence: "Puellae rosa laudant.", source: "submitted" },
        later(1),
      ),
    ).toBe("added");

    const [first, second] = s.vocabContexts(id);
    expect(first?.sentence).toBe("Puellae rosam laudant.");
    expect(first?.source).toBe("answer");
    expect(first?.at).toBe(now.toISOString());
    expect(second?.source).toBe("submitted");
  });

  it("counts an answer typed correctly as the one context it is", () => {
    const { s, id } = start();
    s.addVocabContext(id, reference, now);
    // The student wrote the reference, with the pack's marks left off and a
    // stray space — the fold and `words` between them make that the same line.
    expect(
      s.addVocabContext(
        id,
        { ...reference, sentence: "puellae  rosam laudant", source: "submitted" },
        later(1),
      ),
    ).toBe("duplicate");
    expect(s.vocabContexts(id)).toHaveLength(1);
  });

  it("counts one line met under two topics as the one line it is", () => {
    const { s, id } = start();
    s.addVocabContext(id, { ...reference, sectionId: "decl1" }, now);

    // The page is out of the key, as `source` and `index` are. A sentence the
    // bank files under two topics is still one sentence, and keyed on where it
    // was met a student who saw it twice would find their card holding it
    // twice — which is the duplicate this refuses.
    expect(
      s.addVocabContext(id, { ...reference, sectionId: "pres" }, later(1)),
    ).toBe("duplicate");
    expect(s.vocabContexts(id)).toHaveLength(1);
    // And the first one keeps its page rather than being overwritten by the
    // press that did nothing.
    expect(s.vocabContexts(id)[0]?.sectionId).toBe("decl1");
  });

  it("keeps the page when the sentence on it is corrected", () => {
    const { s, id } = start();
    s.addVocabContext(id, { ...reference, sectionId: "decl1" }, now);

    // Fixing a typo does not move a line to another page of the book, and a
    // student tidying their own card should not be quietly charged its
    // provenance for it.
    s.updateVocabContext(id, now.toISOString(), {
      sentence: "Puellae rosam laudābant.",
    });
    expect(s.vocabContexts(id)[0]?.sentence).toBe("Puellae rosam laudābant.");
    expect(s.vocabContexts(id)[0]?.sectionId).toBe("decl1");
  });

  it("leaves a context that names no page without one", () => {
    const { s, id } = start();
    // Every context saved before the field existed, and every word typed in
    // with no question on screen. Absent is the answer, and it survives being
    // written, moved and read back rather than being filled in with a guess.
    s.addVocabContext(id, reference, now);
    s.addVocabContext(id, { ...reference, sentence: "Manum tenuit.", sectionId: "pres" }, later(1));
    s.moveVocabContext(id, later(1).toISOString(), -1);

    const [first, second] = s.vocabContexts(id);
    expect(first?.sectionId).toBe("pres");
    expect(second).toBeDefined();
    expect("sectionId" in second!).toBe(false);
  });

  it("adds a second question's sentence to a word already saved", () => {
    const { s, id } = start();
    s.addVocabContext(id, reference, now);
    const before = s.vocabCard(id)!.fsrs.due;

    // Met again, months later, in a different question. The same card takes it.
    const second = s.recordVocab(entry(), later(60));
    expect(second).toBe(id);
    expect(
      s.addVocabContext(
        id,
        { prompt: "He held power.", sentence: "Manum tenuit.", source: "answer", index: 0 },
        later(60),
      ),
    ).toBe("added");

    expect(s.vocabList()).toHaveLength(1);
    expect(s.vocabContexts(id)).toHaveLength(2);
    // Recording a word already held rewrites nothing about the card itself.
    expect(s.vocabCard(id)?.fsrs.due).toBe(before);
  });

  it("never rewrites a card the student has corrected", () => {
    const { s, id } = start();
    s.updateVocab(id, { citation: "manus, manūs (f)", gloss: "hand, band" });
    // A second hold on the same word must not quietly restore the dictionary's
    // citation over the student's own.
    s.recordVocab(entry(), later(1));
    expect(s.vocabCard(id)?.citation).toBe("manus, manūs (f)");
    expect(s.vocabCard(id)?.citationEdited).toBe(true);
  });

  it("stops at the cap and says so", () => {
    const { s, id } = start();
    // Distinguished by a word rather than a number: `words` keeps letters and
    // drops everything else, so eight sentences differing only in a digit would
    // be one sentence eight times over — as they are to `answerMatches`.
    const each = ["alpha", "beta", "gamma", "delta", "zeta", "eta", "theta", "iota"];
    for (let i = 0; i < MAX_CONTEXTS; i++) {
      expect(
        s.addVocabContext(
          id,
          { ...reference, sentence: `Line ${each[i]}.` },
          later(i),
        ),
      ).toBe("added");
    }
    const full = s.vocabContexts(id).map((c) => c.at);
    expect(
      s.addVocabContext(id, { ...reference, sentence: "One too many." }, later(99)),
    ).toBe("full");
    // Refused whole: nothing dropped to make room, nothing appended.
    expect(s.vocabContexts(id).map((c) => c.at)).toEqual(full);
  });

  it("holds a standing preference across a grade taken back", () => {
    const { s, id } = start();
    const before = s.snapshot();
    s.setQuotedOnly(true);
    s.gradeVocab(id, 3, now);
    // The undo reaches the grade it was offered for, and stops there.
    s.restore(before);
    expect(s.quotedOnly()).toBe(true);
  });

  it("tells apart two sentences attached in the same millisecond", () => {
    const { s, id } = start();
    // Nothing forces a hold to be the only way in — an import, or two attached
    // in one turn, land on the same clock reading. Two contexts sharing an `at`
    // are one context that cannot be named, and deleting either deletes both.
    s.addVocabContext(id, { ...reference, sentence: "Line alpha." }, now);
    s.addVocabContext(id, { ...reference, sentence: "Line beta." }, now);
    const [first, second] = s.vocabContexts(id);
    expect(first?.at).not.toBe(second?.at);

    s.deleteVocabContext(id, first!.at);
    expect(s.vocabContexts(id).map((c) => c.sentence)).toEqual(["Line beta."]);
  });

  it("moves a context one place, and stops at the ends", () => {
    const { s, id } = start();
    const at = (i: number) => later(i).toISOString();
    const each = ["alpha", "beta", "gamma"];
    for (let i = 0; i < 3; i++) {
      s.addVocabContext(id, { ...reference, sentence: `Line ${each[i]}.` }, later(i));
    }
    const order = () => s.vocabContexts(id).map((c) => c.sentence);

    s.moveVocabContext(id, at(2), -1);
    expect(order()).toEqual(["Line alpha.", "Line gamma.", "Line beta."]);
    s.moveVocabContext(id, at(0), -1); // already first
    s.moveVocabContext(id, at(1), 1); // already last
    s.moveVocabContext(id, "never-attached", 1);
    expect(order()).toEqual(["Line alpha.", "Line gamma.", "Line beta."]);
  });

  it("finds the picked-out word again in a rewritten sentence", () => {
    const { s, id } = start();
    s.addVocabContext(id, reference, now); // index 1 — "rosam"

    // The word moves; the highlight follows it rather than staying put.
    s.updateVocabContext(id, now.toISOString(), {
      sentence: "  Rosam puellae laudant.  ",
    });
    expect(s.vocabContexts(id)[0]?.sentence).toBe("Rosam puellae laudant.");
    expect(s.vocabContexts(id)[0]?.index).toBe(0);

    // And when it is gone, the highlight goes rather than landing on a word
    // the student never picked.
    s.updateVocabContext(id, now.toISOString(), { sentence: "Puellae laudant." });
    expect(s.vocabContexts(id)[0]?.index).toBeUndefined();
  });

  /**
   * The credit on a quoted line, which is half of why that line is worth
   * keeping: `manus` stuck because of a sentence somebody wrote, and a card
   * that kept the sentence and dropped the name kept half of it.
   */
  describe("who wrote it", () => {
    const cicero = { author: "Cicero", work: "In Catilinam", locus: "1.1" };

    it("keeps the author and the locus with the reference", () => {
      const { s, id } = start();
      s.addVocabContext(id, { ...reference, attribution: cicero }, now);
      expect(s.vocabContexts(id)[0]?.attribution).toEqual(cicero);
    });

    it("does not put an author's name on what the student wrote", () => {
      // The same defect as drawing their line as the reference, which the
      // label beside it exists to prevent — a sentence of their own is theirs
      // however closely it follows the book.
      const { s, id } = start();
      s.addVocabContext(
        id,
        { ...reference, source: "submitted", attribution: cicero },
        now,
      );
      const [kept] = s.vocabContexts(id);
      expect(kept?.source).toBe("submitted");
      // Absent rather than emptied: a field a card has no answer for is not
      // written down at all.
      expect(kept && "attribution" in kept).toBe(false);
    });

    it("says nothing about a sentence nobody can be credited for", () => {
      // Which is most of them: a generated sentence has no author.
      const { s, id } = start();
      s.addVocabContext(id, reference, now);
      expect(s.vocabContexts(id)[0]?.attribution).toBeUndefined();
    });
  });

  it("will not relabel what the student wrote as the reference", () => {
    const { s, id } = start();
    s.addVocabContext(id, { ...reference, source: "submitted" }, now);
    s.updateVocabContext(id, now.toISOString(), {
      prompt: "  Tidied up.  ",
      sentence: "Puellae rosam laudant.",
    });
    expect(s.vocabContexts(id)[0]?.prompt).toBe("Tidied up."); // trimmed
    expect(s.vocabContexts(id)[0]?.source).toBe("submitted");
  });

  it("leaves no trace of a card whose contexts were all deleted", () => {
    const { s, id } = start();
    s.addVocabContext(id, reference, now);
    s.addVocabContext(id, { ...reference, sentence: "Another line." }, later(1));

    s.deleteVocabContext(id, now.toISOString());
    expect(s.vocabContexts(id).map((c) => c.sentence)).toEqual(["Another line."]);
    s.deleteVocabContext(id, later(1).toISOString());
    // Absent, not empty: a cleared card reads like one that never had any.
    expect(s.vocabCard(id)?.contexts).toBeUndefined();
    s.deleteVocabContext(id, now.toISOString()); // deleting twice is not an error
  });

  it("reads a file written before any of this existed", () => {
    const s = new Session(new Content(fixture, testProfile));
    const id = s.recordVocab(entry(), now);
    const old = s.progress();

    const back = new Session(new Content(fixture, testProfile), old);
    expect(back.vocabContexts(id)).toEqual([]);
    // Every one of these is safe on a card that has no contexts at all.
    back.moveVocabContext(id, "nothing", 1);
    back.deleteVocabContext(id, "nothing");
    back.updateVocabContext(id, "nothing", { sentence: "x" });
    expect(back.addVocabContext(id, reference, now)).toBe("added");
    expect(back.addVocabContext("v-no-such-card", reference, now)).toBe("missing");
  });

  it("leaves contexts alone when the dictionary is rebuilt", () => {
    const s = new Session(new Content(fixture, testProfile));
    const id = s.recordVocab(entry(), now);
    s.addVocabContext(id, reference, now);
    s.progress().citationsVersion = 1;

    const rebuilt = new Content(
      {
        ...fixture,
        lemmas: {
          manus: [
            { lemma: "manus", citation: "manus, manūs (f)", gloss: "hand", pos: "noun" },
          ],
        },
      },
      testProfile,
    );
    const after = new Session(rebuilt, s.progress());
    expect(after.refreshCitations()).toBe(1);
    // The citation is the dictionary's to revise. The sentence is not.
    expect(after.vocabCard(id)?.citation).toBe("manus, manūs (f)");
    expect(after.vocabContexts(id)).toHaveLength(1);
    expect(after.vocabContexts(id)[0]?.sentence).toBe("Puellae rosam laudant.");
  });
});

/**
 * The sentences a student decided to keep.
 *
 * A word could always be lifted out of an answer and kept. A whole sentence
 * could not, and the ones worth keeping — a line of an ancient author, met
 * while working through some case ending — were left to the shuffle.
 */
describe("Session sentences", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const cicero = {
    prompt: "The girl loves the rose.",
    answer: "Puella rosam amat.",
    kind: "translate-en-la",
    vocab: [],
    note: "Accusative for the object.",
    source: { author: "Cicero", work: "De Amicitia", locus: "12" },
  } as const;

  const kept = (s: Session) => s.keepSentence({ ...cicero }, "ag1", undefined, now);

  it("keeps the question whole, with whoever it is quoted from", () => {
    const s = new Session(new Content(fixture, testProfile));
    const { id, outcome } = kept(s);
    expect(outcome).toBe("kept");

    const card = s.sentenceCard(id)!;
    expect(card.prompt).toBe(cicero.prompt);
    expect(card.answer).toBe(cicero.answer);
    // The attribution is the whole reason most of these cards will exist, so it
    // travels with the sentence rather than being left behind in the bank.
    expect(card.source).toEqual(cicero.source);
    expect(card.note).toBe(cicero.note);
    expect(card.sectionId).toBe("ag1");
  });

  it("is keyed by the question, so keeping it twice keeps one card", () => {
    const s = new Session(new Content(fixture, testProfile));
    const first = kept(s);
    expect(s.hasSentence(cicero.prompt, cicero.answer)).toBe(true);

    const again = s.keepSentence({ ...cicero }, "ag2", undefined, now);
    expect(again.outcome).toBe("duplicate");
    expect(again.id).toBe(first.id);
    expect(s.sentenceList()).toHaveLength(1);
    // And the second press changed nothing — not even the topic it says it came
    // from, which is what a card kept months ago should go on saying.
    expect(s.sentenceCard(first.id)!.sectionId).toBe("ag1");
  });

  it("takes its id from the sentence rather than from where it was filed", () => {
    // The property that makes a card survive the bank being regenerated: the
    // same prompt and answer rebuild to the same id, whatever test carries them.
    const s = new Session(new Content(fixture, testProfile));
    expect(s.sentenceIdFor(cicero.prompt, cicero.answer)).toBe(
      s.sentenceIdFor(cicero.prompt, cicero.answer),
    );
    expect(s.sentenceIdFor(cicero.prompt, cicero.answer)).not.toBe(
      s.sentenceIdFor(cicero.prompt, "Puella rosās amat."),
    );
    expect(kept(s).id.startsWith("s-")).toBe(true);
  });

  it("freezes what was picked out, and keeps only the two texts it draws", () => {
    const s = new Session(new Content(fixture, testProfile));
    const { id } = s.keepSentence(
      { ...cicero },
      "ag1",
      // `submitted` is not a field of `CardMarks`; this is the shape the graded
      // screen hands over once it has dropped what the student wrote.
      { prompt: { 1: 1 }, answer: { 1: 3 } },
      now,
    );
    expect(s.sentenceCard(id)!.marks).toEqual({ prompt: { 1: 1 }, answer: { 1: 3 } });

    // A card is not an attempt: it does not follow a later answer on the same
    // sentence, and there is nothing here that edits it.
    s.keepSentence({ ...cicero }, "ag1", { answer: { 2: 2 } }, now);
    expect(s.sentenceCard(id)!.marks).toEqual({ prompt: { 1: 1 }, answer: { 1: 3 } });
  });

  it("carries no marks at all when nothing was picked out", () => {
    // So a card made without marking reads on disk exactly as it would have
    // before marking existed.
    const s = new Session(new Content(fixture, testProfile));
    expect(s.sentenceCard(kept(s).id)!.marks).toBeUndefined();
    const empty = s.keepSentence(
      { ...cicero, prompt: "The rose." },
      "ag1",
      { prompt: undefined, answer: undefined },
      now,
    );
    expect(s.sentenceCard(empty.id)!.marks).toBeUndefined();
  });

  it("is scheduled, graded and previewed like any other card", () => {
    const s = new Session(new Content(fixture, testProfile));
    const { id } = kept(s);
    const schedule = s.previewSentence(id, now)!;
    expect(schedule[1].getTime()).toBeLessThan(schedule[4].getTime());

    s.gradeSentence(id, 3, now);
    expect(s.sentenceCard(id)!.fsrs.reps).toBe(1);
    expect(new Date(s.sentenceCard(id)!.fsrs.due).getTime()).toBeGreaterThan(
      now.getTime(),
    );
  });

  it("comes back after the words and before the grammar", () => {
    /*
     * The rung, and the reason for it is the one `next` already gives for
     * putting words first: a card is answered in seconds where a round of
     * sentences is not, and a card behind a wall of grammar is the card that
     * misses its review when a session is cut short.
     */
    const s = new Session(new Content(fixture, testProfile));
    const { id } = kept(s);
    s.gradeTopic("ag1", 1, now);
    const soon = new Date("2026-01-01T00:30:00Z");
    expect(s.next(soon, "review")).toEqual({ kind: "sentence-review", cardId: id });

    s.recordVocab(
      { lemma: "manus", citation: "manus, ūs (f)", gloss: "hand", pos: "noun" },
      now,
    );
    s.gradeVocab(s.vocabIdFor({ lemma: "manus", citation: "", gloss: "", pos: "" }), 1, now);
    expect(s.next(soon, "review").kind).toBe("vocab-review");
  });

  it("is counted where the pile is counted, so it cannot be reported clear", () => {
    const s = new Session(new Content(fixture, testProfile));
    kept(s);
    expect(s.stats(now)).toMatchObject({ sentences: 1, dueSentences: 1 });
    // A new card is due now, which is what makes "nothing is waiting" a claim a
    // screen has to ask this about rather than assume.
    s.gradeSentence(s.sentenceIdFor(cicero.prompt, cicero.answer), 3, now);
    expect(s.stats(now).dueSentences).toBe(0);
  });

  it("stands in the schedule with the Latin leading", () => {
    const s = new Session(new Content(fixture, testProfile));
    kept(s);
    const entry = s.upcoming(now).find((e) => e.kind === "sentence")!;
    expect(entry.title).toBe(cicero.answer);
    expect(entry.sub).toBe(cicero.prompt);
    expect(s.nextDue(new Date("2025-12-31T00:00:00Z"))).toBeDefined();
  });

  it("can be forgotten, and put back exactly as it was", () => {
    const s = new Session(new Content(fixture, testProfile));
    const { id } = kept(s);
    s.gradeSentence(id, 4, now);
    const card = s.sentenceCard(id)!;

    s.deleteSentence(id);
    expect(s.sentenceCard(id)).toBeUndefined();
    s.restoreSentence(card);
    // The schedule comes back with it — an undo that reset the card would be a
    // second thing happening under a button that says one.
    expect(s.sentenceCard(id)!.fsrs.reps).toBe(1);

    // And a card kept again by hand before the undo is pressed wins: that is
    // the student saying what they want.
    s.deleteSentence(id);
    kept(s);
    s.restoreSentence(card);
    expect(s.sentenceCard(id)!.fsrs.reps).toBe(0);
  });

  it("is taken back by an undo, being a thing done rather than a preference", () => {
    const s = new Session(new Content(fixture, testProfile));
    const before = s.snapshot();
    const { id } = kept(s);
    s.restore(before);
    expect(s.sentenceCard(id)).toBeUndefined();
  });

  it("reads a file written before there was anywhere to keep one", () => {
    const old = emptyProgress();
    delete (old as Partial<typeof old>).sentenceCards;
    const s = new Session(new Content(fixture, testProfile), old);
    expect(s.sentenceList()).toEqual([]);
    expect(s.stats(now).dueSentences).toBe(0);
  });

  it("lists the last one kept first", () => {
    // The other way round from the vocabulary list, which has a dictionary
    // order to be read in. A commonplace book has none.
    const s = new Session(new Content(fixture, testProfile));
    kept(s);
    const later = s.keepSentence(
      { ...cicero, prompt: "The sailors feared the storm." },
      "ag1",
      undefined,
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(s.sentenceList()[0]!.id).toBe(later.id);
  });
});

describe("Session: the index, the bookmark and the pile", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const topic = (s: Session, id: string) =>
    s.grammarMap(now).find((t) => t.sectionId === id)!;

  it("groups topics into families, and says nothing about how well they went", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.gradeTopic("ag1", 3, now);

    const nouns = s.familyProgress(now).find((f) => f.id === "nouns")!;
    // Both fixture sections declare family "nouns".
    expect(nouns.topics.map((t) => t.sectionId)).toEqual(["ag1", "ag2"]);
    // No score anywhere on a family or on a topic — only what is countable.
    expect(nouns).not.toHaveProperty("percent");
    expect(topic(s, "ag1")).not.toHaveProperty("mastery");

    const empty = s.familyProgress(now).find((f) => f.id === "verb-forms")!;
    expect(empty.topics).toHaveLength(0);
  });

  it("marks a topic to come back to, and takes the mark off again", () => {
    const s = new Session(new Content(fixture, testProfile));
    expect(topic(s, "ag1").bookmarked).toBe(false);
    expect(s.bookmarkedTopics(now)).toEqual([]);

    s.bookmark("ag1");
    expect(s.isBookmarked("ag1")).toBe(true);
    expect(topic(s, "ag1").bookmarked).toBe(true);
    expect(s.bookmarkedTopics(now).map((t) => t.sectionId)).toEqual(["ag1"]);
    // Bookmarking twice is not two bookmarks.
    s.bookmark("ag1");
    expect(s.progress().bookmarked).toEqual(["ag1"]);

    s.unbookmark("ag1");
    expect(s.isBookmarked("ag1")).toBe(false);
    expect(s.bookmarkedTopics(now)).toEqual([]);
    // Unbookmarking what was never bookmarked is not an error.
    s.unbookmark("ag2");
  });

  it("reads the bookmarks of a file that called them stars", () => {
    // The one migration this feature needed, and the whole of it: the same
    // ids, in the same order, under the word that says what the mark is.
    const old = { ...emptyProgress(), starred: ["ag2", "ag1"] };
    const s = new Session(new Content(fixture, testProfile), old);

    expect(s.isBookmarked("ag1")).toBe(true);
    expect(s.isBookmarked("ag2")).toBe(true);
    expect(s.progress().bookmarked).toEqual(["ag2", "ag1"]);
    // Folded and dropped, not folded and left behind to be read twice.
    expect((s.progress() as { starred?: unknown }).starred).toBeUndefined();
  });

  it("loses neither name when a file has been through both builds", () => {
    /*
     * Sync moves whole files by `updatedAt` and knows nothing of fields, so a
     * file can arrive carrying marks made under each name. Either one dropped
     * is a mark the student made and would not get back.
     */
    const both = { ...emptyProgress(), bookmarked: ["ag1"], starred: ["ag1", "ag2"] };
    const s = new Session(new Content(fixture, testProfile), both);

    expect(s.progress().bookmarked).toEqual(["ag1", "ag2"]);
  });

  /**
   * The die: a topic chosen for the student rather than by them.
   *
   * Picking one is the whole of how a run begins, which is right when there is
   * a topic in mind and a burden when there is not. Everything here is about
   * what the die is *allowed* to hand over and how heavily it leans, because
   * both are promises made on a screen — "never roll this" has to mean never,
   * and "answered least" has to be visible over a handful of rolls rather than
   * over ten thousand.
   */
  describe("the die", () => {
    /** Answer both of `ag1`'s questions, so its coverage is 2 and `ag2`'s is 0. */
    const workOut = (s: Session) => {
      for (const prompt of ["puella (nom. pl.)?", "rosa (gen. sg.)?"]) {
        s.recordAttempt("ag1", { prompt, answer: "x", submitted: "x", rating: 3 }, now);
      }
    };

    it("takes a topic off the die and puts it back, without touching the pile", () => {
      const s = new Session(new Content(fixture, testProfile));
      s.enrolTopic("ag1", 4, now);
      expect(topic(s, "ag1").noRoll).toBe(false);

      s.excludeFromRoll("ag1");
      expect(s.isExcludedFromRoll("ag1")).toBe(true);
      expect(topic(s, "ag1").noRoll).toBe(true);
      // A preference about the die and nothing else: what is due is still due.
      expect(topic(s, "ag1").scheduled).toBe(true);
      expect(s.progress().topicCards.ag1).toBeDefined();
      // Excluding twice is not two exclusions.
      s.excludeFromRoll("ag1");
      expect(s.progress().noRoll).toEqual(["ag1"]);

      s.allowInRoll("ag1");
      expect(s.isExcludedFromRoll("ag1")).toBe(false);
      // Allowing what was never excluded is not an error.
      s.allowInRoll("ag2");
    });

    it("never hands over a topic that has been taken off it", () => {
      const s = new Session(new Content(fixture, testProfile));
      s.excludeFromRoll("ag1");
      const rng = mulberry32(7);
      for (let i = 0; i < 50; i += 1) {
        expect(s.rollTopic(rng, now)?.sectionId).toBe("ag2");
      }
    });

    it("says so rather than pretending when there is nothing left to roll", () => {
      const s = new Session(new Content(fixture, testProfile));
      s.excludeFromRoll("ag1");
      s.excludeFromRoll("ag2");
      expect(s.rollTopic(mulberry32(1), now)).toBeNull();
    });

    it("skips a page the book sets no exercise on, and one with nothing written yet", () => {
      /*
       * Two different silences and the same answer. A reading-only page has no
       * questions and never will; a topic nobody has written questions for has
       * none yet. Rolling either opens a run that closes again on
       * "practised all 0", which is a tap the die wasted.
       */
      const withReading = {
        ...fixture,
        grammar: [
          ...fixture.grammar,
          { id: "sounds", ref: "3", title: "Sounds", family: "nouns", text: "...", order: 3, readingOnly: true },
          { id: "untested", ref: "4", title: "Untested", family: "nouns", text: "...", order: 4 },
        ],
      };
      const s = new Session(new Content(withReading, testProfile));
      const rolled = new Set<string>();
      const rng = mulberry32(3);
      for (let i = 0; i < 200; i += 1) rolled.add(s.rollTopic(rng, now)!.sectionId);
      expect(rolled).toEqual(new Set(["ag1", "ag2"]));
    });

    it("leans towards the topic answered least, by exactly 1/sqrt(1 + answered)", () => {
      // Pinned against the arithmetic rather than against a sample, so the
      // weight cannot drift into something steeper while the test still passes.
      // `ag1` is worked out (2 answered, weight 0.577); `ag2` is untouched
      // (weight 1); the cut runs over them in book order out of 1.577.
      const s = new Session(new Content(fixture, testProfile));
      workOut(s);
      expect(topic(s, "ag1").answered).toBe(2);
      expect(topic(s, "ag2").answered).toBe(0);

      expect(s.rollTopic(() => 0.3, now)!.sectionId).toBe("ag1");
      expect(s.rollTopic(() => 0.5, now)!.sectionId).toBe("ag2");
      // The two ends, which is where an off-by-one in the walk shows up.
      expect(s.rollTopic(() => 0, now)!.sectionId).toBe("ag1");
      expect(s.rollTopic(() => 0.999999, now)!.sectionId).toBe("ag2");
    });

    it("leans, and no more than leans — the worked-out topic still comes up", () => {
      // The nudge is deliberately gentle: a die that never revisits anything is
      // a rule about what may be studied, which is not this app's to make.
      const s = new Session(new Content(fixture, testProfile));
      workOut(s);
      const rng = mulberry32(11);
      let untouched = 0;
      for (let i = 0; i < 1000; i += 1) {
        if (s.rollTopic(rng, now)!.sectionId === "ag2") untouched += 1;
      }
      expect(untouched).toBeGreaterThan(550);
      expect(untouched).toBeLessThan(700);
    });

    it("does not hand back the topic already open, unless it is the only one", () => {
      const s = new Session(new Content(fixture, testProfile));
      const rng = mulberry32(5);
      for (let i = 0; i < 50; i += 1) {
        expect(s.rollTopic(rng, now, "ag1")?.sectionId).toBe("ag2");
      }
      // The one case where handing it back is the honest answer.
      s.excludeFromRoll("ag2");
      expect(s.rollTopic(rng, now, "ag1")?.sectionId).toBe("ag1");
    });
  });

  it("keeps the bookmarks in book order, whatever order they were filled in", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.bookmark("ag2");
    s.bookmark("ag1");
    expect(s.progress().bookmarked).toEqual(["ag2", "ag1"]);
    expect(s.bookmarkedTopics(now).map((t) => t.sectionId)).toEqual(["ag1", "ag2"]);
  });

  it("takes a topic out of the review pile, and only an enrolment puts it back", () => {
    const s = new Session(new Content(fixture, testProfile));
    s.enrolTopic("ag1", 4, now);
    expect(topic(s, "ag1").scheduled).toBe(true);

    s.dismissTopic("ag1");
    expect(topic(s, "ag1").scheduled).toBe(false);
    expect(s.progress().topicCards.ag1).toBeUndefined();
    // Never due, so never served by a review.
    const due = new Date("2030-01-01T00:00:00Z");
    expect(s.next(due)).toEqual({ kind: "done" });
    // Dismissing twice is not an error.
    s.dismissTopic("ag1");

    /*
     * Answering it again does not undo the dismissal.
     *
     * It used to: the next grade wrote the card straight back, so a dismissal
     * survived exactly until the student next practised the topic — which is a
     * strange thing to call a decision they made about their own pile. A
     * dismissed topic is an unenrolled one now, and comes back the same way any
     * other does, by being asked for.
     */
    s.gradeTopic("ag1", 4, now);
    expect(topic(s, "ag1").scheduled).toBe(false);

    s.enrolTopic("ag1", 4, now);
    expect(topic(s, "ag1").scheduled).toBe(true);
  });

  it("keeps the answers and the bookmark through a dismissal", () => {
    // It deletes a schedule, not a syllabus. Everything the student wrote and
    // everything they marked survives, which is what makes it undoable by
    // practising the topic again and saying yes when it asks.
    const s = new Session(new Content(fixture, testProfile));
    s.recordAttempt("ag1", { prompt: "p", answer: "a", submitted: "a", rating: 3 }, now);
    s.enrolTopic("ag1", 4, now);
    s.bookmark("ag1");

    s.dismissTopic("ag1");
    expect(s.attemptsFor("ag1")).toHaveLength(1);
    expect(s.isBookmarked("ag1")).toBe(true);
    // And the topic is still one that has been studied, so practising it does
    // not teach it again from the top.
    expect(s.everGraded("ag1")).toBe(true);
  });

  it("takes the open round with the card, so the next grade cannot undo it", () => {
    /*
     * `gradeTopic` rebuilds a topic's card from `cardBefore` on every grade of
     * a round. Dismiss mid-round without clearing it and the round's next
     * answer writes the card straight back — the dismissal undone silently, by
     * the student carrying on.
     */
    const s = new Session(new Content(fixture, testProfile));
    const served = s.serveTest("ag1")!;
    s.beginRound("ag1", served, false, "review");
    s.gradeTopic("ag1", 3, now, served.id);
    expect(s.progress().openRound).not.toBeNull();

    s.dismissTopic("ag1");
    expect(s.progress().openRound).toBeNull();
    expect(s.progress().topicCards.ag1).toBeUndefined();
  });

  it("says a topic has been studied from the trail, not from its card", () => {
    // The distinction only bites once — after a dismissal — and that is exactly
    // the case a card-based answer would get wrong.
    const s = new Session(new Content(fixture, testProfile));
    expect(s.everGraded("ag1")).toBe(false);
    s.recordAttempt("ag1", { prompt: "p", answer: "a", submitted: "a", rating: 3 }, now);
    expect(s.everGraded("ag1")).toBe(true);
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
    s.enrolTopic("ag1", 1, now); // 'again' -> due again almost immediately
    const map = s.grammarMap(new Date("2026-01-02T00:00:00Z"));
    expect(map.find((t) => t.sectionId === "ag1")?.due).toBe(true);
    expect(map.find((t) => t.sectionId === "ag3")?.hasTests).toBe(false);
    expect(map.find((t) => t.sectionId === "ag1")?.hasTests).toBe(true);
    // A gap, not a page the book sets no exercise on: nobody has written
    // anything for `ag3` yet, and somebody should.
    expect(map.find((t) => t.sectionId === "ag3")?.readingOnly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pages the book sets no exercise on.
//
// A pack ships every section of its source, prosody and word formation with the
// rest, because what a student cannot reach they can never read. Those pages are
// declared `readingOnly` by the parser — never inferred from having no tests,
// which is what keeps an orphaned test file a defect rather than a silent
// reclassification.

describe("reading-only sections", () => {
  /** The fixture plus one page of prosody, which no question is written for. */
  const withReading: ContentData = {
    ...fixture,
    grammar: [
      ...fixture.grammar,
      {
        id: "ag9",
        ref: "9",
        title: "Prosody",
        family: "nouns",
        text: "Of feet and metres.",
        order: 9,
        readingOnly: true,
      },
    ],
  };

  it("is read and paged through like any other section", () => {
    const c = new Content(withReading, testProfile);
    // In `sections`, which is what the reader pages and what the map draws, so
    // the page is one swipe from the section before it.
    expect(c.sections().map((s) => s.id)).toEqual(["ag1", "ag2", "ag9"]);
    expect(c.getSection("ag9")?.text).toBe("Of feet and metres.");
  });

  it("is never a topic the study walk can land on, tests or no tests", () => {
    // Tests filed under it as well, which the gates forbid and this proves the
    // engine survives: the declaration decides, not the absence of a bank.
    const c = new Content(
      { ...withReading, tests: { ...fixture.tests, ag9: fixture.tests.ag1! } },
      testProfile,
    );
    expect(c.testsFor("ag9").length).toBeGreaterThan(0);
    expect(c.topicIds()).toEqual(["ag1", "ag2"]);
  });

  it("is listed under its family, as a page of the book a reader has to find", () => {
    // There is no figure left for it to dilute — the index counts what is
    // countable and nothing else — but it must still appear, because the index
    // is the only way to any page.
    const s = new Session(new Content(withReading, testProfile));
    const family = s.familyProgress().find((f) => f.id === "nouns")!;
    expect(family.topics.map((t) => t.sectionId)).toContain("ag9");
  });

  it("says so on the map rather than reading as an unwritten topic", () => {
    const s = new Session(new Content(withReading, testProfile));
    const row = s.grammarMap().find((t) => t.sectionId === "ag9")!;
    expect(row.readingOnly).toBe(true);
    expect(row.hasTests).toBe(false);
    expect(row.scheduled).toBe(false);
    expect(row.questions).toBe(0);
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

describe("Session progress: the two errands", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const soon = new Date("2026-01-01T00:30:00Z");

  /** Two topics failed, so two cards are due half an hour later. */
  const withBacklog = () => {
    const s = new Session(new Content(wide, testProfile));
    s.enrolTopic("n1", 1, now);
    s.enrolTopic("n2", 1, now);
    return s;
  };

  it("serves nothing due while exploring, and nothing chosen while reviewing", () => {
    const s = withBacklog();
    expect(s.next(soon, "review")).toEqual({ kind: "topic-review", sectionId: "n1" });
    // A backlog is not a reason to be studying it: exploring serves the topic
    // that was asked for and nothing else.
    s.drillTopic("n3", soon);
    expect(s.next(soon, "explore")).toEqual({ kind: "drill", sectionId: "n3" });
    expect(s.next(soon, "review")).toEqual({ kind: "topic-review", sectionId: "n1" });
  });

  it("says the reviews are cleared rather than quietly picking a topic", () => {
    const s = new Session(new Content(wide, testProfile));
    // Nothing is due and there is a whole book left; both errands say done,
    // because "done" is answered for the errand that was asked and nothing has
    // been chosen to practise.
    expect(s.next(now, "review")).toEqual({ kind: "done" });
    expect(s.next(now, "explore")).toEqual({ kind: "done" });
  });

  it("asks for a topic rather than handing one over", () => {
    /*
     * The whole change, in one assertion. Exploring used to walk a cursor
     * through the book, so it always had a next section and the student never
     * had a say in it. With nothing chosen there is nothing to do — and that
     * is a screen asking which topic, not a book being worked out.
     */
    const s = new Session(new Content(wide, testProfile));
    expect(s.next(now, "explore")).toEqual({ kind: "done" });
    // Even with every topic answered and nothing due, it does not pick one.
    for (const id of ["n1", "n2", "n3", "v1", "v2", "v3"]) {
      s.gradeTopic(id, 4, now);
    }
    expect(s.next(now, "explore")).toEqual({ kind: "done" });

    s.drillTopic("v2", now);
    expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "v2" });
  });

  it("stays on the topic chosen however the answers go", () => {
    // The old walk stepped on after every round, so a topic going badly was
    // exactly the one you were moved off. A run is not a queue: it is where you
    // asked to be, and it takes another choice to leave.
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    for (let i = 0; i < 3; i++) {
      expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "n1" });
      s.gradeTopic("n1", 1, now); // "again", every time
    }
    expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "n1" });
  });

  it("leaves one topic only by being pointed at another", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "n1" });
    s.drillTopic("v3", now);
    expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "v3" });
    expect(s.practiseRun()?.sectionId).toBe("v3");
  });
});

describe("Session progress: practising one topic", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  /** Answer one whole served test, the way the apps do. */
  const round = (s: Session, id: string, at: Date = now) => {
    const test = s.servePractice(id)!;
    for (const q of test.questions) {
      s.recordAttempt(id, { prompt: q.prompt, answer: q.answer, submitted: q.answer, rating: 3 }, at);
      s.gradeTopic(id, 3, at, test.id);
    }
    return test;
  };

  it("serves questions never answered before, rather than rotating tests", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    const asked: string[] = [];
    // Six questions in three tests of two: three rounds to sweep the bank.
    for (let i = 0; i < 3; i++) {
      expect(s.next(now, "explore")).toEqual({ kind: "drill", sectionId: "n1" });
      asked.push(...round(s, "n1").questions.map((q) => q.prompt));
    }
    expect(new Set(asked).size).toBe(6);
    expect(s.coverage("n1")).toEqual({ answered: 6, total: 6 });
  });

  it("stops and says so rather than slipping onto the next topic", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    for (let i = 0; i < 3; i++) round(s, "n1");
    // The student asked to stay here. Moving them on is not the loop's call.
    expect(s.next(now, "explore")).toEqual({ kind: "practised", sectionId: "n1" });
  });

  it("counts the run by what has been answered since it began", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    expect(s.practice("n1")).toEqual({ done: 0, total: 6 });
    round(s, "n1");
    expect(s.practice("n1")).toEqual({ done: 2, total: 6 });
  });

  it("takes the whole bank again on a second run", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    for (let i = 0; i < 3; i++) round(s, "n1");

    // Nothing is unanswered any more, so a fresh run is the whole bank —
    // asking to practise a swept topic can only mean the whole thing again.
    const later = new Date("2026-01-02T00:00:00Z");
    s.drillTopic("n1", later);
    expect(s.practice("n1")).toEqual({ done: 0, total: 6 });
    const second: string[] = [];
    for (let i = 0; i < 3; i++) second.push(round(s, "n1", later).id);
    expect(new Set(second).size).toBe(3);
  });

  it("leads a run with whatever was served longest ago", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    for (let i = 0; i < 3; i++) round(s, "n1");
    expect(s.progress().seenTests.n1).toEqual(["n1-t1", "n1-t2", "n1-t3"]);

    // Abandon a run after one test, so t1 is the most recently served rather
    // than the least — the case that tells "last served" from "first served".
    const later = new Date("2026-01-02T00:00:00Z");
    s.drillTopic("n1", later);
    expect(s.servePractice("n1")?.id).toBe("n1-t1");

    const last = new Date("2026-01-03T00:00:00Z");
    s.drillTopic("n1", last);
    expect(s.servePractice("n1")?.id).toBe("n1-t2");
  });

  it("is not a run at all on a topic with no tests written for it", () => {
    const s = new Session(
      new Content(book(topics("nouns", "n", 2), { grammar: [], tests: {} }), testProfile),
    );
    s.drillTopic("nope", now);
    expect(s.practiseRun()).toBeNull();
    // And nothing is served in its place: a run that cannot be run leaves the
    // student where a run was never asked for, which is being asked to choose.
    expect(s.next(now, "explore")).toEqual({ kind: "done" });
  });
});

describe("Session progress: a round of questions is one review", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("costs the card one rep however many questions the round holds", () => {
    const s = new Session(new Content(wide, testProfile));
    s.enrolTopic("n1", 3, now); // the enrolment is the card's first rep
    for (let i = 0; i < 4; i++) s.gradeTopic("n1", 3, now, "n1-t1");
    expect(s.progress().topicCards.n1!.reps).toBe(2);
  });

  it("costs an unenrolled topic nothing at all, however it is graded", () => {
    // The round still runs and is still worth something — `worst` is what the
    // offer is priced at — but nothing reaches the pile until it is asked for.
    const s = new Session(new Content(wide, testProfile));
    for (let i = 0; i < 4; i++) s.gradeTopic("n1", 3, now, "n1-t1");
    expect(s.progress().topicCards).toEqual({});
    expect(s.roundWorst("n1", "n1-t1")).toBe(3);
  });

  it("schedules the round by its worst grade", () => {
    const s = new Session(new Content(wide, testProfile));
    s.enrolTopic("n1", 3, now);
    s.gradeTopic("n1", 4, now, "r");
    s.gradeTopic("n1", 1, now, "r"); // one failed, so the round failed
    s.gradeTopic("n1", 4, now, "r");

    const alone = new Session(new Content(wide, testProfile));
    alone.enrolTopic("n1", 3, now);
    alone.gradeTopic("n1", 1, now);
    expect(s.progress().topicCards.n1!.due).toBe(alone.progress().topicCards.n1!.due);
  });

  /**
   * The buttons have to promise what pressing them does. They previewed the
   * stored card, which the round's earlier grades have already advanced and
   * which the next grade rewinds past — so from the second question on, every
   * label was an interval the round could no longer reach.
   */
  describe("previewing a grade inside a round", () => {
    /** Where each rating would actually land, by doing it on a copy. */
    const outcomes = (s: Session, roundId: string) =>
      ([1, 2, 3, 4] as const).map((r) => {
        const copy = new Session(
          new Content(wide, testProfile),
          JSON.parse(JSON.stringify(s.progress())),
        );
        copy.gradeTopic("n1", r, now, roundId);
        return copy.progress().topicCards.n1!.due;
      });

    const labels = (s: Session, roundId?: string) => {
      const p = s.previewTopic("n1", now, roundId);
      return [p[1], p[2], p[3], p[4]].map((d) => d.toISOString());
    };

    it("says what each grade does at every question of the round", () => {
      const s = new Session(new Content(wide, testProfile));
      s.enrolTopic("n1", 3, now);
      for (const grade of [3, 3, 1] as const) {
        expect(labels(s, "r")).toEqual(outcomes(s, "r"));
        s.gradeTopic("n1", grade, now, "r");
      }
      expect(labels(s, "r")).toEqual(outcomes(s, "r"));
    });

    it("floors every button at the worst grade the round has had", () => {
      const s = new Session(new Content(wide, testProfile));
      s.gradeTopic("n1", 1, now, "r");
      // The round is lost, so nothing left to press can buy anything back.
      const p = s.previewTopic("n1", now, "r");
      expect(new Set([p[1], p[2], p[3], p[4]].map((d) => +d)).size).toBe(1);
    });

    it("previews the stored card when no round is named", () => {
      const s = new Session(new Content(wide, testProfile));
      s.enrolTopic("n1", 3, now);
      s.gradeTopic("n1", 3, now, "r");
      // A verdict outside a round rates what is on disk, and previews it too.
      expect(labels(s)).toEqual(outcomes(new Session(
        new Content(wide, testProfile),
        JSON.parse(JSON.stringify({ ...s.progress(), openRound: null })),
      ), "unrelated"));
    });

    it("ignores a round that is not the one being asked about", () => {
      const s = new Session(new Content(wide, testProfile));
      s.gradeTopic("n1", 1, now, "r");
      // A different test is a different round: it starts from the card on disk.
      expect(labels(s, "other")).toEqual(labels(s));
    });

    it("reports the worst grade so far, so a UI can say why the four agree", () => {
      const s = new Session(new Content(wide, testProfile));
      expect(s.roundWorst("n1", "r")).toBeNull();
      s.gradeTopic("n1", 3, now, "r");
      expect(s.roundWorst("n1", "r")).toBe(3);
      s.gradeTopic("n1", 1, now, "r");
      expect(s.roundWorst("n1", "r")).toBe(1);
      expect(s.roundWorst("n1", "other")).toBeNull();
    });
  });

  it("starts a new round on a new test, building on the last one", () => {
    const s = new Session(new Content(wide, testProfile));
    s.enrolTopic("n1", 3, now);
    s.gradeTopic("n1", 3, now, "n1-t1");
    s.gradeTopic("n1", 3, now, "n1-t1");
    s.gradeTopic("n1", 3, now, "n1-t2");
    expect(s.progress().topicCards.n1!.reps).toBe(3);
  });

  it("rates per grade when no round is named, which is what a probe wants", () => {
    const s = new Session(new Content(wide, testProfile));
    s.enrolTopic("n1", 3, now);
    for (let i = 0; i < 4; i++) s.gradeTopic("n1", 3, now);
    expect(s.progress().topicCards.n1!.reps).toBe(5);
    expect(s.progress().openRound).toBeNull();
  });

  it("leaves one rep behind when a round on an enrolled topic is abandoned halfway", () => {
    const s = new Session(new Content(wide, testProfile));
    s.enrolTopic("n1", 3, now);
    s.gradeTopic("n1", 3, now, "n1-t1");
    s.gradeTopic("n1", 3, now, "n1-t1");
    // As if the terminal were closed here.
    const back = new Session(new Content(wide, testProfile), JSON.parse(JSON.stringify(s.progress())));
    expect(back.progress().topicCards.n1!.reps).toBe(2);
  });

  it("leaves nothing behind when a round on an unenrolled topic is abandoned", () => {
    /*
     * The strongest case for asking rather than assuming. A round somebody
     * opened, answered twice and wandered away from is the least evidence there
     * is that they want the topic coming back at them for the next five years,
     * and it used to be the surest way to get it.
     */
    const s = new Session(new Content(wide, testProfile));
    s.gradeTopic("n1", 3, now, "n1-t1");
    s.gradeTopic("n1", 3, now, "n1-t1");
    const back = new Session(new Content(wide, testProfile), JSON.parse(JSON.stringify(s.progress())));
    expect(back.progress().topicCards).toEqual({});
  });

  /**
   * A test used to live entirely in the screen's own state, so anything that
   * ended the page put the student back at question one of a different test.
   */
  describe("picking a round back up", () => {
    const start = (isNew = false, enrolled = false) => {
      const s = new Session(new Content(wide, testProfile));
      // Before the round opens, or `cardBefore` snapshots the absence and the
      // round rewinds to a fresh card rather than to the enrolled one.
      if (enrolled) s.enrolTopic("n1", 3, now);
      const test = s.serveTest("n1")!;
      s.beginRound("n1", test, isNew);
      return { s, test };
    };

    it("opens when the test is served, before anything has been graded", () => {
      const { s, test } = start(true);
      const open = s.resumableRound()!;
      expect(open.qIndex).toBe(0);
      expect(open.isNew).toBe(true);
      expect(open.test).toBe(test);
      expect(s.progress().openRound!.worst).toBeNull();
    });

    it("comes back to the same test, without spending a rotation slot", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      const seen = [...s.progress().seenTests.n1!];

      // As if the app had been swiped away and opened again.
      const back = new Session(
        new Content(wide, testProfile),
        JSON.parse(JSON.stringify(s.progress())),
      );
      const open = back.resumableRound()!;
      expect(open.sectionId).toBe("n1");
      expect(open.test.id).toBe(test.id);
      expect(open.qIndex).toBe(1); // the second of the two, not the first
      // Re-serving would both re-roll the test and record it again.
      expect(back.progress().seenTests.n1).toEqual(seen);
    });

    it("holds the card at one rep however the round is picked up", () => {
      const { s, test } = start(false, true);
      s.gradeTopic("n1", 3, now, test.id);
      s.gradeTopic("n1", 1, now, test.id);
      expect(s.progress().topicCards.n1!.reps).toBe(2);
      expect(s.progress().openRound!.worst).toBe(1); // the worst of the two
      expect(s.progress().openRound!.answered).toBe(2);
    });

    it("lets go once the last question is graded", () => {
      const { s, test } = start();
      for (const _ of test.questions) s.gradeTopic("n1", 3, now, test.id);
      // Every question answered: there is nothing to come back to, even though
      // the round is still on file for the card's sake.
      expect(s.resumableRound()).toBeNull();
      s.endRound();
      expect(s.progress().openRound).toBeNull();
    });

    it("says nothing about a test this bundle no longer carries", () => {
      const { s } = start();
      s.progress().openRound!.roundId = "n1-t99";
      expect(s.resumableRound()).toBeNull();
    });

    it("keeps the answer being written, and drops it once it is graded", () => {
      const { s, test } = start();
      s.setDraft({ input: "half a sen", marks: { answer: { 0: 1 } } });
      // Deliberately not `touch`ed: a keystroke is not progress to push.
      const stamp = s.progress().updatedAt;
      expect(s.resumableRound()!.draft).toEqual({
        input: "half a sen",
        marks: { answer: { 0: 1 } },
      });
      expect(s.progress().updatedAt).toBe(stamp);

      s.gradeTopic("n1", 3, now, test.id);
      expect(s.resumableRound()!.draft).toBeUndefined();
    });

    it("remembers what asked for the round, so a reload still says", () => {
      const s = new Session(new Content(wide, testProfile));
      const test = s.serveTest("n1")!;
      s.beginRound("n1", test, false, "drill");
      s.gradeTopic("n1", 3, now, test.id);

      const back = new Session(
        new Content(wide, testProfile),
        JSON.parse(JSON.stringify(s.progress())),
      );
      // Without this a resumed drill and a resumed review are the same four
      // sentences on the same topic, and were shown as such.
      expect(back.resumableRound()!.via).toBe("drill");
    });

    it("reads a round written before rounds said why as what it was shown as", () => {
      const { s } = start(true);
      const legacy = JSON.parse(JSON.stringify(s.progress()));
      delete legacy.openRound.via;

      const back = new Session(new Content(wide, testProfile), legacy);
      expect(back.resumableRound()!.via).toBe("new");
    });

    it("drops a round stored before it recorded where the student was", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      const legacy = JSON.parse(JSON.stringify(s.progress()));
      delete legacy.openRound.answered; // as an older file on disk would be
      delete legacy.openRound.isNew;

      const back = new Session(new Content(wide, testProfile), legacy);
      expect(back.progress().openRound).toBeNull();
      expect(back.resumableRound()).toBeNull();
    });
  });

  describe("putting a round down and coming back to it", () => {
    /** A round in flight on `n1`, enrolled so it has a card to hold. */
    const start = (via: RoundVia = "review", section = "n1") => {
      const s = new Session(new Content(wide, testProfile));
      s.enrolTopic(section, 3, now);
      // A practice round is only ever picked back up while the run it belongs
      // to is the run in flight, so a drill needs one to have been chosen.
      if (via === "drill") s.drillTopic(section, now);
      const test = s.serveTest(section)!;
      s.beginRound(section, test, false, via);
      return { s, test };
    };

    it("puts a round with questions left down under its errand", () => {
      const { s } = start();
      s.suspendRound();
      expect(s.progress().openRound).toBeNull();
      expect(s.parkedRound("review")).not.toBeNull();
      // The other errand put nothing down, and must not answer for this one.
      expect(s.parkedRound("explore")).toBeNull();
    });

    it("files a practice round under exploring rather than under reviewing", () => {
      const { s } = start("drill");
      s.suspendRound();
      expect(s.parkedRound("explore")).not.toBeNull();
      expect(s.parkedRound("review")).toBeNull();
    });

    it("ends a round whose last question is graded rather than putting it down", () => {
      const { s, test } = start();
      for (const _ of test.questions) s.gradeTopic("n1", 3, now, test.id);
      // Still on file, so the landing can still make its offer.
      expect(s.landedRound(now)).not.toBeNull();
      s.suspendRound();
      expect(s.progress().openRound).toBeNull();
      expect(s.parkedRound("review")).toBeNull();
      expect(s.parkedRound("explore")).toBeNull();
    });

    it("comes back to the same question, with the sentence still being written", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      s.setDraft({ input: "half a sentence" });
      s.suspendRound();

      const back = s.resumeRound("review")!;
      expect(back.qIndex).toBe(1);
      expect(back.test.id).toBe(test.id);
      expect(back.draft!.input).toBe("half a sentence");
      // Back in flight, which is the half that matters: a grade writes to
      // `openRound` and to nothing else.
      expect(s.progress().openRound!.roundId).toBe(test.id);
      expect(s.parkedRound("review")).toBeNull();
    });

    it("keeps a review and a run at once, each at its own question", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      s.suspendRound();

      s.enrolTopic("n2", 3, now);
      s.drillTopic("n2", now);
      const drill = s.serveTest("n2")!;
      s.beginRound("n2", drill, false, "drill");
      s.suspendRound();

      expect(s.resumeRound("review")!.test.id).toBe(test.id);
      expect(s.parkedRound("explore")!.test.id).toBe(drill.id);
    });

    it("holds the card at one rep across being put down and picked up", () => {
      const { s, test } = start();
      const enrolled = s.progress().topicCards.n1!.reps;
      s.gradeTopic("n1", 2, now, test.id);
      s.suspendRound();
      s.resumeRound("review");
      s.gradeTopic("n1", 4, now, test.id);
      // One rep for the round, whatever it was interrupted by — and priced at
      // the worst answer in it, which is what `cardBefore` is rewound for.
      expect(s.progress().topicCards.n1!.reps).toBe(enrolled + 1);
    });

    it("spends no rotation slot on the way back", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      const seen = [...s.progress().seenTests.n1!];
      const cycle = { ...s.progress().testCycles.n1! };
      s.suspendRound();
      expect(s.resumeRound("review")!.test.id).toBe(test.id);
      expect(s.progress().seenTests.n1).toEqual(seen);
      expect(s.progress().testCycles.n1).toEqual(cycle);
    });

    it("drops what was put down when a fresh round opens on the same topic", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      s.suspendRound();
      // The same topic served again: two rounds holding one card is the stale
      // park the rule exists to prevent.
      s.beginRound("n1", s.serveTest("n1")!, false, "drill");
      expect(s.parkedRound("review")).toBeNull();
    });

    it("drops what was put down when its topic is dismissed", () => {
      const { s } = start();
      s.suspendRound();
      s.dismissTopic("n1");
      expect(s.parkedRound("review")).toBeNull();
    });

    it("drops what was put down when its topic is enrolled", () => {
      const s = new Session(new Content(wide, testProfile));
      const test = s.serveTest("n1")!;
      s.beginRound("n1", test, false, "review");
      s.suspendRound();
      // `cardBefore` on that round is the absence of a card; enrolling makes
      // one, and resuming would rewind it to a fresh card.
      s.enrolTopic("n1", 3, now);
      expect(s.parkedRound("review")).toBeNull();
    });

    it("drops the run put down once another topic is chosen to practise", () => {
      const { s } = start("drill");
      s.suspendRound();
      expect(s.parkedRound("explore")).not.toBeNull();

      s.drillTopic("n2", now);
      expect(s.parkedRound("explore")).toBeNull();
      expect(s.progress().suspended?.explore).toBeUndefined();
    });

    it("drops the run put down even when the topic chosen is the same one", () => {
      // Choosing a topic means a fresh run of its whole bank, so it is a
      // decision to leave rather than an interruption — and the topic being the
      // one already practised does not make it an interruption either.
      const { s } = start("drill");
      s.suspendRound();
      s.drillTopic("n1", now);
      expect(s.parkedRound("explore")).toBeNull();
    });

    it("leaves the round in flight to the loop, so recording a run cannot cost one", () => {
      // `drillTopic` records the run and stops there. A caller that only wants
      // a run recorded — a screen arriving on a topic, a test setting a scene —
      // must not lose a stored round by saying so.
      const { s, test } = start("drill");
      s.drillTopic("n1", now);
      expect(s.resumableRound()!.test.id).toBe(test.id);
    });

    it("keeps the review it was called away from, which is the whole of the die", () => {
      const { s, test } = start("review");
      s.gradeTopic("n1", 3, now, test.id);
      s.suspendRound();
      // The die rolls a topic and practises it. The review must survive that.
      s.drillTopic("n2", now);
      expect(s.parkedRound("review")!.test.id).toBe(test.id);
    });

    it("says nothing about a round naming a test this bundle no longer carries", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      s.suspendRound();
      const stored = JSON.parse(JSON.stringify(s.progress()));
      stored.suspended.review.roundId = "gone";

      const back = new Session(new Content(wide, testProfile), stored);
      expect(back.parkedRound("review")).toBeNull();
      // And it is let go of rather than left in the way of the next one.
      expect(back.resumeRound("review")).toBeNull();
      expect(back.progress().suspended?.review).toBeUndefined();
    });

    it("survives being written out and read back", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      s.setDraft({ input: "kept" });
      s.suspendRound();

      const back = new Session(
        new Content(wide, testProfile),
        JSON.parse(JSON.stringify(s.progress())),
      );
      const round = back.resumeRound("review")!;
      expect(round.qIndex).toBe(1);
      expect(round.test.id).toBe(test.id);
      expect(round.draft!.input).toBe("kept");
    });

    it("writes nothing for a file that never put a round down", () => {
      const s = new Session(new Content(wide, testProfile));
      expect(s.progress().suspended).toBeUndefined();
      expect(s.parkedRound("review")).toBeNull();
      expect(s.resumeRound("explore")).toBeNull();
    });

    it("drops a round put down before it recorded where the student was", () => {
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      s.suspendRound();
      const legacy = JSON.parse(JSON.stringify(s.progress()));
      delete legacy.suspended.review.answered;

      const back = new Session(new Content(wide, testProfile), legacy);
      expect(back.progress().suspended?.review).toBeUndefined();
    });

    it("reads a round put down before rounds said why as what it was shown as", () => {
      const { s, test } = start("drill");
      s.gradeTopic("n1", 3, now, test.id);
      s.suspendRound();
      const legacy = JSON.parse(JSON.stringify(s.progress()));
      delete legacy.suspended.explore.via;

      const back = new Session(new Content(wide, testProfile), legacy);
      expect(back.parkedRound("explore")!.via).toBe("review");
    });

    it("takes a park back with the undo of the grade it was taken beside", () => {
      const { s, test } = start();
      const before = s.snapshot();
      s.gradeTopic("n1", 3, now, test.id);
      s.suspendRound();
      expect(s.parkedRound("review")).not.toBeNull();

      s.restore(before);
      expect(s.parkedRound("review")).toBeNull();
      expect(s.resumableRound()!.qIndex).toBe(0);
    });
  });

  it("takes an undo back across a round's earlier questions", () => {
    const s = new Session(new Content(wide, testProfile));
    s.enrolTopic("n1", 3, now);
    s.gradeTopic("n1", 4, now, "n1-t1");
    const before = s.snapshot();
    s.gradeTopic("n1", 1, now, "n1-t1"); // the round now stands at 'again'
    const failed = s.progress().topicCards.n1!.due;

    s.restore(before);
    expect(s.progress().topicCards.n1!.due).not.toBe(failed);
    // Re-grading from the restored point counts once, not twice.
    s.gradeTopic("n1", 1, now, "n1-t1");
    expect(s.progress().topicCards.n1!.due).toBe(failed);
    expect(s.progress().topicCards.n1!.reps).toBe(2);
  });
});

/**
 * What the screen that stands still between rounds reads.
 *
 * One fact that has to agree with `gradeTopic`'s own arithmetic — when the card
 * the round wrote brings the topic back — and one rule that keeps the whole
 * thing off a screen it does not belong on.
 */
/**
 * A round shorter than the test it is served from.
 *
 * Four questions on one topic is a real reason to put the phone down, and the
 * alternative to a shorter round is not a longer one but no round at all. The
 * cap only ever takes questions out: a round is one test, which is what makes
 * it one review of the topic rather than four.
 */
describe("a round shorter than its test", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  /** One topic, one test, two questions — so the window is the only variable. */
  const short = book(topics("nouns", "s", 1, 1));

  /** Answer whatever the round holds, the way both apps do. */
  const answer = (s: Session, test: Test, at: Date) => {
    for (const q of test.questions) {
      s.recordAttempt("s1", { prompt: q.prompt, answer: q.answer, submitted: q.answer, rating: 3 }, at);
      s.gradeTopic("s1", 3, at, test.id);
    }
  };

  it("hands over the whole test when nobody has asked for less", () => {
    const s = new Session(new Content(short, testProfile));
    expect(s.questionsPerRound()).toBe(0);
    expect(s.serveReview("s1")!.questions).toHaveLength(2);
  });

  it("hands over as many as were asked for, under the test's own id", () => {
    const s = new Session(new Content(short, testProfile));
    s.setQuestionsPerRound(1);
    const test = s.serveReview("s1")!;
    expect(test.questions).toHaveLength(1);
    // The id is what files the round against the topic's card. A short round is
    // still one round of that test, so it must not be renamed.
    expect(test.id).toBe("s1-t1");
  });

  it("is stored as no cap when it is not shorter than anything", () => {
    // A number a regenerated bank could quietly turn into a truncation is not
    // worth writing down, and "all of them" already has a spelling.
    const s = new Session(new Content(short, testProfile));
    s.setQuestionsPerRound(0);
    expect(s.progress().questionsPerRound).toBeUndefined();
  });

  it("lands the round on its own last question rather than the test's", () => {
    const s = new Session(new Content(short, testProfile));
    s.setQuestionsPerRound(1);
    const test = s.serveReview("s1")!;
    s.beginRound("s1", test);
    expect(s.landedRound()).toBeNull();
    answer(s, test, now);
    // One question in, and the round is over — where without the window it
    // would sit at one of two for ever, waiting on a question nobody was shown.
    expect(s.landedRound()?.sectionId).toBe("s1");
  });

  it("puts the same one question back after a reload", () => {
    const s = new Session(new Content(short, testProfile));
    s.setQuestionsPerRound(1);
    const test = s.serveReview("s1")!;
    s.beginRound("s1", test);

    const reopened = new Session(new Content(short, testProfile), s.progress());
    const open = reopened.resumableRound()!;
    expect(open.qIndex).toBe(0);
    expect(open.test.questions.map((q) => q.prompt)).toEqual(
      test.questions.map((q) => q.prompt),
    );
  });

  it("hands over the half it stopped short of when the test comes round again", () => {
    // The promise `TestCycle` makes — every question arrives before any of them
    // arrives twice — kept at the question level rather than the test's.
    const s = new Session(new Content(short, testProfile));
    s.setQuestionsPerRound(1);
    const first = s.serveReview("s1")!;
    answer(s, first, now);
    const second = s.serveReview("s1")!;
    expect(second.questions[0]!.prompt).not.toBe(first.questions[0]!.prompt);
  });

  it("still works a practice run out, on a topic already swept", () => {
    /*
     * The regression this exists for, and it is a loop rather than a leak.
     * A run serves whichever test still holds questions it has not reached and
     * stops when none does. Take the *first* question of every test and a run
     * over a topic where everything has been answered once can never reach the
     * second: the same sentence comes back for ever and `practised` is a screen
     * nobody sees.
     */
    const s = new Session(new Content(short, testProfile));
    s.setQuestionsPerRound(1);
    s.drillTopic("s1", now);
    answer(s, s.servePractice("s1")!, now);
    answer(s, s.servePractice("s1")!, new Date("2026-01-01T00:01:00Z"));
    expect(s.next(now, "explore")).toEqual({ kind: "practised", sectionId: "s1" });

    // And again on a second run over the swept topic, which is the case that
    // has no never-answered question to lead with.
    const later = new Date("2026-02-01T00:00:00Z");
    s.drillTopic("s1", later);
    expect(s.practice("s1")).toEqual({ done: 0, total: 2 });
    answer(s, s.servePractice("s1")!, later);
    answer(s, s.servePractice("s1")!, new Date("2026-02-01T00:01:00Z"));
    expect(s.next(later, "explore")).toEqual({ kind: "practised", sectionId: "s1" });
  });

  it("is not taken back by an undo, as no standing preference is", () => {
    const s = new Session(new Content(short, testProfile));
    const before = s.snapshot();
    s.setQuestionsPerRound(1);
    s.restore(before);
    expect(s.questionsPerRound()).toBe(1);
  });
});

describe("the round a screen lands on", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  /** A round of `wide`'s two-question tests, open on `n1`. */
  const opened = () => {
    const s = new Session(new Content(wide, testProfile));
    const test = s.serveTest("n1")!;
    s.beginRound("n1", test, true, "new");
    return { s, roundId: test.id };
  };

  it("names the topic that was worked on and says nothing about the grades", () => {
    // It carried a mastery score and the one before it too, so the card could
    // draw four cells and mark the one this round moved. That is gone with the
    // score, and what is left is deliberately the whole of it: which topic, and
    // when it comes back.
    const { s, roundId } = opened();
    s.gradeTopic("n1", 3, now, roundId);
    s.gradeTopic("n1", 3, now, roundId);
    const landed = s.landedRound()!;
    expect(landed.sectionId).toBe("n1");
    expect(landed).not.toHaveProperty("mastery");
    expect(landed).not.toHaveProperty("masteryBefore");
  });

  it("says nothing has landed until the round's last question is graded", () => {
    const { s, roundId } = opened();
    expect(s.landedRound()).toBeNull();
    s.gradeTopic("n1", 3, now, roundId);
    expect(s.landedRound()).toBeNull();
    s.gradeTopic("n1", 3, now, roundId);
    expect(s.landedRound()).not.toBeNull();
  });

  it("reports when the card the round wrote brings the topic back", () => {
    const { s, roundId } = opened();
    s.enrolTopic("n1", 3, now);
    s.gradeTopic("n1", 3, now, roundId);
    s.gradeTopic("n1", 3, now, roundId);
    const landed = s.landedRound(now)!;
    expect(landed.scheduled).toBe(true);
    expect(landed.due.toISOString()).toBe(s.progress().topicCards.n1!.due);
  });

  it("offers a date for a topic that is not in the pile, and honours it", () => {
    /*
     * The load-bearing agreement of the whole opt-in. The screen has to quote
     * an interval *before* the student decides, so what it quotes is what
     * enrolling would buy — the round's own worst grade on a fresh card. Quote
     * one number and write another and the offer is a lie, which is the same
     * failure the grade-button labels are built to avoid.
     */
    const { s, roundId } = opened();
    s.gradeTopic("n1", 3, now, roundId);
    s.gradeTopic("n1", 3, now, roundId);

    const landed = s.landedRound(now)!;
    expect(landed.scheduled).toBe(false);
    expect(s.progress().topicCards).toEqual({});

    s.enrolTopic("n1", undefined, now);
    expect(s.progress().topicCards.n1!.due).toBe(landed.due.toISOString());
    expect(s.landedRound(now)!.scheduled).toBe(true);
  });

  it("falls back to a neutral grade with no round open, which is what Practised offers", () => {
    /*
     * The second place the offer is made, and the one whose agreement is a
     * coincidence of call order rather than a stated rule.
     *
     * `Practised` — the screen a drained run stops on — is reached through
     * `advance`, which ends the round first. So there is no `worst` to price
     * from and `enrolRating` falls back to 3, which is exactly what the screen
     * previews with `previewTopic(id)[3]`. Asserted here so that reordering the
     * launch or advance path cannot silently make the quoted interval and the
     * written card two different numbers.
     */
    // No round open at all, so the preview is the neutral one…
    const s = new Session(new Content(wide, testProfile));
    expect(s.progress().openRound).toBeNull();
    const quoted = s.previewTopic("n1", now)[3];

    // …and it is what enrolling writes.
    s.enrolTopic("n1", undefined, now);
    expect(s.progress().topicCards.n1!.due).toBe(quoted.toISOString());
  });

  it("prices the offer at the round's worst grade, not its last", () => {
    const { s, roundId } = opened();
    s.gradeTopic("n1", 1, now, roundId);
    s.gradeTopic("n1", 4, now, roundId); // the round is already lost

    const landed = s.landedRound(now)!;
    const failed = new Session(new Content(wide, testProfile));
    failed.enrolTopic("n1", 1, now);
    expect(landed.due.toISOString()).toBe(failed.progress().topicCards.n1!.due);
  });

  it("has nothing to report for a grade given outside a round", () => {
    // The rule that keeps this off a vocabulary card and off the pass-over
    // grade a topic with no tests takes: neither opens a round, so neither has
    // anything to land on. Written as a condition rather than as a list, so the
    // next kind of single-question grade needs no line for it.
    const s = new Session(new Content(wide, testProfile));
    s.gradeTopic("n1", 3, now);
    expect(s.landedRound()).toBeNull();
  });

  it("has nothing to report once the topic is out of the review pile", () => {
    // Dismissing takes the round with the card, so there is no round to land
    // on — which is right: the card the landing would report is gone, and so is
    // the offer, since there is no longer a round to price one from.
    const { s, roundId } = opened();
    s.enrolTopic("n1", 3, now);
    s.gradeTopic("n1", 3, now, roundId);
    s.gradeTopic("n1", 3, now, roundId);
    expect(s.landedRound()).not.toBeNull();
    s.dismissTopic("n1");
    expect(s.landedRound()).toBeNull();
  });

  it("takes the landing back with the grade that reached it", () => {
    const { s, roundId } = opened();
    s.gradeTopic("n1", 3, now, roundId);
    const before = s.snapshot();
    s.gradeTopic("n1", 3, now, roundId);
    expect(s.landedRound()).not.toBeNull();
    s.restore(before);
    expect(s.landedRound()).toBeNull();
  });

  it("keeps the book a round was read in across its grades", () => {
    // The openRound literal is rewritten from scratch on every grade, so
    // anything the round knows and is not carried is lost on its first one.
    // This one was: a round opened in a further grammar resumed in the primary.
    const { s, roundId } = opened();
    s.progress().openRound!.viewedAs = "elsewhere";
    s.gradeTopic("n1", 3, now, roundId);
    expect(s.progress().openRound?.viewedAs).toBe("elsewhere");
    s.gradeTopic("n1", 3, now, roundId);
    expect(s.landedRound()?.viewedAs).toBe("elsewhere");
  });
});

/**
 * The rarest thing the app has to say, and the reason it can be said honestly
 * to a student who has been reading for a year: it is read back out of the
 * attempt trail rather than counted forward from the day the feature shipped.
 */
describe("meeting an author for the first time", () => {
  const cicero = { author: "Cicero", work: "de Officiis", locus: "i, 2" };
  const quoting: ContentData = {
    grammar: [
      { id: "q1", ref: "1", title: "Quoted", family: "nouns", text: "…", order: 1 },
    ],
    tests: {
      q1: [
        {
          id: "q1-t1",
          sectionId: "q1",
          questions: [
            { prompt: "one", answer: "a", kind: "parse", vocab: [], source: cicero },
            { prompt: "two", answer: "b", kind: "parse", vocab: [], source: cicero },
            { prompt: "three", answer: "c", kind: "parse", vocab: [] },
          ],
        },
      ],
    },
  };
  const at = (i: number) => quoting.tests.q1![0]!.questions[i]!;
  const fresh = () => new Session(new Content(quoting, testProfile));

  it("names the author on the first question of theirs ever answered", () => {
    expect(fresh().meetAuthor(at(0))).toBe("Cicero");
  });

  it("says nothing the second time, or on a second question by the same author", () => {
    const s = fresh();
    expect(s.meetAuthor(at(0))).toBe("Cicero");
    expect(s.meetAuthor(at(0))).toBeUndefined();
    expect(s.meetAuthor(at(1))).toBeUndefined();
  });

  it("says nothing about a question nobody is credited for", () => {
    expect(fresh().meetAuthor(at(2))).toBeUndefined();
  });

  it("says nothing to a student whose trail already holds one", () => {
    // The whole back-compatibility of this: a returning student is not
    // congratulated in an update for a Cicero they met last year. A stored set
    // could only have started empty and would have said this for every author.
    const s = fresh();
    s.recordAttempt("q1", { prompt: "one", answer: "a", submitted: "a", rating: 3 });
    expect(s.meetAuthor(at(1))).toBeUndefined();
  });

  it("keeps the meeting on the round, so it is still the news four questions on", () => {
    const s = fresh();
    s.beginRound("q1", quoting.tests.q1![0]!, true, "new");
    s.meetAuthor(at(0));
    s.gradeTopic("q1", 3, new Date(), "q1-t1");
    s.gradeTopic("q1", 3, new Date(), "q1-t1");
    s.gradeTopic("q1", 3, new Date(), "q1-t1");
    expect(s.landedRound()?.met).toEqual(["Cicero"]);
  });

  it("forgets what it derived when a grade is taken back", () => {
    // An undo can take back the very attempt that first met somebody.
    const s = fresh();
    const before = s.snapshot();
    s.recordAttempt("q1", { prompt: "one", answer: "a", submitted: "a", rating: 3 });
    expect(s.meetAuthor(at(1))).toBeUndefined();
    s.restore(before);
    expect(s.meetAuthor(at(1))).toBe("Cicero");
  });
});

describe("exploring only what somebody wrote", () => {
  const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
  /**
   * `q1` holds two quoted tests and two generated ones, `q2` only generated.
   * Two quoted tests are the minimum that can show the rotation reset staying
   * inside the filter, which is the bug this preference is one line away from.
   */
  const quoted: ContentData = {
    ...fixture,
    grammar: [
      { id: "q1", ref: "1", title: "First", family: "nouns", text: "...", order: 1 },
      { id: "q2", ref: "2", title: "Second", family: "nouns", text: "...", order: 2 },
    ],
    tests: {
      q1: [
        { id: "q1-t1", sectionId: "q1", questions: [{ prompt: "a?", answer: "a", kind: "parse", vocab: [] }] },
        { id: "q1-t2", sectionId: "q1", questions: [{ prompt: "b?", answer: "b", kind: "parse", vocab: [] }] },
        { id: "q1-q1", sectionId: "q1", questions: [{ prompt: "c?", answer: "c", kind: "parse", vocab: [], source: cite }] },
        { id: "q1-q2", sectionId: "q1", questions: [{ prompt: "d?", answer: "d", kind: "parse", vocab: [], source: cite }] },
      ],
      q2: [
        { id: "q2-t1", sectionId: "q2", questions: [{ prompt: "e?", answer: "e", kind: "parse", vocab: [] }] },
      ],
    },
  };
  const session = () => new Session(new Content(quoted, testProfile));

  it("serves everything until a student says otherwise", () => {
    const s = session();
    expect(s.quotedOnly()).toBe(false);
    expect(s.progress().quotedOnly).toBeUndefined();
    const served = new Set<string>();
    for (let i = 0; i < 8; i++) served.add(s.serveTest("q1")!.id);
    expect(served.size).toBe(4);
  });

  it("serves only quoted tests when asked, however long the rotation runs", () => {
    const s = session();
    s.setQuotedOnly(true);
    // Well past the two quoted tests, so the seen-rotation resets several
    // times. A filter applied after that reset would leak a generated test
    // here, and the count below is what would catch it.
    const served = new Set<string>();
    for (let i = 0; i < 20; i++) served.add(s.serveTest("q1", true)!.id);
    expect([...served].sort()).toEqual(["q1-q1", "q1-q2"]);
  });

  it("serves review the whole bank until a student says otherwise", () => {
    const s = session();
    const served = new Set<string>();
    for (let i = 0; i < 12; i++) served.add(s.serveReview("q1")!.id);
    expect(served.size).toBe(4);
  });

  it("brings a due topic back on a quotation when it has any", () => {
    const s = session();
    s.setQuotedOnly(true);
    // Well past the two quoted tests, so the cycle rolls several times: a
    // review that fell through to the fallback on the roll would leak a
    // generated test here.
    const served = new Set<string>();
    for (let i = 0; i < 20; i++) served.add(s.serveReview("q1")!.id);
    expect([...served].sort()).toEqual(["q1-q1", "q1-q2"]);
  });

  it("brings one back on a written question rather than not at all", () => {
    const s = session();
    s.setQuotedOnly(true);
    // Nothing quoted for q2, and its card is due. Exploring steps over such a
    // topic and loses nothing by it; a review that stepped over it would leave
    // the card due for ever and the queue naming it for ever.
    expect(s.serveTest("q2", true)).toBeUndefined();
    expect(s.serveReview("q2")!.id).toBe("q2-t1");
  });

  it("leaves the cycle where it stood when the narrow call declines", () => {
    const s = session();
    s.setQuotedOnly(true);
    // The declined call must return above the cycle rather than write a
    // rotation of its own: one serve is one step, not two, so nothing is
    // skipped on a topic served entirely by the fallback.
    s.serveReview("q2");
    expect(s.progress().testCycles.q2).toEqual({ seed: expect.any(Number), at: 1 });
  });

  it("says nothing rather than something generated, and owns up to having tests", () => {
    const s = session();
    s.setQuotedOnly(true);
    expect(s.serveTest("q2", true)).toBeUndefined();
    // The caller tells "nothing quoted here" from "nothing here" by this, and
    // grades only the second — a topic filtered away was never seen.
    expect(s.hasTests("q2")).toBe(true);
  });

  it("keeps the preference through an undo", () => {
    const s = session();
    const before = s.snapshot();
    s.setQuotedOnly(true);
    s.restore(before);
    expect(s.quotedOnly()).toBe(true);
  });

  it("counts the topic by what it will actually be asked", () => {
    const s = session();
    expect(s.coverage("q1")).toEqual({ answered: 0, total: 4 });
    s.setQuotedOnly(true);
    // Two of q1's four questions are quoted, and the count is the reason to
    // go there — a bank of four beside a topic that will only ever ask two is
    // how a student picks the wrong topic to practise.
    expect(s.coverage("q1")).toEqual({ answered: 0, total: 2 });
  });

  it("counts an answer only against the bank it is still part of", () => {
    const s = session();
    const at = new Date("2026-01-01T00:00:00Z");
    s.recordAttempt("q1", { prompt: "a?", answer: "a", submitted: "a", rating: 3 }, at);
    s.recordAttempt("q1", { prompt: "c?", answer: "c", submitted: "c", rating: 3 }, at);
    expect(s.coverage("q1")).toEqual({ answered: 2, total: 4 });
    s.setQuotedOnly(true);
    // "a?" was generated: it is no longer one of the questions being counted,
    // so it cannot go on being one of the ones answered. 1/2, not 2/2.
    expect(s.coverage("q1")).toEqual({ answered: 1, total: 2 });
  });

  it("tells a topic with nothing quoted from one with nothing written", () => {
    const s = session();
    s.setQuotedOnly(true);
    const map = s.grammarMap(new Date("2026-01-01T00:00:00Z"));
    const q2 = map.find((t) => t.sectionId === "q2")!;
    // Zero questions and yet tests written: the pair says "nothing quoted
    // here", which is what the index has to word differently from "nothing
    // written here" — the second is not coming back when the preference does.
    expect(q2.questions).toBe(0);
    expect(q2.hasTests).toBe(true);
  });
});

/**
 * The order a topic hands its tests over in.
 *
 * Eighteen tests in one section, because the interesting number is bigger than
 * the ten ids `seenTests` remembers: the rotation this replaced could not tell
 * whether a topic of ninety tests had been worked through, and a topic of
 * ninety tests holding sixty-four quotations is the shipped case this is for.
 */
describe("quoted first, then the rest, then shuffled again", () => {
  const cite = { author: "Caesar", work: "de Bello Gallico", locus: "i, 1" };
  const test = (id: string, quoted: boolean) => ({
    id,
    sectionId: "big",
    questions: [
      {
        prompt: `${id}?`,
        answer: id,
        kind: "parse",
        vocab: [],
        ...(quoted ? { source: cite } : {}),
      },
    ],
  });
  const QUOTED = Array.from({ length: 12 }, (_, i) => `big-q${i + 1}`);
  const WRITTEN = Array.from({ length: 6 }, (_, i) => `big-t${i + 1}`);
  const wide: ContentData = {
    ...fixture,
    grammar: [
      { id: "big", ref: "1", title: "Big", family: "nouns", text: "...", order: 1 },
    ],
    // Interleaved in the bundle, so an order that came out quoted-first cannot
    // have come from the order they were written in.
    tests: {
      big: [
        ...WRITTEN.map((id) => test(id, false)),
        ...QUOTED.map((id) => test(id, true)),
      ].sort((a, b) => a.id.localeCompare(b.id)),
    },
  };
  const session = (p = emptyProgress()) => new Session(new Content(wide, testProfile), p);
  const serve = (s: Session, n: number, quotedOnly = false) =>
    Array.from({ length: n }, () => s.serveTest("big", quotedOnly)!.id);

  it("hands over every quotation before any written question, and each once", () => {
    const s = session();
    const cycle = serve(s, 18);
    expect([...cycle.slice(0, 12)].sort()).toEqual([...QUOTED].sort());
    expect([...cycle.slice(12)].sort()).toEqual([...WRITTEN].sort());
    expect(new Set(cycle).size).toBe(18);
  });

  it("leads a review with the quotations too, out of the one cycle", () => {
    // The preference here is the order, not the filter: the review path takes
    // its place in the same cycle the walk does, so a due card meets the
    // topic's quotations before any written sentence of it. Asserted rather
    // than inherited — it is what a student ticking the second box asks for,
    // and reviews used to be exempt from the first.
    const s = session();
    const cycle = Array.from({ length: 18 }, () => s.serveReview("big")!.id);
    expect([...cycle.slice(0, 12)].sort()).toEqual([...QUOTED].sort());
    expect(new Set(cycle).size).toBe(18);
  });

  it("shuffles a review in with the rest for a student who asked for that", () => {
    const s = session({ ...emptyProgress(), quotedFirst: false, testCycles: { big: { seed: 1, at: 0 } } });
    const cycle = Array.from({ length: 18 }, () => s.serveReview("big")!.id);
    expect(new Set(cycle).size).toBe(18);
    const lastQuoted = cycle.findLastIndex((id) => QUOTED.includes(id));
    const firstWritten = cycle.findIndex((id) => WRITTEN.includes(id));
    expect(firstWritten).toBeLessThan(lastQuoted);
  });

  it("comes back round to the quotations rather than stopping", () => {
    const s = session();
    serve(s, 18);
    // Nineteen and twenty are the second cycle's first two, and a cycle leads
    // with the quotations however many have gone before it.
    expect(QUOTED).toContain(s.serveTest("big")!.id);
    expect(QUOTED).toContain(s.serveTest("big")!.id);
  });

  it("shuffles again rather than dealing the same order twice", () => {
    // The seed is pinned, so this asserts the reshuffle rather than hoping for
    // it: two identical cycles would otherwise be a one-in-a-billion pass.
    const s = session({ ...emptyProgress(), testCycles: { big: { seed: 1, at: 0 } } });
    const first = serve(s, 18);
    const second = serve(s, 18);
    expect([...second].sort()).toEqual([...first].sort());
    expect(second).not.toEqual(first);
    expect(s.progress().testCycles.big!.seed).not.toBe(1);
  });

  it("shuffles the whole topic together for a student who asked for that", () => {
    const s = session({ ...emptyProgress(), quotedFirst: false, testCycles: { big: { seed: 1, at: 0 } } });
    const cycle = serve(s, 18);
    // Still a clean sweep — the cycle is what fairness is made of, and turning
    // the order off does not turn that off.
    expect(new Set(cycle).size).toBe(18);
    // And no longer sorted by kind: some written question arrives before the
    // last quotation does.
    const lastQuoted = cycle.findLastIndex((id) => QUOTED.includes(id));
    const firstWritten = cycle.findIndex((id) => WRITTEN.includes(id));
    expect(firstWritten).toBeLessThan(lastQuoted);
  });

  it("keeps a student's place when the preference goes on mid-cycle", () => {
    const s = session();
    const before = serve(s, 3);
    s.setQuotedOnly(true);
    // The quoted half is drawn from the stream first, so narrowing the list
    // cannot renumber the part of the order already walked: the fourth test is
    // the fourth test either way, not one of the three just answered.
    const next = s.serveTest("big", true)!.id;
    expect(QUOTED).toContain(next);
    expect(before).not.toContain(next);
  });

  it("starts a fresh cycle when the preference goes on past the quotations", () => {
    const s = session();
    serve(s, 14); // two written tests in
    s.setQuotedOnly(true);
    expect(QUOTED).toContain(s.serveTest("big", true)!.id);
    expect(s.progress().testCycles.big!.at).toBe(1);
  });

  it("writes no cycle for a topic it cannot serve", () => {
    const s = session();
    s.setQuotedOnly(true);
    expect(s.serveTest("ag2", true)).toBeUndefined();
    expect(s.progress().testCycles.ag2).toBeUndefined();
  });

  it("hands the same test back after an undo", () => {
    const s = session();
    serve(s, 5);
    const before = s.snapshot();
    const served = s.serveTest("big")!.id;
    s.restore(before);
    // A guarantee the old draw could not make: undoing a round undoes the place
    // it took, so the test comes back rather than being skipped.
    expect(s.serveTest("big")!.id).toBe(served);
  });

  it("carries on when the pack grows underneath a cycle", () => {
    const s = session();
    serve(s, 4);
    const grown = new Content(
      { ...wide, tests: { big: [...wide.tests.big!, test("big-q13", true)] } },
      testProfile,
    );
    const after = new Session(grown, s.progress());
    expect(after.serveTest("big")).toBeDefined();
  });

  it("sweeps a practice run's quotations first, and still sweeps it all", () => {
    const s = session();
    const at = new Date("2026-01-01T00:00:00Z");
    s.drillTopic("big", at);
    const run: string[] = [];
    for (let i = 0; i < 18; i++) {
      const next = s.servePractice("big");
      if (!next) break;
      run.push(next.id);
      for (const q of next.questions) {
        s.recordAttempt("big", { prompt: q.prompt, answer: q.answer, submitted: q.answer, rating: 3 }, at);
      }
    }
    expect([...run.slice(0, 12)].sort()).toEqual([...QUOTED].sort());
    expect(new Set(run).size).toBe(18);
  });
});
