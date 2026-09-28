import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Json } from "../types";
import { DataTable } from "./DataTable";

/** DataTable's block prop is narrowed beyond `Json`; tests build plain JSON fixtures and cast in. */
function asDataTableBlock(value: object): ComponentProps<typeof DataTable>["block"] {
  return value as ComponentProps<typeof DataTable>["block"];
}

function rawText(text: string): Json {
  return { type: "raw_text", text };
}
function rawNumber(value: number): Json {
  return { type: "raw_number", value, text: String(value) };
}

function bodyRowsText(container: HTMLElement): string[][] {
  const rows = container.querySelectorAll(".sbk-data-table__row");
  return Array.from(rows).map((row) =>
    Array.from(row.querySelectorAll(".sbk-data-table__truncate")).map((c) => c.textContent ?? ""),
  );
}

const numericBlock = {
  type: "data_table",
  caption: "Data table",
  rows: [
    [rawText("Name"), rawText("Amount")],
    [rawText("Alpha"), rawNumber(10)],
    [rawText("Bravo"), rawNumber(2)],
    [rawText("Charlie"), rawNumber(100)],
    [rawText("Delta"), rawNumber(5)],
  ],
};

afterEach(cleanup);

describe("<DataTable> sorting", () => {
  it("renders rows in their original order before any sort", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
  });

  it("sorts numeric columns numerically, not lexicographically, ascending then descending", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    const amountHeader = screen.getByText("Amount").closest("button");
    if (!amountHeader) throw new Error("Amount header button not found");

    fireEvent.click(amountHeader);
    expect(bodyRowsText(container).map((r) => r[1])).toEqual(["2", "5", "10", "100"]);

    fireEvent.click(amountHeader);
    expect(bodyRowsText(container).map((r) => r[1])).toEqual(["100", "10", "5", "2"]);

    // a third click clears the sort back to insertion order
    fireEvent.click(amountHeader);
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
  });

  it("sorts text columns alphabetically", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    const nameHeader = screen.getByText("Name").closest("button");
    if (!nameHeader) throw new Error("Name header button not found");
    fireEvent.click(nameHeader);
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
    fireEvent.click(nameHeader);
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Delta",
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("switching sort column resets to ascending on the new column", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    fireEvent.click(screen.getByText("Amount").closest("button") as HTMLElement);
    fireEvent.click(screen.getByText("Amount").closest("button") as HTMLElement); // now desc
    fireEvent.click(screen.getByText("Name").closest("button") as HTMLElement); // switch column
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
  });
});

describe("<DataTable> pagination", () => {
  const rows: Json[][] = [[rawText("Name")]];
  for (let i = 1; i <= 7; i++) rows.push([rawText(`Row ${i}`)]);
  const paginatedBlock = { type: "data_table", caption: "Data table", rows };

  it("does not show pagination controls when rows fit on one page", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    expect(screen.queryByLabelText("Pagination")).toBeNull();
  });

  it("shows exactly PAGE_SIZE (5) rows per page and paginates the rest", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(paginatedBlock)} blockId="b1" index={0} />,
    );
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Row 1",
      "Row 2",
      "Row 3",
      "Row 4",
      "Row 5",
    ]);
    expect(screen.getByLabelText("Previous page").hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByLabelText("Next page"));
    expect(bodyRowsText(container).map((r) => r[0])).toEqual(["Row 6", "Row 7"]);
    expect(screen.getByLabelText("Next page").hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByLabelText("1"));
    expect(bodyRowsText(container).map((r) => r[0])[0]).toBe("Row 1");
  });

  it("resets to page 1 when a new sort is applied", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(paginatedBlock)} blockId="b1" index={0} />,
    );
    fireEvent.click(screen.getByLabelText("Next page"));
    fireEvent.click(screen.getByText("Name").closest("button") as HTMLElement);
    expect(bodyRowsText(container).map((r) => r[0])[0]).toBe("Row 1");
  });
});

describe("<DataTable> cells", () => {
  it("renders raw_number cells by their text field", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("exposes toolbar buttons with accessible labels including the caption", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    expect(screen.getByLabelText("Search table")).toBeTruthy();
    expect(screen.getByLabelText("View Data table")).toBeTruthy();
    expect(screen.getByLabelText("More actions")).toBeTruthy();
  });
});
