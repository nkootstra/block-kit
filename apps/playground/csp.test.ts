import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cspProblems, inlineScriptHashes, scriptSources } from "./csp";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the Content-Security-Policy in public/_headers", () => {
  it("allows exactly index.html's inline scripts", () => {
    const html = read("./index.html");
    // When this fails, put the hashes it names in public/_headers' script-src.
    expect(cspProblems(html, read("./public/_headers"))).toEqual([]);
  });

  it("ends a script at an end tag the HTML parser accepts", () => {
    const html = "<script>a()</script ><script>b()</script foo>";
    expect(inlineScriptHashes(html)).toEqual(
      inlineScriptHashes("<script>a()</script><script>b()</script>"),
    );
  });

  it("hashes scripts that run and skips the rest", () => {
    const html = [
      "<script>a()</script>",
      '<script type="module">b()</script>',
      '<script type="application/ld+json">{}</script>',
      '<script type="module" src="/x.js"></script>',
    ].join("");
    expect(inlineScriptHashes(html)).toHaveLength(2);
    const policy = `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' ${inlineScriptHashes(html)[0]}`;
    expect(scriptSources(policy)).toEqual(["'self'", inlineScriptHashes(html)[0]]);
    expect(cspProblems(html, policy)).toHaveLength(1);
  });
});
