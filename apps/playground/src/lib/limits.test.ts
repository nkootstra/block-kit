import type { AnyBlock } from "@slack/types";
import { describe, expect, it } from "vitest";
import { limitWarnings } from "./limits";

const section = (text = "x") => ({ type: "section", text: { type: "mrkdwn", text } }) as AnyBlock;
const header = (text: string) =>
  ({ type: "header", text: { type: "plain_text", text } }) as AnyBlock;
const many = (n: number) => Array.from({ length: n }, () => section());

describe("limitWarnings", () => {
  it("has nothing to say about a payload within the limits", () => {
    expect(limitWarnings({ blocks: many(50) }, "message")).toEqual([]);
    expect(limitWarnings({ blocks: many(100) }, "modal")).toEqual([]);
    expect(limitWarnings({ blocks: many(100) }, "home")).toEqual([]);
    expect(
      limitWarnings({ blocks: [section("x".repeat(3000)), header("x".repeat(150))] }, "message"),
    ).toEqual([]);
  });

  it("counts blocks against the surface's limit", () => {
    expect(limitWarnings({ blocks: many(51) }, "message")).toEqual([
      "51 blocks: Slack allows 50 in a message.",
    ]);
    expect(limitWarnings({ blocks: many(101) }, "modal")).toEqual([
      "101 blocks: Slack allows 100 in a modal.",
    ]);
    expect(limitWarnings({ blocks: many(101) }, "home")).toEqual([
      "101 blocks: Slack allows 100 in a Home tab.",
    ]);
  });

  it("measures section and header text", () => {
    expect(
      limitWarnings({ blocks: [section("x".repeat(3001)), header("x".repeat(151))] }, "message"),
    ).toEqual([
      "blocks[0] (section) has 3,001 characters of text; Slack allows 3,000.",
      "blocks[1] (header) has 151 characters of text; Slack allows 150.",
    ]);
  });

  it("measures a modal's title, submit and close", () => {
    const long = { type: "plain_text", text: "x".repeat(25) };
    const view = {
      type: "modal",
      title: long,
      submit: long,
      close: { type: "plain_text", text: "OK" },
    };
    expect(limitWarnings({ blocks: [], view }, "modal")).toEqual([
      "The modal's title has 25 characters; Slack allows 24.",
      "The modal's submit has 25 characters; Slack allows 24.",
    ]);
  });

  it("counts attachments and checks their blocks", () => {
    const attachments = Array.from({ length: 101 }, () => ({ text: "x" }));
    attachments[0] = { blocks: [section("x".repeat(3001))] } as never;
    expect(limitWarnings({ blocks: [], message: { attachments } }, "message")).toEqual([
      "101 attachments: Slack allows 100 in a message.",
      "attachments[0].blocks[0] (section) has 3,001 characters of text; Slack allows 3,000.",
    ]);
  });

  it("ignores blocks with no text, or text that isn't a text object", () => {
    expect(
      limitWarnings(
        { blocks: [{ type: "divider" }, { type: "section", text: "x" } as never] },
        "message",
      ),
    ).toEqual([]);
  });
});
