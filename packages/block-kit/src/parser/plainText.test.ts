import { describe, expect, it } from "vitest";
import { parsePlainTextEmoji } from "./plainText";

describe("parsePlainTextEmoji", () => {
  it("keeps plain text as-is when there's no shortcode", () => {
    expect(parsePlainTextEmoji("hello world")).toEqual([{ type: "text", value: "hello world" }]);
  });

  it("extracts emoji shortcodes, including skin tones", () => {
    expect(parsePlainTextEmoji("Nice :+1::skin-tone-3: work")).toEqual([
      { type: "text", value: "Nice " },
      { type: "emoji", name: "+1", skinTone: 3 },
      { type: "text", value: " work" },
    ]);
  });

  it("does not apply mrkdwn formatting", () => {
    expect(parsePlainTextEmoji("*not bold* <@U1>")).toEqual([
      { type: "text", value: "*not bold* <@U1>" },
    ]);
  });
});
