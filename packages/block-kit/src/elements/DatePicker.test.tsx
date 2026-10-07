import type { Datepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { Message } from "../Message";
import { DatePicker } from "./DatePicker";
import { blurAsync, clickAsync, keyDownAsync } from "./test-utils";

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
/** Whether the calendar popup is showing. */
const calendarOpen = () => document.querySelector(".sbk-datepicker__popup") !== null;
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

  /** A datepicker set to 15 June 2024 in an input block, its calendar open. */
  function inInput(
    optional: boolean,
    props: Omit<Parameters<typeof BlockKitProvider>[0], "children"> = {},
  ) {
    render(
      <BlockKitProvider {...props}>
        <Message
          blocks={
            [
              {
                type: "input",
                block_id: "b1",
                optional,
                label: { type: "plain_text", text: "Due" },
                element: { type: "datepicker", action_id: "a1", initial_date: "2024-06-15" },
              },
            ] as never
          }
        />
      </BlockKitProvider>,
    );
    const input = screen.getByPlaceholderText("Select a date") as HTMLInputElement;
    fireEvent.click(input);
    return input;
  }

  it("clears the selection of an optional input's datepicker from the calendar footer", async () => {
    const onAction = vi.fn();
    let state: StateValues = {};
    const input = inInput(true, { onAction, onStateChange: (s) => (state = s) });
    expect(screen.getByText("15").getAttribute("aria-pressed")).toBe("true");
    await clickAsync(screen.getByText("Clear selection"));
    expect(state.b1?.a1).toEqual({ type: "datepicker", selected_date: null });
    expect(input.value).toBe("");
  });

  it("offers no Clear selection for a required input's datepicker, as in Slack", () => {
    inInput(false);
    expect(screen.queryByText("Clear selection")).toBeNull();
  });

  it("offers no Clear selection outside an input block, as in Slack", () => {
    open();
    expect(screen.queryByText("Clear selection")).toBeNull();
  });

  it("moves a year at a time with the year buttons", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(monthLabel()).toBe("April 1991");
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    expect(monthLabel()).toBe("April 1989");
  });

  it("heads the week with Slack's two-letter day names", () => {
    open();
    const names = [...document.querySelectorAll(".sbk-calendar__weekdays > *")].map(
      (d) => d.textContent,
    );
    expect(names).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
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
    expect(calendarOpen()).toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(calendarOpen()).toBe(false);
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
      expect(calendarOpen()).toBe(true);
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
      expect(calendarOpen()).toBe(false);
    });

    it("closes on Escape from the calendar and returns focus to the field", () => {
      const input = open();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(calendarOpen()).toBe(false);
      expect(document.activeElement).toBe(input);
    });
  });

  describe("typing a date", () => {
    /** A datepicker set to 28 April 1990, focused with the calendar open, its text selected. */
    function typed(text: string, onAction = vi.fn()) {
      const input = open(onAction);
      input.focus();
      fireEvent.change(input, { target: { value: text } });
      return { input, onAction };
    }

    // Measured in Block Kit Builder: each of these, then Enter, sends the date and keeps the
    // calendar open.
    for (const [text, date] of [
      ["05/01/1990", "1990-05-01"],
      ["5/4/90", "1990-05-04"],
      ["1990-05-02", "1990-05-02"],
      ["May 3, 1990", "1990-05-03"],
      ["April 9th, 1990", "1990-04-09"],
    ] as const) {
      it(`takes "${text}" on Enter, keeping the calendar open`, async () => {
        const { input, onAction } = typed(text);
        await keyDownAsync(input, "Enter");
        expect(onAction).toHaveBeenCalledWith(
          expect.objectContaining({ selected_date: date, initial_date: "1990-04-28" }),
          expect.anything(),
        );
        expect(calendarOpen()).toBe(true);
      });
    }

    it("sends nothing for text that isn't a date, keeping the text and the calendar", async () => {
      const { input, onAction } = typed("abc");
      await keyDownAsync(input, "Enter");
      expect(onAction).not.toHaveBeenCalled();
      expect(input.value).toBe("abc");
      expect(calendarOpen()).toBe(true);
    });

    it("puts the chosen date back on Escape", async () => {
      const { input, onAction } = typed("abc");
      await keyDownAsync(input, "Escape");
      expect(input.value).toBe("04/28/1990");
      expect(calendarOpen()).toBe(false);
      expect(onAction).not.toHaveBeenCalled();
    });

    it("takes a typed date when focus leaves the field, as Slack does", async () => {
      const { input, onAction } = typed("5/6/1990");
      await blurAsync(input);
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ selected_date: "1990-05-06" }),
        expect.anything(),
      );
      expect(input.value).toBe("05/06/1990");
    });
  });

  describe("accessibility, as Slack's field", () => {
    it("labels the field Date, without aria-expanded or aria-haspopup", () => {
      const input = open();
      expect([
        input.getAttribute("aria-label"),
        input.hasAttribute("aria-expanded"),
        input.hasAttribute("aria-haspopup"),
        input.readOnly,
      ]).toEqual(["Date", false, false, false]);
    });

    it("opens the calendar from its own Open calendar button, on the selected day", () => {
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
      fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
      expect(calendarOpen()).toBe(true);
      expect(focusedDay()).toBe("28");
    });

    it("names each day in full, as Slack's day buttons do", () => {
      open();
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Saturday, April 28th, 1990");
    });
  });
});
