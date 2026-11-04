// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockKitProvider } from "./context";
import { Message } from "./Message";

/**
 * A message comes from whoever wrote it. A server render writes a style into the HTML as
 * `property:value` without CSS-escaping the value, and a class as the string it was given, so a
 * payload value that reaches either one unchecked lets its author restyle the host page.
 */
/** Payloads are untyped JSON, so these carry values the types rule out. */
function render(message: object): string {
  return renderToStaticMarkup(
    <BlockKitProvider>
      <Message message={{ ts: "1700000000.000000", ...message } as never} />
    </BlockKitProvider>,
  );
}

const classTokens = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.split(" "));

describe("payload values in styles", () => {
  it("keeps an image URL that isn't a string out of the image's background", () => {
    const breakout = [")", ";position:fixed;inset:0;x:"];
    const html = render({
      blocks: [
        { type: "image", image_url: breakout, alt_text: "a" },
        { type: "image", image_url: { a: ");position:fixed;inset:0;x:" }, alt_text: "b" },
      ],
    });
    expect(html).not.toContain("position:fixed");
  });

  it("still draws an image from an https URL", () => {
    const html = render({
      blocks: [{ type: "image", image_url: "https://example.com/a.png", alt_text: "a" }],
    });
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain("background-image:url(&quot;https://example.com/a.png&quot;)");
  });

  it("renders a message whose attachment colour isn't a string", () => {
    const html = render({
      attachments: [
        { color: 123, text: "a" },
        { color: ["fff"], text: "b" },
      ],
    });
    expect(html).not.toContain("border-left-color");
  });

  it("leaves out hex colours CSS doesn't have", () => {
    const html = render({
      attachments: [
        { color: "#abcde", text: "five digits" },
        { color: "#abcd", text: "four digits" },
      ],
    });
    expect(html).not.toContain("#abcde");
    expect(html).toContain("border-left-color:#abcd");
  });
});

describe("payload values in class names", () => {
  const overlay = "x sbk-modal-layer";

  it("keeps a block type to one class", () => {
    expect(classTokens(render({ blocks: [{ type: overlay }] }))).not.toContain("sbk-modal-layer");
  });

  it("keeps a button style to one class", () => {
    const button = (type: string) => ({
      type,
      action_id: "a",
      text: { type: "plain_text", text: "Go" },
      style: `primary ${overlay}`,
    });
    const html = render({
      blocks: [{ type: "actions", elements: [button("button"), button("workflow_button")] }],
    });
    expect(classTokens(html)).not.toContain("sbk-modal-layer");
  });

  it("keeps a section accessory type to one class", () => {
    const html = render({
      blocks: [
        {
          type: "section",
          text: { type: "plain_text", text: "a" },
          accessory: { type: overlay },
        },
      ],
    });
    expect(classTokens(html)).not.toContain("sbk-modal-layer");
  });

  it("keeps a rich text list style to one class", () => {
    const list = {
      type: "rich_text_list",
      style: `bullet ${overlay}`,
      elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "item" }] }],
    };
    const html = render({
      blocks: [
        { type: "rich_text", elements: [list] },
        {
          type: "input",
          label: { type: "plain_text", text: "Notes" },
          element: {
            type: "rich_text_input",
            action_id: "notes",
            initial_value: { type: "rich_text", elements: [list] },
          },
        },
      ],
    });
    expect(classTokens(html)).not.toContain("sbk-modal-layer");
  });

  it("keeps the class of a block type Slack has", () => {
    const html = render({ blocks: [{ type: "divider" }] });
    expect(classTokens(html)).toContain("sbk-block--divider");
  });
});
