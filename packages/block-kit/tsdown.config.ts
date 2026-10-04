import { writeFile } from "node:fs/promises";
import { defineConfig } from "tsdown";
import { collectCss, minifyCss } from "./build/css.ts";

/** Inlines the `@import`s into one minified stylesheet, with a source map back to src/. */
async function bundleCss(entry: string, out: string): Promise<void> {
  const { code, map } = minifyCss(await collectCss(entry), "dist");
  await writeFile(out, `${code}\n/*# sourceMappingURL=styles.css.map */\n`);
  await writeFile(`${out}.map`, JSON.stringify(map));
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    mrkdwn: "src/parser/index.ts",
    transport: "src/interactivity/transport.ts",
    server: "src/interactivity/index.ts",
    "web-api": "src/web-api/index.ts",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
  // Components use hooks and context, so React Server Components need them marked as client
  // code. The parser, relay and Web API entries stay importable from server code.
  banner: ({ fileName }) => (fileName === "index.js" ? '"use client";' : undefined),
  async onSuccess() {
    await bundleCss("src/styles.css", "dist/styles.css");
  },
});
