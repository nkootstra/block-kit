import "server-only";
import { createResolverRelay } from "@nkootstra/block-kit/server";
import { slack, slackErrorCode } from "@/lib/slack";

// Answers `httpResolverClient`'s lookups. The bot token stays here, on the server. This is
// development tooling: set NEXT_PUBLIC_SLACK_RELAY_TOKEN when anyone else can reach it.
export const POST = createResolverRelay({
  client: slack,
  token: process.env.NEXT_PUBLIC_SLACK_RELAY_TOKEN || undefined,
  onError: (error) => console.error("Slack lookup failed:", slackErrorCode(error)),
});
