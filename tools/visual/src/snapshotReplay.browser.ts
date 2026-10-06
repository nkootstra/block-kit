// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// A Builder-free check of snapshot.js: our own rendering of every fixture stands in for Slack's
// preview (real flex, grid and table layouts, fonts, images that fail to load). Each is snapshotted
// the way the capture loop does it, replayed, and every element must land where it did live.
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { join } from "node:path";
import type { Page } from "playwright";
import { createHarness, type Harness, type Mount, settle } from "./interaction/harness";
import { readPayloads } from "./lock";

setDefaultTimeout(30_000);

const SNAPSHOT = await Bun.file(join(import.meta.dir, "snapshot.js")).text();
const payloads = [...(await readPayloads())].toSorted(([a], [b]) => a.localeCompare(b));

let harness: Harness;
beforeAll(async () => {
  harness = await createHarness("chromium");
});
afterAll(() => harness?.close());

function toMount(json: unknown): Mount {
  if (Array.isArray(json)) return { blocks: json };
  const payload = json as { type?: string; blocks?: unknown[] };
  if (payload.type === "modal" || payload.type === "home")
    return { view: payload as Mount["view"] };
  return { blocks: payload.blocks ?? [] };
}

interface Box {
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every rendered element under the preview root, in document order, relative to it. */
function boxes(): Box[] {
  const root = document.querySelector(".p-bkb_preview__message")!;
  const origin = root.getBoundingClientRect();
  // Only elements with a layout box: a path inside an SVG with `display: none` still computes
  // `display: inline` (display isn't inherited), but isn't laid out, and the snapshot drops it.
  return [...root.querySelectorAll("*")]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const path: string[] = [];
      for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
        const cls = typeof e.className === "string" ? e.className.split(" ")[0] : "";
        path.unshift(cls ? `${e.localName}.${cls}` : e.localName);
      }
      return {
        path: path.slice(-3).join(" > "),
        x: r.x - origin.x,
        y: r.y - origin.y,
        width: r.width,
        height: r.height,
      };
    });
}

/** Snapshots the page with snapshot.js and replaces it with the replay. */
async function snapshotAndReplay(page: Page): Promise<void> {
  await page.addScriptTag({ content: `window.sbkSnapshot = ${SNAPSHOT};` });
  const html = await page.evaluate(() =>
    (window as unknown as { sbkSnapshot: (win: Window) => Promise<string> }).sbkSnapshot(window),
  );
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

describe("snapshot.js replays every fixture where it was laid out", () => {
  for (const [name, json] of payloads) {
    it(name, async () => {
      const page = await harness.open(toMount(json));
      await settle(page);
      await page.evaluate(() => {
        document.getElementById("sbk-render")!.classList.add("p-bkb_preview__message");
        // A looping spinner rotates its icon, whose bounding box changes size frame by frame:
        // hold every animation at its start so the live measure and the snapshot see one frame.
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = 0;
        }
      });
      const live = await page.evaluate(boxes);
      await snapshotAndReplay(page);
      const replayed = await page.evaluate(boxes);
      await harness.closePages();

      expect(replayed.length).toBe(live.length);
      // Within half a pixel, the text check's tolerance: a replayed box can snap to a different
      // pixel edge (a 1px divider's half-pixel margin) without anything having moved.
      const moved = live
        .map((box, i) => ({ live: box, replayed: replayed[i]! }))
        .filter(({ live: a, replayed: b }) =>
          (["x", "y", "width", "height"] as const).some((k) => Math.abs(a[k] - b[k]) > 0.5),
        );
      expect(moved.slice(0, 2)).toEqual([]);
    });
  }
});
