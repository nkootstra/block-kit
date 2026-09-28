import { describe, expect, it } from "vitest";
import {
  buildBlockActionsPayload,
  buildViewClosedPayload,
  buildViewSubmissionPayload,
  type ViewLike,
} from "./payloads";

const action = {
  type: "button" as const,
  action_id: "approve",
  block_id: "b1",
  value: "yes",
  action_ts: "1700000000.000001",
};

const view: ViewLike = {
  id: "V0123",
  type: "modal",
  callback_id: "new_ticket",
  blocks: [],
  title: { type: "plain_text", text: "New ticket" },
  submit: { type: "plain_text", text: "Create" },
  close: { type: "plain_text", text: "Cancel" },
};

describe("buildBlockActionsPayload", () => {
  it("builds a message container payload shaped like Slack's block_actions (message)", () => {
    const payload = buildBlockActionsPayload({
      action,
      state: {},
      container: { type: "message", messageTs: "1700000000.000100", channelId: "C123" },
    });

    expect(payload).toMatchObject({
      type: "block_actions",
      actions: [action],
      team: { id: "T00000000", domain: "workspace" },
      user: { id: "U00000000" },
      channel: { id: "C123" },
      container: { type: "message", message_ts: "1700000000.000100", channel_id: "C123" },
    });
    expect(payload.message).toBeDefined();
  });

  it("builds a view container payload shaped like Slack's block_actions (modal/home)", () => {
    const payload = buildBlockActionsPayload({
      action,
      state: {},
      container: { type: "view", view },
    });

    expect(payload.container).toEqual({ type: "view", view_id: "V0123" });
    expect(payload.view).toMatchObject({ id: "V0123", type: "modal", callback_id: "new_ticket" });
  });

  it("defaults a missing view id so standalone previews (no views.open) still work", () => {
    const { id: _id, ...viewWithoutId } = view;
    const payload = buildBlockActionsPayload({
      action,
      state: {},
      container: { type: "view", view: viewWithoutId as ViewLike },
    });
    expect(payload.container).toEqual({ type: "view", view_id: "V00000000" });
    expect(payload.view).toMatchObject({ id: "V00000000" });
  });

  it("lets identity be overridden", () => {
    const payload = buildBlockActionsPayload({
      action,
      state: {},
      container: { type: "message", messageTs: "1" },
      identity: { team: { id: "T999", domain: "acme" }, user: { id: "U999" } },
    });
    expect(payload.team).toEqual({ id: "T999", domain: "acme" });
    expect(payload.user).toEqual({ id: "U999" });
  });
});

describe("buildViewSubmissionPayload", () => {
  it("builds a view_submission payload carrying state.values", () => {
    const state = { title: { title_input: { type: "plain_text_input", value: "Hello" } } };
    const payload = buildViewSubmissionPayload({ view, state });

    expect(payload.type).toBe("view_submission");
    expect(payload.view.state.values).toEqual(state);
    expect(payload.view.callback_id).toBe("new_ticket");
    expect(payload.view.hash).toBeTruthy();
  });
});

describe("buildViewClosedPayload", () => {
  it("builds a view_closed payload, defaulting is_cleared to false", () => {
    const payload = buildViewClosedPayload({ view, state: {} });
    expect(payload.type).toBe("view_closed");
    expect(payload.is_cleared).toBe(false);
    expect(payload.view.id).toBe("V0123");
  });

  it("honors an explicit is_cleared", () => {
    const payload = buildViewClosedPayload({ view, state: {}, isCleared: true });
    expect(payload.is_cleared).toBe(true);
  });
});
