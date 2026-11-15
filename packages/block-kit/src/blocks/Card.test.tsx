import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "./Card";

afterEach(cleanup);

describe("<Card>", () => {
  it("renders title and subtitle", () => {
    const block = {
      type: "card",
      title: { type: "plain_text", text: "Order #1042" },
      subtitle: { type: "plain_text", text: "Ready for review" },
    };
    render(<Card block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Order #1042")).toBeTruthy();
    expect(screen.getByText("Ready for review")).toBeTruthy();
  });

  it("renders an image icon when icon.type is image", () => {
    const block = {
      type: "card",
      title: { type: "plain_text", text: "Card" },
      icon: { type: "image", image_url: "https://example.com/icon.png", alt_text: "icon" },
    };
    const { container } = render(<Card block={block as never} blockId="b1" index={0} />);
    const img = container.querySelector("img.sbk-card__icon") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/icon.png");
  });

  it("draws a known slack_icon with Slack's own glyph", () => {
    const block = {
      type: "card",
      title: { type: "plain_text", text: "Card" },
      slack_icon: { type: "icon", name: "rocket" },
    };
    const { container } = render(<Card block={block as never} blockId="b1" index={0} />);
    const path = container.querySelector(".sbk-card__icon svg path");
    expect(path?.getAttribute("d")).toMatch(/^m18\.168 1\.832/);
    expect(container.querySelector(".sbk-card__icon--fallback")).toBeNull();
  });

  it.each([
    ["calendar", /^M4\.5 4h11/],
    ["bug", /^M11\.92 1\.077/],
    ["lightbulb", /^M5\.5 7a4\.5/],
    ["star-filled", /^M9\.99 1\.5/],
    ["warning", /^M10 12\.75/],
  ])("draws the %s slack_icon with Slack's own glyph", (name, start) => {
    const block = {
      type: "card",
      title: { type: "plain_text", text: "Card" },
      slack_icon: { type: "icon", name },
    };
    const { container } = render(<Card block={block as never} blockId="b1" index={0} />);
    const path = container.querySelector(".sbk-card__icon svg path");
    expect(path?.getAttribute("d")).toMatch(start);
    expect(container.querySelector(".sbk-card__icon--fallback")).toBeNull();
  });

  it("renders a fallback badge for a slack_icon it has no glyph for", () => {
    const block = {
      type: "card",
      title: { type: "plain_text", text: "Card" },
      slack_icon: { type: "icon", name: "no-such-icon" },
    };
    const { container } = render(<Card block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-card__icon--fallback")).toBeTruthy();
  });

  it("renders the hero image, body and subtext", () => {
    const block = {
      type: "card",
      hero_image: { type: "image", image_url: "https://example.com/hero.jpg", alt_text: "hero" },
      body: { type: "mrkdwn", text: "Body copy" },
      subtext: { type: "plain_text", text: "Fine print" },
    };
    render(<Card block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Body copy")).toBeTruthy();
    expect(screen.getByText("Fine print")).toBeTruthy();
  });

  it("renders action elements", () => {
    const block = {
      type: "card",
      title: { type: "plain_text", text: "Card" },
      actions: [{ type: "button", action_id: "view", text: { type: "plain_text", text: "View" } }],
    };
    render(<Card block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("View")).toBeTruthy();
  });

  it("omits the header section entirely with no icon, title, or subtitle", () => {
    const block = { type: "card", body: { type: "plain_text", text: "Just body" } };
    const { container } = render(<Card block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-card__header")).toBeNull();
  });

  const button = (text: string, style?: string) => ({
    type: "button",
    action_id: text,
    text: { type: "plain_text", text },
    ...(style && { style }),
  });
  const renderActions = (actions: object[]) => {
    const block = { type: "card", title: { type: "plain_text", text: "Card" }, actions };
    const { container } = render(<Card block={block as never} blockId="b1" index={0} />);
    const start = container.querySelector(".sbk-card__actions-start");
    return {
      start: start ? [...start.querySelectorAll("button")].map((b) => b.textContent) : null,
      all: [...container.querySelectorAll(".sbk-card__actions button")].map((b) => b.textContent),
    };
  };

  // Measured in Block Kit Builder: Slack orders a card's buttons danger, default, primary,
  // whatever the payload's order. With three buttons the danger ones get a group on the left.
  it("puts the danger buttons of a three-button card in a group on the left", () => {
    expect(
      renderActions([button("Confirm", "primary"), button("Cancel"), button("Delete", "danger")]),
    ).toEqual({ start: ["Delete"], all: ["Delete", "Cancel", "Confirm"] });
  });

  it("keeps the buttons of a two-button card together, danger first", () => {
    expect(renderActions([button("Confirm", "primary"), button("Delete", "danger")])).toEqual({
      start: null,
      all: ["Delete", "Confirm"],
    });
  });
});
