// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// snapshot.js freezes the Builder preview into a reference. These cases build small pages the way
// Slack lays them out, snapshot them, replay the snapshot and check it lays out like the original.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { createHarness, type Harness, settle } from "./interaction/harness";

const SNAPSHOT = await Bun.file(join(import.meta.dir, "snapshot.js")).text();
const ROOT = resolve(import.meta.dir, "../../..");

let browser: Browser;
let page: Page;
let harness: Harness;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  harness = await createHarness("chromium");
});
afterAll(async () => {
  await browser.close();
  await harness?.close();
});

interface Box {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every rendered element inside the preview, in document order, relative to it. */
function allBoxes(): Box[] {
  const root = document.querySelector(".p-bkb_preview__message")!;
  const origin = root.getBoundingClientRect();
  return [...root.querySelectorAll("*")]
    .filter((el) => !(el instanceof HTMLScriptElement || el instanceof HTMLStyleElement))
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.localName,
        x: r.x - origin.x,
        y: r.y - origin.y,
        width: r.width,
        height: r.height,
      };
    });
}

/** Within half a pixel: a replayed box can land on a neighbouring 1/64px layout unit. */
const sameBox = (a: Box, b: Box) =>
  a.tag === b.tag &&
  (["x", "y", "width", "height"] as const).every((k) => Math.abs(a[k] - b[k]) < 0.5);

/** Where each `[id]` element inside the preview sits relative to it, and how big it is. */
async function boxes() {
  return page.evaluate(() => {
    const root = document.querySelector(".p-bkb_preview__message")!.getBoundingClientRect();
    return Object.fromEntries(
      [...document.querySelectorAll(".p-bkb_preview__message [id]")].map((el) => {
        const r = el.getBoundingClientRect();
        return [el.id, { x: r.x - root.x, y: r.y - root.y, width: r.width, height: r.height }];
      }),
    );
  });
}

/** Runs snapshot.js on the page, as the capture loop does in the Builder. */
async function snapshot(target: Page): Promise<string> {
  await target.addScriptTag({ content: `window.sbkSnapshot = ${SNAPSHOT};` });
  return target.evaluate(() =>
    (window as unknown as { sbkSnapshot: (win: Window) => Promise<string> }).sbkSnapshot(window),
  );
}

/** Lays `body` out live, snapshots it, replays the snapshot, and returns both layouts. */
async function snapshotAndReplay(body: string) {
  await page.setContent(
    `<!doctype html><body style="margin:0;font:15px sans-serif"><div class="p-bkb_preview__message" style="width:400px">${body}</div></body>`,
  );
  const live = await boxes();
  const html = await snapshot(page);
  await page.setContent(html);
  return { live, replayed: await boxes() };
}

describe("snapshot.js", () => {
  it("keeps a content-sized label on one line when its width is a sub-pixel value", async () => {
    // Slack's input label is a flex item sized to its content. Its used width (100.0625px here)
    // serializes as "100.062px"; frozen at that, the second part no longer fits and wraps.
    const { live, replayed } = await snapshotAndReplay(
      `<div style="display:flex"><label id="label"><span id="name" style="display:inline-block;width:60.0625px"></span><span id="optional" style="display:inline-block;width:40px"></span></label></div>`,
    );
    expect(replayed.optional).toEqual(live.optional);
    expect(replayed.label).toEqual(live.label);
  });

  it("keeps an item on an implicit grid row where Slack draws it", async () => {
    // Slack's composer puts its footer on the row after the explicit grid (grid-row-start: -1).
    // The resolved track list includes that implicit row; frozen as an explicit row, it pushes
    // the footer one more row down.
    const { live, replayed } = await snapshotAndReplay(
      `<div id="grid" style="display:grid;grid-template-rows:auto auto"><div style="height:38px"></div><div style="height:38px"></div><div id="footer" style="grid-row-start:-1;height:40px"></div></div>`,
    );
    expect(replayed.footer).toEqual(live.footer);
    expect(replayed.grid).toEqual(live.grid);
  });

  // Our own rendering stands in for the Builder: real flex and grid layouts, fonts, images that
  // fail to load. Every element of the replay must land where it did live.
  for (const name of [
    "extra/modal/form",
    "extra/modal/rich-and-file",
    "catalog/card-and-carousel/card",
    "catalog/table/paginated-data-table",
    "extra/rich-text/mentions-and-styles",
  ]) {
    it(`replays ${name} with every box where it was`, async () => {
      const json = JSON.parse(await Bun.file(join(ROOT, `fixtures/${name}.json`)).text());
      const mount = Array.isArray(json)
        ? { blocks: json }
        : json.type === "modal" || json.type === "home"
          ? { view: json }
          : json;
      const live = await harness.open(mount);
      await settle(live);
      await live.evaluate(() => {
        const root = document.getElementById("root")!;
        root.classList.add("p-bkb_preview__message");
        root.style.width = "520px";
      });
      const before = await live.evaluate(allBoxes);
      const html = await snapshot(live);
      await live.setContent(html);
      await live.evaluate(() => document.fonts.ready.then(() => undefined));
      const after = await live.evaluate(allBoxes);
      expect(after.length).toBe(before.length);
      const moved = before.filter((box, i) => !sameBox(box, after[i]!));
      expect(moved.slice(0, 3)).toEqual([]);
    });
  }

  it("keeps a size the page sets explicitly", async () => {
    const { live, replayed } = await snapshotAndReplay(
      `<div id="fixed" style="width:123.5px;height:45px"></div><div id="track" style="display:grid;grid-template-columns:100px 1fr"><div id="cell" style="height:20px"></div></div>`,
    );
    expect(replayed.fixed).toEqual(live.fixed);
    expect(replayed.cell).toEqual(live.cell);
  });
});
