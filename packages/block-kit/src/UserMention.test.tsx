import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider } from "./context";
import { Mrkdwn } from "./Mrkdwn";

afterEach(cleanup);

describe("<UserMention>", () => {
  it("opens a profile card from resolvers.userProfile on click and closes on Escape", () => {
    render(
      <BlockKitProvider
        resolvers={{
          user: (id) => (id === "U1" ? "jane" : undefined),
          userProfile: (id) =>
            id === "U1"
              ? {
                  name: "jane",
                  realName: "Jane Doe",
                  title: "Staff Engineer",
                  status: { text: "In a meeting" },
                  timeZone: "UTC",
                }
              : undefined,
        }}
      >
        <Mrkdwn text="ping <@U1>" />
      </BlockKitProvider>,
    );
    const mention = screen.getByRole("button", { name: "@jane" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(mention);
    const card = screen.getByRole("dialog", { name: "jane" });
    expect(card.textContent).toContain("Jane Doe");
    expect(card.textContent).toContain("Staff Engineer");
    expect(card.textContent).toContain("In a meeting");
    expect(card.textContent).toContain("local time");
    expect(mention.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to the display name and closes on an outside click", () => {
    render(
      <BlockKitProvider resolvers={{ user: () => "sam" }}>
        <Mrkdwn text="<@U2>" />
      </BlockKitProvider>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "@sam" }), { key: "Enter" });
    const card = screen.getByRole("dialog", { name: "sam" });
    expect(card.querySelector(".sbk-profile-card__avatar--placeholder")?.textContent).toBe("S");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves unresolved mentions as plain text", () => {
    render(<Mrkdwn text="<@U3>" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("@U3")).toBeTruthy();
  });
});
