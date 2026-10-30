import { describe, expect, it } from "vitest";
import { type ParseResult, parsePayload, readHash } from "./payload";

const section = { type: "section", text: { type: "mrkdwn", text: "Hi" } };
const parse = (value: unknown) => parsePayload(JSON.stringify(value));
const ok = (result: ParseResult) => {
  if (!result.ok) throw new Error(`expected a payload, got: ${result.error}`);
  return result;
};
const fail = (result: ParseResult) => {
  if (result.ok) throw new Error("expected an error");
  return result;
};

describe("parsePayload", () => {
  it("takes a bare array of blocks, which names no surface", () => {
    const result = ok(parse([section]));
    expect(result.blocks).toEqual([section]);
    expect(result.surface).toBeNull();
    expect(result.share).toEqual({ blocks: [section] });
  });

  it("takes { blocks } as a message", () => {
    const result = ok(parse({ blocks: [section] }));
    expect(result.surface).toBe("message");
    expect(result.message).toBeUndefined();
  });

  it("takes a chat.postMessage body and leaves out what doesn't show", () => {
    const result = ok(
      parse({ channel: "C0123456789", thread_ts: "1.2", blocks: [section], text: "Fallback" }),
    );
    expect(result.blocks).toEqual([section]);
    expect(result.message?.text).toBe("Fallback");
    expect(result.share).toEqual({ blocks: [section], text: "Fallback" });
  });

  it("takes a text-only chat.postMessage body, with the APP badge", () => {
    const result = ok(parse({ channel: "C0123456789", text: "Just *text*" }));
    expect(result.blocks).toEqual([]);
    expect(result.surface).toBe("message");
    expect(result.message).toMatchObject({
      text: "Just *text*",
      bot_profile: { name: "Block Kit Preview" },
    });
  });

  it("takes attachments, with their blocks", () => {
    const attachments = [{ color: "#36a64f", blocks: [section] }, { text: "Legacy" }];
    const result = ok(parse({ channel: "C0123456789", attachments }));
    expect(result.message?.attachments).toEqual(attachments);
    expect(result.share).toEqual({ attachments });
  });

  it("keeps a username the body sets", () => {
    const result = ok(parse({ text: "Hi", username: "Deploy bot" }));
    expect(result.message?.username).toBe("Deploy bot");
  });

  it("checks the blocks inside attachments", () => {
    const result = fail(parse({ attachments: [{ blocks: [{ text: "no type" }] }] }));
    expect(result.kind).toBe("shape");
    expect(result.detail).toContain("attachments[0].blocks[0]");
  });

  it.each([
    ["views.open", { trigger_id: "123.456", view: { type: "modal", blocks: [section] } }, "modal"],
    ["views.push", { trigger_id: "123.456", view: { type: "modal", blocks: [] } }, "modal"],
    [
      "views.update",
      { view_id: "V0123456789", hash: "1.abc", view: { type: "modal", blocks: [section] } },
      "modal",
    ],
    [
      "views.publish",
      { user_id: "U0123456789", view: { type: "home", blocks: [section] } },
      "home",
    ],
  ] as const)("takes a %s body and picks the surface from its view", (_, body, surface) => {
    const result = ok(parse(body));
    expect(result.surface).toBe(surface);
    expect(result.view).toEqual(body.view);
    expect(result.blocks).toEqual(body.view.blocks);
    // The link keeps the view itself, as Block Kit Builder does.
    expect(result.share).toEqual(body.view);
  });

  it("takes a view sent as a JSON string, as a form-encoded call sends it", () => {
    const view = { type: "modal", title: { type: "plain_text", text: "Hi" }, blocks: [section] };
    const result = ok(parse({ trigger_id: "123.456", view: JSON.stringify(view) }));
    expect(result.surface).toBe("modal");
    expect(result.view).toEqual(view);
  });

  it.each(["modal", "home"] as const)("takes a bare %s view", (type) => {
    const view = { type, blocks: [section] };
    const result = ok(parse(view));
    expect(result.surface).toBe(type);
    expect(result.view).toEqual(view);
  });

  it("takes a view with no blocks", () => {
    expect(ok(parse({ type: "home" })).blocks).toEqual([]);
  });

  it("says a syntax error doesn't parse, with its line and column", () => {
    const result = fail(parsePayload('{\n  "blocks": [\n    { "type": "divider" },\n  ]\n}'));
    expect(result.kind).toBe("syntax");
    expect(result.title).toBe("This JSON doesn't parse:");
    expect(result).toMatchObject({ line: 3, column: 26 });
    expect(result.error).toBe(
      "This JSON doesn't parse: Remove the trailing comma before ] (line 3, column 26).",
    );
  });

  it("says when the editor is empty", () => {
    for (const text of ["", "  \n "]) {
      const result = fail(parsePayload(text));
      expect(result.kind).toBe("empty");
      expect(result.error).toBe("The editor is empty.");
    }
  });

  it.each([
    [{}, "Expected"],
    [null, "not null"],
    [42, "not number"],
    ["blocks", "not string"],
    [{ blocks: "nope" }, '"blocks" should be an array'],
    [{ blocks: [null] }, 'blocks[0] should be an object with a string "type"'],
    [[{ type: 1 }], "blocks[0] should be"],
    [{ blocks: [section], text: 3 }, '"text" should be a string'],
    [{ attachments: {} }, '"attachments" should be an array'],
    [{ attachments: ["x"] }, "attachments[0] should be an object"],
    [{ view: 1 }, '"view" should be a view object'],
    [{ view: "{" }, "isn't JSON"],
    [
      { view: { type: "workflow_step", blocks: [] } },
      'view.type should be "modal" or "home", not "workflow_step"',
    ],
    [{ view: { type: "modal", blocks: {} } }, '"view.blocks" should be an array'],
    [section, 'a single "section" block'],
  ])("says JSON that parses but isn't a payload isn't one: %j", (value, message) => {
    const result = fail(parse(value));
    expect(result.kind).toBe("shape");
    expect(result.title).toBe("This JSON parses but isn't a Block Kit payload:");
    expect(result.error).not.toContain("doesn't parse");
    expect(result.detail).toContain(message);
  });

  it("names every accepted shape when nothing matches", () => {
    const { detail } = fail(parse({ hello: "world" }));
    for (const shape of [
      '{ "blocks": [...] }',
      "array",
      "chat.postMessage",
      "view",
      "views.open",
    ]) {
      expect(detail).toContain(shape);
    }
  });
});

describe("readHash", () => {
  it("formats the JSON a link holds", () => {
    expect(readHash(`#${encodeURIComponent('{"blocks":[]}')}`)).toBe('{\n  "blocks": []\n}');
  });

  it("keeps a payload that parses but won't render, so the editor can show it", () => {
    const hash = `#${encodeURIComponent('{"blocks":[{"type":"header"}]}')}`;
    expect(readHash(hash)).toContain('"type": "header"');
  });

  it("returns null without a hash, or for one that isn't JSON", () => {
    expect(readHash("")).toBeNull();
    expect(readHash("#%7B")).toBeNull();
  });
});
