import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  Content,
  Session,
  type LemmaEntry,
  type Question,
  type Rating,
  type StorageAdapter,
  type Test,
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
  | { t: "done" };

export function App({ session, content, storage }: Props) {
  const { exit } = useApp();

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [isNewTopic, setIsNewTopic] = useState(false);

  const [inPlacement, setInPlacement] = useState(false);
  const [placementList, setPlacementList] = useState<string[]>([]);
  const [placementIndex, setPlacementIndex] = useState(0);

  const [phase, setPhase] = useState<Phase>({ t: "answering" });
  const [showGrammar, setShowGrammar] = useState(false);
  const [input, setInput] = useState(""); // current typed answer / vocab form
  const [submitted, setSubmitted] = useState(""); // the answer the student submitted
  const [flash, setFlash] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const question: Question | undefined = test?.questions[qIndex];
  const section = sectionId ? content.getSection(sectionId) : undefined;

  const save = () => {
    void storage.save(session.progress()).catch(() => {});
  };

  const advance = () => {
    setFlash(null);
    setShowGrammar(false);
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
    if (inPlacement) return placementGrade(rating);
    if (!sectionId) return;
    session.gradeTopic(sectionId, rating);
    save();
    setTick((n) => n + 1);
    if (test && qIndex + 1 < test.questions.length) {
      setQIndex(qIndex + 1);
      setShowGrammar(false);
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

  useInput((ch, key) => {
    // While typing (answering / vocab-input) the TextInput owns the keys.
    if (phase.t === "answering") {
      if (key.escape) setShowGrammar((s) => !s); // peek at grammar mid-answer
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
        if (ch >= "1" && ch <= "4") gradeAndContinue(Number(ch) as Rating);
        else if (ch === "g") setShowGrammar((s) => !s);
        else if (ch === "v") {
          setInput("");
          setPhase({ t: "vocab-input" });
        }
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
        if (key.return || ch === " ") {
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

      {showGrammar && section && (
        <GrammarDrawer text={section.text} refLabel={section.ref} title={section.title} />
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
          <Text color="green">✓ Nothing due right now. Well done — press Enter to exit.</Text>
        </Box>
      )}

      {flash && (
        <Box marginTop={1}>
          <Text color="green">{flash}</Text>
        </Box>
      )}

      <HintBar phase={phase.t} placement={inPlacement} />
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

function GrammarDrawer({
  text,
  refLabel,
  title,
}: {
  text: string;
  refLabel: string;
  title: string;
}) {
  const clipped = text.length > 1200 ? text.slice(0, 1200) + "…" : text;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Text color="gray">
        § {refLabel} — {title}
      </Text>
      <Text>{clipped}</Text>
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

function HintBar({ phase, placement }: { phase: Phase["t"]; placement?: boolean }) {
  const hint =
    phase === "answering"
      ? "type your Latin · Enter submit · Esc grammar"
      : phase === "graded"
        ? placement
          ? "3–4 you knew it (continue) · 1–2 start here"
          : "1–4 self-grade (1 again · 4 easy) · v record vocab · g grammar · q quit"
        : phase === "vocab-review-front"
          ? "Space/Enter reveal · q quit"
          : phase === "vocab-review-back"
            ? "1–4 self-grade · q quit"
            : phase === "vocab-input"
              ? "Enter to look up the word"
              : phase === "vocab-pick"
                ? "1–9 choose · Esc cancel"
                : "Enter exit";
  return (
    <Box marginTop={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
