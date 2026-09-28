import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("paints the image as the frame's background, like Slack, so downscaled photos resample identically", () => {
    const block = {
      type: "image",
      image_url: "https://example.com/a.png",
      alt_text: "a widget",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    const frame = container.querySelector(".sbk-image__frame") as HTMLElement;
    expect(frame.style.backgroundImage).toBe('url("https://example.com/a.png")');
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

  it("hides the image when its caret is pressed and shows it again on a second press, like Slack", () => {
    const block = {
      type: "image",
      title: { type: "plain_text", text: "I love tacos" },
      image_url: "https://example.com/a.png",
      alt_text: "tacos",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    const toggle = screen.getByRole("button", { name: "image" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("title")).toBe("Collapse");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("title")).toBe("Expand");
    expect(container.querySelector(".sbk-image__frame")).toBeNull();
    expect(screen.getByText("I love tacos")).toBeTruthy();

    fireEvent.click(toggle);
    expect(container.querySelector("img.sbk-image__img")).toBeTruthy();
  });

  it("points the caret right while the image is hidden", () => {
    const block = { type: "image", image_url: "https://example.com/a.png", alt_text: "tacos" };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: "image" }));
    expect(container.querySelector(".sbk-image__caret--collapsed")).toBeTruthy();
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
