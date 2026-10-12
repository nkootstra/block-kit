import { describe, expect, it } from "bun:test";
import { diffScrollers } from "./scrollers";

const s = (scrollWidth: number, clientWidth: number) => ({
  scrollWidth,
  clientWidth,
  scrollLeft: 0,
});

describe("scroll containers", () => {
  it("pairs the overflowing containers in order and compares their widths", () => {
    expect(diffScrollers([s(400, 320), s(500, 500)], [s(500, 500), s(400.5, 320)])).toEqual([]);
    expect(diffScrollers([s(400, 320)], [s(380, 320)])).toEqual([
      "scroller 1 scrollWidth: Slack 400px, ours 380px",
    ]);
  });

  it("reports content Slack scrolls and ours fits, or the other way round", () => {
    expect(diffScrollers([s(400, 320)], [s(320, 320)])).toEqual([
      "Slack has 1 overflowing scroll containers, ours 0",
    ]);
  });
});
