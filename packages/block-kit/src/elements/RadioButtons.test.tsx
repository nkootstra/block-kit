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
    expect(state.b1?.a1).toEqual({ type: "radio_buttons", selected_option: option("b", "B") });
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
      expect.objectContaining({ type: "radio_buttons", selected_option: option("a", "A") }),
      expect.anything(),
    );
    await clickAsync(radioB!);
    expect(radioA!.checked).toBe(false);
    expect(radioB!.checked).toBe(true);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_option: option("b", "B") }),
      expect.anything(),
    );
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
