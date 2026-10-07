import { describe, expect, it } from "bun:test";
import { formatReferenceName, isReferenceName, parseReferenceName } from "./names";

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
    ])
      expect(isReferenceName(ok)).toBe(true);
    for (const bad of [
      "../etc/passwd",
      "catalog/Button",
      "catalog/actions/button@",
      "catalog/actions/button@dark+open",
      "catalog/actions/button@open+confirm",
      "catalog/actions/button@dark+dark",
    ])
      expect(isReferenceName(bad)).toBe(false);
  });
});
