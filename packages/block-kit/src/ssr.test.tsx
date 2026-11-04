// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "./context";
import { Message } from "./Message";
import { HomeTab } from "./surfaces/HomeTab";
import { Modal } from "./surfaces/Modal";

/**
 * Slack emulators (and anything server-rendering an emulated channel/modal) render these
 * components on the server, where `window`/`document` don't exist. Confirms none of the three
 * surfaces reach for browser globals during render, or make React warn: React 18 warns about
 * every `useLayoutEffect` it meets on the server.
 */
describe("SSR", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error");
  });
  afterEach(() => {
    const calls = [...consoleError.mock.calls];
    consoleError.mockRestore();
    if (calls.length > 0) throw new Error(`React warned: ${String(calls[0]?.[0])}`);
  });

  it("renders <Message> to static markup without touching window", () => {
    const html = renderToStaticMarkup(
      <BlockKitProvider>
        <Message
          ts={1_700_000_000}
          blocks={[{ type: "section", text: { type: "plain_text", text: "Hello" } }]}
        />
      </BlockKitProvider>,
    );
    expect(html).toContain("Hello");
  });

  it("renders <Modal> to static markup without touching window", () => {
    const html = renderToStaticMarkup(
      <BlockKitProvider surface="modal">
        <Modal
          view={{
            type: "modal",
            title: { type: "plain_text", text: "New ticket" },
            submit: { type: "plain_text", text: "Create" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [{ type: "section", text: { type: "plain_text", text: "Body" } }],
          }}
        />
      </BlockKitProvider>,
    );
    expect(html).toContain("New ticket");
    expect(html).toContain("Body");
  });

  it("renders <HomeTab> to static markup without touching window", () => {
    const html = renderToStaticMarkup(
      <BlockKitProvider surface="home">
        <HomeTab
          view={{
            type: "home",
            blocks: [{ type: "section", text: { type: "plain_text", text: "Welcome" } }],
          }}
        />
      </BlockKitProvider>,
    );
    expect(html).toContain("Welcome");
  });

  it("keeps payload values that aren't a colour or an alignment out of server-rendered styles", () => {
    const evil = "fff;position:fixed;inset:0";
    const html = renderToStaticMarkup(
      <BlockKitProvider>
        <Message
          message={{
            ts: "1700000000.000000",
            attachments: [
              { color: evil, text: "a" },
              { color: "2eb886", text: "b" },
            ],
            blocks: [
              {
                type: "rich_text",
                elements: [
                  { type: "rich_text_section", elements: [{ type: "color", value: `#${evil}` }] },
                ],
              },
              {
                type: "table",
                column_settings: [{ align: `left;${evil}` }],
                rows: [[{ type: "raw_text", text: "cell" }]],
              } as never,
            ],
          }}
        />
      </BlockKitProvider>,
    );
    const styles = html.match(/style="[^"]*"/g) ?? [];
    expect(styles.filter((style) => style.includes("position"))).toEqual([]);
    expect(html).toContain("border-left-color:#2eb886");
  });
});
