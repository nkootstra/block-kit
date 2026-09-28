import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Table, type TableBlock } from "../blocks/Table";
import { toCsv } from "./HoverActions";

afterEach(cleanup);

const block = {
  type: "table",
  rows: [
    [
      { type: "raw_text", text: "Name" },
      { type: "raw_text", text: "Note" },
    ],
    [
      { type: "raw_text", text: "Ada" },
      { type: "raw_text", text: 'says "hi", twice' },
    ],
  ],
};

describe("hover action groups", () => {
  it("copies a table as tab-separated text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Table block={block as unknown as TableBlock} blockId="b1" index={0} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy table" }));
    });
    expect(writeText).toHaveBeenCalledWith('Name\tNote\nAda\tsays "hi", twice');
  });

  it("quotes CSV cells that contain commas or quotes", () => {
    expect(toCsv([["a", 'b "c", d']])).toBe('a,"b ""c"", d"');
  });
});
