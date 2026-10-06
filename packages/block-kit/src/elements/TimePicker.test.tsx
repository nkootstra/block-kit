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

  describe("as a typeable picker", () => {
    it("lists the day hour by hour, as Slack does", () => {
      const { input } = renderPicker();
      fireEvent.click(input);
      const options = screen.getAllByRole("option").map((o) => o.textContent);
      expect(options).toHaveLength(24);
      expect(options.slice(0, 3)).toEqual(["12:00 AM", "1:00 AM", "2:00 AM"]);
      expect(options.at(-1)).toBe("11:00 PM");
    });

    it("filters the list to the times that start with what's typed", () => {
      const { input } = renderPicker();
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: "3" } });
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "3:00 AM",
        "3:00 PM",
      ]);
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
      fireEvent.change(input, { target: { value: "1" } });
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
      fireEvent.change(input, { target: { value: "4" } });
      const listbox = screen.getByRole("listbox");
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(input.getAttribute("aria-controls")).toBe(listbox.id);
      const active = input.getAttribute("aria-activedescendant");
      expect(active && document.getElementById(active)?.textContent).toBe("4:00 AM");
    });
  });
});
