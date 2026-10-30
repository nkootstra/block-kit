// Request checks the server-side relays share. No Node imports, so they run on any Fetch runtime.

/**
 * The header `httpTransport` sends with every interaction. A custom header makes the request one a
 * browser won't send cross-site without a CORS preflight, which the relay never answers, so a page
 * on another site can't make the relay sign anything with a plain HTML form.
 */
export const TRANSPORT_HEADER = "x-block-kit-transport";

/** Compares in time that depends only on the lengths, so a wrong token can't be guessed by timing. */
export function sameToken(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  return diff === 0;
}

/** Whether the request carries `Authorization: Bearer <token>`. */
export function hasBearer(request: Request, token: string): boolean {
  const given = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  return given !== undefined && sameToken(given, token);
}

/**
 * Whether a browser sent the request from another site's page. A request without
 * `TRANSPORT_HEADER` is refused when the browser marks it cross-site (`Sec-Fetch-Site`) or its
 * `Origin` isn't the relay's own. Server-to-server calls send neither header and pass.
 */
export function isCrossSite(request: Request): boolean {
  if (request.headers.has(TRANSPORT_HEADER)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  try {
    return origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

/** Reads the body as text, or `undefined` once it passes `max` bytes, without buffering the rest. */
export async function readCapped(request: Request, max: number): Promise<string | undefined> {
  const length = Number(request.headers.get("content-length"));
  if (length > max) return undefined;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Slack credentials: bot, user and app-level tokens, which must never be a relay's `token`. */
const SLACK_TOKEN = /^(xox[a-z]|xapp)-/;

/**
 * A relay's `token` option, checked when the relay is created. An empty string (an env var left
 * blank, as in the examples' `.env.example`) means no token. A Slack credential, or the signing
 * secret, is refused: the token is shared with the page, so it would publish that secret.
 */
export function relayToken(
  factory: string,
  token: string | undefined,
  signingSecret?: string,
): string | undefined {
  if (token === undefined || token === "") return undefined;
  if (typeof token !== "string") {
    throw new TypeError(`${factory}: \`token\` must be a string.`);
  }
  if (SLACK_TOKEN.test(token)) {
    throw new Error(
      `${factory}: \`token\` looks like a Slack token (xox…/xapp-…). The relay's token is sent ` +
        "by the page, so anyone who opens it can read it: use a random development secret of " +
        "your own, never a bot, user or app token.",
    );
  }
  if (signingSecret !== undefined && token === signingSecret) {
    throw new Error(
      `${factory}: \`token\` is the same as \`signingSecret\`. The relay's token is sent by the ` +
        "page, so anyone who opens it can read it: use a different, random development secret.",
    );
  }
  return token;
}
