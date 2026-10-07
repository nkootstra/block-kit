import { describe, expect, it } from "bun:test";
import { foreignText } from "./stale";

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
