import { readFileSync } from "node:fs";
import { cspProblems } from "@block-kit/csp";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the Content-Security-Policy in public/_headers", () => {
  it("allows exactly index.html's inline scripts", () => {
    const html = read("./index.html");
    // When this fails, put the hashes it names in public/_headers' script-src.
    expect(cspProblems(html, read("./public/_headers"))).toEqual([]);
  });
});
