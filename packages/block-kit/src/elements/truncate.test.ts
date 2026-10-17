import { describe, expect, it } from "vitest";
import { truncate } from "./truncate";

describe("truncate", () => {
  const long = "This sentence is here to make the text long enough to wrap onto several lin";

  it("cuts a long label the way Slack does", () => {
    expect(truncate(long, 40)).toBe("This sentence is here to make the text l…");
    expect(truncate(long, 30)).toBe("This sentence is here to make…");
  });

  it("leaves a label at or under the limit alone", () => {
    expect(truncate("Approve", 40)).toBe("Approve");
    expect(truncate("x".repeat(40), 40)).toBe("x".repeat(40));
  });

  it("never splits an emoji", () => {
    expect(truncate(`${"a".repeat(39)}🎉🎉`, 40)).toBe(`${"a".repeat(39)}🎉…`);
  });
});
