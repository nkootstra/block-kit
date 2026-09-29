import { describe, expect, it } from "bun:test";
import { hashPayload, type Lock, sha256, verify } from "./lock";

const payload = { blocks: [{ type: "divider" }] };
const html = "<div>divider</div>";
const entry = { payload: hashPayload(payload), reference: sha256(html), captured: "2026-09-28" };

describe("hashPayload", () => {
  it("ignores key order and formatting", () => {
    expect(hashPayload(JSON.parse('{ "b": 1,\n  "a": [ {"y": 2, "x": 1} ] }'))).toBe(
      hashPayload({ a: [{ x: 1, y: 2 }], b: 1 }),
    );
  });

  it("changes with the payload's content", () => {
    expect(hashPayload({ a: [1, 2] })).not.toBe(hashPayload({ a: [2, 1] }));
  });
});

describe("verify", () => {
  const run = (lock: Lock, references: [string, string][], payloads: [string, unknown][]) =>
    verify(lock, new Map(references), new Map(payloads));

  it("accepts a reference captured from its current payload", () => {
    expect(run({ divider: entry }, [["divider", html]], [["divider", payload]])).toEqual({
      problems: [],
      uncaptured: [],
    });
  });

  it("matches a state reference to its fixture's payload", () => {
    const result = run({ "divider@open": entry }, [["divider@open", html]], [["divider", payload]]);
    expect(result.problems).toEqual([]);
  });

  it("flags a reference whose payload changed after the capture", () => {
    const result = run(
      { divider: entry },
      [["divider", html]],
      [["divider", { blocks: [{ type: "header" }] }]],
    );
    expect(result.problems).toEqual([
      {
        name: "divider",
        message: "payload changed since the 2026-09-28 capture; recapture it in Block Kit Builder",
      },
    ]);
  });

  it("flags a reference edited by hand", () => {
    const result = run(
      { divider: entry },
      [["divider", "<div>edited</div>"]],
      [["divider", payload]],
    );
    expect(result.problems.map((p) => p.message)).toEqual([
      "reference HTML differs from the captured snapshot; edit it through a normalize rule",
    ]);
  });

  it("flags references missing from the lock, and lock entries without a reference", () => {
    const result = run({ gone: entry }, [["divider", html]], [["divider", payload]]);
    expect(result.problems.map((p) => p.name)).toEqual(["divider", "gone"]);
  });

  it("flags a reference without a fixture", () => {
    expect(run({ divider: entry }, [["divider", html]], []).problems).toHaveLength(1);
  });

  it("reports fixtures that were never captured without failing them", () => {
    expect(run({}, [], [["divider", payload]])).toEqual({
      problems: [],
      uncaptured: ["divider"],
    });
  });
});
