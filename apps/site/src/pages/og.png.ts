import type { APIRoute } from "astro";
import logoSvg from "../../public/icon.svg?raw";
import { renderCard } from "../lib/og";
import { description, headline } from "../lib/site";

/** The social card, drawn at build time from the page's own headline and description. */
export const GET: APIRoute = async () =>
  new Response(new Uint8Array(await renderCard({ headline, description, logoSvg })), {
    headers: { "Content-Type": "image/png" },
  });
