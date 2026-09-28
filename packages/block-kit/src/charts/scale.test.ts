import { describe, expect, it } from "vitest";
import { crispLine, formatTick, niceLinearScale } from "./scale";

describe("niceLinearScale", () => {
  it("picks a step of 300 for a 0-1720 range (matches line-single-series fixture)", () => {
    const scale = niceLinearScale(0, 1720);
    expect(scale.step).toBe(300);
    expect(scale.ticks).toEqual([0, 300, 600, 900, 1200, 1500, 1800]);
  });

  it("picks a step of 100 and keeps 0 in range for negative data (area-negative-values fixture)", () => {
    const scale = niceLinearScale(-200, 150);
    expect(scale.step).toBe(100);
    expect(scale.ticks).toEqual([-200, -100, 0, 100, 200]);
  });

  it("picks a step of 2 for a small mixed-sign range (bar-negative-values fixture)", () => {
    const scale = niceLinearScale(-2, 6);
    expect(scale.step).toBe(2);
    expect(scale.ticks).toEqual([-2, 0, 2, 4, 6]);
  });

  it("always includes 0 even when all data is positive", () => {
    const scale = niceLinearScale(120, 480);
    expect(scale.min).toBeLessThanOrEqual(0);
    expect(scale.ticks[0]).toBe(scale.min);
  });

  it("always includes 0 even when all data is negative", () => {
    const scale = niceLinearScale(-480, -120);
    expect(scale.max).toBeGreaterThanOrEqual(0);
    expect(scale.ticks.at(-1)).toBe(scale.max);
  });

  it("does not divide by zero when min equals max", () => {
    const scale = niceLinearScale(5, 5);
    expect(Number.isFinite(scale.step)).toBe(true);
    expect(scale.ticks.length).toBeGreaterThan(1);
  });
});

describe("formatTick", () => {
  it("formats with thousands separators the way Slack's Builder does", () => {
    expect(formatTick(1800)).toBe("1,800");
    expect(formatTick(0)).toBe("0");
    expect(formatTick(-200)).toBe("-200");
  });
});

describe("crispLine", () => {
  it("moves a 1px gridline onto a pixel row the way Slack's charts do", () => {
    // Tick positions and the gridline y each became in Block Kit Builder's charts.
    const slack: [number, number][] = [
      [334, 334.5],
      [279.8333, 280.5],
      [225.6667, 225.5],
      [171.5, 171.5],
      [117.3333, 117.5],
      [63.1667, 63.5],
      [9, 9.5],
      [252.75, 253.5],
      [90.25, 90.5],
    ];
    for (const [y, expected] of slack) expect(crispLine(y)).toBe(expected);
  });
});
