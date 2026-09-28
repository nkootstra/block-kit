import type { Checkboxes as CheckboxesElement, Option } from "@slack/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { Checkboxes } from "./Checkboxes";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

function option(value: string, text: string): Option {
  return { value, text: { type: "plain_text", text } } as unknown as Option;
}

describe("<Checkboxes>", () => {
  it("reports initial_options as selected_options on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <Checkboxes
          element={
            {
              type: "checkboxes",
              action_id: "a1",
              options: [option("a", "A"), option("b", "B")],
              initial_options: [option("a", "A")],
            } as unknown as CheckboxesElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(state.b1?.a1).toEqual({
      type: "checkboxes",
      selected_options: [option("a", "A")],
    });
  });

  it("toggles an option on and off, dispatching selected_options each time", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Checkboxes
          element={
            {
              type: "checkboxes",
              action_id: "a1",
              options: [option("a", "A"), option("b", "B")],
            } as unknown as CheckboxesElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const first = screen.getAllByRole("checkbox")[0]!;
    await clickAsync(first);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "checkboxes",
        action_id: "a1",
        block_id: "b1",
        selected_options: [option("a", "A")],
      }),
      expect.anything(),
    );
    await clickAsync(first);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_options: [] }),
      expect.anything(),
    );
  });

  it("renders every option's text and optional description", () => {
    render(
      <BlockKitProvider>
        <Checkboxes
          element={
            {
              type: "checkboxes",
              action_id: "a1",
              options: [
                {
                  value: "a",
                  text: { type: "plain_text", text: "A" },
                  description: { type: "plain_text", text: "First option" },
                },
              ],
            } as unknown as CheckboxesElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("First option")).toBeTruthy();
  });
});
