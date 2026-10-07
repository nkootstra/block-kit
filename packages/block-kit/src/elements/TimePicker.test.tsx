import type { Timepicker } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { Input } from "../blocks/Input";
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
  // Measured in Block Kit Builder: Slack labels the field "Time" for screen readers, whatever its
  // placeholder says.
  it("labels the field Time, as Slack does, while keeping its placeholder", () => {
    render(
      <BlockKitProvider>
        <TimePicker
          element={
            {
              type: "timepicker",
              action_id: "a1",
              placeholder: { type: "plain_text", text: "Select time" },
            } as unknown as Timepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const field = screen.getByRole("combobox", { name: "Time" }) as HTMLInputElement;
    expect(field.placeholder).toBe("Select time");
  });

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

  // Slack's line under the field is one text run, "Time zone: Eastern Time (US and Canada)".
  it("writes the time zone line as a single text run", () => {
    render(
      <BlockKitProvider>
        <TimePicker
          element={
            {
              type: "timepicker",
              action_id: "a1",
              timezone: "America/New_York",
            } as unknown as Timepicker
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const hint = document.querySelector(".sbk-timepicker__hint")!;
    expect([...hint.childNodes].map((n) => n.textContent)).toEqual([
      "Time zone: Eastern Time (US and Canada)",
    ]);
  });

  // Measured in Block Kit Builder's references: an input block's time list starts with "Clear
  // selection" once a time is chosen, where the time may be left empty (an optional input, or any
  // input on the message surface). Actions blocks and section accessories have no such row.
  describe("Clear selection", () => {
    function inInput(
      optional: boolean,
      props: Omit<Parameters<typeof BlockKitProvider>[0], "children"> = {},
      initialTime: string | null = "13:37",
    ) {
      render(
        <BlockKitProvider {...props}>
          <Input
            block={
              {
                type: "input",
                block_id: "b1",
                optional,
                label: { type: "plain_text", text: "When" },
                element: {
                  type: "timepicker",
                  action_id: "a1",
                  initial_time: initialTime ?? undefined,
                },
              } as never
            }
            blockId="b1"
            index={0}
          />
        </BlockKitProvider>,
      );
      const input = screen.getByRole("combobox") as HTMLInputElement;
      fireEvent.click(input);
      return input;
    }
    const rows = () => screen.queryAllByRole("option").map((o) => o.textContent);

    it("starts a message input's list with Clear selection", () => {
      inInput(false);
      expect(rows().slice(0, 2)).toEqual(["Clear selection", "12:00 AM"]);
    });

    it("starts an optional modal input's list with Clear selection", () => {
      inInput(true, { surface: "modal" });
      expect(rows()[0]).toBe("Clear selection");
    });

    it("has no Clear selection in a required modal input", () => {
      inInput(false, { surface: "modal" });
      expect(rows()).not.toContain("Clear selection");
    });

    it("has no Clear selection before a time is chosen", () => {
      inInput(false, {}, null);
      expect(rows()).not.toContain("Clear selection");
    });

    it("has no Clear selection outside an input block", () => {
      renderPicker(vi.fn(), "13:37");
      fireEvent.click(screen.getByRole("combobox"));
      expect(rows()).not.toContain("Clear selection");
    });

    it("empties the field and reports a null selected_time", async () => {
      let state: StateValues = {};
      const input = inInput(false, { onStateChange: (s) => (state = s) });
      await clickAsync(screen.getByRole("option", { name: "Clear selection" }));
      expect(state.b1?.a1).toEqual({ type: "timepicker", selected_time: null });
      expect(input.value).toBe("");
      expect(document.querySelector(".sbk-timepicker__content")).toBeNull();
    });
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
