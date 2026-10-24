// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// Moving a frozen popover with the anchor a pinned placeholder bar moved.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Browser, chromium, type Page } from "playwright";
import { followResizedBars } from "./followBars";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
afterAll(() => browser.close());

const bar = (ref: string, live?: number) =>
  `<span data-ref="${ref}" style="display:inline-block;width:120px;height:8px"${live ? ` data-sbk-live-width="${live}"` : ""}></span>`;
const tooltip = (left: number, top: number) =>
  `<div data-sbk-layer="popover" style="position:absolute;left:${left}px;top:${top}px;width:100px;height:20px"></div>`;

async function layerAfter(body: string, anchor: string | undefined) {
  await page.setContent(
    `<body style="margin:0;font:15px/20px sans-serif"><div id="sbk-reference" style="position:relative;width:300px">${body}</div></body>`,
  );
  const moved = await page.evaluate(followResizedBars, anchor);
  const box = await page.$eval('[data-sbk-layer="popover"]', (el) => [
    (el as HTMLElement).style.left,
    (el as HTMLElement).style.top,
  ]);
  return { moved, box };
}

describe("followResizedBars", () => {
  it("moves the anchor's tooltip by as far as pinning the bars moved the anchor", async () => {
    // Live, the first bar was 160px wide and the hovered bar sat 40px further right; Slack centred
    // the tooltip over it there. At 120px the tooltip follows it 40px left.
    const { moved, box } = await layerAfter(
      `<p style="margin:0">${bar("3", 160)} ${bar("4")}</p>${tooltip(200, 0)}`,
      "4",
    );
    expect(moved).toEqual({ dx: -40, dy: 0 });
    expect(box).toEqual(["160px", "0px"]);
  });

  it("follows the anchor onto another line, and a resized anchor by its centre", async () => {
    // Live, the hovered 160px bar didn't fit after the first and wrapped onto the second line;
    // pinned at 120px it fits on the first, 20px further right than where the wrapped one's centre was.
    const { moved, box } = await layerAfter(
      `<p style="margin:0">a ${bar("3", 160)} ${bar("4", 160)} see</p>${tooltip(30, 20)}`,
      "4",
    );
    expect(moved?.dy).toBe(-20);
    expect(box[1]).toBe("0px");
    expect(moved!.dx).toBeGreaterThan(100);
  });

  it("pads the page as snapshot.js would have for a layer moved above or left of the message", async () => {
    // Moved up a line, the tooltip sticks out 4px above the message, as snapshot.js pads for one
    // captured there; without it, the reference's crop starts 4px lower than ours.
    await layerAfter(
      `<p style="margin:0">a ${bar("3", 160)} ${bar("4", 160)} see</p>${tooltip(30, 16)}`,
      "4",
    );
    const padding = await page.evaluate(() => [
      getComputedStyle(document.body).paddingTop,
      getComputedStyle(document.body).paddingLeft,
    ]);
    expect(padding).toEqual(["4px", "0px"]);
  });

  it("leaves the layers alone when no bar was resized or nothing names the anchor", async () => {
    expect((await layerAfter(`<p>${bar("3")} ${bar("4")}</p>${tooltip(200, 0)}`, "4")).moved).toBe(
      null,
    );
    expect(
      (await layerAfter(`<p>${bar("3", 160)} ${bar("4")}</p>${tooltip(200, 0)}`, undefined)).moved,
    ).toBe(null);
  });
});
