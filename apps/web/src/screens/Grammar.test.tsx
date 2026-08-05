import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GrammarSection } from "@lang-tutor/core";
import { profile } from "../pack.js";
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
 * event's name is what React listens for anyway, and it does carry them.
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

/** A finger crossing the page, from x to x, drifting `dy` as it goes. */
function swipe(from: number, to: number, dy = 0, at?: Element) {
  const on = at ?? document.querySelector(".reader")!;
  fireEvent(on, new MouseEvent("pointerdown", { clientX: from, clientY: 100, bubbles: true }));
  fireEvent(
    on,
    new MouseEvent("pointerup", { clientX: to, clientY: 100 + dy, bubbles: true }),
  );
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

  it("credits the book at the foot of every page, and links it", () => {
    // Not a page of this grammar was written here. Whose sentences these are,
    // and where to go and read them, belongs on the page they are set on.
    mountPaged();
    const { title, url, licence } = profile.grammar.source;
    const link = screen.getByRole("link", { name: title });
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText(licence)).toBeDefined();
  });

  it("credits it on a page that does not page, too", () => {
    mount();
    expect(
      screen.getByRole("link", { name: profile.grammar.source.title }),
    ).toBeDefined();
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
