// Adds the response headers Blume's generated `dist/_headers` lacks. Workers Static Assets reads that
// file; shipping a `public/_headers` instead would make Blume skip its own, so this appends to it
// after the build:
// - The build's `/_astro/*` files have content hashes in their names, so they can be cached for a
//   year without revalidation. Blume leaves them at `max-age=0, must-revalidate`.
// - `/llms-full.txt` copies the whole site for agents; `noindex` keeps it out of search results,
//   where the pages themselves belong. Agents can still fetch it.
// - Every response gets the security headers the landing page and the playground send, except a
//   Content-Security-Policy: Blume writes its own inline scripts and can change them in any upgrade,
//   and nothing here checks their hashes yet. The referrer is kept to the origin, so the projects
//   the docs link to still see where readers came from.
// It fails the build when `_headers` is missing, so a Blume change that stops writing it is noticed.
import { appendFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const file = join(resolve(import.meta.dir, ".."), "dist", "_headers");

const rules = `
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/llms-full.txt
  X-Robots-Tag: noindex
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()
  X-Frame-Options: DENY
`;

const current = await readFile(file, "utf8").catch(() => {
  throw new Error(`${file} is missing; does Blume still write _headers?`);
});
if (!current.includes("/_astro/*\n  Cache-Control")) await appendFile(file, rules);
