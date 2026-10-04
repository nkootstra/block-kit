import type { APIRoute } from "astro";
import { notFoundMarkdown } from "../lib/markdown";

/** `/404.md`, the 404 body worker/index.ts sends agents that ask for Markdown. */
export const GET: APIRoute = () =>
  new Response(notFoundMarkdown(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
