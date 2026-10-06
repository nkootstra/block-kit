import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "./context";
import { Element } from "./elements/Element";
import { Mrkdwn } from "./Mrkdwn";
import { Tooltip } from "./Tooltip";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The custom properties a CSS rule block declares. */
function tokens(block: string): Set<string> {
  return new Set([...block.matchAll(/(--sbk-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

describe("theme tokens", () => {
  it("gives every token the dark theme sets a light value, so data-theme=light resets it", () => {
    const css = stylesheets(join(__dirname));
    const light = new Set(
      css.flatMap((s) =>
        [...s.matchAll(/:root,\s*\[data-theme="light"\]\s*\{([^}]*)\}/g)].flatMap((m) => [
          ...tokens(m[1]!),
        ]),
      ),
    );
    const message = readFileSync(join(__dirname, "Message.css"), "utf8");
    const dark = tokens(message.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/)![1]!);
    expect([...dark].filter((t) => !light.has(t))).toEqual([]);
  });
});

describe("the provider's theme reaches what it renders outside its wrapper", () => {
  const themeOf = (el: Element | null) => el?.closest("[data-theme]")?.getAttribute("data-theme");

  it("menus", () => {
    const options = ["One", "Two"].map((t) => ({
      text: { type: "plain_text", text: t },
      value: t,
    }));
    render(
      <BlockKitProvider theme="dark">
        <Element element={{ type: "static_select", action_id: "a", options }} blockId="b" />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(themeOf(document.body.querySelector(".sbk-popover"))).toBe("dark");
  });

  it("tooltips", () => {
    vi.useFakeTimers();
    render(
      <BlockKitProvider theme="dark">
        <Tooltip label="Copy table">
          <button type="button">copy</button>
        </Tooltip>
      </BlockKitProvider>,
    );
    fireEvent.mouseEnter(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(300));
    expect(themeOf(screen.getByRole("tooltip"))).toBe("dark");
  });

  it("confirm dialogs", () => {
    const confirm = {
      title: { type: "plain_text", text: "Are you sure?" },
      text: { type: "plain_text", text: "This cannot be undone." },
      confirm: { type: "plain_text", text: "Do it" },
      deny: { type: "plain_text", text: "Cancel" },
    };
    render(
      <BlockKitProvider theme="dark">
        <Element
          element={{
            type: "button",
            action_id: "a",
            text: { type: "plain_text", text: "Delete" },
            confirm,
          }}
          blockId="b"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(themeOf(screen.getByText("Are you sure?"))).toBe("dark");
  });

  it("profile cards", () => {
    render(
      <BlockKitProvider
        theme="dark"
        resolvers={{
          user: () => "jane",
          userProfile: () => ({ name: "jane", realName: "Jane Doe" }),
        }}
      >
        <Mrkdwn text="ping <@U1>" />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "@jane" }));
    expect(themeOf(screen.getByRole("dialog"))).toBe("dark");
  });
});
