/**
 * Pixel-compares our rendering of every fixture against its Block Kit Builder reference snapshot.
 * Needs the playground dev server (`bun run --cwd apps/playground dev`).
 *
 *   bun tools/visual/src/compare.ts [fixture-prefix...] [--base=http://localhost:5180]
 *     [--check [--tolerance=0.5] [--baseline=<file>] [--allow-increase]]
 *     [--update-baseline[=lower]] [--scale=2]
 *
 * A reference named `<fixture>@<state>` was captured after interacting with Slack's preview (a plan
 * expanded, a table sorted); STATES replays the same interaction on our rendering first.
 *
 * Writes reference/actual/diff/compare PNGs to test-results/visual/, plus report.json and
 * index.html on a full (unfiltered) run.
 *
 * --update-baseline records each fixture's mismatch in fixtures/visual-baseline.<platform>.json;
 * --update-baseline=lower only adds new fixtures and lowers the ones that improved beyond the
 * tolerance, so it can't hide a regression.
 * --scale renders both sides at that device pixel ratio (default 1), for sharp images such as the
 * landing page's comparison. Baselines are recorded at 1, so don't combine it with --check or
 * --update-baseline.
 *
 * --check fails when a fixture fails to render or its mismatch exceeds its baseline by more than
 * the tolerance (in percentage points). --baseline compares against another file (CI passes the
 * base branch's, so a pull request can't loosen its own check) and --allow-increase reports
 * regressions instead of failing. A fixture without a baseline entry is reported, not failed.
 * Baselines are per platform because font rasterization differs between operating systems; a
 * platform without one is reported, not failed.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Glob } from "bun";
import pixelmatch from "pixelmatch";
import { chromium, type Page } from "playwright";
import { PNG } from "pngjs";

const ROOT = resolve(import.meta.dir, "../../..");
const FIXTURES = join(ROOT, "fixtures");
const OUT = join(ROOT, "test-results/visual");

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:5180";
const prefixes = args.filter((a) => !a.startsWith("--"));
const check = args.includes("--check");
const updateBaseline = args.find((a) => /^--update-baseline(=lower)?$/.test(a));
const lowerOnly = updateBaseline === "--update-baseline=lower";
const allowIncrease = args.includes("--allow-increase");
const scale = Number(args.find((a) => a.startsWith("--scale="))?.slice(8) ?? 1);
if (scale !== 1 && (check || updateBaseline)) {
  throw new Error(
    "--scale renders at a different size than the baselines; drop --check/--update-baseline",
  );
}
const tolerance = Number(args.find((a) => a.startsWith("--tolerance="))?.slice(12) ?? 0.5);
const BASELINE = join(FIXTURES, `visual-baseline.${process.platform}.json`);
const checkBaselineArg = args.find((a) => a.startsWith("--baseline="))?.slice(11);
const CHECK_BASELINE = checkBaselineArg ? resolve(checkBaselineArg) : BASELINE;

interface Meta {
  width: number;
  height: number;
}

export interface Result {
  name: string;
  reference: { width: number; height: number };
  actual: { width: number; height: number };
  mismatch: number;
  ratio: number;
  /** Set when our side failed to render; the fixture then counts as a 100% mismatch. */
  error?: string;
}

const names: string[] = [];
for await (const path of new Glob("**/*.reference.html").scan(FIXTURES)) {
  const name = path.replace(/\.reference\.html$/, "");
  if (prefixes.length === 0 || prefixes.some((p) => name.startsWith(p))) names.push(name);
}
names.sort();

const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  deviceScaleFactor: scale,
  locale: "en-US",
  timezoneId: "UTC",
});

// The references were captured with classic 15px scrollbars (an overflowing code block reserves a
// horizontal track below its last line), while headless Chromium hides them (--hide-scrollbars) and
// macOS may overlay them. Give both sides the same fixed-size, fully styled scrollbar after every
// load: an init script doesn't reach the document setContent() reuses, and a styled track without
// a thumb rule paints nothing, so either way one side would draw a native thumb and the other not.
const SCROLLBAR_CSS = `
::-webkit-scrollbar { width: 15px; height: 15px; background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(29, 28, 29, 0.35); border: 4px solid transparent; border-radius: 8px; background-clip: padding-box; }
`;

// Slack's font CDN doesn't send CORS headers for a null origin; serve fonts through the harness.
const fontCache = new Map<string, Buffer>();
await context.route(/\.(woff2?|ttf|otf)(\?.*)?$/, async (route) => {
  const url = route.request().url();
  let body = fontCache.get(url);
  if (!body) {
    const res = await fetch(url);
    body = Buffer.from(await res.arrayBuffer());
    fontCache.set(url, body);
  }
  await route.fulfill({
    body,
    headers: { "content-type": "font/woff2", "access-control-allow-origin": "*" },
  });
});

// The reference loads remote images through Slack's slack-imgs.com proxy, which recompresses them,
// and picsum.photos returns a different random image per request. Serve the original bytes of each
// image, fetched once, to both sides so only rendering differences remain.
const imageCache = new Map<string, Promise<{ body: Buffer; type: string }>>();
await context.route(/slack-imgs\.com|picsum\.photos/, async (route) => {
  const url = route.request().url();
  const proxied = new URL(url).hostname === "slack-imgs.com";
  const key = proxied ? (new URL(url).searchParams.get("url") ?? url) : url;
  if (!imageCache.has(key)) {
    imageCache.set(
      key,
      fetch(key).then(async (res) => ({
        body: Buffer.from(await res.arrayBuffer()),
        type: res.headers.get("content-type") ?? "image/jpeg",
      })),
    );
  }
  const { body, type } = await (imageCache.get(key) as Promise<{ body: Buffer; type: string }>);
  await route.fulfill({
    body,
    headers: { "content-type": type, "access-control-allow-origin": "*" },
  });
});

/**
 * How to reach each captured `@state`: `ours` clicks through our rendering the way the reference was
 * clicked through in Builder. `reference` restores what a DOM snapshot can't record, such as a
 * scroll offset.
 */
const STATES: Record<
  string,
  { ours: (page: Page) => Promise<void>; reference?: (page: Page) => Promise<void> }
> = {
  "catalog/agents/plan@expanded": { ours: (p) => p.click(".sbk-plan__pill") },
  "catalog/agents/plan-error@expanded": { ours: (p) => p.click(".sbk-plan__pill") },
  "catalog/agents/plan@tasks-collapsed": {
    ours: async (p) => {
      await p.click(".sbk-plan__pill");
      for (const header of await p.locator("button.sbk-plan__task-header").all()) {
        await header.click();
      }
    },
  },
  "catalog/agents/task-card@expanded": { ours: (p) => p.click(".sbk-task-card__pill") },
  "catalog/container/collapsible@collapsed": {
    ours: (p) => p.click(".sbk-container__header--button"),
  },
  "catalog/image/title@hidden": { ours: (p) => p.click(".sbk-image__toggle") },
  "catalog/image/no-title@hidden": { ours: (p) => p.click(".sbk-image__toggle") },
  "catalog/table/numeric-sort-data-table@sort-asc": {
    ours: async (p) => {
      await p.getByRole("button", { name: "Amount" }).click();
      await p.getByRole("menuitemradio", { name: "Ascending" }).click();
    },
  },
  "catalog/table/paginated-data-table@page-2": {
    ours: (p) => p.getByRole("button", { name: "Next page" }).click(),
  },
  // One press of Slack's right arrow scrolls the gallery by a card and its gap: 356px.
  "catalog/card-and-carousel/carousel@scrolled": {
    ours: (p) => p.getByRole("button", { name: "Scroll right" }).click(),
    reference: (p) =>
      p.evaluate(() => {
        const wrapper = document.querySelector(".p-gallery_scroller__wrapper");
        if (wrapper) wrapper.scrollLeft = 356;
      }),
  },
};

/** Lets transitions and smooth scrolling started by a state's clicks finish before the screenshot. */
async function afterInteraction(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true })),
      ),
    );
  });
}

async function shot(page: Page, selector: string): Promise<PNG> {
  const el = page.locator(selector).first();
  return PNG.sync.read(await el.screenshot({ animations: "disabled" }));
}

function pad(png: PNG, width: number, height: number): PNG {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height, fill: true });
  out.data.fill(255);
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

// A snapshot only records the fonts Slack had loaded by then, and a few were taken before Lato
// Black arrived, so their bold sender names fall back to a faux bold. Pool every snapshot's faces
// (one per family/weight/style) and give each page the full set.
const faces = new Map<string, string>();
for await (const path of new Glob("**/*.reference.html").scan(FIXTURES)) {
  const html = await Bun.file(join(FIXTURES, path)).text();
  for (const face of html.match(/@font-face \{[^}]*\}/g) ?? []) {
    const key = face.replace(/src:[^;]*;?/, "");
    if (!faces.has(key)) faces.set(key, face);
  }
}
const fontFaces = [...faces.values()].join("\n");

const results: Result[] = [];
const page = await context.newPage();

for (const name of names) {
  const html = await Bun.file(join(FIXTURES, `${name}.reference.html`)).text();
  const meta = JSON.parse(
    html.match(/<script type="application\/json" id="sbk-reference-meta">(.*?)<\/script>/s)?.[1] ??
      "{}",
  ) as Meta;
  const icon = html.match(
    /<img[^>]*class="(?:p-bkb_preview__app_icon|p-bkb_preview_modal__title_icon)"[^>]*src="([^"]+)"/,
  )?.[1];

  await page.setContent(html, { waitUntil: "load" });
  await page.addStyleTag({ content: fontFaces + SCROLLBAR_CSS });
  await settle(page);
  const state = STATES[name];
  if (name.includes("@") && !state)
    console.warn(`  no STATES entry for ${name}; comparing its initial state`);
  if (state?.reference) await state.reference(page);
  const reference = await shot(page, "#sbk-reference > *");

  const url = new URL(base);
  url.searchParams.set("render", name.split("@")[0] ?? name);
  url.searchParams.set("width", String(meta.width));
  if (icon) url.searchParams.set("icon", icon.replace(/&amp;/g, "&"));
  const errors: string[] = [];
  const onError = (err: Error) => errors.push(err.message);
  page.on("pageerror", onError);
  let actual: PNG;
  try {
    await page.goto(url.href, { waitUntil: "load" });
    await page.addStyleTag({ content: fontFaces + SCROLLBAR_CSS });
    await page.waitForSelector("#sbk-render > *", { timeout: 10_000 });
    await settle(page);
    if (state) {
      await state.ours(page);
      await afterInteraction(page);
    }
    actual = await shot(page, "#sbk-render > *");
  } catch (err) {
    const error = errors[0] ?? (err as Error).message.split("\n")[0];
    results.push({
      name,
      reference: { width: reference.width, height: reference.height },
      actual: { width: 0, height: 0 },
      mismatch: reference.width * reference.height,
      ratio: 1,
      error,
    });
    console.log(`  FAIL   ${name}  ${error}`);
    continue;
  } finally {
    page.off("pageerror", onError);
  }

  const width = Math.max(reference.width, actual.width);
  const height = Math.max(reference.height, actual.height);
  const a = pad(reference, width, height);
  const b = pad(actual, width, height);
  const diff = new PNG({ width, height });
  const mismatch = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });

  const file = (kind: string) => join(OUT, `${name}.${kind}.png`);
  await mkdir(dirname(file("x")), { recursive: true });
  await writeFile(file("reference"), PNG.sync.write(a));
  await writeFile(file("actual"), PNG.sync.write(b));
  await writeFile(file("diff"), PNG.sync.write(diff));
  await writeFile(file("compare"), PNG.sync.write(sideBySide([a, b, diff])));

  const result: Result = {
    name,
    reference: { width: reference.width, height: reference.height },
    actual: { width: actual.width, height: actual.height },
    mismatch,
    ratio: mismatch / (width * height),
  };
  results.push(result);
  console.log(
    `${(result.ratio * 100).toFixed(2).padStart(6)}%  ${name}  ref ${reference.width}x${reference.height}  ours ${actual.width}x${actual.height}`,
  );
}

await browser.close();

// Filtered runs are for iterating on a few fixtures; only a full run rewrites the report.
if (prefixes.length === 0) {
  await writeFile(join(OUT, "report.json"), JSON.stringify(results, null, 2));
  await writeFile(join(OUT, "index.html"), report(results));
}
const mean = results.reduce((s, r) => s + r.ratio, 0) / Math.max(results.length, 1);
console.log(`\n${results.length} fixtures, mean mismatch ${(mean * 100).toFixed(2)}%`);
if (prefixes.length === 0) console.log(`report: ${join(OUT, "index.html")}`);

const percent = (r: Result) => Math.round(r.ratio * 10_000) / 100;
const readBaseline = async (file: string): Promise<Record<string, number>> =>
  existsSync(file) ? await Bun.file(file).json() : {};

if (updateBaseline) {
  // A filtered run only updates the fixtures it ran, and only a full run drops removed fixtures.
  const before = await readBaseline(BASELINE);
  const next = prefixes.length === 0 && !lowerOnly ? {} : { ...before };
  for (const r of results) {
    if (r.error) continue;
    const previous = before[r.name];
    if (lowerOnly && previous !== undefined && percent(r) >= previous - tolerance) continue;
    next[r.name] = percent(r);
  }
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`baseline: ${BASELINE}`);
}

if (check) {
  if (!existsSync(CHECK_BASELINE)) {
    console.log(`\nNo baseline at ${CHECK_BASELINE}; run with --update-baseline to create one.`);
  } else {
    const baseline = await readBaseline(CHECK_BASELINE);
    const failures: string[] = [];
    const increased: string[] = [];
    const improved: string[] = [];
    const unrecorded: string[] = [];
    for (const r of results) {
      const before = baseline[r.name];
      if (r.error) failures.push(`${r.name}: render failed: ${r.error}`);
      else if (before === undefined) unrecorded.push(`${r.name}: ${percent(r).toFixed(2)}%`);
      else if (percent(r) > before + tolerance) {
        const line = `${r.name}: ${percent(r).toFixed(2)}% (baseline ${before.toFixed(2)}%)`;
        (allowIncrease ? increased : failures).push(line);
      } else if (percent(r) < before - tolerance) improved.push(r.name);
    }
    if (unrecorded.length > 0) {
      console.log(`\nNo baseline entry yet:\n  ${unrecorded.join("\n  ")}`);
    }
    if (improved.length > 0) {
      console.log(`\nImproved beyond tolerance:\n  ${improved.join("\n  ")}`);
    }
    if (increased.length > 0) {
      console.log(`\nAllowed to regress:\n  ${increased.join("\n  ")}`);
    }
    if (failures.length > 0) {
      console.error(
        `\nVisual regressions (tolerance ${tolerance} points):\n  ${failures.join("\n  ")}`,
      );
      process.exit(1);
    }
    console.log(`\nNo visual regressions (tolerance ${tolerance} points).`);
  }
}

/** Builder | ours | diff, separated by grey bars; the quickest way to eyeball a fixture. */
function sideBySide(images: PNG[]): PNG {
  const gap = 8;
  const width = images.reduce((w, img) => w + img.width, gap * (images.length - 1));
  const height = Math.max(...images.map((img) => img.height));
  const out = new PNG({ width, height, fill: true });
  out.data.fill(180);
  let x = 0;
  for (const img of images) {
    PNG.bitblt(img, out, 0, 0, img.width, img.height, x, 0);
    x += img.width + gap;
  }
  return out;
}

function report(rows: Result[]): string {
  const sorted = [...rows].sort((x, y) => y.ratio - x.ratio);
  return `<!doctype html><meta charset="utf-8"><title>Visual comparison</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}td{padding:8px;vertical-align:top;border-top:1px solid #ddd}img{max-width:360px;border:1px solid #eee}</style>
<h1>Block Kit Builder vs @nkootstra/block-kit</h1>
<table><tr><th>Fixture</th><th>Mismatch</th><th>Builder</th><th>Ours</th><th>Diff</th></tr>
${sorted
  .map(
    (r) =>
      `<tr><td>${r.name}</td><td>${r.error ? `render failed: ${r.error}` : `${(r.ratio * 100).toFixed(2)}%`}</td><td><img src="${r.name}.reference.png"></td><td><img src="${r.name}.actual.png"></td><td><img src="${r.name}.diff.png"></td></tr>`,
  )
  .join("\n")}
</table>`;
}
