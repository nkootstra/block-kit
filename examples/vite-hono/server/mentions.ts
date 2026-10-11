import type { WebApiClient } from "@nkootstra/block-kit/web-api";

/** The ids the blocks mention, in mrkdwn (`<@U…>`, `<#C…>`, `<!subteam^S…>`) and rich text. */
export function mentionIds(blocks: unknown): {
  users: string[];
  channels: string[];
  usergroups: string[];
} {
  const users = new Set<string>();
  const channels = new Set<string>();
  const usergroups = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const [, id] of value.matchAll(/<@([UW][A-Z0-9]+)/g)) users.add(id!);
      for (const [, id] of value.matchAll(/<#([CG][A-Z0-9]+)/g)) channels.add(id!);
      for (const [, id] of value.matchAll(/<!subteam\^(S[A-Z0-9]+)/g)) usergroups.add(id!);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      if (node.type === "user" && typeof node.user_id === "string") users.add(node.user_id);
      if (node.type === "channel" && typeof node.channel_id === "string") {
        channels.add(node.channel_id);
      }
      if (node.type === "usergroup" && typeof node.usergroup_id === "string") {
        usergroups.add(node.usergroup_id);
      }
      Object.values(node).forEach(visit);
    }
  };
  visit(blocks);
  return { users: [...users], channels: [...channels], usergroups: [...usergroups] };
}

/** Looks every id up at once, leaving out the ones Slack doesn't know. */
async function resolveAll(
  ids: string[],
  name: (id: string) => Promise<string | undefined>,
): Promise<Record<string, string>> {
  const found = await Promise.allSettled(ids.map(async (id) => [id, await name(id)] as const));
  return Object.fromEntries(
    found.flatMap((r) =>
      r.status === "fulfilled" && r.value[1] ? [[r.value[0], r.value[1]]] : [],
    ),
  );
}

export interface ResolvedNames {
  users: Record<string, string>;
  channels: Record<string, string>;
  usergroups: Record<string, string>;
}

/** Resolves the blocks' mentions on the server, into plain maps a client component can take. */
export async function resolveNames(slack: WebApiClient, blocks: unknown): Promise<ResolvedNames> {
  const ids = mentionIds(blocks);
  const [users, channels, usergroups] = await Promise.all([
    resolveAll(ids.users, async (user) => {
      const { user: found } = await slack.users.info({ user });
      return found?.profile?.display_name || found?.profile?.real_name || found?.real_name;
    }),
    resolveAll(ids.channels, async (channel) => {
      return (await slack.conversations.info({ channel })).channel?.name;
    }),
    // There's no per-id lookup for user groups: list them once, only when the blocks mention one.
    ids.usergroups.length
      ? slack.usergroups.list().then(
          ({ usergroups: all = [] }) =>
            Object.fromEntries(
              all.flatMap((g) =>
                g.id && ids.usergroups.includes(g.id) && (g.handle || g.name)
                  ? [[g.id, (g.handle || g.name)!]]
                  : [],
              ),
            ),
          () => ({}),
        )
      : {},
  ]);
  return { users, channels, usergroups };
}
