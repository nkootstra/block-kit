import type { Code, InlineCode, Link, Nodes, Paragraph, Root, Text } from "mdast";
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdownParse";

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

function timed(text: string): number {
  const start = performance.now();
  parseMarkdown(text);
  return performance.now() - start;
}

describe("parseMarkdown on hostile input", () => {
  // Slack's limit for a markdown block's text is 12,000 characters.
  it.each([
    ["a long run of asterisks around a word", `${"*".repeat(6000)}a${"*".repeat(6000)}`],
    ["a long run of underscores around a word", `${"_".repeat(6000)}a${"_".repeat(6000)}`],
    ["thousands of nested bullet markers", `${"- ".repeat(6000)}x`],
    ["thousands of nested ordered markers", `${"1. ".repeat(4000)}x`],
    ["thousands of nested asterisk bullets", `${"* ".repeat(6000)}x`],
  ])("parses %s quickly", (_, text) => {
    expect(timed(text)).toBeLessThan(500);
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
