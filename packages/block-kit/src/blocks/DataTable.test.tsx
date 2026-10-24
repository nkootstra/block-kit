import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
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

  it("keeps a short last page as tall as a full one, so the pager stays put like Slack's", () => {
    const { container } = render(
      <DataTable block={asDataTableBlock(paginatedBlock)} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-data-table__spacer")).toBeNull();
    fireEvent.click(screen.getByLabelText("Next page"));
    const spacer = container.querySelector<HTMLElement>(".sbk-data-table__spacer");
    // Two of five rows on page 2: three 48px rows' worth of space.
    expect(spacer?.style.height).toBe("144px");
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

  it("draws a user mention in a rich text cell, resolved or not", () => {
    const mention = {
      type: "rich_text",
      elements: [
        { type: "rich_text_section", elements: [{ type: "user", user_id: "U0123456789" }] },
      ],
    };
    const block = {
      type: "data_table",
      rows: [[rawText("Owner")], [mention]],
    };
    const { container, unmount } = render(
      <DataTable block={asDataTableBlock(block)} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-mention--unresolved")?.getAttribute("aria-label")).toBe(
      "@U0123456789",
    );
    unmount();
    render(
      <BlockKitProvider
        resolvers={{ user: (id) => (id === "U0123456789" ? "Ada Lovelace" : undefined) }}
      >
        <DataTable block={asDataTableBlock(block)} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.getByText("@Ada Lovelace")).toBeTruthy();
    cleanup();
    // A resolver that doesn't know the id: the user doesn't exist (extra/fidelity/data-table/mixed).
    const missing = render(
      <BlockKitProvider resolvers={{ user: () => undefined }}>
        <DataTable block={asDataTableBlock(block)} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(
      missing.container.querySelector(".sbk-mention--missing")?.getAttribute("aria-label"),
    ).toBe("@U0123456789");
  });

  it("exposes toolbar buttons with accessible labels including the caption", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    expect(screen.getByLabelText("Search table")).toBeTruthy();
    expect(screen.getByLabelText("View Data table")).toBeTruthy();
    expect(screen.getByLabelText("More actions")).toBeTruthy();
  });
});

describe("<DataTable> More actions", () => {
  it("lists Copy table and Download table, as Slack does", () => {
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Copy table",
      "Download table",
    ]);
  });

  it("copies the whole table, header first and unsorted, as tab-separated text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DataTable block={asDataTableBlock(numericBlock)} blockId="b1" index={0} />);
    sortBy("Amount", "Descending");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy table" }));
    });
    expect(writeText).toHaveBeenCalledWith(
      "Name\tAmount\nAlpha\t10\nBravo\t2\nCharlie\t100\nDelta\t5",
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("<DataTable> expanding a cell", () => {
  // jsdom lays nothing out, so this stands in for the browser: a clamped cell whose text runs past
  // 12 characters wraps onto a second line the clamp hides.
  const height = (el: HTMLElement, clamped: number) =>
    el.classList.contains("sbk-data-table__truncate") && (el.textContent ?? "").length > 12
      ? clamped * 2
      : clamped;
  const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  function layOut() {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return height(this, 22);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 22,
    });
  }
  afterEach(() => {
    if (scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
  });

  const block = {
    type: "data_table",
    rows: [
      [rawText("Name"), rawText("Account")],
      [rawText("Acme Expansion Deal"), rawText("Acme Inc.")],
    ],
  };

  it("offers Expand cell on a cell whose content is cut off, and not on one that fits", () => {
    layOut();
    render(
      <BlockKitProvider>
        <DataTable block={asDataTableBlock(block)} blockId="t" index={0} />
      </BlockKitProvider>,
    );
    const buttons = screen.getAllByRole("button", { name: "Expand cell" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.closest('[role="rowheader"]')?.textContent).toContain("Acme Expansion Deal");
  });

  it("shows the whole content in a dialog over the cell, focused, until Escape", () => {
    layOut();
    render(
      <BlockKitProvider>
        <DataTable block={asDataTableBlock(block)} blockId="t" index={0} />
      </BlockKitProvider>,
    );
    const expand = screen.getByRole("button", { name: "Expand cell" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    const dialog = screen.getByRole("dialog", { name: "Cell content" });
    expect(dialog.textContent).toBe("Acme Expansion Deal");
    expect(document.activeElement).toBe(dialog);
    // Slack takes the button away while the content is open.
    expect(screen.queryByRole("button", { name: "Expand cell" })).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Cell content" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Expand cell" }));
  });

  it("closes the dialog on a press outside it", () => {
    layOut();
    render(
      <BlockKitProvider>
        <DataTable block={asDataTableBlock(block)} blockId="t" index={0} />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand cell" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Cell content" })).toBeNull();
  });
});

describe("<DataTable> filtering", () => {
  const richText = (text: string): Json => ({
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  });
  const block = {
    type: "data_table",
    caption: "Deals",
    rows: [
      [rawText("Name"), rawText("Account"), rawText("Stage")],
      [rawText("Acme Expansion Deal"), rawText("Acme Inc."), richText("Negotiation")],
      [rawText("Weather Forecast"), rawText("Nimbus Corp."), richText("Waiting on review")],
      [rawText("Retail Partner Portal"), rawText("ShopCo Ltd."), richText("Closed Won")],
    ],
  };
  function renderTable() {
    return render(
      <BlockKitProvider>
        <DataTable block={asDataTableBlock(block)} blockId="t" index={0} />
      </BlockKitProvider>,
    );
  }
  const openFilter = () => {
    fireEvent.click(screen.getByRole("button", { name: "Search table" }));
    return screen.getByRole("searchbox", { name: "Filter table…" });
  };

  it("turns Search into a focused filter box, as Slack does", () => {
    renderTable();
    const box = openFilter();
    expect(document.activeElement).toBe(box);
    expect(box.getAttribute("placeholder")).toBe("Filter table…");
    expect(screen.queryByRole("button", { name: "Search table" })).toBeNull();
  });

  it("keeps the rows with a cell that contains the term, ignoring case, rich text included", () => {
    const { container } = renderTable();
    fireEvent.change(openFilter(), { target: { value: "corp" } });
    expect(bodyRowsText(container).map((row) => row[0])).toEqual(["Weather Forecast"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "WON" } });
    expect(bodyRowsText(container).map((row) => row[0])).toEqual(["Retail Partner Portal"]);
  });

  it("says no results were found and offers Clear filter, which brings the rows back", () => {
    const { container } = renderTable();
    fireEvent.change(openFilter(), { target: { value: "zzz" } });
    expect(bodyRowsText(container)).toEqual([]);
    expect(screen.getByText("No results found.")).toBeTruthy();
    // Slack drops the column headers along with the rows.
    expect(screen.queryByRole("columnheader")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(bodyRowsText(container)).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Filter table…" }));
  });

  it("clears the term with the box's Clear button and keeps the box focused", () => {
    const { container } = renderTable();
    fireEvent.change(openFilter(), { target: { value: "corp" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear text" }));
    expect(bodyRowsText(container)).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Filter table…" }));
  });

  it("clears and closes on Escape, back to the Search button", () => {
    const { container } = renderTable();
    const box = openFilter();
    fireEvent.change(box, { target: { value: "corp" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(bodyRowsText(container)).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search table" }));
  });

  it("closes an empty box when focus leaves it, and keeps one with a term", () => {
    renderTable();
    const box = openFilter();
    fireEvent.change(box, { target: { value: "corp" } });
    fireEvent.blur(box);
    expect(screen.getByRole("searchbox")).toBeTruthy();
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});

describe("<DataTable> filter highlight", () => {
  it("marks the term's first occurrence in each matching cell, across a rich text style change", () => {
    const { container } = render(
      <BlockKitProvider>
        <DataTable
          block={asDataTableBlock({
            type: "data_table",
            rows: [
              [rawText("Account"), rawText("Stage")],
              [
                rawText("Nimbus Corp. corp"),
                {
                  type: "rich_text",
                  elements: [
                    {
                      type: "rich_text_section",
                      elements: [
                        { type: "text", text: "Waiting on " },
                        { type: "text", text: "review", style: { italic: true } },
                      ],
                    },
                  ],
                },
              ],
            ],
          })}
          blockId="t"
          index={0}
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search table" }));
    const box = screen.getByRole("searchbox", { name: "Filter table…" });
    fireEvent.change(box, { target: { value: "corp" } });
    const marks = () =>
      Array.from(container.querySelectorAll(".sbk-data-table__match"), (m) => m.textContent);
    expect(marks()).toEqual(["Corp"]);
    fireEvent.change(box, { target: { value: "on rev" } });
    expect(marks()).toEqual(["on ", "rev"]);
  });
});
