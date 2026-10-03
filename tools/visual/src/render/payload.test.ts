import { describe, expect, it } from "bun:test";
import { readPayload } from "./payload";

describe("readPayload", () => {
  it("reads a bare array of blocks as a message", () => {
    expect(readPayload('[{ "type": "divider" }]')).toEqual({
      ok: true,
      surface: "message",
      blocks: [{ type: "divider" }],
    });
  });

  it('reads { "blocks": [...] } as a message', () => {
    expect(readPayload('{ "blocks": [{ "type": "divider" }] }')).toEqual({
      ok: true,
      surface: "message",
      blocks: [{ type: "divider" }],
    });
  });

  it("reads a modal as a view with the id Slack would give it", () => {
    expect(readPayload('{ "type": "modal", "blocks": [] }')).toEqual({
      ok: true,
      surface: "modal",
      view: { id: "V00000000", type: "modal", blocks: [] },
    });
  });

  it("reads a Home tab as a view", () => {
    const result = readPayload('{ "type": "home", "blocks": [] }');
    expect(result.ok && result.surface).toBe("home");
  });

  it("rejects a payload without blocks the way Block Kit Builder does", () => {
    expect(readPayload('{ "text": "hi" }')).toEqual({
      ok: false,
      error: 'Expected { "blocks": [...] } or an array',
    });
  });

  it("rejects a block without a string type", () => {
    expect(readPayload('[{ "type": "divider" }, {}]')).toEqual({
      ok: false,
      error: 'blocks[1] needs a string "type"',
    });
  });

  it("rejects invalid JSON with the parser's message", () => {
    const result = readPayload("{");
    expect(result.ok).toBe(false);
  });
});
