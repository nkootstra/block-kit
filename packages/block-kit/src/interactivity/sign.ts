import { createHmac } from "node:crypto";

/**
 * Slack's request-signing scheme (v0): `v0=` + HMAC-SHA256(signing secret, `v0:{ts}:{body}`),
 * hex-encoded. See https://api.slack.com/authentication/verifying-requests-from-slack.
 */
export function signSlackRequest(signingSecret: string, timestamp: number, body: string): string {
  const hmac = createHmac("sha256", signingSecret);
  hmac.update(`v0:${timestamp}:${body}`);
  return `v0=${hmac.digest("hex")}`;
}
