import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockKitProvider } from "./context";
import { Mrkdwn } from "./Mrkdwn";

describe("<Mrkdwn>", () => {
  it("renders formatting, code and links", () => {
    render(<Mrkdwn text="*bold* `code` <https://slack.com|Slack>" />);
    expect(screen.getByText("bold").tagName).toBe("B");
    expect(screen.getByText("code").className).toBe("sbk-mrkdwn__code");
    expect(screen.getByRole("link", { name: "Slack" }).getAttribute("href")).toBe(
      "https://slack.com",
    );
  });

  it("renders mentions the way Slack shows unresolved ids", () => {
    const { container } = render(<Mrkdwn text="<@U123> <#C123> <!here> <!subteam^S123|@devs>" />);
    // An unresolved inline `<@id>` mention falls back to plain "@id" text (no pill/highlight),
    // unlike a `rich_text` block's structured `user` element (see RichText.test.tsx).
    expect(screen.getByText(/@U123/)).toBeTruthy();
    expect(container.querySelector(".sbk-mention--unresolved")).toBeNull();
    expect(screen.getByText("Private channel")).toBeTruthy();
    expect(screen.getByText("@here").className).toContain("sbk-mention--broadcast");
    // Subteam mentions show an empty loading pill even though a `|label` was given.
    const loading = container.querySelector(".sbk-mention--loading");
    expect(loading?.textContent).toBe("");
  });

  it("resolves mentions through the resolvers option", () => {
    render(
      <BlockKitProvider
        resolvers={{
          user: (id) => (id === "U123" ? "Jane" : undefined),
          channel: (id) => (id === "C123" ? "general" : undefined),
          usergroup: (id) => (id === "S123" ? "devs" : undefined),
        }}
      >
        <Mrkdwn text="<@U123> <#C123> <!subteam^S123>" />
      </BlockKitProvider>,
    );
    expect(screen.getByText("@Jane").classList.contains("sbk-mention")).toBe(true);
    expect(screen.getByText("#general")).toBeTruthy();
    expect(screen.getByText("@devs")).toBeTruthy();
  });

  it("renders emoji shortcodes as images, including skin tones", () => {
    render(<Mrkdwn text="hi :wave: :+1::skin-tone-3:" />);
    const wave = screen.getByAltText(":wave:");
    expect(wave.tagName).toBe("IMG");
    expect((wave as HTMLImageElement).src).toContain("1f44b");
    const thumb = screen.getByAltText(":+1:");
    expect((thumb as HTMLImageElement).src).toContain("1f44d-1f3fc");
  });

  it("falls back to literal text for an unknown emoji name", () => {
    render(<Mrkdwn text="test :not-a-real-emoji:" />);
    expect(screen.getByText(":not-a-real-emoji:", { exact: false })).toBeTruthy();
  });

  it("formats <!date> in the context's timeZone", () => {
    render(
      <BlockKitProvider timeZone="Europe/Amsterdam">
        <Mrkdwn text="<!date^1392734382^{date_short} at {time}|Feb 18, 2014>" />
      </BlockKitProvider>,
    );
    // 2014-02-18T14:39:42Z is 3:39 PM in Amsterdam (UTC+1, no DST in February).
    expect(screen.getByText("Feb 18, 2014 at 3:39 PM")).toBeTruthy();
  });

  it("is SSR-safe", () => {
    expect(renderToStaticMarkup(<Mrkdwn text={"a\nb"} />)).toBe(
      '<span class="sbk-mrkdwn">a<br/>b</span>',
    );
  });
});
