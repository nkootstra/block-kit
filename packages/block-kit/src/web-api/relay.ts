import { hasBearer, readCapped, relayToken } from "../interactivity/guard";
import type { WebApiChannel, WebApiClient, WebApiUser, WebApiUsergroup } from "./client";
import {
  CHANNEL_ID,
  MAX_RESOLVE_IDS,
  type ResolveResponse,
  USER_ID,
  USERGROUP_ID,
} from "./protocol";

export interface ResolverRelayOptions {
  /** A `WebClient` (or anything with the same three methods). Its bot token stays on the server. */
  client: WebApiClient;
  /**
   * When set, a request must carry `Authorization: Bearer <token>`, or it gets a 401 before its
   * body is read. Without it, anyone who can reach the route can look up every user and channel
   * the bot can see. Set it whenever the route is reachable beyond your machine (a tunnel, a
   * preview deploy, a shared network). It's a development secret shared with the page, not a
   * Slack credential, so it's fine in browser code. An empty string counts as no token. The relay
   * throws when it's created with a Slack token (`xox…-`, `xapp-`) as its token.
   */
  token?: string;
  /**
   * The most ids (users, channels and user groups together) one request may ask for. Defaults to
   * 100, which is also the ceiling.
   */
  maxIds?: number;
  /**
   * Called with every Slack error the relay doesn't pass on: the response only ever says
   * `slack_unavailable`. Log the error's code, not the client.
   */
  onError?: (error: unknown) => void;
}

const MAX_BODY_BYTES = 16 * 1024;
const NOT_FOUND = new Set([
  "user_not_found",
  "user_not_visible",
  "users_not_found",
  "channel_not_found",
]);

/** A request the relay turns down before asking Slack anything. */
class Refusal {
  constructor(
    readonly status: number,
    readonly error: string,
  ) {}
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      ...headers,
    },
  });
}

/** Reads the body, refusing it once it passes `MAX_BODY_BYTES` instead of buffering all of it. */
async function readBody(request: Request): Promise<string> {
  const body = await readCapped(request, MAX_BODY_BYTES);
  if (body === undefined) throw new Refusal(413, "request_too_large");
  return body;
}

function ids(value: unknown, pattern: RegExp): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && pattern.test(id))) {
    throw new Refusal(400, "invalid_ids");
  }
  return [...new Set(value as string[])];
}

interface Query {
  users: string[];
  channels: string[];
  usergroups: string[];
}

/** How long the relay reuses one `usergroups.list` answer (a Tier 2 method: 20 calls a minute). */
const USERGROUPS_TTL_MS = 60_000;

function parse(text: string, maxIds: number): Query {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Refusal(400, "invalid_json");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Refusal(400, "invalid_request");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["users", "channels", "usergroups"].includes(key))) {
    throw new Refusal(400, "invalid_request");
  }
  const users = ids(record.users, USER_ID);
  const channels = ids(record.channels, CHANNEL_ID);
  // Only ids: the page never gets the whole list of groups.
  const usergroups = ids(record.usergroups, USERGROUP_ID);
  if (users.length + channels.length + usergroups.length > maxIds) {
    throw new Refusal(413, "too_many_ids");
  }
  return { users, channels, usergroups };
}

/** Slack's error code, from a `WebClient` platform error or a client that throws `Error(code)`. */
function slackError(error: unknown): string | undefined {
  const data = (error as { data?: { error?: unknown } } | undefined)?.data;
  if (typeof data?.error === "string") return data.error;
  const message = error instanceof Error ? error.message : undefined;
  return message && /^[a-z_]+$/.test(message) ? message : undefined;
}

function retryAfter(error: unknown): number | undefined {
  const value = (error as { retryAfter?: unknown } | undefined)?.retryAfter;
  if (typeof value === "number") return value;
  return slackError(error) === "ratelimited" ? 30 : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Copies only the fields the resolvers read: never the email, phone or anything else. */
function pickUser(user: WebApiUser | undefined): WebApiUser | null {
  if (!user) return null;
  const profile = user.profile ?? {};
  return {
    id: string(user.id),
    name: string(user.name),
    real_name: string(user.real_name),
    tz: string(user.tz),
    profile: {
      display_name: string(profile.display_name),
      real_name: string(profile.real_name),
      title: string(profile.title),
      pronouns: string(profile.pronouns),
      image_72: string(profile.image_72),
      status_emoji: string(profile.status_emoji),
      status_text: string(profile.status_text),
    },
  };
}

function pickChannel(channel: WebApiChannel | undefined): WebApiChannel | null {
  if (!channel) return null;
  return {
    id: string(channel.id),
    name: string(channel.name),
    is_private: typeof channel.is_private === "boolean" ? channel.is_private : undefined,
  };
}

function pickUsergroup(group: WebApiUsergroup): WebApiUsergroup {
  return { id: string(group.id), handle: string(group.handle), name: string(group.name) };
}

/** Looks one id up; an id Slack doesn't know comes back `null`, any other error is rethrown. */
async function orNull<T>(lookup: () => Promise<T | null>): Promise<T | null> {
  try {
    return await lookup();
  } catch (error) {
    if (NOT_FOUND.has(slackError(error) ?? "")) return null;
    throw error;
  }
}

/**
 * A server-side `(Request) => Response` handler that answers `httpResolverClient`'s lookups with
 * the bot's `WebClient`, so the page can show names without the bot token reaching it. Like
 * `createInteractionRelay`, it's development and preview tooling: don't deploy it publicly. It only
 * calls `users.info`, `conversations.info` and `usergroups.list`, only answers for the ids it's
 * asked about (it lists the user groups on the server, caches that list for a minute, and returns
 * only the ones asked for), and only returns the fields mentions and the profile card use.
 *
 * Mount it anywhere that speaks the Fetch API: a Next.js route (`export const POST = relay`),
 * `Bun.serve`, Hono, or a Vite dev-server middleware.
 */
export function createResolverRelay(
  options: ResolverRelayOptions,
): (request: Request) => Promise<Response> {
  const maxIds = Math.max(1, Math.min(options.maxIds ?? MAX_RESOLVE_IDS, MAX_RESOLVE_IDS));
  const { client } = options;
  if (
    typeof client?.users?.info !== "function" ||
    typeof client.conversations?.info !== "function" ||
    typeof client.usergroups?.list !== "function"
  ) {
    throw new Error(
      "createResolverRelay: `client` must be a WebClient from @slack/web-api (created on the " +
        "server with your bot token), or anything with users.info, conversations.info and " +
        "usergroups.list.",
    );
  }
  const token = relayToken("createResolverRelay", options.token);

  let groups: { at: number; list: Promise<Map<string, WebApiUsergroup>> } | undefined;
  /** `usergroups.list`, by id, shared by the requests of the next minute. */
  function usergroupsById(): Promise<Map<string, WebApiUsergroup>> {
    if (groups && Date.now() - groups.at < USERGROUPS_TTL_MS) return groups.list;
    const list = client.usergroups
      .list()
      .then(
        (res) =>
          new Map(
            (res.usergroups ?? []).flatMap((g) => (typeof g.id === "string" ? [[g.id, g]] : [])),
          ),
      );
    const entry = { at: Date.now(), list };
    groups = entry;
    // A failure isn't cached: the next request asks Slack again.
    list.catch(() => {
      if (groups === entry) groups = undefined;
    });
    return list;
  }

  return async (request) => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
    }
    if (token !== undefined) {
      if (!hasBearer(request, token)) {
        return json(401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
      }
    }

    // JSON only, so a cross-site form post can't use the visitor's cookies to ask.
    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json\s*(;|$)/i.test(type)) {
      return json(415, { error: "expected_json" });
    }

    try {
      const query = parse(await readBody(request), maxIds);
      const [users, channels, usergroups] = await Promise.all([
        Promise.all(
          query.users.map(async (id) => {
            const user = await orNull(
              async () => (await client.users.info({ user: id })).user ?? null,
            );
            return [id, pickUser(user ?? undefined)] as const;
          }),
        ),
        Promise.all(
          query.channels.map(async (id) => {
            const channel = await orNull(
              async () => (await client.conversations.info({ channel: id })).channel ?? null,
            );
            return [id, pickChannel(channel ?? undefined)] as const;
          }),
        ),
        query.usergroups.length ? usergroupsById() : undefined,
      ]);
      const response: ResolveResponse = {};
      if (query.users.length) response.users = Object.fromEntries(users);
      if (query.channels.length) response.channels = Object.fromEntries(channels);
      if (usergroups) {
        response.usergroups = Object.fromEntries(
          query.usergroups.map((id) => {
            const group = usergroups.get(id);
            return [id, group ? pickUsergroup(group) : null];
          }),
        );
      }
      return json(200, response);
    } catch (error) {
      if (error instanceof Refusal) return json(error.status, { error: error.error });
      options.onError?.(error);
      const wait = retryAfter(error);
      if (wait !== undefined) {
        return json(429, { error: "ratelimited" }, { "retry-after": String(wait) });
      }
      return json(502, { error: "slack_unavailable" });
    }
  };
}
