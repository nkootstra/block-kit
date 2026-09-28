import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContextActions } from "./ContextActions";

afterEach(cleanup);

describe("<ContextActions>", () => {
  it("renders one item per element, in order", () => {
    const block = {
      type: "context_actions",
      elements: [
        {
          type: "icon_button",
          action_id: "copy",
          icon: "copy",
          text: { type: "plain_text", text: "Copy" },
        },
        {
          type: "icon_button",
          action_id: "retry",
          icon: "refresh",
          text: { type: "plain_text", text: "Retry" },
        },
      ],
    };
    const { container } = render(<ContextActions block={block as never} blockId="b1" index={0} />);
    expect(container.querySelectorAll(".sbk-context-actions__item")).toHaveLength(2);
  });

  it("renders nothing when there are no elements", () => {
    const block = { type: "context_actions" };
    const { container } = render(<ContextActions block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-context-actions")?.children.length).toBe(0);
  });

  it("renders feedback_buttons elements", () => {
    const block = {
      type: "context_actions",
      elements: [
        {
          type: "feedback_buttons",
          action_id: "feedback",
          positive_button: { text: { type: "plain_text", text: "Good" } },
          negative_button: { text: { type: "plain_text", text: "Bad" } },
        },
      ],
    };
    const { container } = render(<ContextActions block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-context-actions__item")).toBeTruthy();
  });
});
