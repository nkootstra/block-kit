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
});
