import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { TextInput, type TextInputElement } from "./TextInput";

afterEach(cleanup);

describe("<TextInput>", () => {
  it("defaults the placeholder to 'Write something' when none is specified", () => {
    render(
      <BlockKitProvider>
        <TextInput
          element={{ type: "plain_text_input", action_id: "a1" } as TextInputElement}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByPlaceholderText("Write something")).toBeTruthy();
  });

  it("uses the configured placeholder when one is specified", () => {
    render(
      <BlockKitProvider>
        <TextInput
          element={
            {
              type: "plain_text_input",
              action_id: "a1",
              placeholder: { type: "plain_text", text: "Type here" },
            } as TextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByPlaceholderText("Type here")).toBeTruthy();
  });

  it("reports state.values on every change, in Slack's {type, value} shape", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <TextInput
          element={{ type: "plain_text_input", action_id: "a1" } as TextInputElement}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Write something"), {
      target: { value: "hello" },
    });
    expect(state.b1?.a1).toEqual({ type: "plain_text_input", value: "hello" });
  });

  it("dispatches on Enter when dispatch_action is set with the default on_enter_pressed trigger", () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <TextInput
          element={
            {
              type: "plain_text_input",
              action_id: "a1",
              __dispatchAction: true,
            } as TextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const input = screen.getByPlaceholderText("Write something");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "plain_text_input",
        action_id: "a1",
        block_id: "b1",
        value: "abc",
      }),
      expect.anything(),
    );
  });

  it("dispatches on every keystroke when trigger_actions_on is on_character_entered", () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <TextInput
          element={
            {
              type: "plain_text_input",
              action_id: "a1",
              __dispatchAction: true,
              dispatch_action_config: { trigger_actions_on: ["on_character_entered"] },
            } as TextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Write something"), {
      target: { value: "a" },
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]![0]).toMatchObject({ value: "a" });
  });

  it("restricts number_input to numeric characters, respecting is_decimal_allowed", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <TextInput
          element={
            { type: "number_input", action_id: "a1", is_decimal_allowed: false } as TextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "12.5" } });
    // Rejected: not a valid integer, so no state update happens for this change.
    expect(state.b1?.a1).toBeUndefined();
    fireEvent.change(input, { target: { value: "12" } });
    expect(state.b1?.a1).toEqual({ type: "number_input", value: "12" });
  });

  it("renders a textarea for multiline plain_text_input", () => {
    render(
      <BlockKitProvider>
        <TextInput
          element={
            { type: "plain_text_input", action_id: "a1", multiline: true } as TextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });

  it("renders a leading icon for email_text_input and url_text_input", () => {
    const { container: emailContainer } = render(
      <BlockKitProvider>
        <TextInput
          element={{ type: "email_text_input", action_id: "a1" } as TextInputElement}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(emailContainer.querySelector(".sbk-text-input__icon")).toBeTruthy();
    cleanup();
    const { container: urlContainer } = render(
      <BlockKitProvider>
        <TextInput
          element={{ type: "url_text_input", action_id: "a1" } as TextInputElement}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(urlContainer.querySelector(".sbk-text-input__icon")).toBeTruthy();
  });

  it("reports the initial_value on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <TextInput
          element={
            { type: "plain_text_input", action_id: "a1", initial_value: "hi" } as TextInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(state.b1?.a1).toEqual({ type: "plain_text_input", value: "hi" });
  });

  describe("length limits", () => {
    /** A text input with these limits, dispatching on Enter like an `input` block with `dispatch_action`. */
    function limited(limits: Partial<TextInputElement>, onAction = vi.fn()) {
      render(
        <BlockKitProvider onAction={onAction}>
          <TextInput
            element={
              {
                type: "plain_text_input",
                action_id: "a1",
                __dispatchAction: true,
                ...limits,
              } as TextInputElement
            }
            blockId="b1"
          />
        </BlockKitProvider>,
      );
      return screen.getByPlaceholderText("Write something") as HTMLInputElement;
    }
    const counter = () => document.querySelector(".sbk-text-input__count")?.textContent ?? null;

    it("lets typing run past max_length instead of cutting it off, as Slack does", () => {
      const input = limited({ max_length: 3 });
      expect(input.hasAttribute("maxlength")).toBe(false);
      fireEvent.change(input, { target: { value: "abcde" } });
      expect(input.value).toBe("abcde");
    });

    it("shows no counter until something is typed", () => {
      limited({ max_length: 10 });
      expect(counter()).toBeNull();
    });

    it("counts the characters left while typing", () => {
      const input = limited({ max_length: 10 });
      fireEvent.change(input, { target: { value: "abcd" } });
      expect(counter()).toBe("6");
      expect(input.getAttribute("aria-invalid")).toBeNull();
    });

    it("counts below zero past max_length and marks the field invalid", () => {
      const input = limited({ max_length: 3 });
      fireEvent.change(input, { target: { value: "abcde" } });
      expect(counter()).toBe("-2");
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("sends nothing on Enter while the text is past max_length", () => {
      const onAction = vi.fn();
      const input = limited({ max_length: 3 }, onAction);
      fireEvent.change(input, { target: { value: "abcde" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onAction).not.toHaveBeenCalled();
    });

    it("marks the field invalid and sends nothing on Enter while under min_length", () => {
      const onAction = vi.fn();
      const input = limited({ min_length: 5 }, onAction);
      fireEvent.change(input, { target: { value: "ab" } });
      expect(input.getAttribute("aria-invalid")).toBe("true");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onAction).not.toHaveBeenCalled();
    });

    it("sends on Enter once the text is within both limits", () => {
      const onAction = vi.fn();
      const input = limited({ min_length: 2, max_length: 5 }, onAction);
      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ value: "abc" }),
        expect.anything(),
      );
    });

    it("counts in a multiline input too", () => {
      render(
        <BlockKitProvider>
          <TextInput
            element={
              {
                type: "plain_text_input",
                action_id: "a1",
                multiline: true,
                max_length: 10,
              } as TextInputElement
            }
            blockId="b1"
          />
        </BlockKitProvider>,
      );
      fireEvent.change(screen.getByPlaceholderText("Write something"), {
        target: { value: "abc" },
      });
      expect(counter()).toBe("7");
    });
  });

  it.each([
    ["number_input", "Enter a number"],
    ["url_text_input", "Enter a URL"],
  ] as const)("defaults %s's placeholder to Slack's %j", (type, text) => {
    render(
      <BlockKitProvider>
        <TextInput element={{ type, action_id: "a1" } as TextInputElement} blockId="b1" />
      </BlockKitProvider>,
    );
    expect(screen.getByPlaceholderText(text)).toBeTruthy();
  });
});
