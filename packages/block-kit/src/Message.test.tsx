import type { AnyBlock } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ActionContext, type BlockAction, BlockKitProvider } from "./context";
import { clickAsync } from "./elements/test-utils";
import { Message } from "./Message";

afterEach(cleanup);

describe("<Message>", () => {
  it("renders blocks and reports button actions in Slack's shape", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Message
          blocks={[
            { type: "header", text: { type: "plain_text", text: "Deploy" } },
            {
              type: "actions",
              block_id: "b1",
              elements: [
                {
                  type: "button",
                  action_id: "approve",
                  value: "yes",
                  style: "primary",
                  text: { type: "plain_text", text: "Approve" },
                },
              ],
            },
          ]}
        />
      </BlockKitProvider>,
    );

    expect(screen.getByRole("heading", { name: "Deploy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    // Buttons confirm asynchronously (immediately, absent a `confirm` object) before dispatching.
    await vi.waitFor(() => expect(onAction).toHaveBeenCalled());
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "button",
        action_id: "approve",
        block_id: "b1",
        value: "yes",
        style: "primary",
        action_ts: expect.stringMatching(/^\d+\.\d{6}$/),
      }),
      { state: {}, views: expect.any(Object), message: expect.any(Object) },
    );
  });

  it("builds a block_actions payload even without a ts", async () => {
    const onPayload = vi.fn();
    render(
      <BlockKitProvider onPayload={onPayload}>
        <Message
          blocks={[
            {
              type: "actions",
              elements: [
                { type: "button", action_id: "go", text: { type: "plain_text", text: "Go" } },
              ],
            },
          ]}
        />
      </BlockKitProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await vi.waitFor(() => expect(onPayload).toHaveBeenCalled());
    expect(onPayload.mock.calls[0]?.[0]).toMatchObject({
      type: "block_actions",
      container: { type: "message", message_ts: expect.stringMatching(/^\d+\.\d{6}$/) },
    });
  });

  it("falls back to text when there are no blocks", () => {
    render(<Message text="*hi*" />);
    expect(screen.getByText("hi").tagName).toBe("B");
  });

  it("marks unsupported blocks visibly", () => {
    render(<Message blocks={[{ type: "mystery" }]} />);
    expect(screen.getByText("mystery").className).toBe("sbk-unsupported");
  });

  it("lets an app replace or delete the message an action came from", async () => {
    const buttons = (label: string) =>
      [
        {
          type: "actions",
          block_id: "decide",
          elements: [
            { type: "button", action_id: "approve", text: { type: "plain_text", text: label } },
            { type: "button", action_id: "dismiss", text: { type: "plain_text", text: "Dismiss" } },
          ],
        },
      ] as AnyBlock[];
    const onAction = (action: BlockAction, { message }: ActionContext) => {
      if (action.action_id === "approve") {
        message?.update({
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: "Approved :white_check_mark:" } },
          ],
        });
      }
      if (action.action_id === "dismiss") message?.delete();
    };
    render(
      <BlockKitProvider onAction={onAction}>
        <Message blocks={buttons("Approve")} text="first" />
        <Message blocks={buttons("Approve too")} text="second" />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText(/Approved/)).toBeTruthy();
    // Only the clicked message changed.
    expect(screen.getByRole("button", { name: "Approve too" })).toBeTruthy();
    expect(screen.queryByText("(edited)")).toBeNull();

    // The first message has no Dismiss button any more; this one belongs to the second.
    await clickAsync(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("button", { name: "Approve too" })).toBeNull();
    expect(screen.getByText(/Approved/)).toBeTruthy();
  });

  it("shows new blocks again once the message prop itself changes", async () => {
    const blocks = (text: string) =>
      [
        { type: "section", text: { type: "plain_text", text } },
        {
          type: "actions",
          elements: [{ type: "button", action_id: "x", text: { type: "plain_text", text: "Go" } }],
        },
      ] as AnyBlock[];
    const onAction = (_: BlockAction, { message }: ActionContext) =>
      message?.update({ blocks: blocks("Updated by the app") });
    const { rerender } = render(
      <BlockKitProvider onAction={onAction}>
        <Message blocks={blocks("Original")} />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByText("Updated by the app")).toBeTruthy();

    rerender(
      <BlockKitProvider onAction={onAction}>
        <Message blocks={blocks("Edited in the editor")} />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Edited in the editor")).toBeTruthy();
  });

  it("gives each message's actions its own container when several share a provider", async () => {
    const onPayload = vi.fn();
    const button = (label: string) =>
      [
        {
          type: "actions",
          elements: [
            { type: "button", action_id: "go", text: { type: "plain_text", text: label } },
          ],
        },
      ] as AnyBlock[];
    render(
      <BlockKitProvider onPayload={onPayload}>
        <Message blocks={button("One")} ts="1700000000.000100" channelId="C1" />
        <Message blocks={button("Two")} ts="1700000000.000200" channelId="C2" />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getByRole("button", { name: "One" }));
    expect(onPayload.mock.calls.at(-1)?.[0].container).toMatchObject({
      message_ts: "1700000000.000100",
      channel_id: "C1",
    });
    await clickAsync(screen.getByRole("button", { name: "Two" }));
    expect(onPayload.mock.calls.at(-1)?.[0].container).toMatchObject({
      message_ts: "1700000000.000200",
      channel_id: "C2",
    });
  });
});
