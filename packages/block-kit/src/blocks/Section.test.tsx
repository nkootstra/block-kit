import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("does not clamp short text even without expand", () => {
    const block = { type: "section", text: { type: "mrkdwn", text: "Short text" } };
    const { container } = render(<Section block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-section__toggle")).toBeNull();
  });

  it("clamps long text behind a Show more toggle, and expands on click", () => {
    const longText = "word ".repeat(80);
    const block = { type: "section", text: { type: "mrkdwn", text: longText } };
    const { container } = render(<Section block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-section__text--clamped")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "Show more" });
    fireEvent.click(toggle);
    expect(container.querySelector(".sbk-section__text--clamped")).toBeNull();
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("never clamps when expand is true", () => {
    const longText = "word ".repeat(80);
    const block = {
      type: "section",
      text: { type: "mrkdwn", text: longText },
      expand: true,
    };
    const { container } = render(<Section block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-section__text--clamped")).toBeNull();
    expect(container.querySelector(".sbk-section__toggle")).toBeNull();
  });
});
