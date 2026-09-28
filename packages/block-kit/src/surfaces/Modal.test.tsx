import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { clickAsync } from "../elements/test-utils";
import type { ModalView } from "./Modal";
import { Modal } from "./Modal";

afterEach(cleanup);

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/extra/modal");

function loadView(name: string): ModalView {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf-8"));
}

describe("<Modal>", () => {
  it("renders the title, close button and rich_text_input/file_input blocks", () => {
    const view = loadView("rich-and-file");
    render(
      <BlockKitProvider>
        <Modal view={view} />
      </BlockKitProvider>,
    );

    expect(screen.getByText("New entry")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByText("Attachments")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("calls onClose with a view_closed payload when the close (X) button is clicked", () => {
    const view = loadView("rich-and-file");
    const onClose = vi.fn();
    render(
      <BlockKitProvider onClose={onClose}>
        <Modal view={view} />
      </BlockKitProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "view_closed",
        is_cleared: false,
        view: expect.objectContaining({ type: "modal", callback_id: "" }),
      }),
    );
  });

  it("calls onClose with a view_closed payload when the footer Cancel button is clicked", () => {
    const view = loadView("rich-and-file");
    const onClose = vi.fn();
    render(
      <BlockKitProvider onClose={onClose}>
        <Modal view={view} />
      </BlockKitProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit with a view_submission payload carrying entered state, for the form fixture", async () => {
    const view = loadView("form");
    const onSubmit = vi.fn();
    render(
      <BlockKitProvider onSubmit={onSubmit}>
        <Modal view={view} />
      </BlockKitProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("Short summary"), {
      target: { value: "Printer is on fire" },
    });
    await clickAsync(screen.getByRole("checkbox", { name: /Email me updates/ }));
    await clickAsync(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "view_submission",
        view: expect.objectContaining({
          callback_id: "new_ticket",
          state: expect.objectContaining({
            values: expect.objectContaining({
              title: expect.objectContaining({
                title_input: expect.objectContaining({ value: "Printer is on fire" }),
              }),
            }),
          }),
        }),
      }),
      { views: expect.any(Object) },
    );
  });

  it("omits the footer when a view has neither close nor submit", () => {
    render(
      <BlockKitProvider>
        <Modal
          view={{
            type: "modal",
            blocks: [{ type: "section", text: { type: "plain_text", text: "hi" } }],
          }}
        />
      </BlockKitProvider>,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
