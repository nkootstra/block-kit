import { describe, expect, it } from "bun:test";
import { coverage, expectedInputStates, expectedStates } from "./coverage";

const select = {
  blocks: [
    {
      type: "actions",
      elements: [{ type: "static_select", action_id: "s", options: [] }],
    },
  ],
};
const confirmButton = {
  blocks: [
    {
      type: "actions",
      elements: [{ type: "button", action_id: "b", confirm: {} }],
    },
  ],
};
const accessoryMulti = {
  blocks: [
    {
      type: "section",
      accessory: { type: "multi_static_select", action_id: "m" },
    },
  ],
};
const text = {
  blocks: [{ type: "section", text: { type: "mrkdwn", text: "Hi" } }],
};

describe("coverage", () => {
  it("expects every fixture in light, dark, mobile and dark mobile, plus the states its controls have", () => {
    expect(expectedStates(text)).toEqual(["", "@mobile", "@dark", "@mobile+dark"]);
    expect(expectedStates(select)).toEqual([
      "",
      "@mobile",
      "@dark",
      "@mobile+dark",
      "@open",
      "@open+dark",
    ]);
    expect(expectedStates(confirmButton)).toContain("@confirm");
    expect(expectedStates(confirmButton)).toContain("@confirm+dark");
    expect(expectedStates(accessoryMulti)).toContain("@dialog");
  });

  it("expects no mobile width for App Home or a modal, whose Builder preview is desktop only", () => {
    expect(expectedStates({ type: "home", ...text })).toEqual(["", "@dark"]);
    expect(expectedStates({ type: "modal", ...select })).toEqual([
      "",
      "@dark",
      "@open",
      "@open+dark",
    ]);
  });

  it("asks for a payload recording for every fixture with an interactive element", () => {
    const report = coverage(
      new Map<string, unknown>([
        ["a/select", select],
        ["a/text", text],
      ]),
      new Set(["a/select", "a/select@open", "a/text", "a/text@dark"]),
      new Set(["a/select@pick"]),
    );
    expect(report.rows).toEqual([
      {
        fixture: "a/select",
        have: ["", "@open"],
        missing: ["@mobile", "@dark", "@mobile+dark", "@open+dark"],
        recording: true,
        input: { have: [], missing: ["@hover-field-1", "@focus-field-1"] },
      },
      {
        fixture: "a/text",
        have: ["", "@dark"],
        missing: ["@mobile", "@mobile+dark"],
        recording: undefined,
        input: { have: [], missing: [] },
      },
    ]);
    expect(report.totals).toEqual({
      expected: 10,
      captured: 4,
      recordings: { expected: 1, have: 1 },
      input: { expected: 2, captured: 0 },
      behaviour: { expected: 0, have: 0, missing: [] },
    });
  });

  it("expects hover and focus on the first control of each kind, counted on their own", () => {
    expect(expectedInputStates(select)).toEqual(["@hover-field-1", "@focus-field-1"]);
    expect(expectedInputStates(text)).toEqual([]);
    expect(
      expectedInputStates({
        type: "modal",
        submit: { type: "plain_text", text: "Go" },
        blocks: [
          { type: "actions", elements: [{ type: "button" }, { type: "overflow" }] },
          { type: "input", element: { type: "plain_text_input" } },
        ],
      }),
    ).toEqual([
      "@hover-button-1",
      "@focus-button-1",
      "@hover-overflow-1",
      "@focus-overflow-1",
      "@hover-input-1",
      "@focus-input-1",
      "@hover-submit-1",
      "@focus-submit-1",
    ]);
  });

  // Block Kit Builder doesn't validate a modal: submitted empty, it shows no errors.
  it("doesn't expect a submitted modal's errors, which Block Kit Builder doesn't show", () => {
    const modal = (optional: boolean) => ({
      type: "modal",
      submit: { type: "plain_text", text: "Go" },
      blocks: [{ type: "input", optional, element: { type: "plain_text_input" } }],
    });
    expect(expectedStates(modal(false))).not.toContain("@submit-errors");
  });

  it("expects wide content in full and scrolled to its end", () => {
    const chart = { blocks: [{ type: "data_visualization" }] };
    expect(expectedStates(chart)).toEqual([
      "",
      "@mobile",
      "@dark",
      "@mobile+dark",
      "@mobile+full",
      "@scrolled-end+mobile",
    ]);
    expect(expectedStates({ type: "modal", blocks: [{ type: "table" }] })).toEqual([
      "",
      "@dark",
      "@full",
    ]);
  });

  it("asks for a recording of every behaviour probe", () => {
    const report = coverage(new Map(), new Set(), new Set(), {
      specs: new Set(["a/select@arrows", "a/select@typeahead"]),
      recorded: new Set(["a/select@arrows"]),
    });
    expect(report.totals.behaviour).toEqual({
      expected: 2,
      have: 1,
      missing: ["a/select@typeahead"],
    });
  });
});
