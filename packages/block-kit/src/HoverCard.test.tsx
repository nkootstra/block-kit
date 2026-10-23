import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "./context";
import { HoverCard } from "./HoverCard";
import { Message } from "./Message";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const card = () => document.querySelector(".sbk-hover-card");

describe("<HoverCard>", () => {
  it("shows after a short hover delay, describes its anchor and hides on leave", () => {
    render(
      <HoverCard content="About this">
        <span>anchor</span>
      </HoverCard>,
    );
    const anchor = screen.getByText("anchor");
    fireEvent.mouseEnter(anchor);
    expect(card()).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(card()?.textContent).toBe("About this");
    expect(anchor.getAttribute("aria-describedby")).toBe(card()?.id);
    fireEvent.mouseLeave(anchor);
    act(() => vi.advanceTimersByTime(150));
    expect(card()).toBeNull();
    expect(anchor.hasAttribute("aria-describedby")).toBe(false);
  });

  it("stays open while the pointer moves into the card", () => {
    render(
      <HoverCard content="About this">
        <span>anchor</span>
      </HoverCard>,
    );
    const anchor = screen.getByText("anchor");
    fireEvent.mouseEnter(anchor);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.mouseLeave(anchor);
    fireEvent.mouseEnter(card()!);
    act(() => vi.advanceTimersByTime(500));
    expect(card()).not.toBeNull();
    fireEvent.mouseLeave(card()!);
    act(() => vi.advanceTimersByTime(150));
    expect(card()).toBeNull();
  });

  it("closes on Escape and never takes focus", () => {
    render(
      <HoverCard content="About this">
        <span>anchor</span>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByText("anchor"));
    act(() => vi.advanceTimersByTime(300));
    expect(card()?.contains(document.activeElement)).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(card()).toBeNull();
  });

  it("explains a channel mention it can't resolve, as Slack's hover card does", () => {
    render(
      <Message
        blocks={[
          {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "channel", channel_id: "C0123456789" }],
              },
            ],
          },
        ]}
      />,
    );
    const pill = screen.getByText("Private channel");
    fireEvent.mouseEnter(pill);
    act(() => vi.advanceTimersByTime(300));
    expect(card()?.textContent).toMatch(/^You don’t have access to this channel/);
    expect(card()?.className).toContain("sbk-hover-card--channel");
    expect(pill.getAttribute("aria-describedby")).toBe(card()?.id);
  });

  it("shows a mrkdwn link's URL with buttons to open and copy it", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <Message
        blocks={[
          { type: "section", text: { type: "mrkdwn", text: "Photo by <http://google.com|Ada>" } },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: "Ada" });
    fireEvent.mouseEnter(link);
    act(() => vi.advanceTimersByTime(300));
    expect(card()?.querySelector(".sbk-link-card__url")?.textContent).toBe("http://google.com");
    expect(card()?.textContent).toContain("Link");
    // The card has controls of its own, so it doesn't describe the link.
    expect(link.hasAttribute("aria-describedby")).toBe(false);
    expect(link.parentElement?.hasAttribute("aria-describedby")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("http://google.com");
    fireEvent.click(screen.getByRole("button", { name: "Open in new tab" }));
    expect(open).toHaveBeenCalledWith("http://google.com", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("shows the card on a rich text link too", () => {
    render(
      <Message
        blocks={[
          {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "link", url: "https://example.com/docs", text: "docs" }],
              },
            ],
          },
        ]}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole("link", { name: "docs" }));
    act(() => vi.advanceTimersByTime(300));
    expect(card()?.querySelector(".sbk-link-card__url")?.textContent).toBe(
      "https://example.com/docs",
    );
  });

  it("gives a link it won't follow no card", () => {
    render(
      <Message
        blocks={[
          {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "link", url: "javascript:alert(1)", text: "unsafe" }],
              },
            ],
          },
        ]}
      />,
    );
    fireEvent.mouseEnter(screen.getByText("unsafe"));
    act(() => vi.advanceTimersByTime(300));
    expect(card()).toBeNull();
  });

  it("names a user mention it can't resolve as private in a tooltip", () => {
    render(
      <Message
        blocks={[
          {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "user", user_id: "U0123456789" }],
              },
            ],
          },
        ]}
      />,
    );
    fireEvent.mouseEnter(document.querySelector(".sbk-mention--unresolved")!);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("tooltip").textContent).toBe("Private user info");
  });

  it("names a user mention the resolver doesn't know as private in a tooltip", () => {
    render(
      <BlockKitProvider resolvers={{ user: () => undefined }}>
        <Message
          blocks={[
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_section",
                  elements: [{ type: "user", user_id: "U0123456789" }],
                },
              ],
            },
          ]}
        />
      </BlockKitProvider>,
    );
    fireEvent.mouseEnter(document.querySelector(".sbk-mention--missing")!);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("tooltip").textContent).toBe("Private user info");
  });

  it("calls a user group mention it can't resolve unavailable in a tooltip", () => {
    // extra/fidelity/rich-text-rich-text-list/many-items@hover-mention-2
    const { container } = render(
      <Message
        blocks={[
          {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "usergroup", usergroup_id: "S0123456789" }],
              },
            ],
          },
          { type: "section", text: { type: "mrkdwn", text: "<!subteam^S0123456789|@devs>" } },
        ]}
      />,
    );
    const outlines = container.querySelectorAll(".sbk-mention--missing");
    expect(outlines).toHaveLength(2);
    for (const outline of outlines) {
      expect(outline.getAttribute("aria-label")).toBe("Unavailable user group");
      fireEvent.mouseEnter(outline);
      act(() => vi.advanceTimersByTime(300));
      expect(screen.getByRole("tooltip").textContent).toBe("Unavailable user group info");
      fireEvent.mouseLeave(outline);
      act(() => vi.advanceTimersByTime(300));
    }
  });
});
