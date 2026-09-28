import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Json } from "../types";
import { Table } from "./Table";

/** Table's block prop is narrowed beyond `Json`; tests build plain JSON fixtures and cast in. */
function asTableBlock(value: object): ComponentProps<typeof Table>["block"] {
  return value as ComponentProps<typeof Table>["block"];
}

function richText(text: string, bold = false): Json {
  return {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [{ type: "text", text, ...(bold ? { style: { bold: true } } : {}) }],
      },
    ],
  };
}

afterEach(cleanup);

describe("<Table>", () => {
  it("renders the first row as a header and the rest as body rows", () => {
    const block = {
      type: "table",
      rows: [
        [richText("Header 1", true), richText("Header 2", true)],
        [richText("Datum 1"), richText("Datum 2")],
      ],
    };
    render(<Table block={asTableBlock(block)} blockId="b1" index={0} />);
    const headerCell = screen.getByText("Header 1");
    expect(headerCell.closest("th")).toBeTruthy();
    const bodyCell = screen.getByText("Datum 1");
    expect(bodyCell.closest("td")).toBeTruthy();
  });

  it("applies column_settings alignment and wrapping per column", () => {
    const block = {
      type: "table",
      rows: [[richText("Header 1"), richText("Header 2")]],
      column_settings: [{ align: "right" }, { is_wrapped: true }],
    };
    render(<Table block={asTableBlock(block)} blockId="b1" index={0} />);
    const first = screen.getByText("Header 1").closest("th");
    const second = screen.getByText("Header 2").closest("th");
    expect(first?.style.textAlign).toBe("right");
    expect(second?.style.whiteSpace).toBe("normal");
  });

  it("renders nothing when there are no rows", () => {
    const block = { type: "table", rows: [] };
    const { container } = render(<Table block={asTableBlock(block)} blockId="b1" index={0} />);
    expect(container.querySelector("thead")).toBeNull();
    expect(container.querySelectorAll("tbody tr").length).toBe(0);
  });
});
