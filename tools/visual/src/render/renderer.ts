import { join } from "node:path";
import type { BunPlugin } from "bun";
import { type Browser, type BrowserContext, chromium } from "playwright";
import { inlineFonts } from "./fonts";
import { readPayload } from "./payload";
import { imageSize, placeholderSvg } from "./placeholder";

export type Theme = "light" | "dark";
export type ThemeVia = "provider" | "html";

export interface Renderer {
  /** Renders a fixture payload to a PNG. Rejects when the payload isn't valid Block Kit. */
  render(json: string, theme: Theme): Promise<Buffer>;
  close(): Promise<void>;
}

/**
 * Renders payloads with the library in `libRoot` (a `packages/block-kit` directory, of this
 * checkout or another one), bundled from its source. The page is built once per renderer: the
 * library, React and the fonts in one script and one stylesheet, so a render needs no server.
 */
export async function createRenderer(
  libRoot: string,
  {
    systemColorScheme = "light",
    themeVia = "provider",
  }: {
    /** The operating system's color scheme the page sees; renders don't depend on it. */
    systemColorScheme?: Theme;
    /** How the page applies the theme: the provider's `theme` prop, or `data-theme` on <html>. */
    themeVia?: ThemeVia;
  } = {},
): Promise<Renderer> {
  const [script, style] = await Promise.all([
    bundle(join(import.meta.dir, "page.tsx"), libRoot),
    bundle(join(import.meta.dir, "page.css"), libRoot).then(inlineFonts),
  ]);
  const browser = await chromium.launch();
  return {
    render: (json, theme) =>
      render(browser, script, style, json, theme, systemColorScheme, themeVia),
    close: () => browser.close(),
  };
}

async function render(
  browser: Browser,
  script: string,
  style: string,
  json: string,
  theme: Theme,
  systemColorScheme: Theme,
  themeVia: ThemeVia,
): Promise<Buffer> {
  const payload = readPayload(json);
  if (!payload.ok) throw new Error(payload.error);
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1,
    // The theme comes from the provider's `theme` prop, whatever the system prefers.
    colorScheme: systemColorScheme,
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.route(/^https?:/, serveFromCache);
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><style>${style}</style><div id="root"></div>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(([p, t, via]) => window.renderBlockKit(p, t, via), [
      payload,
      theme,
      themeVia,
    ] as const);
    const failedFonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "error").map((f) => f.family);
    });
    if (failedFonts.length) throw new Error(`Fonts failed to load: ${failedFonts.join(", ")}`);
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((img) =>
          img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true })),
        ),
      );
    });
    return await page.locator("#sbk-render > *").first().screenshot({ animations: "disabled" });
  } finally {
    await context.close();
  }
}

type Response = { status: number; body: string | Buffer; contentType: string };

const NOT_FOUND: Response = { status: 404, body: "", contentType: "text/plain" };

/**
 * Emoji images: the library builds these URLs itself from a fixed, version-pinned set
 * (packages/block-kit/src/emoji/lookup.ts), so a payload can only choose which emoji, not what an
 * image shows. They are the one image a render shows as it is.
 */
const EMOJI =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/emoji-datasource-apple@[\d.]+\/img\/apple\/64\/[0-9a-f-]+\.png$/;

/**
 * A render loads nothing from the network as is, emoji aside. An image is replaced by a placeholder
 * of the same size (placeholder.ts); the real image is only fetched to read that size. Every
 * response is fetched once per process, so every renderer gets the same answer. Anything else, and
 * an image whose size is unknown, is a 404.
 */
const responses = new Map<string, Promise<Response>>();

const serveFromCache: Parameters<BrowserContext["route"]>[1] = async (route) => {
  if (route.request().resourceType() !== "image") return route.fulfill(NOT_FOUND);
  const url = route.request().url();
  let response = responses.get(url);
  if (!response) {
    response = fetch(url)
      .then(async (res) => {
        if (!res.ok) return NOT_FOUND;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (EMOJI.test(url))
          return { status: 200, body: Buffer.from(bytes), contentType: "image/png" };
        const size = imageSize(bytes);
        return size
          ? { status: 200, body: placeholderSvg(size), contentType: "image/svg+xml" }
          : NOT_FOUND;
      })
      .catch(() => NOT_FOUND);
    responses.set(url, response);
  }
  await route.fulfill(await response);
};

/**
 * Bundles a page entry for the browser with `@nkootstra/block-kit` pointing at `libRoot`'s source.
 * React always comes from this tool, so another checkout's source shares one copy with the page.
 */
async function bundle(entry: string, libRoot: string): Promise<string> {
  const here = import.meta.dir;
  const plugin: BunPlugin = {
    name: "block-kit-source",
    setup(build) {
      build.onResolve({ filter: /^@nkootstra\/block-kit\/styles\.css$/ }, () => ({
        path: join(libRoot, "src/styles.css"),
      }));
      build.onResolve({ filter: /^@nkootstra\/block-kit$/ }, () => ({
        path: join(libRoot, "src/index.ts"),
      }));
      build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({
        path: Bun.resolveSync(args.path, here),
      }));
    },
  };
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    plugins: [plugin],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!result.success) throw new AggregateError(result.logs, `Couldn't bundle ${entry}`);
  const output = result.outputs.find((o) =>
    o.path.endsWith(entry.endsWith(".css") ? ".css" : ".js"),
  );
  if (!output) throw new Error(`Bundling ${entry} produced no output`);
  return output.text();
}
