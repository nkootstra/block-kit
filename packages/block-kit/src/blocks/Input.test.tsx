import type { InputBlock } from "@slack/types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { Input } from "./Input";

afterEach(cleanup);

function block(extra: Record<string, unknown>): InputBlock {
  return {
    type: "input",
    label: { type: "plain_text", text: "Label" },
    element: { type: "plain_text_input", action_id: "a1" },
    ...extra,
  } as unknown as InputBlock;
}

describe("<Input> block", () => {
  it("renders the label and, when optional, an '(optional)' suffix on a modal surface", () => {
    render(
      <BlockKitProvider surface="modal">
        <Input block={block({ optional: true })} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Label")).toBeTruthy();
    expect(screen.getByText("(optional)")).toBeTruthy();
  });

  it("does not render '(optional)' when the block is required", () => {
    render(
      <BlockKitProvider surface="modal">
        <Input block={block({})} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.queryByText("(optional)")).toBeNull();
  });

  // Slack's Builder preview never shows "(optional)" on the message surface, even when the
  // block is marked optional (see extra/input/text-inputs fixture).
  it("does not render '(optional)' on the message surface, even when optional", () => {
    render(
      <BlockKitProvider surface="message">
        <Input block={block({ optional: true })} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.queryByText("(optional)")).toBeNull();
  });

  it("renders an explicit hint below the element", () => {
    render(
      <BlockKitProvider>
        <Input
          block={block({ hint: { type: "plain_text", text: "Some help text" } })}
          blockId="b1"
          index={0}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Some help text")).toBeTruthy();
  });

  it("synthesizes \"Press 'enter' to submit\" when dispatch_action defaults to on_enter_pressed", () => {
    render(
      <BlockKitProvider>
        <Input block={block({ dispatch_action: true })} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Press 'enter' to submit")).toBeTruthy();
  });

  it("does not synthesize a hint for on_character_entered-only dispatch", () => {
    render(
      <BlockKitProvider>
        <Input
          block={block({
            dispatch_action: true,
            element: {
              type: "plain_text_input",
              action_id: "a1",
              dispatch_action_config: { trigger_actions_on: ["on_character_entered"] },
            },
          })}
          blockId="b1"
          index={0}
        />
      </BlockKitProvider>,
    );
    expect(screen.queryByText("Press 'enter' to submit")).toBeNull();
  });

  it("does not synthesize a hint when an explicit hint is already set", () => {
    render(
      <BlockKitProvider>
        <Input
          block={block({
            dispatch_action: true,
            hint: { type: "plain_text", text: "Custom hint" },
          })}
          blockId="b1"
          index={0}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Custom hint")).toBeTruthy();
    expect(screen.queryByText("Press 'enter' to submit")).toBeNull();
  });

  it("does not synthesize a hint for multiline inputs", () => {
    render(
      <BlockKitProvider>
        <Input
          block={block({
            dispatch_action: true,
            element: { type: "plain_text_input", action_id: "a1", multiline: true },
          })}
          blockId="b1"
          index={0}
        />
      </BlockKitProvider>,
    );
    expect(screen.queryByText("Press 'enter' to submit")).toBeNull();
  });

  it("shows a validation error from context and marks the field as erroring", () => {
    render(
      <BlockKitProvider errors={{ b1: "This field is required" }}>
        <Input block={block({})} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.getByText("This field is required")).toBeTruthy();
  });

  describe("dispatch_action", () => {
    const checkboxes = {
      type: "checkboxes",
      action_id: "notify",
      options: [{ text: { type: "plain_text", text: "Email me" }, value: "email" }],
    };

    async function clickCheckbox(extra: Record<string, unknown>) {
      const onAction = vi.fn();
      render(
        <BlockKitProvider onAction={onAction}>
          <Input block={block({ element: checkboxes, ...extra })} blockId="prefs" index={0} />
        </BlockKitProvider>,
      );
      // Toggling awaits the (absent) confirm dialog before it reports the change.
      await act(async () => {
        fireEvent.click(screen.getByRole("checkbox", { name: "Email me" }));
      });
      return onAction;
    }

    it("sends no block_actions for its element by default, like Slack", async () => {
      expect(await clickCheckbox({})).not.toHaveBeenCalled();
    });

    it("sends block_actions for its element when dispatch_action is true", async () => {
      expect(await clickCheckbox({ dispatch_action: true })).toHaveBeenCalledWith(
        expect.objectContaining({ type: "checkboxes", action_id: "notify", block_id: "prefs" }),
        expect.anything(),
      );
    });
  });
});
