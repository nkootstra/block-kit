// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Blocks } from "../Blocks";

/** `depth` blocks of `type`, each the only child of the one before, around a section. */
function nested(type: string, key: string, depth: number) {
  let block: Record<string, unknown> = {
    type: "section",
    text: { type: "plain_text", text: "Innermost" },
  };
  for (let i = 0; i < depth; i++) {
    block = { type, [key]: [block] };
  }
  return block;
}

describe("nested blocks", () => {
  it.each([
    ["callout", "child_blocks"],
    ["container", "child_blocks"],
    ["condition", "default"],
  ])("renders %s blocks nested 1000 deep without overflowing the stack", (type, key) => {
    const html = renderToStaticMarkup(<Blocks blocks={[nested(type, key, 1000) as never]} />);
    expect(html).toContain(`sbk-block--${type}`);
    expect(html).not.toContain("Innermost");
  });

  it("still renders a shallow nesting in full", () => {
    const html = renderToStaticMarkup(
      <Blocks blocks={[nested("callout", "child_blocks", 3) as never]} />,
    );
    expect(html).toContain("Innermost");
  });
});
