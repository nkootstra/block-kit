import type { Datepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { Message } from "../Message";
import { DatePicker } from "./DatePicker";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

/** Renders a datepicker set to 28 April 1990, opens its calendar and returns the field. */
function open(onAction = vi.fn()) {
  render(
    <BlockKitProvider onAction={onAction}>
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
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.click(input);
  return input;
}

const focusedDay = () => (document.activeElement as HTMLElement).textContent;
const monthLabel = () => document.querySelector(".sbk-calendar__label")?.textContent;

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

  describe("keyboard", () => {
    it("keeps focus in the field when tabbing opens the calendar, and ArrowDown moves in", () => {
      render(
        <BlockKitProvider>
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
      const input = screen.getByRole("textbox") as HTMLInputElement;
      // Tabbing in: focus lands on the field without a click.
      input.focus();
      fireEvent.focus(input);
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(focusedDay()).toBe("28");
    });

    it("focuses the selected day when the calendar opens", () => {
      open();
      expect(focusedDay()).toBe("28");
    });

    it("makes the month grid a single tab stop on the focused day", () => {
      open();
      const tabbable = [...document.querySelectorAll(".sbk-calendar__grid button")].filter(
        (b) => (b as HTMLElement).tabIndex === 0,
      );
      expect(tabbable.map((b) => b.textContent)).toEqual(["28"]);
    });

    it("moves a day with ArrowLeft and ArrowRight", () => {
      open();
      fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
      expect(focusedDay()).toBe("29");
      fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
      fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
      expect(focusedDay()).toBe("27");
    });

    it("moves a week with ArrowUp and ArrowDown, into the next month when it has to", () => {
      open();
      fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
      expect(focusedDay()).toBe("21");
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      expect([monthLabel(), focusedDay()]).toEqual(["May 1990", "5"]);
    });

    it("picks the focused day with Enter and returns focus to the field, closed", async () => {
      const onAction = vi.fn();
      const input = open(onAction);
      fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
      await clickAsync(document.activeElement!);
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ selected_date: "1990-04-29" }),
        expect.anything(),
      );
      expect(document.activeElement).toBe(input);
      expect(input.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes on Escape from the calendar and returns focus to the field", () => {
      const input = open();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(input.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(input);
    });
  });
});
