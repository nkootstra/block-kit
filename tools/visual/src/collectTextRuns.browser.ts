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
  it("reads every root the selector matches, positioned relative to the first", async () => {
    // An open menu is portalled away from the message; its text counts too, where it sits
    // relative to the message.
    await page.setContent(
      `<body style="margin:0;font:15px sans-serif"><div id="root" style="margin:40px 0 0 100px"><p style="margin:0">Field</p></div><div class="layer" style="position:absolute;left:30px;top:80px">Option</div></body>`,
    );
    const found = await page.evaluate(collectTextRuns, "#root, .layer");
    expect(found.map((r) => [r.text, r.x, r.y])).toEqual([
      ["Field", 0, 0],
      ["Option", -70, 40],
    ]);
  });

  // Slack shows some values in an <input> (the datetime picker's "January 1st, 2026") where we
  // draw text, and the other way round; both read as the same run, where the text paints.
  it("reads an input's value as a run, where the same text in the same box would sit", async () => {
    const box =
      "box-sizing:border-box;width:300px;height:36px;padding:0 8px;border:1px solid #888;font:15px sans-serif";
    const [fromInput] = await runs(`<input value="January 1st, 2026" style="${box}">`);
    const [fromText] = await runs(
      `<div style="${box};display:flex;align-items:center">January 1st, 2026</div>`,
    );
    expect(fromInput?.text).toBe("January 1st, 2026");
    const near = (a = 0, b = 0) => Math.abs(a - b) <= 0.5;
    expect([
      near(fromInput?.x, fromText?.x),
      near(fromInput?.y, fromText?.y),
      near(fromInput?.width, fromText?.width),
    ]).toEqual([true, true, true]);
  });

  it("keeps a field's value in document order among the text runs", async () => {
    const found = await runs('<p>Before</p><input value="Middle"><p>After</p>');
    expect(found.map((r) => r.text)).toEqual(["Before", "Middle", "After"]);
  });

  it("reads nothing from an empty input or its placeholder", async () => {
    expect(await runs('<input value="" placeholder="Select a date">')).toEqual([]);
  });

  // A typeable select keeps its value in the input but paints it in a layer over the field, with
  // the input's own text transparent (Slack's c-select_input__content, our *__content): only the
  // layer counts.
  it("reads nothing from an input whose text is transparent", async () => {
    expect(await runs('<input value="1:37 PM" style="color:rgba(29, 28, 29, 0)">')).toEqual([]);
  });

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

  // A time list scrolls its options in a box with overflow: auto; the ones scrolled out of it
  // aren't on screen, and where each side happens to scroll says nothing about how they render.
  it("skips text an overflow ancestor scrolls out of view", async () => {
    const options = Array.from(
      { length: 10 },
      (_, i) => `<div style="height:20px">Option ${i}</div>`,
    );
    await page.setContent(
      `<body style="margin:0;font:15px sans-serif"><div id="root"><div id="list" style="height:50px;overflow:auto">${options.join("")}</div></div></body>`,
    );
    await page.evaluate(() => {
      document.getElementById("list")!.scrollTop = 70;
    });
    const found = await page.evaluate(collectTextRuns, "#root");
    // 70px down a 50px window: options 4 and 5 fit, 3 is cut by the top edge and still shows.
    expect(found.map((r) => r.text)).toEqual(["Option 3", "Option 4", "Option 5"]);
  });

  it("skips text clipped by an overflow: hidden ancestor, in either direction", async () => {
    const result = await runs(
      '<div style="height:20px;overflow:hidden"><p style="margin:0">Shown</p><p style="margin:40px 0 0">Below</p></div>' +
        '<div style="width:100px;overflow-x:hidden;white-space:nowrap"><span>Left</span><span style="margin-left:200px">Right</span></div>',
    );
    expect(result.map((r) => r.text)).toEqual(["Shown", "Left"]);
  });

  it("keeps text that overflows a box with overflow: visible", async () => {
    const result = await runs(
      '<div style="height:20px"><p style="margin:0">Shown</p><p style="margin:40px 0 0">Below</p></div>',
    );
    expect(result.map((r) => r.text)).toEqual(["Shown", "Below"]);
  });

  it("skips an input value its overflow ancestor clips", async () => {
    const result = await runs(
      '<div style="height:20px;overflow:hidden"><p style="margin:0">Shown</p><input value="Hidden value" style="margin-top:40px"></div>',
    );
    expect(result.map((r) => r.text)).toEqual(["Shown"]);
  });

  it("reads the motion of the nearest element that transitions or animates", async () => {
    const [inButton, outside] = await runs(
      '<button style="transition:opacity 150ms ease-out 20ms"><span>Go</span></button><p>Still</p>',
    );
    expect(inButton?.motion).toBe("transition opacity 0.15s ease-out 0.02s");
    expect(outside?.motion).toBe("");
  });

  it("leaves motion unknown on a reference captured before snapshots recorded it", async () => {
    await page.setContent(
      `<script type="application/json" id="sbk-reference-meta">{"width":400}</script><div id="root"><button data-ref="1">Go</button></div>`,
    );
    const [run] = await page.evaluate(collectTextRuns, "#root");
    expect(run?.motion).toBeUndefined();
  });
});
