import type { AnyBlock } from "@slack/types";

/** A message that mentions a user, a channel and a user group, and shows a Slack file. */
export const blocks: AnyBlock[] = [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "<@U0123456789> asked <!subteam^S0123456789> to review the release notes in <#C0123456789>.",
    },
  },
  {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [
          { type: "user", user_id: "U0987654321" },
          { type: "text", text: " approved it. Click a name to see the profile card." },
        ],
      },
    ],
  },
  {
    type: "image",
    slack_file: { id: "F0123456789" },
    alt_text: "A mountain lake",
  },
];
