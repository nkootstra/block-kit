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

/** Opens a column's sort menu and picks one of its items, as a user would. */
function sortBy(column: string, item: "Ascending" | "Descending" | "Clear Sort") {
  fireEvent.click(screen.getByRole("button", { name: column }));
  fireEvent.click(
    screen.getByRole(item === "Clear Sort" ? "menuitem" : "menuitemradio", { name: item }),
  );
}

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

  it("opens a Sort menu from a column header instead of sorting on the click, like Slack", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    const header = screen.getByRole("button", { name: "Amount" });
    expect(header.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(header);

    const menu = screen.getByRole("menu");
    expect(menu.textContent).toContain("Sort");
    expect(
      screen.getAllByRole("menuitemradio").map((item) => item.getAttribute("aria-checked")),
    ).toEqual(["false", "false"]);
    expect(screen.queryByRole("menuitem", { name: "Clear Sort" })).toBeNull();
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
  });

  it("sorts numeric columns numerically, not lexicographically", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    sortBy("Amount", "Ascending");
    expect(bodyRowsText(container).map((r) => r[1])).toEqual(["2", "5", "10", "100"]);
    expect(screen.queryByRole("menu")).toBeNull();

    sortBy("Amount", "Descending");
    expect(bodyRowsText(container).map((r) => r[1])).toEqual(["100", "10", "5", "2"]);
  });

  it("sorts text columns alphabetically", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    sortBy("Name", "Descending");
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Delta",
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("marks the sorted column with aria-sort", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    const [name, amount] = screen.getAllByRole("columnheader");
    expect(amount!.getAttribute("aria-sort")).toBe("none");
    sortBy("Amount", "Descending");
    expect(amount!.getAttribute("aria-sort")).toBe("descending");
    expect(name!.getAttribute("aria-sort")).toBe("none");
  });

  it("checks the current direction and offers Clear Sort once the column is sorted", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    sortBy("Amount", "Ascending");
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    expect(
      screen.getByRole("menuitemradio", { name: "Ascending" }).getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("menuitem", { name: "Clear Sort" }));
    expect(bodyRowsText(container).map((r) => r[0])).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
    expect(screen.getAllByRole("columnheader")[1]!.getAttribute("aria-sort")).toBe("none");
  });

  it("offers no Clear Sort on a column other than the sorted one", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    sortBy("Amount", "Ascending");
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.queryByRole("menuitem", { name: "Clear Sort" })).toBeNull();
  });

  it("closes the menu on Escape without sorting", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    const header = screen.getByRole("button", { name: "Amount" });
    fireEvent.click(header);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(header);
  });

  it("picks a direction from the keyboard", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(bodyRowsText(container).map((r) => r[1])).toEqual(["100", "10", "5", "2"]);
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
    sortBy("Name", "Descending");
    expect(bodyRowsText(container).map((r) => r[0])[0]).toBe("Row 7");
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
