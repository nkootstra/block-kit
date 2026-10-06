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

describe("echoed text objects", () => {
  const confirm = {
    title: { type: "plain_text" as const, text: "Sure?" },
    text: { type: "mrkdwn" as const, text: "This *can't* be undone." },
    confirm: { type: "plain_text" as const, text: "Yes" },
    deny: { type: "plain_text" as const, text: "No", emoji: false },
  };

  it("gain Slack's defaults: emoji on plain_text, verbatim on mrkdwn", () => {
    const payload = buildBlockActionsPayload({
      action: { ...action, type: "button", text: { type: "plain_text", text: "Go" }, confirm },
      state: {},
      container: { type: "message", messageTs: "1700000000.000100" },
    });
    expect(payload.actions[0]).toMatchObject({
      text: { type: "plain_text", text: "Go", emoji: true },
      confirm: {
        title: { type: "plain_text", text: "Sure?", emoji: true },
        text: { type: "mrkdwn", text: "This *can't* be undone.", verbatim: false },
        confirm: { type: "plain_text", text: "Yes", emoji: true },
        deny: { type: "plain_text", text: "No", emoji: false },
      },
    });
  });

  it("cover a select's placeholder and every selected option's text and description", () => {
    const option = {
      text: { type: "plain_text", text: "High" },
      description: { type: "mrkdwn", text: "*Now*" },
      value: "high",
    };
    const payload = buildBlockActionsPayload({
      action: {
        ...action,
        type: "multi_static_select",
        placeholder: { type: "plain_text", text: "Pick" },
        selected_options: [option],
      },
      state: { b1: { approve: { type: "multi_static_select", selected_options: [option] } } },
      container: { type: "message", messageTs: "1700000000.000100" },
    });
    const normalized = {
      text: { type: "plain_text", text: "High", emoji: true },
      description: { type: "mrkdwn", text: "*Now*", verbatim: false },
      value: "high",
    };
    expect(payload.actions[0]).toMatchObject({
      placeholder: { type: "plain_text", text: "Pick", emoji: true },
      selected_options: [normalized],
    });
    expect(payload.state.values.b1!.approve).toEqual({
      type: "multi_static_select",
      selected_options: [normalized],
    });
  });
});
