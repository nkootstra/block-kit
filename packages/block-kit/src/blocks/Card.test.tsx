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

  it("groups danger buttons on the left, keeping the others in order on the right", () => {
    const button = (text: string, style?: string) => ({
      type: "button",
      action_id: text,
      text: { type: "plain_text", text },
      ...(style && { style }),
    });
    const block = {
      type: "card",
      title: { type: "plain_text", text: "Card" },
      actions: [button("Confirm", "primary"), button("Delete", "danger"), button("Cancel")],
    };
    const { container } = render(<Card block={block as never} blockId="b1" index={0} />);
    const start = container.querySelector(".sbk-card__actions-start") as HTMLElement;
    expect([...start.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Delete"]);
    const all = [...container.querySelectorAll(".sbk-card__actions button")];
    expect(all.map((b) => b.textContent)).toEqual(["Delete", "Confirm", "Cancel"]);
  });
});
