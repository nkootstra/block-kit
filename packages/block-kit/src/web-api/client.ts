// No `@slack/web-api` import here: these are the only parts of a `WebClient` the resolvers call, so
// the browser-safe `httpResolverClient` can stand in for one, and a real `WebClient` (or an
// emulator's) still fits without this package depending on the Slack SDK.

/** The `users.info` fields the resolvers read: a name, and what the profile card shows. */
export interface WebApiUser {
  id?: string;
  name?: string;
  real_name?: string;
  tz?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
    title?: string;
    pronouns?: string;
    image_72?: string;
    status_emoji?: string;
    status_text?: string;
  };
}

export interface WebApiChannel {
  id?: string;
  name?: string;
  is_private?: boolean;
}

export interface WebApiUsergroup {
  id?: string;
  handle?: string;
  name?: string;
}

/**
 * The three Web API methods `createWebApiResolvers` calls. A `WebClient` from `@slack/web-api`
 * satisfies it, on a server; in the browser, use `httpResolverClient` from
 * `@nkootstra/block-kit/transport`, which asks a `createResolverRelay` on your server instead, so
 * the bot token never reaches the page.
 */
export interface WebApiClient {
  users: { info(args: { user: string }): Promise<{ user?: WebApiUser }> };
  conversations: { info(args: { channel: string }): Promise<{ channel?: WebApiChannel }> };
  usergroups: { list(): Promise<{ usergroups?: WebApiUsergroup[] }> };
}

/**
 * Set on `httpResolverClient`'s `usergroups`: looks one user group up by id through the resolver
 * relay, which never lists them all. `createWebApiResolvers` uses it in place of `list()` when
 * it's there. Internal: a `Symbol.for`, so the `/transport` and `/web-api` bundles agree on it.
 */
export const USERGROUP_BY_ID: unique symbol = Symbol.for("@nkootstra/block-kit/usergroup-by-id");

export interface UsergroupsById {
  [USERGROUP_BY_ID]?: (id: string) => Promise<WebApiUsergroup | null>;
}
