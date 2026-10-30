import { describe, expect, it, vi } from "vitest";
import type { WebApiClient } from "./client";
import { createResolverRelay } from "./relay";

const ADA = "U0123456789";
const GRACE = "U0987654321";
const RELEASES = "C0123456789";
const ENG = "S0123456789";
const OTHER_GROUP = "S0987654321";

/** Slack's whole `users.info` user, including the fields the relay must never pass on. */
const fullUser = {
  id: ADA,
  team_id: "T0123456789",
  name: "ada",
  real_name: "Ada Lovelace",
  tz: "Europe/London",
  is_admin: true,
  profile: {
    display_name: "ada",
    real_name: "Ada Lovelace",
    title: "Analyst",
    pronouns: "she/her",
    image_72: "https://cdn.block-kit.dev/samples/portrait.ab6c68cb.jpg",
    status_emoji: ":books:",
    status_text: "Reading",
    email: "name@example.com",
    phone: "+00 0000 000000",
    skype: "ada",
  },
};

/** What Slack's `WebClient` throws for an error response. */
function platformError(error: string) {
  return Object.assign(new Error(`An API error occurred: ${error}`), {
    code: "slack_webapi_platform_error",
    data: { ok: false, error },
  });
}

function client(overrides: Partial<WebApiClient> = {}): WebApiClient {
  return {
    users: {
      info: vi.fn(async ({ user }: { user: string }) => {
        if (user === ADA) return { user: fullUser };
        throw platformError("user_not_found");
      }),
    },
    conversations: {
      info: vi.fn(async () => ({
        channel: { id: RELEASES, name: "releases", is_private: false, purpose: { value: "x" } },
      })),
    },
    usergroups: {
      list: vi.fn(async () => ({
        usergroups: [
          { id: ENG, handle: "eng", name: "Engineering", users: [ADA] },
          { id: "S0000000001", handle: "design", name: "Design" },
        ],
      })),
    },
    ...overrides,
  } as WebApiClient;
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.example.com/api/slack/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("createResolverRelay", () => {
  it("returns only the allowlisted user, channel and user group fields", async () => {
    const relay = createResolverRelay({ client: client() });
    const res = await relay(post({ users: [ADA], channels: [RELEASES], usergroups: [ENG] }));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      users: {
        [ADA]: {
          id: ADA,
          name: "ada",
          real_name: "Ada Lovelace",
          tz: "Europe/London",
          profile: {
            display_name: "ada",
            real_name: "Ada Lovelace",
            title: "Analyst",
            pronouns: "she/her",
            image_72: "https://cdn.block-kit.dev/samples/portrait.ab6c68cb.jpg",
            status_emoji: ":books:",
            status_text: "Reading",
          },
        },
      },
      channels: { [RELEASES]: { id: RELEASES, name: "releases", is_private: false } },
      usergroups: { [ENG]: { id: ENG, handle: "eng", name: "Engineering" } },
    });
  });

  it("returns only the user groups asked for, never the whole list", async () => {
    const c = client();
    const relay = createResolverRelay({ client: c });

    expect((await relay(post({ usergroups: true }))).status).toBe(400);
    expect((await relay(post({ usergroups: [] }))).status).toBe(200);
    expect(c.usergroups.list).not.toHaveBeenCalled();

    const res = await relay(post({ usergroups: [ENG, OTHER_GROUP] }));
    expect(await res.json()).toEqual({
      usergroups: { [ENG]: { id: ENG, handle: "eng", name: "Engineering" }, [OTHER_GROUP]: null },
    });
    const text = await (await relay(post({ usergroups: [OTHER_GROUP] }))).text();
    expect(text).not.toContain("design");
  });

  it("reuses one usergroups.list answer for a minute, but not a failed one", async () => {
    vi.useFakeTimers();
    try {
      const list = vi
        .fn<WebApiClient["usergroups"]["list"]>()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValue({ usergroups: [{ id: ENG, handle: "eng" }] });
      const relay = createResolverRelay({ client: client({ usergroups: { list } }) });

      expect((await relay(post({ usergroups: [ENG] }))).status).toBe(502);
      expect((await relay(post({ usergroups: [ENG] }))).status).toBe(200);
      expect((await relay(post({ usergroups: [ENG] }))).status).toBe(200);
      expect(list).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(60_001);
      await relay(post({ usergroups: [ENG] }));
      expect(list).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts user group ids toward maxIds", async () => {
    const relay = createResolverRelay({ client: client(), maxIds: 1 });
    expect((await relay(post({ users: [ADA], usergroups: [ENG] }))).status).toBe(413);
  });

  it("never passes on an email, phone or anything outside the allowlist", async () => {
    const relay = createResolverRelay({ client: client() });
    const text = await (await relay(post({ users: [ADA], usergroups: [ENG] }))).text();

    for (const leak of ["name@example.com", "+00", "skype", "team_id", "is_admin", 'users":[']) {
      expect(text).not.toContain(leak);
    }
  });

  it("maps an id Slack doesn't know to null", async () => {
    const relay = createResolverRelay({ client: client() });
    const res = await relay(post({ users: [ADA, GRACE] }));

    expect(res.status).toBe(200);
    expect((await res.json()).users[GRACE]).toBeNull();
  });

  describe("with a token", () => {
    const token = "placeholder-relay-token";

    it.each([
      ["no Authorization header", {}],
      ["a wrong token", { authorization: "Bearer placeholder-wrong-token" }],
      ["a token that only starts right", { authorization: `Bearer ${token}x` }],
      ["another scheme", { authorization: `Basic ${token}` }],
    ])("answers 401 to %s, before reading the body or calling Slack", async (_, headers) => {
      const c = client();
      const relay = createResolverRelay({ client: c, token });
      const request = post({ users: [ADA] }, headers);
      const res = await relay(request);

      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      expect(request.bodyUsed).toBe(false);
      expect(c.users.info).not.toHaveBeenCalled();
    });

    it("answers a request with the right token", async () => {
      const relay = createResolverRelay({ client: client(), token });
      const res = await relay(post({ users: [ADA] }, { authorization: `Bearer ${token}` }));
      expect(res.status).toBe(200);
    });
  });

  it("answers without any Authorization header when no token is set", async () => {
    const relay = createResolverRelay({ client: client() });
    expect((await relay(post({ users: [ADA] }))).status).toBe(200);
  });

  it("only answers POSTs", async () => {
    const relay = createResolverRelay({ client: client() });
    const res = await relay(new Request("https://app.example.com/api/slack/resolve"));

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("refuses anything but JSON, so a cross-site form can't post to it", async () => {
    const relay = createResolverRelay({ client: client() });
    const res = await relay(
      post(`users=${ADA}`, { "content-type": "application/x-www-form-urlencoded" }),
    );
    expect(res.status).toBe(415);
  });

  it.each([
    ["a malformed user id", { users: ["U0ADA"] }],
    ["a channel id that isn't one", { channels: [ADA] }],
    ["a direct message id", { channels: ["D0123456789"] }],
    ["a lowercase id", { users: ["u0123456789"] }],
    ["an id that isn't a string", { users: [123] }],
    ["users that isn't a list", { users: ADA }],
    ["an unknown key", { users: [ADA], emails: ["name@example.com"] }],
    ["usergroups that isn't a list of ids", { usergroups: "all" }],
    ["a usergroup id that isn't one", { usergroups: [ADA] }],
    ["a body that isn't an object", [ADA]],
  ])("rejects %s", async (_, body) => {
    const c = client();
    const relay = createResolverRelay({ client: c });
    const res = await relay(post(body));

    expect(res.status).toBe(400);
    expect(c.users.info).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't JSON", async () => {
    const relay = createResolverRelay({ client: client() });
    expect((await relay(post("{"))).status).toBe(400);
  });

  it("rejects more ids than maxIds, counted after removing duplicates", async () => {
    const c = client();
    const relay = createResolverRelay({ client: c, maxIds: 2 });
    const id = (n: number) => `U${String(n).padStart(10, "0")}`;

    expect((await relay(post({ users: [ADA, ADA, ADA, GRACE] }))).status).toBe(200);
    const res = await relay(post({ users: [id(1), id(2)], channels: [RELEASES] }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_many_ids" });
  });

  it("can't raise maxIds past 100", async () => {
    const relay = createResolverRelay({ client: client(), maxIds: 1000 });
    const users = Array.from({ length: 101 }, (_, n) => `U${String(n).padStart(10, "0")}`);
    expect((await relay(post({ users }))).status).toBe(413);
  });

  it("rejects a body over 16 KB", async () => {
    const relay = createResolverRelay({ client: client() });
    const res = await relay(post({ users: [ADA], pad: "x".repeat(17 * 1024) }));
    expect(res.status).toBe(413);
  });

  it("answers 502 without Slack's error when the token or a scope is wrong", async () => {
    const onError = vi.fn();
    const relay = createResolverRelay({
      client: client({
        users: {
          info: async () => {
            throw platformError("missing_scope");
          },
        },
      }),
      onError,
    });
    const res = await relay(post({ users: [ADA] }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "slack_unavailable" });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("answers 502 when Slack can't be reached", async () => {
    const relay = createResolverRelay({
      client: client({
        conversations: {
          info: async () => {
            throw new TypeError("fetch failed");
          },
        },
      }),
    });
    expect((await relay(post({ channels: [RELEASES] }))).status).toBe(502);
  });

  it("answers 429 with Retry-After when Slack rate-limits it", async () => {
    const relay = createResolverRelay({
      client: client({
        users: {
          info: async () => {
            throw Object.assign(new Error("A rate limit was exceeded"), {
              code: "slack_webapi_rate_limited_error",
              retryAfter: 12,
            });
          },
        },
      }),
    });
    const res = await relay(post({ users: [ADA] }));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
  });

  describe("when it's created", () => {
    it("refuses a client without the three methods", () => {
      expect(() => createResolverRelay({ client: undefined as never })).toThrow(/`client`/);
      expect(() => createResolverRelay({ client: { users: {} } as never })).toThrow(/`client`/);
    });

    it.each(["xoxb-0000-placeholder", "xoxp-0000-placeholder", "xapp-1-placeholder"])(
      "refuses the Slack token %s as its token",
      (token) => {
        expect(() => createResolverRelay({ client: client(), token })).toThrow(
          /`token` looks like a Slack token/,
        );
      },
    );

    it("treats an empty token as none, the way a blank env var reads", async () => {
      const relay = createResolverRelay({ client: client(), token: "" });
      expect((await relay(post({ users: [ADA] }))).status).toBe(200);
    });
  });
});
