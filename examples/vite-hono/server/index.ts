import { createResolverRelay } from "@nkootstra/block-kit/server";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { blocks } from "./blocks";
import { DEMO_APP_PATH, demoApp, interactionRelay, usingDemoApp } from "./interactions";
import { resolveNames } from "./mentions";
import { fromOwnPage } from "./session";
import { downloadFile, slack, slackErrorCode, usingFakeWorkspace } from "./slack";

const port = Number(process.env.PORT ?? 8787);

// Answers `httpResolverClient`'s lookups. The bot token stays here, on the server. This is
// development tooling: set VITE_SLACK_RELAY_TOKEN when anyone else can reach it. A blank
// VITE_SLACK_RELAY_TOKEN means no token.
const relay = createResolverRelay({
  client: slack,
  token: process.env.VITE_SLACK_RELAY_TOKEN,
  onError: (error) => console.error("Slack lookup failed:", slackErrorCode(error)),
});

// Signs the page's button clicks with the signing secret and forwards them to the app.
const interactions = interactionRelay(port);

const app = new Hono();

app.post("/api/slack/resolve", (c) => relay(c.req.raw));
app.post("/api/slack/relay", (c) => interactions(c.req.raw));
if (usingDemoApp) app.post(DEMO_APP_PATH, (c) => demoApp(c.req.raw));

// What `resolvers.slackFile` points the page at: the file, downloaded here with the bot token.
app.get("/api/slack/files/:id", (c) => {
  if (!fromOwnPage(c.req.raw)) return c.text("Forbidden", 403);
  return downloadFile(c.req.param("id"));
});

// The message, with its mentions already resolved on the server, as plain maps.
app.get("/api/message", async (c) => {
  if (!fromOwnPage(c.req.raw)) return c.text("Forbidden", 403);
  c.header("cache-control", "private, no-store");
  return c.json({ blocks, names: await resolveNames(slack, blocks), usingFakeWorkspace });
});

app.use("/*", serveStatic({ root: "./dist/client" }));

if (usingFakeWorkspace) {
  console.log("SLACK_BOT_TOKEN is unset: using the example's in-memory workspace.");
}
if (usingDemoApp) {
  console.log("SLACK_REQUEST_URL is unset: button clicks go to the demo app in this server.");
}
console.log(`http://localhost:${port}`);

export default { port, fetch: app.fetch };
