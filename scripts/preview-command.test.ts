import { describe, expect, it } from "bun:test";
import { canDeployPreview, isPreviewCommand } from "./preview-command";

describe("isPreviewCommand", () => {
  it("matches /preview, ignoring surrounding whitespace", () => {
    expect(isPreviewCommand("/preview")).toBe(true);
    expect(isPreviewCommand("  /preview\r\n")).toBe(true);
  });

  it("rejects anything else, so quoting or mentioning the command deploys nothing", () => {
    expect(isPreviewCommand("/preview please")).toBe(false);
    expect(isPreviewCommand("> /preview\n\nlooks good")).toBe(false);
    expect(isPreviewCommand("/previews")).toBe(false);
    expect(isPreviewCommand("/Preview")).toBe(false);
    expect(isPreviewCommand("")).toBe(false);
  });
});

describe("canDeployPreview", () => {
  it("lets admins, maintainers and writers deploy", () => {
    for (const role of ["admin", "maintain", "write"]) {
      expect(canDeployPreview({ role, userType: "User" })).toBe(true);
    }
  });

  it("refuses triage, read and unknown roles", () => {
    for (const role of ["triage", "read", "none", ""]) {
      expect(canDeployPreview({ role, userType: "User" })).toBe(false);
    }
  });

  it("refuses bots, whatever their role", () => {
    expect(canDeployPreview({ role: "admin", userType: "Bot" })).toBe(false);
  });
});
