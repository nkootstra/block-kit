// Content negotiation in front of the static `blume build` output, using the files Blume writes
// next to the pages:
// - `Accept: text/markdown` on a page gets its Markdown copy (`/blocks/section` →
//   `/blocks/section.md`), so agents get the page without its HTML chrome.
// - A missing page answers 404 with `/404.md` to an agent that asks for Markdown or requests a
//   `.md` URL, and with the RFC 9457 problem document in `/404.json` to one that asks for JSON or
//   calls the docs API. That's what the `openapi.json` Blume publishes promises for both.
// Browsers keep getting the HTML pages and 404 page. `run_worker_first` in wrangler.jsonc keeps
// the Worker off the build assets and raw files, which are served straight from the assets.
// `/mcp` is the docs' MCP server, Blume's own handler over the snapshot `scripts/mcp.ts` writes
// next to the build (Blume generates the server only on a server build).
// For search engines:
// - The old `block-kit.kootstra.io` domain answers every request with a permanent redirect to the
//   same URL on `docs.block-kit.dev`.
// - A host other than `docs.block-kit.dev` (a Preview, a workers.dev URL) is marked noindex, and
//   Previews can set `ROBOTS` (`previews.vars` in wrangler.jsonc) to any other directive.
// - A page's Markdown copies (`.md`, `.mdx`, or Markdown by content negotiation) name the HTML page
//   as canonical in a `Link` header.
// - The 404 page answers with a 404 status at its own URL too, and the trailing-slash redirect
//   Workers Static Assets sends is made permanent (308 rather than 307).
// Every page also links the raster favicons Google Search needs (see RASTER_ICONS below).

import type { McpData } from "blume/ai/mcp/data.ts";
import { createMcpFetchHandler } from "blume/ai/mcp/server.ts";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ROBOTS?: string;
}

const site = "https://docs.block-kit.dev";

const host = new URL(site).hostname;
const oldHost = "block-kit.kootstra.io";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === oldHost) {
      return Response.redirect(`${site}${url.pathname}${url.search}`, 301);
    }
    const response = withFavicons(await respond(request, env));
    const robots = env.ROBOTS ?? (url.hostname === host ? undefined : "noindex");
    if (!robots) return response;
    const result = new Response(response.body, response);
    result.headers.set("X-Robots-Tag", robots);
    return result;
  },
};

let mcp: Promise<(request: Request) => Promise<Response>> | undefined;

async function respond(request: Request, env: Env): Promise<Response> {
  if (new URL(request.url).pathname === "/mcp") {
    // Loaded on the first call, so page requests don't parse the snapshot.
    mcp ??= import("../dist/mcp-data.json").then(({ default: data }) =>
      createMcpFetchHandler(data as McpData),
    );
    return (await mcp)(request);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return env.ASSETS.fetch(request);
  }
  const accept = request.headers.get("Accept");
  const markdownUrl = markdownUrlFor(request);
  const wantsMarkdown = markdownUrl !== null && prefers("text/markdown", accept);

  if (wantsMarkdown) {
    const markdown = await env.ASSETS.fetch(new Request(markdownUrl, request));
    if (markdown.ok) return withVaryAccept(withCanonical(markdown, markdownUrl.pathname));
  }

  const response = await env.ASSETS.fetch(request);
  const { pathname } = new URL(request.url);
  if (response.status === 307) return permanent(response);
  if (response.ok && /\.mdx?$/.test(pathname)) {
    return withVaryAccept(withCanonical(response, pathname));
  }
  if (response.ok && pathname === "/404") {
    return withVaryAccept(new Response(response.body, { status: 404, headers: response.headers }));
  }
  if (response.status !== 404) return withVaryAccept(response);

  if (wantsJsonError(request, accept)) {
    return notFound(env, request, "/404.json", "application/problem+json");
  }
  if (wantsMarkdown || new URL(request.url).pathname.endsWith(".md")) {
    return notFound(env, request, "/404.md", "text/markdown; charset=utf-8");
  }
  return withVaryAccept(response);
}

/**
 * Google Search shows only raster favicons, and Blume links one favicon (`icon.svg`), so pages also
 * link the PNG and ICO in public/, converted from icon.svg.
 */
const RASTER_ICONS =
  '<link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96">' +
  '<link rel="icon" href="/favicon.ico" sizes="32x32">';

/** Adds the raster favicons to every page. */
function withFavicons(response: Response): Response {
  if (!response.headers.get("Content-Type")?.startsWith("text/html")) return response;
  return new HTMLRewriter()
    .on("head", {
      element(head) {
        head.append(RASTER_ICONS, { html: true });
      },
    })
    .transform(response);
}

/**
 * Names the HTML page a Markdown copy at `markdownPath` (`/blocks/section.md`, `/index.mdx`) belongs
 * to as its canonical URL, so search engines index the page rather than the copy.
 */
function withCanonical(response: Response, markdownPath: string): Response {
  const page = markdownPath.replace(/\.mdx?$/, "").replace(/^\/index$/, "/");
  const result = new Response(response.body, response);
  result.headers.set("Link", `<${site}${page}>; rel="canonical"`);
  return result;
}

/** The same redirect, made permanent: a page URL's trailing slash is dropped for good. */
function permanent(redirect: Response): Response {
  return new Response(null, {
    status: 308,
    headers: { Location: redirect.headers.get("Location") ?? "/" },
  });
}

/** The `.md` twin of a page URL, or `null` for a URL that names a file. */
export function markdownUrlFor(request: Request): URL | null {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  if (lastSegment.includes(".")) return null;
  url.pathname = `${path || "/index"}.md`;
  url.search = "";
  return url;
}

/**
 * Whether the Accept header asks for `type` at least as strongly as `text/html`. Browsers list
 * HTML first and never Markdown or JSON, so a tie goes to the client that named the type.
 */
export function prefers(type: string, accept: string | null): boolean {
  if (!accept) return false;
  let wanted = 0;
  let html = 0;
  for (const part of accept.split(",")) {
    const [mediaType = "", ...params] = part.split(";").map((piece) => piece.trim().toLowerCase());
    const qParam = params.find((param) => param.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isNaN(q)) continue;
    if (mediaType === type) wanted = Math.max(wanted, q);
    else if (mediaType === "text/html") html = Math.max(html, q);
  }
  return wanted > 0 && wanted >= html;
}

function wantsJsonError(request: Request, accept: string | null): boolean {
  const { pathname } = new URL(request.url);
  return (
    pathname.startsWith("/api/") ||
    pathname.endsWith(".json") ||
    prefers("application/json", accept) ||
    prefers("application/problem+json", accept)
  );
}

async function notFound(
  env: Env,
  request: Request,
  path: string,
  contentType: string,
): Promise<Response> {
  const body = await env.ASSETS.fetch(new Request(new URL(path, request.url), request));
  if (!body.ok) return withVaryAccept(await env.ASSETS.fetch(request));
  const response = new Response(request.method === "HEAD" ? null : body.body, {
    status: 404,
    headers: { "Content-Type": contentType },
  });
  return withVaryAccept(response);
}

// The same URL now has several representations, so caches must key on Accept.
function withVaryAccept(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.append("Vary", "Accept");
  return result;
}
