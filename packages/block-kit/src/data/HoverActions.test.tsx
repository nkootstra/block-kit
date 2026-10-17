import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Table, type TableBlock } from "../blocks/Table";
import { neutralizeFormula, toCsv } from "./HoverActions";

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

  it("keeps a downloaded cell from running as a spreadsheet formula", () => {
    expect(toCsv([['=HYPERLINK("https://x.example")', "@SUM(A1)", "+1+1"]])).toBe(
      '"\'=HYPERLINK(""https://x.example"")",\'@SUM(A1),\'+1+1',
    );
    expect(neutralizeFormula("-cmd")).toBe("'-cmd");
    expect(neutralizeFormula("-12")).toBe("-12");
    expect(neutralizeFormula("+1.5e3")).toBe("+1.5e3");
    expect(neutralizeFormula("Ada")).toBe("Ada");
  });
});
