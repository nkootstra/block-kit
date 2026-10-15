import { describe, expect, it } from "bun:test";
import { type Baselines, type Result, updateBaselines } from "./baseline";

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
});
