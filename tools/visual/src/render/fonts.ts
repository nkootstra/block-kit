const FONT_URL = /url\("([^"]+\.(woff2?))"\)/g;

/**
 * Replaces the font files a bundled stylesheet points to with data URLs. Bun leaves them as
 * absolute file paths, which a page loaded with `setContent` can't fetch, so without this the
 * render would silently fall back to whatever fonts the machine has installed.
 */
export async function inlineFonts(css: string): Promise<string> {
  const files = new Map<string, string>();
  for (const [, path, ext] of css.matchAll(FONT_URL)) {
    if (path && ext && !files.has(path)) {
      const bytes = Buffer.from(await Bun.file(path).arrayBuffer()).toString("base64");
      files.set(path, `data:font/${ext};base64,${bytes}`);
    }
  }
  return css.replace(FONT_URL, (_, path: string) => `url("${files.get(path)}")`);
}
