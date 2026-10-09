/**
 * Pixel-compares our rendering of every fixture against its Block Kit Builder reference snapshot.
 * Needs the playground dev server (`bun run --cwd apps/playground dev`).
 *
 *   bun tools/visual/src/compare.ts [fixture-prefix...] [--base=http://localhost:5180]
 *     [--check [--tolerance=0.5] [--baseline=<file>] [--text-baseline=<file>] [--allow-increase]]
 *     [--update-baseline[=lower]] [--scale=2]
 *
 * A reference named `<fixture>@<state>` was captured after interacting with Slack's preview (a plan
 * expanded, a table sorted, a select opened); states.ts replays the same interaction on our
 * rendering first. `+dark` references render ours in the dark theme and `+mobile` ones at the
 * Builder's mobile width (names.ts). A reference with an open popover (`@open`) compares the message
 * and the popover together, cropped to one box relative to the message on both sides (layout.ts);
 * one with a dialog (`@confirm`, `@dialog`) compares the dialog on its own.
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
 *
 * Every fixture also gets a text-run check (textRuns.ts): its text runs are matched with the
 * reference's and compared by position, width, font and painted colour, which the pixel diff is
 * too coarse to see. fixtures/text-baseline.<platform>.json records each fixture's findings
 * (`<property>|<text>|<occurrence>`). --check fails on any finding the baseline doesn't list and
 * reports the ones that disappeared; --update-baseline=lower only drops resolved findings (and adds
 * new fixtures), --update-baseline rewrites them. --text-baseline compares against another file.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Glob } from "bun";
import pixelmatch from "pixelmatch";
import { chromium, type Page } from "playwright";
import { PNG } from "pngjs";
import { collectTextRuns } from "./collectTextRuns";
import { SLACK_FILE_PLACEHOLDER } from "./redact";
import { type Box, cropBox, type Layer, roomFor } from "./layout";
import { pad, parseRgb } from "./pad";
import { parseReferenceName } from "./names";
import { type Image, loadImage, routeSamples } from "./samples";
import { stateFor } from "./states";
import {
  checkTextBaseline,
  compareTextRuns,
  type TextBaseline,
  type TextRun,
  type TextRunReport,
  updateTextBaseline,
} from "./textRuns";

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
const TEXT_BASELINE = join(FIXTURES, `text-baseline.${process.platform}.json`);
const checkTextBaselineArg = args.find((a) => a.startsWith("--text-baseline="))?.slice(16);
const CHECK_TEXT_BASELINE = checkTextBaselineArg ? resolve(checkTextBaselineArg) : TEXT_BASELINE;

interface Meta {
  width: number;
  height: number;
  /** Open popovers and dialogs frozen with the preview (snapshot.js); absent in older captures. */
  layers?: Layer[];
}

/** Where our open menus and dialogs render: portalled to <body>, outside #sbk-render. */
const OUR_POPOVERS = ".sbk-popover > *";
const OUR_DIALOGS = ".sbk-confirm, .sbk-select-dialog";

export interface Result {
  name: string;
  reference: { width: number; height: number };
  actual: { width: number; height: number };
  mismatch: number;
  ratio: number;
  /** Set when our side failed to render; the fixture then counts as a 100% mismatch. */
  error?: string;
  /** The text-run comparison; absent when our side failed to render. */
  text?: TextRunReport;
}

const names: string[] = [];
for await (const path of new Glob("**/*.reference.html").scan(FIXTURES)) {
  const name = path.replace(/\.reference\.html$/, "");
  if (prefixes.length === 0 || prefixes.some((p) => name.startsWith(p))) names.push(name);
}
names.sort();

// The references were laid out on macOS, which places glyphs at fractional advances, and inline
// those widths (a sender name is `width: 61.8594px`). Linux Chromium hints fonts by default, which
// rounds the advances so the same text no longer fits its box and wraps. Turning hinting off gives
// Linux macOS's metrics; without it every fixture in the Linux baseline was off by about 1%.
const browser = await chromium.launch({
  args: ["--font-render-hinting=none"],
  ignoreDefaultArgs: ["--hide-scrollbars"],
});
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
//
// A chart's scroller is the exception: Slack leaves it the platform's scrollbar, which the
// references' macOS captures overlaid, taking no space, so the snapshot froze the scroller at its
// card's height. Under a 15px track that froze height overflows and draws a second scrollbar. Both
// sides' chart scrollers (Slack's scrollContainer, our .sbk-dataviz-scroll) get the overlay's
// footprint instead: none.
const SCROLLBAR_CSS = `
::-webkit-scrollbar { width: 15px; height: 15px; background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(29, 28, 29, 0.35); border: 4px solid transparent; border-radius: 8px; background-clip: padding-box; }
[class*="scrollContainer__"]::-webkit-scrollbar, .sbk-dataviz-scroll::-webkit-scrollbar { width: 0; height: 0; }
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
// image, loaded once, to both sides so only rendering differences remain. Our samples
// (cdn.block-kit.dev/samples/, which every fixture's images are) come from their committed copies
// in fixtures/assets/samples/, also behind the proxy, so the comparison needs no network for them.
const imageCache = new Map<string, Promise<Image | undefined>>();
await context.route(/slack-imgs\.com|picsum\.photos/, async (route) => {
  const url = route.request().url();
  const proxied = new URL(url).hostname === "slack-imgs.com";
  const key = proxied ? (new URL(url).searchParams.get("url") ?? url) : url;
  if (!imageCache.has(key)) imageCache.set(key, loadImage(key));
  const image = await imageCache.get(key);
  if (!image) return route.fulfill({ status: 404, body: "" });
  await route.fulfill({
    body: Buffer.from(image.body),
    headers: { "content-type": image.type, "access-control-allow-origin": "*" },
  });
});
await routeSamples(context);

// A Slack file in a reference is redacted to SLACK_FILE_PLACEHOLDER (redact.ts), whichever of the
// file's URLs Slack used (the original or a thumbnail). Serve both sides the committed copy of the
// file the Builder showed, so they draw the same pixels; the playground's `slackFile` resolver
// returns the same placeholder URL.
const slackFile = await Bun.file(join(FIXTURES, "assets/slack-file.png")).arrayBuffer();
await context.route(SLACK_FILE_PLACEHOLDER, (route) =>
  route.fulfill({
    body: Buffer.from(slackFile),
    headers: { "content-type": "image/png", "access-control-allow-origin": "*" },
  }),
);

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

/** Each matched element's box, relative to the first match (the message). */
async function boxesOf(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    const origin = els[0]!.getBoundingClientRect();
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height };
    });
  }, selector);
}

/** A screenshot of `box`, relative to the first element `selector` matches. */
async function shotBox(page: Page, selector: string, box: Box): Promise<PNG> {
  const origin = await page.locator(selector).first().boundingBox();
  if (!origin) throw new Error(`no element matches ${selector}`);
  return PNG.sync.read(
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      clip: { x: origin.x + box.x, y: origin.y + box.y, width: box.width, height: box.height },
    }),
  );
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

  const parsed = parseReferenceName(name);
  const layers = meta.layers ?? [];
  const dialog = layers.some((l) => l.kind === "dialog");
  const popovers = layers.some((l) => l.kind === "popover");
  // The dark theme leaves parts of the message transparent; give our page the reference's
  // background so only the rendering differs.
  const pageBackground =
    parsed.theme === "dark"
      ? (html.match(/html,body\{margin:0;padding:0;background:([^}]+)\}/)?.[1] ?? "")
      : "";
  // What each side compares: the message, the message with its popovers, or a dialog alone.
  const refTarget = dialog ? '[data-sbk-layer="dialog"] > *' : "#sbk-reference > *";
  const ourTarget = dialog
    ? OUR_DIALOGS
    : popovers
      ? `#sbk-render > *, ${OUR_POPOVERS}`
      : "#sbk-render > *";

  await page.setContent(html, { waitUntil: "load" });
  await page.addStyleTag({ content: fontFaces + SCROLLBAR_CSS });
  await settle(page);
  const state = stateFor(name);
  if (parsed.interaction && !state)
    console.warn(`  no STATES entry for ${name}; comparing its initial state`);
  if (state?.reference) await state.reference(page);
  // A popover's crop needs both sides' boxes, so the reference is kept open on its own page.
  const refPage = popovers ? await context.newPage() : page;
  if (popovers) {
    await refPage.setContent(html, { waitUntil: "load" });
    await refPage.addStyleTag({ content: fontFaces + SCROLLBAR_CSS });
    await settle(refPage);
  }
  const refBoxes = popovers ? await boxesOf(refPage, refTarget) : [];
  let reference = popovers ? undefined : await shot(page, refTarget);
  const referenceRuns: TextRun[] = await refPage.evaluate(collectTextRuns, refTarget);

  const url = new URL(base);
  url.searchParams.set("render", parsed.fixture);
  url.searchParams.set("width", String(meta.width));
  if (parsed.theme === "dark") url.searchParams.set("theme", "dark");
  if (icon) url.searchParams.set("icon", icon.replace(/&amp;/g, "&"));
  const room = roomFor(layers);
  const errors: string[] = [];
  const onError = (err: Error) => errors.push(err.message);
  page.on("pageerror", onError);
  let actual: PNG;
  let ourRuns: TextRun[];
  try {
    await page.goto(url.href, { waitUntil: "load" });
    await page.addStyleTag({ content: fontFaces + SCROLLBAR_CSS });
    if (pageBackground)
      await page.addStyleTag({ content: `html,body{background:${pageBackground}}` });
    if (room.left || room.top)
      await page.addStyleTag({
        content: `#sbk-render{margin-left:${room.left}px;margin-top:${room.top}px}`,
      });
    await page.waitForSelector("#sbk-render > *", { timeout: 10_000 });
    await settle(page);
    if (state) {
      await state.ours(page, popovers ? refPage : undefined);
      await afterInteraction(page);
    }
    if (popovers) {
      const box = cropBox(refBoxes, await boxesOf(page, ourTarget));
      reference = await shotBox(refPage, refTarget, box);
      actual = await shotBox(page, ourTarget, box);
    } else {
      actual = await shot(page, ourTarget);
    }
    ourRuns = await page.evaluate(collectTextRuns, ourTarget);
  } catch (err) {
    const error = errors[0] ?? (err as Error).message.split("\n")[0];
    const failed = reference ?? { width: meta.width, height: meta.height };
    results.push({
      name,
      reference: { width: failed.width, height: failed.height },
      actual: { width: 0, height: 0 },
      mismatch: failed.width * failed.height,
      ratio: 1,
      error,
    });
    console.log(`  FAIL   ${name}  ${error}`);
    continue;
  } finally {
    page.off("pageerror", onError);
    if (refPage !== page) await refPage.close();
  }
  if (!reference) throw new Error(`${name}: no reference screenshot`);

  const width = Math.max(reference.width, actual.width);
  const height = Math.max(reference.height, actual.height);
  // Pad with the page's background: white for light references, the reference's own for dark.
  const background = parseRgb(pageBackground);
  const a = pad(reference, width, height, background);
  const b = pad(actual, width, height, background);
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
    text: compareTextRuns(referenceRuns, ourRuns),
  };
  results.push(result);
  const text = result.text as TextRunReport;
  console.log(
    `${(result.ratio * 100).toFixed(2).padStart(6)}%  ${name}  ref ${reference.width}x${reference.height}  ours ${actual.width}x${actual.height}  text ${text.matched}/${referenceRuns.length} matched, ${text.findings.length} flagged${text.motion.length > 0 ? `, ${text.motion.length} moving differently` : ""}`,
  );
  // A filtered run is for iterating on a few fixtures, so it lists what the text check flagged.
  if (prefixes.length > 0)
    for (const line of describeTextRuns(text)) console.log(`         ${line}`);
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
const readTextBaseline = async (file: string): Promise<TextBaseline> =>
  existsSync(file) ? await Bun.file(file).json() : {};
const textFindings: TextBaseline = Object.fromEntries(
  results.flatMap((r) => (r.text ? [[r.name, r.text.findings] as const] : [])),
);

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
  const nextText = updateTextBaseline(await readTextBaseline(TEXT_BASELINE), textFindings, {
    full: prefixes.length === 0,
    lowerOnly,
  });
  await writeFile(TEXT_BASELINE, `${JSON.stringify(nextText, null, 2)}\n`);
  console.log(`text baseline: ${TEXT_BASELINE}`);
}

if (check) {
  const failures: string[] = [];
  const increased: string[] = [];
  if (!existsSync(CHECK_BASELINE)) {
    console.log(`\nNo baseline at ${CHECK_BASELINE}; run with --update-baseline to create one.`);
  } else {
    const baseline = await readBaseline(CHECK_BASELINE);
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
  }
  if (!existsSync(CHECK_TEXT_BASELINE)) {
    console.log(
      `\nNo text baseline at ${CHECK_TEXT_BASELINE}; run with --update-baseline to create one.`,
    );
  } else {
    const text = checkTextBaseline(textFindings, await readTextBaseline(CHECK_TEXT_BASELINE));
    if (text.unrecorded.length > 0) {
      console.log(`\nNo text baseline entry yet:\n  ${text.unrecorded.join("\n  ")}`);
    }
    if (text.improved.length > 0) {
      console.log(`\nResolved text findings:\n  ${text.improved.join("\n  ")}`);
    }
    (allowIncrease ? increased : failures).push(...text.failures);
  }
  if (increased.length > 0) {
    console.log(`\nAllowed to regress:\n  ${increased.join("\n  ")}`);
  }
  if (failures.length > 0) {
    console.error(
      `\nVisual regressions (tolerance ${tolerance} points, none for text runs):\n  ${failures.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`\nNo visual regressions (tolerance ${tolerance} points, none for text runs).`);
}

/** One line per flagged text run, for reading a fixture's text-run results. */
function describeTextRuns(textReport: TextRunReport): string[] {
  return [
    ...textReport.differences.map(
      (d) => `${d.property} ${JSON.stringify(d.text)}: Slack ${d.reference}, ours ${d.ours}`,
    ),
    ...textReport.missing.map((r) => `only Slack ${JSON.stringify(r.text)}`),
    ...textReport.extra.map((r) => `only ours ${JSON.stringify(r.text)}`),
    // Reported only: motion never fails --check until the references carry it.
    ...textReport.motion.map(
      (m) => `motion ${JSON.stringify(m.text)}: Slack ${m.reference}, ours ${m.ours}`,
    ),
  ];
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
