/**
 * Sample images: every image a fixture, the docs, the site, the playground or a package test shows
 * is ours, hosted under https://cdn.block-kit.dev/samples/ with a committed copy in
 * fixtures/assets/samples/ (CREDITS.md there says where each came from). Keys carry a short content
 * hash, so an image never changes under its URL; replacing one means a new key.
 *
 * The visual comparison, the renderer and the interaction harness serve samples from the committed
 * copies (loadImage, routeSamples), so they never need the network for them, and
 * checkSampleImages() refuses an image on any other host, except the placeholder ones.
 */
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Glob } from "bun";
import type { BrowserContext, Page } from "playwright";

const ROOT = resolve(import.meta.dir, "../../..");
export const SAMPLES = join(ROOT, "fixtures/assets/samples");
export const SAMPLE_BASE = "https://cdn.block-kit.dev/samples/";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * The committed copy of a sample image, by its URL (also behind Slack's slack-imgs.com proxy, which
 * a reference loads every image through), or undefined for any other URL.
 */
export function sampleFile(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname === "slack-imgs.com") {
    const inner = parsed.searchParams.get("url");
    return inner ? sampleFile(inner) : undefined;
  }
  const href = `${parsed.origin}${parsed.pathname}`;
  if (!href.startsWith(SAMPLE_BASE)) return undefined;
  const name = href.slice(SAMPLE_BASE.length);
  // URL parsing already resolved any `..`; a sample is a plain file name.
  if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) return undefined;
  return join(SAMPLES, name);
}

export interface Image {
  body: Uint8Array;
  type: string;
}

/** An image's bytes: a sample's from its committed copy (never the network), others fetched. */
export async function loadImage(url: string): Promise<Image | undefined> {
  const file = sampleFile(url);
  if (file) {
    if (!existsSync(file)) return undefined;
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    return {
      body: new Uint8Array(await Bun.file(file).arrayBuffer()),
      type: TYPES[ext] ?? "application/octet-stream",
    };
  }
  const res = await fetch(url);
  if (!res.ok) return undefined;
  return {
    body: new Uint8Array(await res.arrayBuffer()),
    type: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * Serves cdn.block-kit.dev/samples/* to a page or browser context from the committed copies, a 404
 * for a sample that isn't committed. Register it after any catch-all route: Playwright tries the
 * most recently added route first.
 */
export async function routeSamples(target: Page | BrowserContext): Promise<void> {
  await target.route(
    (url) => sampleFile(url.href) !== undefined && url.hostname !== "slack-imgs.com",
    async (route) => {
      const image = await loadImage(route.request().url());
      await route.fulfill(
        image
          ? {
              body: Buffer.from(image.body),
              headers: { "content-type": image.type, "access-control-allow-origin": "*" },
            }
          : { status: 404, body: "" },
      );
    },
  );
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
// Where Block Kit (and the library's resolvers) expect an image, the URL needn't end in one.
const IMAGE_KEY =
  /(?:image_url|imageUrl|thumbnail_url|thumbnailUrl|provider_icon_url|icon_url|author_icon|avatar_url|avatarUrl|src)["']?\s*[:=]\s*["'`]$/;
const URL_PATTERN = /https?:\/\/[^\s"'`<>()\\]+/g;

/** The image URLs in a file's text, in order. */
export function imageUrls(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:]+$/, "");
    const path = url.split(/[?#]/)[0] ?? url;
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    if (IMAGE_EXTENSION.test(path) || IMAGE_KEY.test(before)) found.push(url);
  }
  return found;
}

/**
 * Placeholder hosts: names reserved for examples (RFC 2606, RFC 6761) and `localhost`, which show
 * no one's image.
 */
function isPlaceholderHost(host: string): boolean {
  return (
    host === "localhost" ||
    /(^|\.)example\.(com|net|org)$/.test(host) ||
    /(^|\.)(example|test|invalid|localhost)$/.test(host)
  );
}

/** Whether a fixture, doc or test may show an image from this URL. */
export function isAllowedImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.replace(/\$\{[^}]*\}/g, "x"));
  } catch {
    return false;
  }
  if (sampleFile(parsed.href)) return true;
  if (isPlaceholderHost(parsed.hostname)) return true;
  // A Slack file URL with placeholder team and file IDs (T0000-F0000), as fixtures name a file.
  return (
    parsed.hostname === "files.slack.com" && /^\/files-pri\/T0\d*-F0\d*\//.test(parsed.pathname)
  );
}

export interface SampleProblem {
  file: string;
  url: string;
  message: string;
}

/**
 * Every image the given sources (repository-relative path → text) load from a host other than
 * cdn.block-kit.dev/samples/ or a placeholder host, and every sample without a committed copy.
 */
export function checkSampleImages(
  sources: Map<string, string>,
  committed: (path: string) => boolean = existsSync,
): SampleProblem[] {
  const problems: SampleProblem[] = [];
  for (const [file, text] of sources) {
    for (const url of imageUrls(text)) {
      const sample = sampleFile(url);
      if (sample) {
        if (!committed(sample)) {
          problems.push({
            file,
            url,
            message: `has no committed copy at ${relative(ROOT, sample)}`,
          });
        }
      } else if (!isAllowedImageUrl(url)) {
        let host = url;
        try {
          host = new URL(url).hostname;
        } catch {}
        problems.push({
          file,
          url,
          message: `loads an image from ${host}; host it under cdn.block-kit.dev/samples/`,
        });
      }
    }
  }
  return problems;
}

/** What the check reads: everything a user or a test sees images from, not generated output. */
const SOURCES = [
  "fixtures/*/**/*.json",
  "apps/docs/**/*.{md,mdx,ts,tsx,js,jsx,json,astro,html}",
  "apps/site/src/**/*.{md,mdx,ts,tsx,js,jsx,astro,html,css}",
  "apps/playground/index.html",
  "apps/playground/src/**/*.{ts,tsx,css,html,json}",
  "packages/block-kit/**/*.test.{ts,tsx}",
  "packages/block-kit/README.md",
  "docs/**/*.md",
  "*.md",
];
const SKIP = /(^|\/)(node_modules|dist|\.blume|\.astro|\.wrangler|\.turbo|test-results)\//;

/** The files checkSampleImages() covers, by repository-relative path. */
export async function readSampleSources(): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const pattern of SOURCES) {
    for await (const path of new Glob(pattern).scan({ cwd: ROOT, dot: false })) {
      if (SKIP.test(path) || sources.has(path)) continue;
      // The lock and the baselines at the top of fixtures/ are bookkeeping, not payloads.
      if (path.startsWith("fixtures/") && !path.slice("fixtures/".length).includes("/")) continue;
      sources.set(path, await Bun.file(join(ROOT, path)).text());
    }
  }
  return new Map([...sources].toSorted(([a], [b]) => a.localeCompare(b)));
}
