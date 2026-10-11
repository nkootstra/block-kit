import { blocks } from "@/lib/blocks";
import { resolveNames } from "@/lib/mentions";
import { slack, usingFakeWorkspace } from "@/lib/slack";
import { RelayPreview } from "./relay-preview";
import { ServerResolvedPreview } from "./server-resolved-preview";

// Resolved per request, so names from a real workspace are never baked into a prerendered page.
export const dynamic = "force-dynamic";

export default async function Page() {
  const names = await resolveNames(slack, blocks);
  return (
    <main>
      <h1>Keep the bot token on the server</h1>
      {usingFakeWorkspace && (
        <p>
          <strong>SLACK_BOT_TOKEN is unset</strong>, so names come from the example's in-memory
          workspace.
        </p>
      )}
      <h2>Through the resolver relay</h2>
      <RelayPreview blocks={blocks} />
      <h2>Resolved on the server</h2>
      <ServerResolvedPreview
        blocks={blocks}
        users={names.users}
        channels={names.channels}
        usergroups={names.usergroups}
      />
    </main>
  );
}
