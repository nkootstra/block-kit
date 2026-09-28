import type { IconButton as IconButtonElement } from "@slack/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { IconButton } from "./IconButton";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

describe("<IconButton>", () => {
  it("dispatches an icon_button action with its value", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <IconButton
          element={
            {
              type: "icon_button",
              action_id: "ib1",
              icon: "trash",
              text: { type: "plain_text", text: "Delete" },
              value: "row-1",
            } as unknown as IconButtonElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Delete" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "icon_button",
        action_id: "ib1",
        block_id: "b1",
        value: "row-1",
      }),
      expect.anything(),
    );
  });

  it("uses accessibility_label over text as the accessible name when present", () => {
    render(
      <BlockKitProvider>
        <IconButton
          element={
            {
              type: "icon_button",
              action_id: "ib1",
              icon: "clock",
              text: { type: "plain_text", text: "Snooze" },
              accessibility_label: "Snooze this reminder",
            } as unknown as IconButtonElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("button", { name: "Snooze this reminder" })).toBeTruthy();
  });

  it("falls back to a generic icon for an unknown icon name instead of rendering nothing", () => {
    const { container } = render(
      <BlockKitProvider>
        <IconButton
          element={
            {
              type: "icon_button",
              action_id: "ib1",
              icon: "not-a-real-icon",
              text: { type: "plain_text", text: "Do thing" },
            } as unknown as IconButtonElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
