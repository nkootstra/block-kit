// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
//
// The visual comparison, the renderer and the interaction harness show sample images
// (cdn.block-kit.dev/samples/) from their committed copies, so CI never needs the network for them.
import { afterAll, afterEach, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createHarness, type Harness } from "./interaction/harness";
import { createRenderer } from "./render/renderer";
import { routeSamples } from "./samples";

setDefaultTimeout(30_000);

const ROOT = resolve(import.meta.dir, "../../..");
const LAKE = "https://cdn.block-kit.dev/samples/mountain-lake.d12ac6fc.jpg"; // 400 x 300
const MISSING = "https://cdn.block-kit.dev/samples/missing.00000000.jpg";

const imageBlock = (url: string) => ({
  type: "image",
  image_url: url,
  alt_text: "A lake",
});

describe("routeSamples", () => {
  it("serves a sample's committed copy to a page that can't reach the network", async () => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      await context.route(/^https?:/, (route) => route.abort("internetdisconnected"));
      await routeSamples(context);
      const page = await context.newPage();
      await page.setContent(`<img src="${LAKE}"><img src="${MISSING}">`);
      const sizes = await page.evaluate(() =>
        Promise.all(
          [...document.images].map(
            (img) =>
              new Promise<[number, number]>((done) => {
                const report = () => done([img.naturalWidth, img.naturalHeight]);
                if (img.complete) report();
                else {
                  img.addEventListener("load", report, { once: true });
                  img.addEventListener("error", report, { once: true });
                }
              }),
          ),
        ),
      );
      expect(sizes).toEqual([
        [400, 300],
        [0, 0],
      ]);
    } finally {
      await browser.close();
    }
  });
});

describe("the interaction harness", () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await createHarness("chromium");
  });
  afterEach(() => harness.closePages());
  afterAll(() => harness.close());

  it("shows a sample image, while any other image stays a 404", async () => {
    const page = await harness.open({
      blocks: [imageBlock(LAKE), imageBlock("https://images.example/elsewhere.jpg")],
    });
    await page.waitForFunction(() => [...document.images].every((img) => img.complete));
    const widths = await page.evaluate(() => [...document.images].map((img) => img.naturalWidth));
    expect(widths).toEqual([400, 0]);
  });
});

describe("the renderer", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("reads a sample's size from its committed copy, not the network", async () => {
    const fetched: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      fetched.push(String(input instanceof Request ? input.url : input));
      return realFetch(input, init);
    }) as typeof fetch;
    const renderer = await createRenderer(join(ROOT, "packages/block-kit"));
    try {
      await renderer.render(JSON.stringify({ blocks: [imageBlock(LAKE)] }), "light");
    } finally {
      await renderer.close();
    }
    expect(fetched.filter((url) => url.startsWith("https://cdn.block-kit.dev/"))).toEqual([]);
  });
});
