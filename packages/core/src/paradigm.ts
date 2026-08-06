/**
 * Turning a word's tagged forms into the grid a grammar book prints.
 *
 * The reference gives every inflected form a set of feature tags —
 * `{dative, plural}`, `{active, indicative, perfect, third-person, plural}` —
 * and says nothing about how they are laid out. Which features are the rows,
 * which are the columns, what order they go in and what they are called is the
 * language's business, so it arrives on the profile and this reads it.
 *
 * The engine therefore knows what a paradigm *is* without knowing any
 * language's: `scripts/check-core-purity.mjs` would fail this file if it named
 * one, and the tag vocabulary below is the pack's own text passing through.
 */

/** One position on an axis: the tags that place a form there, and its stub. */
export interface ParadigmAxis {
  tags: string[];
  label: string;
}

/**
 * One table. A language that prints its verb as several tables — indicative,
 * subjunctive, imperative — declares several blocks rather than one grid with
 * thirty rows, and a language whose nouns need only one leaves the title off.
 */
export interface ParadigmBlock {
  title?: string;
  rows: ParadigmAxis[];
  columns: ParadigmAxis[];
}

/** How one part of speech is laid out. Packs declare these by `pos`. */
export type ParadigmAxes = Record<string, ParadigmBlock[]>;

/** A form as the built artifact holds it: written as it is, and tagged. */
export interface TaggedForm {
  form: string;
  tags: string[];
}

/** A block with its forms in place, rows and columns that had none dropped. */
export interface ParadigmTableData {
  title?: string;
  /** Column stubs, in declared order. */
  columns: string[];
  /** One entry per surviving row: its stub and its forms, column by column. */
  rows: { label: string; cells: string[][] }[];
}

/** Every table a word has, and whatever did not fit one. */
export interface Paradigm {
  tables: ParadigmTableData[];
  /** Participles, infinitives, comparatives — real forms, off the grid. */
  other: TaggedForm[];
}

/**
 * Which cells a form belongs in.
 *
 * A cell claims a form when its tags are all present on the form, and the
 * *most specific* claim wins: a perfect-tense cell and a future-perfect cell
 * both fit `{active, future, indicative, perfect, …}`, and only the second is
 * the right answer. Ties are kept rather than broken, because a tie is what
 * syncretism looks like from here — one dative plural serving three genders is
 * three equally good claims, and a grammar book prints it three times.
 */
function place(
  tags: Set<string>,
  rows: ParadigmAxis[],
  columns: ParadigmAxis[],
): { row: number; column: number }[] {
  const holds = (axis: ParadigmAxis) => axis.tags.every((tag) => tags.has(tag));
  const hits: { row: number; column: number; score: number }[] = [];
  let best = 0;
  for (let r = 0; r < rows.length; r++) {
    if (!holds(rows[r]!)) continue;
    for (let c = 0; c < columns.length; c++) {
      if (!holds(columns[c]!)) continue;
      const score = rows[r]!.tags.length + columns[c]!.tags.length;
      if (score > best) best = score;
      hits.push({ row: r, column: c, score });
    }
  }
  return hits.filter((h) => h.score === best);
}

/**
 * Lay `forms` out according to `blocks`.
 *
 * A row with nothing in it is dropped — most Latin nouns have no locative, and
 * an empty row reads as a gap in the word rather than a gap in the language.
 * Columns are kept whole, so the shapes of two words' tables can be compared.
 */
export function buildParadigm(forms: TaggedForm[], blocks: ParadigmBlock[]): Paradigm {
  const tables: ParadigmTableData[] = [];
  const placed = new Set<TaggedForm>();

  for (const block of blocks) {
    const cells = block.rows.map(() => block.columns.map((): string[] => []));
    for (const form of forms) {
      const tags = new Set(form.tags);
      for (const { row, column } of place(tags, block.rows, block.columns)) {
        placed.add(form);
        // The same form can arrive twice — a spelling variant tagged
        // `alternative` sits beside the plain one — but never twice identically.
        if (!cells[row]![column]!.includes(form.form)) cells[row]![column]!.push(form.form);
      }
    }
    const rows = block.rows
      .map((axis, r) => ({ label: axis.label, cells: cells[r]! }))
      .filter((row) => row.cells.some((cell) => cell.length > 0));
    if (!rows.length) continue;
    tables.push({ title: block.title, columns: block.columns.map((c) => c.label), rows });
  }

  return { tables, other: forms.filter((form) => !placed.has(form)) };
}
