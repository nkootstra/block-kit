import { describe, expect, it } from "bun:test";
import { inlineFonts } from "./fonts";

const woff2 = Bun.resolveSync(
  "@fontsource/lato/files/lato-latin-400-normal.woff2",
  import.meta.dir,
);

describe("inlineFonts", () => {
  it("embeds the font files a stylesheet points to, so a page without a server can load them", async () => {
    const css = await inlineFonts(`@font-face { src: url("${woff2}") format("woff2"); }`);
    const bytes = Buffer.from(await Bun.file(woff2).arrayBuffer()).toString("base64");
    expect(css).toBe(`@font-face { src: url("data:font/woff2;base64,${bytes}") format("woff2"); }`);
  });

  it("leaves URLs that aren't font files alone", async () => {
    const css = '.a { background: url("https://example.com/a.png"); }';
    expect(await inlineFonts(css)).toBe(css);
  });
});
