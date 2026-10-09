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

  // Slack focuses the dialog, not its field: the field opens without its focus ring
  // (`catalog/section/multi-static-select@dialog`), and Tab moves into it.
  it("moves focus to the dialog and back to the button when it closes", async () => {
    renderAccessory();
    const button = trigger();
    await act(async () => fireEvent.click(button));
    expect(dialog()).toBe(document.activeElement);
    await clickAsync(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(button);
  });
});

// Captured in Block Kit Builder (`contexts/multi_static_select/accessory@dialog`,
// `contexts/multi_users_select/accessory@dialog`, `catalog/section/multi-conversations-select@dialog`):
// the dialog is titled with the select's placeholder, and the users and conversations multi-selects
// open it as section accessories too.
describe("the selection dialog's title", () => {
  it("is the select's placeholder", () => {
    renderAccessory({ placeholder: plain("Select items") });
    fireEvent.click(trigger("Select items"));
    expect(screen.getByRole("dialog", { name: "Select items" })).toBeTruthy();
  });
});

function renderDirectoryAccessory(type: string, placeholder: string, onAction = vi.fn()) {
  render(
    <BlockKitProvider onAction={onAction}>
      <Message
        blocks={
          [
            {
              type: "section",
              block_id: "b1",
              text: { type: "mrkdwn", text: "Pick some" },
              accessory: { type, action_id: "a1", placeholder: plain(placeholder) },
            },
          ] as never
        }
      />
    </BlockKitProvider>,
  );
  return onAction;
}

describe.each([
  ["multi_users_select", "Select users", "selected_users", "U123"],
  ["multi_conversations_select", "Select conversations", "selected_conversations", "C123"],
  ["multi_channels_select", "Select channels", "selected_channels", "C456"],
])("a %s section accessory", (type, placeholder, field, id) => {
  it("opens the selection dialog and sends the typed ids on Confirm", async () => {
    const onAction = renderDirectoryAccessory(type, placeholder);
    fireEvent.click(trigger(placeholder));
    const box = screen.getByRole("dialog", { name: placeholder });
    const input = within(box).getByRole("combobox");
    fireEvent.change(input, { target: { value: id } });
    await keyDownAsync(input, "Enter");
    expect(onAction).not.toHaveBeenCalled();
    await clickAsync(within(box).getByRole("button", { name: "Confirm" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type, action_id: "a1", block_id: "b1", [field]: [id] }),
      expect.anything(),
    );
    expect(trigger("1 selected")).toBeTruthy();
  });
});
