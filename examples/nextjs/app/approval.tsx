"use client";

import { BlockKitProvider, Message } from "@nkootstra/block-kit";
import { httpTransport } from "@nkootstra/block-kit/transport";
import type { AnyBlock } from "@slack/types";
import { useMemo, useState } from "react";

const blocks: AnyBlock[] = [
  {
    type: "section",
    text: { type: "mrkdwn", text: "*Release 1.4* is ready to ship." },
  },
  {
    type: "actions",
    block_id: "release",
    elements: [
      {
        type: "button",
        action_id: "approve_release",
        text: { type: "plain_text", text: "Approve" },
        style: "primary",
        value: "release-1.4",
      },
      {
        type: "button",
        action_id: "hold_release",
        text: { type: "plain_text", text: "Hold" },
        value: "release-1.4",
      },
    ],
  },
];

/**
 * Clicks go to `POST /api/slack/relay` unsigned. The server signs them with the signing secret,
 * which the page never sees, and forwards them to the app.
 */
export function Approval() {
  const [status, setStatus] = useState("Nothing sent yet.");
  const transport = useMemo(
    () =>
      httpTransport({
        url: "/api/slack/relay",
        // A development secret shared with the page, not a Slack credential. Blank means none.
        token: process.env.NEXT_PUBLIC_SLACK_RELAY_TOKEN,
        onResponse: (_, result) => setStatus(`The app answered ${result.status}.`),
        onError: (_, error) => setStatus(`Not delivered: ${error.message}`),
      }),
    [],
  );
  return (
    <>
      <BlockKitProvider {...transport}>
        {/* A fixed `ts` and time zone keep the prerendered page and the browser's render the same. */}
        <Message blocks={blocks} ts="1767225600.000100" timeZone="UTC" />
      </BlockKitProvider>
      <p role="status">{status}</p>
    </>
  );
}
