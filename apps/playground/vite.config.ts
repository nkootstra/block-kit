import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import stylex from "@stylexjs/unplugin/vite";
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
  const relay = relayFrom(env);

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

function relayFrom(env: Record<string, string>) {
  const requestUrl = env.SLACK_REQUEST_URL;
  const signingSecret = env.SLACK_SIGNING_SECRET;
  return requestUrl && signingSecret
    ? createInteractionRelay({ requestUrl, signingSecret })
    : undefined;
}

/**
 * `@pierre/theming/themes` registers Pierre's themes and, as lazy chunks, every Shiki theme. The
 * editor uses Pierre's themes only, so the build keeps the same entry without the Shiki ones.
 */
function pierreThemesOnly(): Plugin {
  return {
    name: "pierre-themes-only",
    apply: "build",
    load(id) {
      if (!/[\\/]@pierre[\\/]theming[\\/]dist[\\/]themes\.js$/.test(id)) return null;
      return [
        'import { createThemeCollection } from "./modules/createThemeCollection.js";',
        'import { createTheme } from "./modules/createTheme.js";',
        'import { pierreThemes } from "./collections/pierre.js";',
        "const shikiThemes = createThemeCollection({ themes: [] });",
        "const themes = createThemeCollection({ themes: [pierreThemes] });",
        "export { createTheme, pierreThemes, shikiThemes, themes };",
      ].join("\n");
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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "SLACK_");
  return {
    plugins: [stylex(), react(), interactionRelay(env), pierreThemesOnly()],
    define: {
      // Whether "Deliver to your app" can work: the relay only exists in the dev server, so a built
      // (public) playground never offers it, and the dev server offers it once it's configured.
      __RELAY__: JSON.stringify(
        command === "serve" ? (relayFrom(env) ? "ready" : "unconfigured") : "absent",
      ),
    },
    resolve: {
      // Point at library sources so edits hot-reload without a rebuild.
      alias: [
        { find: "@nkootstra/block-kit/styles.css", replacement: src("styles.css") },
        { find: "@nkootstra/block-kit/transport", replacement: src("interactivity/transport.ts") },
        { find: /^@nkootstra\/block-kit$/, replacement: src("index.ts") },
        // The editor highlights JSON only; see src/lib/shiki-json.ts and src/lib/shiki-wasm.ts.
        {
          find: /^shiki\/wasm$/,
          replacement: fileURLToPath(new URL("./src/lib/shiki-wasm.ts", import.meta.url)),
        },
        {
          find: /^shiki$/,
          replacement: fileURLToPath(new URL("./src/lib/shiki-json.ts", import.meta.url)),
        },
      ],
    },
    server: {
      port: 5180,
      strictPort: true,
      fs: { allow: ["../.."] },
    },
  };
});
