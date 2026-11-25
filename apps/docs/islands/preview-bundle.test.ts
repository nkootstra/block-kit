import { describe, expect, it } from "bun:test";

/**
 * Every docs page with a preview downloads Preview.tsx's bundle. The JSON editor (`@pierre/diffs`,
 * with its syntax highlighter) is most of that weight, and only readers who open a preview's JSON
 * tab or interact with an action log need it, so components/PreviewCode.tsx holds it and Preview.tsx loads it
 * lazily. A static import from Preview.tsx would put it back in every page's bundle.
 */
describe("the preview island's bundle", () => {
  it("loads the code views lazily instead of importing @pierre/diffs", async () => {
    const source = await Bun.file(new URL("./Preview.tsx", import.meta.url)).text();
    // `import type` is erased from the bundle, so only value imports count.
    const staticImports = [...source.matchAll(/^import\s(?!type\s)[^;]*?from\s+"([^"]+)"/gms)].map(
      ([, specifier]) => specifier,
    );
    expect(staticImports.filter((specifier) => specifier?.startsWith("@pierre/diffs"))).toEqual([]);
    expect(staticImports).not.toContain("../components/PreviewCode");
    expect(source).toContain('import("../components/PreviewCode")');
  });
});
