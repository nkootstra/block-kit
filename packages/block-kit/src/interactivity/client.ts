import { signSlackRequest } from "./sign";
import { encodeInteraction, type InteractionResult, readInteractionResponse } from "./transport";

export interface SendInteractionOptions {
  /** The app's Slack request URL (an Events API / interactivity endpoint). */
  requestUrl: string;
  /** Same signing secret the receiving app was configured with. */
  signingSecret: string;
  /** A payload built with `@nkootstra/block-kit`'s payload builders. */
  payload: unknown;
  /** Defaults to the current time; override for signature tests. */
  timestamp?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export type SendInteractionResult = InteractionResult;

/**
 * POSTs a Slack-format interaction payload to an app's request URL exactly as Slack does:
 * `application/x-www-form-urlencoded` body `payload=<json>`, signed with `X-Slack-Signature` /
 * `X-Slack-Request-Timestamp`. If the app acks a `view_submission` with a `response_action`
 * (errors/update/push/clear), it is parsed and returned in `responseAction`.
 */
export async function sendInteraction(
  opts: SendInteractionOptions,
): Promise<SendInteractionResult> {
  const res = await postSigned({ ...opts, body: encodeInteraction(opts.payload) });
  return readInteractionResponse(res);
}

/** POSTs an already-encoded body, signed with the app's secret, as Slack would. */
export function postSigned(opts: {
  requestUrl: string;
  signingSecret: string;
  body: string;
  timestamp?: number;
  fetch?: typeof fetch;
}): Promise<Response> {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = signSlackRequest(opts.signingSecret, timestamp, opts.body);
  const doFetch = opts.fetch ?? fetch;
  return doFetch(opts.requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-signature": signature,
      "x-slack-request-timestamp": String(timestamp),
    },
    body: opts.body,
  });
}
