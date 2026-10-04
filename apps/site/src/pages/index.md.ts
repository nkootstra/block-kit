import type { APIRoute } from "astro";
import { homeMarkdown } from "../lib/markdown";

/** `/index.md`, the home page for agents; see lib/markdown.ts. */
export const GET: APIRoute = () =>
  new Response(homeMarkdown(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
