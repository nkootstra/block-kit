import { describe, expect, it } from "bun:test";
import { coverage, expectedStates } from "./coverage";

const select = {
  blocks: [{ type: "actions", elements: [{ type: "static_select", action_id: "s", options: [] }] }],
};
const confirmButton = {
  blocks: [{ type: "actions", elements: [{ type: "button", action_id: "b", confirm: {} }] }],
};
const accessoryMulti = {
  blocks: [{ type: "section", accessory: { type: "multi_static_select", action_id: "m" } }],
};
const text = { blocks: [{ type: "section", text: { type: "mrkdwn", text: "Hi" } }] };

describe("coverage", () => {
  it("expects every fixture in light, dark and mobile, plus the states its controls have", () => {
    expect(expectedStates(text)).toEqual(["", "@mobile", "@dark"]);
    expect(expectedStates(select)).toEqual(["", "@mobile", "@dark", "@open", "@open+dark"]);
    expect(expectedStates(confirmButton)).toContain("@confirm");
    expect(expectedStates(confirmButton)).toContain("@confirm+dark");
    expect(expectedStates(accessoryMulti)).toContain("@dialog");
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
        missing: ["@mobile", "@dark", "@open+dark"],
        recording: true,
      },
      { fixture: "a/text", have: ["", "@dark"], missing: ["@mobile"], recording: undefined },
    ]);
    expect(report.totals).toEqual({
      expected: 8,
      captured: 4,
      recordings: { expected: 1, have: 1 },
    });
  });
});
