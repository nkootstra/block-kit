import type { Option, RadioButtons as RadioButtonsElement } from "@slack/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { RadioButtons } from "./RadioButtons";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

function option(value: string, text: string): Option {
  return { value, text: { type: "plain_text", text } } as unknown as Option;
}

/** The option as Slack sends it back in an action: its plain_text gains `emoji: true`. */
function sent(value: string, text: string) {
  return { value, text: { type: "plain_text", text, emoji: true } };
}

describe("<RadioButtons>", () => {
  it("reports the initial_option as selected_option on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <RadioButtons
          element={
            {
              type: "radio_buttons",
              action_id: "a1",
              options: [option("a", "A"), option("b", "B")],
              initial_option: option("b", "B"),
            } as unknown as RadioButtonsElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(state.b1?.a1).toEqual({ type: "radio_buttons", selected_option: sent("b", "B") });
  });

  it("selects exactly one option at a time and dispatches selected_option", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <RadioButtons
          element={
            {
              type: "radio_buttons",
              action_id: "a1",
              options: [option("a", "A"), option("b", "B")],
            } as unknown as RadioButtonsElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const [radioA, radioB] = screen.getAllByRole("radio") as HTMLInputElement[];
    await clickAsync(radioA!);
    expect(radioA!.checked).toBe(true);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "radio_buttons", selected_option: sent("a", "A") }),
      expect.anything(),
    );
    await clickAsync(radioB!);
    expect(radioA!.checked).toBe(false);
    expect(radioB!.checked).toBe(true);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_option: sent("b", "B") }),
      expect.anything(),
    );
  });

  // Slack echoes the element's initial_option in every radio action, the way Bolt's
  // RadioButtonsAction declares it and the Builder's Actions Preview showed it
  // (state audit, "Radio buttons": "selected_option (with description) plus initial_option echoed").
  it("echoes initial_option in the action, as Slack does", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <RadioButtons
          element={
            {
              type: "radio_buttons",
              action_id: "a1",
              options: [option("a", "A"), option("b", "B")],
              initial_option: option("b", "B"),
            } as unknown as RadioButtonsElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getAllByRole("radio")[0]!);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_option: sent("a", "A"), initial_option: sent("b", "B") }),
      expect.anything(),
    );
  });

  // The Builder's state.values option objects carry `emoji: true` on their plain_text, as the
  // actions do (state audit, "state.values and the payload envelope": "Option objects in state:
  // emoji:true").
  it("reports options in state with Slack's emoji: true", async () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <RadioButtons
          element={
            {
              type: "radio_buttons",
              action_id: "a1",
              options: [option("a", "A"), option("b", "B")],
            } as unknown as RadioButtonsElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getAllByRole("radio")[0]!);
    expect(state.b1?.a1).toEqual({ type: "radio_buttons", selected_option: sent("a", "A") });
  });

  it("shares a name across options within one radio group so only one can be checked natively", () => {
    render(
      <BlockKitProvider>
        <RadioButtons
          element={
            {
              type: "radio_buttons",
              action_id: "a1",
              options: [option("a", "A"), option("b", "B")],
            } as unknown as RadioButtonsElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0]!.name).toBe(radios[1]!.name);
  });
});
