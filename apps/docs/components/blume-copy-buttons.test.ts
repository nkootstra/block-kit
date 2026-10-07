import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

/**
 * Blume's page script gives every `.prose pre` a "Copy code" button when the page loads. A
 * Preview island renders Block Kit, whose preformatted blocks are `<pre>`s, and hydrates later
 * (client:visible), so the button React didn't render made it throw away the server HTML (React
 * error #418 on /blocks/rich-text). `patches/blume@*.patch` makes the script skip any `<pre>`
 * inside an island; this fails if a Blume upgrade drops that patch.
 */
describe("Blume's copy buttons", () => {
  it("leave the <pre> elements inside islands alone", async () => {
    const blume = dirname(Bun.resolveSync("blume/package.json", import.meta.dir));
    const layout = await Bun.file(join(blume, "src/components/layout/RootLayout.astro")).text();
    const loop = layout.slice(
      layout.indexOf('for (const pre of document.querySelectorAll(".prose pre"))'),
    );
    expect(loop.slice(0, 600)).toContain('pre.closest("astro-island")');
  });
});
