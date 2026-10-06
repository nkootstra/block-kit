import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { Message } from "../Message";
import { clickAsync, keyDownAsync } from "./test-utils";

afterEach(cleanup);

const plain = (text: string) => ({ type: "plain_text", text, emoji: true });
const option = (text: string, value: string) => ({ text: plain(text), value });

function renderAccessory(extra: Record<string, unknown> = {}, onAction = vi.fn()) {
  render(
    <BlockKitProvider onAction={onAction}>
      <Message
        blocks={
          [
            {
              type: "section",
              block_id: "b1",
              text: { type: "mrkdwn", text: "Pick some" },
              accessory: {
                type: "multi_static_select",
                action_id: "a1",
                placeholder: plain("Select options"),
                options: [option("Alpha", "a"), option("Bravo", "b"), option("Charlie", "c")],
                ...extra,
              },
            },
          ] as never
        }
      />
    </BlockKitProvider>,
  );
  return onAction;
}

const trigger = (name: string | RegExp = "Select options") => screen.getByRole("button", { name });
const dialog = () => screen.getByRole("dialog", { name: "Select options" });

async function pick(...labels: string[]) {
  fireEvent.click(within(dialog()).getByRole("combobox"));
  for (const label of labels) await clickAsync(screen.getByRole("option", { name: label }));
}

describe("a multi_static_select section accessory", () => {
  it("opens Slack's Select options dialog and sends one action on Confirm", async () => {
    const onAction = renderAccessory();
    fireEvent.click(trigger());
    await pick("Alpha", "Charlie");
    // The list stays open while picking, and nothing is sent yet.
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();
    await clickAsync(within(dialog()).getByRole("button", { name: "Confirm" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "multi_static_select",
        action_id: "a1",
        block_id: "b1",
        selected_options: [option("Alpha", "a"), option("Charlie", "c")],
        placeholder: plain("Select options"),
      }),
      expect.anything(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger("2 selected")).toBeTruthy();
  });

  it("discards the picks on Cancel", async () => {
    const onAction = renderAccessory();
    fireEvent.click(trigger());
    await pick("Bravo");
    await clickAsync(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
    expect(trigger()).toBeTruthy();
  });

  it("discards the picks on Escape and with the close button", async () => {
    const onAction = renderAccessory();
    fireEvent.click(trigger());
    await pick("Bravo");
    await keyDownAsync(dialog(), "Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger());
    await clickAsync(within(dialog()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("starts from the chosen options and removes one with its chip's button", async () => {
    const onAction = renderAccessory({
      initial_options: [option("Alpha", "a"), option("Bravo", "b")],
    });
    fireEvent.click(trigger("2 selected"));
    await clickAsync(within(dialog()).getByRole("button", { name: "Remove Alpha" }));
    await clickAsync(within(dialog()).getByRole("button", { name: "Confirm" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ selected_options: [option("Bravo", "b")] }),
      expect.anything(),
    );
    expect(trigger("1 selected")).toBeTruthy();
  });

  it("moves focus into the dialog and back to the button when it closes", async () => {
    renderAccessory();
    const button = trigger();
    await act(async () => fireEvent.click(button));
    expect(within(dialog()).getByRole("combobox")).toBe(document.activeElement);
    await clickAsync(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(button);
  });
});
