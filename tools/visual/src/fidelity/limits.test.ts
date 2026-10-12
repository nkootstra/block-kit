import { describe, expect, it } from "bun:test";
import { readPayloads } from "../lock";
import { LIMITS, violations } from "./limits";

describe("limits", () => {
  it("rejects what the Builder refused", () => {
    const long = "x".repeat(76);
    expect(
      violations({
        blocks: [
          {
            type: "actions",
            elements: [
              {
                type: "checkboxes",
                options: [{ text: { type: "plain_text", text: long }, value: "v" }],
              },
            ],
          },
        ],
      }).map((v) => v.limit),
    ).toEqual(["option-text"]);
    expect(
      violations({
        blocks: [
          {
            type: "actions",
            elements: [
              { type: "users_select", placeholder: { type: "plain_text", text: "x".repeat(151) } },
            ],
          },
        ],
      }).map((v) => v.limit),
    ).toEqual(["placeholder"]);
    expect(
      violations({
        blocks: [
          {
            type: "carousel",
            elements: [
              { type: "card", block_id: "a" },
              { type: "card", block_id: "a" },
            ],
          },
        ],
      }).map((v) => v.limit),
    ).toEqual(["unique-block-ids"]);
  });

  it("accepts content at the limit", () => {
    expect(
      violations({
        blocks: [{ type: "header", text: { type: "plain_text", text: "x".repeat(150) } }],
      }),
    ).toEqual([]);
  });

  it("names the refusal and acceptance evidence by fixture", () => {
    const evidence = LIMITS.flatMap((l) => [...(l.refused ?? []), ...(l.accepted ?? [])]);
    expect(evidence).toContain("extra/fidelity/checkboxes/long-content");
    expect(evidence).toContain("extra/fidelity/confirm/long-content");
  });

  it("holds for every fixture, except what the Builder was seen to accept", async () => {
    const broken: string[] = [];
    for (const [name, payload] of await readPayloads())
      for (const v of violations(payload, name)) broken.push(`${name}: ${v.limit} (${v.actual})`);
    expect(broken).toEqual([]);
  });
});
