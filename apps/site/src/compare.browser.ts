// Needs Chromium, Firefox and WebKit (`bunx playwright install chromium firefox webkit`) and a built
// site; run with `bun run --cwd apps/site test:browser`, which builds it first.
//
// The "Check it against Slack" comparison: the Divider slider's thumb must sit under the image's
// divider line at every position, so dragging either one reads as dragging the same thing.
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, chromium, firefox, type Page, webkit } from "playwright";

setDefaultTimeout(60_000);

const DIST = resolve(import.meta.dir, "../dist");
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("Build the site first: bun run build");
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(join(DIST, path.endsWith("/") ? `${path}index.html` : path));
      return (await file.exists())
        ? new Response(file)
        : new Response("Not found", { status: 404 });
    },
  });
});
afterAll(() => server?.stop(true));

/**
 * Where the thumb's centre sits for a value, measured rather than assumed: each engine draws its
 * own thumb. With `step="any"`, a click on the track sets the value whose thumb centre is under the
 * pointer, so two clicks give the linear map from value to thumb centre.
 */
async function thumbCentre(page: Page): Promise<(value: number) => number> {
  const range = page.locator("[data-compare-range]");
  const box = (await range.boundingBox())!;
  const y = box.y + box.height / 2;
  await range.evaluate((el) => {
    (el as HTMLInputElement).step = "any";
  });
  const valueAt = async (x: number) => {
    await page.mouse.click(x, y);
    return page.evaluate(() => (window as unknown as { __raw: number }).__raw);
  };
  // Clicks land on whole pixels in Firefox and WebKit, so sample across the track and fit a line
  // rather than extrapolating from two points.
  const xs = [0.15, 0.3, 0.45, 0.55, 0.7, 0.85].map((f) => Math.round(box.x + box.width * f));
  const vs: number[] = [];
  for (const x of xs) vs.push(await valueAt(x));
  const n = xs.length;
  const mv = vs.reduce((a, b) => a + b, 0) / n;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const slope =
    xs.reduce((acc, x, i) => acc + (vs[i]! - mv) * (x - mx), 0) /
    vs.reduce((acc, v) => acc + (v - mv) ** 2, 0);
  return (value) => mx + (value - mv) * slope;
}

/** The divider line's centre, after setting the split through the slider. */
async function dividerAt(page: Page, value: number): Promise<number> {
  await page.locator("[data-compare-range]").evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  const line = (await page.locator(".compare__line").boundingBox())!;
  return line.x + line.width / 2;
}

const ENGINES = { chromium, firefox, webkit } as const;
const WIDTHS = [1280, 390] as const;
const VALUES = [0, 25, 50, 75, 100] as const;

for (const [name, engine] of Object.entries(ENGINES)) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await engine.launch();
    });
    afterAll(() => browser?.close());

    for (const width of WIDTHS) {
      it(`keeps the slider's thumb under the divider at ${width}px`, async () => {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        // The value a click on the track produced, before the page's handler rounds it.
        await page.addInitScript(() => {
          window.addEventListener(
            "input",
            (event) => {
              const target = event.target as HTMLInputElement;
              if (target.matches?.("[data-compare-range]")) {
                (window as unknown as { __raw: number }).__raw = Number(target.value);
              }
            },
            true,
          );
        });
        await page.goto(`${server.url}`);
        await page.locator("#compare").scrollIntoViewIfNeeded();
        const thumb = await thumbCentre(page);
        const offsets: number[] = [];
        for (const value of VALUES) {
          offsets.push(Math.round((thumb(value) - (await dividerAt(page, value))) * 10) / 10);
        }
        console.log(
          `${name} ${width}px thumb − divider at ${VALUES.join("/")}%: ${offsets.join(", ")}`,
        );
        expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(1);
        await page.close();
      });

      it(`fits the page at ${width}px`, async () => {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.goto(`${server.url}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await page.close();
      });
    }
  });
}
