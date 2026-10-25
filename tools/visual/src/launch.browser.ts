// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// The browser compare.ts renders references and our rendering in.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Browser, chromium, type Page } from "playwright";
import { LAUNCH_OPTIONS } from "./launch";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch(LAUNCH_OPTIONS);
  page = await browser.newPage();
});
afterAll(() => browser.close());

const TEXT = `font: 15px/22px sans-serif; color: #1d1c1d; background: #fff; padding: 4px; width: 300px`;

describe("LAUNCH_OPTIONS", () => {
  // Chromium on Linux draws text with subpixel antialiasing unless the text sits in its own
  // compositing layer (a transform, an animation, will-change), where it falls back to greyscale.
  // Slack's markup and ours don't promote the same elements, so their text came out differently.
  it("draws text in a compositing layer as it draws it outside one", async () => {
    await page.setContent(`<body style="margin: 0; background: #fff">
      <div id="flat" style="${TEXT}">Are you sure? This sentence wraps.</div>
      <div id="layer" style="${TEXT}; will-change: transform">Are you sure? This sentence wraps.</div>
    </body>`);

    const flat = await page.locator("#flat").screenshot();
    const layer = await page.locator("#layer").screenshot();

    expect(Buffer.compare(flat, layer)).toBe(0);
  });
});
