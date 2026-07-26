import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { positionLabel, scrolled, wrapLines } from "./pager.js";
import { attemptLines, type HistoryLine } from "./history.js";
import {
  Content,
  Session,
  type FamilyProgress,
  type LemmaEntry,
  type Question,
  type Rating,
  type StorageAdapter,
  type Test,
  type TopicProgress,
} from "@latin-tutor/core";

interface Props {
  session: Session;
  content: Content;
  storage: StorageAdapter;
}

type Phase =
  | { t: "answering" }
  | { t: "graded" }
  | { t: "vocab-input" }
  | { t: "vocab-pick"; form: string; candidates: LemmaEntry[] }
  | { t: "vocab-review-front"; cardId: string }
  | { t: "vocab-review-back"; cardId: string }
  | { t: "map"; from: "graded" | "done" }
  | { t: "read"; from: "graded" | "done" } // a section read in full, from the map
  | { t: "done" };

export function App({ session, content, storage }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [isNewTopic, setIsNewTopic] = useState(false);

  const [inPlacement, setInPlacement] = useState(false);
  const [placementList, setPlacementList] = useState<string[]>([]);
  const [placementIndex, setPlacementIndex] = useState(0);

  const [phase, setPhase] = useState<Phase>({ t: "answering" });
  const [showGrammar, setShowGrammar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState(""); // current typed answer / vocab form
  const [submitted, setSubmitted] = useState(""); // the answer the student submitted
  const [flash, setFlash] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [mapIndex, setMapIndex] = useState(0);
  const [scroll, setScroll] = useState(0); // first visible line of the grammar pane

  const question: Question | undefined = test?.questions[qIndex];
  const section = sectionId ? content.getSection(sectionId) : undefined;

  // Sections run long, so grammar is paged. The text is wrapped here, to the
  // real terminal width, so a scroll step moves exactly one screen line.
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const paneWidth = Math.max(24, cols - 7); // app padding + border + pane padding
  // The drawer shares the screen with the question; the reader owns it.
  const drawerHeight = Math.max(4, Math.min(18, rows - 15));
  const readerHeight = Math.max(6, rows - 9);

  // The grammar map: families in display order, and the same topics flattened
  // so the cursor can walk straight across family boundaries.
  const families = useMemo(() => session.familyProgress(), [tick, session]);
  const mapTopics = useMemo(() => families.flatMap((f) => f.topics), [families]);
  const overall = useMemo(() => session.overallPercent(), [tick, session]);
  const familyStarts = useMemo(() => {
    const starts: number[] = [];
    let n = 0;
    for (const f of families) {
      starts.push(n);
      n += f.topics.length;
    }
    return starts;
  }, [families]);

  const mapSection = useMemo(() => {
    const id = mapTopics[mapIndex]?.sectionId;
    return id ? content.getSection(id) : undefined;
  }, [mapTopics, mapIndex, content]);

  // Two panes can be reading: the drawer (the topic being drilled) and the
  // reader (the topic under the map cursor). Only one is on screen at a time.
  const drawerLines = useMemo(
    () => wrapLines(section?.text ?? "", paneWidth),
    [section?.text, paneWidth],
  );
  const readerLines = useMemo(
    () => wrapLines(mapSection?.text ?? "", paneWidth),
    [mapSection?.text, paneWidth],
  );
  // What was written on this topic before. Read after the answer is on screen,
  // never while it is still being typed: earlier attempts hold reference
  // answers, and the same question comes round again.
  const attempts = useMemo(
    () => (sectionId ? session.attemptsFor(sectionId) : []),
    [sectionId, tick, session],
  );
  const historyLines = useMemo(
    () => attemptLines(attempts, paneWidth),
    [attempts, paneWidth],
  );

  // Whatever the pane is showing, show it from the top.
  useEffect(
    () => setScroll(0),
    [sectionId, showGrammar, showHistory, mapIndex, phase.t],
  );

  const save = () => {
    void storage.save(session.progress()).catch(() => {});
  };

  /** Move the visible window of whichever pane is open. */
  const scrollPane = (lineCount: number, height: number, delta: number) => {
    setScroll((s) => scrolled(s, delta, lineCount, height));
  };

  /** Arrow/page keys for a pane; true if the key was a scroll key. */
  const handleScrollKey = (
    key: { upArrow: boolean; downArrow: boolean; pageUp: boolean; pageDown: boolean },
    lineCount: number,
    height: number,
  ): boolean => {
    const page = Math.max(1, height - 1);
    if (key.downArrow) scrollPane(lineCount, height, 1);
    else if (key.upArrow) scrollPane(lineCount, height, -1);
    else if (key.pageDown) scrollPane(lineCount, height, page);
    else if (key.pageUp) scrollPane(lineCount, height, -page);
    else return false;
    return true;
  };

  const advance = () => {
    setFlash(null);
    setShowGrammar(false);
    setShowHistory(false);
    setInput("");
    setSubmitted("");
    const action = session.next();
    if (action.kind === "done") {
      setPhase({ t: "done" });
      return;
    }
    if (action.kind === "vocab-review") {
      setPhase({ t: "vocab-review-front", cardId: action.cardId });
      return;
    }
    const t = session.serveTest(action.sectionId);
    if (!t) {
      session.gradeTopic(action.sectionId, 3);
      advance();
      return;
    }
    setSectionId(action.sectionId);
    setTest(t);
    setQIndex(0);
    setIsNewTopic(action.kind === "new-topic");
    setShowGrammar(action.kind === "new-topic"); // teach first on a new topic
    setPhase({ t: "answering" });
    setTick((n) => n + 1);
  };

  const loadPlacement = (i: number, list: string[]) => {
    const id = list[i]!;
    const t = session.serveTest(id);
    if (!t) {
      // no test for this topic — skip it
      if (i + 1 < list.length) return loadPlacement(i + 1, list);
      session.endPlacement();
      setInPlacement(false);
      advance();
      return;
    }
    setSectionId(id);
    setTest(t);
    setQIndex(0);
    setInput("");
    setSubmitted("");
    setShowGrammar(false);
    setShowHistory(false);
    setIsNewTopic(false);
    setPhase({ t: "answering" });
    setTick((n) => n + 1);
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (session.needsPlacement()) {
      const list = session.placementTopics();
      if (list.length > 0) {
        setInPlacement(true);
        setPlacementList(list);
        setPlacementIndex(0);
        loadPlacement(0, list);
        return;
      }
      session.endPlacement();
    }
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAnswer = (value: string) => {
    setSubmitted(value);
    setPhase({ t: "graded" });
  };

  const placementGrade = (rating: Rating) => {
    if (!sectionId) return;
    if (rating >= 3) {
      session.passPlacement(sectionId);
      save();
      const ni = placementIndex + 1;
      if (ni < placementList.length) {
        setPlacementIndex(ni);
        loadPlacement(ni, placementList);
        return;
      }
    }
    // failed (1–2) or passed the last probe — placement is done
    session.endPlacement();
    save();
    setInPlacement(false);
    advance();
  };

  const gradeAndContinue = (rating: Rating) => {
    // Kept before the grade is applied, so it covers placement too: what you
    // wrote on a topic is worth having whichever pass it was written in.
    if (sectionId && question) {
      session.recordAttempt(sectionId, {
        prompt: question.prompt,
        answer: question.answer,
        submitted: submitted.trim(),
        rating,
      });
    }
    if (inPlacement) return placementGrade(rating);
    if (!sectionId) return;
    session.gradeTopic(sectionId, rating);
    save();
    setTick((n) => n + 1);
    if (test && qIndex + 1 < test.questions.length) {
      setQIndex(qIndex + 1);
      setShowGrammar(false);
      setShowHistory(false);
      setFlash(null);
      setInput("");
      setSubmitted("");
      setPhase({ t: "answering" });
    } else {
      advance();
    }
  };

  const recordForm = (form: string) => {
    setInput("");
    const candidates = content.lookup(form);
    if (candidates.length === 0) {
      setFlash(`No dictionary match for “${form}”.`);
      setPhase({ t: "graded" });
      return;
    }
    if (candidates.length === 1) {
      session.recordVocab(candidates[0]!);
      save();
      setFlash(`Saved: ${candidates[0]!.citation}`);
      setPhase({ t: "graded" });
      return;
    }
    setPhase({ t: "vocab-pick", form, candidates });
  };

  /** Open the grammar map, parked on the current topic (or the first unstudied one). */
  const openMap = (from: "graded" | "done") => {
    let i = mapTopics.findIndex((t) => t.sectionId === sectionId);
    if (i < 0) i = mapTopics.findIndex((t) => t.mastery === undefined);
    setMapIndex(i < 0 ? 0 : i);
    setFlash(null);
    setPhase({ t: "map", from });
  };

  /** Jump the cursor to the first topic of the previous/next non-empty family. */
  const jumpFamily = (dir: -1 | 1) => {
    setMapIndex((i) => {
      let current = 0;
      for (let k = 0; k < familyStarts.length; k++) {
        if (families[k]!.topics.length > 0 && familyStarts[k]! <= i) current = k;
      }
      for (let k = current + dir; k >= 0 && k < families.length; k += dir) {
        if (families[k]!.topics.length > 0) return familyStarts[k]!;
      }
      return i; // already at the first/last populated family
    });
  };

  /** Serve a test on the topic under the cursor and quiz it right now. */
  const quizSelected = () => {
    const target = mapTopics[mapIndex];
    if (!target) return;
    const t = session.serveTest(target.sectionId);
    if (!t) {
      setFlash(`No tests for “${target.title}” yet.`);
      return;
    }
    save();
    const fresh = target.mastery === undefined;
    setFlash(null);
    setSectionId(target.sectionId);
    setTest(t);
    setQIndex(0);
    setInput("");
    setSubmitted("");
    setIsNewTopic(fresh);
    setShowGrammar(fresh); // teach the rule first when it's new ground
    setShowHistory(false);
    setPhase({ t: "answering" });
    setTick((n) => n + 1);
  };

  useInput((ch, key) => {
    // While typing (answering / vocab-input) the TextInput owns the keys —
    // except the arrows, which it ignores, so they can page the drawer.
    if (phase.t === "answering") {
      if (key.escape) setShowGrammar((s) => !s); // peek at grammar mid-answer
      else if (showGrammar) handleScrollKey(key, drawerLines.length, drawerHeight);
      return;
    }
    if (phase.t === "vocab-input") return;

    if (ch === "q") {
      save();
      exit();
      return;
    }

    switch (phase.t) {
      case "graded": {
        if (showGrammar && handleScrollKey(key, drawerLines.length, drawerHeight)) break;
        if (showHistory && handleScrollKey(key, historyLines.length, drawerHeight)) break;
        if (ch >= "1" && ch <= "4") gradeAndContinue(Number(ch) as Rating);
        // The two panes share the screen with the question: opening one closes
        // the other rather than squeezing both.
        else if (ch === "g") {
          setShowHistory(false);
          setShowGrammar((s) => !s);
        } else if (ch === "h" && attempts.length > 0) {
          setShowGrammar(false);
          setShowHistory((s) => !s);
        } else if (ch === "m" && !inPlacement) openMap("graded");
        else if (ch === "v") {
          setInput("");
          setPhase({ t: "vocab-input" });
        }
        break;
      }
      case "map": {
        if (key.leftArrow) setMapIndex((i) => Math.max(0, i - 1));
        else if (key.rightArrow)
          setMapIndex((i) => Math.min(mapTopics.length - 1, i + 1));
        else if (key.upArrow) jumpFamily(-1);
        else if (key.downArrow) jumpFamily(1);
        else if (key.return) quizSelected();
        else if (ch === "g") setPhase({ t: "read", from: phase.from });
        else if (key.escape || ch === "m") setPhase({ t: phase.from });
        break;
      }
      case "read": {
        if (handleScrollKey(key, readerLines.length, readerHeight)) break;
        if (key.escape || ch === "g" || ch === "m") setPhase({ t: "map", from: phase.from });
        break;
      }
      case "vocab-pick": {
        if (ch >= "1" && ch <= String(Math.min(9, phase.candidates.length))) {
          const chosen = phase.candidates[Number(ch) - 1];
          if (chosen) {
            session.recordVocab(chosen);
            save();
            setFlash(`Saved: ${chosen.citation}`);
          }
          setPhase({ t: "graded" });
        } else if (key.escape) {
          setPhase({ t: "graded" });
        }
        break;
      }
      case "vocab-review-front": {
        if (key.return || ch === " ")
          setPhase({ t: "vocab-review-back", cardId: phase.cardId });
        break;
      }
      case "vocab-review-back": {
        if (ch >= "1" && ch <= "4") {
          session.gradeVocab(phase.cardId, Number(ch) as Rating);
          save();
          setTick((n) => n + 1);
          advance();
        }
        break;
      }
      case "done": {
        if (ch === "m") openMap("done");
        else if (key.return || ch === " ") {
          save();
          exit();
        }
        break;
      }
    }
  });

  const stats = useMemo(() => session.stats(), [tick, session]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <StatusBar
        stats={stats}
        section={
          inPlacement
            ? `Placement ${placementIndex + 1}/${placementList.length}`
            : section?.title ?? "—"
        }
        isNew={isNewTopic && !phase.t.startsWith("vocab-review")}
        placement={inPlacement}
      />

      {inPlacement && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Placement — translate as far as you can. Grade 3–4 if you knew it, 1–2 to start there.
          </Text>
        </Box>
      )}

      {phase.t === "map" && mapTopics[mapIndex] && (
        <GrammarMap
          families={families}
          cursor={mapIndex}
          overall={overall}
          topic={mapTopics[mapIndex]!}
          text={mapSection?.text ?? ""}
        />
      )}

      {phase.t === "read" && mapSection && (
        <GrammarPane
          lines={readerLines}
          scroll={scroll}
          height={readerHeight}
          refLabel={mapSection.ref}
          title={mapSection.title}
        />
      )}

      {showGrammar && section && phase.t !== "map" && phase.t !== "read" && (
        <GrammarPane
          lines={drawerLines}
          scroll={scroll}
          height={drawerHeight}
          refLabel={section.ref}
          title={section.title}
        />
      )}

      {showHistory && phase.t === "graded" && (
        <HistoryPane
          lines={historyLines}
          scroll={scroll}
          height={drawerHeight}
          count={attempts.length}
          title={section?.title ?? "this topic"}
        />
      )}

      {(phase.t === "answering" || phase.t === "graded") && question && (
        <QuestionView
          question={question}
          index={qIndex}
          total={test?.questions.length ?? 0}
          graded={phase.t === "graded"}
          submitted={submitted}
          input={input}
          onChange={setInput}
          onSubmit={submitAnswer}
        />
      )}

      {phase.t === "vocab-input" && (
        <Box marginTop={1} flexDirection="column">
          <Text>Record vocabulary — type the word as it appeared:</Text>
          <Box>
            <Text color="cyan">▸ </Text>
            <TextInput value={input} onChange={setInput} onSubmit={recordForm} />
          </Box>
          <Text dimColor>(the dictionary headword is built for you)</Text>
        </Box>
      )}

      {phase.t === "vocab-pick" && (
        <Box marginTop={1} flexDirection="column">
          <Text>Which word is “{phase.form}”? (most frequent first)</Text>
          {phase.candidates.slice(0, 9).map((c, i) => (
            <Text key={c.lemma + c.pos}>
              <Text color="yellow">{i + 1}</Text> {c.citation} — {c.gloss}
            </Text>
          ))}
          <Text dimColor>Esc to cancel</Text>
        </Box>
      )}

      {(phase.t === "vocab-review-front" || phase.t === "vocab-review-back") && (
        <VocabReview card={session.vocabCard(phase.cardId)} reveal={phase.t === "vocab-review-back"} />
      )}

      {phase.t === "done" && (
        <Box marginTop={1}>
          <Text color="green">
            ✓ Nothing due right now. Well done — press m to explore the grammar map, or Enter to
            exit.
          </Text>
        </Box>
      )}

      {flash && (
        <Box marginTop={1}>
          <Text color="green">{flash}</Text>
        </Box>
      )}

      <HintBar
        phase={phase.t}
        placement={inPlacement}
        paging={
          (showGrammar && drawerLines.length > drawerHeight) ||
          (showHistory && historyLines.length > drawerHeight)
        }
        history={attempts.length > 0}
      />
    </Box>
  );
}

function StatusBar({
  stats,
  section,
  isNew,
  placement,
}: {
  stats: { dueTopics: number; dueVocab: number; topics: number; vocab: number };
  section: string;
  isNew: boolean;
  placement?: boolean;
}) {
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Text>
        <Text color="magenta" bold>
          Latina
        </Text>{" "}
        · {isNew ? <Text color="green">new: </Text> : null}
        <Text bold color={placement ? "yellow" : undefined}>
          {section}
        </Text>
      </Text>
      <Text dimColor>
        topics {stats.topics} (due {stats.dueTopics}) · vocab {stats.vocab} (due {stats.dueVocab})
      </Text>
    </Box>
  );
}

// --- grammar map ------------------------------------------------------------

/** Mastery as a 0–1 fraction; an ungraded topic reads as 0. */
function masteryFraction(t: TopicProgress): number {
  return ((t.mastery ?? 1) - 1) / 3;
}

/** One cell of a bar: how far along the topic is, at a glance. */
function cellStyle(t: TopicProgress): { glyph: string; color: string; dim: boolean } {
  if (t.mastery === undefined) return { glyph: "░", color: "gray", dim: true };
  const level = Math.floor(t.mastery);
  if (level >= 4) return { glyph: "█", color: "green", dim: t.assumed };
  if (level >= 3) return { glyph: "▓", color: "cyan", dim: false };
  if (level >= 2) return { glyph: "▒", color: "yellow", dim: false };
  return { glyph: "░", color: "yellow", dim: false };
}

/** Cells in a family's fixed-width summary bar. */
const SUMMARY_CELLS = 6;
/** Families per row of the summary block. */
const PER_ROW = 3;

function summaryGlyphs(percent: number): string {
  const filled = Math.round(percent * SUMMARY_CELLS);
  return "\u2588".repeat(filled) + "\u2591".repeat(SUMMARY_CELLS - filled);
}

/**
 * Every family as a fixed-width summary bar, the selected one highlighted.
 * One cell per topic cannot be shown for all families at once — the syllabus
 * is 135 topics, which needs ~161 columns — so the per-topic detail belongs to
 * the selected family alone (`FamilyBar`).
 */
function FamilySummary({
  families,
  selected,
}: {
  families: FamilyProgress[];
  selected: string;
}) {
  const width = Math.max(...families.map((f) => f.label.length));
  const rows: FamilyProgress[][] = [];
  for (let i = 0; i < families.length; i += PER_ROW) {
    rows.push(families.slice(i, i + PER_ROW));
  }
  return (
    <Box flexDirection="column">
      {rows.map((row, ri) => (
        <Box key={ri}>
          {row.map((f) => {
            const on = f.id === selected;
            return (
              <Box key={f.id}>
                <Text bold={on} color={on ? "cyan" : undefined} dimColor={!on}>
                  {f.label.padEnd(width)}
                </Text>
                <Text> </Text>
                <Text color={f.percent > 0 ? "green" : "gray"} dimColor={f.percent === 0}>
                  {summaryGlyphs(f.percent)}
                </Text>
                <Text dimColor>{` ${String(Math.round(f.percent * 100)).padStart(3)}%  `}</Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

/** The selected family in full: one cell per topic, with the cursor caret. */
function FamilyBar({
  family,
  cursorInFamily,
}: {
  family: FamilyProgress;
  cursorInFamily: number;
}) {
  return (
    <Box flexDirection="column">
      <Box>
        {family.topics.map((t, i) => {
          const s = cellStyle(t);
          return (
            <Text
              key={t.sectionId}
              color={s.color}
              dimColor={s.dim}
              inverse={i === cursorInFamily}
            >
              {s.glyph}
            </Text>
          );
        })}
      </Box>
      <Text color="cyan">{" ".repeat(Math.max(0, cursorInFamily)) + "\u25b2"}</Text>
    </Box>
  );
}

function GrammarMap({
  families,
  cursor,
  overall,
  topic,
  text,
}: {
  families: FamilyProgress[];
  cursor: number;
  overall: number;
  topic: TopicProgress;
  text: string;
}) {
  // Locate the cursor: which family it falls in, and where inside that family.
  let offset = 0;
  let selected = families[0]!;
  let inFamily = 0;
  for (const f of families) {
    if (f.topics.length === 0) continue;
    if (cursor < offset + f.topics.length) {
      selected = f;
      inFamily = cursor - offset;
      break;
    }
    offset += f.topics.length;
  }

  // Sections carry paradigm tables, which are many short lines; the map shows
  // only an opening taste of one, clipped by line as well as by length so the
  // map stays compact. `g` opens the section in full in the reader.
  const lines = text.split("\n");
  const head = lines.slice(0, 5).join("\n");
  const truncated = lines.length > 5 || head.length > 400;
  const clipped = (head.length > 400 ? head.slice(0, 400) : head) + (truncated ? " \u2026" : "");
  const mastery =
    topic.mastery === undefined
      ? "not started"
      : `${Math.round(masteryFraction(topic) * 100)}% mastered${topic.assumed ? " (assumed)" : ""}`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="magenta">
          Grammar map
        </Text>
        <Text dimColor>{Math.round(overall * 100)}% mastered overall</Text>
      </Box>

      <FamilySummary families={families} selected={selected.id} />

      <Box marginTop={1}>
        <Text>
          <Text bold color="cyan">{selected.label}</Text>
          <Text dimColor>
            {`  ${selected.topics.length} topics \u00b7 ${inFamily + 1}/${selected.topics.length}`}
          </Text>
        </Text>
      </Box>
      <FamilyBar family={selected} cursorInFamily={inFamily} />

      <Box marginTop={1}>
        <Text>
          <Text color="gray">§ {topic.ref} </Text>
          <Text bold>{topic.title}</Text>
          {topic.due ? <Text color="yellow"> · due</Text> : null}
          {!topic.hasTests ? <Text dimColor> · no tests</Text> : null}
          <Text dimColor> — {mastery}</Text>
        </Text>
      </Box>
      <Text>{clipped}</Text>
      {truncated && <Text dimColor>press g to read § {topic.ref} in full</Text>}
    </Box>
  );
}

/**
 * A window onto one grammar section. Sections run to hundreds of lines, so the
 * pane shows `height` of them at `scroll` and the reader pages through the
 * rest — nothing in the section is out of reach.
 */
function GrammarPane({
  lines,
  scroll,
  height,
  refLabel,
  title,
}: {
  lines: string[];
  scroll: number;
  height: number;
  refLabel: string;
  title: string;
}) {
  const visible = lines.slice(scroll, scroll + height);
  const more = lines.length > height;
  const atEnd = scroll + height >= lines.length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">
        § {refLabel} — {title}
      </Text>
      {/* Pre-wrapped: one entry per screen line, so the count drives scrolling. */}
      {visible.map((line, i) => (
        <Text key={scroll + i}>{line === "" ? " " : line}</Text>
      ))}
      {more && (
        <Text dimColor>
          {positionLabel(scroll, height, lines.length)}
          {atEnd ? " · end" : " · ↑↓ scroll, PgUp/PgDn page"}
        </Text>
      )}
    </Box>
  );
}

/**
 * Earlier answers on the topic now being drilled, newest first — the same
 * window-and-scroll treatment the grammar pane gets, since a topic keeps ten
 * attempts and each runs to three or four lines.
 */
function HistoryPane({
  lines,
  scroll,
  height,
  count,
  title,
}: {
  lines: HistoryLine[];
  scroll: number;
  height: number;
  count: number;
  title: string;
}) {
  const visible = lines.slice(scroll, scroll + height);
  const more = lines.length > height;
  const atEnd = scroll + height >= lines.length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">
        Earlier on {title} — {count} {count === 1 ? "answer" : "answers"}, newest first
      </Text>
      {visible.map((line, i) => (
        <Text
          key={scroll + i}
          dimColor={line.tone === "meta"}
          color={
            line.tone === "yours" ? "yellow" : line.tone === "correct" ? "green" : undefined
          }
        >
          {line.text === "" ? " " : line.text}
        </Text>
      ))}
      {more && (
        <Text dimColor>
          {positionLabel(scroll, height, lines.length)}
          {atEnd ? " · end" : " · ↑↓ scroll, PgUp/PgDn page"}
        </Text>
      )}
    </Box>
  );
}

function QuestionView({
  question,
  index,
  total,
  graded,
  submitted,
  input,
  onChange,
  onSubmit,
}: {
  question: Question;
  index: number;
  total: number;
  graded: boolean;
  submitted: string;
  input: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text dimColor>
        Translate into Latin · {index + 1}/{total}
      </Text>
      <Box marginTop={1}>
        <Text bold>{question.prompt}</Text>
      </Box>

      {!graded ? (
        <Box marginTop={1}>
          <Text color="cyan">✎ </Text>
          <TextInput
            value={input}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder="type your Latin, then Enter…"
          />
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text dimColor>your answer </Text>
            <Text color="yellow">{submitted.trim() || "—"}</Text>
          </Text>
          <Text>
            <Text dimColor>correct     </Text>
            <Text color="green">{question.answer}</Text>
          </Text>
          {question.note && <Text dimColor>{question.note}</Text>}
        </Box>
      )}
    </Box>
  );
}

function VocabReview({
  card,
  reveal,
}: {
  card: { citation: string; gloss: string } | undefined;
  reveal: boolean;
}) {
  if (!card) return null;
  // English on the front: the student produces the Latin, as everywhere else.
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Vocabulary review · say it in Latin</Text>
      <Box marginTop={1}>
        <Text bold>{card.gloss}</Text>
      </Box>
      {reveal && (
        <Box marginTop={1}>
          <Text color="magenta" bold>
            → {card.citation}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function HintBar({
  phase,
  placement,
  paging,
  history,
}: {
  phase: Phase["t"];
  placement?: boolean;
  /** An open pane has more lines than fit. */
  paging?: boolean;
  /** There is something in the topic's answer trail to show. */
  history?: boolean;
}) {
  const scrollHint = paging ? " · ↑↓ scroll" : "";
  // Only offered once the topic has a trail: `h` does nothing before that.
  const historyHint = history ? " · h earlier" : "";
  const hint =
    phase === "answering"
      ? `type your Latin · Enter submit · Esc grammar${scrollHint}`
      : phase === "map"
        ? "← → topic · ↑ ↓ family · g read section · Enter quiz me on this · Esc close"
        : phase === "read"
          ? "↑ ↓ scroll · PgUp/PgDn page · Esc back to map · q quit"
        : phase === "graded"
        ? placement
          ? "3–4 you knew it (continue) · 1–2 start here"
          : `1–4 self-grade (1 again · 4 easy) · v vocab · g grammar${historyHint}${scrollHint} · m map · q quit`
        : phase === "vocab-review-front"
          ? "Space/Enter reveal · q quit"
          : phase === "vocab-review-back"
            ? "1–4 self-grade · q quit"
            : phase === "vocab-input"
              ? "Enter to look up the word"
              : phase === "vocab-pick"
                ? "1–9 choose · Esc cancel"
                : "m grammar map · Enter exit";
  return (
    <Box marginTop={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
