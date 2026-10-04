import { describe, expect, test } from "bun:test";
import { ogkitImageUrl, subline } from "./ogkit";

const page = new URL("https://block-kit.dev/");

describe("ogkitImageUrl", () => {
  test("points at OG Kit with the canonical page, the cache version and the render marker", () => {
    const url = ogkitImageUrl(page, { key: "abc", version: "v3" });
    expect(url).toStartWith("https://ogkit.dev/img/abc.jpeg?url=");
    const rendered = new URL(decodeURIComponent(url!.split("?url=")[1]!));
    expect(rendered.origin).toBe("https://block-kit.dev");
    expect(rendered.searchParams.get("ogv")).toBe("v3");
    expect(rendered.searchParams.get("ogkit-render")).toBe("1");
  });

  test("defaults the cache version to v1", () => {
    const url = ogkitImageUrl(page, { key: "abc" });
    expect(decodeURIComponent(url!)).toContain("ogv=v1");
  });

  test("returns null without a key, so the static image is used", () => {
    expect(ogkitImageUrl(page, { key: undefined })).toBeNull();
    expect(ogkitImageUrl(page, { key: "" })).toBeNull();
  });
});

describe("subline", () => {
  test("keeps a short description whole", () => {
    expect(subline("Short.")).toBe("Short.");
  });

  test("cuts a long description at a sentence end", () => {
    const text = `${"a".repeat(80)}. ${"b".repeat(80)}.`;
    expect(subline(text)).toBe(`${"a".repeat(80)}.`);
  });
});
