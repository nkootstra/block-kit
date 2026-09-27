import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineConfig } from "tsdown";

/** Inlines `@import "./x.css"` recursively so consumers get one stylesheet. */
async function bundleCss(file: string): Promise<string> {
  const css = await readFile(file, "utf8");
  const parts = await Promise.all(
    css.split("\n").map((line) => {
      const match = /^@import "(\.[^"]+)";$/.exec(line.trim());
      return match ? bundleCss(join(dirname(file), match[1] as string)) : line;
    }),
  );
  return parts.join("\n");
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
    await writeFile("dist/styles.css", await bundleCss("src/styles.css"));
  },
});
