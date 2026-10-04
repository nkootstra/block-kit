import { describe, expect, it } from "bun:test";
import { inlineMarkdown } from "./inline-markdown";

describe("inlineMarkdown", () => {
  it("renders code spans", () => {
    expect(inlineMarkdown("Set `theme` on the provider")).toBe(
      "Set <code>theme</code> on the provider",
    );
  });

  it("renders links to site pages", () => {
    expect(inlineMarkdown("See [Emoji](/guides/emoji).")).toBe(
      'See <a href="/guides/emoji">Emoji</a>.',
    );
  });

  it("escapes HTML outside and inside code", () => {
    expect(inlineMarkdown("Default `<a>` for <Message>")).toBe(
      "Default <code>&lt;a&gt;</code> for &lt;Message&gt;",
    );
  });

  it("leaves Markdown inside a code span literal", () => {
    expect(inlineMarkdown("`[x](/y)` and `**z**`")).toBe(
      "<code>[x](/y)</code> and <code>**z**</code>",
    );
  });

  it("renders bold", () => {
    expect(inlineMarkdown("**Required** when set")).toBe("<strong>Required</strong> when set");
  });

  it("drops links with unsafe schemes but keeps their text", () => {
    expect(inlineMarkdown("[click](javascript:void)")).toBe("click");
  });
});
