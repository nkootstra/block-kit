import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FallbackCanary } from "./FallbackCanary";

afterEach(cleanup);

function richText(text: string) {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  };
}

describe("<FallbackCanary>", () => {
  it("renders each fallback block as one item of the row, in order", () => {
    const block = {
      type: "fallback_canary",
      fallback: [richText("First"), { type: "divider" }, richText("Second")],
    };
    const { container } = render(<FallbackCanary block={block as never} blockId="b1" index={0} />);
    const root = container.querySelector(".sbk-fallback-canary") as HTMLElement;
    expect(root).toBeTruthy();
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    // Each direct child is one wrapped fallback block (a flex item of the row), in fixture order.
    expect(root.children.length).toBe(3);
  });

  it("renders nothing when there is no fallback array", () => {
    const block = { type: "fallback_canary" };
    const { container } = render(<FallbackCanary block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-fallback-canary")?.children.length).toBe(0);
  });
});
