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
  if (options.image) return imageUrl(url);
  return keptUrl(url, false);
}

/** An image's URL for its `src`: `safeUrl` with the `image` option, for any payload value. */
export function imageUrl(url: unknown): string | undefined {
  return keptUrl(url, true);
}

/**
 * `url` as `safeUrl` keeps it, or `undefined`. The start of a kept URL (its scheme, or the first
 * character of a relative URL) is written out from the constants below, not copied from the
 * input, so what decides where a URL leads and whether it can run script is always one of the
 * starts checked here; the rest of the URL follows as written.
 */
function keptUrl(url: unknown, image: boolean): string | undefined {
  if (typeof url !== "string") return undefined;
  const stripped = url.replace(/[\t\n\r]/g, "");
  let start = 0;
  let end = stripped.length;
  while (start < end && isTrimmed(stripped.charCodeAt(start))) start++;
  while (end > start && isTrimmed(stripped.charCodeAt(end - 1))) end--;
  const cleaned = stripped.slice(start, end);
  if (cleaned === "") return undefined;
  const kept = keptStart(cleaned, image);
  return kept === undefined ? undefined : kept.start + cleaned.slice(kept.from);
}

/**
 * How `keptUrl` writes out the start of `url`: `start` from a constant, followed by `url` from
 * index `from`. `undefined` for a URL that isn't kept.
 */
function keptStart(url: string, image: boolean): { start: string; from: number } | undefined {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    // No scheme before the first `/`, `?` or `#`: a relative URL. A `:` later on is part of the path.
    const relative = relativeStart(url.charAt(0));
    if (relative !== undefined) return { start: relative, from: 1 };
    // A bare name such as `a.png` reads the same as `./a.png`. Spelled that way, an image's URL
    // can't be `hasOwnProperty`, which React's server renderer uses as the key of a plain object
    // and then can't call, so the next image throws. A link's bare path stays as written.
    return { start: image ? "./" : "", from: 0 };
  }
  const imageScheme = image && (scheme === "blob" || /^data:image\//i.test(url));
  const kept = ALLOWED_SCHEMES.has(scheme) || imageScheme ? keptScheme(scheme) : undefined;
  return kept === undefined ? undefined : { start: kept, from: scheme.length + 1 };
}

/** The scheme `safeUrl` writes out for a scheme it keeps, followed by its colon. */
function keptScheme(scheme: string): string | undefined {
  switch (scheme) {
    case "http":
      return "http:";
    case "https":
      return "https:";
    case "mailto":
      return "mailto:";
    case "slack":
      return "slack:";
    case "blob":
      return "blob:";
    case "data":
      return "data:";
    default:
      return undefined;
  }
}

/** The first character of a relative URL that starts with one `safeUrl` keeps as it is. */
function relativeStart(first: string): string | undefined {
  switch (first) {
    case "/":
      return "/";
    case ".":
      return ".";
    case "?":
      return "?";
    case "#":
      return "#";
    default:
      return undefined;
  }
}
