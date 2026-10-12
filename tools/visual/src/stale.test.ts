import { describe, expect, it } from "bun:test";
import { foreignState, foreignText, missingText } from "./stale";

const reference = (payload: unknown, body: string) =>
  `<script type="application/json" id="sbk-reference-meta">${JSON.stringify({ payload })}</script>` +
  `<div id="sbk-reference">${body}</div>`;

describe("foreignText", () => {
  const known = new Set(["A section with an accessory", "Pick an item from the list"]);

  it("finds another fixture's text in a reference, which the Builder showed instead", () => {
    const payload = { blocks: [{ type: "actions", elements: [{ type: "multi_static_select" }] }] };
    const html = reference(payload, "<p>Select items</p><p>A section with an accessory</p>");
    expect(foreignText(html, known)).toEqual(["A section with an accessory"]);
  });

  it("accepts text its own payload holds", () => {
    const payload = {
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "A section with an accessory" } }],
    };
    expect(foreignText(reference(payload, "<p>A section with an accessory</p>"), known)).toEqual(
      [],
    );
  });

  it("ignores text no fixture writes, such as the Builder's own hints", () => {
    const html = reference({ blocks: [] }, "<p>Type a minimum of 3 characters to see options.</p>");
    expect(foreignText(html, known)).toEqual([]);
  });

  // CodeQL: script and style content must never count as text, whatever the tag's letter case or
  // spacing, and a crafted tag can't smuggle their content out.
  it("ignores text inside script and style tags in any letter case", () => {
    const html = reference(
      { blocks: [] },
      "<SCRIPT>A section with an accessory</SCRIPT><Style>Pick an item from the list</Style >",
    );
    expect(foreignText(html, known)).toEqual([]);
  });

  it("ignores script content when the closing tag has spaces or attributes", () => {
    const html = reference(
      { blocks: [] },
      '<script type="text/plain">A section with an accessory</script >' +
        "<style media=x>Pick an item from the list</style\n>",
    );
    expect(foreignText(html, known)).toEqual([]);
  });

  it("doesn't let a split tag leak script content", () => {
    const html = reference({ blocks: [] }, "<scr<script>ipt>A section with an accessory</script>");
    expect(foreignText(html, known)).toEqual([]);
  });

  it("still finds foreign text after a script block", () => {
    const html = reference({ blocks: [] }, "<SCRIPT>x</SCRIPT><p>A section with an accessory</p>");
    expect(foreignText(html, known)).toEqual(["A section with an accessory"]);
  });
});

describe("missingText", () => {
  const accessory = {
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "A section with an accessory" },
        accessory: { type: "datetimepicker", action_id: "datetime" },
      },
    ],
  };

  // contexts/datetimepicker/accessory: the Builder refused the payload and kept showing a modal
  // input's datetime picker, which no other fixture's sentence gives away.
  it("finds a reference that shows none of its payload's sentences", () => {
    const html = reference(
      accessory,
      "<p>Your App</p><p>APP</p><p>12:00 PM</p><label>Label</label>",
    );
    expect(missingText(html)).toEqual(["A section with an accessory"]);
  });

  it("accepts a reference that shows its sentence, however mrkdwn splits it", () => {
    const html = reference(accessory, "<p>A <b>section</b> with an <i>accessory</i></p>");
    expect(missingText(html)).toEqual([]);
  });

  it("reads a placeholder or an accessible name, which Slack writes as an attribute", () => {
    const payload = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "channels_select",
              placeholder: { type: "plain_text", text: "Pick the channel to post into" },
            },
          ],
        },
      ],
    };
    expect(
      missingText(reference(payload, '<input placeholder="Pick the channel to post into">')),
    ).toEqual([]);
    expect(missingText(reference(payload, "<p>Something else</p>"))).toEqual([
      "Pick the channel to post into",
    ]);
  });

  it("ignores what shows only later or in another form: overflow options, date fallbacks, citation details", () => {
    const payload = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "overflow",
              options: [
                { text: { type: "plain_text", text: "An option nobody sees yet" }, value: "a" },
              ],
            },
          ],
        },
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                {
                  type: "date",
                  timestamp: 1,
                  format: "{date}",
                  fallback: "a fallback for the date",
                },
                {
                  type: "citation",
                  url: "u",
                  text: "1",
                  index: 1,
                  details: { snippet: "a snippet of the page" },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(missingText(reference(payload, "<span>January 1st</span>"))).toEqual([]);
  });

  it("ignores a payload without a sentence to look for", () => {
    const html = reference({ blocks: [{ type: "divider" }] }, "<hr>");
    expect(missingText(html)).toEqual([]);
  });

  it("ignores a confirm dialog's text, which shows only once the dialog opens", () => {
    const payload = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Go" },
              confirm: { text: { type: "plain_text", text: "This can't be undone." } },
            },
          ],
        },
      ],
    };
    expect(missingText(reference(payload, "<button>Go</button>"))).toEqual([]);
  });
});

describe("foreignState", () => {
  const multi = (initial: number, key: "elements" | "accessory" = "elements") => {
    const element = {
      type: "multi_static_select",
      action_id: "m",
      initial_options: Array.from({ length: initial }, (_, i) => ({ value: `v${i}` })),
    };
    return key === "accessory"
      ? { blocks: [{ type: "section", accessory: element }] }
      : { blocks: [{ type: "actions", elements: [element] }] };
  };
  const chip = '<span class="c-token token__x">Red</span>';

  it("flags chips and input values the payload doesn't set", () => {
    expect(foreignState(`<div>${chip}</div>`, multi(0))).toEqual(["chips: 1, expected 0"]);
    expect(foreignState(`<div>${chip}</div>`, multi(1))).toEqual([]);
    const input = (value: string) =>
      `<input class="c-input_text p-block_kit_plain_text_input_element" value="${value}">`;
    const payload = {
      blocks: [{ type: "input", element: { type: "plain_text_input", action_id: "t" } }],
    };
    expect(foreignState(input("hello"), payload)).toEqual(['input 1: "hello", expected ""']);
    expect(foreignState(input(""), payload)).toEqual([]);
  });

  it("expects no chips on an accessory multi-select or inside an open dialog", () => {
    expect(foreignState("<div></div>", multi(1, "accessory"))).toEqual([]);
    expect(foreignState(`<div></div><div data-sbk-layer="dialog">${chip}</div>`, multi(0))).toEqual(
      [],
    );
  });
});
