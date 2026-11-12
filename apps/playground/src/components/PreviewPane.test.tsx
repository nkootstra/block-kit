// @vitest-environment jsdom
import type { ModalView } from "@nkootstra/block-kit";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePayload } from "../payload";
import { PreviewPane } from "./PreviewPane";

// A payload the package can't render. The package's own bugs get fixed, so the test makes one:
// any block whose block_id is "throws" throws while it renders.
vi.mock("@nkootstra/block-kit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nkootstra/block-kit")>();
  return {
    ...original,
    Message: (props: Parameters<typeof original.Message>[0]) => {
      if (props.blocks?.some((b) => b.block_id === "throws")) throw new Error("Can't render");
      return <original.Message {...props} />;
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function shown(json: string) {
  const result = parsePayload(json);
  if (!result.ok) throw new Error(result.error);
  return { blocks: result.blocks as ModalView["blocks"], raw: JSON.parse(json) };
}

const THROWS = shown('{"blocks":[{"type":"divider","block_id":"throws"}]}');
const WORKS = shown('{"blocks":[{"type":"section","text":{"type":"mrkdwn","text":"Fine again"}}]}');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(props: { shown: ReturnType<typeof shown>; shared?: boolean }) {
  act(() =>
    root.render(
      <PreviewPane
        source=""
        surface="message"
        onSurfaceChange={() => {}}
        delivery="demo"
        onDeliveryChange={() => {}}
        handlers={{}}
        log={<p>The log</p>}
        hiddenOnPhone={false}
        {...props}
      />,
    ),
  );
}

describe("PreviewPane", () => {
  it("keeps a payload that throws inside the preview, and tries the next one", () => {
    render({ shown: THROWS });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "This payload couldn't be rendered.",
    );
    // The rest of the pane is still there.
    expect(container.textContent).toContain("Open in Block Kit Builder");
    expect(container.textContent).toContain("The log");

    render({ shown: WORKS });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Fine again");
  });

  it("says a payload from a shared link was written by whoever made the link", () => {
    render({ shown: WORKS, shared: true });
    expect(container.querySelector('[role="note"]')?.textContent).toBe(
      "This is a preview of a shared payload. Its links and buttons lead to sites chosen by whoever made the link.",
    );
    render({ shown: WORKS });
    expect(container.querySelector('[role="note"]')).toBeNull();
  });
});
