import { postSigned } from "./client";

export interface InteractionRelayOptions {
  /** The app's Slack request URL (an Events API / interactivity endpoint). */
  requestUrl: string;
  /** Same signing secret the receiving app was configured with. Stays on the server. */
  signingSecret: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * A server-side `(Request) => Response` handler that signs the unsigned interactions an
 * `httpTransport` POSTs from the browser and forwards them to the app, passing its reply back.
 * The signing secret never reaches the page, and the browser only talks to its own origin.
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
    const body = await request.text();
    if (!new URLSearchParams(body).has("payload")) {
      return new Response("Expected a form-encoded `payload`", { status: 400 });
    }
    let res: Response;
    try {
      res = await postSigned({ ...options, body });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return new Response(`Couldn't reach ${options.requestUrl}: ${reason}`, { status: 502 });
    }
    const headers = new Headers();
    const type = res.headers.get("content-type");
    if (type) headers.set("content-type", type);
    return new Response(await res.text(), { status: res.status, headers });
  };
}
