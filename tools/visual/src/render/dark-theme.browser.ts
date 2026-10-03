// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// How the library's dark theme looks, checked through real renders.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import { createRenderer, type Renderer } from "./renderer";

const ROOT = resolve(import.meta.dir, "../../../..");

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createRenderer(join(ROOT, "packages/block-kit"));
});
afterAll(() => renderer.close());

/** Share of a render's pixels that are near-white: light surfaces, or text on a dark one. */
async function lightShare(json: string): Promise<number> {
  const png = PNG.sync.read(await renderer.render(json, "dark"));
  let light = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i]! > 200 && png.data[i + 1]! > 200 && png.data[i + 2]! > 200) light++;
  }
  return light / (png.width * png.height);
}

describe("dark theme", () => {
  for (const color of ["green", "blue", "red", "yellow", "purple", "gray"]) {
    it(`gives a ${color} callout a dark background`, async () => {
      const callout = JSON.stringify([
        {
          type: "callout",
          background_color: color,
          child_blocks: [{ type: "section", text: { type: "plain_text", text: "Heads up" } }],
        },
      ]);
      expect(await lightShare(callout)).toBeLessThan(0.05);
    });
  }

  it("fills chart areas with dark tints", async () => {
    const chart = await Bun.file(
      join(ROOT, "fixtures/catalog/data-visualization/area-multi-series.json"),
    ).text();
    expect(await lightShare(chart)).toBeLessThan(0.05);
  });
});
