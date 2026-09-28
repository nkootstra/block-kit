import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider } from "../context";
import { Actions } from "./Actions";

afterEach(cleanup);

function block(elements: Record<string, unknown>[]) {
  return { type: "actions", elements } as never;
}

describe("<Actions> block", () => {
  it("gives checkboxes and radio_buttons their own full-width row", () => {
    const { container } = render(
      <BlockKitProvider>
        <Actions
          block={block([
            {
              type: "checkboxes",
              action_id: "cb",
              options: [{ text: { type: "plain_text", text: "A" }, value: "a" }],
            },
            {
              type: "radio_buttons",
              action_id: "rb",
              options: [{ text: { type: "plain_text", text: "B" }, value: "b" }],
            },
            { type: "button", action_id: "btn", text: { type: "plain_text", text: "Go" } },
          ])}
          blockId="b1"
          index={0}
        />
      </BlockKitProvider>,
    );
    const actions = container.querySelectorAll(".sbk-actions__action");
    expect(actions).toHaveLength(3);
    expect(actions[0]?.classList.contains("sbk-actions__action--full-width")).toBe(true);
    expect(actions[1]?.classList.contains("sbk-actions__action--full-width")).toBe(true);
    expect(actions[2]?.classList.contains("sbk-actions__action--full-width")).toBe(false);
  });

  it("does not mark a button or select as full-width", () => {
    const { container } = render(
      <BlockKitProvider>
        <Actions
          block={block([
            { type: "button", action_id: "btn", text: { type: "plain_text", text: "Go" } },
          ])}
          blockId="b1"
          index={0}
        />
      </BlockKitProvider>,
    );
    expect(
      container
        .querySelector(".sbk-actions__action")
        ?.classList.contains("sbk-actions__action--full-width"),
    ).toBe(false);
  });
});
