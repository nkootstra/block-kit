import type { Timepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { TimePicker } from "./TimePicker";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

describe("<TimePicker>", () => {
  it("shows the placeholder when no time is selected", () => {
    render(
      <BlockKitProvider>
        <TimePicker
          element={{ type: "timepicker", action_id: "a1" } as unknown as Timepicker}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Select time")).toBeTruthy();
  });

  it("formats initial_time like Slack's closed control and reports it as state on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <TimePicker
          element={
            { type: "timepicker", action_id: "a1", initial_time: "13:37" } as unknown as Timepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("1:37 PM")).toBeTruthy();
    expect(state.b1?.a1).toEqual({ type: "timepicker", selected_time: "13:37" });
  });

  it("opens the menu and dispatches selected_time when an option is picked", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <TimePicker
          element={{ type: "timepicker", action_id: "a1" } as unknown as Timepicker}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await clickAsync(screen.getByText("2:30 PM"));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "timepicker",
        action_id: "a1",
        block_id: "b1",
        selected_time: "14:30",
      }),
      expect.anything(),
    );
    expect(screen.getByText("2:30 PM", { selector: ".sbk-timepicker__value" })).toBeTruthy();
  });

  it("shows a timezone hint when timezone is set", () => {
    render(
      <BlockKitProvider>
        <TimePicker
          element={
            {
              type: "timepicker",
              action_id: "a1",
              timezone: "America/Los_Angeles",
            } as unknown as Timepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText(/America\/Los_Angeles/)).toBeTruthy();
  });
});
