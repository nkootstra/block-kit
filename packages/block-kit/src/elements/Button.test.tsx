import type { Button as ButtonElement } from "@slack/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { Button } from "./Button";
import { clickAsync } from "./test-utils";

afterEach(cleanup);

function textElement(text: string, extra: Record<string, unknown> = {}): ButtonElement {
  return {
    type: "button",
    text: { type: "plain_text", text, emoji: true },
    ...extra,
  } as unknown as ButtonElement;
}

describe("<Button>", () => {
  it("dispatches a block_actions button payload on click", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Button
          element={textElement("Click me", { action_id: "btn1", value: "v1" })}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Click me" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    const [action] = onAction.mock.calls[0]!;
    expect(action).toMatchObject({
      type: "button",
      action_id: "btn1",
      block_id: "b1",
      value: "v1",
      text: { type: "plain_text", text: "Click me", emoji: true },
    });
    expect(typeof action.action_ts).toBe("string");
  });

  it("includes url and style in the payload when present, and opens the url", async () => {
    const onAction = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <BlockKitProvider onAction={onAction}>
        <Button
          element={textElement("Go", {
            action_id: "link1",
            url: "https://example.com",
            style: "primary",
          })}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Go" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com", style: "primary" }),
      expect.anything(),
    );
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("waits for confirmation before dispatching when a confirm dialog is configured", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Button
          element={textElement("Delete", {
            action_id: "del1",
            confirm: {
              title: { type: "plain_text", text: "Are you sure?" },
              text: { type: "plain_text", text: "This cannot be undone." },
              confirm: { type: "plain_text", text: "Do it" },
              deny: { type: "plain_text", text: "Cancel" },
            },
          })}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Delete" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    await clickAsync(screen.getByRole("button", { name: "Do it" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("uses accessibility_label as the accessible name when provided", () => {
    render(
      <BlockKitProvider>
        <Button
          element={textElement("👍", { action_id: "a1", accessibility_label: "Approve" })}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });
});
