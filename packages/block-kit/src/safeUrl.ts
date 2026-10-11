/** The schemes a payload URL may use. Anything else (`javascript:`, `data:`, `vbscript:`, ...) is dropped. */
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "slack"]);

/**
 * A payload URL, or `undefined` when it would be unsafe to follow. Links, buttons and overflow
 * options take their URL from the message, which comes from whoever wrote it, so a `javascript:`
 * URL would run in the page that renders it. Absolute URLs keep only the schemes above; relative
 * URLs (`/path`, `#anchor`, `?query`, `//host/path`) stay, since they can only point at a page.
 *
 * Browsers strip leading and trailing spaces and control characters from a URL, and tabs and
 * newlines from anywhere in it, before they read the scheme, so `\tjava\nscript:` is still
 * `javascript:`. The check does the same before it looks.
 */
export function safeUrl(url: string | undefined): string | undefined {
  if (typeof url !== "string") return undefined;
  // oxlint-disable-next-line no-control-regex -- the control characters are the point.
  const cleaned = url.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+|[\u0000- ]+$/g, "");
  if (cleaned === "") return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
  if (scheme) return ALLOWED_SCHEMES.has(scheme[1]!.toLowerCase()) ? cleaned : undefined;
  // No scheme before the first `/`, `?` or `#`: a relative URL. A `:` later on is part of the path.
  return cleaned;
}
