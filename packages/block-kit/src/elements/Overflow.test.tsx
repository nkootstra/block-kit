import type { Overflow as OverflowElement } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { Overflow } from "./Overflow";
import { clickAsync, keyDownAsync } from "./test-utils";

afterEach(cleanup);

function element(extra: Record<string, unknown> = {}): OverflowElement {
  return {
    type: "overflow",
    action_id: "a1",
    options: [
      { value: "a", text: { type: "plain_text", text: "Edit" } },
      { value: "b", text: { type: "plain_text", text: "Delete" } },
    ],
    ...extra,
  } as unknown as OverflowElement;
}

/** Renders the overflow and returns its trigger. */
function renderOverflow(onAction = vi.fn()) {
  render(
    <BlockKitProvider onAction={onAction}>
      <Overflow element={element()} blockId="b1" />
    </BlockKitProvider>,
  );
  return screen.getByRole("button", { name: "More options" });
}

describe("<Overflow>", () => {
  it("opens the menu on click and dispatches selected_option when an item is chosen", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Overflow element={element()} blockId="b1" />
      </BlockKitProvider>,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    await clickAsync(screen.getByText("Delete"));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "overflow",
        action_id: "a1",
        block_id: "b1",
        selected_option: { value: "b", text: { type: "plain_text", text: "Delete", emoji: true } },
      }),
      expect.anything(),
    );
  });

  it("opens the url for a link option and closes the menu", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <BlockKitProvider>
        <Overflow
          element={element({
            options: [
              {
                value: "a",
                text: { type: "plain_text", text: "Open docs" },
                url: "https://example.com/docs",
              },
            ],
          })}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    await clickAsync(screen.getByText("Open docs"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer",
    );
    expect(screen.queryByRole("menu")).toBeNull();
    openSpy.mockRestore();
  });

  // Slack's overflow action carries the option's text and value only, never its url: Bolt's
  // OverflowAction declares `selected_option: { text, value }`, and the Builder's Actions Preview
  // sent no url (state audit, "Overflow menu": "sends overflow with selected_option {text, value},
  // no url").
  it("leaves a link option's url out of the action, as Slack does", async () => {
    const onAction = vi.fn();
    vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <BlockKitProvider onAction={onAction}>
        <Overflow
          element={element({
            options: [
              {
                value: "a",
                text: { type: "plain_text", text: "Open docs" },
                url: "https://example.com/docs",
              },
            ],
          })}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    await clickAsync(screen.getByText("Open docs"));
    expect(onAction.mock.calls[0]![0].selected_option).toEqual({
      value: "a",
      text: { type: "plain_text", text: "Open docs", emoji: true },
    });
    vi.restoreAllMocks();
  });

  it("closes the menu on outside click", () => {
    render(
      <div>
        <Overflow element={element()} blockId="b1" />
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("supports Home/End and Enter from the keyboard", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Overflow element={element()} blockId="b1" />
      </BlockKitProvider>,
    );
    const trigger = screen.getByRole("button", { name: "More options" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "End" });
    expect(screen.getByText("Delete").closest("[data-active]")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "Home" });
    expect(screen.getByText("Edit").closest("[data-active]")).toBeTruthy();
    await keyDownAsync(trigger, "Enter");
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ selected_option: expect.objectContaining({ value: "a" }) }),
      expect.anything(),
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  describe("focus", () => {
    it("moves into the menu when it opens", () => {
      const trigger = renderOverflow();
      fireEvent.click(trigger);
      expect(document.activeElement).toBe(screen.getByRole("menu"));
    });

    it("highlights the first item on the first ArrowDown from the menu", () => {
      renderOverflow();
      fireEvent.click(screen.getByRole("button", { name: "More options" }));
      const menu = screen.getByRole("menu");
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(screen.getByText("Edit").closest("[data-active]")).toBeTruthy();
      expect(menu.getAttribute("aria-activedescendant")).toBe(
        screen.getByText("Edit").closest("[role=menuitem]")?.id,
      );
    });

    it("returns to the trigger when Escape closes the menu", () => {
      const trigger = renderOverflow();
      fireEvent.click(trigger);
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("returns to the trigger after an item is chosen", async () => {
      const trigger = renderOverflow();
      fireEvent.click(trigger);
      await clickAsync(screen.getByText("Delete"));
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("highlights the row under the pointer", () => {
    render(
      <BlockKitProvider>
        <Overflow element={element()} blockId="b1" />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.mouseEnter(screen.getByText("Delete"));
    expect(screen.getByText("Delete").closest("[data-active]")).toBeTruthy();
    expect(screen.getByText("Edit").closest("[data-active]")).toBeNull();
  });
});
