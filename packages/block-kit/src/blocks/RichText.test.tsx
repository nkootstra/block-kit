import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider } from "../context";
import { RichText } from "./RichText";

afterEach(cleanup);

describe("<RichText>", () => {
  it("renders a section with styled text leaves", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            { type: "text", text: "bold", style: { bold: true } },
            { type: "text", text: " and " },
            { type: "text", text: "italic", style: { italic: true } },
          ],
        },
      ],
    };
    render(<RichText block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("bold").tagName).toBe("B");
    expect(screen.getByText("italic").tagName).toBe("I");
  });

  it("renders a link leaf", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [{ type: "link", url: "https://slack.com", text: "Slack" }],
        },
      ],
    };
    render(<RichText block={block as never} blockId="b1" index={0} />);
    expect(screen.getByRole("link", { name: "Slack" }).getAttribute("href")).toBe(
      "https://slack.com",
    );
  });

  it("renders a plain preformatted block without a language, relying on native pre-wrap for blank lines", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_preformatted",
          elements: [{ type: "text", text: "line one\n\nline two" }],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    const pre = container.querySelector(".sbk-rich-text__pre");
    expect(pre).toBeTruthy();
    // Plain preformatted text is passed through as-is: `white-space: pre-wrap` on the <pre> renders
    // each literal `\n` as a real line natively, with no custom spacer spans needed.
    expect(pre?.querySelectorAll(".sbk-rich-text__br")).toHaveLength(0);
    expect(pre?.textContent).toBe("line one\n\nline two");
    // A copy-button overlay is always present on a plain preformatted block.
    expect(container.querySelector(".sbk-rich-text__pre-copy")).toBeTruthy();
  });

  it("renders a preformatted block with a Builder-only language as code chrome", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_preformatted",
          language: "typescript",
          elements: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-code-block")).toBeTruthy();
    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(screen.getByText("const x = 1;")).toBeTruthy();
  });

  it("renders a quote block", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_quote",
          elements: [{ type: "text", text: "A quote" }],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-rich-text__quote")?.textContent).toBe("A quote");
  });

  it("collapses any run of newlines (single or multiple) into one spacer", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [{ type: "text", text: "\nfirst\n\nsecond\n\n" }],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    const spacers = container.querySelectorAll(".sbk-rich-text__br");
    expect(spacers).toHaveLength(3);
  });

  it("nests rich_text_list runs into a single tree by indent", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_list",
          style: "bullet",
          indent: 0,
          elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "Top" }] }],
        },
        {
          type: "rich_text_list",
          style: "bullet",
          indent: 1,
          elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "Nested" }] }],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    const outerList = container.querySelector(".sbk-rich-list");
    expect(outerList?.tagName).toBe("UL");
    const nestedList = outerList?.querySelector(".sbk-rich-list");
    expect(nestedList).toBeTruthy();
    expect(nestedList?.textContent).toBe("Nested");
  });

  it("renders an ordered list honoring an offset", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_list",
          style: "ordered",
          indent: 0,
          offset: 2,
          elements: [
            { type: "rich_text_section", elements: [{ type: "text", text: "Third" }] },
            { type: "rich_text_section", elements: [{ type: "text", text: "Fourth" }] },
          ],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-rich-list")?.getAttribute("start")).toBe("3");
  });

  it("renders an unresolved user mention as an empty skeleton pill, and a resolved one as text", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            { type: "user", user_id: "U999" },
            { type: "text", text: " " },
            { type: "user", user_id: "U123" },
          ],
        },
      ],
    };
    const { container } = render(
      <BlockKitProvider resolvers={{ user: (id) => (id === "U123" ? "Ada" : undefined) }}>
        <RichText block={block as never} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    const unresolved = container.querySelector(".sbk-mention--unresolved");
    expect(unresolved?.textContent).toBe("");
    expect(unresolved?.getAttribute("aria-label")).toBe("@U999");
    expect(screen.getByText("@Ada")).toBeTruthy();
  });

  it("renders a date leaf formatted for the given time zone", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [{ type: "date", timestamp: 1392734382, format: "{date_short} at {time}" }],
        },
      ],
    };
    render(
      <BlockKitProvider timeZone="UTC">
        <RichText block={block as never} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.getByText(/Feb 18, 2014/)).toBeTruthy();
  });

  it("renders jumbo emoji when a section consists only of emoji", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [{ type: "emoji", name: "tada" }],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-rich-text__jumbo-emoji")).toBeTruthy();
  });
});
