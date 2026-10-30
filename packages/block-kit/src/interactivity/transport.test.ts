import { describe, expect, it, vi } from "vitest";
import { createInteractionRelay } from "./relay";
import { signSlackRequest } from "./sign";
import { httpTransport, InteractionError } from "./transport";

const payload = { type: "block_actions", actions: [{ action_id: "approve" }] };
const form = `payload=${encodeURIComponent(JSON.stringify(payload))}`;

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
    // The header a cross-site form can't send, which the relay looks for.
    expect(new Headers(init?.headers).get("x-block-kit-transport")).toBe("http");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
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
    expect(await res.text()).not.toMatch(/ECONNREFUSED|http:\/\/app/);
  });

  it("tells onError why the app couldn't be reached, without telling the browser", async () => {
    const onError = vi.fn();
    const relay = createInteractionRelay({
      requestUrl: "http://app",
      signingSecret,
      onError,
      fetch: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    const res = await relay(new Request("http://dev/relay", { method: "POST", body: form }));
    expect(res.status).toBe(502);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "ECONNREFUSED" }));
  });

  it("refuses a body over 1 MB", async () => {
    const fetch = replying("");
    const relay = createInteractionRelay({ requestUrl: "http://app", signingSecret, fetch });
    const res = await relay(
      new Request("http://dev/relay", {
        method: "POST",
        body: `payload=${"x".repeat(1024 * 1024)}`,
      }),
    );
    expect(res.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("when it's created", () => {
    const fetch = replying("");

    it.each([
      ["missing", undefined],
      ["empty", ""],
    ])("throws, naming signingSecret, when it's %s", (_, secret) => {
      expect(() =>
        createInteractionRelay({ requestUrl: "http://app", signingSecret: secret as never, fetch }),
      ).toThrow(/`signingSecret` is missing or empty/);
    });

    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["relative", "/slack/events"],
      ["not http(s)", "ftp://app/slack"],
    ])("throws, naming requestUrl, when it's %s", (_, requestUrl) => {
      expect(() =>
        createInteractionRelay({ requestUrl: requestUrl as never, signingSecret, fetch }),
      ).toThrow(/`requestUrl` must be the app's absolute http\(s\) request URL/);
    });

    it("refuses the signing secret, or a Slack token, as its token", () => {
      const relay = (token: string) =>
        createInteractionRelay({ requestUrl: "http://app", signingSecret, token, fetch });
      expect(() => relay(signingSecret)).toThrow(/`token` is the same as `signingSecret`/);
      for (const token of ["xoxb-0000-placeholder", "xoxp-0000-placeholder", "xapp-1-x"]) {
        expect(() => relay(token)).toThrow(/`token` looks like a Slack token/);
      }
    });

    it("refuses a timeoutMs that isn't a positive number", () => {
      for (const timeoutMs of [0, -1, Number.NaN]) {
        expect(() =>
          createInteractionRelay({ requestUrl: "http://app", signingSecret, timeoutMs, fetch }),
        ).toThrow(/`timeoutMs`/);
      }
    });
  });

  it("answers 504 when the app doesn't answer within timeoutMs", async () => {
    const onError = vi.fn();
    const hanging = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const relay = createInteractionRelay({
      requestUrl: "http://app",
      signingSecret,
      timeoutMs: 20,
      onError,
      fetch: hanging,
    });
    const res = await relay(new Request("http://dev/relay", { method: "POST", body: form }));
    expect(res.status).toBe(504);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "TimeoutError" }));
  });

  it("passes on the app's error status, but not its error page", async () => {
    const onError = vi.fn();
    const page = "Traceback: DB password=placeholder at /srv/app";
    const relay = createInteractionRelay({
      requestUrl: "http://app",
      signingSecret,
      onError,
      fetch: replying(page, { status: 500, headers: { "content-type": "text/html" } }),
    });
    const res = await relay(new Request("http://dev/relay", { method: "POST", body: form }));
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("The app answered 500");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 500, body: page }));
  });

  it("passes on an empty 204 ack", async () => {
    const relay = createInteractionRelay({
      requestUrl: "http://app",
      signingSecret,
      fetch: replying(null as never, { status: 204 }),
    });
    const res = await relay(new Request("http://dev/relay", { method: "POST", body: form }));
    expect(res.status).toBe(204);
  });

  describe("token", () => {
    const token = "dev-relay-token-for-tests";

    it("refuses a request without the token, or with the wrong one, before reading it", async () => {
      const fetch = replying("");
      const relay = createInteractionRelay({
        requestUrl: "http://app",
        signingSecret,
        token,
        fetch,
      });
      for (const authorization of [undefined, "Bearer wrong", `Basic ${token}`, token]) {
        const res = await relay(
          new Request("http://dev/relay", {
            method: "POST",
            body: form,
            headers: authorization ? { authorization } : {},
          }),
        );
        expect(res.status).toBe(401);
        expect(res.headers.get("www-authenticate")).toBe("Bearer");
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it("relays a request with the token, which httpTransport's token option sends", async () => {
      const app = replying("");
      const relay = createInteractionRelay({
        requestUrl: "http://app",
        signingSecret,
        token,
        fetch: app,
      });
      const transport = httpTransport({
        url: "http://dev/relay",
        token,
        fetch: (url, init) => relay(new Request(url, init)),
      });
      await transport.onSubmit(payload as never, {} as never);
      expect(app).toHaveBeenCalledTimes(1);
      // The token stays between the page and the relay: the app gets Slack's headers only.
      expect(new Headers(app.mock.calls[0]?.[1]?.headers).has("authorization")).toBe(false);
    });

    it("treats an empty token as none, on both ends, the way a blank env var reads", async () => {
      const app = replying("");
      const relay = createInteractionRelay({
        requestUrl: "http://app",
        signingSecret,
        token: "",
        fetch: app,
      });
      const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
        relay(new Request(url, init)),
      );
      await httpTransport({ url: "http://dev/relay", token: "", fetch }).onSubmit(
        payload as never,
        {} as never,
      );
      expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("authorization")).toBe(false);
      expect(app).toHaveBeenCalledTimes(1);
    });

    it("needs no token when none is set", async () => {
      const app = replying("");
      const relay = createInteractionRelay({ requestUrl: "http://app", signingSecret, fetch: app });
      const res = await relay(new Request("http://dev/relay", { method: "POST", body: form }));
      expect(res.status).toBe(200);
    });
  });

  describe("cross-site requests", () => {
    const post = (headers: Record<string, string>) =>
      new Request("http://localhost:3000/slack/relay", { method: "POST", body: form, headers });

    it("refuses a form another site's page posts", async () => {
      const app = replying("");
      const relay = createInteractionRelay({ requestUrl: "http://app", signingSecret, fetch: app });
      const formHeaders = { "content-type": "application/x-www-form-urlencoded" };
      for (const headers of [
        { ...formHeaders, origin: "https://evil.example", "sec-fetch-site": "cross-site" },
        { ...formHeaders, origin: "https://evil.example" },
        { ...formHeaders, "sec-fetch-site": "cross-site" },
        { ...formHeaders, origin: "null" },
        { ...formHeaders, origin: "http://localhost:5173" },
      ]) {
        expect((await relay(post(headers))).status).toBe(403);
      }
      expect(app).not.toHaveBeenCalled();
    });

    it("relays the page's own requests, httpTransport's and server-to-server calls", async () => {
      const app = replying("");
      const relay = createInteractionRelay({ requestUrl: "http://app", signingSecret, fetch: app });
      expect(
        (await relay(post({ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" })))
          .status,
      ).toBe(200);
      expect((await relay(post({}))).status).toBe(200);
      // A dev-server proxy forwards the page's Origin to a relay on another port; the transport's
      // header, which a cross-site form can't set, lets it through.
      const transport = httpTransport({
        url: "http://localhost:3000/slack/relay",
        fetch: (url, init) =>
          relay(
            new Request(url, {
              ...init,
              headers: {
                ...Object.fromEntries(new Headers(init?.headers)),
                origin: "http://localhost:5173",
              },
            }),
          ),
      });
      await transport.onSubmit(payload as never, {} as never);
      expect(app).toHaveBeenCalledTimes(3);
    });
  });
});
