import { describe, expect, it } from "vitest";
import type { StateValues } from "./context";
import type { Json } from "./types";
import { VALIDATION_MESSAGES, validateView } from "./validation";

const plain = (text: string) => ({ type: "plain_text", text });

function input(blockId: string, element: Json, optional = false): Json {
  return { type: "input", block_id: blockId, label: plain(blockId), optional, element };
}

function text(type: string, value: string) {
  return { type, value };
}

describe("validateView", () => {
  it("flags required inputs left empty, and skips optional ones", () => {
    const blocks = [
      input("name", { type: "plain_text_input", action_id: "a" }),
      input("notes", { type: "plain_text_input", action_id: "a" }, true),
      input("tags", { type: "checkboxes", action_id: "a", options: [] }),
      input("when", { type: "datepicker", action_id: "a" }),
    ];
    const state: StateValues = {
      name: { a: text("plain_text_input", "") },
      tags: { a: { type: "checkboxes", selected_options: [] } },
      when: { a: { type: "datepicker", selected_date: null } },
    };
    expect(validateView(blocks, state)).toEqual({
      name: VALIDATION_MESSAGES.required,
      tags: VALIDATION_MESSAGES.required,
      when: VALIDATION_MESSAGES.required,
    });
  });

  it("uses block-<index> for input blocks without a block_id, and ignores other blocks", () => {
    const blocks = [
      { type: "section", text: plain("Intro") },
      { type: "input", label: plain("Name"), element: { type: "plain_text_input" } },
    ];
    expect(validateView(blocks, {})).toEqual({ "block-1": VALIDATION_MESSAGES.required });
    expect(validateView(blocks, { "block-1": { "": text("plain_text_input", "Ada") } })).toEqual(
      {},
    );
  });

  it("treats a rich text value with only whitespace as empty", () => {
    const blocks = [input("body", { type: "rich_text_input", action_id: "a" })];
    const richText = (t: string) => ({
      type: "rich_text",
      elements: [{ type: "rich_text_section", elements: [{ type: "text", text: t }] }],
    });
    expect(
      validateView(blocks, {
        body: { a: { type: "rich_text_input", rich_text_value: richText(" ") } },
      }),
    ).toEqual({ body: VALIDATION_MESSAGES.required });
    expect(
      validateView(blocks, {
        body: { a: { type: "rich_text_input", rich_text_value: richText("Hi") } },
      }),
    ).toEqual({});
  });

  it("checks plain text min_length and max_length", () => {
    const blocks = [
      input("code", { type: "plain_text_input", action_id: "a", min_length: 3, max_length: 5 }),
    ];
    const check = (value: string) =>
      validateView(blocks, { code: { a: text("plain_text_input", value) } });
    expect(check("ab")).toEqual({ code: VALIDATION_MESSAGES.minLength(3) });
    expect(check("abcdef")).toEqual({ code: VALIDATION_MESSAGES.maxLength(5) });
    expect(check("abcd")).toEqual({});
  });

  it("checks number format, whole numbers and range", () => {
    const blocks = [
      input("count", { type: "number_input", action_id: "a", min_value: "1", max_value: "10" }),
      input("ratio", { type: "number_input", action_id: "a", is_decimal_allowed: true }),
    ];
    const check = (count: string, ratio = "0.5") =>
      validateView(blocks, {
        count: { a: text("number_input", count) },
        ratio: { a: text("number_input", ratio) },
      });
    expect(check("-")).toEqual({ count: VALIDATION_MESSAGES.number });
    expect(check("2.5")).toEqual({ count: VALIDATION_MESSAGES.wholeNumber });
    expect(check("0")).toEqual({ count: VALIDATION_MESSAGES.minValue("1") });
    expect(check("11")).toEqual({ count: VALIDATION_MESSAGES.maxValue("10") });
    expect(check("7", "3.25")).toEqual({});
  });

  it("checks email and URL format", () => {
    const blocks = [
      input("email", { type: "email_text_input", action_id: "a" }),
      input("site", { type: "url_text_input", action_id: "a" }),
    ];
    const check = (email: string, site: string) =>
      validateView(blocks, {
        email: { a: text("email_text_input", email) },
        site: { a: text("url_text_input", site) },
      });
    expect(check("ada", "example.com")).toEqual({
      email: VALIDATION_MESSAGES.email,
      site: VALIDATION_MESSAGES.url,
    });
    expect(check("ada@example.com", "ftp://example.com")).toEqual({
      site: VALIDATION_MESSAGES.url,
    });
    expect(check("ada@example.com", "https://example.com")).toEqual({});
  });

  it("doesn't format-check an optional input left empty", () => {
    const blocks = [input("email", { type: "email_text_input", action_id: "a" }, true)];
    expect(validateView(blocks, { email: { a: text("email_text_input", "") } })).toEqual({});
  });
});
