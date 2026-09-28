import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Image } from "./Image";

afterEach(cleanup);

describe("<Image>", () => {
  it("renders the image with alt text", () => {
    const block = {
      type: "image",
      image_url: "https://example.com/a.png",
      alt_text: "a widget",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    const img = container.querySelector("img.sbk-image__img") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/a.png");
    expect(img.alt).toBe("a widget");
  });

  it("shows the title text plus an always-present expand caret", () => {
    const block = {
      type: "image",
      title: { type: "plain_text", text: "I love tacos" },
      image_url: "https://example.com/a.png",
      alt_text: "tacos",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("I love tacos")).toBeTruthy();
    expect(container.querySelector(".sbk-image__caret")).toBeTruthy();
  });

  it("still shows the caret row when there is no title", () => {
    const block = {
      type: "image",
      image_url: "https://example.com/a.png",
      alt_text: "tacos",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-image__title")).toBeTruthy();
    expect(container.querySelector(".sbk-image__caret")).toBeTruthy();
    expect(container.querySelector(".sbk-image__title-text")).toBeNull();
  });

  it("falls back to a placeholder for a slack_file image with no resolvable URL", () => {
    const block = {
      type: "image",
      slack_file: { id: "F123" },
      alt_text: "a shared file",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector("img")).toBeNull();
    const fallback = container.querySelector(".sbk-image__fallback") as HTMLElement;
    expect(fallback.getAttribute("aria-label")).toBe("a shared file");
    expect(container.querySelector(".sbk-image__title")).toBeNull();
  });
});
