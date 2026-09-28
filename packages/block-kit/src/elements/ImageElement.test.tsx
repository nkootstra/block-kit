import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageElement } from "./ImageElement";

afterEach(cleanup);

describe("<ImageElement>", () => {
  it("renders the image_url and alt_text", () => {
    const element = { type: "image", image_url: "https://example.com/a.png", alt_text: "a widget" };
    const { container } = render(<ImageElement element={element as never} blockId="b1" />);
    const img = container.querySelector("img.sbk-image-element") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/a.png");
    expect(img.alt).toBe("a widget");
  });

  it("has an undefined src when image_url is absent", () => {
    const element = { type: "image", alt_text: "no url" };
    const { container } = render(<ImageElement element={element as never} blockId="b1" />);
    const img = container.querySelector("img.sbk-image-element") as HTMLImageElement;
    expect(img.getAttribute("src")).toBeNull();
  });
});
