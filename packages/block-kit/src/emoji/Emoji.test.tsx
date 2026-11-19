import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Emoji } from "./Emoji";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("<Emoji>", () => {
  // catalog/rich-text/emoji@hover-emoji-1: Slack's tooltip shows the emoji again, 64px on a white
  // tile, above its shortcode.
  it("previews the emoji above its shortcode in the hover tooltip", () => {
    render(<Emoji name="basketball" />);
    fireEvent.mouseEnter(screen.getByRole("img", { name: ":basketball:" }));
    act(() => vi.advanceTimersByTime(300));
    const tip = screen.getByRole("tooltip");
    const preview = tip.querySelector("img");
    expect(preview?.getAttribute("src")).toBe(
      screen.getAllByRole("img", { name: ":basketball:" })[0]?.getAttribute("src"),
    );
    expect(preview?.getAttribute("alt")).toBe("");
    expect(tip.textContent).toBe(":basketball:");
  });
});
