import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

afterEach(cleanup);

function block(text: string) {
  return { type: "markdown", text } as never;
}

describe("<Markdown>", () => {
  it("renders headings using the shared header levels (h3+ share level 3)", () => {
    const { container } = render(
      <Markdown
        block={block("# One\n\n## Two\n\n### Three\n\n#### Four")}
        blockId="b1"
        index={0}
      />,
    );
    expect(container.querySelector("h1")?.className).toBe("sbk-header sbk-header--level-1");
    expect(container.querySelector("h2")?.className).toBe("sbk-header sbk-header--level-2");
    expect(container.querySelector("h3")?.className).toBe("sbk-header sbk-header--level-3");
    // Depth 4 still renders at the level-3 visual tier despite being a distinct tag.
    const h4 = container.querySelector("h4");
    expect(h4?.className).toBe("sbk-header sbk-header--level-3");
  });

  it("renders a thematic break as the shared divider", () => {
    const { container } = render(
      <Markdown block={block("above\n\n---\n\nbelow")} blockId="b1" index={0} />,
    );
    expect(container.querySelector("hr.sbk-divider")).toBeTruthy();
  });

  it("renders inline styles", () => {
    render(
      <Markdown block={block("**bold** _italic_ ~~strike~~ `code`")} blockId="b1" index={0} />,
    );
    expect(screen.getByText("bold").tagName).toBe("B");
    expect(screen.getByText("italic").tagName).toBe("I");
    expect(screen.getByText("strike").tagName).toBe("S");
    expect(screen.getByText("code").className).toBe("sbk-mrkdwn__code");
  });

  it("renders a link", () => {
    render(<Markdown block={block("[Slack](https://slack.com)")} blockId="b1" index={0} />);
    expect(screen.getByRole("link", { name: "Slack" }).getAttribute("href")).toBe(
      "https://slack.com",
    );
  });

  it("renders a fenced code block with a language as code chrome", () => {
    const { container } = render(
      <Markdown block={block("```ts\nconst x = 1;\n```")} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-code-block")).toBeTruthy();
    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(screen.getByText("const x = 1;")).toBeTruthy();
  });

  it("renders a fenced code block without a language as a plain pre", () => {
    const { container } = render(
      <Markdown block={block("```\nplain text\n```")} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-code-block")).toBeNull();
    expect(container.querySelector("pre.sbk-rich-text__pre")?.textContent).toBe("plain text");
  });

  it("renders a blockquote, turning a lazy-continuation line into a visual break", () => {
    const { container } = render(
      <Markdown block={block("> Quoted line one\n> Quoted line two")} blockId="b1" index={0} />,
    );
    const quote = container.querySelector("blockquote.sbk-rich-text__quote");
    expect(quote?.querySelector("br")).toBeTruthy();
    expect(quote?.textContent).toBe("Quoted line oneQuoted line two");
  });

  it("renders an unordered list", () => {
    const { container } = render(<Markdown block={block("- one\n- two")} blockId="b1" index={0} />);
    const list = container.querySelector("ul.sbk-rich-list--bullet");
    expect(list?.querySelectorAll("li.sbk-rich-list__item")).toHaveLength(2);
  });

  it("renders an ordered list honoring a start value", () => {
    const { container } = render(
      <Markdown block={block("3. three\n4. four")} blockId="b1" index={0} />,
    );
    const list = container.querySelector("ol.sbk-rich-list--ordered");
    expect(list?.getAttribute("start")).toBe("3");
  });

  it("renders a nested list", () => {
    const { container } = render(
      <Markdown block={block("- top\n  - nested")} blockId="b1" index={0} />,
    );
    const outer = container.querySelector("ul.sbk-rich-list--bullet");
    const nested = outer?.querySelector("ul.sbk-rich-list--bullet");
    expect(nested?.textContent).toBe("nested");
  });

  it("renders a GFM table with header and body rows", () => {
    const { container } = render(
      <Markdown block={block("| A | B |\n| --- | --- |\n| 1 | 2 |")} blockId="b1" index={0} />,
    );
    const table = container.querySelector("table.sbk-markdown__table");
    expect(table?.querySelectorAll("th")).toHaveLength(2);
    expect(table?.querySelectorAll("td")).toHaveLength(2);
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("joins a run of consecutive paragraphs into one section with spacers between them", () => {
    const { container } = render(
      <Markdown block={block("first\n\nsecond")} blockId="b1" index={0} />,
    );
    const sections = container.querySelectorAll(".sbk-markdown__section");
    expect(sections).toHaveLength(1);
    expect(sections[0]?.querySelectorAll(".sbk-rich-text__br")).toHaveLength(2);
  });

  it("renders emoji shortcodes in plain text", () => {
    const { container } = render(<Markdown block={block("Nice :tada:")} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-emoji, img, svg")).toBeTruthy();
  });
});
