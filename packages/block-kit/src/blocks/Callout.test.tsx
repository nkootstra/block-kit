import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Callout } from "./Callout";

afterEach(cleanup);

function richText(text: string) {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  };
}

describe("<Callout>", () => {
  it("renders its child blocks in order", () => {
    const block = {
      type: "callout",
      background_color: "green",
      child_blocks: [richText("First line"), { type: "divider" }, richText("Second line")],
    };
    render(<Callout block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("First line")).toBeTruthy();
    expect(screen.getByText("Second line")).toBeTruthy();
  });

  it("uses the measured background for a known color", () => {
    const block = { type: "callout", background_color: "green", child_blocks: [] };
    const { container } = render(<Callout block={block as never} blockId="b1" index={0} />);
    const callout = container.querySelector(".sbk-callout") as HTMLElement;
    expect(callout.style.backgroundColor).toBe("rgb(244, 255, 219)");
  });

  it("falls back to the gray tint for an unrecognized color", () => {
    const block = { type: "callout", background_color: "not-a-real-color", child_blocks: [] };
    const { container } = render(<Callout block={block as never} blockId="b1" index={0} />);
    const callout = container.querySelector(".sbk-callout") as HTMLElement;
    expect(callout.style.backgroundColor).toBe("rgb(244, 244, 244)");
  });

  it("renders nothing extra when there are no child blocks", () => {
    const block = { type: "callout" };
    const { container } = render(<Callout block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-callout")?.children.length).toBe(0);
  });
});
