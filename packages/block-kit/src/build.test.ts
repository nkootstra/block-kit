import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../tsdown.config";

type Banner = (ctx: { format: "es"; fileName: string }) => string | undefined;

/**
 * React Server Components (Next.js App Router) need `"use client"` at the top of a module that
 * uses hooks and context, or importing `<Message>` into a server component fails. The parser,
 * relay and Web API entries stay usable from server code, so only the component entry gets it.
 */
describe("build", () => {
  const banner = (fileName: string) =>
    (config as { banner: Banner }).banner({ format: "es", fileName });

  it('marks the component entry "use client"', () => {
    expect(banner("index.js")).toBe('"use client";');
  });

  it.each(["mrkdwn.js", "server.js", "transport.js", "web-api.js", "index.d.ts"])(
    "leaves %s usable from server code",
    (fileName) => {
      expect(banner(fileName)).toBeUndefined();
    },
  );

  // The browser entries must not pull the Node Slack SDK into a page, or a bundler would ship it
  // (and invite a bot token in with it). Their sources may not import it, not even as a type.
  it.each([
    "src/transport.ts",
    "src/interactivity/transport.ts",
    ...readdirSync("src/web-api")
      .filter((file) => !file.includes(".test."))
      .map((file) => `src/web-api/${file}`),
  ])("keeps @slack/web-api out of %s", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/(from|import)\s*\(?\s*["']@slack\/web-api/);
  });

  // TypeScript's classic `moduleResolution: "node"` (what Next.js writes into a new tsconfig)
  // ignores `exports`, so every entry's types are mapped again through `types`/`typesVersions`.
  it("maps every entry's types for moduleResolution node as well as through exports", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      main: string;
      types: string;
      exports: Record<string, string>;
      typesVersions: { "*": Record<string, string[]> };
    };
    expect(pkg.main).toBe(pkg.exports["."]);
    expect(pkg.types).toBe(pkg.exports["."]?.replace(/\.js$/, ".d.ts"));
    const subpaths = Object.entries(pkg.exports).filter(
      ([path, target]) => path !== "." && target.endsWith(".js"),
    );
    expect(Object.keys(pkg.typesVersions["*"]).sort()).toEqual(
      subpaths.map(([path]) => path.slice(2)).sort(),
    );
    for (const [path, target] of subpaths) {
      expect(pkg.typesVersions["*"][path.slice(2)]).toEqual([target.replace(/\.js$/, ".d.ts")]);
    }
  });
});
