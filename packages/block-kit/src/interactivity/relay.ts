import { postSigned } from "./client";
import { hasBearer, isCrossSite, readCapped, relayToken } from "./guard";

export interface InteractionRelayOptions {
  /**
   * The app's Slack request URL (an Events API / interactivity endpoint): an absolute `http:` or
   * `https:` URL. Checked when the relay is created.
   */
  requestUrl: string;
  /**
   * Same signing secret the receiving app was configured with. Stays on the server. Must not be
   * empty: the relay throws when it's created without one.
   */
  signingSecret: string;
  /**
   * When set, a request must carry `Authorization: Bearer <token>`, or it gets a 401 before its
   * body is read. Without it, anyone who can reach the route can have it sign any payload and
   * send it to your app. Set it whenever the route is reachable beyond your machine (a tunnel, a
   * preview deploy, a shared network), and pass the same value to `httpTransport`'s `token`. It's
   * a development secret shared with the page, not a Slack credential, so it's fine in browser
   * code. An empty string counts as no token. The relay throws when it's created with a Slack
   * token (`xox…-`, `xapp-`) or the signing secret as its token.
   */
  token?: string;
  /**
   * How long the app has to answer, in milliseconds, before the relay gives up and answers 504.
   * Defaults to 10 000. (Slack itself gives an app 3 seconds to acknowledge an interaction.)
   */
  timeoutMs?: number;
  /**
   * Called on the server with what went wrong when the app couldn't be reached (the browser gets a
   * 502), didn't answer within `timeoutMs` (a 504; the error is the abort's `TimeoutError`), or
   * answered with a non-2xx status (an `Error` with the app's `status` and response `body`; the
   * browser gets the same status with a generic message instead of that body).
   */
  onError?: (error: unknown) => void;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** Slack's own interaction payloads stay far below this; a modal with 100 blocks is ~100 KB. */
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const NULL_BODY = new Set([204, 205, 304]);

/** Checks the options once, when the relay is created, so a missing env var fails at startup. */
function check(options: InteractionRelayOptions) {
  const name = "createInteractionRelay";
  if (typeof options.signingSecret !== "string" || options.signingSecret === "") {
    throw new Error(
      `${name}: \`signingSecret\` is missing or empty. Pass the signing secret the app at ` +
        "`requestUrl` verifies requests with (e.g. process.env.SLACK_SIGNING_SECRET, set on the " +
        "server only).",
    );
  }
  let url: URL | undefined;
  try {
    url = new URL(options.requestUrl);
  } catch {
    // Reported below.
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(
      `${name}: \`requestUrl\` must be the app's absolute http(s) request URL, e.g. ` +
        `"http://localhost:3000/slack/events" (got ${
          typeof options.requestUrl === "string" && options.requestUrl !== ""
            ? "a value that isn't one"
            : "nothing"
        }).`,
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${name}: \`timeoutMs\` must be a positive number of milliseconds.`);
  }
  return { token: relayToken(name, options.token, options.signingSecret), timeoutMs };
}

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
 * It throws when it's created without a `signingSecret` or a valid `requestUrl`, so a missing
 * environment variable shows up when the server starts rather than as a failed click.
 *
 * Mount it anywhere that speaks the Fetch API: a Next.js route (`export const POST = relay`),
 * `Bun.serve`, Hono, or a Vite dev-server middleware.
 */
export function createInteractionRelay(
  options: InteractionRelayOptions,
): (request: Request) => Promise<Response> {
  const { token, timeoutMs } = check(options);
  return async (request) => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
    }
    if (token !== undefined && !hasBearer(request, token)) {
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
    const signal = AbortSignal.timeout(timeoutMs);
    let res: Response;
    let text: string;
    try {
      res = await postSigned({
        requestUrl: options.requestUrl,
        signingSecret: options.signingSecret,
        fetch: options.fetch,
        body,
        signal,
      });
      text = await res.text();
    } catch (cause) {
      options.onError?.(cause);
      return signal.aborted
        ? new Response("The app didn't answer in time", { status: 504 })
        : new Response("Couldn't reach the app", { status: 502 });
    }
    if (!res.ok && !NULL_BODY.has(res.status)) {
      // The app's error page can carry a stack trace or config: it goes to onError, not the page.
      options.onError?.(
        Object.assign(new Error(`The app answered ${res.status}`), {
          status: res.status,
          body: text,
        }),
      );
      return new Response(`The app answered ${res.status}`, {
        status: res.status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const headers = new Headers();
    const type = res.headers.get("content-type");
    if (type) headers.set("content-type", type);
    // A 204 can't carry a body, not even an empty one.
    return new Response(NULL_BODY.has(res.status) ? null : text, { status: res.status, headers });
  };
}
