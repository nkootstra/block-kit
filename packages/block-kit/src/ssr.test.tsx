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
});
