import "server-only";
import type { WebApiClient } from "@nkootstra/block-kit/web-api";
import { WebClient } from "@slack/web-api";

// Everything that holds the bot token lives in this file, and `server-only` makes importing it from
// a client component a build error.

const token = process.env.SLACK_BOT_TOKEN;

/** True when SLACK_BOT_TOKEN is unset and the example runs against the in-memory workspace. */
export const usingFakeWorkspace = !token;

const web = token
  ? new WebClient(token, {
      // Answer "try again later" instead of holding the request while Slack's rate limit resets.
      rejectRateLimitedCalls: true,
      retryConfig: { retries: 1 },
    })
  : undefined;

/** Fails the way a `WebClient` does for an id Slack doesn't know. */
function notFound(error: string): never {
  throw Object.assign(new Error(error), { data: { ok: false, error } });
}

/** A workspace of placeholders, so the example runs without a Slack token. */
const fakeWorkspace: WebApiClient = {
  users: {
    info: async ({ user }) => {
      const users: Record<string, { real_name: string; title: string; tz: string }> = {
        U0123456789: { real_name: "Ada Lovelace", title: "Analyst", tz: "Europe/London" },
        U0987654321: { real_name: "Grace Hopper", title: "Rear admiral", tz: "America/New_York" },
      };
      const found = users[user];
      if (!found) notFound("user_not_found");
      return {
        user: {
          id: user,
          real_name: found.real_name,
          tz: found.tz,
          profile: { real_name: found.real_name, title: found.title },
        },
      };
    },
  },
  conversations: {
    info: async ({ channel }) =>
      channel === "C0123456789"
        ? { channel: { id: channel, name: "releases", is_private: false } }
        : notFound("channel_not_found"),
  },
  usergroups: {
    list: async () => ({ usergroups: [{ id: "S0123456789", handle: "eng", name: "Engineering" }] }),
  },
};

/** What the resolvers look names up with: your bot's `WebClient`, or the fake workspace. */
export const slack: WebApiClient = web ?? fakeWorkspace;

/** Slack's error code, for logs. Never log the error object or the client: keep the token out. */
export function slackErrorCode(error: unknown): string {
  const data = (error as { data?: { error?: string } }).data;
  return data?.error ?? (error as { code?: string }).code ?? "unknown_error";
}

const FILE_ID = /^F[A-Z0-9]{8,20}$/;
// Images only, and not SVG, which can carry script when opened directly.
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const FAKE_FILE = "https://cdn.block-kit.dev/samples/mountain-lake.d12ac6fc.jpg";

/**
 * Downloads a Slack file for the page. The browser asks this server, which fetches the file with
 * the bot token in a header, so the token never goes into a URL or the page.
 */
export async function downloadFile(id: string): Promise<Response> {
  const missing = new Response("Not found", { status: 404 });
  if (!FILE_ID.test(id)) return missing;

  let url: string;
  let headers: HeadersInit = {};
  if (web) {
    try {
      url = (await web.files.info({ file: id })).file?.url_private ?? "";
    } catch (error) {
      console.error("files.info failed:", slackErrorCode(error));
      return missing;
    }
    // Only ever send the token to Slack's file host.
    if (!url.startsWith("https://files.slack.com/")) return missing;
    headers = { authorization: `Bearer ${token}` };
  } else {
    if (id !== "F0123456789") return missing;
    url = FAKE_FILE;
  }

  // Not following redirects, so the token can't be sent on to another host.
  const res = await fetch(url, { headers, redirect: "manual" });
  const type = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!res.ok || !res.body || !IMAGE_TYPES.has(type)) return missing;
  return new Response(res.body, {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
