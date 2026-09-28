import { describe, expect, it } from "vitest";
import { roundedBarPath, smoothLinePath } from "./paths";

describe("smoothLinePath", () => {
  it("returns an empty string for no points", () => {
    expect(smoothLinePath([])).toBe("");
  });

  it("moves to the single point without curving", () => {
    expect(smoothLinePath([{ x: 10, y: 20 }])).toBe("M10 20");
  });

  it("starts with a move command to the first point and visits every point", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: -5 },
    ];
    const d = smoothLinePath(points);
    expect(d.startsWith("M0 0")).toBe(true);
    // one cubic-bezier segment per gap between points
    expect(d.match(/C/g)?.length).toBe(2);
    expect(d).toContain("20 -5");
  });

  it("stops a handle at its neighbour's height instead of overshooting it, like Slack", () => {
    // Block Kit Builder's "Mobile" series from the multi-series line chart. Thu→Fri barely rises,
    // so Thu's tangent is flattened until its out-handle meets Fri's height.
    const points = [
      { x: 74, y: 225.6667 },
      { x: 154.3081, y: 190.4583 },
      { x: 234.6163, y: 198.5833 },
      { x: 314.9244, y: 174.2083 },
      { x: 395.2325, y: 171.5 },
    ];
    const numbers = (d: string) => d.match(/-?[\d.]+/g)!.map(Number);
    const slack =
      "M74 225.6667C74 225.6667 112.4924 190.4583 154.3081 190.4583C192.8005 190.4583 195.2445 198.5833 234.6163 198.5833C275.5526 198.5833 273.8972 177.0371 314.9244 174.2083C354.2054 171.5 395.2325 171.5 395.2325 171.5";
    const ours = numbers(smoothLinePath(points));
    numbers(slack).forEach((n, i) => expect(ours[i]).toBeCloseTo(n, 1));
  });
});

describe("roundedBarPath", () => {
  it("rounds the top corners for a positive bar", () => {
    const d = roundedBarPath(0, 10, 20, 100, 4, true);
    // top edge should start below yTop by the radius, and use an arc ("A") near the top
    expect(d.startsWith("M0 14")).toBe(true);
    expect(d).toContain("A4 4 0 0 1");
  });

  it("rounds the bottom corners for a negative bar", () => {
    const d = roundedBarPath(0, 10, 20, 100, 4, false);
    expect(d.startsWith("M0 10")).toBe(true);
    expect(d).toContain("100");
  });

  it("clamps the radius so it never exceeds half the bar width", () => {
    const d = roundedBarPath(0, 0, 6, 50, 20, true);
    expect(d).toContain("A3 3 0 0 1");
  });
});
