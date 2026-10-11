import { describe, expect, it } from "vitest";
import { safeUrl } from "./safeUrl";

describe("safeUrl", () => {
  it.each([
    "https://example.com/docs",
    "http://example.com",
    "HTTPS://EXAMPLE.COM",
    "mailto:name@example.com",
    "slack://channel?team=T0123456789&id=C0123456789",
    "/settings",
    "#section",
    "?tab=2",
    "//example.com/path",
    "docs/page:2",
  ])("keeps %j", (url) => {
    expect(safeUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "\tjavascript:alert(1)",
    " javascript:alert(1)",
    "\u0000javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "",
    "  ",
  ])("drops %j", (url) => {
    expect(safeUrl(url)).toBeUndefined();
  });

  it("leaves an HTML entity alone: it is never decoded, so it can't spell a scheme", () => {
    // `&#10;` stays five literal characters in an href, so this is a relative URL, not javascript:.
    expect(safeUrl("java&#10;script:alert(1)")).toBe("java&#10;script:alert(1)");
  });

  it("trims what a browser trims and keeps the rest", () => {
    expect(safeUrl("  https://example.com/a\tb  ")).toBe("https://example.com/ab");
  });

  it("drops a missing url", () => {
    expect(safeUrl(undefined)).toBeUndefined();
  });
});
