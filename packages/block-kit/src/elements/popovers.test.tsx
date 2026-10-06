import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import type { Json } from "../types";
import { Element } from "./Element";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const option = (text: string) => ({ text: { type: "plain_text", text }, value: text });

// Every element that opens a menu or calendar, and the control that opens it.
const cases: { name: string; element: Json; open: (clip: HTMLElement) => HTMLElement }[] = [
  {
    name: "datepicker",
    element: { type: "datepicker", action_id: "a", initial_date: "2026-01-01" },
    open: (clip) => clip.querySelector("input")!,
  },
  {
    name: "timepicker",
    element: { type: "timepicker", action_id: "a", initial_time: "10:00" },
    open: (clip) => clip.querySelector('[role="combobox"]')!,
  },
  {
    name: "datetimepicker",
    element: { type: "datetimepicker", action_id: "a", initial_date_time: 1767261600 },
    open: (clip) => clip.querySelector("button")!,
  },
  {
    name: "static_select",
    element: { type: "static_select", action_id: "a", options: [option("One"), option("Two")] },
    open: (clip) => clip.querySelector("button")!,
  },
  {
    name: "overflow",
    element: { type: "overflow", action_id: "a", options: [option("Edit"), option("Delete")] },
    open: (clip) => clip.querySelector("button")!,
  },
];

const POPUP = ".sbk-popover";

describe("popovers", () => {
  describe.each(cases)("$name", ({ element, open }) => {
    function setup() {
      render(
        <BlockKitProvider>
          <div data-testid="clip" style={{ overflow: "hidden", height: 40 }}>
            <Element element={element} blockId="b" />
          </div>
        </BlockKitProvider>,
      );
      const clip = screen.getByTestId("clip");
      fireEvent.click(open(clip));
      return clip;
    }

    it("renders outside ancestors that clip overflow, like Slack's popovers", () => {
      const clip = setup();
      expect(clip.querySelector(POPUP)).toBeNull();
      expect(document.body.querySelector(POPUP)).not.toBeNull();
    });

    it("stays open when pressed inside", () => {
      setup();
      fireEvent.mouseDown(document.body.querySelector(POPUP)!.firstElementChild!);
      expect(document.body.querySelector(POPUP)).not.toBeNull();
    });

    it("closes when pressed outside", () => {
      setup();
      fireEvent.mouseDown(document.body);
      expect(document.body.querySelector(POPUP)).toBeNull();
    });
  });

  it("stays inside the viewport when it fits neither below nor above its control", () => {
    // A 417px calendar opened from a control in the middle of a 500px-tall window.
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(417);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 20, y: 200, width: 200, height: 32 }),
    );
    render(
      <BlockKitProvider>
        <Element element={cases[2]!.element} blockId="b" />
      </BlockKitProvider>,
    );
    fireEvent.click(document.body.querySelector("button")!);
    const top = parseFloat(document.querySelector<HTMLElement>(POPUP)!.style.top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + 417).toBeLessThanOrEqual(500);
  });
});
