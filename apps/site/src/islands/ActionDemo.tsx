import { BlockKitProvider, Message } from "@nkootstra/block-kit";
import type { AnyBlock } from "@slack/types";
import { useState } from "react";

/** 2026-10-01 09:03 UTC, fixed so the server-rendered time matches the hydrated one. */
const TS = 1_790_845_380;

const BLOCKS: AnyBlock[] = [
  {
    type: "section",
    text: { type: "mrkdwn", text: "*Ada Lovelace* requested time off :palm_tree:" },
  },
  {
    type: "section",
    fields: [
      { type: "mrkdwn", text: "*Type:*\nPaid time off" },
      { type: "mrkdwn", text: "*When:*\nAug 10 – Aug 13" },
    ],
  },
  {
    type: "actions",
    block_id: "decision",
    elements: [
      {
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "Approve" },
        value: "approve",
        action_id: "approve",
      },
      {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "Deny" },
        value: "deny",
        action_id: "deny",
      },
    ],
  },
];

/** An approval message whose buttons print the `block_actions` payload they'd send to your app. */
export default function ActionDemo() {
  const [payload, setPayload] = useState<{ json: string; actionId: string } | null>(null);

  return (
    <div className="frame">
      <div className="frame__stage">
        <BlockKitProvider
          timeZone="UTC"
          onPayload={(p) => {
            // The parts a handler usually reads; the full payload also carries team, container,
            // message and state.
            const { type, user, actions } = p;
            setPayload({
              json: JSON.stringify({ type, user, actions }, null, 2),
              actionId: actions[0]?.action_id ?? "",
            });
          }}
        >
          <Message app={{ name: "Time Off" }} ts={TS} timeZone="UTC" blocks={BLOCKS} />
        </BlockKitProvider>
      </div>
      {/* Screen readers hear one short line per click; the JSON stays readable and scrollable. */}
      <p className="sr-only" role="status">
        {payload ? `${payload.actionId} sent a block_actions payload, shown below.` : ""}
      </p>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard */}
      <pre className="log" tabIndex={0} role="region" aria-label="onPayload output">
        <span className="log__title">{payload ? "onPayload received" : "onPayload"}</span>
        {payload?.json ?? "Click Approve or Deny."}
      </pre>
    </div>
  );
}
