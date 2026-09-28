import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Alert } from "./Alert";

afterEach(cleanup);

function alert(extra: Record<string, unknown>) {
  return { type: "alert", text: { type: "plain_text", text: "Heads up" }, ...extra };
}

describe("<Alert>", () => {
  it("renders plain_text", () => {
    render(<Alert block={alert({}) as never} blockId="b1" index={0} />);
    expect(screen.getByText("Heads up")).toBeTruthy();
  });

  it("renders mrkdwn formatting and links", () => {
    const block = alert({
      text: { type: "mrkdwn", text: "*Couldn't save.* <https://example.com|Try again>" },
      level: "error",
    });
    const { container } = render(<Alert block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector("b, strong")?.textContent).toBe("Couldn't save.");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(
      "https://example.com",
    );
  });

  it("defaults the level to default", () => {
    const { container } = render(<Alert block={alert({}) as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-alert--default")).toBeTruthy();
  });

  it.each(["info", "warning", "error", "success"])("applies the %s level", (level) => {
    const { container } = render(
      <Alert block={alert({ level }) as never} blockId="b1" index={0} />,
    );
    expect(container.querySelector(`.sbk-alert--${level}`)).toBeTruthy();
    expect(container.querySelector(".sbk-alert__icon")).toBeTruthy();
  });

  it("falls back to default for an unknown level", () => {
    const block = alert({ level: "critical" });
    const { container } = render(<Alert block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-alert--default")).toBeTruthy();
  });

  it("announces an error as an alert", () => {
    render(<Alert block={alert({ level: "error" }) as never} blockId="b1" index={0} />);
    expect(screen.getByRole("alert").textContent).toContain("Heads up");
  });
});
