import { describe, expect, it, vi } from "vitest";
import { createInteractionRelay } from "./relay";
import { signSlackRequest } from "./sign";
import { httpTransport, InteractionError } from "./transport";

const payload = { type: "block_actions", actions: [{ action_id: "approve" }] };

function replying(body: string, init?: ResponseInit) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(body, init));
}

describe("httpTransport", () => {
  it("POSTs Slack's form-encoded body, unsigned", async () => {
    const fetch = replying("");
    await httpTransport({ url: "/slack/relay", fetch }).onSubmit(payload as never, {} as never);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("/slack/relay");
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(new Headers(init?.headers).has("x-slack-signature")).toBe(false);
    expect(JSON.parse(new URLSearchParams(init?.body as string).get("payload") ?? "")).toEqual(
      payload,
    );
  });

  it("returns a view_submission's response_action, and nothing for an empty ack", async () => {
    const errors = { response_action: "errors", errors: { title: "Required" } };
    const withAck = httpTransport({ url: "/x", fetch: replying(JSON.stringify(errors)) });
    expect(await withAck.onSubmit(payload as never, {} as never)).toEqual(errors);

    const empty = httpTransport({ url: "/x", fetch: replying("") });
    expect(await empty.onSubmit(payload as never, {} as never)).toBeUndefined();
  });

  it("returns a block_suggestion's options", async () => {
    const options = { options: [{ text: { type: "plain_text", text: "One" }, value: "1" }] };
    const transport = httpTransport({ url: "/x", fetch: replying(JSON.stringify(options)) });
    expect(await transport.onOptions(payload as never)).toEqual(options);
  });

  it("rejects submits on a non-2xx answer and reports fire-and-forget failures", async () => {
    const onError = vi.fn();
    const onResponse = vi.fn();
    const transport = httpTransport({
      url: "/x",
      fetch: replying("nope", { status: 500 }),
      onError,
      onResponse,
    });

    await expect(transport.onSubmit(payload as never, {} as never)).rejects.toBeInstanceOf(
      InteractionError,
    );
    transport.onPayload(payload as never, {} as never);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(onResponse).toHaveBeenCalledWith(payload, expect.objectContaining({ status: 500 }));
  });

  it("reports a network failure", async () => {
    const onError = vi.fn();
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const transport = httpTransport({ url: "/x", fetch, onError });
    await expect(transport.onOptions(payload as never)).rejects.toThrow(/Failed to fetch/);
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("createInteractionRelay", () => {
  const signingSecret = "relay-secret";

  it("signs the exact body it was given and passes the app's reply back", async () => {
    const fetch = replying('{"response_action":"clear"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const relay = createInteractionRelay({ requestUrl: "http://app/slack", signingSecret, fetch });
    const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;

    const res = await relay(new Request("http://dev/relay", { method: "POST", body }));

    const [url, init] = fetch.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    const ts = Number(headers.get("x-slack-request-timestamp"));
    expect(url).toBe("http://app/slack");
    expect(init?.body).toBe(body);
    expect(headers.get("x-slack-signature")).toBe(signSlackRequest(signingSecret, ts, body));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ response_action: "clear" });
  });

  it("rejects anything but a form-encoded POST, and reports an unreachable app", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const relay = createInteractionRelay({ requestUrl: "http://app", signingSecret, fetch: down });

    expect((await relay(new Request("http://dev/relay"))).status).toBe(405);
    expect(
      (await relay(new Request("http://dev/relay", { method: "POST", body: "{}" }))).status,
    ).toBe(400);
    const res = await relay(
      new Request("http://dev/relay", { method: "POST", body: "payload=%7B%7D" }),
    );
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/ECONNREFUSED/);
  });
});
