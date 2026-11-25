import { describe, expect, it } from "bun:test";
import { cspProblems, inlineScriptHashes, scriptSources } from "./csp";

describe("inline script hashes", () => {
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
    const [first = "", ...rest] = inlineScriptHashes(html);
    expect(rest).toHaveLength(1);
    const policy = `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' ${first}`;
    expect(scriptSources(policy)).toEqual(["'self'", first]);
    expect(cspProblems(html, policy)).toHaveLength(1);
  });
});
