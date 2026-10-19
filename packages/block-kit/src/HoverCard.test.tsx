import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
