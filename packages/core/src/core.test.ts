import { describe, expect, it } from "vitest";
import { Content } from "./content.js";
import { testProfile } from "./profile.fixture.js";
import { compileFold } from "./fold.js";
import { newCard, preview, rate } from "./scheduler.js";
import { MAX_CONTEXTS, Session } from "./session.js";
import {
  emptyProgress,
  type ContentData,
  type NewVocabContext,
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

    // Exploring opens on the first topic of the book; nothing is due yet.
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "ag1" });
    expect(s.next(now)).toEqual({ kind: "done" });

    // Serving a test marks it seen; a second serve rotates variety.
    const t1 = s.serveTest("ag1");
    expect(t1?.sectionId).toBe("ag1");

    // Grade it easy -> creates the card, and the cursor reads on.
    s.gradeTopic("ag1", 4, now);
    s.advanceCursor();
    expect(s.progress().newTopicsIntroduced).toBe(1);
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "ag2" });

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

    // A topic graded hard enough to come back, and then left until it does.
    s.gradeTopic("ag1", 1, start);
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

describe("Session: reading a file this app no longer writes", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  /** Load a saved shape the way opening the app on an old file would. */
  const load = (saved: object) =>
    new Session(
      new Content(fixture, testProfile),
      JSON.parse(JSON.stringify({ ...emptyProgress(), ...saved })),
    );

  it("keeps what a passed placement claimed, as mastery", () => {
    const s = load({ knownSections: ["ag1"] });
    // The map always drew these as fully mastered, so that is what they become.
    expect(s.grammarMap(now)[0]?.mastery).toBe(4);
    // And the book steps past them, exactly as the frontier used to.
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "ag2" });
  });

  it("recovers one start point from a family focus and its frontier", () => {
    const s = load({
      focus: { kind: "family", id: "nouns" },
      frontiers: { nouns: "ag2" },
    });
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "ag2" });
  });

  it("drops a drill stored under the old rule back to the book", () => {
    const s = load({ focus: { kind: "topic", sectionId: "ag2" } });
    // No run marker to resume from, so the book is where it goes.
    expect(s.practiseRun()).toBeNull();
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "ag1" });
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

  it("leaves the fields it has retired out of what it writes back", () => {
    const saved = load({
      knownSections: ["ag1"],
      placementDone: true,
      placement: { familyIndex: 0, asked: 0, passed: -1, probe: "ag1" },
      frontiers: { nouns: "ag2" },
      focus: { kind: "sweep" },
    }).progress();
    for (const gone of [
      "knownSections",
      "placementDone",
      "placement",
      "frontiers",
      "focus",
    ]) {
      expect(saved).not.toHaveProperty(gone);
    }
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

  it("attaches nothing once the student has turned it off", () => {
    const { s, id } = start();
    expect(s.keepsContext()).toBe(true);
    s.setKeepContext(false);
    expect(s.addVocabContext(id, reference, now)).toBe("off");
    expect(s.vocabCard(id)?.contexts).toBeUndefined();
    // The word itself is still recorded — the preference is about the sentence.
    expect(s.vocabList()).toHaveLength(1);
  });

  it("holds the preference across a grade taken back", () => {
    const { s, id } = start();
    const before = s.snapshot();
    s.setKeepContext(false);
    s.gradeVocab(id, 3, now);
    // The undo reaches the grade it was offered for, and stops there.
    s.restore(before);
    expect(s.keepsContext()).toBe(false);
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
    delete old.keepContext; // as a file from before the preference

    const back = new Session(new Content(fixture, testProfile), old);
    expect(back.keepsContext()).toBe(true);
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

  it("does not dilute the progress a student has actually made", () => {
    // The regression this guards: shipping the rest of the book would otherwise
    // drop everyone's figure overnight, because the denominator grew and their
    // work did not shrink. A number that falls when the *book* gets longer is
    // not a number about the student.
    const at = new Date("2026-01-01T00:00:00Z");
    const before = new Session(new Content(fixture, testProfile));
    const after = new Session(new Content(withReading, testProfile));
    before.gradeTopic("ag1", 4, at);
    after.gradeTopic("ag1", 4, at);
    expect(after.overallPercent()).toBe(before.overallPercent());
    expect(after.overallPercent()).toBeGreaterThan(0);

    const family = (s: Session) =>
      s.familyProgress().find((f) => f.id === "nouns")!;
    expect(family(after).percent).toBe(family(before).percent);
    // Still listed under its family, though: it is a page of the book and the
    // index is how a reader finds it.
    expect(family(after).topics.map((t) => t.sectionId)).toContain("ag9");
  });

  it("says so on the map rather than reading as an unwritten topic", () => {
    const s = new Session(new Content(withReading, testProfile));
    const row = s.grammarMap().find((t) => t.sectionId === "ag9")!;
    expect(row.readingOnly).toBe(true);
    expect(row.hasTests).toBe(false);
    expect(row.mastery).toBeUndefined();
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
    s.gradeTopic("n1", 1, now);
    s.gradeTopic("n2", 1, now);
    return s;
  };

  it("serves nothing due while exploring, and nothing new while reviewing", () => {
    const s = withBacklog();
    expect(s.next(soon, "review")).toEqual({ kind: "topic-review", sectionId: "n1" });
    // The book is where the cursor is, not where the backlog is.
    expect(s.next(soon, "explore")).toEqual({ kind: "new-topic", sectionId: "n1" });
    s.studyFrom("n3");
    expect(s.next(soon, "explore")).toEqual({ kind: "new-topic", sectionId: "n3" });
    expect(s.next(soon, "review")).toEqual({ kind: "topic-review", sectionId: "n1" });
  });

  it("says the reviews are cleared rather than quietly reading on", () => {
    const s = new Session(new Content(wide, testProfile));
    // Nothing is due and there is a whole book left; review still says done,
    // because "done" is answered for the errand that was asked.
    expect(s.next(now, "review")).toEqual({ kind: "done" });
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "n1" });
  });

  it("reports the book worked out only once every topic is mastered", () => {
    const s = new Session(new Content(wide, testProfile));
    for (const id of ["n1", "n2", "n3", "v1", "v2", "v3"]) {
      // Four "easy" grades to reach the top band from nothing.
      for (let i = 0; i < 4; i++) s.gradeTopic(id, 4, now);
    }
    expect(s.next(now, "explore")).toEqual({ kind: "done" });
  });
});

describe("Session progress: the book cursor", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("walks the book in order on a fresh deck — the quick refresher", () => {
    const s = new Session(new Content(wide, testProfile));
    const served: string[] = [];
    for (let i = 0; i < 6; i++) {
      const action = s.next(now, "explore");
      expect(action.kind).toBe("new-topic");
      if (action.kind !== "new-topic") return;
      served.push(action.sectionId);
      s.gradeTopic(action.sectionId, 4, now);
      s.advanceCursor();
    }
    expect(served).toEqual(["n1", "n2", "n3", "v1", "v2", "v3"]);
  });

  it("moves on whatever the grade, so a bad topic cannot stall the book", () => {
    const s = new Session(new Content(wide, testProfile));
    // The old rule was "the first topic never graded", which could not be
    // stalled either — but "the first topic not yet mastered" can, and this is
    // the case that would have stalled it forever.
    for (const expected of ["n1", "n2", "n3"]) {
      expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: expected });
      s.gradeTopic(expected, 1, now); // "again", every time
      s.advanceCursor();
    }
    expect(s.grammarMap(now).find((t) => t.sectionId === "n1")?.mastery).toBe(1);
  });

  it("does not skip what is already mastered as it reads on", () => {
    const s = new Session(new Content(wide, testProfile));
    for (let i = 0; i < 4; i++) s.gradeTopic("n2", 4, now); // mastered
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "n1" });
    s.advanceCursor();
    // Reading on means reading on: n2 is next because it is next.
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "n2" });
  });

  it("wraps to what is left unmastered once it runs off the end", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("v3");
    for (let i = 0; i < 4; i++) s.gradeTopic("v3", 4, now);
    s.advanceCursor();
    // Past the last section, so back to the earliest thing still short of it.
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "n1" });
  });

  it("puts the cursor on the earliest unmastered topic when asked for the book", () => {
    const s = new Session(new Content(wide, testProfile));
    for (let i = 0; i < 4; i++) s.gradeTopic("n1", 4, now);
    s.studyFrom("v3");
    s.bookOrder();
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "n2" });
  });
});

describe("Session progress: reading on from a chosen topic", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("goes on from where you jumped to, not back to the beginning", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("v2");

    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "v2" });
    s.gradeTopic("v2", 4, now, "v2-t1");
    s.advanceCursor();
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "v3" });
  });

  it("reads on across the family boundary rather than stopping at it", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("n3");
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "n3" });
    s.advanceCursor();
    // The nouns are finished; the book carries straight on into the verbs.
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "v1" });
  });

  it("leaves the skipped topics unstudied on the map rather than known", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("v2");
    const map = s.grammarMap(now);
    expect(map.find((t) => t.sectionId === "v1")?.mastery).toBeUndefined();
    expect(map.find((t) => t.sectionId === "v2")?.frontier).toBe(true);
  });

  it("drops a practice run, because it is a different answer to the same question", () => {
    const s = new Session(new Content(wide, testProfile));
    s.drillTopic("n1", now);
    s.studyFrom("v1");
    expect(s.practiseRun()).toBeNull();
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "v1" });
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

  it("leaves the book cursor where it was, so the detour costs nothing", () => {
    const s = new Session(new Content(wide, testProfile));
    s.studyFrom("v2");
    s.drillTopic("n1", now);
    for (let i = 0; i < 3; i++) round(s, "n1");
    s.bookOrder();
    expect(s.practiseRun()).toBeNull();
  });

  it("is not a run at all on a topic with no tests written for it", () => {
    const s = new Session(
      new Content(book(topics("nouns", "n", 2), { grammar: [], tests: {} }), testProfile),
    );
    s.drillTopic("nope", now);
    expect(s.practiseRun()).toBeNull();
    expect(s.next(now, "explore")).toEqual({ kind: "new-topic", sectionId: "n1" });
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

  /**
   * A test used to live entirely in the screen's own state, so anything that
   * ended the page put the student back at question one of a different test.
   */
  describe("picking a round back up", () => {
    const start = (isNew = false) => {
      const s = new Session(new Content(wide, testProfile));
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
      const { s, test } = start();
      s.gradeTopic("n1", 3, now, test.id);
      s.gradeTopic("n1", 1, now, test.id);
      expect(s.progress().topicCards.n1!.reps).toBe(1);
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

  it("leaves review alone: a due card comes back on the question that built it", () => {
    const s = session();
    s.setQuotedOnly(true);
    // Review calls without the flag, and must still see the whole bank.
    const served = new Set<string>();
    for (let i = 0; i < 12; i++) served.add(s.serveTest("q1")!.id);
    expect(served.size).toBe(4);
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
