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

describe("views: keyboard and screen readers", () => {
  function renderApp(props: { onClose?: () => void; onSubmit?: () => unknown } = {}) {
    render(
      <BlockKitProvider onAction={app} {...(props as object)}>
        <Message blocks={openButton} />
      </BlockKitProvider>,
    );
  }

  it("opens as a modal dialog named by its title, and takes focus", async () => {
    renderApp();
    const opener = screen.getByRole("button", { name: "Open form" });
    opener.focus();
    await clickAsync(opener);

    const form = screen.getByRole("dialog", { name: "Form" });
    expect(form.getAttribute("aria-modal")).toBe("true");
    expect(form.contains(document.activeElement)).toBe(true);
  });

  it("keeps Tab inside the modal", async () => {
    renderApp();
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    const form = screen.getByRole("dialog", { name: "Form" });
    const close = within(form).getByRole("button", { name: "Close" });
    const save = within(form).getByRole("button", { name: "Save" });

    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
    // From the dialog itself (where focus lands as it opens), Shift+Tab goes to the last control.
    form.focus();
    fireEvent.keyDown(form, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
  });

  it("closes on Escape as the X does, and gives focus back to the opener", async () => {
    const onClose = vi.fn();
    renderApp({ onClose });
    const opener = screen.getByRole("button", { name: "Open form" });
    opener.focus();
    await clickAsync(opener);
    await clickAsync(within(dialog("Form")).getByRole("button", { name: "More" }));
    const details = screen.getByRole("dialog", { name: "Details" });
    expect(details.contains(document.activeElement)).toBe(true);

    act(() => {
      fireEvent.keyDown(details, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ type: "view_closed", is_cleared: true }),
    );
    expect(document.activeElement).toBe(opener);
  });

  it("closes on Escape from a field, but leaves Escape to a control that handled it", async () => {
    renderApp();
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    act(() => {
      fireEvent.keyDown(within(dialog("Form")).getByRole("textbox"), { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    const field = within(dialog("Form")).getByRole("textbox");
    field.addEventListener("keydown", (e) => e.preventDefault());
    act(() => {
      fireEvent.keyDown(field, { key: "Escape" });
    });
    expect(screen.getByRole("dialog", { name: "Form" })).toBeTruthy();
  });

  it("sends one view_submission while the app is still answering", async () => {
    let answer: (value: undefined) => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          answer = resolve;
        }),
    );
    renderApp({ onSubmit });
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    fireEvent.change(within(dialog("Form")).getByRole("textbox"), { target: { value: "Ada" } });
    const save = within(dialog("Form")).getByRole("button", { name: "Save" });

    await clickAsync(save);
    await clickAsync(save);
    await clickAsync(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(save.getAttribute("aria-busy")).toBe("true");
    expect(save.getAttribute("aria-disabled")).toBe("true");

    await act(async () => answer(undefined));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("takes a submission again once a failed one settles", async () => {
    let fail: (error: Error) => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<undefined>((_, reject) => {
          fail = reject;
        }),
    );
    renderApp({ onSubmit });
    await clickAsync(screen.getByRole("button", { name: "Open form" }));
    fireEvent.change(within(dialog("Form")).getByRole("textbox"), { target: { value: "Ada" } });
    const save = within(dialog("Form")).getByRole("button", { name: "Save" });

    await clickAsync(save);
    await act(async () => fail(new Error("offline")));
    expect(save.getAttribute("aria-busy")).toBeNull();
    await clickAsync(save);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
