import { describe, expect, it } from "bun:test";
import { PNG } from "pngjs";
import { diffPngs } from "./diff";

/** A solid image, optionally with a filled rectangle painted on it. */
function png(
  width: number,
  height: number,
  rgb: [number, number, number],
  rect?: { x: number; y: number; w: number; h: number; rgb: [number, number, number] },
): Buffer {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRect =
        rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const [r, g, b] = inRect ? rect.rgb : rgb;
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(image);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

describe("diffPngs", () => {
  it("finds no changes between identical renders", () => {
    expect(diffPngs(png(40, 30, WHITE), png(40, 30, WHITE)).changedPixels).toBe(0);
  });

  it("counts every pixel of a changed area", () => {
    const after = png(40, 30, WHITE, { x: 10, y: 10, w: 5, h: 4, rgb: BLACK });
    expect(diffPngs(png(40, 30, WHITE), after).changedPixels).toBe(20);
  });

  it("counts pixels only one render covers as changed, even when they match the background", () => {
    expect(diffPngs(png(40, 30, WHITE), png(40, 32, WHITE)).changedPixels).toBe(40 * 2);
  });

  it("doesn't count content that only moved down as changed", () => {
    // A 2px line inserted at row 5 pushes the black band at rows 20–24 down by 2px.
    const before = png(40, 30, WHITE, { x: 0, y: 20, w: 40, h: 5, rgb: BLACK });
    const after = png(40, 32, WHITE, { x: 0, y: 22, w: 40, h: 5, rgb: BLACK });
    const line = PNG.sync.read(after);
    for (let i = 5 * 40 * 4; i < 7 * 40 * 4; i += 4) line.data.set([128, 128, 128, 255], i);
    expect(diffPngs(before, PNG.sync.write(line)).changedPixels).toBe(2 * 40);
  });

  it("draws the changes over the after render, as wide as the wider render", () => {
    const { image } = diffPngs(png(40, 30, WHITE), png(36, 32, WHITE));
    const { width, height } = PNG.sync.read(image);
    expect({ width, height }).toEqual({ width: 40, height: 32 });
  });
});
