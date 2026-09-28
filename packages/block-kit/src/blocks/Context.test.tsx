import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "./Context";

afterEach(cleanup);

describe("<Context>", () => {
  it("renders images, mrkdwn and plain_text elements in order", () => {
    const block = {
      type: "context",
      elements: [
        { type: "image", image_url: "https://example.com/avatar.png", alt_text: "Michael" },
        { type: "mrkdwn", text: "*Michael Scott* and <https://example.com|2 others> reacted" },
        { type: "plain_text", text: "Last updated 5 min ago" },
      ],
    };
    const { container } = render(<Context block={block as never} blockId="b1" index={0} />);

    const items = [...(container.querySelector(".sbk-context")?.children ?? [])];
    expect(items.map((el) => el.className)).toEqual([
      "sbk-context__image",
      "sbk-context__text",
      "sbk-context__text",
    ]);
    expect((items[0] as HTMLImageElement).alt).toBe("Michael");
    expect(screen.getByText("Michael Scott").tagName).toBe("B");
    expect(screen.getByRole("link", { name: "2 others" }).getAttribute("href")).toBe(
      "https://example.com",
    );
    expect(screen.getByText("Last updated 5 min ago")).toBeTruthy();
  });

  it("doesn't format mrkdwn syntax in a plain_text element", () => {
    const block = { type: "context", elements: [{ type: "plain_text", text: "*not bold*" }] };
    render(<Context block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("*not bold*")).toBeTruthy();
  });
});
