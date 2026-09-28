import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "./Tooltip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("<Tooltip>", () => {
  it("shows after a short hover delay and hides on leave", () => {
    render(
      <Tooltip label="Copy table">
        <button type="button">copy</button>
      </Tooltip>,
    );
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toBe("Copy table");
    expect(button.getAttribute("aria-describedby")).toBe(tip.id);
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("never shows when the pointer leaves before the delay", () => {
    render(
      <Tooltip label="Copy table">
        <button type="button">copy</button>
      </Tooltip>,
    );
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.mouseLeave(button);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps the anchor's own handlers working", () => {
    const onMouseEnter = vi.fn();
    render(
      <Tooltip label="Hi">
        <button type="button" onMouseEnter={onMouseEnter}>
          x
        </button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
  });

  it("renders the anchor untouched when the label is empty", () => {
    render(
      <Tooltip label="">
        <button type="button">x</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
