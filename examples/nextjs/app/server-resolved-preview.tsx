"use client";

import { BlockKitProvider, Message } from "@nkootstra/block-kit";
import type { AnyBlock } from "@slack/types";

/** Pattern (b): the page resolved the names on the server and passes them in as plain maps. */
export function ServerResolvedPreview(props: {
  blocks: AnyBlock[];
  users: Record<string, string>;
  channels: Record<string, string>;
  usergroups: Record<string, string>;
}) {
  return (
    <BlockKitProvider
      resolvers={{
        user: (id) => props.users[id],
        channel: (id) => props.channels[id],
        usergroup: (id) => props.usergroups[id],
        slackFile: (file) => (file.id ? { url: `/api/slack/files/${file.id}` } : undefined),
      }}
    >
      <Message blocks={props.blocks} />
    </BlockKitProvider>
  );
}
