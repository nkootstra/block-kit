import type { Datepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { Message } from "../Message";
import { DatePicker } from "./DatePicker";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

describe("<DatePicker>", () => {
  it("shows the placeholder when no date is selected", () => {
    render(
      <BlockKitProvider>
        <DatePicker
          element={{ type: "datepicker", action_id: "a1" } as unknown as Datepicker}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByPlaceholderText("Select a date")).toBeTruthy();
  });

  it("formats initial_date like Slack's closed control and reports it as state on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <DatePicker
          element={
            {
              type: "datepicker",
              action_id: "a1",
              initial_date: "1990-04-28",
            } as unknown as Datepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect((screen.getByPlaceholderText("Select a date") as HTMLInputElement).value).toBe(
      "04/28/1990",
    );
    expect(state.b1?.a1).toEqual({ type: "datepicker", selected_date: "1990-04-28" });
  });

  it("spells the date out inside an input block, as Slack does", () => {
    render(
      <Message
        blocks={
          [
            {
              type: "input",
              label: { type: "plain_text", text: "Birthday" },
              element: { type: "datepicker", action_id: "a1", initial_date: "1990-04-28" },
            },
          ] as never
        }
      />,
    );
    expect((screen.getByPlaceholderText("Select a date") as HTMLInputElement).value).toBe(
      "April 28th, 1990",
    );
  });

  it("opens the calendar popup on click and dispatches selected_date when a day is picked", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <DatePicker
          element={
            {
              type: "datepicker",
              action_id: "a1",
              initial_date: "2024-06-15",
            } as unknown as Datepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByPlaceholderText("Select a date"));
    // The calendar renders day-of-month buttons; pick a different day within the same month.
    await clickAsync(screen.getByText("20"));
    expect(onAction).toHaveBeenCalledTimes(1);
    const [action] = onAction.mock.calls[0]!;
    expect(action).toMatchObject({
      type: "datepicker",
      action_id: "a1",
      block_id: "b1",
      selected_date: "2024-06-20",
    });
  });

  it("clears the selection from the calendar footer and dispatches a null selected_date", async () => {
    const onAction = vi.fn();
    let state: StateValues = {};
    render(
      <BlockKitProvider onAction={onAction} onStateChange={(s) => (state = s)}>
        <DatePicker
          element={
            {
              type: "datepicker",
              action_id: "a1",
              initial_date: "2024-06-15",
            } as unknown as Datepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const input = screen.getByPlaceholderText("Select a date") as HTMLInputElement;
    fireEvent.click(input);
    expect(screen.getByText("15").getAttribute("aria-pressed")).toBe("true");
    await clickAsync(screen.getByText("Clear selection"));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "datepicker", selected_date: null }),
      expect.anything(),
    );
    expect(state.b1?.a1).toEqual({ type: "datepicker", selected_date: null });
    expect(input.value).toBe("");
  });

  it("closes the calendar on Escape", () => {
    render(
      <BlockKitProvider>
        <DatePicker
          element={{ type: "datepicker", action_id: "a1" } as unknown as Datepicker}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const input = screen.getByPlaceholderText("Select a date");
    fireEvent.click(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Previous month")).toBeNull();
  });
});
