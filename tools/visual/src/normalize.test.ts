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

  it("lets the pinned 12:00 PM lay out at its own width instead of the captured time's", () => {
    // From catalog/section/button, captured when the preview showed 7:37 PM: the snapshot pinned
    // the timestamp to that time's 50.3125px flex basis, and the wider "12:00 PM" wrapped.
    const html =
      '<span role="none" class="c-timestamp c-timestamp--static" data-ts="1495733843.826540" style="box-sizing:border-box;color:rgb(97, 96, 97);display:block;flex-basis:50.3125px;flex-shrink:0;font-size:12px;line-height:17.6002px;margin-right:5px;min-height:auto" data-ref="1"><span class="c-timestamp__label" data-qa="timestamp_label" style="box-sizing:border-box;color:rgb(97, 96, 97);line-height:17.6002px;margin-right:5px">12:00 PM</span></span>';
    expect(normalize(html)).toBe(
      '<span role="none" class="c-timestamp c-timestamp--static" data-ts="1495733843.826540" style="box-sizing:border-box;color:rgb(97, 96, 97);display:block;font-size:12px;line-height:17.6002px;margin-right:5px;min-height:auto" data-ref="1"><span class="c-timestamp__label" data-qa="timestamp_label" style="box-sizing:border-box;color:rgb(97, 96, 97);line-height:17.6002px;margin-right:5px">12:00 PM</span></span>',
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
        '[data-ref="1"]::before{content:"\\e271";color:red;content:"\\e271";font-family:"Slack v2";',
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

  it("keeps an icon's glyph upright although its <i> host is italic", () => {
    const html =
      '<style>\n[data-ref="1"]::before{content:"\\e023";font-family:"Slack v2"}\n</style></head>\n' +
      '<body><i class="c-icon c-icon--calendar" data-ref="1"></i></body>';
    expect(normalize(html)).toContain(
      '[data-ref="1"]::before{content:"\\e023";font-family:"Slack v2";font-style:normal}',
    );
  });

  it("leaves a pseudo-element's captured font style alone", () => {
    const html =
      '<style>\n[data-ref="1"]::before{content:"x";font-style:oblique}\n</style></head>\n' +
      '<body><i data-ref="1"></i></body>';
    expect(normalize(html)).toBe(html);
  });

  it("lets carousel cards wrap again inside the nowrap gallery scroller", () => {
    const html =
      "<style>\n</style></head>\n" +
      '<body><div class="p-gallery_scroller__content" style="text-wrap-mode:nowrap"></div></body>';
    expect(normalize(html)).toContain(".p-gallery_scroller__content>*{text-wrap-mode:wrap}");
  });

  it("adds the carousel wrap rule only once", () => {
    const html =
      "<style>\n</style></head>\n" + '<body><div class="p-gallery_scroller__content"></div></body>';
    expect(normalize(normalize(html)).split(".p-gallery_scroller__content>*{").length).toBe(2);
  });

  it("gives a data table's scroller Slack's 8px, idle-invisible scrollbar", () => {
    const html =
      "<style>\n</style></head>\n" +
      '<body><div class="dataTableBlockContainer__JT5Zf" style="overflow-x:auto"></div></body>';
    const out = normalize(normalize(html));
    expect(
      out.split(".dataTableBlockContainer__JT5Zf::-webkit-scrollbar{width:8px;height:8px}"),
    ).toHaveLength(2);
  });

  it("keeps a link Slack doesn't underline free of the browser's default underline", () => {
    const html =
      '<a class="c-link" href="https://a.test" style="color:blue">a</a>' +
      '<a class="c-link c-link--underline" href="https://a.test" style="text-decoration:underline">b</a>';
    expect(normalize(html)).toBe(
      '<a class="c-link" href="https://a.test" style="text-decoration:none;color:blue">a</a>' +
        '<a class="c-link c-link--underline" href="https://a.test" style="text-decoration:underline">b</a>',
    );
  });
});
