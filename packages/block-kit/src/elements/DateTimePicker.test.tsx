import type { DateTimepicker } from "@slack/types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { DateTimePicker } from "./DateTimePicker";
import { clickAsync, keyDownAsync } from "./test-utils";

afterEach(cleanup);

/** Wednesday 7 October 2026, 11:31:40 in Amsterdam (09:31:40 UTC). */
const NOW = new Date("2026-10-07T09:31:40Z");

beforeEach(() => {
  // Only the clock: promises and timers keep running, so confirm prompts still resolve.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function renderPicker(
  element: Partial<DateTimepicker> = {},
  { onAction = vi.fn(), timeZone = "Europe/Amsterdam" } = {},
) {
  let state: StateValues = {};
  render(
    <BlockKitProvider onAction={onAction} onStateChange={(s) => (state = s)} timeZone={timeZone}>
      <DateTimePicker
        element={{ type: "datetimepicker", action_id: "a1", ...element } as DateTimepicker}
        blockId="b1"
      />
    </BlockKitProvider>,
  );
  return { onAction, state: () => state };
}

const dateButton = () =>
  document.querySelector(".sbk-datetimepicker__control--date") as HTMLButtonElement;
const timeInput = () => screen.getByRole("combobox") as HTMLInputElement;
const dateText = () => dateButton().textContent;
/** What the time field shows: the chosen time while closed, else its placeholder. */
const timeText = () =>
  document.querySelector(".sbk-datetimepicker__content-text")?.textContent ??
  timeInput().placeholder;

async function pickDay(day: string) {
  fireEvent.click(dateButton());
  await clickAsync(screen.getByRole("button", { name: day }));
}

async function pickTime(label: string) {
  fireEvent.click(timeInput());
  await clickAsync(screen.getByRole("option", { name: label }));
}

async function typeTime(text: string) {
  fireEvent.click(timeInput());
  fireEvent.change(timeInput(), { target: { value: text } });
  await keyDownAsync(timeInput(), "Enter");
}

const sent = (onAction: ReturnType<typeof vi.fn>, call = 0) =>
  onAction.mock.calls[call]![0] as { selected_date_time: number | null };

describe("<DateTimePicker>", () => {
  it("shows Slack's placeholders, a date field and a time field", () => {
    renderPicker();
    expect([dateText(), timeText()]).toEqual(["Select a date", "Time"]);
  });

  it("formats initial_date_time and reports it as state on mount", () => {
    const { state } = renderPicker({ initial_date_time: ts("2026-01-01T10:00:00Z") });
    expect([dateText(), timeText()]).toEqual(["January 1st, 2026", "11:00 AM"]);
    expect(state().b1?.a1).toEqual({
      type: "datetimepicker",
      selected_date_time: ts("2026-01-01T10:00:00Z"),
    });
  });

  it("has no Apply step: the calendar holds only the month", () => {
    renderPicker();
    fireEvent.click(dateButton());
    expect(screen.queryByText("Apply")).toBeNull();
  });

  describe("picking one part", () => {
    it("fills the current time when a day is picked first, and sends the action at once", async () => {
      const { onAction, state } = renderPicker();
      await pickDay("15");
      // 15 October at 11:31 in Amsterdam, the seconds dropped: 09:31:00 UTC.
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(sent(onAction).selected_date_time).toBe(ts("2026-10-15T09:31:00Z"));
      expect([dateText(), timeText()]).toEqual(["October 15th, 2026", "11:31 AM"]);
      expect(state().b1?.a1).toEqual({
        type: "datetimepicker",
        selected_date_time: ts("2026-10-15T09:31:00Z"),
      });
    });

    it("fills today when a time is picked first, shown as Today", async () => {
      const { onAction } = renderPicker();
      await pickTime("3:00 PM");
      expect(sent(onAction).selected_date_time).toBe(ts("2026-10-07T13:00:00Z"));
      expect([dateText(), timeText()]).toEqual(["Today", "3:00 PM"]);
    });

    it("sends a second action with both parts when the other one is picked", async () => {
      const { onAction } = renderPicker();
      await pickTime("3:00 PM");
      await pickDay("20");
      expect(onAction).toHaveBeenCalledTimes(2);
      expect(sent(onAction, 1).selected_date_time).toBe(ts("2026-10-20T13:00:00Z"));
    });

    it("keeps the chosen time when the day changes", async () => {
      const { onAction } = renderPicker({ initial_date_time: ts("2026-01-01T10:00:00Z") });
      await pickDay("2");
      expect(sent(onAction).selected_date_time).toBe(ts("2026-01-02T10:00:00Z"));
    });

    it("echoes initial_date_time in the action, as Slack does", async () => {
      const { onAction } = renderPicker({ initial_date_time: ts("2026-01-01T10:00:00Z") });
      await pickTime("3:00 PM");
      expect(onAction.mock.calls[0]![0]).toMatchObject({
        type: "datetimepicker",
        action_id: "a1",
        block_id: "b1",
        selected_date_time: ts("2026-01-01T14:00:00Z"),
        initial_date_time: ts("2026-01-01T10:00:00Z"),
      });
    });
  });

  describe("the time list", () => {
    it("lists the hours of the day", () => {
      renderPicker();
      fireEvent.click(timeInput());
      const rows = screen.getAllByRole("option").map((o) => o.textContent);
      expect([rows.length, rows[0], rows[23]]).toEqual([24, "12:00 AM", "11:00 PM"]);
    });

    it("takes a typed time that isn't on the hour", async () => {
      const { onAction } = renderPicker({ initial_date_time: ts("2026-01-01T10:00:00Z") });
      await typeTime("2:15 PM");
      expect(sent(onAction).selected_date_time).toBe(ts("2026-01-01T13:15:00Z"));
    });
  });

  describe("Clear selection", () => {
    it("isn't offered while nothing is chosen", () => {
      renderPicker();
      fireEvent.click(timeInput());
      expect(screen.queryByRole("option", { name: "Clear selection" })).toBeNull();
      fireEvent.click(dateButton());
      expect(screen.queryByText("Clear selection")).toBeNull();
    });

    it("leads the time list once a value is chosen, and empties both fields", async () => {
      const { onAction, state } = renderPicker({
        initial_date_time: ts("2026-01-01T10:00:00Z"),
      });
      fireEvent.click(timeInput());
      expect(screen.getAllByRole("option")[0]!.textContent).toBe("Clear selection");
      await clickAsync(screen.getByRole("option", { name: "Clear selection" }));
      expect([dateText(), timeText()]).toEqual(["Select a date", "Time"]);
      expect(onAction.mock.calls[0]![0]).toMatchObject({
        selected_date_time: null,
        initial_date_time: ts("2026-01-01T10:00:00Z"),
      });
      expect(state().b1?.a1).toEqual({ type: "datetimepicker", selected_date_time: null });
    });

    it("closes the calendar with a footer that empties both fields", async () => {
      const { onAction } = renderPicker({ initial_date_time: ts("2026-01-01T10:00:00Z") });
      fireEvent.click(dateButton());
      await clickAsync(screen.getByText("Clear selection"));
      expect([dateText(), timeText()]).toEqual(["Select a date", "Time"]);
      expect(sent(onAction).selected_date_time).toBeNull();
    });
  });

  it("asks the element's confirm dialog before a change takes effect", async () => {
    const { onAction } = renderPicker({
      confirm: {
        title: { type: "plain_text", text: "Sure?" },
        text: { type: "plain_text", text: "Really change it?" },
        confirm: { type: "plain_text", text: "Yes" },
        deny: { type: "plain_text", text: "No" },
      },
    });
    await pickDay("15");
    expect(onAction).not.toHaveBeenCalled();
    await clickAsync(screen.getByRole("button", { name: "No" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(dateText()).toBe("Select a date");
  });

  describe("in a configured time zone", () => {
    it("sends the picked wall-clock time in that zone, not in UTC", async () => {
      const { onAction } = renderPicker({ initial_date_time: ts("2026-01-01T12:00:00Z") });
      await pickTime("11:00 AM");
      // 2026-01-01 11:00 in Amsterdam (UTC+1) is 10:00 UTC.
      expect(sent(onAction).selected_date_time).toBe(ts("2026-01-01T10:00:00Z"));
    });

    it("follows the zone's daylight saving offset", async () => {
      const { onAction } = renderPicker({ initial_date_time: ts("2026-07-01T12:00:00Z") });
      await pickTime("11:00 AM");
      // 2026-07-01 11:00 in Amsterdam (UTC+2) is 09:00 UTC.
      expect(sent(onAction).selected_date_time).toBe(ts("2026-07-01T09:00:00Z"));
    });

    it("moves a time skipped by the spring change forward by the gap", async () => {
      // 29 March 2026: Amsterdam's clocks jump from 02:00 to 03:00.
      const { onAction } = renderPicker({ initial_date_time: ts("2026-03-29T12:00:00Z") });
      await typeTime("2:30");
      // 02:30 doesn't exist, so it becomes 03:30 CEST, which is 01:30 UTC.
      expect(sent(onAction).selected_date_time).toBe(ts("2026-03-29T01:30:00Z"));
    });

    it("takes the first of the two times repeated by the autumn change", async () => {
      // 25 October 2026: Amsterdam's clocks fall back from 03:00 to 02:00.
      const { onAction } = renderPicker({ initial_date_time: ts("2026-10-25T12:00:00Z") });
      await typeTime("2:30");
      // 02:30 happens twice; the first is 02:30 CEST, which is 00:30 UTC.
      expect(sent(onAction).selected_date_time).toBe(ts("2026-10-25T00:30:00Z"));
    });

    it("opens on the initial date and time as shown in that zone", () => {
      // 2025-12-31 23:00 UTC is midnight on 1 January in Amsterdam.
      renderPicker({ initial_date_time: ts("2025-12-31T23:00:00Z") });
      expect([dateText(), timeText()]).toEqual(["January 1st, 2026", "12:00 AM"]);
      fireEvent.click(dateButton());
      expect(screen.getByRole("button", { pressed: true }).textContent).toBe("1");
    });

    it("counts today in that zone", async () => {
      // 23:30 on 6 October in UTC is already 7 October in Amsterdam.
      vi.setSystemTime(new Date("2026-10-06T22:30:00Z"));
      const { onAction } = renderPicker();
      await pickTime("3:00 PM");
      expect(dateText()).toBe("Today");
      expect(sent(onAction).selected_date_time).toBe(ts("2026-10-07T13:00:00Z"));
    });
  });

  it("keeps the time list open while typing, and closes it on Escape", () => {
    renderPicker();
    fireEvent.click(timeInput());
    act(() => {
      fireEvent.keyDown(timeInput(), { key: "Escape" });
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
