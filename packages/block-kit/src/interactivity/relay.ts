import { postSigned } from "./client";
import { hasBearer, isCrossSite, readCapped } from "./guard";

export interface InteractionRelayOptions {
  /** The app's Slack request URL (an Events API / interactivity endpoint). */
  requestUrl: string;
  /** Same signing secret the receiving app was configured with. Stays on the server. */
  signingSecret: string;
  /**
   * When set, a request must carry `Authorization: Bearer <token>`, or it gets a 401 before its
   * body is read. Without it, anyone who can reach the route can have it sign any payload and
   * send it to your app. Set it whenever the route is reachable beyond your machine (a tunnel, a
   * preview deploy, a shared network), and pass the same value to `httpTransport`'s `token`. It's
   * a development secret shared with the page, not a Slack credential, so it's fine in browser
   * code.
   */
  token?: string;
  /** Called when the app couldn't be reached. The browser only ever gets a 502 without details. */
  onError?: (error: unknown) => void;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** Slack's own interaction payloads stay far below this; a modal with 100 blocks is ~100 KB. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * A server-side `(Request) => Response` handler that signs the unsigned interactions an
 * `httpTransport` POSTs from the browser and forwards them to the app, passing its reply back.
 * The signing secret never reaches the page, and the browser only talks to its own origin.
 *
 * It's development and preview tooling: it signs whatever it's sent, with a fresh timestamp each
 * time, so whoever can reach it can send your app requests that pass its signature check. Don't
 * deploy it publicly, and set `token` when it's reachable beyond your machine. It refuses a
 * browser request from another site's page, so a site you visit can't use it through a form.
 *
 * Mount it anywhere that speaks the Fetch API: a Next.js route (`export const POST = relay`),
 * `Bun.serve`, Hono, or a Vite dev-server middleware.
 */
export function createInteractionRelay(
  options: InteractionRelayOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
    }
    if (options.token !== undefined && !hasBearer(request, options.token)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "www-authenticate": "Bearer" },
      });
    }
    if (isCrossSite(request)) {
      return new Response("Cross-site requests aren't relayed", { status: 403 });
    }
    const body = await readCapped(request, MAX_BODY_BYTES);
    if (body === undefined) return new Response("Payload Too Large", { status: 413 });
    if (!new URLSearchParams(body).has("payload")) {
      return new Response("Expected a form-encoded `payload`", { status: 400 });
    }
    let res: Response;
    try {
      res = await postSigned({ ...options, body });
    } catch (cause) {
      options.onError?.(cause);
      return new Response("Couldn't reach the app", { status: 502 });
    }
    const headers = new Headers();
    const type = res.headers.get("content-type");
    if (type) headers.set("content-type", type);
    return new Response(await res.text(), { status: res.status, headers });
  };
}
