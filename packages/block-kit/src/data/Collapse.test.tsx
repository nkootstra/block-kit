import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Collapse } from "./Collapse";

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
});

describe("<Collapse>", () => {
  it("makes closing content inert until the transition ends, on React 18 and 19", () => {
    const style = document.createElement("style");
    style.textContent = ".sbk-collapse { transition-duration: 0.25s; }";
    document.head.append(style);

    const { rerender } = render(
      <Collapse open>
        <button type="button">Inside</button>
      </Collapse>,
    );
    const region = screen.getByRole("button").parentElement as HTMLElement;
    expect(region.hasAttribute("inert")).toBe(false);

    rerender(
      <Collapse open={false}>
        <button type="button">Inside</button>
      </Collapse>,
    );
    expect(region.hasAttribute("inert")).toBe(true);

    rerender(
      <Collapse open>
        <button type="button">Inside</button>
      </Collapse>,
    );
    expect(region.hasAttribute("inert")).toBe(false);
  });
});
