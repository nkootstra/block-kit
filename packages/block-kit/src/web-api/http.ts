import type { WebApiChannel, WebApiClient, WebApiUser } from "./client";
import {
  CHANNEL_ID,
  MAX_RESOLVE_IDS,
  type ResolveRequest,
  type ResolveResponse,
  USER_ID,
} from "./protocol";

// Browser-safe: it only talks to your own server, which holds the bot token.

export interface HttpResolverClientOptions {
  /** Where a `createResolverRelay` answers, e.g. `/api/slack/resolve`. */
  url: string;
  /** Sent with every request, e.g. a CSRF or auth header your relay's `authorize` checks. */
  headers?: HeadersInit;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

interface Waiting<T> {
  resolve: (value: T | null) => void;
  reject: (error: unknown) => void;
}

/**
 * A `WebApiClient` that asks a `createResolverRelay` on your server instead of Slack, for
 * `useWebApiResolvers` in the browser. Lookups made in the same tick go out as one request.
 *
 * Create it once, outside your components: the resolvers are tied to the client's identity, so
 * a new client on every render would start every lookup over.
 *
 * ```tsx
 * const client = httpResolverClient({ url: "/api/slack/resolve" });
 * ```
 */
export function httpResolverClient(options: HttpResolverClientOptions): WebApiClient {
  const users = new Map<string, Waiting<WebApiUser>[]>();
  const channels = new Map<string, Waiting<WebApiChannel>[]>();
  let scheduled = false;

  async function post(body: ResolveRequest): Promise<ResolveResponse> {
    const res = await (options.fetch ?? fetch)(options.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...Object.fromEntries(new Headers(options.headers)),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${options.url} answered ${res.status}`);
    return (await res.json()) as ResolveResponse;
  }

  function settle<T>(
    waiting: Map<string, Waiting<T>[]>,
    found: Record<string, T | null> | undefined,
    error?: unknown,
  ) {
    for (const [id, list] of waiting) {
      for (const w of list) {
        if (error === undefined) w.resolve(found?.[id] ?? null);
        else w.reject(error);
      }
    }
  }

  function flush() {
    scheduled = false;
    const queue = [
      ...[...users.keys()].map((id) => ["user", id] as const),
      ...[...channels.keys()].map((id) => ["channel", id] as const),
    ];
    const pendingUsers = new Map(users);
    const pendingChannels = new Map(channels);
    users.clear();
    channels.clear();
    for (let i = 0; i < queue.length; i += MAX_RESOLVE_IDS) {
      const batch = queue.slice(i, i + MAX_RESOLVE_IDS);
      const batchUsers = new Map(
        batch.filter(([k]) => k === "user").map(([, id]) => [id, pendingUsers.get(id) ?? []]),
      );
      const batchChannels = new Map(
        batch.filter(([k]) => k === "channel").map(([, id]) => [id, pendingChannels.get(id) ?? []]),
      );
      const body: ResolveRequest = {};
      if (batchUsers.size) body.users = [...batchUsers.keys()];
      if (batchChannels.size) body.channels = [...batchChannels.keys()];
      post(body).then(
        (res) => {
          settle(batchUsers, res.users);
          settle(batchChannels, res.channels);
        },
        (error: unknown) => {
          settle(batchUsers, undefined, error);
          settle(batchChannels, undefined, error);
        },
      );
    }
  }

  function enqueue<T>(
    waiting: Map<string, Waiting<T>[]>,
    pattern: RegExp,
    id: string,
  ): Promise<T | null> {
    // The relay refuses a whole request over one malformed id, so those stay unknown here.
    if (!pattern.test(id)) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      waiting.set(id, [...(waiting.get(id) ?? []), { resolve, reject }]);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    });
  }

  return {
    users: {
      info: async ({ user }) => ({ user: (await enqueue(users, USER_ID, user)) ?? undefined }),
    },
    conversations: {
      info: async ({ channel }) => ({
        channel: (await enqueue(channels, CHANNEL_ID, channel)) ?? undefined,
      }),
    },
    usergroups: {
      list: async () => ({ usergroups: (await post({ usergroups: true })).usergroups ?? [] }),
    },
  };
}
