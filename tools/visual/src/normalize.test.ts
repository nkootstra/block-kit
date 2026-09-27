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
});
