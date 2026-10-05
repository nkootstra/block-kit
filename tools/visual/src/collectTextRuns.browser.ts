// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// What the text-run check reads from a laid-out page.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Browser, chromium, type Page } from "playwright";
import { collectTextRuns } from "./collectTextRuns";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
afterAll(() => browser.close());

async function runs(body: string) {
  await page.setContent(
    `<body style="margin:0;font:15px sans-serif"><div id="root">${body}</div></body>`,
  );
  return page.evaluate(collectTextRuns, "#root");
}

describe("collectTextRuns", () => {
  it("positions a run relative to the root and reads its font", async () => {
    const [run] = await runs(
      '<p style="margin:0;padding:8px 12px;font-size:13px;font-weight:700;font-style:italic">Hint</p>',
    );
    expect(run).toMatchObject({
      text: "Hint",
      x: 12,
      y: 8,
      fontSize: 13,
      fontWeight: 700,
      fontStyle: "italic",
    });
  });

  it("multiplies opacity down the tree", async () => {
    const [run] = await runs(
      '<div style="opacity:0.5"><span style="opacity:0.5;color:rgb(29, 28, 29)">Faded</span></div>',
    );
    expect(run?.opacity).toBe(0.25);
  });

  it("composites the backgrounds behind a run over the white page", async () => {
    const [run] = await runs(
      '<div style="background:rgb(0, 0, 0)"><span style="background:rgba(255, 255, 255, 0.5)">On grey</span></div>',
    );
    expect(run?.background).toBe("rgb(128, 128, 128)");
  });

  it("measures a run from its first visible character to its last, not its spaces", async () => {
    // Slack's dispatch hint is `<i>icon</i> Press…` (the space in the text node); React renders
    // `<i>icon</i>{" "}Press…` as a separate space node. The glyphs sit in the same place.
    const icon = '<i style="display:inline-block;width:13px"></i>';
    const [inNode] = await runs(`${icon}<span> Press enter </span>`);
    const [separate] = await runs(`${icon} <span>Press enter</span> `);
    // Shaping across separate nodes can land on a neighbouring 1/64px layout unit.
    expect(inNode?.x).toBeCloseTo(separate?.x ?? Number.NaN, 1);
    expect(inNode?.width).toBeCloseTo(separate?.width ?? Number.NaN, 1);
  });

  it("skips whitespace, hidden and collapsed text", async () => {
    const result = await runs(
      '<span> </span><span style="visibility:hidden">Hidden</span><span style="display:none">Gone</span><span>Shown</span>',
    );
    expect(result.map((r) => r.text)).toEqual(["Shown"]);
  });
});
