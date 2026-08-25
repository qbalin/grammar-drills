import { Fragment, useEffect, useRef, useState } from "react";
import {
  buildParadigm,
  decodeRuns,
  type DictionaryArticle,
  type LemmaEntry,
  type Paradigm,
  type Run,
  type TaggedForm,
} from "@lang-tutor/core";
import { fold, profile } from "../pack.js";
import { CopyButton, Sheet, Spinner, TableBox, l2Attrs } from "../ui.js";

/**
 * Which spellings of the table are the one that was pressed.
 *
 * The sheet is opened *from a word in a sentence*, so the student already knows
 * the form; what they came for is where it sits — and a bare grid of thirty
 * endings makes them find `rēgem` before it can tell them it is the accusative.
 * So the pressed form is picked out wherever it stands.
 *
 * Two tiers, because a written form and a printed paradigm need not be marked
 * alike. An exact hit wins where there is one: the pack writes its sentences
 * with macrons, so `manūs` in a sentence is the genitive singular and the
 * nominative plural and is *not* the nominative singular `manus`, and saying
 * all three would throw away what the macron is there to say. Where nothing
 * matches exactly — the student typed the word themselves, as they mostly do,
 * without the quantities — the fold decides instead, and an ambiguous spelling
 * lights every cell it could be. Both are true answers to what was pressed;
 * the first is only available when the text carries enough to give it.
 */
function pressedIn(
  paradigm: Paradigm | undefined,
  form: string,
): (spelling: string) => boolean {
  const folded = fold(form);
  if (!paradigm || folded === "") return () => false;
  const spellings = [
    ...paradigm.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.flat())),
    ...paradigm.other.map((other) => other.form),
  ];
  const exact = form.trim();
  if (spellings.includes(exact)) return (spelling) => spelling === exact;
  return (spelling) => fold(spelling) === folded;
}

/** One line of a further dictionary, with the emphasis its book set. */
function Marked({ text }: { text: string }) {
  return (
    <>
      {decodeRuns(text).map((run: Run, i) => {
        if (run.b) return <b key={i}>{run.text}</b>;
        if (run.i) return <i key={i}>{run.text}</i>;
        return <span key={i}>{run.text}</span>;
      })}
    </>
  );
}

/**
 * What a further dictionary says about this word.
 *
 * Rendered from the senses the source itself divided, rather than by running
 * the text past `parseBlocks`. That classifier is calibrated on the pack's
 * grammar — it reads a lowercase `a.` as a sub-point and knows nothing of
 * `A.` or `(b)` — and a lexicon that uses all three would come out flat, with
 * three of its five levels collapsed into the prose. The levels are in the
 * article because the book stated them; the only work left here is to indent.
 *
 * Below the paradigm, and collapsed: the sheet is opened to find out what a
 * word *is*, and `fero` runs to five hundred lines of Cicero. Whoever wants
 * them can open them.
 */
function ArticleBlock({
  label,
  licence,
  articles,
}: {
  label: string;
  licence: string;
  articles: DictionaryArticle[];
}) {
  return (
    <details className="inspect__lexicon">
      <summary className="gr-h">{label}</summary>
      {articles.map((article, i) => (
        <div key={i}>
          <p className="gr-p">
            <b {...l2Attrs}>{article.headword}</b>
            {article.homograph !== undefined && <sup>{article.homograph}</sup>}{" "}
            <Marked text={article.head} />
          </p>
          {article.senses.map((sense, j) => (
            // Indented by the level the book set, and capped: past the fourth
            // the indent costs more width than the structure is worth on a
            // phone, and the marker still says where you are.
            <p
              className="gr-p"
              key={j}
              style={{ marginInlineStart: `${Math.min(sense.level, 4) - 1}rem` }}
            >
              {sense.n && <b>{sense.n}. </b>}
              <Marked text={sense.text} />
            </p>
          ))}
        </div>
      ))}
      {/* Shown rather than filed in the profile: CC BY-SA asks for attribution
          where the work is read, and this is where it is read. */}
      <p className="field__hint">{licence}</p>
    </details>
  );
}

/**
 * What a word is, when you ask it directly.
 *
 * The grammar shows one noun of each declension and expects the student to see
 * that theirs follows it. That works until it doesn't — until the word is
 * irregular, or defective, or the student simply cannot tell which model it
 * belongs to, which is most of the time and exactly when the question comes up.
 * So a word can be asked for its own table.
 *
 * The layout is the pack's (`profile.paradigms`), read here rather than baked
 * in: which features are rows and which are columns is the language's business.
 *
 * Where the word came from is here too, folded away. It is the other question a
 * student asks a word directly, and the one this app could always have answered
 * and did not — the dump the dictionary was built out of has carried it all
 * along. Folded because it is prose of no fixed length and the tables are what
 * most double-clicks are after; near the top because it belongs with the gloss
 * rather than after three screens of endings.
 */
export function InspectSheet({
  form,
  entry,
  origin,
  others,
  forms,
  lexica,
  loading,
  failed,
  onRetry,
  onPick,
  onCopy,
  onClose,
}: {
  /** The word as it stood in the sentence, which is what was double-clicked. */
  form: string;
  entry: LemmaEntry;
  /**
   * Where this word comes from, in paragraphs — empty where the pack ships no
   * etymology, or ships one that says nothing about this word. The two are the
   * same silence on purpose: a Greek pack has none for anything, and no screen
   * should have to explain that.
   */
  origin: string[];
  /** The other readings of the same form; empty when it is unambiguous. */
  others: LemmaEntry[];
  /** This entry's tagged forms, or undefined until they arrive. */
  forms?: TaggedForm[];
  /**
   * What each further dictionary has on this word, by dictionary id. Empty
   * until they are fetched, which is the last thing the app fetches — so the
   * sheet is complete without them and gains them quietly.
   */
  lexica?: { id: string; label: string; licence: string; articles: DictionaryArticle[] }[];
  loading: boolean;
  /** The tables could not be fetched. Not the same as a word without any. */
  failed: boolean;
  onRetry: () => void;
  onPick: (entry: LemmaEntry) => void;
  /** The form onto the clipboard — as it stood, not the citation above it. */
  onCopy: () => void;
  onClose: () => void;
}) {
  // Closed on every open, including the one that follows picking another
  // reading of the same form — that is a new word, and a disclosure that stayed
  // open would be showing the previous word's answer under the new word's name.
  const [showOrigin, setShowOrigin] = useState(false);
  const blocks = profile.paradigms?.tables[entry.pos];
  // Laid out even when the pack declares no table for this `pos`: a Latin
  // adverb has a comparative and a superlative, and with no blocks to claim
  // them they fall to `other` and are listed. Passing `undefined` here instead
  // would render nothing at all and hide forms the word really has.
  const paradigm = forms
    ? buildParadigm(forms, blocks ?? [], profile.paradigms)
    : undefined;
  const isPressed = pressedIn(paradigm, form);

  /**
   * The wide tables scroll sideways inside their own box, so the cell that was
   * picked out can sit off the edge of a phone — a verb is six columns, and the
   * highlight would then be a thing the student has to go looking for, which is
   * the state this whole feature exists to end. So the first one is brought
   * into view, by moving the box rather than by `scrollIntoView`, which would
   * take the sheet along with it.
   *
   * Keyed on the word rather than on the render: the effect re-runs freely, and
   * a cell already in view is left alone, so nothing moves under a finger that
   * has scrolled the table somewhere else.
   */
  const tablesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cell = tablesRef.current?.querySelector("td[aria-current]");
    const wrap = cell?.closest(".gr-tablewrap");
    if (!(cell instanceof HTMLElement) || !(wrap instanceof HTMLElement)) return;
    // Measured rather than read off `offsetLeft`, whose origin is whatever
    // ancestor happens to be positioned and is not this box.
    const at = cell.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    if (at.left >= box.left && at.right <= box.right) return;
    wrap.scrollLeft += at.left - box.left - (box.width - at.width) / 2;
  }, [form, entry.lemma, entry.pos, forms?.length]);

  return (
    // The button copies the subtitle, not the title: the word wanted in a note
    // or a message is the one that was on the screen, and a double-click is
    // often the moment you find you want it. The citation is one tap of that
    // away in any dictionary; the inflected form is the thing this app has and
    // the page you paste into does not.
    <Sheet
      title={entry.citation}
      subtitle={form}
      action={<CopyButton what={form} onCopy={onCopy} />}
      onClose={onClose}
    >
      <p className="gr-p">{entry.gloss}</p>
      <p className="field__hint">
        {[entry.pos, entry.gender, entry.declension && `declension ${entry.declension}`]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/* Nothing at all where there is nothing to say. A line reading "no
          etymology recorded" would be on most words of any pack — the dump
          writes one for a fraction of what it holds — and would turn an
          ordinary silence into a defect on every second word. */}
      {origin.length > 0 && (
        <div className="crib">
          <button
            className="crib__toggle"
            aria-expanded={showOrigin}
            aria-controls="word-etymology"
            onClick={() => setShowOrigin((on) => !on)}
          >
            <span className="crib__caret" aria-hidden="true">
              {showOrigin ? "▾" : "▸"}
            </span>
            Etymology
          </button>
          {showOrigin && (
            <div className="crib__list crib__list--prose" id="word-etymology">
              {origin.map((para, i) => (
                <p className="gr-p" key={i}>
                  {para}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="inspect__others">
          {/* The form is ambiguous and the commonest reading is showing. No
              dialog in the way: this is a look, not a decision, and the other
              readings are one tap each. */}
          <p className="field__hint">Also read as:</p>
          {others.map((other) => (
            <button
              className="chip"
              key={`${other.lemma}|${other.pos}`}
              onClick={() => onPick(other)}
            >
              {other.citation}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="field__hint">
          <Spinner /> Fetching the tables — this happens once.
        </p>
      )}

      <div ref={tablesRef}>
        {paradigm?.tables.map((table, i) => {
          // Which stubs to light with the cells. A cell on its own says where
          // the word is only once you have traced two edges of the grid with a
          // finger, and the answer wanted — "accusative singular" — is written
          // in the stubs. Both axes, and every hit: one form standing in three
          // cells is what syncretism looks like, and naming one of them would
          // be inventing a distinction the word does not make.
          const hereRows = new Set<number>();
          const hereColumns = new Set<number>();
          table.rows.forEach((row, j) =>
            row.cells.forEach((cell, k) => {
              if (!cell.some(isPressed)) return;
              hereRows.add(j);
              hereColumns.add(k);
            }),
          );
          return (
            <div key={i}>
              {table.title && <h3 className="gr-h">{table.title}</h3>}
              <TableBox>
                <tr className="gr-row--head">
                  <th scope="col" />
                  {table.columns.map((column, j) => (
                    <th
                      key={j}
                      scope="col"
                      className={hereColumns.has(j) ? "gr-th--here" : undefined}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
                {table.rows.map((row, j) => (
                  <tr key={j} className="gr-row--body">
                    <th scope="row" className={hereRows.has(j) ? "gr-th--here" : undefined}>
                      {row.label}
                    </th>
                    {row.cells.map((cell, k) => (
                      // Two forms in one cell is the ordinary case, not an error:
                      // `amāvistī` and its syncopated `amāstī` are both the perfect
                      // second singular, and a grammar prints both — so the mark
                      // goes on the spelling that was pressed rather than on the
                      // cell holding it, which would claim the other one too.
                      <td
                        key={k}
                        {...l2Attrs}
                        // The cell the student is standing in, said to a screen
                        // reader, which has no colour to go on — and the hook
                        // the scroll below finds it by.
                        aria-current={cell.some(isPressed) ? "true" : undefined}
                      >
                        {cell.length === 0
                          ? "—"
                          : cell.map((spelling, n) => (
                              <Fragment key={n}>
                                {n > 0 && " · "}
                                {isPressed(spelling) ? (
                                  <mark className="form--here">{spelling}</mark>
                                ) : (
                                  spelling
                                )}
                              </Fragment>
                            ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </TableBox>
            </div>
          );
        })}
      </div>

      {paradigm && paradigm.other.length > 0 && (
        <>
          <h3 className="gr-h">Other forms</h3>
          <div className="list">
            {paradigm.other.map((other, i) => (
              // The pressed word can be one of these rather than a cell — a
              // participle, an infinitive, a supine — and it is no less the
              // thing that was asked about for being off the grid.
              <div className="row row--static" key={i}>
                <span className="row__main">
                  <span {...l2Attrs} className="row__title">
                    {isPressed(other.form) ? (
                      <mark className="form--here">{other.form}</mark>
                    ) : (
                      other.form
                    )}
                  </span>
                  <span className="row__sub">{other.tags.join(", ")}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Only the last branch may say anything about the word itself.
          `forms` is undefined until the paradigms arrive, and stays undefined
          if the fetch failed — reporting either as "this word does not change"
          told a student a plain falsehood about a word that declines. */}
      {!loading && !forms && failed && (
        <p className="field__hint">
          Could not load the inflection tables.{" "}
          <button onClick={onRetry}>Try again</button>
        </p>
      )}

      {/* Indeclinable, or a word the tables were never built for. Saying so is
          better than an empty sheet that reads as a failure. */}
      {!loading && forms && !paradigm?.tables.length && !paradigm?.other.length && (
        <p className="field__hint">
          {blocks
            ? "No inflected forms — this word does not change."
            : "No tables are built for this part of speech."}
        </p>
      )}

      {/* A dictionary with nothing on this word is not mentioned at all. The
          sheet already answered the question; an empty "Lewis & Short" heading
          would only look like something had failed. */}
      {(lexica ?? [])
        .filter((book) => book.articles.length > 0)
        .map((book) => (
          <ArticleBlock
            key={book.id}
            label={book.label}
            licence={book.licence}
            articles={book.articles}
          />
        ))}
    </Sheet>
  );
}
