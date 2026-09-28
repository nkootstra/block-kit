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
});
