import { describe, expect, it } from "bun:test";
import { normalize } from "./normalize";

describe("normalize", () => {
  it("drops the Builder's selection highlight from a block captured while selected", () => {
    const html =
      '<div role="group" class="dragWrapper___5blE isDraggable__E_D_S" draggable="true" style="border-top-color:red;' +
      "box-shadow:rgba(29, 28, 29, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 4px 12px 0px;" +
      'margin-top:-4px"><div class="p-bkb_preview__block p-bkb_preview__block--active"></div></div>';
    expect(normalize(html)).toBe(
      '<div role="group" class="dragWrapper___5blE isDraggable__E_D_S" draggable="true" style="border-top-color:red;' +
        'margin-top:-4px"><div class="p-bkb_preview__block p-bkb_preview__block--active"></div></div>',
    );
  });

  it("keeps box shadows that belong to the blocks themselves", () => {
    const html =
      '<div class="c-link" style="box-shadow:rgba(0, 0, 0, 0.1) 0px 0px 0px 1px inset"></div>';
    expect(normalize(html)).toBe(html);
  });

  describe("restores the glyphs the capture replaced with '?'", () => {
    const page = (body: string, rules: string) =>
      `<style>\n${rules}\n</style></head>\n<body>${body}</body>`;

    it("draws an icon's glyph from Slack's icon font", () => {
      const html = page(
        '<i class="c-icon c-icon--caret-down" type="caret_down" data-ref="1"></i>',
        '[data-ref="1"]::before{content:"?";color:red;content:"?";font-family:"Slack v2"}',
      );
      expect(normalize(html)).toContain(
        '[data-ref="1"]::before{content:"\\e271";color:red;content:"\\e271";font-family:"Slack v2"}',
      );
    });

    it("draws each list level's bullet", () => {
      const html = page(
        '<ul class="p-rich_text_list__bullet" data-indent="0"><li data-ref="1">a</li></ul>' +
          '<ul class="p-rich_text_list__bullet" data-indent="1"><li data-ref="2">b' +
          '<ul class="p-rich_text_list__bullet" data-indent="2"><li data-ref="3">c</li></ul></li>' +
          '<li data-ref="4">d</li></ul>',
        [1, 2, 3, 4].map((n) => `[data-ref="${n}"]::before{content:"?"}`).join("\n"),
      );
      const out = normalize(html);
      expect(out).toContain('[data-ref="1"]::before{content:"\\e506"}');
      expect(out).toContain('[data-ref="2"]::before{content:"\\e507"}');
      expect(out).toContain('[data-ref="3"]::before{content:"\\e509"}');
      expect(out).toContain('[data-ref="4"]::before{content:"\\e507"}');
    });

    it("keeps an emoji's trailing zero-width space invisible", () => {
      const html = page(
        '<span class="c-emoji c-emoji--inline" data-ref="1"></span>',
        '[data-ref="1"]::after{content:"?" / "";width:0px;content:"?" / ""}',
      );
      expect(normalize(html)).toContain(
        '[data-ref="1"]::after{content:"\\200b" / "";width:0px;content:"\\200b" / ""}',
      );
    });
  });

  it("gives a modal body Slack's narrow, idle-invisible scrollbar, which a snapshot can't capture", () => {
    const html =
      "<style>\n</style></head>\n" +
      '<body><div class="p-bkb_preview_modal__body p-bkb_preview_modal__body--slack_scrollbar"></div></body>';
    expect(normalize(html)).toContain(
      ".p-bkb_preview_modal__body--slack_scrollbar::-webkit-scrollbar{width:8px}",
    );
  });

  it("adds the modal scrollbar rules only once", () => {
    const html =
      "<style>\n</style></head>\n" +
      '<body><div class="p-bkb_preview_modal__body--slack_scrollbar"></div></body>';
    const twice = normalize(normalize(html));
    expect(twice.split("--slack_scrollbar::-webkit-scrollbar{").length).toBe(2);
  });
});
