import { describe, expect, it } from "bun:test";
import { checkTextBaseline, compareTextRuns, type TextRun, updateTextBaseline } from "./textRuns";

const run = (text: string, overrides: Partial<TextRun> = {}): TextRun => ({
  text,
  x: 10,
  y: 20,
  width: 100,
  fontSize: 15,
  fontWeight: 400,
  fontStyle: "normal",
  color: "rgb(29, 28, 29)",
  opacity: 1,
  background: "rgb(255, 255, 255)",
  ...overrides,
});

describe("compareTextRuns motion", () => {
  const ease = "transition background-color 0.08s cubic-bezier(0.36, 0.19, 0.29, 1) 0s";

  it("reports a run whose element moves differently from Slack's", () => {
    const report = compareTextRuns(
      [run("Save", { motion: ease })],
      [run("Save", { motion: "transition background-color 0.15s ease 0s" })],
    );
    expect(report.motion).toEqual([
      { text: "Save", reference: ease, ours: "transition background-color 0.15s ease 0s" },
    ]);
  });

  it("reports motion Slack has and we don't", () => {
    const report = compareTextRuns([run("Save", { motion: ease })], [run("Save", { motion: "" })]);
    expect(report.motion).toEqual([{ text: "Save", reference: ease, ours: "none" }]);
  });

  it("says nothing when the reference recorded no motion", () => {
    const report = compareTextRuns([run("Save")], [run("Save", { motion: ease })]);
    expect(report.motion).toEqual([]);
  });

  it("reports one element once, however many runs it holds", () => {
    const report = compareTextRuns(
      [run("Save", { motion: ease }), run("Save", { motion: ease })],
      [run("Save", { motion: "" }), run("Save", { motion: "" })],
    );
    expect(report.motion).toHaveLength(1);
  });

  it("keeps motion out of the findings, so a text baseline never fails on it", () => {
    const report = compareTextRuns([run("Save", { motion: ease })], [run("Save", { motion: "" })]);
    expect(report.findings).toEqual([]);
  });
});

describe("compareTextRuns", () => {
  it("matches identical runs without flagging anything", () => {
    const report = compareTextRuns([run("Hello")], [run("Hello")]);
    expect(report.matched).toBe(1);
    expect(report.differences).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(report.extra).toEqual([]);
  });

  it("flags a run that moved by more than half a pixel", () => {
    const report = compareTextRuns([run("Hello", { x: 10 })], [run("Hello", { x: 13.33 })]);
    expect(report.differences).toEqual([
      { text: "Hello", property: "x", reference: "10", ours: "13.33" },
    ]);
  });

  it("ignores sub-pixel movement within half a pixel", () => {
    const report = compareTextRuns(
      [run("Hello", { y: 20, width: 100 })],
      [run("Hello", { y: 20.4, width: 99.6 })],
    );
    expect(report.differences).toEqual([]);
  });

  it("flags a different width, font size, weight and style", () => {
    const report = compareTextRuns(
      [run("Hello", { width: 100, fontSize: 15, fontWeight: 700, fontStyle: "italic" })],
      [run("Hello", { width: 96.67, fontSize: 13, fontWeight: 400, fontStyle: "normal" })],
    );
    expect(report.differences.map((d) => d.property)).toEqual([
      "width",
      "font-size",
      "font-weight",
      "font-style",
    ]);
  });

  it("flags a colour three RGB steps off", () => {
    const report = compareTextRuns(
      [run("We'll only use this for receipts.", { color: "rgb(94, 93, 96)" })],
      [run("We'll only use this for receipts.", { color: "rgb(97, 96, 97)" })],
    );
    expect(report.differences).toEqual([
      {
        text: "We'll only use this for receipts.",
        property: "color",
        reference: "rgb(94, 93, 96)",
        ours: "rgb(97, 96, 97)",
      },
    ]);
  });

  it("compares colour as painted: a translucent colour over white equals its opaque blend", () => {
    const report = compareTextRuns(
      [run("Subtext", { color: "rgba(29, 28, 29, 0.7)" })],
      [run("Subtext", { color: "rgb(97, 96, 97)" })],
    );
    expect(report.differences).toEqual([]);
  });

  it("compares colour as painted: element opacity equals the same alpha in the colour", () => {
    const report = compareTextRuns(
      [run("This block isn't supported", { color: "rgba(29, 28, 29, 0.5)" })],
      [run("This block isn't supported", { color: "rgb(29, 28, 29)", opacity: 0.5 })],
    );
    expect(report.differences).toEqual([]);
  });

  it("blends a translucent colour over the run's own background", () => {
    const report = compareTextRuns(
      [run("Dark", { color: "rgba(255, 255, 255, 0.5)", background: "rgb(0, 0, 0)" })],
      [run("Dark", { color: "rgba(255, 255, 255, 0.5)", background: "rgb(255, 255, 255)" })],
    );
    expect(report.differences).toEqual([
      {
        text: "Dark",
        property: "color",
        reference: "rgb(128, 128, 128)",
        ours: "rgb(255, 255, 255)",
      },
    ]);
  });

  it("matches runs in order and reports the ones only one side has", () => {
    const report = compareTextRuns(
      [run("Title"), run("(optional)"), run("Body")],
      [run("Title"), run("Body"), run("Press 'enter' to submit")],
    );
    expect(report.matched).toBe(2);
    expect(report.missing.map((r) => r.text)).toEqual(["(optional)"]);
    expect(report.extra.map((r) => r.text)).toEqual(["Press 'enter' to submit"]);
  });

  it("pairs repeated texts in order rather than all with the first", () => {
    const report = compareTextRuns(
      [run("Option", { y: 0 }), run("Option", { y: 30 })],
      [run("Option", { y: 0 }), run("Option", { y: 30 })],
    );
    expect(report.matched).toBe(2);
    expect(report.differences).toEqual([]);
  });

  it("matches texts that differ only in whitespace", () => {
    const report = compareTextRuns(
      [run("Press  'enter'\nto submit")],
      [run(" Press 'enter' to submit")],
    );
    expect(report.matched).toBe(1);
  });
});

describe("finding keys", () => {
  it("keys a difference by property, text and occurrence among runs with that text", () => {
    const report = compareTextRuns(
      [run("Option"), run("Option", { color: "rgb(94, 93, 96)" })],
      [run("Option"), run("Option", { color: "rgb(97, 96, 97)" })],
    );
    expect(report.findings).toEqual(["color|Option|1"]);
  });

  it("keys runs only one side has as missing or extra", () => {
    const report = compareTextRuns([run("Title"), run("(optional)")], [run("Title"), run("Hint")]);
    expect(report.findings).toEqual(["missing|(optional)|0", "extra|Hint|0"]);
  });
});

describe("checkTextBaseline", () => {
  it("fails when one finding is fixed and another appears, even though the count is unchanged", () => {
    const verdict = checkTextBaseline(
      { "input/hint": ["x|Press 'enter' to submit|0"] },
      { "input/hint": ["color|We'll only use this for receipts.|0"] },
    );
    expect(verdict.failures).toEqual(["input/hint: new text finding x|Press 'enter' to submit|0"]);
    expect(verdict.improved).toEqual([
      "input/hint: resolved text finding color|We'll only use this for receipts.|0",
    ]);
  });

  it("passes a fixture whose findings are all in its baseline", () => {
    const verdict = checkTextBaseline({ same: ["color|A|0"] }, { same: ["color|A|0", "x|B|0"] });
    expect(verdict.failures).toEqual([]);
    expect(verdict.improved).toEqual(["same: resolved text finding x|B|0"]);
  });

  it("reports a fixture without a baseline entry instead of failing it", () => {
    const verdict = checkTextBaseline({ fresh: ["color|A|0", "x|B|0"] }, {});
    expect(verdict.failures).toEqual([]);
    expect(verdict.unrecorded).toEqual(["fresh: 2 text findings"]);
  });
});

describe("updateTextBaseline", () => {
  it("records every fixture's findings on a full run, dropping fixtures no longer compared", () => {
    expect(
      updateTextBaseline(
        { gone: ["x|A|0"], kept: ["x|B|0"] },
        { kept: ["color|C|0"] },
        { full: true, lowerOnly: false },
      ),
    ).toEqual({ kept: ["color|C|0"] });
  });

  it("keeps fixtures a filtered run didn't compare", () => {
    expect(
      updateTextBaseline(
        { other: ["x|A|0"], kept: ["x|B|0"] },
        { kept: ["color|C|0"] },
        { full: false, lowerOnly: false },
      ),
    ).toEqual({ kept: ["color|C|0"], other: ["x|A|0"] });
  });

  it("with lowerOnly drops resolved findings, never adds new ones, and records new fixtures", () => {
    expect(
      updateTextBaseline(
        { known: ["color|A|0", "x|B|0"] },
        { known: ["color|A|0", "width|C|0"], fresh: ["x|D|0"] },
        { full: true, lowerOnly: true },
      ),
    ).toEqual({ fresh: ["x|D|0"], known: ["color|A|0"] });
  });
});
