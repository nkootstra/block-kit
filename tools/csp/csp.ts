import { createHash } from "node:crypto";

/**
 * A page's inline scripts, as a `_headers` Content-Security-Policy allows them: by the SHA-256 of
 * their text. Editing a script changes its hash, so the playground's and the landing page's builds
 * check their built pages against the `_headers` they ship (apps/playground/vite.config.ts,
 * apps/site/astro.config.mjs). Data blocks (`type="application/ld+json"`) never run and need no
 * hash.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attributes = "", text = ""] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi,
  )) {
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1]?.toLowerCase();
    if (type && type !== "module" && type !== "text/javascript") continue;
    hashes.push(`'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`);
  }
  return hashes;
}

/** The `script-src` sources of the Content-Security-Policy that `_headers` sets. */
export function scriptSources(headers: string): string[] {
  const policy = /^\s*Content-Security-Policy:\s*(.+)$/im.exec(headers)?.[1] ?? "";
  const directive = policy
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === "script-src");
  return directive?.slice(1) ?? [];
}

/** What's wrong with `headers`' policy for `html`'s inline scripts; empty when nothing is. */
export function cspProblems(html: string, headers: string): string[] {
  const allowed = scriptSources(headers);
  const needed = inlineScriptHashes(html);
  const problems = needed
    .filter((hash) => !allowed.includes(hash))
    .map((hash) => `script-src is missing ${hash}, an inline script's hash.`);
  for (const source of allowed) {
    if (source.startsWith("'sha256-") && !needed.includes(source)) {
      problems.push(`script-src allows ${source}, which no inline script has.`);
    }
  }
  return problems;
}
