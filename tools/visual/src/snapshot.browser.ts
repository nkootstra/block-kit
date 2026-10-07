// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// snapshot.js freezes the Builder preview into a reference. These cases build small pages the way
// Slack lays them out, snapshot them, replay the snapshot and check it lays out like the original.
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { collectTextRuns } from "./collectTextRuns";
import { createHarness, type Harness, settle } from "./interaction/harness";

setDefaultTimeout(30_000);

const SNAPSHOT = await Bun.file(join(import.meta.dir, "snapshot.js")).text();
const ROOT = resolve(import.meta.dir, "../../..");

let browser: Browser;
let page: Page;
let harness: Harness;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  harness = await createHarness("chromium");
});
afterAll(async () => {
  await browser.close();
  await harness?.close();
});

interface Box {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every rendered element inside the preview, in document order, relative to it. */
function allBoxes(): Box[] {
  const root = document.querySelector(".p-bkb_preview__message")!;
  const origin = root.getBoundingClientRect();
  return [...root.querySelectorAll("*")]
    .filter((el) => !(el instanceof HTMLScriptElement || el instanceof HTMLStyleElement))
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.localName,
        x: r.x - origin.x,
        y: r.y - origin.y,
        width: r.width,
        height: r.height,
      };
    });
}

/** Within half a pixel: a replayed box can land on a neighbouring 1/64px layout unit. */
const sameBox = (a: Box, b: Box) =>
  a.tag === b.tag &&
  (["x", "y", "width", "height"] as const).every((k) => Math.abs(a[k] - b[k]) < 0.5);

/** Where each `[id]` element inside the preview sits relative to it, and how big it is. */
async function boxes() {
  return page.evaluate(() => {
    const root = document.querySelector(".p-bkb_preview__message")!.getBoundingClientRect();
    return Object.fromEntries(
      [...document.querySelectorAll(".p-bkb_preview__message [id]")].map((el) => {
        const r = el.getBoundingClientRect();
        return [el.id, { x: r.x - root.x, y: r.y - root.y, width: r.width, height: r.height }];
      }),
    );
  });
}

/** Runs snapshot.js on the page, as the capture loop does in the Builder. */
async function snapshot(target: Page): Promise<string> {
  await target.addScriptTag({ content: `window.sbkSnapshot = ${SNAPSHOT};` });
  return target.evaluate(() =>
    (window as unknown as { sbkSnapshot: (win: Window) => Promise<string> }).sbkSnapshot(window),
  );
}

/** Lays `body` out live, snapshots it, replays the snapshot, and returns both layouts. */
async function snapshotAndReplay(body: string) {
  await page.setContent(
    `<!doctype html><body style="margin:0;font:15px sans-serif"><div class="p-bkb_preview__message" style="width:400px">${body}</div></body>`,
  );
  const live = await boxes();
  const html = await snapshot(page);
  await page.setContent(html);
  return { live, replayed: await boxes() };
}

describe("snapshot.js", () => {
  it("keeps a content-sized label on one line when its width is a sub-pixel value", async () => {
    // Slack's input label is a flex item sized to its content. Its used width (100.0625px here)
    // serializes as "100.062px"; frozen at that, the second part no longer fits and wraps.
    const { live, replayed } = await snapshotAndReplay(
      `<div style="display:flex"><label id="label"><span id="name" style="display:inline-block;width:60.0625px"></span><span id="optional" style="display:inline-block;width:40px"></span></label></div>`,
    );
    expect(replayed.optional).toEqual(live.optional);
    expect(replayed.label).toEqual(live.label);
  });

  it("keeps a checkbox label's text on one line in a row its flex layout packed tight", async () => {
    // Slack's checkbox option (catalog/section/checkboxes): a flex label holds the box's wrapper
    // and the text, and the flex layout shrinks the wrapper below its 26px content to fit. Left to
    // size from its content on replay, the wrapper took 4px from the text and it wrapped. This
    // page only approximates Slack's CSS, which the captures don't carry, so it guards the shape;
    // the fixture replays in snapshotReplay.browser.ts are what caught the regression class.
    const { live, replayed } = await snapshotAndReplay(
      `<div style="display:flex"><div id="element"><label id="label" style="display:flex;width:149.461px;font:700 15px sans-serif"><span id="box" style="display:block;min-width:0"><input type="checkbox" style="display:flex;flex:none;width:14px;height:14px;margin:3px 8px 3px 4px"></span><span id="text" style="display:block;min-width:0">*this is mrkdwn text*</span></label></div></div>`,
    );
    expect(replayed.text).toEqual(live.text);
    expect(replayed.box).toEqual(live.box);
    expect(replayed.label).toEqual(live.label);
  });

  it("keeps a wrapping row's items on the row they were laid out on", async () => {
    // Slack's actions block (interactive/update-message) is a wrapping row sized to its buttons.
    // Live, the row came to 207.71875px while its buttons and margins snap to 207.734375px, a
    // layout unit more, and still sat on one line; frozen, the last button dropped to a second
    // row. The snapshot gives such a row a unit per item. Chrome sizes this page's row exactly,
    // so it can't reproduce Slack's shortfall: it checks the extra width keeps every item where
    // it was and the row within half a pixel.
    const button = (id: string, width: string) =>
      `<span id="${id}" style="display:block;flex:none;width:${width};height:28px;margin-right:8px"></span>`;
    const { live, replayed } = await snapshotAndReplay(
      `<div style="display:flex"><div id="row" style="display:flex;flex-wrap:wrap">${button("a", "65.3125px")}${button("b", "56px")}${button("c", "62.41px")}</div></div>`,
    );
    expect(replayed.a).toEqual(live.a);
    expect(replayed.b).toEqual(live.b);
    expect(replayed.c).toEqual(live.c);
    expect(Math.abs(replayed.row!.width - live.row!.width)).toBeLessThan(0.5);
  });

  /** An element's computed min-width and min-height, live and replayed. */
  async function minSizes(body: string, id: string) {
    const read = () =>
      page.evaluate((id) => {
        const cs = getComputedStyle(document.getElementById(id)!);
        return { minWidth: cs.minWidth, minHeight: cs.minHeight };
      }, id);
    await page.setContent(
      `<!doctype html><body style="margin:0;font:15px sans-serif"><div class="p-bkb_preview__message" style="width:400px">${body}</div></body>`,
    );
    const live = await read();
    await page.setContent(await snapshot(page));
    return { live, replayed: await read() };
  }

  it("keeps a typeable select's input at the min-width it was given", async () => {
    // Slack's c-select_input (and our typeable fields): an <input> flex item with min-width: 0,
    // shrunk below the ~20 characters its default `size` asks for. 0px equals the input's tag
    // default outside a flex container, so the snapshot dropped it, and on replay min-width fell
    // back to auto, the input's content size: wider than the field wherever that wins.
    const { live, replayed } = await minSizes(
      `<div style="display:flex;width:120px"><input id="input" style="flex:1 1 0;min-width:0"><span style="display:block;flex:none;width:20px;height:20px"></span></div>`,
      "input",
    );
    expect(live.minWidth).toBe("0px");
    expect(replayed.minWidth).toBe("0px");
  });

  it("keeps a grid item at the min-height it was given", async () => {
    const { live, replayed } = await minSizes(
      `<div style="display:grid;grid-template-rows:20px"><div id="cell" style="min-height:0"><div style="height:40px"></div></div></div>`,
      "cell",
    );
    expect(live.minHeight).toBe("0px");
    expect(replayed.minHeight).toBe("0px");
  });

  it("leaves a flex item's min-width at auto when the page did", async () => {
    const { live, replayed } = await minSizes(
      `<div style="display:flex"><span id="item" style="display:block">Text</span></div>`,
      "item",
    );
    expect(replayed.minWidth).toBe(live.minWidth);
  });

  it("keeps an item on an implicit grid row where Slack draws it", async () => {
    // Slack's composer puts its footer on the row after the explicit grid (grid-row-start: -1).
    // The resolved track list includes that implicit row; frozen as an explicit row, it pushes
    // the footer one more row down.
    const { live, replayed } = await snapshotAndReplay(
      `<div id="grid" style="display:grid;grid-template-rows:auto auto"><div style="height:38px"></div><div style="height:38px"></div><div id="footer" style="grid-row-start:-1;height:40px"></div></div>`,
    );
    expect(replayed.footer).toEqual(live.footer);
    expect(replayed.grid).toEqual(live.grid);
  });

  // Our own rendering stands in for the Builder: real flex and grid layouts, fonts, images that
  // fail to load. Every element of the replay must land where it did live.
  for (const name of [
    "extra/modal/form",
    "extra/modal/rich-and-file",
    "catalog/card-and-carousel/card",
    "catalog/table/paginated-data-table",
    "extra/rich-text/mentions-and-styles",
  ]) {
    it(`replays ${name} with every box where it was`, async () => {
      const json = JSON.parse(await Bun.file(join(ROOT, `fixtures/${name}.json`)).text());
      const mount = Array.isArray(json)
        ? { blocks: json }
        : json.type === "modal" || json.type === "home"
          ? { view: json }
          : json;
      const live = await harness.open(mount);
      await settle(live);
      await live.evaluate(() => {
        const root = document.getElementById("root")!;
        root.classList.add("p-bkb_preview__message");
        root.style.width = "520px";
      });
      const before = await live.evaluate(allBoxes);
      const html = await snapshot(live);
      await live.setContent(html);
      await live.evaluate(() => document.fonts.ready.then(() => undefined));
      const after = await live.evaluate(allBoxes);
      expect(after.length).toBe(before.length);
      const moved = before.filter((box, i) => !sameBox(box, after[i]!));
      expect(moved.slice(0, 3)).toEqual([]);
    });
  }

  describe("motion", () => {
    const BUTTON = `<button id="save" style="transition:background-color 80ms cubic-bezier(.36,.19,.29,1);cursor:pointer">Save</button><p id="still">Still</p>`;

    it("records an element's transitions in the meta, not in its style", async () => {
      await page.setContent(
        `<!doctype html><body style="margin:0"><div class="p-bkb_preview__message" style="width:400px">${BUTTON}</div></body>`,
      );
      const html = await snapshot(page);
      const meta = JSON.parse(
        html.match(
          /<script type="application\/json" id="sbk-reference-meta">(.*?)<\/script>/s,
        )![1]!,
      );
      const ref = html.match(/<button id="save"[^>]*data-ref="(\d+)"/)?.[1];
      expect(meta.motion[ref!]).toMatchObject({
        "transition-property": "background-color",
        "transition-duration": "0.08s",
        "transition-timing-function": "cubic-bezier(0.36, 0.19, 0.29, 1)",
        cursor: "pointer",
      });
      await page.setContent(html);
      expect(
        await page.evaluate(
          () => getComputedStyle(document.getElementById("save")!).transitionDuration,
        ),
      ).toBe("0s");
    });

    it("leaves the Builder's own block wrapper out of the motion", async () => {
      // The Builder wraps every block in a draggable wrapper with a box-shadow transition for
      // its selection highlight; it isn't part of how Slack renders the message.
      await page.setContent(
        `<!doctype html><body style="margin:0"><div class="p-bkb_preview__message" style="width:400px"><div class="dragWrapper___5blE" style="transition:box-shadow 160ms"><p>Text</p></div></div></body>`,
      );
      const html = await snapshot(page);
      const meta = JSON.parse(
        html.match(
          /<script type="application\/json" id="sbk-reference-meta">(.*?)<\/script>/s,
        )![1]!,
      );
      expect(meta.motion).toEqual({});
    });

    it("reads the same motion from a reference as from the live page", async () => {
      const live = `<!doctype html><body style="margin:0"><div class="p-bkb_preview__message" style="width:400px">${BUTTON}</div></body>`;
      await page.setContent(live);
      const ours = await page.evaluate(collectTextRuns, ".p-bkb_preview__message");
      const html = await snapshot(page);
      await page.setContent(html);
      const reference = await page.evaluate(collectTextRuns, "#sbk-reference > *");
      expect(ours.map((r) => r.motion)).toEqual([
        "transition background-color 0.08s cubic-bezier(0.36, 0.19, 0.29, 1) 0s",
        "",
      ]);
      expect(reference.map((r) => r.motion)).toEqual(ours.map((r) => r.motion));
    });
  });

  describe("open states", () => {
    const metaOf = (html: string) =>
      JSON.parse(
        html.match(
          /<script type="application\/json" id="sbk-reference-meta">(.*?)<\/script>/s,
        )![1]!,
      );
    // Slack mounts menus and dialogs in a .ReactModalPortal at the end of <body>, outside the
    // preview: a select list sits under its field, a calendar may stick out to the left of the
    // preview, and a confirm dialog is centred in the window.
    const PAGE = `<!doctype html><body style="margin:0;font:15px sans-serif">
      <div style="padding:150px 0 0 200px"><div class="p-bkb_preview__message" style="width:400px;height:100px"><span id="field" style="display:block;width:190px;height:28px"></span></div></div>
      <div class="ReactModalPortal"><div class="ReactModal__Overlay c-popover" style="position:fixed;inset:0">
        <div class="ReactModal__Content" style="position:absolute;left:90px;top:174px"><div>
          <div class="c-date_picker__dropdown" style="width:349px;height:372px;background:#fff;box-shadow:0 0 0 1px rgba(29,28,29,.13)"><span id="day">28</span></div>
        </div></div>
      </div></div>
    </body>`;

    it("freezes an open popover where it was, relative to the preview, and records it", async () => {
      await page.setContent(PAGE);
      const html = await snapshot(page);
      expect(metaOf(html).layers).toEqual([
        { kind: "popover", x: -110, y: 24, width: 349, height: 372 },
      ]);
      await page.setContent(html);
      const placed = await page.evaluate(() => {
        const root = document.querySelector("#sbk-reference > *")!.getBoundingClientRect();
        const layer = document.querySelector('[data-sbk-layer="popover"] > *')!;
        const r = layer.getBoundingClientRect();
        return {
          x: r.x - root.x,
          y: r.y - root.y,
          width: r.width,
          height: r.height,
          // Nothing of the popover is cut off by the page's left edge.
          onPage: r.x >= 0,
          day: layer.textContent,
        };
      });
      expect(placed).toEqual({ x: -110, y: 24, width: 349, height: 372, onPage: true, day: "28" });
    });

    it("leaves a snapshot without an open popover as it was", async () => {
      await page.setContent(
        `<!doctype html><body style="margin:0"><div class="p-bkb_preview__message" style="width:400px"><p>Text</p></div></body>`,
      );
      const html = await snapshot(page);
      expect(metaOf(html).layers).toEqual([]);
      expect(html).not.toContain("data-sbk-layer");
      expect(html).toContain("#sbk-reference{width:400px}");
    });

    // Measured on Slack's confirm dialog in the Builder: the role sits on the modal content itself
    // (`.ReactModal__Content.c-dialog__content[role=dialog]`, in a `.c-dialog` overlay).
    it("treats modal content that is itself the dialog as a dialog", async () => {
      await page.setContent(`<!doctype html><body style="margin:0;font:15px sans-serif">
        <div class="p-bkb_preview__message" style="width:400px;height:60px"></div>
        <div class="ReactModalPortal"><div class="ReactModal__Overlay c-dialog" style="position:fixed;inset:0">
          <div role="dialog" class="ReactModal__Content c-dialog__content" style="position:absolute;left:300px;top:200px;width:520px;height:166px;background:#fff">Are you sure?</div>
        </div></div>
      </body>`);
      expect(metaOf(await snapshot(page)).layers).toMatchObject([
        { kind: "dialog", width: 520, height: 166 },
      ]);
    });

    // Measured on Slack's confirm dialog: `max-width: calc(100% - 32px)` against the window. Frozen
    // in a reference whose dialog wrapper is only as wide as the dialog, it shrank the dialog to 488.
    it("keeps a dialog's measured width when its max-width is relative to the window", async () => {
      await page.setContent(`<!doctype html><body style="margin:0;font:15px sans-serif">
        <div class="p-bkb_preview__message" style="width:400px;height:60px"></div>
        <div class="ReactModalPortal"><div class="ReactModal__Overlay c-dialog" style="position:fixed;inset:0">
          <div role="dialog" class="ReactModal__Content c-dialog__content" style="position:fixed;left:300px;top:200px;width:520px;max-width:calc(100% - 32px);height:166px;box-sizing:border-box;background:#fff">Are you sure?</div>
        </div></div>
      </body>`);
      const html = await snapshot(page);
      const replay = await browser.newPage();
      await replay.setContent(html);
      const width = await replay.evaluate(
        () =>
          document.querySelector('[data-sbk-layer="dialog"] > *')!.getBoundingClientRect().width,
      );
      await replay.close();
      expect(width).toBe(520);
    });

    it("freezes an open dialog on its own, below the preview", async () => {
      await page.setContent(`<!doctype html><body style="margin:0;font:15px sans-serif">
        <div class="p-bkb_preview__message" style="width:400px;height:60px"></div>
        <div class="ReactModalPortal"><div class="ReactModal__Overlay c-sk-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5)">
          <div class="ReactModal__Content" style="position:absolute;left:300px;top:200px">
            <div role="alertdialog" class="c-sk-modal" style="width:520px;height:164px;background:#fff;border-radius:8px"><h1>Are you sure?</h1></div>
          </div>
        </div></div>
      </body>`);
      const html = await snapshot(page);
      expect(metaOf(html).layers).toMatchObject([{ kind: "dialog", width: 520, height: 164 }]);
      await page.setContent(html);
      const dialog = await page.evaluate(() => {
        const el = document.querySelector('[data-sbk-layer="dialog"] > *')!;
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, text: el.textContent };
      });
      expect(dialog).toEqual({ width: 520, height: 164, text: "Are you sure?" });
    });

    it("records the Builder's theme in the meta", async () => {
      for (const theme of ["light", "dark"] as const) {
        await page.setContent(
          `<!doctype html><html class="sk-client-theme--${theme}"><body style="margin:0"><div class="p-bkb_preview__message" style="width:400px"><p>Text</p></div></body></html>`,
        );
        expect(metaOf(await snapshot(page)).theme).toBe(theme);
      }
    });

    // Measured in the Builder's dark theme: the preview and .p-bkb_preview__content are transparent,
    // and the message card around them carries the background (rgb(26, 29, 33)).
    it("takes the page background from the nearest ancestor that has one", async () => {
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:rgb(13, 15, 14)"><div style="background:rgb(26, 29, 33)"><div class="p-bkb_preview__message" style="width:400px;color:#d1d2d3"><div class="p-bkb_preview__content"><p>Text</p></div></div></div></body></html>`,
      );
      expect(await snapshot(page)).toContain(
        "html,body{margin:0;padding:0;background:rgb(26, 29, 33)}",
      );
    });

    // Measured in the Builder: after its theme toggle is used, the html class can be missing, while
    // the toggle's label always names the theme it switches to.
    it("reads the Builder's theme from its toggle when the html class is missing", async () => {
      for (const [label, theme] of [
        ["Switch to light mode", "dark"],
        ["Switch to dark mode", "light"],
      ] as const) {
        await page.setContent(
          `<!doctype html><html><body style="margin:0"><button aria-label="${label}"></button><div class="p-bkb_preview__message" style="width:400px"><p>Text</p></div></body></html>`,
        );
        expect(metaOf(await snapshot(page)).theme).toBe(theme);
      }
    });
  });

  it("keeps a size the page sets explicitly", async () => {
    const { live, replayed } = await snapshotAndReplay(
      `<div id="fixed" style="width:123.5px;height:45px"></div><div id="track" style="display:grid;grid-template-columns:100px 1fr"><div id="cell" style="height:20px"></div></div>`,
    );
    expect(replayed.fixed).toEqual(live.fixed);
    expect(replayed.cell).toEqual(live.cell);
  });
});
