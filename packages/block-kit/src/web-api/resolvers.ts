import type { Resolvers, UserProfile } from "../index";
import type { WebApiClient, WebApiUser } from "./client";

export interface WebApiResolversOptions {
  /**
   * Milliseconds to coalesce `user`/`channel` lookups requested in quick succession (e.g. every
   * mention in a long message) before firing the batch of requests concurrently. Default 20.
   */
  batchWindowMs?: number;
}

export interface WebApiResolvers extends Resolvers {
  /**
   * Registers a listener called whenever a previously-unresolved id finishes looking up (whether
   * it resolved to a name or turned out to be unknown). Returns an unsubscribe function. Since the
   * resolver functions themselves are synchronous, a consumer re-renders by subscribing and
   * forcing an update — see `useWebApiResolvers`.
   */
  subscribe(listener: () => void): () => void;
}

type Kind = "user" | "channel" | "usergroup";

/**
 * Builds `Resolvers` (see `context.tsx`) backed by the Slack Web API: `users.info` for names and
 * the profile card, `conversations.info`, and `usergroups.list` for usergroups (there is no per-id
 * usergroup lookup in the Web API, so the whole list is fetched once and cached).
 *
 * On a server, pass a `WebClient`. In the browser, pass `httpResolverClient`, which asks a
 * `createResolverRelay` on your server, so the bot token never reaches the page.
 *
 * The resolver functions are synchronous — `(id) => string | undefined` — so a lookup that hasn't
 * completed yet returns `undefined` immediately and schedules a background fetch; call `subscribe`
 * (or the `useWebApiResolvers` hook) to be notified when it completes so the tree can re-render
 * with the resolved name.
 */
export function createWebApiResolvers(
  client: WebApiClient,
  opts: WebApiResolversOptions = {},
): WebApiResolvers {
  const batchWindowMs = opts.batchWindowMs ?? 20;

  // `undefined` = not yet looked up, `null` = looked up and unknown/failed, `string` = resolved.
  const cache = new Map<string, string | null>();
  // Filled by the same `users.info` call as the user's name.
  const profiles = new Map<string, UserProfile>();
  const inflight = new Set<string>();
  const queues = new Map<Kind, Set<string>>([
    ["user", new Set()],
    ["channel", new Set()],
  ]);
  const timers = new Map<Kind, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();

  let usergroupsLoaded = false;
  let usergroupsLoading: Promise<void> | undefined;

  function notify() {
    for (const listener of listeners) listener();
  }

  function cacheKey(kind: Kind, id: string) {
    return `${kind}:${id}`;
  }

  function lookup(kind: "user" | "channel", id: string): string | undefined {
    const key = cacheKey(kind, id);
    if (cache.has(key)) return cache.get(key) ?? undefined;
    schedule(kind, id);
    return undefined;
  }

  function schedule(kind: "user" | "channel", id: string) {
    const key = cacheKey(kind, id);
    if (inflight.has(key)) return;
    inflight.add(key);
    const queue = queues.get(kind);
    queue?.add(id);
    if (!timers.has(kind)) {
      timers.set(
        kind,
        setTimeout(() => {
          timers.delete(kind);
          void flush(kind);
        }, batchWindowMs),
      );
    }
  }

  async function flush(kind: "user" | "channel") {
    const queue = queues.get(kind);
    const ids = queue ? [...queue] : [];
    queue?.clear();
    // Fired concurrently (the Web API has no bulk users.info/conversations.info), rather than
    // waiting on each lookup one at a time.
    await Promise.all(ids.map((id) => fetchOne(kind, id)));
  }

  async function fetchOne(kind: "user" | "channel", id: string) {
    const key = cacheKey(kind, id);
    try {
      const name = kind === "user" ? await fetchUser(id) : await fetchChannelName(id);
      cache.set(key, name ?? null);
    } catch {
      // Unknown id, revoked token, rate limit, or an emulator that doesn't implement the method:
      // treat it the same as "unknown" rather than throwing out of a render-time resolver.
      cache.set(key, null);
    } finally {
      inflight.delete(key);
      notify();
    }
  }

  async function fetchUser(id: string): Promise<string | undefined> {
    const res = await client.users.info({ user: id });
    const name = userName(res.user);
    if (res.user && name) profiles.set(id, toProfile(res.user, name));
    return name;
  }

  async function fetchChannelName(id: string): Promise<string | undefined> {
    const res = await client.conversations.info({ channel: id });
    // Bare, like every resolver: the renderers add the `#` (and the `@` for usergroups).
    return res.channel?.name || undefined;
  }

  function loadUsergroups(): void {
    if (usergroupsLoaded || usergroupsLoading) return;
    usergroupsLoading = (async () => {
      try {
        const res = await client.usergroups.list();
        for (const group of res.usergroups ?? []) {
          if (!group.id) continue;
          cache.set(cacheKey("usergroup", group.id), group.handle || group.name || null);
        }
      } catch {
        // Several emulators (and workspaces without Enterprise Grid) don't implement
        // usergroups.list; leave usergroup ids unresolved rather than failing the whole surface.
      } finally {
        usergroupsLoaded = true;
        usergroupsLoading = undefined;
        notify();
      }
    })();
  }

  function lookupUsergroup(id: string): string | undefined {
    const key = cacheKey("usergroup", id);
    if (cache.has(key)) return cache.get(key) ?? undefined;
    loadUsergroups();
    return undefined;
  }

  return {
    user: (id) => lookup("user", id),
    userProfile: (id) => {
      lookup("user", id);
      return profiles.get(id);
    },
    channel: (id) => lookup("channel", id),
    usergroup: (id) => lookupUsergroup(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function userName(user: WebApiUser | undefined): string | undefined {
  return (
    user?.profile?.display_name ||
    user?.profile?.real_name ||
    user?.real_name ||
    user?.name ||
    undefined
  );
}

/** `users.info` in the shape the profile card reads. Slack wraps the status emoji in colons. */
function toProfile(user: WebApiUser, name: string): UserProfile {
  const profile = user.profile ?? {};
  const realName = profile.real_name || user.real_name || undefined;
  const emoji = profile.status_emoji?.replace(/^:|:$/g, "") || undefined;
  const text = profile.status_text || undefined;
  return {
    name,
    realName: realName === name ? undefined : realName,
    title: profile.title || undefined,
    pronouns: profile.pronouns || undefined,
    avatarUrl: profile.image_72 || undefined,
    status: emoji || text ? { emoji, text } : undefined,
    timeZone: user.tz || undefined,
  };
}
