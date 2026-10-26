import { describe, expect, it } from "bun:test";
import {
  type Baselines,
  mergeReports,
  type Result,
  scoresPixels,
  updateBaselines,
} from "./baseline";
import { shard } from "./shard";

const result = (
  name: string,
  percent: number,
  findings: string[] = [],
  error?: string,
): Result => ({
  name,
  reference: { width: 100, height: 100 },
  actual: { width: 100, height: 100 },
  mismatch: percent * 100,
  ratio: percent / 100,
  ...(error
    ? { error }
    : { text: { matched: 0, differences: [], motion: [], missing: [], extra: [], findings } }),
});

const before: Baselines = {
  visual: { a: 1, b: 2, c: 3, removed: 4 },
  text: { a: ["x|a|0"], b: ["y|b|0", "z|b|0"], c: [], removed: ["w|r|0"] },
};
const tolerance = 0.5;

describe("updateBaselines", () => {
  // a improved, b regressed and lost a finding, c failed, new is new, removed is gone.
  const results = [
    result("a", 0.2),
    result("b", 5, ["y|b|0", "q|b|0"]),
    result("c", 100, [], "render failed"),
    result("new", 7, ["n|new|0"]),
  ];

  it("rewrites both baselines from a full run, dropping removed and failed fixtures", () => {
    expect(updateBaselines(before, results, { full: true, lowerOnly: false, tolerance })).toEqual({
      visual: { a: 0.2, b: 5, new: 7 },
      text: { a: [], b: ["y|b|0", "q|b|0"], new: ["n|new|0"] },
    });
  });

  it("only adds new fixtures and lowers improved ones with lowerOnly", () => {
    expect(updateBaselines(before, results, { full: true, lowerOnly: true, tolerance })).toEqual({
      visual: { a: 0.2, b: 2, c: 3, new: 7, removed: 4 },
      text: { a: [], b: ["y|b|0"], c: [], new: ["n|new|0"], removed: ["w|r|0"] },
    });
  });

  it("ignores an improvement within the tolerance", () => {
    const next = updateBaselines(before, [result("a", 0.6)], {
      full: true,
      lowerOnly: true,
      tolerance,
    });
    expect(next.visual.a).toBe(1);
  });

  it("only updates the fixtures a partial run ran", () => {
    expect(
      updateBaselines(before, [result("b", 5, ["q|b|0"])], {
        full: false,
        lowerOnly: false,
        tolerance,
      }),
    ).toEqual({
      visual: { a: 1, b: 5, c: 3, removed: 4 },
      text: { a: ["x|a|0"], b: ["q|b|0"], c: [], removed: ["w|r|0"] },
    });
  });

  it("records only the text findings of a submitted modal, whose errors Slack's preview never shows", () => {
    const submitted = "m@submit-errors+dark";
    const next = updateBaselines(
      { visual: { [submitted]: 5.67 }, text: {} },
      [result(submitted, 5.67, ["extra|Please complete this required field.|0"])],
      { full: false, lowerOnly: false, tolerance },
    );
    expect(next).toEqual({
      visual: {},
      text: { [submitted]: ["extra|Please complete this required field.|0"] },
    });
  });
});

describe("scoresPixels", () => {
  it("scores every reference but a submitted modal's", () => {
    expect(
      ["m", "m@open", "m@submit-errors", "m@submit-errors+mobile+dark"].map(scoresPixels),
    ).toEqual([true, true, false, false]);
  });
});

describe("mergeReports", () => {
  const references = ["a", "b", "c", "d", "e"];
  const slices = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      shard(references, `${i + 1}/${count}`).map((name) => result(name, 1)),
    );

  it("joins the slices of a sharded run into one full run's results", () => {
    expect(mergeReports(slices(3), references).map((r) => r.name)).toEqual(references);
  });

  it("counts a fixture that failed to render as covered", () => {
    const [first, ...rest] = slices(2);
    const failed = first!.map((r) => result(r.name, 100, [], "render failed"));
    expect(mergeReports([failed, ...rest], references)).toHaveLength(references.length);
  });

  it("fails when a slice is missing", () => {
    expect(() => mergeReports(slices(3).slice(1), references)).toThrow("no result for 2: a, d");
  });

  it("fails on results for a fixture without a reference", () => {
    expect(() => mergeReports([...slices(2), [result("gone", 1)]], references)).toThrow(
      "results without a reference: gone",
    );
  });

  it("fails when two slices ran the same fixture", () => {
    const [first] = slices(2);
    expect(() => mergeReports([...slices(2), first!], references)).toThrow(
      "more than one result: a, c, e",
    );
  });

  it("shortens a long list", () => {
    const many = Array.from({ length: 12 }, (_, i) => `f${String(i).padStart(2, "0")}`);
    expect(() => mergeReports([], many)).toThrow("f09 and 2 more");
  });
});
