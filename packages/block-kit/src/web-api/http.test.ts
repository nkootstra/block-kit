import { describe, expect, it, vi } from "vitest";
import type { WebApiClient } from "./client";
import { httpResolverClient } from "./http";
import { createResolverRelay } from "./relay";
import { createWebApiResolvers } from "./resolvers";

const ADA = "U0123456789";
const GRACE = "U0987654321";
const RELEASES = "C0123456789";

/** A relay over a fake workspace, reached through `fetch` the way a browser would reach it. */
function setup() {
  const workspace: WebApiClient = {
    users: {
      info: async ({ user }) => ({
        user: { id: user, real_name: user === ADA ? "Ada Lovelace" : "Grace Hopper" },
      }),
    },
    conversations: { info: async () => ({ channel: { id: RELEASES, name: "releases" } }) },
    usergroups: { list: async () => ({ usergroups: [{ id: "S0123456789", handle: "eng" }] }) },
  };
  const relay = createResolverRelay({
    client: workspace,
    token: "placeholder-relay-token",
  });
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    relay(new Request(new URL(String(url), "https://app.example.com"), init)),
  );
  const client = httpResolverClient({
    url: "/api/slack/resolve",
    token: "placeholder-relay-token",
    headers: { "x-session": "placeholder-session" },
    fetch: fetch as typeof globalThis.fetch,
  });
  return { client, fetch };
}

describe("httpResolverClient", () => {
  it("sends lookups made in the same tick as one request", async () => {
    const { client, fetch } = setup();
    const [ada, grace, releases] = await Promise.all([
      client.users.info({ user: ADA }),
      client.users.info({ user: GRACE }),
      client.conversations.info({ channel: RELEASES }),
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      users: [ADA, GRACE],
      channels: [RELEASES],
    });
    expect(ada.user?.real_name).toBe("Ada Lovelace");
    expect(grace.user?.real_name).toBe("Grace Hopper");
    expect(releases.channel?.name).toBe("releases");
  });

  it("splits a batch at the relay's 100-id limit", async () => {
    const { client, fetch } = setup();
    const ids = Array.from({ length: 150 }, (_, n) => `U${String(n).padStart(10, "0")}`);
    await Promise.all(ids.map((user) => client.users.info({ user })));

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't send ids the relay would refuse", async () => {
    const { client, fetch } = setup();
    expect(await client.users.info({ user: "U0ADA" })).toEqual({ user: undefined });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the token and the headers with every request", async () => {
    const { client, fetch } = setup();
    await client.users.info({ user: ADA });
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);

    expect(headers.get("authorization")).toBe("Bearer placeholder-relay-token");
    expect(headers.get("x-session")).toBe("placeholder-session");
  });

  it("rejects when the relay refuses, which the resolvers treat as unknown", async () => {
    const relay = createResolverRelay({ client: setup().client, token: "placeholder-relay-token" });
    const client = httpResolverClient({
      url: "https://app.example.com/api/slack/resolve",
      token: "placeholder-wrong-token",
      fetch: ((url: string, init?: RequestInit) => relay(new Request(url, init))) as typeof fetch,
    });
    await expect(client.users.info({ user: ADA })).rejects.toThrow("answered 401");
  });

  it("drives createWebApiResolvers end to end", async () => {
    const resolvers = createWebApiResolvers(setup().client, { batchWindowMs: 0 });
    resolvers.user?.(ADA);
    resolvers.channel?.(RELEASES);
    resolvers.usergroup?.("S0123456789");
    await new Promise((r) => setTimeout(r, 5));

    expect(resolvers.user?.(ADA)).toBe("Ada Lovelace");
    expect(resolvers.channel?.(RELEASES)).toBe("releases");
    expect(resolvers.usergroup?.("S0123456789")).toBe("eng");
  });
});
