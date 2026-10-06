import { describe, expect, it } from "vitest";
import {
  buildBlockActionsPayload,
  buildBlockSuggestionPayload,
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

describe("enterprise fields", () => {
  const container = { type: "message" as const, messageTs: "1700000000.000100" };

  it("are null and false outside an Enterprise Grid org, as Slack sends them", () => {
    const payload = buildBlockActionsPayload({ action, state: {}, container });
    expect(payload.enterprise).toBeNull();
    expect(payload.is_enterprise_install).toBe(false);
  });

  it("name the org the team belongs to", () => {
    const payload = buildBlockActionsPayload({
      action,
      state: {},
      container,
      identity: {
        team: { id: "T0ACME", domain: "acme", enterprise_id: "E0ACME", enterprise_name: "Acme" },
      },
    });
    expect(payload.enterprise).toEqual({ id: "E0ACME", name: "Acme" });
    expect(payload.is_enterprise_install).toBe(false);
  });

  it("mark an org-wide install", () => {
    const payload = buildBlockActionsPayload({
      action,
      state: {},
      container,
      identity: {
        team: { id: "T0ACME", domain: "acme", enterprise_id: "E0ACME", enterprise_name: "Acme" },
        isEnterpriseInstall: true,
      },
    });
    expect(payload.is_enterprise_install).toBe(true);
  });
});

describe("enterprise fields on view and suggestion payloads", () => {
  const grid = {
    team: { id: "T0ACME", domain: "acme", enterprise_id: "E0ACME", enterprise_name: "Acme" },
    isEnterpriseInstall: true,
  };
  const builders = {
    view_submission: (identity?: typeof grid) =>
      buildViewSubmissionPayload({ view, state: {}, identity }),
    view_closed: (identity?: typeof grid) => buildViewClosedPayload({ view, state: {}, identity }),
    block_suggestion: (identity?: typeof grid) =>
      buildBlockSuggestionPayload({
        actionId: "a",
        blockId: "b",
        value: "ab",
        container: { type: "message", messageTs: "1700000000.000100" },
        state: {},
        identity,
      }),
  };

  for (const [type, build] of Object.entries(builders)) {
    it(`${type}: null and false outside an Enterprise Grid org`, () => {
      const payload = build();
      expect(payload.enterprise).toBeNull();
      expect(payload.is_enterprise_install).toBe(false);
    });

    it(`${type}: the org and an org-wide install`, () => {
      const payload = build(grid);
      expect(payload.enterprise).toEqual({ id: "E0ACME", name: "Acme" });
      expect(payload.is_enterprise_install).toBe(true);
    });
  }
});

describe("the view as Slack echoes it", () => {
  const form: ViewLike = {
    ...view,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "*All fields* are shared." } },
      {
        type: "input",
        block_id: "summary",
        label: { type: "plain_text", text: "Summary" },
        element: {
          type: "plain_text_input",
          action_id: "summary_input",
          placeholder: { type: "plain_text", text: "Write something" },
        },
      },
    ],
  };
  const option = { text: { type: "plain_text", text: "High" }, value: "high" };
  const state = { priority: { pick: { type: "static_select", selected_option: option } } };

  it("normalizes the title, submit and close text", () => {
    const { view: echoed } = buildViewSubmissionPayload({ view: form, state: {} });
    expect(echoed.title).toEqual({ type: "plain_text", text: "New ticket", emoji: true });
    expect(echoed.submit).toEqual({ type: "plain_text", text: "Create", emoji: true });
    expect(echoed.close).toEqual({ type: "plain_text", text: "Cancel", emoji: true });
  });

  it("normalizes text objects in the blocks and fills an input block's defaults", () => {
    const { view: echoed } = buildViewClosedPayload({ view: form, state: {} });
    expect(echoed.blocks).toEqual([
      {
        type: "section",
        text: { type: "mrkdwn", text: "*All fields* are shared.", verbatim: false },
      },
      {
        type: "input",
        block_id: "summary",
        label: { type: "plain_text", text: "Summary", emoji: true },
        element: {
          type: "plain_text_input",
          action_id: "summary_input",
          placeholder: { type: "plain_text", text: "Write something", emoji: true },
        },
        optional: false,
        dispatch_action: false,
      },
    ]);
  });

  it("normalizes the options in state.values", () => {
    const { view: echoed } = buildViewSubmissionPayload({ view: form, state });
    expect(echoed.state.values.priority!.pick).toEqual({
      type: "static_select",
      selected_option: { text: { type: "plain_text", text: "High", emoji: true }, value: "high" },
    });
  });

  it("leaves the app's view and state untouched", () => {
    const before = JSON.stringify({ form, state });
    buildViewSubmissionPayload({ view: form, state });
    expect(JSON.stringify({ form, state })).toBe(before);
  });
});
