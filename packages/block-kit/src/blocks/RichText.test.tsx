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

  it("renders a tag as a pill holding its text", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            { type: "text", text: "See " },
            { type: "tag", text: "In progress", color: "blue" },
          ],
        },
      ],
    };
    render(<RichText block={block as never} blockId="b1" index={0} />);
    const tag = screen.getByText("In progress");
    expect(tag.tagName).toBe("SPAN");
    expect(tag.className).toBe("sbk-rich-text__tag");
  });

  it("renders a Salesforce data field as Slack's pill for a record it can't reach", () => {
    const block = {
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            { type: "text", text: "See " },
            {
              type: "salesforce_data_field",
              salesforce_record_id: "001000000000001",
              salesforce_field_label: "Amount",
              salesforce_include_field_label: true,
            },
          ],
        },
      ],
    };
    render(<RichText block={block as never} blockId="b1" index={0} />);
    const field = screen.getByText("Record was deleted");
    expect(field.className).toBe("sbk-rich-text__salesforce sbk-rich-text__salesforce--disabled");
    expect(field.getAttribute("data-id")).toBe("001000000000001");
    expect(field.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
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

  it("tags each bullet list with its indent, which picks Slack's dot, ring or square", () => {
    const list = (indent: number, text: string) => ({
      type: "rich_text_list",
      style: "bullet",
      indent,
      elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
    });
    const block = {
      type: "rich_text",
      elements: [list(0, "Top"), list(1, "Nested"), list(2, "Deeper")],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    const indents = [...container.querySelectorAll("ul.sbk-rich-list")].map((ul) =>
      ul.getAttribute("data-indent"),
    );
    expect(indents).toEqual(["0", "1", "2"]);
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

  // extra/fidelity/rich-text-rich-text-list/many-items: after ten items, a list with offset 2 that
  // continues them is numbered 11, not 3.
  it("keeps counting a list that continues the one before it, whatever its offset", () => {
    const item = (text: string) => ({
      type: "rich_text_section",
      elements: [{ type: "text", text }],
    });
    const block = {
      type: "rich_text",
      elements: [
        { type: "rich_text_list", style: "ordered", indent: 0, elements: [item("1"), item("2")] },
        { type: "rich_text_list", style: "bullet", indent: 1, elements: [item("Nested")] },
        {
          type: "rich_text_list",
          style: "ordered",
          indent: 0,
          offset: 7,
          elements: [item("Continued")],
        },
      ],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    const lists = container.querySelectorAll("ol.sbk-rich-list");
    expect(lists).toHaveLength(1);
    expect(screen.getByText("Continued").closest("li")?.hasAttribute("value")).toBe(false);
  });

  // extra/fidelity/rich-text-rich-text-preformatted/mixed: like a bordered list, Slack draws a
  // preformatted block with `border: 1` inside a quote.
  it("draws a preformatted block with a border inside a quote", () => {
    const pre = (border?: number) => ({
      type: "rich_text_preformatted",
      ...(border !== undefined && { border }),
      elements: [{ type: "text", text: border ? "Bordered" : "Plain" }],
    });
    const block = { type: "rich_text", elements: [pre(1), pre()] };
    render(<RichText block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Bordered").closest("blockquote")).toBeTruthy();
    expect(screen.getByText("Plain").closest("blockquote")).toBeNull();
  });

  it("draws a user mention as Slack's loading skeleton while there's no user resolver", () => {
    const block = {
      type: "rich_text",
      elements: [{ type: "rich_text_section", elements: [{ type: "user", user_id: "U999" }] }],
    };
    const { container } = render(<RichText block={block as never} blockId="b1" index={0} />);
    const pending = container.querySelector(".sbk-mention--unresolved");
    expect(pending?.textContent).toBe("");
    expect(pending?.getAttribute("aria-label")).toBe("@U999");
    expect(container.querySelector(".sbk-mention--missing")).toBeNull();
  });

  it("draws a user the resolver doesn't know as Slack's missing-user outline, and a known one as text", () => {
    // Once Slack's lookup settles on a user that doesn't exist, it swaps the grey skeleton for an
    // empty outline (c-missing_text--non-existent in extra/fidelity/rich-text-rich-text-list).
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
    const missing = container.querySelector(".sbk-mention--missing");
    expect(missing?.textContent).toBe("");
    expect(missing?.getAttribute("aria-label")).toBe("@U999");
    expect(container.querySelector(".sbk-mention--unresolved")).toBeNull();
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

  describe("a list with a border", () => {
    const text = (value: string) => ({ type: "text", text: value });
    const section = (value: string) => ({ type: "rich_text_section", elements: [text(value)] });
    const bordered = {
      type: "rich_text_list",
      style: "ordered",
      indent: 0,
      border: 1,
      elements: [section("First"), section("Second")],
    };

    it("shares one quote with the quote that follows it, as Slack groups them", () => {
      const block = {
        type: "rich_text",
        elements: [bordered, { type: "rich_text_quote", elements: [text("Quoted text")] }],
      };
      render(<RichText block={block as never} blockId="b1" index={0} />);
      const quote = screen.getByText("Quoted text").closest("blockquote");
      expect(quote).toBeTruthy();
      expect(screen.getByText("First").closest("blockquote")).toBe(quote);
    });

    it("sits in a quote of its own when nothing quoted follows", () => {
      const block = { type: "rich_text", elements: [bordered, section("After")] };
      render(<RichText block={block as never} blockId="b1" index={0} />);
      expect(screen.getByText("First").closest("blockquote")).toBeTruthy();
      expect(screen.getByText("After").closest("blockquote")).toBeNull();
    });

    it("leaves a list without a border outside any quote", () => {
      const block = {
        type: "rich_text",
        elements: [
          { ...bordered, border: 0 },
          { type: "rich_text_quote", elements: [text("Quoted text")] },
        ],
      };
      render(<RichText block={block as never} blockId="b1" index={0} />);
      expect(screen.getByText("First").closest("blockquote")).toBeNull();
    });
  });

  // extra/fidelity/rich-text-{workflow-mention,message-mention,file,canvas,work-object-mention,
  // attachment-mention}/default: what Slack shows for each when it can't look the entity up.
  describe("an entity a renderer outside Slack can't look up", () => {
    const renderEntity = (leaf: Record<string, unknown>) =>
      render(
        <RichText
          block={
            {
              type: "rich_text",
              elements: [
                { type: "rich_text_section", elements: [{ type: "text", text: "See " }, leaf] },
              ],
            } as never
          }
          blockId="b1"
          index={0}
        />,
      );

    it.each([
      [
        "a workflow as deleted",
        { type: "workflow_mention", workflow_id: "Wf0123456789", text: "Run the workflow" },
        "Deleted workflow",
      ],
      [
        "a message as private",
        { type: "message_mention", channel_id: "C0123456789", message_ts: "1767261600.000100" },
        "Private message",
      ],
      ["a file as hidden", { type: "file", file_id: "F0123456789", text: "A file" }, "Hidden file"],
    ])("shows %s, greyed out", (_, leaf, label) => {
      renderEntity(leaf);
      const slug = screen.getByText(label).closest(".sbk-rich-text__slug");
      expect(slug?.classList.contains("sbk-rich-text__slug--disabled")).toBe(true);
    });

    it("shows Slack's label in place of the payload's text", () => {
      renderEntity({ type: "workflow_mention", workflow_id: "Wf0123456789", text: "Run it" });
      expect(screen.queryByText("Run it")).toBeNull();
    });

    it.each([
      ["a canvas", { type: "canvas", file_id: "F0123456789", text: "A canvas" }, "Private canvas"],
      [
        "a list",
        { type: "list_record", file_id: "F0123456789", text: "A list record" },
        "Private list",
      ],
    ] as const)("shows %s as private, in the link colour", (_, leaf, label) => {
      renderEntity(leaf);
      const slug = screen.getByText(label).closest(".sbk-rich-text__slug");
      expect(slug).toBeTruthy();
      expect(slug?.classList.contains("sbk-rich-text__slug--disabled")).toBe(false);
    });

    // extra/fidelity/rich-text-citation/default: "1 · 🔗 example.com", linked to the source.
    it("links a citation to its source, as its index and the source's name", () => {
      renderEntity({
        type: "citation",
        url: "https://example.com/source",
        text: "Source",
        index: 1,
        details: { citation_type: "web", display_name: "example.com", title: "A cited page" },
      });
      const link = screen.getByRole("link");
      expect(link.getAttribute("href")).toBe("https://example.com/source");
      expect(link.textContent).toBe("1·example.com");
      expect(link.querySelector("b")?.textContent).toBe("1");
      expect(link.querySelector("svg")).toBeTruthy();
    });

    it("names a citation's source by its text when it has no display name", () => {
      renderEntity({
        type: "citation",
        url: "https://example.com/source",
        text: "Source",
        index: 2,
      });
      expect(screen.getByRole("link").textContent).toBe("2·Source");
    });

    it("links a work object to its URL under its text", () => {
      renderEntity({
        type: "work_object_mention",
        entity_id: "E0123456789",
        app_id: "A0123456789",
        text: "A work object",
        url: "https://example.com/work-object",
      });
      const link = screen.getByRole("link", { name: "A work object" });
      expect(link.getAttribute("href")).toBe("https://example.com/work-object");
      expect(link.querySelector(".sbk-rich-text__slug")).toBeTruthy();
    });

    it("shows a work object's app icon from resolvers.app, and a placeholder without one", () => {
      const leaf = {
        type: "work_object_mention",
        entity_id: "E0123456789",
        app_id: "A0123456789",
        text: "A work object",
        url: "https://example.com/work-object",
      };
      const block = {
        type: "rich_text",
        elements: [{ type: "rich_text_section", elements: [leaf] }],
      };
      const { container, unmount } = render(
        <BlockKitProvider
          resolvers={{
            app: (id) =>
              id === "A0123456789" ? { iconUrl: "https://example.com/app.png" } : undefined,
          }}
        >
          <RichText block={block as never} blockId="b1" index={0} />
        </BlockKitProvider>,
      );
      expect(container.querySelector("img.sbk-rich-text__slug-app")?.getAttribute("src")).toBe(
        "https://example.com/app.png",
      );
      unmount();

      const { container: unresolved } = render(
        <RichText block={block as never} blockId="b1" index={0} />,
      );
      expect(unresolved.querySelector("img")).toBeNull();
      expect(unresolved.querySelector("span.sbk-rich-text__slug-app")).toBeTruthy();
    });

    it("links an attachment to its URL under its text", () => {
      renderEntity({
        type: "attachment_mention",
        url: "https://example.com/attachment",
        text: "An attachment",
      });
      const link = screen.getByRole("link", { name: "An attachment" });
      expect(link.getAttribute("href")).toBe("https://example.com/attachment");
    });
  });
});

describe("text nodes, as Slack writes them", () => {
  const textNodes = (el: Element) =>
    [...el.querySelectorAll("*"), el].flatMap((n) =>
      [...n.childNodes].filter((c) => c.nodeType === 3 && c.textContent).map((c) => c.textContent),
    );
  const block = (elements: unknown[]) => ({
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements }],
  });

  it("joins consecutive text elements with the same style into one text node", () => {
    const { container } = render(
      <RichText
        block={
          block([
            { type: "text", text: "item 2: " },
            { type: "text", text: "this is a list item" },
            { type: "text", text: " bold", style: { bold: true } },
            { type: "text", text: " also bold", style: { bold: true } },
          ]) as never
        }
        blockId="b1"
        index={0}
      />,
    );
    expect(textNodes(container)).toEqual(["item 2: this is a list item", " bold also bold"]);
  });

  it("writes broadcast, usergroup and channel mentions as single text nodes", () => {
    const { container } = render(
      <BlockKitProvider resolvers={{ usergroup: () => "eng", channel: () => "general" }}>
        <RichText
          block={
            block([
              { type: "broadcast", range: "here" },
              { type: "usergroup", usergroup_id: "S1" },
              { type: "channel", channel_id: "C1" },
            ]) as never
          }
          blockId="b1"
          index={0}
        />
      </BlockKitProvider>,
    );
    const nodes = textNodes(container);
    for (const text of ["@here", "@eng", "#general"]) expect(nodes).toContain(text);
  });
});
