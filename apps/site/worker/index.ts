// Content negotiation in front of the static `astro build` output, so agents get something they
// can read without parsing HTML:
// - `Accept: text/markdown` on the home page gets `/index.md` (pages/index.md.ts).
// - A missing page answers 404 with `/404.md` to a client that asks for Markdown, and with the
//   RFC 9457 problem document in `/404.json` to one that asks for JSON or requests a `.json` URL.
// Browsers keep getting the HTML page and 404 page. `run_worker_first` in wrangler.jsonc keeps the
// Worker off the build assets, images and text files, which are served straight from the assets.
// Kept in step with the docs' Worker (apps/docs/worker/index.ts), which does the same for its pages.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const MARKDOWN = "text/markdown; charset=utf-8";
const PROBLEM = "application/problem+json";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") return env.ASSETS.fetch(request);
    const accept = request.headers.get("Accept");
    const markdownUrl = markdownUrlFor(request);
    const wantsMarkdown = prefers("text/markdown", accept);

    if (wantsMarkdown && markdownUrl) {
      const markdown = await env.ASSETS.fetch(new Request(markdownUrl, request));
      if (markdown.ok) return withVaryAccept(withType(markdown, MARKDOWN, 200, request));
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return withVaryAccept(response);

    if (wantsJsonError(request, accept)) return notFound(env, request, "/404.json", PROBLEM);
    if (wantsMarkdown || new URL(request.url).pathname.endsWith(".md")) {
      return notFound(env, request, "/404.md", MARKDOWN);
    }
    return withVaryAccept(response);
  },
};

/** The `.md` twin of a page URL (`/` → `/index.md`), or `null` for a URL that names a file. */
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
  return (
    new URL(request.url).pathname.endsWith(".json") ||
    prefers("application/json", accept) ||
    prefers("application/problem+json", accept)
  );
}

async function notFound(env: Env, request: Request, path: string, type: string) {
  const body = await env.ASSETS.fetch(new Request(new URL(path, request.url), request));
  if (!body.ok) return withVaryAccept(await env.ASSETS.fetch(request));
  return withVaryAccept(withType(body, type, 404, request));
}

/** The body of `response` with an explicit status and Content-Type (and none for HEAD). */
function withType(response: Response, type: string, status: number, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", type);
  return new Response(request.method === "HEAD" ? null : response.body, { status, headers });
}

// The same URL now has several representations, so caches must key on Accept.
function withVaryAccept(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.append("Vary", "Accept");
  return result;
}
