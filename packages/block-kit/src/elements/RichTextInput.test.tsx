import type { RichTextBlock, RichTextInput as RichTextInputElement } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { RichTextInput } from "./RichTextInput";

afterEach(cleanup);

function renderComposer(placeholder?: string) {
  render(
    <BlockKitProvider>
      <RichTextInput
        element={
          {
            type: "rich_text_input",
            action_id: "a1",
            placeholder: placeholder ? { type: "plain_text", text: placeholder } : undefined,
          } as unknown as RichTextInputElement
        }
        blockId="b1"
      />
    </BlockKitProvider>,
  );
}

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

  /** A rich text input that may dispatch (as in an input block with dispatch_action), typed into. */
  function typed(
    onAction: NonNullable<Parameters<typeof BlockKitProvider>[0]["onAction"]>,
    text: string,
    triggers?: ("on_enter_pressed" | "on_character_entered")[],
  ) {
    render(
      <BlockKitProvider onAction={onAction}>
        <RichTextInput
          element={
            {
              type: "rich_text_input",
              action_id: "a1",
              __dispatchAction: true,
              ...(triggers ? { dispatch_action_config: { trigger_actions_on: triggers } } : {}),
            } as unknown as RichTextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const box = screen.getByRole("textbox") as HTMLElement;
    // jsdom doesn't compute layout, so `innerText` isn't populated from `textContent`
    // automatically; the component reads `innerText`, so set it directly for the test.
    Object.defineProperty(box, "innerText", { value: text, configurable: true });
    box.textContent = text;
    fireEvent.input(box);
    return box;
  }

  const action = (text: string) =>
    expect.objectContaining({
      type: "rich_text_input",
      action_id: "a1",
      block_id: "b1",
      rich_text_value: richText(text),
    });

  // Slack's dispatch_action_config defaults to on_enter_pressed: typing alone sends nothing.
  it("sends its action on Enter by default, not while typing", async () => {
    const onAction = vi.fn();
    const box = typed(onAction, "typed text");
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    await Promise.resolve();
    expect(onAction).toHaveBeenCalledWith(action("typed text"), expect.anything());
  });

  it("keeps Shift+Enter for a new line", async () => {
    const onAction = vi.fn();
    const box = typed(onAction, "line");
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    await Promise.resolve();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("sends one action once typing pauses, for on_character_entered", async () => {
    vi.useFakeTimers();
    try {
      const onAction = vi.fn();
      typed(onAction, "hi", ["on_character_entered"]);
      expect(onAction).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith(action("hi"), expect.anything());
    } finally {
      vi.useRealTimers();
    }
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

  describe("composer", () => {
    it("shows the formatting bar until Aa hides it, and brings it back", () => {
      renderComposer();
      const aa = screen.getByRole("button", { name: "Show formatting" });
      expect(aa.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeTruthy();

      fireEvent.click(aa);
      expect(aa.getAttribute("aria-pressed")).toBe("false");
      expect(screen.queryByRole("toolbar", { name: "Formatting" })).toBeNull();

      fireEvent.click(aa);
      expect(aa.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeTruthy();
    });

    it("puts Aa and Emoji in Slack's composer actions row", () => {
      renderComposer();
      const row = screen.getByRole("toolbar", { name: "Composer actions" });
      expect(row.contains(screen.getByRole("button", { name: "Show formatting" }))).toBe(true);
      expect(row.contains(screen.getByRole("button", { name: "Emoji" }))).toBe(true);
    });

    it("marks Emoji unavailable, since there's no picker yet", () => {
      renderComposer();
      expect(screen.getByRole("button", { name: "Emoji" }).getAttribute("aria-disabled")).toBe(
        "true",
      );
    });

    it("shows the placeholder as text until something is typed", () => {
      renderComposer("Write something");
      expect(screen.getByText("Write something")).toBeTruthy();

      const box = screen.getByRole("textbox") as HTMLElement;
      Object.defineProperty(box, "innerText", { value: "hi", configurable: true });
      box.textContent = "hi";
      fireEvent.input(box);
      expect(screen.queryByText("Write something")).toBeNull();
    });
  });
});
