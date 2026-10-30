import { BlockKitProvider, Message, type Resolvers } from "@nkootstra/block-kit";
import { httpResolverClient } from "@nkootstra/block-kit/transport";
import { useWebApiResolvers } from "@nkootstra/block-kit/web-api";
import type { AnyBlock } from "@slack/types";
import { useEffect, useState } from "react";
import { Approval } from "./Approval";

interface MessageData {
  blocks: AnyBlock[];
  names: {
    users: Record<string, string>;
    channels: Record<string, string>;
    usergroups: Record<string, string>;
  };
  usingFakeWorkspace: boolean;
}

// Created once: the resolvers belong to the client they were made with, so a new client on every
// render would start every lookup over.
const client = httpResolverClient({
  url: "/api/slack/resolve",
  // A development secret shared with the page, not a Slack credential.
  // Blank means none.
  token: import.meta.env.VITE_SLACK_RELAY_TOKEN,
});

// A route on the Hono server that downloads the file with the bot token.
const slackFile: Resolvers["slackFile"] = (file) =>
  file.id ? { url: `/api/slack/files/${file.id}` } : undefined;

/** Pattern (a): the browser asks the relay route for names; the bot token stays on the server. */
function RelayPreview({ blocks }: { blocks: AnyBlock[] }) {
  const resolvers = useWebApiResolvers(client);
  return (
    <BlockKitProvider resolvers={{ ...resolvers, slackFile }}>
      <Message blocks={blocks} />
    </BlockKitProvider>
  );
}

/** Pattern (b): the server resolved the names and sent them as plain maps. */
function ServerResolvedPreview({ blocks, names }: Pick<MessageData, "blocks" | "names">) {
  return (
    <BlockKitProvider
      resolvers={{
        user: (id) => names.users[id],
        channel: (id) => names.channels[id],
        usergroup: (id) => names.usergroups[id],
        slackFile,
      }}
    >
      <Message blocks={blocks} />
    </BlockKitProvider>
  );
}

export function App() {
  const [data, setData] = useState<MessageData>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch("/api/message")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setData, (cause: Error) => setError(cause.message));
  }, []);

  return (
    <main
      style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui" }}
    >
      <h1>Keep the bot token on the server</h1>
      {error && <p>Couldn't load the message from the server: {error}</p>}
      {data?.usingFakeWorkspace && (
        <p>
          <strong>SLACK_BOT_TOKEN is unset</strong>, so names come from the example's in-memory
          workspace.
        </p>
      )}
      {data && (
        <>
          <h2>Through the resolver relay</h2>
          <RelayPreview blocks={data.blocks} />
          <h2>Resolved on the server</h2>
          <ServerResolvedPreview blocks={data.blocks} names={data.names} />
        </>
      )}
      <h2>Buttons through the interaction relay</h2>
      <Approval />
    </main>
  );
}
