import type { Timepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { TimePicker } from "./TimePicker";
import { clickAsync, keyDownAsync } from "./test-utils";

afterEach(cleanup);

function renderPicker(onAction = vi.fn(), initial_time?: string) {
  render(
    <BlockKitProvider onAction={onAction}>
      <TimePicker
        element={{ type: "timepicker", action_id: "a1", initial_time } as unknown as Timepicker}
        blockId="b1"
      />
    </BlockKitProvider>,
  );
  return { onAction, input: screen.getByRole("combobox") as HTMLInputElement };
}

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
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toBe("Select time");
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
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("1:37 PM");
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
    fireEvent.click(screen.getByRole("combobox"));
    await clickAsync(screen.getByRole("option", { name: "2:00 PM" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "timepicker",
        action_id: "a1",
        block_id: "b1",
        selected_time: "14:00",
      }),
      expect.anything(),
    );
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("2:00 PM");
  });

  /** The line under a timepicker with `timezone`. */
  function zoneLine(timezone: string) {
    render(
      <BlockKitProvider>
        <TimePicker
          element={{ type: "timepicker", action_id: "a1", timezone } as unknown as Timepicker}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    return document.querySelector(".sbk-timepicker__hint")?.textContent;
  }

  // Measured in Block Kit Builder: Slack names the zone after its own region list, not the IANA id.
  for (const [zone, line] of [
    ["America/New_York", "Time zone: Eastern Time (US and Canada)"],
    ["America/Los_Angeles", "Time zone: Pacific Time (US and Canada)"],
    ["America/Denver", "Time zone: Mountain Time (US and Canada), Navajo Nation"],
    ["Europe/Amsterdam", "Time zone: Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna"],
    ["Europe/Madrid", "Time zone: Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna"],
    ["Asia/Tokyo", "Time zone: Osaka, Sapporo, Tokyo"],
    ["Asia/Singapore", "Time zone: Beijing, Chongqing, Hong Kong SAR, Urumqi"],
    ["Asia/Kolkata", "Time zone: Chennai, Kolkata, Mumbai, New Delhi"],
    ["UTC", "Time zone: Monrovia, Reykjavik"],
  ] as const) {
    it(`names ${zone} as Slack does`, () => {
      expect(zoneLine(zone)).toBe(line);
    });
  }

  // Two names the Builder shows garbled: Fort Nelson as another zone's "(UTC+01:00) Amsterdam, …"
  // and Tonga with its apostrophe still HTML-escaped. Ours read cleanly.
  it("names Fort Nelson like the other UTC-7 zones without daylight saving", () => {
    expect(zoneLine("America/Fort_Nelson")).toBe("Time zone: Arizona, Vancouver");
  });

  it("names Tonga with a plain apostrophe", () => {
    expect(zoneLine("Pacific/Tongatapu")).toBe("Time zone: Nuku'alofa");
  });

  describe("as a typeable picker", () => {
    it("shows the chosen time in an overlay over the input, as Slack's c-select_input__content does", () => {
      renderPicker(vi.fn(), "13:37");
      const overlay = document.querySelector(".sbk-timepicker__content");
      expect(overlay?.textContent).toBe("1:37 PM");
      expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    });

    it("hides the overlay while the list is open, so typing shows in the input", () => {
      const { input } = renderPicker(vi.fn(), "13:37");
      fireEvent.click(input);
      expect(document.querySelector(".sbk-timepicker__content")).toBeNull();
    });

    it("has no overlay without a chosen time, leaving the placeholder to the input", () => {
      renderPicker();
      expect(document.querySelector(".sbk-timepicker__content")).toBeNull();
    });

    it("lists the day hour by hour, as Slack does", () => {
      const { input } = renderPicker();
      fireEvent.click(input);
      const options = screen.getAllByRole("option").map((o) => o.textContent);
      expect(options).toHaveLength(24);
      expect(options.slice(0, 3)).toEqual(["12:00 AM", "1:00 AM", "2:00 AM"]);
      expect(options.at(-1)).toBe("11:00 PM");
    });

    // Measured in Block Kit Builder: typing neither filters, highlights nor scrolls Slack's list.
    it("keeps every hour listed, with nothing highlighted, while typing", () => {
      const { input } = renderPicker();
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: "3" } });
      expect(screen.getAllByRole("option")).toHaveLength(24);
      expect(input.getAttribute("aria-activedescendant")).toBeNull();
    });

    it("highlights the first hour on the first ArrowDown, even with something typed", async () => {
      const { input, onAction } = renderPicker();
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: "3 pm" } });
      await keyDownAsync(input, "ArrowDown");
      const active = input.getAttribute("aria-activedescendant");
      expect(active && document.getElementById(active)?.textContent).toBe("12:00 AM");
      // Enter then takes the highlighted hour, not the typed time.
      await keyDownAsync(input, "Enter");
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ selected_time: "00:00" }),
        expect.anything(),
      );
    });

    it("keeps the list open and sends nothing for text that isn't a time", async () => {
      const { input, onAction } = renderPicker();
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: "abc" } });
      await keyDownAsync(input, "Enter");
      expect(onAction).not.toHaveBeenCalled();
      expect(screen.getAllByRole("option")).toHaveLength(24);
    });

    it("shows the chosen time as the field's text when the list reopens", () => {
      const { input } = renderPicker(vi.fn(), "15:15");
      fireEvent.click(input);
      expect(input.value).toBe("3:15 PM");
    });

    it("picks a typed time off the hour on Enter, echoing initial_time", async () => {
      const { input, onAction } = renderPicker(vi.fn(), "13:37");
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: "2:15 pm" } });
      await keyDownAsync(input, "Enter");
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ selected_time: "14:15", initial_time: "13:37" }),
        expect.anything(),
      );
      expect(input.value).toBe("2:15 PM");
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("moves through the list with the arrow keys and picks with Enter", async () => {
      const { input, onAction } = renderPicker();
      fireEvent.click(input);
      await keyDownAsync(input, "ArrowDown");
      await keyDownAsync(input, "ArrowDown");
      await keyDownAsync(input, "Enter");
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ selected_time: "01:00" }),
        expect.anything(),
      );
    });

    it("closes on Escape and shows the chosen time again", async () => {
      const { input, onAction } = renderPicker(vi.fn(), "13:37");
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: "9" } });
      await keyDownAsync(input, "Escape");
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(input.value).toBe("1:37 PM");
      expect(onAction).not.toHaveBeenCalled();
    });

    it("is a combobox that points at its list and the highlighted option", () => {
      const { input } = renderPicker();
      expect(input.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(input);
      fireEvent.keyDown(input, { key: "ArrowDown" });
      const listbox = screen.getByRole("listbox");
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(input.getAttribute("aria-controls")).toBe(listbox.id);
      const active = input.getAttribute("aria-activedescendant");
      expect(active && document.getElementById(active)?.textContent).toBe("12:00 AM");
    });
  });
});
