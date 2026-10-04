import type { APIRoute } from "astro";
import { notFoundProblem } from "../lib/markdown";

/** `/404.json`, the 404 body worker/index.ts sends clients that ask for JSON. */
export const GET: APIRoute = () => Response.json(notFoundProblem());
