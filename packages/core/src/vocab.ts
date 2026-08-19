import { deserializeCard, newCard, preview, rate, serializeCard, type Rating } from "./scheduler.js";
import type { Fold } from "./fold.js";
import { foldKey, words } from "./question-vocab.js";
import type {
  LemmaEntry,
  NewVocabContext,
  Progress,
  VocabCardState,
  VocabContext,
} from "./types.js";

/**
 * How many sentences one word may keep.
 *
 * Eight is a lot of sentences for one word. Past that the card's back becomes a
 * wall and the progress file grows without a student ever asking it to. A word
 * met eight times does not need a ninth sentence to be memorable. The limit is
 * told to the caller rather than enforced in silence, and deleting one makes
 * room again.
 */
export const MAX_CONTEXTS = 8;

/**
 * What became of a sentence offered to a card. Four ways for it not to land,
 * said apart, because a surface that reported them all as "saved" would flash a
 * confirmation for a press that did nothing.
 */
export type ContextOutcome = "added" | "duplicate" | "full" | "off" | "missing";

/**
 * Two contexts are the same context when the prompt and the sentence fold alike.
 *
 * `source` is deliberately out of the key. A word held in the reference answer
 * and again in what the student wrote is one sentence twice when the answer was
 * right — and it is right exactly when what they wrote folds equal to the
 * reference, so holding a word in both texts of one question keeps one sentence,
 * which is the same judgement `answerMatches` makes on the same two strings.
 *
 * `index` is out of it too. Same card, same sentence, different index only
 * happens when one lemma stands twice in a line, and that is one context with
 * two possible highlights; the first one wins.
 */
function contextKey(context: NewVocabContext, fold: Fold): string {
  return `${foldKey(context.prompt, fold)}\n${foldKey(context.sentence, fold)}`;
}

/**
 * Every word the student has recorded, and the sentences they met it in.
 *
 * Lifted out of `Session`, which was a class of seventy-eight methods doing five
 * jobs, and this was the most self-contained of them: a store of cards, a
 * scheduler track of its own, and the contexts hanging off each card. Nothing
 * here knows about topics, rounds, the book cursor or the syllabus.
 *
 * It reads the progress through a **getter** rather than holding the record.
 * `Session.restore` replaces `this.p` wholesale for an undo, and a deck that had
 * captured `vocabCards` at construction would go on writing to the object the
 * undo threw away — silently, since both are real objects and neither read
 * throws.
 *
 * `Session` keeps a delegating method for each of these, so no caller changed
 * and no test moved. That is a layer of indirection bought on purpose: the
 * alternative was changing the shape of the engine's public surface in the same
 * commit that moved the code, which is two things to review as one.
 */
export class VocabDeck {
  constructor(
    private readonly progress: () => Progress,
    private readonly fold: Fold,
    private readonly lookup: (lemma: string) => LemmaEntry[],
    /** The generation of citations the shipped dictionary is at. */
    private readonly citationsVersion: number,
    private readonly touch: () => void,
  ) {}

  private get p(): Progress {
    return this.progress();
  }

  /** The same, for a vocabulary card; undefined if there is no such card. */
  /** The same, for a vocabulary card; undefined if there is no such card. */
  previewVocab(
    cardId: string,
    now: Date = new Date(),
  ): Record<Rating, Date> | undefined {
    const stored = this.p.vocabCards[cardId];
    return stored ? preview(deserializeCard(stored.fsrs), now) : undefined;
  }

  /**
   * Record an unknown word from its inflected form. The canonical citation is
   * supplied by the caller after resolving it via `content.lookup`. Deduped by
   * lemma so re-recording the same word is a no-op. Returns the card id.
   */
  recordVocab(entry: LemmaEntry, now: Date = new Date()): string {
    const id = this.vocabIdFor(entry);
    if (!this.p.vocabCards[id]) {
      this.p.vocabCards[id] = {
        ...entry,
        id,
        created: now.toISOString(),
        fsrs: serializeCard(newCard(now)),
      };
      this.touch();
    }
    return id;
  }

  gradeVocab(cardId: string, rating: Rating, now: Date = new Date()): void {
    const state = this.p.vocabCards[cardId];
    if (!state) return;
    const card = rate(deserializeCard(state.fsrs), rating, now);
    state.fsrs = serializeCard(card);
    this.touch();
  }

  vocabCard(cardId: string): VocabCardState | undefined {
    return this.p.vocabCards[cardId];
  }

  /** Every word recorded, in dictionary order. */
  vocabList(): VocabCardState[] {
    return Object.values(this.p.vocabCards).sort((a, b) =>
      this.fold(a.citation).localeCompare(this.fold(b.citation)),
    );
  }

  /**
   * Correct a card's two sides. The id and the scheduling are left alone, so
   * fixing a citation months in never costs the card its history — which is the
   * only reason editing is safe to offer at any time.
   *
   * The edit reaches this card and nothing else. The dictionary is shipped
   * content, built offline and read-only here, so a corrected citation was
   * never going to be written back to it — but the reverse was true and is the
   * same mistake from the other side: `refreshCitations` used to overwrite a
   * hand-written citation the next time the pack shipped a new dictionary, so
   * the correction lasted only until the next rebuild and the dictionary still
   * effectively owned the card. A citation the student has written is theirs
   * from then on, and is marked as such here.
   */
  updateVocab(
    cardId: string,
    patch: Partial<Pick<VocabCardState, "citation" | "gloss">>,
  ): void {
    const card = this.p.vocabCards[cardId];
    if (!card) return;
    if (patch.citation !== undefined) {
      const citation = patch.citation.trim();
      // Only a real change claims the card. Opening the sheet and saving it
      // untouched is not the student saying the dictionary is wrong.
      if (citation !== card.citation) card.citationEdited = true;
      card.citation = citation;
    }
    // The gloss needs no such mark: nothing ever rewrites it from the
    // dictionary, so an edited meaning is already the student's for good.
    if (patch.gloss !== undefined) card.gloss = patch.gloss.trim();
    this.touch();
  }

  /**
   * The card id a given entry would take, without creating one.
   *
   * The `v-` rule in one place, so a surface can ask "did I already have this
   * word" before recording it — which is the difference between *Saved* and
   * *another sentence on a word you already had*.
   */
  vocabIdFor(entry: LemmaEntry): string {
    return `v-${this.fold(entry.lemma)}`;
  }

  /** Every context on a card, in the student's own order. */
  vocabContexts(cardId: string): VocabContext[] {
    return this.p.vocabCards[cardId]?.contexts ?? [];
  }

  /** Whether a recorded word keeps the sentence it was met in. */
  keepsContext(): boolean {
    return this.p.keepContext !== false;
  }

  setKeepContext(on: boolean): void {
    this.p.keepContext = on;
    this.touch();
  }

  /**
   * Offer a card the sentence its word was met in.
   *
   * Apart from `recordVocab` rather than an argument to it, because the two are
   * different questions with different answers: recording a word the student
   * already has is a no-op, and attaching a second sentence to that same word is
   * the whole point of this. `recordVocab` therefore keeps both its signature
   * and its promise never to rewrite a card that already exists — a second
   * recording that reset a corrected citation would be a silent one.
   *
   * The preference is checked here rather than at the call sites, so the phone
   * and the terminal cannot drift apart on it, and the outcome comes back so a
   * surface can say what actually happened instead of flashing a save.
   */
  addVocabContext(
    cardId: string,
    context: NewVocabContext,
    now: Date = new Date(),
  ): ContextOutcome {
    if (!this.keepsContext()) return "off";
    const card = this.p.vocabCards[cardId];
    if (!card) return "missing";
    const held = card.contexts ?? [];
    const key = contextKey(context, this.fold);
    if (held.some((c) => contextKey(c, this.fold) === key)) {
      return "duplicate";
    }
    if (held.length >= MAX_CONTEXTS) return "full";
    card.contexts = [...held, { ...context, at: this.freeStamp(held, now) }];
    this.touch();
    return "added";
  }

  /**
   * A timestamp no context on this card already carries.
   *
   * `at` is a context's identity — it is what a delete, an edit and a move all
   * name it by — so two sharing one would be one context that cannot be told
   * from another: deleting either would delete both. A hold gesture is
   * human-paced and will not collide, but nothing here is only ever driven by a
   * thumb: an import, a test, or two sentences attached in one turn all land in
   * the same millisecond. Nudged forward rather than made from a counter,
   * because the value still has to read as when the word was met.
   */
  private freeStamp(held: VocabContext[], now: Date): string {
    let at = now.getTime();
    const taken = new Set(held.map((c) => c.at));
    while (taken.has(new Date(at).toISOString())) at += 1;
    return new Date(at).toISOString();
  }

  /**
   * Correct one context's two texts.
   *
   * `source` is not patchable: rewriting the words of your own sentence does not
   * make it the reference, and the label is the only thing standing between a
   * card and quietly teaching back a mistake.
   */
  updateVocabContext(
    cardId: string,
    at: string,
    patch: Partial<Pick<VocabContext, "prompt" | "sentence">>,
  ): void {
    const context = this.p.vocabCards[cardId]?.contexts?.find((c) => c.at === at);
    if (!context) return;
    if (patch.prompt !== undefined) context.prompt = patch.prompt.trim();
    if (patch.sentence !== undefined) {
      // The picked-out word has to be found again in the rewritten sentence, or
      // the highlight would go on pointing at whatever word now sits in that
      // slot — which is worse than no highlight, because it looks deliberate.
      // The old sentence and the old index together are the word, right up
      // until the edit lands, so nothing needs to have been stored to do this.
      const held =
        context.index === undefined
          ? undefined
          : words(context.sentence)[context.index];
      context.sentence = patch.sentence.trim();
      if (held !== undefined) {
        const found = words(context.sentence).findIndex(
          (word) => this.fold(word) === this.fold(held),
        );
        if (found >= 0) context.index = found;
        else delete context.index;
      }
    }
    this.touch();
  }

  /** Forget one context. The card, and every other context on it, stay. */
  deleteVocabContext(cardId: string, at: string): void {
    const card = this.p.vocabCards[cardId];
    if (!card?.contexts) return;
    const left = card.contexts.filter((c) => c.at !== at);
    if (left.length === card.contexts.length) return;
    // Absent rather than empty, so a card cleared of contexts reads on disk
    // exactly like one that never had any.
    if (left.length === 0) delete card.contexts;
    else card.contexts = left;
    this.touch();
  }

  /**
   * Move one context one place towards the front (-1) or the back (1).
   *
   * A swap with its neighbour rather than a whole-order setter, because the
   * surface is a pair of buttons and a swap is exactly what a button press
   * knows. A setter would make every handler read the list, splice it and hand
   * back an array — and under a last-writer-wins sync, one device's whole order
   * would wipe the other's, where a swap at worst leaves a local disturbance.
   *
   * Clamped at the ends rather than wrapping: a button that teleports the top
   * row to the bottom is a bug report.
   */
  moveVocabContext(cardId: string, at: string, by: -1 | 1): void {
    const card = this.p.vocabCards[cardId];
    if (!card?.contexts) return;
    const from = card.contexts.findIndex((c) => c.at === at);
    const to = from + by;
    if (from < 0 || to < 0 || to >= card.contexts.length) return;
    const moved = [...card.contexts];
    [moved[from], moved[to]] = [moved[to]!, moved[from]!];
    card.contexts = moved;
    this.touch();
  }

  /**
   * Put a deleted card back exactly as it was — id, schedule, contexts and all.
   *
   * The way back from the way back. Deleting a word is the one destructive
   * thing a student can do to their own deck by a single press, and it was the
   * only such press in the app with no undo: a grade has one, and this had a
   * toast that said it had happened and nothing else.
   *
   * The card itself is handed back rather than a snapshot of the whole
   * progress, which is what the grade undo restores. That matters here: the
   * toast lasts 2.6 seconds and a student can answer a question inside it, and
   * a whole-progress restore would quietly take that grade back too. This puts
   * one card back and touches nothing else.
   *
   * A no-op if something already sits under that id — re-recording the word by
   * hand before pressing undo is the student saying what they want, and this
   * must not overwrite it with the older copy.
   */
  restoreCard(card: VocabCardState): void {
    if (this.p.vocabCards[card.id]) return;
    this.p.vocabCards[card.id] = card;
    this.touch();
  }

  /** Forget a word — the way back from a card saved by a stray press. */
  deleteVocab(cardId: string): void {
    if (!this.p.vocabCards[cardId]) return;
    delete this.p.vocabCards[cardId];
    this.touch();
  }

  /**
   * Bring saved cards up to the shipped dictionary's current citations.
   *
   * A card keeps its own copy of the citation, so rebuilding the dictionary —
   * giving verbs their four principal parts, say — would otherwise reach only
   * words recorded afterwards. Runs once per generation.
   *
   * A card whose citation the student has written is skipped. This is what
   * makes editing one mean anything: a correction that a later rebuild undoes
   * is a correction the student has to make again, and they have no way to know
   * it was undone. The dictionary's improvements are for the cards that are
   * still the dictionary's.
   *
   * Returns how many cards changed. A no-op when the dictionary is not loaded:
   * every lookup misses, so nothing is overwritten with nothing.
   */
  refreshCitations(): number {
    if ((this.p.citationsVersion ?? 1) >= this.citationsVersion) return 0;
    let changed = 0;
    let looked = false;
    for (const card of Object.values(this.p.vocabCards)) {
      const candidates = this.lookup(card.lemma);
      // Looked up even when the card is the student's, so that a run which
      // skips every card still counts as a dictionary having been consulted
      // and stamps the generation. Otherwise this would re-run at every launch
      // for as long as the student's own cards were the only ones they had.
      if (candidates.length > 0) looked = true;
      if (card.citationEdited) continue;
      const match = candidates.find(
        (c) => c.lemma === card.lemma && c.pos === card.pos,
      );
      if (match && match.citation !== card.citation) {
        card.citation = match.citation;
        changed += 1;
      }
    }
    // Only claim the generation once a dictionary was actually consulted;
    // otherwise an offline launch would mark the cards done without reading one.
    if (looked || Object.keys(this.p.vocabCards).length === 0) {
      this.p.citationsVersion = this.citationsVersion;
    }
    if (changed > 0 || looked) this.touch();
    return changed;
  }
}
