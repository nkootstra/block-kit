import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { renderCard } from "./og";
import { description, headline } from "./site";

describe("renderCard", () => {
  test("renders a 1200x630 PNG", async () => {
    const png = await renderCard({
      headline,
      description,
      logoSvg: await readFile(new URL("../../public/icon.svg", import.meta.url), "utf8"),
    });
    // The PNG signature, then the IHDR chunk's width and height.
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
