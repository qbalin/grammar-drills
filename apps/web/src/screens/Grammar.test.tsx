import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GrammarSection } from "@latin-tutor/core";
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
});
