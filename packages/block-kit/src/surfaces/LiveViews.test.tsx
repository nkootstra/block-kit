import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ActionContext, type BlockAction, BlockKitProvider } from "../context";
import { clickAsync } from "../elements/test-utils";
import { Message } from "../Message";
import type { ViewLike } from "../payloads";
import { VALIDATION_MESSAGES } from "../validation";
import { HomeTab } from "./HomeTab";
import { Modal } from "./Modal";

afterEach(cleanup);

const plain = (text: string) => ({ type: "plain_text" as const, text });

function buttonBlock(actionId: string, label: string) {
  return {
    type: "actions",
    elements: [{ type: "button", action_id: actionId, text: plain(label) }],
  };
}

function home(greeting: string): ViewLike & { type: "home" } {
  return {
    type: "home",
    blocks: [
      { type: "section", text: plain(greeting) },
      buttonBlock("refresh", "Refresh"),
    ] as ViewLike["blocks"],
  };
}

function nameModal(extra: ViewLike["blocks"] = []): ViewLike {
  return {
    type: "modal",
    callback_id: "rename",
    title: plain("Rename"),
    submit: plain("Save"),
    close: plain("Cancel"),
    blocks: [
      {
        type: "input",
        block_id: "name",
        label: plain("Name"),
        element: { type: "plain_text_input", action_id: "name_input" },
      },
      ...extra,
    ] as ViewLike["blocks"],
  };
}

describe("views.publish / views.update on a <HomeTab>", () => {
  it("republishes the Home tab from one of its own actions", async () => {
    let count = 0;
    const onAction = (_: BlockAction, { views }: ActionContext) => {
      count += 1;
      views.publish(home(`Refreshed ${count}x`));
    };
    render(
      <BlockKitProvider surface="home" onAction={onAction}>
        <HomeTab view={home("Welcome back")} />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Refreshed 1x")).toBeTruthy();
    await clickAsync(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Refreshed 2x")).toBeTruthy();
  });

  it("publishes to the Home tab from a message action, and a new view prop wins again", async () => {
    const onAction = (_: BlockAction, { views }: ActionContext) =>
      views.publish(home("Published from a message"));
    const tree = (view: ReturnType<typeof home>) => (
      <BlockKitProvider onAction={onAction}>
        <Message blocks={[buttonBlock("go", "Publish")] as never} />
        <HomeTab view={view} />
      </BlockKitProvider>
    );
    const { rerender } = render(tree(home("Welcome back")));

    await clickAsync(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByText("Published from a message")).toBeTruthy();

    rerender(tree(home("Edited in the editor")));
    expect(screen.getByText("Edited in the editor")).toBeTruthy();
  });

  it("carries the updated view's hash in later payloads", async () => {
    const onPayload = vi.fn();
    const onAction = (_: BlockAction, { views }: ActionContext) => views.update(home("Updated"));
    render(
      <BlockKitProvider surface="home" onAction={onAction} onPayload={onPayload}>
        <HomeTab view={{ ...home("Welcome back"), id: "VHOME", hash: "1.first" }} />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getByRole("button", { name: "Refresh" }));
    expect(onPayload.mock.calls[0]?.[0].view).toMatchObject({ id: "VHOME", hash: "1.first" });
    await clickAsync(screen.getByRole("button", { name: "Refresh" }));
    const after = onPayload.mock.calls[1]?.[0].view;
    expect(after).toMatchObject({ id: "VHOME" });
    expect(after.hash).not.toBe("1.first");
  });
});

describe("a standalone <Modal>", () => {
  it("applies views.update from one of its own actions", async () => {
    const onAction = (_: BlockAction, { views }: ActionContext) =>
      views.update(nameModal([{ type: "section", text: plain("More options") }] as never));
    render(
      <BlockKitProvider onAction={onAction}>
        <Modal view={nameModal([buttonBlock("more", "Show more")] as never) as never} />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText("More options")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("shows response_action errors, then swaps in a response_action update", async () => {
    const onSubmit = vi.fn((payload: { view: { state: { values: StateJson } } }) => {
      const name = payload.view.state.values.name?.name_input?.value;
      if (name === "taken") {
        return { response_action: "errors" as const, errors: { name: "That name is taken" } };
      }
      return {
        response_action: "update" as const,
        view: { ...nameModal(), blocks: [{ type: "section", text: plain(`Saved ${name}`) }] },
      };
    });
    render(
      <BlockKitProvider onSubmit={onSubmit as never}>
        <Modal view={nameModal() as never} />
      </BlockKitProvider>,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "taken" } });
    await clickAsync(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("That name is taken")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ada" } });
    await clickAsync(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Saved Ada")).toBeTruthy();
    expect(screen.queryByText("That name is taken")).toBeNull();
  });

  it("hides a client-side error once its field changes", async () => {
    const onSubmit = vi.fn();
    render(
      <BlockKitProvider onSubmit={onSubmit}>
        <Modal view={nameModal() as never} />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(VALIDATION_MESSAGES.required)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A" } });
    expect(screen.queryByText(VALIDATION_MESSAGES.required)).toBeNull();
  });
});

describe("a failed submission", () => {
  it("keeps the modal open when onSubmit rejects, so the user can retry", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("app unreachable"));
    const onAction = (_: BlockAction, { views }: ActionContext) => views.open(nameModal());
    render(
      <BlockKitProvider onAction={onAction} onSubmit={onSubmit}>
        <Message blocks={[buttonBlock("open", "Open")] as never} />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ada" } });

    await clickAsync(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("heading", { name: "Rename" })).toBeTruthy();

    await clickAsync(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: "Rename" })).toBeNull();
  });
});

describe("notify_on_close on a view opened through views", () => {
  it("doesn't report view_closed unless the view asked for it", async () => {
    const onClose = vi.fn();
    const onAction = (_: BlockAction, { views }: ActionContext) => views.open(nameModal());
    render(
      <BlockKitProvider onAction={onAction} onClose={onClose}>
        <Message blocks={[buttonBlock("open", "Open")] as never} />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getByRole("button", { name: "Open" }));
    await clickAsync(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Rename" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("focus_on_load", () => {
  const focusBlocks = [
    {
      type: "input",
      block_id: "first",
      label: plain("First"),
      element: { type: "plain_text_input", action_id: "a" },
    },
    {
      type: "input",
      block_id: "second",
      label: plain("Second"),
      element: { type: "plain_text_input", action_id: "b", focus_on_load: true },
    },
  ] as ViewLike["blocks"];

  it("focuses the marked element when a modal opens", async () => {
    await act(async () => {
      render(
        <BlockKitProvider>
          <Modal view={{ ...nameModal(), blocks: focusBlocks } as never} />
        </BlockKitProvider>,
      );
    });
    expect(document.activeElement).toBe(screen.getByLabelText("b"));
  });

  it("is ignored in a message, as in Slack", async () => {
    await act(async () => {
      render(<Message blocks={focusBlocks} />);
    });
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses a select's control without opening its menu", async () => {
    const blocks = [
      {
        type: "input",
        label: plain("Priority"),
        element: {
          type: "static_select",
          action_id: "p",
          focus_on_load: true,
          options: [{ text: plain("High"), value: "high" }],
        },
      },
    ] as ViewLike["blocks"];
    await act(async () => {
      render(<Modal view={{ ...nameModal(), blocks } as never} />);
    });
    expect(document.activeElement?.tagName).toBe("BUTTON");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

type StateJson = Record<string, Record<string, { value?: string }>>;
