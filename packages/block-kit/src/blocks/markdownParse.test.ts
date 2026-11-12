import type { Code, InlineCode, Link, Nodes, Paragraph, Root, Text } from "mdast";
import { describe, expect, it } from "vitest";
import { MAX_MARKDOWN_LENGTH, parseMarkdown } from "./markdownParse";

/** Every node of `tree`, depth first. */
function nodes(tree: Nodes): Nodes[] {
  return [tree, ...("children" in tree ? tree.children.flatMap(nodes) : [])];
}

function first<T extends Nodes>(tree: Root, type: T["type"]): T {
  const node = nodes(tree).find((n) => n.type === type);
  if (!node) throw new Error(`no ${type} node`);
  return node as T;
}

/** The text a reader sees: every text value in the tree, in order. */
function textOf(tree: Root): string {
  return nodes(tree)
    .map((n) => ("value" in n && typeof n.value === "string" ? n.value : ""))
    .join("");
}

/** `pattern` repeated to `length` characters, Slack's limit by default. */
function fill(pattern: string, length = MAX_MARKDOWN_LENGTH): string {
  return pattern.repeat(Math.ceil(length / pattern.length)).slice(0, length);
}

function timed(text: string): number {
  const start = performance.now();
  parseMarkdown(text);
  return performance.now() - start;
}

describe("parseMarkdown on hostile input", () => {
  // Slack's limit for a markdown block's text is 12,000 characters: each of these is just under it.
  it.each([
    ["a long run of asterisks around a word", `${"*".repeat(5999)}a${"*".repeat(6000)}`],
    ["a long run of underscores around a word", `${"_".repeat(5999)}a${"_".repeat(6000)}`],
    ["thousands of nested bullet markers", `${"- ".repeat(5999)}x`],
    ["thousands of nested ordered markers", `${"1. ".repeat(3999)}x`],
    ["thousands of nested asterisk bullets", `${"* ".repeat(5999)}x`],
    // Delimiters and brackets that never close, which cost time in how many a paragraph holds.
    ["unclosed bold and italic", fill("**a*")],
    ["underscores and asterisks between spaces", fill("_a* ")],
    ["link ends without a start", fill("](")],
    ["mixed unclosed emphasis", fill("*a_")],
    ["unclosed strikethrough", fill("~a~")],
    ["unclosed brackets on every line", fill("[a\n")],
  ])("parses %s quickly", (_, text) => {
    expect(text.length).toBeLessThanOrEqual(MAX_MARKDOWN_LENGTH);
    expect(timed(text)).toBeLessThan(500);
  });

  // GFM's link literals stay slower: each word after an unclosed `[` looks back for it, and each
  // `www.` after a `_` reads the domain to its end. About 0.1s at the limit, so a looser bound
  // keeps the test steady when the suites run side by side.
  it.each([
    ["an opening bracket before long text", `[${fill("a ", MAX_MARKDOWN_LENGTH - 1)}`],
    ["underscores in a www link", fill("www.a_")],
  ])("parses %s in bounded time", (_, text) => {
    expect(timed(text)).toBeLessThan(1500);
  });

  it("shows text over Slack's limit as it is written, unparsed", () => {
    const text = `**bold** ${"a".repeat(MAX_MARKDOWN_LENGTH)}`;
    const tree = parseMarkdown(text);
    expect(tree.children).toHaveLength(1);
    expect(first<Text>(tree, "text").value).toBe(text);
    expect(nodes(tree).some((n) => n.type === "strong")).toBe(false);
  });

  it("keeps the text of a paragraph past its delimiter cap as written", () => {
    // Past the cap the bold, code and link stay as their markdown; before it the bold is bold.
    const text = `${"**b** ".repeat(400)}\`c_d\` [e](https://example.com/f_g)\nmore *text*`;
    expect(textOf(parseMarkdown(text)).replaceAll("*", "")).toBe(text.replaceAll("*", ""));
  });

  it("formats a paragraph's delimiters up to the cap, and the next paragraph's afresh", () => {
    const bold = "**b** ".repeat(300);
    const tree = parseMarkdown(`${bold}\n\n**after**`);
    const strong = nodes(tree).filter((n) => n.type === "strong");
    // 250 pairs fit in the first paragraph's 500 delimiters; the second paragraph starts again.
    expect(strong).toHaveLength(251);
  });

  it("keeps the text of a long delimiter run", () => {
    const text = `${"*".repeat(200)}a${"*".repeat(200)}`;
    expect(textOf(parseMarkdown(text)).replaceAll("*", "")).toBe("a");
  });

  it("keeps the text of deeply nested list items", () => {
    expect(textOf(parseMarkdown(`${"- ".repeat(100)}x`))).toContain("x");
  });
});

describe("parseMarkdown keeps ordinary markdown as it is", () => {
  it("keeps a long run inside a fenced code block", () => {
    const line = `/*${"*".repeat(100)}*/`;
    const code = first<Code>(
      parseMarkdown(`\`\`\`\n${line}\n- ${"- ".repeat(40)}x\n\`\`\``),
      "code",
    );
    expect(code.value).toBe(`${line}\n- ${"- ".repeat(40)}x`);
  });

  it("keeps a long run inside inline code", () => {
    const run = "_".repeat(100);
    expect(first<InlineCode>(parseMarkdown(`see \`${run}\` here`), "inlineCode").value).toBe(run);
  });

  it("keeps a long run inside a link URL", () => {
    const url = `https://example.com/${"_".repeat(100)}`;
    expect(first<Link>(parseMarkdown(`[docs](${url})`), "link").url).toBe(url);
  });

  it("keeps a line of underscores a thematic break", () => {
    expect(parseMarkdown("above\n\n" + "_".repeat(100) + "\n\nbelow").children[1]?.type).toBe(
      "thematicBreak",
    );
  });

  it("keeps a line of underscores a thematic break with Windows line endings", () => {
    expect(
      parseMarkdown("above\r\n\r\n" + "_".repeat(100) + "\r\n\r\nbelow").children[1]?.type,
    ).toBe("thematicBreak");
  });

  it("keeps a fill-in blank as plain text", () => {
    const text = `Name: ${"_".repeat(80)} (print)`;
    const paragraph = first<Paragraph>(parseMarkdown(text), "paragraph");
    expect(paragraph.children).toEqual([expect.objectContaining({ type: "text", value: text })]);
  });

  it("keeps emphasis made of short runs", () => {
    const tree = parseMarkdown("***bold italic*** and _it_");
    expect(nodes(tree).map((n) => n.type)).toEqual(expect.arrayContaining(["strong", "emphasis"]));
    expect(textOf(tree)).toBe("bold italic and it");
  });

  it("keeps whitespace characters the text already has", () => {
    const text = "a\u2000b\u3000c\u205fd";
    expect(first<Text>(parseMarkdown(text), "text").value).toBe(text);
  });
});
