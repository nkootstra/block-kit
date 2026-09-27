import type { BlockKitProviderProps, OptionsResponse, ViewResponseAction } from "../index";

// Browser-safe: no Node imports here, so `@nkootstra/block-kit/transport` can be
// bundled into a page. Signing lives in `sign.ts`/`relay.ts`, which only run on a server.

export interface InteractionResult {
  ok: boolean;
  status: number;
  /** Parsed `response_action` body, when the app replied with one (view_submission acks). */
  responseAction?: ViewResponseAction;
  /** The raw parsed (or, if not JSON, raw text) response body. */
  raw?: unknown;
}

/** Encodes a payload the way Slack does: `application/x-www-form-urlencoded` `payload=<json>`. */
export function encodeInteraction(payload: unknown): string {
  return `payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

/** Reads an app's reply to an interaction: JSON when it parses, text otherwise. */
export async function readInteractionResponse(res: Response): Promise<InteractionResult> {
  const text = await res.text();
  let raw: unknown;
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = text;
    }
  }
  return {
    ok: res.ok,
    status: res.status,
    responseAction: isViewResponseAction(raw) ? raw : undefined,
    raw,
  };
}

function isViewResponseAction(value: unknown): value is ViewResponseAction {
  return (
    typeof value === "object" &&
    value !== null &&
    "response_action" in value &&
    typeof (value as { response_action: unknown }).response_action === "string"
  );
}

/** Thrown by `onSubmit`/`onOptions` when the app couldn't be reached or didn't answer 2xx. */
export class InteractionError extends Error {
  constructor(
    message: string,
    readonly result?: InteractionResult,
  ) {
    super(message);
    this.name = "InteractionError";
  }
}

export interface HttpTransportOptions {
  /**
   * Where payloads are POSTed, in Slack's wire format but unsigned: a relay made with
   * `createInteractionRelay` (which signs and forwards them), or an app that doesn't verify
   * signatures (e.g. Bolt with `signatureVerification: false`).
   */
  url: string;
  headers?: HeadersInit;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Called with every payload sent and the app's reply. */
  onResponse?: (payload: unknown, result: InteractionResult) => void;
  /** Called when a payload couldn't be delivered or the app answered with a non-2xx status. */
  onError?: (payload: unknown, error: InteractionError) => void;
}

/** The `BlockKitProvider` callbacks that deliver interactions, ready to spread onto it. */
export type InteractionTransport = Required<
  Pick<BlockKitProviderProps, "onPayload" | "onSubmit" | "onClose" | "onOptions">
>;

/**
 * Sends every interaction a `BlockKitProvider` produces to an app over HTTP, in place of the
 * local handlers: `block_actions` and `view_closed` are fire-and-forget, a `view_submission`'s
 * `response_action` ack is applied to the modal, and a `block_suggestion`'s reply fills the
 * external select.
 *
 * ```tsx
 * <BlockKitProvider {...httpTransport({ url: "/slack/relay" })}>
 * ```
 */
export function httpTransport(options: HttpTransportOptions): InteractionTransport {
  const send = async (payload: unknown): Promise<InteractionResult> => {
    const doFetch = options.fetch ?? fetch;
    let result: InteractionResult;
    try {
      result = await readInteractionResponse(
        await doFetch(options.url, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            ...Object.fromEntries(new Headers(options.headers)),
          },
          body: encodeInteraction(payload),
        }),
      );
    } catch (cause) {
      const error = new InteractionError(
        `Couldn't reach ${options.url}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      options.onError?.(payload, error);
      throw error;
    }
    options.onResponse?.(payload, result);
    if (!result.ok) {
      const error = new InteractionError(`${options.url} answered ${result.status}`, result);
      options.onError?.(payload, error);
      throw error;
    }
    return result;
  };
  // Nothing awaits these; failures are reported through `onError` instead.
  const fireAndForget = (payload: unknown) => {
    send(payload).catch(() => {});
  };

  return {
    onPayload: fireAndForget,
    onClose: fireAndForget,
    onSubmit: async (payload) => (await send(payload)).responseAction,
    onOptions: async (payload) => (await send(payload)).raw as OptionsResponse,
  };
}
