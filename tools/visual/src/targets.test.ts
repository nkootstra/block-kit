import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { formatTarget, KINDS, OURS, parseTarget, SLACK } from "./targets";

const read = (file: string) => Bun.file(join(import.meta.dir, file)).text();

describe("control addresses", () => {
  it("reads <kind>-<n> and writes it back", () => {
    expect(parseTarget("button-2")).toEqual({ kind: "button", index: 2 });
    expect(formatTarget({ kind: "field", index: 12 })).toBe("field-12");
    for (const bad of ["button", "button-0", "button-01", "nope-1", "Button-1", "button-1-2"])
      expect(parseTarget(bad)).toBeUndefined();
  });

  // capture.js and observe.js run pasted into the Builder, without imports, so they carry the
  // selectors themselves.
  it("keeps the selectors the Builder-side scripts carry in step", async () => {
    const [capture, observe, payloadTest] = await Promise.all([
      read("capture.js"),
      read("observe.js"),
      read("../../../packages/block-kit/src/actionPayloads.test.tsx"),
    ]);
    const literal = (selector: string) => JSON.stringify(selector).slice(1, -1);
    for (const kind of KINDS) {
      for (const source of [capture, observe]) {
        const quoted = [`"${literal(SLACK[kind])}"`, `'${SLACK[kind]}'`];
        expect(quoted.some((q) => source.includes(q))).toBe(true);
      }
      const ours = [`"${OURS[kind]}"`, `'${OURS[kind]}'`];
      expect(ours.some((q) => observe.includes(q))).toBe(true);
      // The package's payload test replays probes with its own copy.
      expect(ours.some((q) => payloadTest.includes(q))).toBe(true);
    }
  });
});
