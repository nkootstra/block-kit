import { connection } from "next/server";
import { Suspense } from "react";
import { blocks } from "@/lib/blocks";
import { resolveNames } from "@/lib/mentions";
import { slack, usingFakeWorkspace } from "@/lib/slack";
import { Approval } from "./approval";
import { RelayPreview } from "./relay-preview";
import { ServerResolvedPreview } from "./server-resolved-preview";

/** The message, with its names looked up on the server. */
async function Previews() {
  // Resolved per request, so names from a real workspace are never baked into a prerendered page.
  await connection();
  const names = await resolveNames(slack, blocks);
  return (
    <>
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
    </>
  );
}

export default function Page() {
  return (
    <main>
      <h1>Keep the bot token on the server</h1>
      <Suspense fallback={<p>Looking up names…</p>}>
        <Previews />
      </Suspense>
      <h2>Buttons through the interaction relay</h2>
      <Approval />
    </main>
  );
}
