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
