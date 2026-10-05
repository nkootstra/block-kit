import type { DateTimepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { DateTimePicker } from "./DateTimePicker";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

function renderInZone(initialDateTime: number, onAction = vi.fn()) {
  render(
    <BlockKitProvider onAction={onAction} timeZone="Europe/Amsterdam">
      <DateTimePicker
        element={
          {
            type: "datetimepicker",
            action_id: "a1",
            initial_date_time: initialDateTime,
          } as unknown as DateTimepicker
        }
        blockId="b1"
      />
    </BlockKitProvider>,
  );
  return onAction;
}

async function pick(day: string, time: string) {
  fireEvent.click(screen.getAllByRole("button")[0]!);
  fireEvent.click(screen.getByText(day));
  fireEvent.change(timeInput(), { target: { value: time } });
  await clickAsync(screen.getByText("Apply"));
}

function timeInput() {
  return document.querySelector(".sbk-datetimepicker__time-input") as HTMLInputElement;
}

function dispatched(onAction: ReturnType<typeof vi.fn>) {
  return (onAction.mock.calls[0]![0] as { selected_date_time: number }).selected_date_time;
}

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
    fireEvent.change(timeInput(), { target: { value: "09:15" } });
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

  describe("in a configured time zone", () => {
    it("dispatches the picked wall-clock time in that zone, not in UTC", async () => {
      // 2026-01-01 12:00 UTC
      const onAction = renderInZone(1767268800);
      await pick("1", "11:00");
      // 2026-01-01 11:00 in Amsterdam (UTC+1) is 10:00 UTC.
      expect(dispatched(onAction)).toBe(1767261600);
    });

    it("follows the zone's daylight saving offset", async () => {
      // 2026-07-01 12:00 UTC
      const onAction = renderInZone(1782907200);
      await pick("1", "11:00");
      // 2026-07-01 11:00 in Amsterdam (UTC+2) is 09:00 UTC.
      expect(dispatched(onAction)).toBe(1782896400);
    });

    it("moves a time skipped by the spring change forward by the gap", async () => {
      // 2026-03-29 12:00 UTC; Amsterdam's clocks jump from 02:00 to 03:00 that night.
      const onAction = renderInZone(1774785600);
      await pick("29", "02:30");
      // 02:30 doesn't exist, so it becomes 03:30 CEST, which is 01:30 UTC.
      expect(dispatched(onAction)).toBe(1774747800);
    });

    it("takes the first of the two times repeated by the autumn change", async () => {
      // 2026-10-25 12:00 UTC; Amsterdam's clocks fall back from 03:00 to 02:00 that night.
      const onAction = renderInZone(1792929600);
      await pick("25", "02:30");
      // 02:30 happens twice; the first is 02:30 CEST, which is 00:30 UTC.
      expect(dispatched(onAction)).toBe(1792888200);
    });

    it("opens on the initial date and time as shown in that zone", () => {
      // 2025-12-31 23:00 UTC is midnight on 1 January in Amsterdam.
      renderInZone(1767222000);
      expect(screen.getByText("January 1st, 2026")).toBeTruthy();
      fireEvent.click(screen.getAllByRole("button")[0]!);
      expect(timeInput().value).toBe("00:00");
      expect(screen.getByRole("button", { pressed: true }).textContent).toBe("1");
    });
  });
});
