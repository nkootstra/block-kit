import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createInteractionRelay } from "../../packages/block-kit/src/interactivity/relay";

const src = (path: string) =>
  fileURLToPath(new URL(`../../packages/block-kit/src/${path}`, import.meta.url));

/** Where the page POSTs interactions when "Deliver to" is set to your app. */
const RELAY_PATH = "/slack/relay";

/**
 * Signs the playground's interactions and forwards them to your app, so the signing secret stays
 * in the dev server. Configure it in `apps/playground/.env.local`:
 *
 *   SLACK_REQUEST_URL=http://localhost:3000/slack/events
 *   SLACK_SIGNING_SECRET=...
 */
function interactionRelay(env: Record<string, string>): Plugin {
  const requestUrl = env.SLACK_REQUEST_URL;
  const signingSecret = env.SLACK_SIGNING_SECRET;
  const relay =
    requestUrl && signingSecret ? createInteractionRelay({ requestUrl, signingSecret }) : undefined;

  return {
    name: "slack-interaction-relay",
    configureServer(server) {
      server.middlewares.use(RELAY_PATH, async (req, res) => {
        if (!relay) {
          res.statusCode = 503;
          res.setHeader("content-type", "text/plain");
          res.end(
            "The relay isn't configured: set SLACK_REQUEST_URL and SLACK_SIGNING_SECRET in apps/playground/.env.local.",
          );
          return;
        }
        await send(res, await relay(await toRequest(req)));
      });
    },
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
  return new Request(`http://localhost${req.url ?? "/"}`, { method: req.method, body });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), interactionRelay(loadEnv(mode, process.cwd(), "SLACK_"))],
  resolve: {
    // Point at library sources so edits hot-reload without a rebuild.
    alias: [
      { find: "@nkootstra/block-kit/styles.css", replacement: src("styles.css") },
      { find: "@nkootstra/block-kit/transport", replacement: src("interactivity/transport.ts") },
      { find: /^@nkootstra\/block-kit$/, replacement: src("index.ts") },
    ],
  },
  server: {
    port: 5180,
    strictPort: true,
    fs: { allow: ["../.."] },
  },
}));
