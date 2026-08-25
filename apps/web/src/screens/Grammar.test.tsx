import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GrammarSection } from "@lang-tutor/core";
import { GrammarSheet } from "./Grammar.js";

/**
 * A section carrying every shape the reader has to cope with: prose, a
 * numbered point, a lettered sub-point, and a paradigm with a caption row and
 * a SINGULAR/PLURAL divider.
 */
const section: GrammarSection = {
  id: "bn-090-interrogative-pronouns",
  ref: "90",
  title: "Interrogative Pronouns",
  family: "pron",
  order: 10,
  text: [
    "The Interrogative Pronouns are quis and quī.",
    "1. Quis, who?",
    "MASC.  NEUT.",
    "SINGULAR.",
    "Nom.  quis  quid",
    "Gen.  cūjus  cūjus",
    "PLURAL.",
    "Nom.  quī  quae",
    "a. An old Ablative quī occurs.",
  ].join("\n"),
};

const mount = () =>
  render(<GrammarSheet section={section} onClose={() => {}} />);

/** The sections either side of it in the book. */
const before: GrammarSection = {
  id: "bn-089-reflexive-pronouns",
  ref: "89",
  title: "Reflexive Pronouns",
  family: "pron",
  order: 9,
  text: "The Reflexive Pronoun of the third person is sē.",
};
const after: GrammarSection = {
  id: "bn-091-relative-pronouns",
  ref: "91",
  title: "Relative Pronouns",
  family: "pron",
  order: 11,
  text: "The Relative Pronoun is quī.",
};

/**
 * The reader with the book around it, which is the only way it pages.
 *
 * jsdom has no `PointerEvent`, so a fired `pointerdown` carries no coordinates
 * at all and every swipe would measure `NaN`. A `MouseEvent` under the pointer
 * event's name is what React listens for anyway, and it does carry them — see
 * `swipe` for the one field it does not.
 */
function mountPaged(props: Partial<Parameters<typeof GrammarSheet>[0]> = {}) {
  const onPage = vi.fn();
  render(
    <GrammarSheet
      section={section}
      prev={before}
      next={after}
      onPage={onPage}
      onClose={() => {}}
      {...props}
    />,
  );
  return { onPage };
}

/**
 * A finger crossing the page, from x to x, drifting `dy` as it goes — or, given
 * a `pointerType`, whatever else is doing the crossing.
 *
 * `MouseEvent` has no `pointerType` of its own, and none on its prototype
 * either, so the field can simply be put on the instance: React reads it off
 * the native event exactly where a real `PointerEvent` would have carried it.
 */
function swipe(
  from: number,
  to: number,
  dy = 0,
  at?: Element,
  pointerType = "touch",
) {
  const on = at ?? document.querySelector(".reader")!;
  const point = (name: string, x: number, y: number) =>
    Object.assign(new MouseEvent(name, { clientX: x, clientY: y, bubbles: true }), {
      pointerType,
    });
  fireEvent(on, point("pointerdown", from, 100));
  fireEvent(on, point("pointerup", to, 100 + dy));
}

describe("the grammar reader", () => {
  it("sets a paradigm as a table, so its columns line up", () => {
    mount();
    const table = screen.getByRole("table");
    // Three columns: the case labels and the two genders.
    const row = within(table).getByRole("row", { name: /quis/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Nom.",
      "quis",
      "quid",
    ]);
  });

  it("puts a short caption over the forms, not over the case labels", () => {
    mount();
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    // The stub column gets the empty cell; the genders sit over the forms.
    expect(heads).toEqual(["", "MASC.", "NEUT."]);
  });

  it("keeps one paradigm in one table across its divider", () => {
    mount();
    // Two tables would size their columns apart and the endings would stop
    // lining up down the page.
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByText("PLURAL.")).toBeDefined();
  });

  it("separates a list marker from what it introduces, so it can hang", () => {
    mount();
    expect(screen.getByText("1.")).toBeDefined();
    expect(screen.getByText("Quis, who?")).toBeDefined();
    expect(screen.getByText("a.")).toBeDefined();
    expect(screen.getByText("An old Ablative quī occurs.")).toBeDefined();
  });

  it("indents a lettered sub-point deeper than a numbered point", () => {
    mount();
    const level = (marker: string) =>
      screen.getByText(marker).parentElement!.className;
    expect(level("1.")).toContain("gr-item--1");
    expect(level("a.")).toContain("gr-item--2");
  });

  it("keeps the prose as prose", () => {
    mount();
    const para = screen.getByText("The Interrogative Pronouns are quis and quī.");
    expect(para.tagName).toBe("P");
  });

  it("shows the emphasis the grammar set a form in", () => {
    // Bennett bolds the *ending* inside the form and italicises the gloss;
    // without them a paradigm is a list of words with nothing marking which
    // part is the lesson.
    render(
      <GrammarSheet
        section={{ ...section, text: "am⟦b:ō⟧, ⟦i:I love⟧  am⟦b:āmus⟧" }}
        onClose={() => {}}
      />,
    );
    const cell = screen.getAllByRole("cell")[0]!;
    expect(cell.textContent).toBe("amō, I love");
    expect(within(cell).getByText("ō").className).toBe("gr-b");
    expect(within(cell).getByText("I love").className).toBe("gr-i");
  });

  it("leaves a pack whose source carries no emphasis exactly as it was", () => {
    mount();
    const cell = screen.getByRole("row", { name: /quis/ });
    expect(within(cell).queryByText("", { selector: ".gr-b, .gr-i" })).toBeNull();
  });
});

/**
 * Reading rarely stops at one section, and the book is in order — so the
 * neighbours are a swipe away rather than a close, a map and another pick.
 */
describe("turning the page", () => {
  it("names what is either side, so the gesture is not the only way through", () => {
    mountPaged();
    expect(
      screen.getByRole("button", { name: "Previous section: § 89 Reflexive Pronouns" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Next section: § 91 Relative Pronouns" }),
    ).toBeDefined();
  });

  it("offers nothing off either end of the book", () => {
    mountPaged({ prev: undefined });
    expect(screen.queryByRole("button", { name: /Previous section/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Next section/ })).toBeDefined();
  });

  it("goes forward on a swipe left and back on a swipe right", () => {
    const { onPage } = mountPaged();
    swipe(240, 100);
    expect(onPage).toHaveBeenCalledWith(after);
    swipe(100, 240);
    expect(onPage).toHaveBeenLastCalledWith(before);
  });

  it("takes a short drag as a tap that wandered, not a page turn", () => {
    const { onPage } = mountPaged();
    swipe(200, 170);
    expect(onPage).not.toHaveBeenCalled();
  });

  it("takes a mostly vertical drag as the reading it was", () => {
    // A section runs to hundreds of lines; a thumb scrolling one is never
    // perfectly straight, and losing the page over it would be maddening.
    const { onPage } = mountPaged();
    swipe(200, 120, 300);
    expect(onPage).not.toHaveBeenCalled();
  });

  it("leaves a swipe over a wide paradigm to the paradigm", () => {
    // Six columns of endings scroll sideways inside their own box. A finger
    // that starts there is reading the table, and turning the page under it
    // would put the endings it was crossing to out of reach.
    const { onPage } = mountPaged();
    const wrap = document.querySelector(".gr-tablewrap")!;
    Object.defineProperty(wrap, "scrollWidth", { value: 600, configurable: true });
    Object.defineProperty(wrap, "clientWidth", { value: 320, configurable: true });
    swipe(240, 100, 0, wrap);
    expect(onPage).not.toHaveBeenCalled();
  });

  it("leaves a drag with a mouse to the reader selecting the line", () => {
    // The same travel that pages under a finger is, with a mouse, somebody
    // taking a line of the grammar to copy — and a page turning out from under
    // the selection is what they get instead of it. The type goes on both
    // events, so this stays true wherever the gate is read.
    const { onPage } = mountPaged();
    swipe(240, 100, 0, undefined, "mouse");
    expect(onPage).not.toHaveBeenCalled();
  });

  it("turns the same two pages from a keyboard", () => {
    const { onPage } = mountPaged();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onPage).toHaveBeenCalledWith(after);
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(onPage).toHaveBeenLastCalledWith(before);
  });

  it("stays one page when nothing pages it", () => {
    mount();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: /section/ })).toBeNull();
  });

  it("leads from the page being read to what can be done with it", () => {
    const onStudy = vi.fn();
    mountPaged({ onStudy });
    fireEvent.click(
      screen.getByRole("button", { name: "Study Interrogative Pronouns" }),
    );
    expect(onStudy).toHaveBeenCalled();
  });
});

/**
 * The mark a student makes on the page they are making it about.
 *
 * It is offered in the index too, on the topic's own sheet — but the moment you
 * know a section is one to come back to is a moment spent reading it, and until
 * this was here that moment cost a way out of the book and back in.
 */
describe("bookmarking the page being read", () => {
  it("says which way the press goes, and reports the state it is in", () => {
    const onBookmark = vi.fn();
    mountPaged({ onBookmark, bookmarked: false });

    const set = screen.getByRole("button", { name: "Bookmark Interrogative Pronouns" });
    expect(set.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(set);
    expect(onBookmark).toHaveBeenCalled();
  });

  it("names the press for taking it off again, once it is on", () => {
    mountPaged({ onBookmark: vi.fn(), bookmarked: true });
    const off = screen.getByRole("button", {
      name: "Remove bookmark from Interrogative Pronouns",
    });
    expect(off.getAttribute("aria-pressed")).toBe("true");
    expect(off.className).toContain("iconbtn--marked");
  });

  it("offers nothing to a reader mounted without a way to set one", () => {
    /*
     * The props are optional so that this sheet can be shown as it was before
     * it could mark anything. The app itself always hands both over now: a
     * bookmark is filed under the page's own id, so there is no longer a
     * section that cannot carry one.
     */
    mountPaged();
    expect(screen.queryByRole("button", { name: /^Bookmark / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove bookmark/ })).toBeNull();
  });

  it("answers about the page turned to, not the page turned from", () => {
    // The sheet stays mounted across a turn, so a mark held in here rather than
    // handed in would be the previous page's answer about the current one.
    const { rerender } = render(
      <GrammarSheet
        section={section}
        prev={before}
        next={after}
        onPage={vi.fn()}
        onClose={() => {}}
        onBookmark={vi.fn()}
        bookmarked
      />,
    );
    expect(
      screen.getByRole("button", { name: /Interrogative Pronouns$/ }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    rerender(
      <GrammarSheet
        section={after}
        prev={section}
        onPage={vi.fn()}
        onClose={() => {}}
        onBookmark={vi.fn()}
        bookmarked={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Bookmark Relative Pronouns" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });
});

/**
 * The numbers the book prints, and the references that reach them.
 *
 * A topic is a run of sections and its number reaches the page only as the
 * subtitle, so until these were drawn a reader four sections into the third
 * declension could not say which of them they were in — and "as given in § 270"
 * pointed at something no page ever showed.
 */
const run: GrammarSection = {
  id: "bn-020-first-declension",
  ref: "20-22",
  title: "First Declension",
  family: "nouns",
  order: 20,
  text: [
    "⟦#20⟧",
    "Pure Latin nouns of the First Declension end in -a.",
    "⟦#21⟧",
    "The Latin has no article; see ⟦r10:§ 10⟧, 1.",
    "⟦#22⟧",
    "Nom.  mēnsa  mēnsae",
    "Gen.  mēnsae  mēnsārum",
  ].join("\n"),
};

describe("the numbers the book prints", () => {
  it("leads each numbered section with its own number", () => {
    render(<GrammarSheet section={run} onClose={() => {}} />);
    const numbers = Array.from(document.querySelectorAll(".gr-num"), (n) => n.textContent);
    expect(numbers).toEqual(["§ 20.", "§ 21.", "§ 22."]);
  });

  it("puts the number of a paradigm over it, having no sentence to lead", () => {
    render(<GrammarSheet section={run} onClose={() => {}} />);
    const over = document.querySelector(".gr-p--num")!;
    expect(over.textContent).toBe("§ 22.");
    expect(over.nextElementSibling!.className).toBe("gr-tablewrap");
  });

  it("anchors each one, so a reference can land on it", () => {
    render(<GrammarSheet section={run} onClose={() => {}} />);
    expect(document.getElementById("gr-sec-21")!.textContent).toBe("§ 21.");
  });

  it("writes them the way the book being read writes them", () => {
    render(
      <GrammarSheet section={run} onClose={() => {}} formatRef={(r) => `¶ ${r}`} />,
    );
    expect(document.querySelector(".gr-num")!.textContent).toBe("¶ 20.");
  });
});

describe("the references the book linked", () => {
  it("makes one a press, and says which section it points at", () => {
    const onFollow = vi.fn();
    render(<GrammarSheet section={run} onClose={() => {}} onFollow={onFollow} />);
    fireEvent.click(screen.getByRole("button", { name: "§ 10" }));
    expect(onFollow).toHaveBeenCalledWith("10");
  });

  it("sets one as the book set it, and goes nowhere, where nothing follows", () => {
    render(<GrammarSheet section={run} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "§ 10" })).toBeNull();
    expect(document.querySelector(".grammar")!.textContent).toContain(
      "The Latin has no article; see § 10, 1.",
    );
  });
});
