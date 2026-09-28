import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ActionContext, type BlockAction, BlockKitProvider } from "../context";
import { clickAsync } from "../elements/test-utils";
import { Message } from "../Message";
import type { ViewLike } from "../payloads";

afterEach(cleanup);

const plain = (text: string) => ({ type: "plain_text" as const, text });

const openButton = [
  {
    type: "actions",
    block_id: "launch",
    elements: [{ type: "button", action_id: "open", text: plain("Open form") }],
  },
];

function formView(): ViewLike {
  return {
    type: "modal",
    callback_id: "form",
    title: plain("Form"),
    close: plain("Cancel"),
    submit: plain("Save"),
    blocks: [
      {
        type: "input",
        block_id: "name",
        label: plain("Name"),
        element: { type: "plain_text_input", action_id: "name_input" },
      },
      {
        type: "actions",
        block_id: "more",
        elements: [{ type: "button", action_id: "push", text: plain("More") }],
      },
    ] as ViewLike["blocks"],
  };
}

const detailsView: ViewLike = {
  type: "modal",
  notify_on_close: true,
  title: plain("Details"),
  close: plain("Back"),
  blocks: [{ type: "section", text: plain("Second view") }] as ViewLike["blocks"],
};

/** Opens the form from a message button, pushes the details view from the form's button. */
function app(action: BlockAction, { views }: ActionContext) {
  if (action.action_id === "open") views.open(formView());
  if (action.action_id === "push") views.push(detailsView);
}

function dialog(title: string) {
  return screen.getByRole("heading", { name: title }).closest(".sbk-modal") as HTMLElement;
}

describe("views (modals opened by an interaction)", () => {
  it("opens a modal from a message button, and its actions carry the view container", async () => {
    const onPayload = vi.fn();
    render(
      <BlockKitProvider onAction={app} onPayload={onPayload}>
        <Message blocks={openButton} />
      </BlockKitProvider>,
    );

    expect(screen.queryByRole("heading", { name: "Form" })).toBeNull();
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    const form = dialog("Form");
    expect(form).toBeTruthy();

    await clickAsync(within(form).getByRole("button", { name: "More" }));
    const payload = onPayload.mock.calls.at(-1)?.[0];
    expect(payload.container).toEqual({ type: "view", view_id: expect.stringMatching(/^V/) });
    expect(payload.view).toMatchObject({ callback_id: "form", id: payload.container.view_id });
  });

  it("pushes a view and goes back to the previous one with its input intact", async () => {
    render(
      <BlockKitProvider onAction={app}>
        <Message blocks={openButton} />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    fireEvent.change(within(dialog("Form")).getByRole("textbox"), { target: { value: "Ada" } });

    await clickAsync(within(dialog("Form")).getByRole("button", { name: "More" }));
    expect(screen.getByText("Second view")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Form" })).toBeNull();

    await clickAsync(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByText("Second view")).toBeNull();
    expect((within(dialog("Form")).getByRole("textbox") as HTMLInputElement).value).toBe("Ada");
  });

  it("closes the whole stack from the X, reporting is_cleared", async () => {
    const onClose = vi.fn();
    render(
      <BlockKitProvider onAction={app} onClose={onClose}>
        <Message blocks={openButton} />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    await clickAsync(within(dialog("Form")).getByRole("button", { name: "More" }));

    await clickAsync(within(dialog("Details")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("heading", { name: "Details" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Form" })).toBeNull();
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ is_cleared: true }));
  });

  it("applies a submit's response_action: errors keep it open, no response closes it", async () => {
    const onSubmit = vi.fn((payload: { view: { state: { values: Record<string, never> } } }) => {
      const name = (payload.view.state.values as Record<string, Record<string, { value?: string }>>)
        .name?.name_input?.value;
      return name === "Ada"
        ? undefined
        : { response_action: "errors" as const, errors: { name: "That name is taken" } };
    });
    render(
      <BlockKitProvider onAction={app} onSubmit={onSubmit as never}>
        <Message blocks={openButton} />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Open form" }));

    // Slack's client catches the empty required field before the app is asked.
    await clickAsync(within(dialog("Form")).getByRole("button", { name: "Save" }));
    expect(within(dialog("Form")).getByText("Please complete this required field.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(within(dialog("Form")).getByRole("textbox"), { target: { value: "Bob" } });
    await clickAsync(within(dialog("Form")).getByRole("button", { name: "Save" }));
    expect(within(dialog("Form")).getByText("That name is taken")).toBeTruthy();

    fireEvent.change(within(dialog("Form")).getByRole("textbox"), { target: { value: "Ada" } });
    await clickAsync(within(dialog("Form")).getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("heading", { name: "Form" })).toBeNull();
  });

  it("updates a view in place from a dispatch_action input, keeping unchanged inputs", async () => {
    const dispatchingForm = (echo?: string): ViewLike => ({
      ...formView(),
      blocks: [
        ...(formView().blocks as ViewLike["blocks"]),
        {
          type: "input",
          block_id: "echo",
          dispatch_action: true,
          label: plain("Echo"),
          element: { type: "plain_text_input", action_id: "echo_input" },
        },
        ...(echo ? [{ type: "section", text: plain(`You typed: ${echo}`) }] : []),
      ] as ViewLike["blocks"],
    });
    const onAction = (action: BlockAction, { views }: ActionContext) => {
      if (action.action_id === "open") views.open(dispatchingForm());
      if (action.action_id === "echo_input") views.update(dispatchingForm(action.value));
    };
    render(
      <BlockKitProvider onAction={onAction}>
        <Message blocks={openButton} />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    const [name, echo] = within(dialog("Form")).getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.change(name as HTMLInputElement, { target: { value: "Ada" } });
    fireEvent.change(echo as HTMLInputElement, { target: { value: "hello" } });
    await act(async () => {
      fireEvent.keyDown(echo as HTMLInputElement, { key: "Enter" });
    });

    expect(within(dialog("Form")).getByText("You typed: hello")).toBeTruthy();
    const [nameAfter] = within(dialog("Form")).getAllByRole("textbox") as HTMLInputElement[];
    expect(nameAfter?.value).toBe("Ada");
  });
});
