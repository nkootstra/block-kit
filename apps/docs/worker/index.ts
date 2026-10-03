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
// Pull request Previews set `ROBOTS` (`previews.vars` in wrangler.jsonc) to keep search engines off
// their pages.

import type { McpData } from "blume/ai/mcp/data.ts";
import { createMcpFetchHandler } from "blume/ai/mcp/server.ts";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ROBOTS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await respond(request, env);
    if (!env.ROBOTS) return response;
    const result = new Response(response.body, response);
    result.headers.set("X-Robots-Tag", env.ROBOTS);
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
    if (markdown.ok) return withVaryAccept(markdown);
  }

  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) return withVaryAccept(response);

  if (wantsJsonError(request, accept)) {
    return notFound(env, request, "/404.json", "application/problem+json");
  }
  if (wantsMarkdown || new URL(request.url).pathname.endsWith(".md")) {
    return notFound(env, request, "/404.md", "text/markdown; charset=utf-8");
  }
  return withVaryAccept(response);
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
