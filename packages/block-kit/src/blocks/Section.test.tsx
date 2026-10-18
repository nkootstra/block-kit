import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Section } from "./Section";

afterEach(cleanup);

describe("<Section>", () => {
  it("renders plain text", () => {
    const block = { type: "section", text: { type: "plain_text", text: "Hello there" } };
    render(<Section block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("Hello there")).toBeTruthy();
  });

  it("renders fields alongside text", () => {
    const block = {
      type: "section",
      text: { type: "mrkdwn", text: "Summary" },
      fields: [
        { type: "mrkdwn", text: "*Customer*\nAda" },
        { type: "plain_text", text: "Plain field" },
      ],
    };
    const { container } = render(<Section block={block as never} blockId="b1" index={0} />);
    expect(container.querySelectorAll(".sbk-section__field")).toHaveLength(2);
    expect(screen.getByText("Plain field")).toBeTruthy();
  });

  it("renders an accessory with a type-specific modifier class", () => {
    const block = {
      type: "section",
      text: { type: "mrkdwn", text: "Pick one" },
      accessory: { type: "button", action_id: "go", text: { type: "plain_text", text: "Go" } },
    };
    const { container } = render(<Section block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-section__accessory--button")).toBeTruthy();
    expect(container.querySelector(".sbk-section--has-accessory")).toBeTruthy();
  });

  it.each([undefined, false, true])(
    "shows long text in full with no toggle, as Block Kit Builder does (expand: %s)",
    (expand) => {
      const longText = "word ".repeat(600);
      const block = { type: "section", text: { type: "mrkdwn", text: longText }, expand };
      const { container } = render(<Section block={block as never} blockId="b1" index={0} />);
      const text = container.querySelector(".sbk-section__text");
      expect(text?.textContent?.trim()).toBe(longText.trim());
      expect(text?.getAttribute("style")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );
});
