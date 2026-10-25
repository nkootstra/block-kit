import type { Button as ButtonElement } from "@slack/types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { Button } from "../elements/Button";
import { clickAsync } from "../elements/test-utils";

afterEach(cleanup);

const deleteButton = {
  type: "button",
  action_id: "delete",
  text: { type: "plain_text", text: "Delete" },
  confirm: {
    title: { type: "plain_text", text: "Are you sure?" },
    text: { type: "plain_text", text: "This can't be undone." },
    confirm: { type: "plain_text", text: "Delete it" },
    deny: { type: "plain_text", text: "Keep it" },
    style: "danger",
  },
} as ButtonElement;

function renderButton(onAction = vi.fn()) {
  render(
    <BlockKitProvider onAction={onAction}>
      <Button element={deleteButton} blockId="b1" />
    </BlockKitProvider>,
  );
  return onAction;
}

async function openDialog() {
  const trigger = screen.getByRole("button", { name: "Delete" });
  trigger.focus();
  await clickAsync(trigger);
  return { trigger, dialog: screen.getByRole("alertdialog") };
}

describe("confirm dialog", () => {
  it("names the dialog by its title and describes it by its text", async () => {
    renderButton();
    const { dialog } = await openDialog();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("alertdialog", { name: "Are you sure?" })).toBe(dialog);
    const description = document.getElementById(dialog.getAttribute("aria-describedby")!);
    expect(description?.textContent).toBe("This can't be undone.");
  });

  // extra/actions/more-elements@confirm-focus-tab-1: Slack focuses the dialog itself, so the
  // first Tab reaches its close button.
  it("focuses the dialog itself when it opens", async () => {
    renderButton();
    const { dialog } = await openDialog();
    expect(document.activeElement).toBe(dialog);
  });

  it("takes Shift+Tab from the dialog itself to its last button", async () => {
    renderButton();
    const { dialog } = await openDialog();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete it" }));
  });

  it("denies on Escape and returns focus to the button that opened it", async () => {
    const onAction = renderButton();
    const { trigger, dialog } = await openDialog();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("denies when the close button is pressed", async () => {
    const onAction = renderButton();
    await openDialog();
    await clickAsync(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("returns focus to the button that opened it after confirming", async () => {
    const onAction = renderButton();
    const { trigger } = await openDialog();
    await clickAsync(screen.getByRole("button", { name: "Delete it" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside the dialog", async () => {
    renderButton();
    const { dialog } = await openDialog();
    const close = screen.getByRole("button", { name: "Close" });
    const confirm = screen.getByRole("button", { name: "Delete it" });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });
});
