import { join, resolve } from "node:path";
import { type Browser, type BrowserType, chromium, firefox, type Page, webkit } from "playwright";
import { inlineFonts } from "../render/fonts";
import { bundle } from "../render/renderer";

/** What to draw: a message's blocks, or a modal or Home tab view. */
export interface Mount {
  blocks?: unknown[];
  view?: { type: string; [key: string]: unknown };
  theme?: "light" | "dark";
  /** Validation errors by block_id, as an app returns them with `response_action: "errors"`. */
  errors?: Record<string, string>;
  /** A modal any action opens through `views.open`, as an app answering the interaction would. */
  opens?: { type: "modal"; [key: string]: unknown };
}

export const ENGINES = { chromium, firefox, webkit } satisfies Record<string, BrowserType>;
export type Engine = keyof typeof ENGINES;

const ROOT = resolve(import.meta.dir, "../../../..");
const LIB = join(ROOT, "packages/block-kit");

let assets: Promise<[string, string]> | undefined;
/** The library, React and the fonts in one script and one stylesheet, built once per process. */
function pageAssets() {
  assets ??= Promise.all([
    bundle(join(import.meta.dir, "page.tsx"), LIB),
    bundle(join(import.meta.dir, "../render/page.css"), LIB).then(inlineFonts),
  ]);
  return assets;
}

export interface Harness {
  /** A fresh page with the payload drawn, ready for pointer and keyboard input. */
  open(
    mount: Mount,
    options?: {
      scale?: number;
      reducedMotion?: boolean;
      viewport?: { width: number; height: number };
      /** A touch screen with no hover, like a phone: `(hover: none)` matches and taps replace clicks. */
      touch?: boolean;
    },
  ): Promise<Page>;
  /** Closes every page opened so far, so one test's state never reaches the next. */
  closePages(): Promise<void>;
  close(): Promise<void>;
}

/** Draws payloads with this checkout's library in one engine. Nothing is loaded from the network. */
export async function createHarness(engine: Engine): Promise<Harness> {
  const [script, style] = await pageAssets();
  const browser: Browser = await ENGINES[engine].launch();
  const pages: Page[] = [];
  return {
    async open(mount, { scale = 1, reducedMotion = false, viewport, touch = false } = {}) {
      const page = await browser.newPage({
        viewport: viewport ?? { width: 800, height: 700 },
        hasTouch: touch,
        deviceScaleFactor: scale,
        reducedMotion: reducedMotion ? "reduce" : "no-preference",
        locale: "en-US",
        timezoneId: "UTC",
      });
      pages.push(page);
      await page.route(/^https?:/, (route) => route.fulfill({ status: 404, body: "" }));
      await page.setContent(`<!doctype html><style>${style}</style><div id="root"></div>`);
      await page.addScriptTag({ content: script });
      await page.evaluate((m) => window.mountBlockKit(m), mount);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // Park the pointer where nothing is, so no state starts out hovered.
      const size = page.viewportSize()!;
      await page.mouse.move(size.width - 10, size.height - 10);
      return page;
    },
    async closePages() {
      await Promise.all(pages.splice(0).map((p) => p.close()));
    },
    close: () => browser.close(),
  };
}

/**
 * Waits for every running transition and finite animation to finish, so styles read their end
 * state. Looping animations (a status spinner) never finish, so they're left running.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  });
}

/**
 * Presses Tab until `selector` holds focus, the way a keyboard user reaches it. WebKit, like Safari
 * by default, skips links on Tab; Safari's users reach them with Option+Tab, which tabs to
 * everything.
 */
export async function tabTo(page: Page, selector: string, maxPresses = 40): Promise<void> {
  const key = page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab";
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press(key);
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

/** The colour painted at (x, y) CSS pixels inside the element, transitions finished. */
export async function paintedAt(
  page: Page,
  selector: string,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  const { PNG } = await import("pngjs");
  const png = PNG.sync.read(
    await page.locator(selector).first().screenshot({ animations: "disabled" }),
  );
  const scale = png.width / (await page.locator(selector).first().boundingBox())!.width;
  const i = (Math.floor(y * scale) * png.width + Math.floor(x * scale)) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}
