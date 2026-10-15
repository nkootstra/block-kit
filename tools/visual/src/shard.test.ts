import { describe, expect, it } from "bun:test";
import { shard } from "./shard";

describe("shard", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g"];

  it("keeps everything without a spec", () => {
    expect(shard(names, undefined)).toEqual(names);
  });

  it("deals the names out in turn, so the slices together cover each name once", () => {
    const slices = [1, 2, 3].map((i) => shard(names, `${i}/3`));
    expect(slices).toEqual([
      ["a", "d", "g"],
      ["b", "e"],
      ["c", "f"],
    ]);
    expect(slices.flat().toSorted()).toEqual(names);
  });

  it("refuses a slice outside the count", () => {
    for (const spec of ["0/3", "4/3", "1/0", "2", "a/b"]) {
      expect(() => shard(names, spec)).toThrow("--shard");
    }
  });
});
