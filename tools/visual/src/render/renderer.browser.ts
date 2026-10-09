// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import { createRenderer, type Renderer } from "./renderer";

const ROOT = resolve(import.meta.dir, "../../../..");
const fixture = (name: string) => Bun.file(join(ROOT, `fixtures/${name}.json`)).text();
const approval = await fixture("message/approval");

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createRenderer(join(ROOT, "packages/block-kit"));
});
afterAll(() => renderer.close());

describe("renderer", () => {
  it("renders a message 600px wide", async () => {
    const { width, height } = PNG.sync.read(await renderer.render(approval, "light"));
    expect(width).toBe(600);
    expect(height).toBeGreaterThan(100);
  });

  it("renders the same payload to the same bytes every time", async () => {
    const first = await renderer.render(approval, "light");
    const second = await renderer.render(approval, "light");
    expect(Buffer.compare(first, second)).toBe(0);
  });

  it("renders the dark theme on Slack's dark background", async () => {
    const png = PNG.sync.read(await renderer.render(approval, "dark"));
    // Bottom-right corner: below the last block and right of any text, so always background.
    const i = ((png.height - 2) * png.width + (png.width - 2)) * 4;
    expect([...png.data.subarray(i, i + 3)]).toEqual([0x1a, 0x1d, 0x21]);
  });

  it("keeps the light theme light on a system set to dark mode", async () => {
    const dark = await createRenderer(join(ROOT, "packages/block-kit"), {
      systemColorScheme: "dark",
    });
    try {
      const png = PNG.sync.read(await dark.render(approval, "light"));
      const i = ((png.height - 2) * png.width + (png.width - 2)) * 4;
      expect([...png.data.subarray(i, i + 3)]).toEqual([0xff, 0xff, 0xff]);
    } finally {
      await dark.close();
    }
  });

  it("gives two renderers the same remote images", async () => {
    const card = await fixture("catalog/card-and-carousel/card");
    const other = await createRenderer(join(ROOT, "packages/block-kit"));
    try {
      const first = await renderer.render(card, "light");
      const second = await other.render(card, "light");
      expect(Buffer.compare(first, second)).toBe(0);
    } finally {
      await other.close();
    }
  });

  describe("remote images", () => {
    // A solid red image of any size, so a render can show whether the real pixels got through.
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const [width, height] = new URL(req.url).pathname.slice(1).split("x").map(Number);
        const image = new PNG({ width, height });
        for (let i = 0; i < image.data.length; i += 4) image.data.set([255, 0, 0, 255], i);
        return new Response(new Uint8Array(PNG.sync.write(image)), {
          headers: { "content-type": "image/png" },
        });
      },
    });
    afterAll(() => server.stop());
    const imageBlock = (size: string) =>
      JSON.stringify([{ type: "image", image_url: `${server.url}${size}`, alt_text: "red" }]);

    it("never shows them: a placeholder takes their place", async () => {
      const png = PNG.sync.read(await renderer.render(imageBlock("200x100"), "light"));
      let red = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i]! > 200 && png.data[i + 1]! < 60 && png.data[i + 2]! < 60) red++;
      }
      expect(red).toBe(0);
    });

    it("shows emoji as themselves: the library draws them from a fixed set, not the payload", async () => {
      const tada = JSON.stringify([{ type: "section", text: { type: "mrkdwn", text: ":tada:" } }]);
      const png = PNG.sync.read(await renderer.render(tada, "light"));
      // Text is near-black and placeholders are gray: only the emoji has saturated colors.
      let colorful = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
        if (Math.max(r, g, b) - Math.min(r, g, b) > 100) colorful++;
      }
      expect(colorful).toBeGreaterThan(50);
    });

    it("keeps their size, so the layout is the same as with the real image", async () => {
      const wide = PNG.sync.read(await renderer.render(imageBlock("400x100"), "light"));
      const tall = PNG.sync.read(await renderer.render(imageBlock("100x400"), "light"));
      expect(tall.height - wide.height).toBeGreaterThan(200);
    });
  });
});
