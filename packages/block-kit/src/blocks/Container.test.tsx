import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Container } from "./Container";

afterEach(cleanup);

function richText(text: string) {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  };
}

describe("<Container>", () => {
  it("renders title, subtitle and child blocks", () => {
    const block = {
      type: "container",
      title: { type: "plain_text", text: "Getting Started" },
      subtitle: { type: "plain_text", text: "A quick tour" },
      child_blocks: [richText("Body content")],
    };
    render(<Container block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Getting Started")).toBeTruthy();
    expect(screen.getByText("A quick tour")).toBeTruthy();
    expect(screen.getByText("Body content")).toBeTruthy();
  });

  it("defaults to the standard width modifier", () => {
    const block = { type: "container", child_blocks: [] };
    const { container } = render(<Container block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-container--standard")).toBeTruthy();
  });

  it("applies the full width modifier", () => {
    const block = { type: "container", width: "full", child_blocks: [] };
    const { container } = render(<Container block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-container--full")).toBeTruthy();
  });

  it("applies the narrow and wide modifiers, falling back to standard for unknown widths", () => {
    for (const [width, modifier] of [
      ["narrow", "narrow"],
      ["wide", "wide"],
      ["huge", "standard"],
    ]) {
      const block = { type: "container", width, child_blocks: [] };
      const { container } = render(<Container block={block as never} blockId="b1" index={0} />);
      expect(container.querySelector(`.sbk-container--${modifier}`)).toBeTruthy();
    }
  });

  it("is not collapsible by default: body always renders, no button", () => {
    const block = {
      type: "container",
      title: { type: "plain_text", text: "Title" },
      child_blocks: [richText("Always visible")],
    };
    render(<Container block={block as never} blockId="b1" index={0} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Always visible")).toBeTruthy();
  });

  it("toggles collapsed state via the header button when is_collapsible is true", () => {
    const block = {
      type: "container",
      title: { type: "plain_text", text: "Title" },
      is_collapsible: true,
      child_blocks: [richText("Hideable content")],
    };
    render(<Container block={block as never} blockId="b1" index={0} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Hideable content")).toBeTruthy();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Hideable content")).toBeNull();
  });

  it("keeps the content on screen while it animates shut, like Slack's height transition", () => {
    const style = document.head.appendChild(document.createElement("style"));
    style.textContent = ".sbk-container__collapse { transition-duration: 0.16s; }";
    try {
      const block = {
        type: "container",
        title: { type: "plain_text", text: "Title" },
        is_collapsible: true,
        child_blocks: [richText("Sliding content")],
      };
      render(<Container block={block as never} blockId="b1" index={0} />);
      fireEvent.click(screen.getByRole("button"));
      const body = screen.getByText("Sliding content").closest(".sbk-collapse")!;
      expect(body).toBeTruthy();
      fireEvent.transitionEnd(body, { propertyName: "height" });
      expect(screen.queryByText("Sliding content")).toBeNull();
    } finally {
      style.remove();
    }
  });

  it("starts collapsed when default_collapsed is true", () => {
    const block = {
      type: "container",
      title: { type: "plain_text", text: "Title" },
      is_collapsible: true,
      default_collapsed: true,
      child_blocks: [richText("Hidden at first")],
    };
    render(<Container block={block as never} blockId="b1" index={0} />);
    expect(screen.queryByText("Hidden at first")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("applies the header divider modifier class", () => {
    const block = {
      type: "container",
      title: { type: "plain_text", text: "Title" },
      has_header_divider: true,
      child_blocks: [],
    };
    const { container } = render(<Container block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-container__header--divider")).toBeTruthy();
  });
});
