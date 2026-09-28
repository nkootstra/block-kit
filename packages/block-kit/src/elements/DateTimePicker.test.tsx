import type { DateTimepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { DateTimePicker } from "./DateTimePicker";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

describe("<DateTimePicker>", () => {
  it("shows the placeholder when no date/time is selected", () => {
    render(
      <BlockKitProvider>
        <DateTimePicker
          element={{ type: "datetimepicker", action_id: "a1" } as unknown as DateTimepicker}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Select a date")).toBeTruthy();
    expect(screen.getByText("Select a time")).toBeTruthy();
  });

  it("formats initial_date_time and reports it as state on mount", () => {
    let state: StateValues = {};
    const ts = Math.floor(new Date("2024-06-15T14:30:00Z").getTime() / 1000);
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <DateTimePicker
          element={
            {
              type: "datetimepicker",
              action_id: "a1",
              initial_date_time: ts,
            } as unknown as DateTimepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(state.b1?.a1).toEqual({ type: "datetimepicker", selected_date_time: ts });
  });

  it("opens the popup, picks a day, sets a time, and dispatches selected_date_time on Apply", async () => {
    const onAction = vi.fn();
    const initialTs = Math.floor(new Date("2024-06-15T12:00:00Z").getTime() / 1000);
    render(
      <BlockKitProvider onAction={onAction}>
        <DateTimePicker
          element={
            {
              type: "datetimepicker",
              action_id: "a1",
              initial_date_time: initialTs,
            } as unknown as DateTimepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    fireEvent.click(screen.getByText("20"));
    const timeInput = document.querySelector(".sbk-datetimepicker__time-input") as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: "09:15" } });
    await clickAsync(screen.getByText("Apply"));
    expect(onAction).toHaveBeenCalledTimes(1);
    const [action] = onAction.mock.calls[0]!;
    expect(action).toMatchObject({
      type: "datetimepicker",
      action_id: "a1",
      block_id: "b1",
    });
    const expectedTs = Math.floor(new Date("2024-06-20T09:15:00Z").getTime() / 1000);
    expect((action as { selected_date_time: number }).selected_date_time).toBe(expectedTs);
  });
});
