/** The schemes a payload URL may use. Anything else (`javascript:`, `data:`, `vbscript:`, ...) is dropped. */
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "slack"]);

/** A space or C0 control character, which browsers trim from both ends of a URL. */
const isTrimmed = (code: number) => code <= 0x20;

export interface SafeUrlOptions {
  /**
   * The URL is an image's own, opened as the image (the image hover actions' "Open in new
   * window"), so `blob:` and `data:image/...` URLs stay too: neither can run script at the top
   * level, and browsers refuse to navigate a tab to `data:` at all.
   */
  image?: boolean;
}

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
export function safeUrl(url: string | undefined, options: SafeUrlOptions = {}): string | undefined {
  if (typeof url !== "string") return undefined;
  const stripped = url.replace(/[\t\n\r]/g, "");
  let start = 0;
  let end = stripped.length;
  while (start < end && isTrimmed(stripped.charCodeAt(start))) start++;
  while (end > start && isTrimmed(stripped.charCodeAt(end - 1))) end--;
  const cleaned = stripped.slice(start, end);
  if (cleaned === "") return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase();
  // No scheme before the first `/`, `?` or `#`: a relative URL. A `:` later on is part of the path.
  if (scheme === undefined || ALLOWED_SCHEMES.has(scheme)) return cleaned;
  if (options.image && (scheme === "blob" || /^data:image\//i.test(cleaned))) return cleaned;
  return undefined;
}
