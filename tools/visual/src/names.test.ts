import { describe, expect, it } from "bun:test";
import { formatReferenceName, isReferenceName, parseInputState, parseReferenceName } from "./names";

describe("reference names", () => {
  it("reads a plain fixture as its light, desktop, closed state", () => {
    expect(parseReferenceName("catalog/actions/button")).toEqual({
      fixture: "catalog/actions/button",
      interaction: undefined,
      theme: "light",
      mobile: false,
    });
  });

  it("reads an interaction, the mobile width and the dark theme from the suffix", () => {
    expect(parseReferenceName("catalog/actions/all-selects@open+mobile+dark")).toEqual({
      fixture: "catalog/actions/all-selects",
      interaction: "open",
      theme: "dark",
      mobile: true,
    });
    expect(parseReferenceName("catalog/agents/plan@expanded")).toMatchObject({
      interaction: "expanded",
      theme: "light",
    });
    expect(parseReferenceName("message/mrkdwn@dark")).toMatchObject({
      interaction: undefined,
      theme: "dark",
    });
  });

  it("writes the suffix in one order, so each state has one name", () => {
    expect(
      formatReferenceName({
        fixture: "message/mrkdwn",
        interaction: "open",
        theme: "dark",
        mobile: true,
      }),
    ).toBe("message/mrkdwn@open+mobile+dark");
    expect(formatReferenceName({ fixture: "message/mrkdwn", theme: "light", mobile: false })).toBe(
      "message/mrkdwn",
    );
  });

  it("accepts the names import.ts may write and rejects the rest", () => {
    for (const ok of [
      "catalog/actions/button",
      "catalog/agents/plan@tasks-collapsed",
      "catalog/actions/all-selects@open+dark",
      "contexts/datepicker/modal-input@open+mobile+dark",
      "catalog/actions/button@hover-button-2",
      "catalog/actions/all-selects@focus-field-3+dark",
      "extra/modal/form@submit-errors",
      "catalog/data-visualization/bar-single-series@mobile+full",
      "catalog/card-and-carousel/carousel@scrolled-end+full+dark",
    ])
      expect(isReferenceName(ok)).toBe(true);
    for (const bad of [
      "../etc/passwd",
      "catalog/Button",
      "catalog/actions/button@",
      "catalog/actions/button@dark+open",
      "catalog/actions/button@open+confirm",
      "catalog/actions/button@dark+dark",
      "catalog/actions/button@hover-buton-1",
      "catalog/actions/button@hover-button-0",
      "catalog/actions/button@focus-button-01",
      "catalog/actions/button@hover-button",
      "catalog/table/simple-table@full+mobile",
      "catalog/table/simple-table@full+full",
    ])
      expect(isReferenceName(bad)).toBe(false);
  });

  it("reads the full layout as a modifier", () => {
    expect(parseReferenceName("catalog/table/simple-table@scrolled-end+mobile+full")).toEqual({
      fixture: "catalog/table/simple-table",
      interaction: "scrolled-end",
      theme: "light",
      mobile: true,
      full: true,
    });
    expect(parseReferenceName("catalog/table/simple-table@full").interaction).toBeUndefined();
  });

  it("reads the control a real-input state holds", () => {
    expect(parseInputState("hover-button-2")).toEqual({
      input: "hover",
      target: { kind: "button", index: 2 },
    });
    expect(parseInputState("focus-field-1")).toEqual({
      input: "focus",
      target: { kind: "field", index: 1 },
    });
    expect(parseInputState("open")).toBeUndefined();
    expect(parseInputState(undefined)).toBeUndefined();
    expect(() => parseInputState("hover-nope-1")).toThrow(/control address/);
  });
});
