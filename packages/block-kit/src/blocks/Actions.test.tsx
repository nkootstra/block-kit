import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  // `extra/fidelity/actions/many-items`: 25 buttons show as the first five and "+ 20 more".
  it("shows the first five elements and a button for the rest", () => {
    const buttons = Array.from({ length: 25 }, (_, i) => ({
      type: "button",
      action_id: `btn${i}`,
      text: { type: "plain_text", text: `Button ${i + 1}` },
    }));
    const { container } = render(
      <BlockKitProvider>
        <Actions block={block(buttons)} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(container.querySelectorAll(".sbk-actions__action")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Button 5" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Button 6" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ 20 more" }));
    expect(container.querySelectorAll(".sbk-actions__action")).toHaveLength(25);
    expect(screen.getByRole("button", { name: "Button 25" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /more$/ })).toBeNull();
  });

  it("shows five elements without a more button", () => {
    const buttons = Array.from({ length: 5 }, (_, i) => ({
      type: "button",
      action_id: `btn${i}`,
      text: { type: "plain_text", text: `Button ${i + 1}` },
    }));
    render(
      <BlockKitProvider>
        <Actions block={block(buttons)} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });
});
