import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createInteractionRelay, signSlackRequest } from "@nkootstra/block-kit/server";

// The signing secret lives here, on the server, like the bot token: the page posts unsigned
// interactions to the relay, which signs them and forwards them to the app.
//
// Set SLACK_REQUEST_URL and SLACK_SIGNING_SECRET to send clicks to your own app (a Bolt app's
// request URL, e.g. http://localhost:3001/slack/events). Without them, clicks go to the small demo
// app below, which checks the signature with a secret made up when the server starts.

/** Where the demo app answers when SLACK_REQUEST_URL is unset. */
export const DEMO_APP_PATH = "/api/demo-app/slack/events";

const ownApp = process.env.SLACK_REQUEST_URL || undefined;
// Next.js may load this file once per route, so the made-up secret is kept per process.
const demo = globalThis as { blockKitDemoSigningSecret?: string };
demo.blockKitDemoSigningSecret ??= randomBytes(32).toString("hex");
const signingSecret = ownApp
  ? // createInteractionRelay throws at startup, naming the option, when this is unset.
    (process.env.SLACK_SIGNING_SECRET ?? "")
  : process.env.SLACK_SIGNING_SECRET || demo.blockKitDemoSigningSecret;

/** True when clicks go to the demo app in this server rather than to your own. */
export const usingDemoApp = !ownApp;

export function interactionRelay(port = Number(process.env.PORT ?? 3000)) {
  return createInteractionRelay({
    requestUrl: ownApp ?? `http://localhost:${port}${DEMO_APP_PATH}`,
    signingSecret,
    // A development secret shared with the page, not a Slack credential. Blank means none.
    token: process.env.NEXT_PUBLIC_SLACK_RELAY_TOKEN,
    // The browser only gets a status; the reason stays in this server's log.
    onError: (error) => console.error("Couldn't deliver the interaction:", describe(error)),
  });
}

function describe(error: unknown): string {
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return `the app answered ${status}`;
  return error instanceof Error ? error.name : "unknown error";
}

/**
 * A stand-in for your app's request URL: it verifies the signature the way Bolt does, then acks.
 * A request that wasn't signed with the relay's secret gets a 401.
 */
export async function demoApp(request: Request): Promise<Response> {
  const body = await request.text();
  const timestamp = Number(request.headers.get("x-slack-request-timestamp"));
  const signature = request.headers.get("x-slack-signature") ?? "";
  const fresh = Math.abs(Date.now() / 1000 - timestamp) < 60 * 5;
  const expected = Buffer.from(signSlackRequest(signingSecret, timestamp, body));
  const given = Buffer.from(signature);
  if (!fresh || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Invalid signature", { status: 401 });
  }
  const payload = JSON.parse(new URLSearchParams(body).get("payload") ?? "{}") as {
    type?: string;
    actions?: { action_id?: string; value?: string }[];
  };
  const action = payload.actions?.[0];
  console.log(
    `Demo app: signature verified, got ${payload.type} ${action?.action_id ?? ""} (${action?.value ?? ""})`,
  );
  // Slack apps ack with an empty 200 within 3 seconds.
  return new Response(null, { status: 200 });
}
