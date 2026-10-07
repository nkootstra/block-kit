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

  // Slack's view.state.values holds every block with a stateful element, so an input the user never
  // touched is reported too, empty: `@slack/bolt`'s ViewStateValue types each value as `| null`
  // (or an empty list for multi-value elements).
  it("reports every untouched input in the modal's state, with Slack's empty values", async () => {
    const onSubmit = vi.fn();
    const input = (block_id: string, element: Record<string, unknown>) => ({
      type: "input",
      block_id,
      optional: true,
      label: { type: "plain_text", text: block_id },
      element: { action_id: "a", ...element },
    });
    const options = [{ text: { type: "plain_text", text: "One" }, value: "1" }];
    render(
      <BlockKitProvider onSubmit={onSubmit}>
        <Modal
          view={
            {
              type: "modal",
              title: { type: "plain_text", text: "Empty" },
              submit: { type: "plain_text", text: "Save" },
              blocks: [
                input("text", { type: "plain_text_input" }),
                input("number", { type: "number_input", is_decimal_allowed: false }),
                input("email", { type: "email_text_input" }),
                input("url", { type: "url_text_input" }),
                input("select", { type: "static_select", options }),
                input("multi", { type: "multi_static_select", options }),
                input("users", { type: "users_select" }),
                input("multiusers", { type: "multi_users_select" }),
                input("conversation", { type: "conversations_select" }),
                input("conversations", { type: "multi_conversations_select" }),
                input("channel", { type: "channels_select" }),
                input("channels", { type: "multi_channels_select" }),
                input("date", { type: "datepicker" }),
                input("time", { type: "timepicker" }),
                input("datetime", { type: "datetimepicker" }),
                input("checks", { type: "checkboxes", options }),
                input("radio", { type: "radio_buttons", options }),
                input("rich", { type: "rich_text_input" }),
              ],
            } as never
          }
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit.mock.calls[0]![0].view.state.values).toEqual({
      text: { a: { type: "plain_text_input", value: null } },
      number: { a: { type: "number_input", value: null } },
      email: { a: { type: "email_text_input", value: null } },
      url: { a: { type: "url_text_input", value: null } },
      select: { a: { type: "static_select", selected_option: null } },
      multi: { a: { type: "multi_static_select", selected_options: [] } },
      users: { a: { type: "users_select", selected_user: null } },
      multiusers: { a: { type: "multi_users_select", selected_users: [] } },
      conversation: { a: { type: "conversations_select", selected_conversation: null } },
      conversations: { a: { type: "multi_conversations_select", selected_conversations: [] } },
      channel: { a: { type: "channels_select", selected_channel: null } },
      channels: { a: { type: "multi_channels_select", selected_channels: [] } },
      date: { a: { type: "datepicker", selected_date: null } },
      time: { a: { type: "timepicker", selected_time: null } },
      datetime: { a: { type: "datetimepicker", selected_date_time: null } },
      checks: { a: { type: "checkboxes", selected_options: [] } },
      radio: { a: { type: "radio_buttons", selected_option: null } },
      rich: { a: { type: "rich_text_input" } },
    });
  });

  it("keeps an input's initial value in the modal's state", async () => {
    const onSubmit = vi.fn();
    render(
      <BlockKitProvider onSubmit={onSubmit}>
        <Modal
          view={
            {
              type: "modal",
              title: { type: "plain_text", text: "Initial" },
              submit: { type: "plain_text", text: "Save" },
              blocks: [
                {
                  type: "input",
                  block_id: "date",
                  label: { type: "plain_text", text: "Date" },
                  element: { type: "datepicker", action_id: "a", initial_date: "2024-06-15" },
                },
              ],
            } as never
          }
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit.mock.calls[0]![0].view.state.values).toEqual({
      date: { a: { type: "datepicker", selected_date: "2024-06-15" } },
    });
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
