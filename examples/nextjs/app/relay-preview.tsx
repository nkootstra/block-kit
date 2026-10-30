"use client";

import { BlockKitProvider, Message } from "@nkootstra/block-kit";
import { httpResolverClient } from "@nkootstra/block-kit/transport";
import { useWebApiResolvers } from "@nkootstra/block-kit/web-api";
import type { AnyBlock } from "@slack/types";

// Created once: the resolvers belong to the client they were made with, so a new client on every
// render would start every lookup over.
const client = httpResolverClient({
  url: "/api/slack/resolve",
  // A development secret shared with the page, not a Slack credential.
  // Blank means none.
  token: process.env.NEXT_PUBLIC_SLACK_RELAY_TOKEN,
});

/** Pattern (a): the browser asks the relay route for names; the bot token stays on the server. */
export function RelayPreview({ blocks }: { blocks: AnyBlock[] }) {
  const resolvers = useWebApiResolvers(client);
  return (
    <BlockKitProvider
      resolvers={{
        ...resolvers,
        slackFile: (file) => (file.id ? { url: `/api/slack/files/${file.id}` } : undefined),
      }}
    >
      <Message blocks={blocks} />
    </BlockKitProvider>
  );
}
