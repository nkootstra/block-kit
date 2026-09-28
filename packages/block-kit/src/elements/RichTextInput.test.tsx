import type { RichTextBlock, RichTextInput as RichTextInputElement } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { RichTextInput } from "./RichTextInput";

afterEach(cleanup);

function richText(text: string): RichTextBlock {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  } as unknown as RichTextBlock;
}

describe("<RichTextInput>", () => {
  it("reports initial_value as rich_text_value state on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <RichTextInput
          element={
            {
              type: "rich_text_input",
              action_id: "a1",
              initial_value: richText("hello"),
            } as unknown as RichTextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(state.b1?.a1).toEqual({ type: "rich_text_input", rich_text_value: richText("hello") });
    expect(screen.getByRole("textbox").textContent).toBe("hello");
  });

  it("dispatches a rich_text_input action with the typed text wrapped as rich_text on input", () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <RichTextInput
          element={{ type: "rich_text_input", action_id: "a1" } as unknown as RichTextInputElement}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const box = screen.getByRole("textbox") as HTMLElement;
    // jsdom doesn't compute layout, so `innerText` isn't populated from `textContent`
    // automatically; the component reads `innerText`, so set it directly for the test.
    Object.defineProperty(box, "innerText", { value: "typed text", configurable: true });
    box.textContent = "typed text";
    fireEvent.input(box);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rich_text_input",
        action_id: "a1",
        block_id: "b1",
        rich_text_value: richText("typed text"),
      }),
      expect.anything(),
    );
  });

  it("uses the placeholder text as the accessible label when no action_id-derived label is set", () => {
    render(
      <BlockKitProvider>
        <RichTextInput
          element={
            {
              type: "rich_text_input",
              action_id: "a1",
              placeholder: { type: "plain_text", text: "Write a message" },
            } as unknown as RichTextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Write a message" })).toBeTruthy();
  });
});
