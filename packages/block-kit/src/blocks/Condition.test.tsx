import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Condition } from "./Condition";

afterEach(cleanup);

function richText(text: string) {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  };
}

describe("<Condition>", () => {
  it("renders the case matching the desktop client (op '=')", () => {
    const block = {
      type: "condition",
      cases: [
        {
          conditions: [{ type: "client", op: "=", value: "desktop" }],
          blocks: [richText("Desktop view")],
        },
        {
          conditions: [{ type: "client", op: "=", value: "mobile" }],
          blocks: [richText("Mobile view")],
        },
      ],
      default: [richText("Default view")],
    };
    render(<Condition block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Desktop view")).toBeTruthy();
    expect(screen.queryByText("Mobile view")).toBeNull();
    expect(screen.queryByText("Default view")).toBeNull();
  });

  it("supports the '!=' operator", () => {
    const block = {
      type: "condition",
      cases: [
        {
          conditions: [{ type: "client", op: "!=", value: "mobile" }],
          blocks: [richText("Not mobile")],
        },
      ],
      default: [richText("Default view")],
    };
    render(<Condition block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Not mobile")).toBeTruthy();
  });

  it("falls back to default when no case matches", () => {
    const block = {
      type: "condition",
      cases: [
        {
          conditions: [{ type: "client", op: "=", value: "mobile" }],
          blocks: [richText("Mobile view")],
        },
      ],
      default: [richText("Default view")],
    };
    render(<Condition block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Default view")).toBeTruthy();
  });

  it("renders nothing when there is no match and no default", () => {
    const block = { type: "condition", cases: [] };
    const { container } = render(<Condition block={block as never} blockId="b1" index={0} />);
    expect(container.textContent).toBe("");
  });
});
