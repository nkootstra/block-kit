import type { AnyBlock } from "@slack/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockComponents } from "./blocks/index";
import { BlockKitProvider } from "./context";
import { Message } from "./Message";
import { Modal } from "./surfaces/Modal";

afterEach(cleanup);

// React reports the errors the boundaries catch; the tests expect them.
beforeEach(() => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => error.mockRestore();
});

const NOTICE = "This content could not be displayed.";
const section = (text: string) => ({ type: "section", text: { type: "mrkdwn", text } });

/** Renders blocks next to a sibling of the host's, which must survive whatever the blocks do. */
function renderInHost(blocks: unknown, text?: string) {
  return render(
    <BlockKitProvider>
      <p>host content</p>
      <Message blocks={blocks as AnyBlock[]} text={text} ts="1719493800.000200" />
    </BlockKitProvider>,
  );
}

describe("<Blocks> with malformed input", () => {
  it("skips entries that aren't objects and renders the rest", () => {
    const { container } = renderInHost([null, "x", 42, section("still here"), undefined]);
    expect(screen.getByText("host content")).toBeTruthy();
    expect(screen.getByText("still here")).toBeTruthy();
    expect(container.querySelectorAll(".sbk-block")).toHaveLength(1);
  });

  it("treats a `blocks` that isn't an array as no blocks", () => {
    for (const blocks of ["not an array", 42, { type: "section" }, null]) {
      renderInHost(blocks, "fallback text");
      expect(screen.getByText("host content")).toBeTruthy();
      expect(screen.getByText("fallback text")).toBeTruthy();
      cleanup();
    }
  });

  it("shows Slack's notice in place of a block that throws, keeping its siblings", () => {
    const { container } = renderInHost([
      { type: "header" },
      section("after the header"),
      { type: "actions", elements: [{ type: "button" }] },
    ]);
    expect(screen.getByText("host content")).toBeTruthy();
    expect(screen.getByText("after the header")).toBeTruthy();
    expect(screen.getAllByText(NOTICE)).toHaveLength(2);
    const header = container.querySelector(".sbk-block--header");
    expect(header?.querySelector(".sbk-block-error")).toBeTruthy();
  });

  it("contains a custom block that throws", () => {
    blockComponents.broken = () => {
      throw new Error("custom block bug");
    };
    try {
      renderInHost([{ type: "broken" }, section("next")]);
      expect(screen.getByText(NOTICE)).toBeTruthy();
      expect(screen.getByText("next")).toBeTruthy();
    } finally {
      delete blockComponents.broken;
    }
  });

  it("contains a throwing block nested in a callout to that block", () => {
    renderInHost([
      {
        type: "callout",
        child_blocks: [{ type: "context" }, null, section("inside the callout")],
      },
    ]);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText("inside the callout")).toBeTruthy();
  });

  it("renders the block again once its payload is fixed", () => {
    const { rerender } = renderInHost([{ type: "header" }]);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    rerender(
      <BlockKitProvider>
        <Message
          blocks={[{ type: "header", text: { type: "plain_text", text: "Fixed" } }]}
          ts="1719493800.000200"
        />
      </BlockKitProvider>,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByText("Fixed")).toBeTruthy();
  });

  it("keeps a modal open around a block that can't render", () => {
    render(
      <BlockKitProvider>
        <Modal
          view={{
            type: "modal",
            title: { type: "plain_text", text: "Form" },
            blocks: [null, { type: "input" }, section("body")] as unknown as AnyBlock[],
          }}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("heading", { name: "Form" })).toBeTruthy();
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });
});
