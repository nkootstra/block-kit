import { describe, expect, it } from "bun:test";
import { PNG } from "pngjs";
import { imageSize } from "./placeholder";

describe("imageSize", () => {
  it("reads a PNG's size", () => {
    const png = PNG.sync.write(new PNG({ width: 300, height: 200 }));
    expect(imageSize(png)).toEqual({ width: 300, height: 200 });
  });

  it("reads a JPEG's size from its frame header", () => {
    // SOI, an APP0 segment, then SOF0: precision 8, height 200, width 300.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8,
      0x01, 0x2c, 0x03,
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 300, height: 200 });
  });

  it("knows no size for other formats", () => {
    expect(imageSize(new TextEncoder().encode("GIF89a\x2c\x01\xc8\x00"))).toBeUndefined();
  });
});
