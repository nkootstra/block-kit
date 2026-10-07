import { describe, expect, it } from "bun:test";
import { PNG } from "pngjs";
import { pad, parseRgb } from "./pad";

/** A width x height PNG filled with one colour. */
function solid(width: number, height: number, [r, g, b]: [number, number, number]): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) png.data.set([r, g, b, 255], i * 4);
  return png;
}
const pixel = (png: PNG, x: number, y: number) => [
  ...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4),
];

describe("pad", () => {
  it("fills the added area white by default, as light references are", () => {
    const out = pad(solid(2, 1, [0, 0, 0]), 4, 1);
    expect(pixel(out, 3, 0)).toEqual([255, 255, 255, 255]);
  });

  // A dark reference's message is wider than ours by Slack's 36px gutter; padded white, that
  // strip counted as a mismatch on every dark comparison.
  it("fills the added area with the page background it's given", () => {
    const out = pad(solid(2, 1, [0, 0, 0]), 4, 2, [26, 29, 33]);
    expect([pixel(out, 0, 0), pixel(out, 3, 0), pixel(out, 1, 1)]).toEqual([
      [0, 0, 0, 255],
      [26, 29, 33, 255],
      [26, 29, 33, 255],
    ]);
  });
});

describe("parseRgb", () => {
  it("reads rgb() and rgba() colours and hex, and nothing else", () => {
    expect(parseRgb("rgb(26, 29, 33)")).toEqual([26, 29, 33]);
    expect(parseRgb("rgba(26, 29, 33, 1)")).toEqual([26, 29, 33]);
    expect(parseRgb("#fff")).toEqual([255, 255, 255]);
    expect(parseRgb("#1a1d21")).toEqual([26, 29, 33]);
    expect(parseRgb("")).toBeUndefined();
  });
});
