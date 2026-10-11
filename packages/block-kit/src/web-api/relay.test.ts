import { describe, expect, it, vi } from "vitest";
import type { WebApiClient } from "./client";
import { createResolverRelay } from "./relay";

const ADA = "U0123456789";
const GRACE = "U0987654321";
const RELEASES = "C0123456789";

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
        usergroups: [{ id: "S0123456789", handle: "eng", name: "Engineering", users: [ADA] }],
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

const allow = () => true;

describe("createResolverRelay", () => {
  it("returns only the allowlisted user, channel and user group fields", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow });
    const res = await relay(post({ users: [ADA], channels: [RELEASES], usergroups: true }));

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
      usergroups: [{ id: "S0123456789", handle: "eng", name: "Engineering" }],
    });
  });

  it("never passes on an email, phone or anything outside the allowlist", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow });
    const text = await (await relay(post({ users: [ADA], usergroups: true }))).text();

    for (const leak of ["name@example.com", "+00", "skype", "team_id", "is_admin", 'users":[']) {
      expect(text).not.toContain(leak);
    }
  });

  it("maps an id Slack doesn't know to null", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow });
    const res = await relay(post({ users: [ADA, GRACE] }));

    expect(res.status).toBe(200);
    expect((await res.json()).users[GRACE]).toBeNull();
  });

  it("refuses a request authorize turns down, before reading it or calling Slack", async () => {
    const c = client();
    const relay = createResolverRelay({ client: c, authorize: () => false });
    const request = post({ users: [ADA] });
    const res = await relay(request);

    expect(res.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(c.users.info).not.toHaveBeenCalled();
  });

  it("sends the Response authorize returns instead", async () => {
    const relay = createResolverRelay({
      client: client(),
      authorize: async () => new Response("Sign in first", { status: 401 }),
    });
    const res = await relay(post({ users: [ADA] }));

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Sign in first");
  });

  it("only treats an explicit true as allowed", async () => {
    const relay = createResolverRelay({
      client: client(),
      authorize: (() => "yes") as unknown as () => boolean,
    });
    expect((await relay(post({ users: [ADA] }))).status).toBe(403);
  });

  it("only answers POSTs", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow });
    const res = await relay(new Request("https://app.example.com/api/slack/resolve"));

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("refuses anything but JSON, so a cross-site form can't post to it", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow });
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
    ["usergroups other than true", { usergroups: "all" }],
    ["a body that isn't an object", [ADA]],
  ])("rejects %s", async (_, body) => {
    const c = client();
    const relay = createResolverRelay({ client: c, authorize: allow });
    const res = await relay(post(body));

    expect(res.status).toBe(400);
    expect(c.users.info).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't JSON", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow });
    expect((await relay(post("{"))).status).toBe(400);
  });

  it("rejects more ids than maxIds, counted after removing duplicates", async () => {
    const c = client();
    const relay = createResolverRelay({ client: c, authorize: allow, maxIds: 2 });
    const id = (n: number) => `U${String(n).padStart(10, "0")}`;

    expect((await relay(post({ users: [ADA, ADA, ADA, GRACE] }))).status).toBe(200);
    const res = await relay(post({ users: [id(1), id(2)], channels: [RELEASES] }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_many_ids" });
  });

  it("can't raise maxIds past 100", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow, maxIds: 1000 });
    const users = Array.from({ length: 101 }, (_, n) => `U${String(n).padStart(10, "0")}`);
    expect((await relay(post({ users }))).status).toBe(413);
  });

  it("rejects a body over 16 KB", async () => {
    const relay = createResolverRelay({ client: client(), authorize: allow });
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
      authorize: allow,
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
      authorize: allow,
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
      authorize: allow,
    });
    const res = await relay(post({ users: [ADA] }));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
  });
});
