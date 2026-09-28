import { describe, expect, it } from "vitest";
import { parse } from "./parse";

const inline = (text: string, verbatim = false) => parse(text, { verbatim }).children;

describe("parse", () => {
  it("keeps plain text and newlines", () => {
    expect(inline("hello\nworld")).toEqual([{ type: "text", value: "hello\nworld" }]);
  });

  it("decodes the three Slack entities", () => {
    expect(inline("a &amp; b &lt;c&gt;")).toEqual([{ type: "text", value: "a & b <c>" }]);
  });

  it("parses bold, italic and strike, including nesting", () => {
    expect(inline("*bold _both_* ~gone~")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", value: "bold " },
          { type: "italic", children: [{ type: "text", value: "both" }] },
        ],
      },
      { type: "text", value: " " },
      { type: "strike", children: [{ type: "text", value: "gone" }] },
    ]);
  });

  it("requires word boundaries around markers", () => {
    expect(inline("snake_case_name")).toEqual([{ type: "text", value: "snake_case_name" }]);
    expect(inline("2*3*4")).toEqual([{ type: "text", value: "2*3*4" }]);
  });

  it("rejects spans with padding whitespace or that cross lines", () => {
    expect(inline("* not bold *")).toEqual([{ type: "text", value: "* not bold *" }]);
    expect(inline("*a\nb*")).toEqual([{ type: "text", value: "*a\nb*" }]);
  });

  it("does not format inside inline code", () => {
    expect(inline("`*x*` y")).toEqual([
      { type: "code", value: "*x*" },
      { type: "text", value: " y" },
    ]);
  });

  it("parses preformatted blocks and trims fence newlines", () => {
    expect(inline("before\n```\nconst a = 1 &lt; 2;\n```\nafter")).toEqual([
      { type: "text", value: "before" },
      { type: "preformatted", value: "const a = 1 < 2;" },
      { type: "text", value: "after" },
    ]);
  });

  it("groups quote lines and supports >>>", () => {
    expect(inline("&gt; one\n> two\nthree")).toEqual([
      { type: "quote", children: [{ type: "text", value: "one\ntwo" }] },
      { type: "text", value: "three" },
    ]);
    expect(inline("a\n>>> b\nc")).toEqual([
      { type: "text", value: "a" },
      { type: "quote", children: [{ type: "text", value: "b\nc" }] },
    ]);
  });

  it("parses links with and without labels", () => {
    expect(inline("<https://slack.com|*Slack*> <mailto:a@b.co>")).toEqual([
      {
        type: "link",
        url: "https://slack.com",
        children: [{ type: "bold", children: [{ type: "text", value: "Slack" }] }],
      },
      { type: "text", value: " " },
      { type: "link", url: "mailto:a@b.co" },
    ]);
  });

  it("auto-links bare URLs unless verbatim", () => {
    expect(inline("see https://slack.com.")).toEqual([
      { type: "text", value: "see " },
      {
        type: "link",
        url: "https://slack.com",
        children: [{ type: "text", value: "https://slack.com" }],
      },
      { type: "text", value: "." },
    ]);
    expect(inline("see https://slack.com", true)).toEqual([
      { type: "text", value: "see https://slack.com" },
    ]);
  });

  it("parses mentions, broadcasts and user groups", () => {
    expect(inline("<@U1> <#C1|general> <!subteam^S1|@devs> <!here>")).toEqual([
      { type: "user", id: "U1" },
      { type: "text", value: " " },
      { type: "channel", id: "C1", label: "general" },
      { type: "text", value: " " },
      { type: "usergroup", id: "S1", label: "@devs" },
      { type: "text", value: " " },
      { type: "broadcast", range: "here" },
    ]);
  });

  it("parses dates with optional link", () => {
    expect(inline("<!date^1392734382^{date_short} at {time}^https://x.co|Feb 18>")).toEqual([
      {
        type: "date",
        timestamp: 1392734382,
        format: "{date_short} at {time}",
        url: "https://x.co",
        fallback: "Feb 18",
      },
    ]);
  });

  it("parses emoji with skin tones", () => {
    expect(inline(":wave: :thumbsup::skin-tone-3:")).toEqual([
      { type: "emoji", name: "wave" },
      { type: "text", value: " " },
      { type: "emoji", name: "thumbsup", skinTone: 3 },
    ]);
  });

  it("keeps unrecognized angle markup as text", () => {
    expect(inline("a <b> c")).toEqual([{ type: "text", value: "a <b> c" }]);
  });
});
