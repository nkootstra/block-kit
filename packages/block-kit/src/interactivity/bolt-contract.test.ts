import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { App } from "@slack/bolt";
import { buildBlockActionsPayload, buildViewSubmissionPayload, type ViewLike } from "../index";
import { afterEach, describe, expect, it } from "vitest";
import { sendInteraction } from "./client";
import { createInteractionRelay } from "./relay";
import { httpTransport } from "./transport";

/**
 * Proves `sendInteraction`'s signing and body encoding is accepted by a real `@slack/bolt` App
 * (not a hand-rolled stand-in), and that the payloads built by `@nkootstra/block-kit`'s
 * `payloads.ts` are shaped so Bolt's own `app.action`/`app.view` matchers and handlers fire.
 */
describe("sendInteraction against a real @slack/bolt App", () => {
  const signingSecret = "test-signing-secret-for-contract-test";
  let app: App | undefined;

  afterEach(async () => {
    await app?.stop();
    app = undefined;
  });

  async function startApp(): Promise<number> {
    // A fixed `token` makes Bolt call `auth.test` against the real Slack API to authorize each
    // incoming event; supply a stub `authorize` instead so the contract test never hits the
    // network and only exercises signature verification + payload delivery.
    app = new App({
      signingSecret,
      authorize: async () => ({
        botToken: "xoxb-fake-token-for-tests",
        botId: "B00000000",
        botUserId: "U00000000",
      }),
    });
    const server = (await app.start(0)) as Server;
    return (server.address() as AddressInfo).port;
  }

  it("delivers a block_actions payload that app.action(...) receives", async () => {
    const port = await startApp();
    let receivedActionId: string | undefined;
    let receivedValue: string | undefined;

    app?.action("approve", async ({ ack, action, body }) => {
      await ack();
      if ("action_id" in action) {
        receivedActionId = action.action_id;
      }
      if ("value" in action) {
        receivedValue = action.value;
      }
      expect(body.type).toBe("block_actions");
    });

    const payload = buildBlockActionsPayload({
      action: {
        type: "button",
        block_id: "b1",
        action_id: "approve",
        text: { type: "plain_text", text: "Approve" },
        value: "approved",
        action_ts: "1690000000.000001",
      },
      state: {},
      container: { type: "message", channelId: "C123", messageTs: "1690000000.000100" },
    });

    const result = await sendInteraction({
      requestUrl: `http://127.0.0.1:${port}/slack/events`,
      signingSecret,
      payload,
    });

    expect(result.ok).toBe(true);
    await waitFor(() => receivedActionId !== undefined);
    expect(receivedActionId).toBe("approve");
    expect(receivedValue).toBe("approved");
  });

  it("delivers a view_submission payload; app.view(...) can ack a response_action back", async () => {
    const port = await startApp();

    app?.view("new_ticket", async ({ ack, view }) => {
      expect(view.callback_id).toBe("new_ticket");
      await ack({ response_action: "errors", errors: { title_block: "Title is required" } });
    });

    const view: ViewLike = {
      type: "modal",
      callback_id: "new_ticket",
      blocks: [],
      title: { type: "plain_text", text: "New ticket" },
    };

    const payload = buildViewSubmissionPayload({ view, state: {} });

    const result = await sendInteraction({
      requestUrl: `http://127.0.0.1:${port}/slack/events`,
      signingSecret,
      payload,
    });

    expect(result.ok).toBe(true);
    expect(result.responseAction).toEqual({
      response_action: "errors",
      errors: { title_block: "Title is required" },
    });
  });

  it("hands app.view(...) the enterprise fields and the view's normalized text", async () => {
    const port = await startApp();
    let received: { enterprise?: unknown; install?: unknown; title?: unknown } = {};
    app?.view("new_ticket", async ({ ack, body, view }) => {
      received = {
        enterprise: body.enterprise,
        install: body.is_enterprise_install,
        title: view.title,
      };
      await ack();
    });

    const result = await sendInteraction({
      requestUrl: `http://127.0.0.1:${port}/slack/events`,
      signingSecret,
      payload: buildViewSubmissionPayload({
        view: {
          type: "modal",
          callback_id: "new_ticket",
          blocks: [],
          title: { type: "plain_text", text: "New ticket" },
        },
        state: {},
      }),
    });

    expect(result.ok).toBe(true);
    expect(received).toEqual({
      enterprise: null,
      install: false,
      title: { type: "plain_text", text: "New ticket", emoji: true },
    });
  });

  it("round-trips a browser httpTransport through the signing relay to the app", async () => {
    const port = await startApp();
    app?.view("new_ticket", async ({ ack }) => {
      await ack({ response_action: "clear" });
    });

    const relay = createInteractionRelay({
      requestUrl: `http://127.0.0.1:${port}/slack/events`,
      signingSecret,
    });
    // Stands in for the page's fetch to its own origin, which the dev server hands to the relay.
    const transport = httpTransport({
      url: "http://playground.test/slack/relay",
      fetch: (url, init) => relay(new Request(url, init)),
    });
    const view: ViewLike = {
      type: "modal",
      callback_id: "new_ticket",
      blocks: [],
      title: { type: "plain_text", text: "New ticket" },
    };

    const result = await transport.onSubmit(buildViewSubmissionPayload({ view, state: {} }), {
      views: {} as never,
    });
    expect(result).toEqual({ response_action: "clear" });
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
}
