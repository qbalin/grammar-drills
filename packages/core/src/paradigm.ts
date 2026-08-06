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

/**
 * Which variety of the language a pack teaches, as tags.
 *
 * A cell keeps only its best spellings: most `primary` tags first, then fewest
 * `secondary`. Without this a Greek genitive singular offers five spellings
 * and the student has no way to tell which one the grammar they are reading
 * means. Both halves earn their place. `βασιλέως` beats `βασιλῆος` on the
 * second rule, being marked Ionic once where its rival is marked Epic as well
 * — so this counts marks rather than excluding them, because in Greek the
 * standard form is usually marked too. `τῆς` beats Doric `τᾶς` only on the
 * first, the two being marked twice apiece and one of them Attic.
 *
 * A pack that declares neither keeps every spelling of every cell, which is
 * the right answer for a language whose variants are all being taught.
 */
export interface ParadigmVariety {
  /** Tags naming the variety being taught. */
  primary?: string[];
  /** Tags naming some other dialect, register or period. */
  secondary?: string[];
}

/** How each part of speech is laid out, and what counts as a marked form. */
export interface ParadigmAxes extends ParadigmVariety {
  /** The tables, by `pos`. A `pos` absent here shows no table. */
  tables: Record<string, ParadigmBlock[]>;
}

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
 * A row or column with nothing in it is dropped: most Latin nouns have no
 * locative and most Greek words are never written in the dual, and an empty
 * line reads as a gap in the word rather than a gap in the language.
 */
export function buildParadigm(
  forms: TaggedForm[],
  blocks: ParadigmBlock[],
  variety: ParadigmVariety = {},
): Paradigm {
  const primary = new Set(variety.primary ?? []);
  const secondary = new Set(variety.secondary ?? []);
  /** Lower is better: primary tags earn credit, secondary ones cost. */
  const marked = (form: TaggedForm) =>
    form.tags.filter((tag) => secondary.has(tag)).length -
    form.tags.filter((tag) => primary.has(tag)).length * (secondary.size + 1);

  const tables: ParadigmTableData[] = [];
  const placed = new Set<TaggedForm>();

  for (const block of blocks) {
    const cells = block.rows.map(() => block.columns.map((): TaggedForm[] => []));
    for (const form of forms) {
      const tags = new Set(form.tags);
      for (const { row, column } of place(tags, block.rows, block.columns)) {
        placed.add(form);
        cells[row]![column]!.push(form);
      }
    }

    const spellings = (cell: TaggedForm[]) => {
      const fewest = Math.min(...cell.map(marked));
      const out: string[] = [];
      for (const form of cell) {
        // The same spelling can arrive twice — Greek writes one form under
        // several dialects — but it is one spelling and is printed once.
        if (marked(form) === fewest && !out.includes(form.form)) out.push(form.form);
      }
      return out;
    };
    const laid = cells.map((row) => row.map(spellings));

    const keptColumns = block.columns
      .map((axis, c) => ({ axis, c }))
      .filter(({ c }) => laid.some((row) => row[c]!.length > 0));
    const rows = block.rows
      .map((axis, r) => ({ label: axis.label, cells: keptColumns.map(({ c }) => laid[r]![c]!) }))
      .filter((row) => row.cells.some((cell) => cell.length > 0));
    if (!rows.length) continue;
    tables.push({
      title: block.title,
      columns: keptColumns.map(({ axis }) => axis.label),
      rows,
    });
  }

  return { tables, other: forms.filter((form) => !placed.has(form)) };
}
