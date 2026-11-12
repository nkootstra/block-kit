import { describe, expect, it } from "vitest";
import { inert } from "./payloadValues";

describe("inert", () => {
  it("returns a payload without a toString or valueOf key as the same objects", () => {
    const payload = JSON.parse('{"blocks":[{"type":"divider","block_id":"a"}],"text":"x"}');
    expect(inert(payload)).toBe(payload);
    expect(inert(payload.blocks[0])).toBe(payload.blocks[0]);
  });

  it("drops a toString or valueOf that isn't a function, wherever it is", () => {
    const payload = JSON.parse(
      '{"blocks":[{"type":"divider","block_id":{"toString":1,"valueOf":{},"a":1}}],"toString":"x"}',
    );
    const clean = inert(payload);
    expect(clean).toEqual({ blocks: [{ type: "divider", block_id: { a: 1 } }] });
    expect(() => `${clean.blocks[0].block_id}`).not.toThrow();
    // The payload it was given is left as it was.
    expect(payload.blocks[0].block_id.toString).toBe(1);
  });

  it("returns a cleaned copy as it is", () => {
    const clean = inert(JSON.parse('{"blocks":[{"type":"divider","block_id":{"toString":1}}]}'));
    expect(inert(clean)).toBe(clean);
  });

  it("checks a payload again after it changes in place", () => {
    const payload = JSON.parse('{"blocks":[{"type":"divider","block_id":"a"}]}');
    expect(inert(payload)).toBe(payload);
    payload.blocks[0].block_id = JSON.parse('{"toString":1}');
    const clean = inert(payload);
    expect(clean).not.toBe(payload);
    expect(() => `${clean.blocks[0].block_id}`).not.toThrow();
  });

  it("walks an object it meets twice once, and keeps it one object", () => {
    const shared = JSON.parse('{"toString":1,"a":1}');
    const clean = inert({ x: shared, y: [shared] });
    expect(clean.x).toEqual({ a: 1 });
    expect(clean.y[0]).toBe(clean.x);
  });

  it("keeps a __proto__ key an own key, as JSON.parse leaves it", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true},"x":{"toString":1}}');
    const clean = inert(payload);
    expect(Object.hasOwn(clean, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(clean)).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("ends on an object that contains itself", () => {
    const payload: Record<string, unknown> = { toString: 1 };
    payload.self = payload;
    expect(() => inert(payload)).not.toThrow();
  });

  it("leaves values that aren't plain objects or arrays alone", () => {
    const date = new Date(0);
    expect(inert(date)).toBe(date);
    expect(inert("x")).toBe("x");
    expect(inert(null)).toBe(null);
  });
});
