// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// The capture kinds that need real input or record more than a reference: hover and focus held by
// whoever drives the Builder, state styles, behaviour probes, Actions Preview payloads and the
// downloaded capture file. A stand-in page plays the Builder, and Playwright's real pointer and
// keyboard play the person following `sbkCaptureWaiting`, as the maintainer does in the Builder.
// Our side runs on the interaction harness.
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { createHarness, type Harness, settle } from "./interaction/harness";
import { observeOurs, replay } from "./probes";
import { diffStateStyles, ourStateStyles } from "./stateStyles";
import { ourTarget, stateFor } from "./states";
import { findTarget, parseTarget, SLACK } from "./targets";

setDefaultTimeout(30_000);

const read = (file: string) => Bun.file(join(import.meta.dir, file)).text();
const [CAPTURE, SNAPSHOT, OBSERVE] = await Promise.all([
  read("capture.js"),
  read("snapshot.js"),
  read("observe.js"),
]);

let browser: Browser;
let harness: Harness;
beforeAll(async () => {
  browser = await chromium.launch();
  harness = await createHarness("chromium");
});
afterAll(async () => {
  await browser.close();
  await harness.close();
});

/**
 * A stand-in Builder: two buttons that change on hover, press and keyboard focus, a select that
 * opens a portalled list driven by the arrow keys, and an Actions Preview that shows the payload a
 * pick sends.
 */
const BUILDER = `<!doctype html><html><head><style>
  body { margin: 0; font: 15px sans-serif; }
  .c-button { background: rgb(255, 255, 255); color: rgb(29, 28, 29); border: 1px solid rgb(200, 200, 200); padding: 4px 12px; transition: background 80ms; }
  .c-button:hover { background: rgb(248, 248, 248); }
  .c-button:active { background: rgb(221, 221, 221); }
  .c-button.c-button.c-button--danger:active { background: rgb(160, 20, 20); }
  .c-button:focus { outline: none; }
  .c-button:focus-visible { box-shadow: rgb(18, 100, 163) 0px 0px 0px 2px; }
  .p-bkb_preview__message:hover .c-button { border-color: rgb(1, 2, 3); }
  .c-select_options_list__option--active { background: rgb(18, 100, 163); color: white; }
</style></head><body>
  <div class="p-bkb_preview__message" style="width:512px;padding:20px">
    <button class="c-button" type="button">Approve</button>
    <button class="c-button c-button--danger" type="button">Deny</button>
    <div class="c-select_button" role="combobox" tabindex="0" aria-expanded="false">Pick a colour</div>
  </div>
  <pre id="actions-preview"></pre>
  <script>
    const field = document.querySelector('[role="combobox"]');
    let active = -1;
    const options = ["Red", "Green", "Blue"];
    const list = () => document.querySelector(".ReactModalPortal");
    const paint = () => {
      list()?.querySelectorAll('[role="option"]').forEach((o, i) => {
        o.id = "opt-" + i;
        o.classList.toggle("c-select_options_list__option--active", i === active);
      });
      if (active >= 0) field.setAttribute("aria-activedescendant", "opt-" + active);
    };
    const pick = (i) => {
      field.textContent = options[i];
      field.setAttribute("aria-expanded", "false");
      list()?.remove();
      document.getElementById("actions-preview").textContent = JSON.stringify({
        type: "block_actions", user: { id: "U0ZZZZZZZZZ" },
        actions: [{ type: "static_select", action_id: "colour", selected_option: { value: options[i] } }],
      });
    };
    field.addEventListener("click", () => {
      if (list()) return;
      const portal = document.createElement("div");
      portal.className = "ReactModalPortal";
      portal.innerHTML = '<div class="ReactModal__Overlay c-popover"><div class="ReactModal__Content" style="background:#fff;height:120px;overflow:auto"><div role="listbox">' +
        options.map((o) => '<div role="option">' + o + "</div>").join("") + "</div></div></div>";
      portal.querySelectorAll('[role="option"]').forEach((o, i) => o.addEventListener("mousedown", () => pick(i)));
      document.body.append(portal);
      field.setAttribute("aria-expanded", "true");
    });
    field.addEventListener("keydown", (e) => {
      if (!list()) return;
      if (e.key === "ArrowDown") { active = Math.min(active + 1, options.length - 1); paint(); }
      if (e.key === "Enter" && active >= 0) pick(active);
    });
    window.adapter = {
      load: async () => {}, theme: () => "light", setTheme: async () => {},
      previewSize: () => "desktop", setPreviewSize: async () => {},
    };
  </script>
</body></html>`;

/** A modal preview whose submit, like the Builder's, flags an empty required field. */
const MODAL = `<!doctype html><html><body>
  <div class="p-bkb_preview_modal" style="width:520px">
    <input class="c-input_text p-block_kit_plain_text_input_element" aria-label="Title">
    <span class="error"></span>
    <button class="c-button c-button--primary p-bkb_preview_modal__submit" type="button">Create</button>
  </div>
  <script>
    document.querySelector(".p-bkb_preview_modal__submit").addEventListener("click", () => {
      document.querySelector(".error").textContent = "Please complete this required field.";
      document.querySelector("input").focus();
    });
    window.adapter = {
      load: async () => {}, theme: () => "light", setTheme: async () => {},
      previewSize: () => "desktop", setPreviewSize: async () => {},
    };
  </script>
</body></html>`;

interface Waiting {
  name: string;
  do: string;
  x?: number;
  y?: number;
  key?: string;
  text?: string;
}

/**
 * Starts capture.js on the stand-in and follows its instructions with real input until it's done,
 * the way the maintainer drives the Builder. Returns what it recorded and the instructions seen.
 */
async function capture(
  html: string,
  items: unknown[],
  options: Record<string, unknown> = {},
  before?: (page: Page) => Promise<void>,
) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.setContent(html);
  await page.addScriptTag({
    content: `window.capture = ${CAPTURE}; window.snap = ${SNAPSHOT}; window.observe = ${OBSERVE};`,
  });
  await before?.(page);
  await page.evaluate(
    ([list, opts]) => {
      const w = window as unknown as Record<string, any>;
      w.capture({
        items: list,
        snap: w.snap,
        observe: w.observe,
        adapter: w.adapter,
        settle: 50,
        ...opts,
      }).then(
        (r: unknown) => (w.done = r),
        (e: Error) => (w.failed = String(e)),
      );
    },
    [items, options] as const,
  );
  const seen: Waiting[] = [];
  for (let i = 0; i < 400; i++) {
    const state = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      return { waiting: w.sbkCaptureWaiting, done: !!w.done, failed: w.failed };
    });
    if (state.failed) throw new Error(state.failed);
    if (state.done) break;
    const waiting = state.waiting as Waiting | undefined;
    if (waiting && typeof waiting === "object" && seen.at(-1) !== waiting) {
      const last = seen.at(-1);
      if (!last || JSON.stringify(last) !== JSON.stringify(waiting)) {
        seen.push(waiting);
        if (waiting.do === "hover") await page.mouse.move(waiting.x!, waiting.y!);
        if (waiting.do === "click") await page.mouse.click(waiting.x!, waiting.y!);
        if (waiting.do === "key") await page.keyboard.press(waiting.key!);
        if (waiting.do === "type") await page.keyboard.type(waiting.text!);
        if (waiting.do === "move-away") await page.mouse.move(890, 590);
      }
    }
    await page.waitForTimeout(25);
  }
  const output = await page.evaluate(
    () => (window as unknown as Record<string, any>).sbkCaptureOutput,
  );
  return { page, output, seen };
}

const meta = (html: string) =>
  JSON.parse(/id="sbk-reference-meta">(\{.*?\})</.exec(html)?.[1] ?? "{}");
/** The inlined style of the frozen element with the given data-ref. */
const frozenStyle = (html: string, ref: string) =>
  new RegExp(`<[a-z]+ [^>]*data-ref="${ref}"[^>]*>`).exec(html)?.[0] ?? "";

describe("capture.js holding real input", () => {
  it("asks for the pointer on the control, snapshots it hovered and records the input", async () => {
    const { page, output, seen } = await capture(BUILDER, [
      { name: "catalog/actions/button@hover-button-2", payload: {} },
    ]);
    const html = output.references["catalog/actions/button@hover-button-2"];
    expect(seen.map((s) => s.do)).toEqual(["hover"]);
    expect(seen[0]).toMatchObject({ target: "button-2" });
    const m = meta(html);
    expect(m.input).toEqual({ input: "hover", target: "button-2" });
    expect(frozenStyle(html, m.targets["button-2"])).toContain("rgb(248, 248, 248)");
    expect(frozenStyle(html, m.targets["button-1"])).not.toContain("rgb(248, 248, 248)");
    // A hover capture records no state facts: its base is hovered.
    expect(m.stateStyles).toBeUndefined();
    await page.close();
  });

  it("asks for one Tab when a scripted focus isn't keyboard focus, then snapshots the ring", async () => {
    const { page, output, seen } = await capture(
      BUILDER,
      [{ name: "catalog/actions/button@focus-button-2", payload: {} }],
      {},
      // A click on another button first: a scripted focus after it is pointer focus, without
      // :focus-visible. The pointer then rests on that button, away from the target.
      (p) => p.locator(".c-button").first().click(),
    );
    const html = output.references["catalog/actions/button@focus-button-2"];
    expect(seen.map((s) => s.do)).toEqual(["key"]);
    expect(seen[0]).toMatchObject({ key: "Tab", target: "button-2" });
    const m = meta(html);
    expect(m.input).toEqual({ input: "focus", target: "button-2" });
    expect(frozenStyle(html, m.targets["button-2"])).toContain(
      "box-shadow:rgb(18, 100, 163) 0px 0px 0px 2px",
    );
    expect(frozenStyle(html, m.targets["button-1"])).not.toContain("rgb(18, 100, 163)");
    await page.close();
  });

  it("asks for a Tab even when the last input was already a key press", async () => {
    // Slack adds the class that draws a button's focus halo (`c-button--focus-visible`) only for
    // focus that follows a key press it saw itself; the scripted clicks between items (theme,
    // width, payload) reset that. Captured without a fresh Tab, a plan pill kept its outline and
    // lost its halo.
    const { page, seen } = await capture(
      BUILDER,
      [{ name: "catalog/actions/button@focus-button-2", payload: {} }],
      {},
      (p) => p.keyboard.press("Tab"),
    );
    expect(seen.map((s) => s.do)).toEqual(["key"]);
    expect(seen[0]).toMatchObject({ key: "Tab", target: "button-2" });
    await page.close();
  });

  it("records what each control's state rules change, as the cascade resolves them", async () => {
    const { page, output } = await capture(BUILDER, [
      { name: "catalog/actions/button", payload: {} },
    ]);
    const m = meta(output.references["catalog/actions/button"]);
    const byTarget = Object.fromEntries(
      Object.values(m.stateStyles as Record<string, { target: string; states: unknown }>).map(
        (s) => [s.target, s.states],
      ),
    );
    expect(byTarget["button-1"]).toMatchObject({
      ":hover": { "background-color": "rgb(248, 248, 248)", "border-top-color": "rgb(1, 2, 3)" },
      ":active": { "background-color": "rgb(221, 221, 221)" },
      ":focus-visible": { "box-shadow": "rgb(18, 100, 163) 0px 0px 0px 2px" },
    });
    // The more specific rule wins for the danger button, as it would when pressed.
    expect(byTarget["button-2"]).toMatchObject({
      ":active": { "background-color": "rgb(160, 20, 20)" },
    });
    // Slack's page is left as it was: no copied rules, no state attributes, the styles restored.
    expect(
      await page.evaluate(() => ({
        sheets: document.styleSheets.length,
        rules: document.styleSheets[0]!.cssRules.length,
        marked: document.querySelectorAll("[data-sbk-state], [data-sbk-still]").length,
        styled: document.querySelectorAll(".c-button[style]").length,
      })),
    ).toEqual({ sheets: 1, rules: 9, marked: 0, styled: 0 });
    await page.close();
  });

  it("saves everything it recorded as a file to import", async () => {
    const page = await browser.newPage();
    await page.setContent(BUILDER);
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(() => {
        const w = window as unknown as Record<string, any>;
        return w.capture({
          items: [{ name: "catalog/actions/button", payload: {} }],
          snap: async () => "<html></html>",
          adapter: w.adapter,
          settle: 0,
          download: "session-1",
        });
      }),
    ]);
    expect(download.suggestedFilename()).toBe("block-kit-refs-session-1.json");
    const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(saved).toEqual({
      references: { "catalog/actions/button": "<html></html>" },
      actions: {},
      behaviour: {},
    });
    await page.close();
  });
});

describe("capture.js running a behaviour probe", () => {
  const probe = {
    name: "catalog/actions/colours@arrows",
    payload: {},
    probe: {
      steps: [{ click: "field-1" }, { key: "ArrowDown" }, { key: "ArrowDown" }, { key: "Enter" }],
    },
  };

  it("asks for each step's real input and records the observations and the payload", async () => {
    const { page, output, seen } = await capture(BUILDER, [probe]);
    expect(seen.map((s) => `${s.do} ${s.key ?? ""}`.trim())).toEqual([
      "click",
      "key ArrowDown",
      "key ArrowDown",
      "key Enter",
    ]);
    const { observations } = output.behaviour["catalog/actions/colours@arrows"];
    expect(observations).toHaveLength(5);
    expect(observations[1]).toMatchObject({
      focus: { target: "field-1", role: "combobox", where: "preview" },
      layers: [{ kind: "popover", role: "listbox" }],
      activeOption: null,
      controls: { "field-1": { expanded: "true" } },
      action: null,
    });
    expect(observations[3].activeOption).toBe("Green");
    expect(observations[4]).toMatchObject({
      layers: [],
      controls: { "field-1": { expanded: "false", value: "Green" } },
      action: { type: "block_actions", actions: [{ selected_option: { value: "Green" } }] },
    });
    // A probe without `snapshot` captures no reference.
    expect(output.references).toEqual({});
    await page.close();
  });

  it("addresses an option in the open list by its place among the open layers' options", async () => {
    const { page, output } = await capture(
      BUILDER,
      [
        {
          name: "catalog/actions/colours@pick-second",
          payload: {},
          probe: { steps: [{ click: "field-1" }, { click: "option-2" }] },
        },
      ],
      { real: false },
    );
    const { observations } = output.behaviour["catalog/actions/colours@pick-second"];
    expect(observations[2].controls["field-1"]).toMatchObject({ value: "Green" });
    expect(observations[2].action).toMatchObject({
      actions: [{ selected_option: { value: "Green" } }],
    });
    await page.close();
  });

  it("dispatches scripted events instead when asked, for a quick run", async () => {
    const { page, output, seen } = await capture(BUILDER, [probe], { real: false });
    expect(seen).toEqual([]);
    expect(output.behaviour["catalog/actions/colours@arrows"].observations[4].action).toMatchObject(
      { actions: [{ selected_option: { value: "Green" } }] },
    );
    await page.close();
  });

  it("submits a modal as the payload leaves it and snapshots the errors", async () => {
    const { page, output, seen } = await capture(MODAL, [
      { name: "extra/modal/form@submit-errors", payload: { type: "modal" } },
    ]);
    expect(seen.map((s) => s.do)).toEqual(["click"]);
    expect(output.references["extra/modal/form@submit-errors"]).toContain(
      "Please complete this required field.",
    );
    expect(output.behaviour["extra/modal/form@submit-errors"]).toMatchObject({
      steps: [{ click: "submit-1" }],
      changed: true,
      observations: [{ focus: { target: "input-1", role: "textbox" }, action: null }],
    });
    await page.close();
  });
});

describe("our side of real input, state styles and probes", () => {
  const blocks = [
    {
      type: "actions",
      elements: [
        { type: "button", action_id: "a", text: { type: "plain_text", text: "Approve" } },
        {
          type: "static_select",
          action_id: "s",
          placeholder: { type: "plain_text", text: "Pick a colour" },
          options: ["Red", "Green", "Blue"].map((t) => ({
            text: { type: "plain_text", text: t },
            value: t,
          })),
        },
      ],
    },
  ];

  it("hovers the addressed control and keeps the pointer there", async () => {
    const page = await harness.open({ blocks });
    const state = stateFor("x/y@hover-button-1")!;
    expect(state.keepPointer).toBe(true);
    await state.ours(page);
    expect(
      await page
        .locator(".sbk-button")
        .first()
        .evaluate((el) => el.matches(":hover")),
    ).toBe(true);
  });

  it("gives the addressed control keyboard focus, even after a click", async () => {
    const page = await harness.open({ blocks });
    await page.mouse.click(790, 690);
    await stateFor("x/y@focus-field-1")!.ours(page);
    expect(
      await page.evaluate(() => {
        const active = document.activeElement!;
        return [!!active.closest(".sbk-select__control"), active.matches(":focus-visible")];
      }),
    ).toEqual([true, true]);
  });

  it("reads what a forced state changes on our control", async () => {
    const page = await harness.open({ blocks });
    const ours = await ourStateStyles(page, "button-1", [":hover", ":active"]);
    expect(Object.keys(ours[":active"]!)).toContain("background-color");
    // Forcing leaves nothing behind.
    await settle(page);
    expect(await page.locator("[data-sbk-force]").count()).toBe(0);
    expect(
      diffStateStyles(
        "button-1",
        { ":active": { "background-color": ours[":active"]!["background-color"]! } },
        { ":active": { "background-color": ours[":active"]!["background-color"]! } },
      ),
    ).toEqual([]);
    expect(
      diffStateStyles("button-1", { ":active": { "background-color": "rgb(1, 2, 3)" } }, {}),
    ).toEqual(["button-1:active background-color: Slack rgb(1, 2, 3), ours unchanged"]);
  });

  it("replays a probe's steps and observes ours the way observe.js reads Slack's", async () => {
    const page = await harness.open({ blocks });
    const observations = await replay(page, [
      { click: "field-1" },
      { key: "ArrowDown" },
      { key: "Enter" },
    ]);
    expect(observations[0]).toEqual(await observeOurs(await harness.open({ blocks })));
    expect(observations[1]).toMatchObject({
      layers: [{ kind: "popover", role: "listbox" }],
      controls: { "field-1": { expanded: "true" } },
    });
    expect(observations[3]).toMatchObject({ layers: [] });
  });
});

/**
 * The Builder's right pane, as measured in it: a Payload and an Actions Preview tab
 * (role=tab, data-qa=tabs_item), Actions Preview showing one CodeMirror with only the latest
 * payload ("{}" before any), updated a moment after the interaction. A link button opens a new tab.
 */
const TABS = `<!doctype html><html><body>
  <div class="p-bkb_preview__message" style="width:512px">
    <button class="c-button" type="button" id="pick">Approve</button>
    <a class="c-button" href="https://example.com/" target="_blank" id="link">Open link</a>
    <button class="c-button" type="button" id="open">Open window</button>
  </div>
  <div role="tab" data-qa="tabs_item" aria-selected="true" tabindex="0">Payload</div>
  <div role="tab" data-qa="tabs_item" aria-selected="false" tabindex="0">Actions Preview</div>
  <div class="p-bkb_codemirror"><div class="react-codemirror2"><div class="CodeMirror" id="pane"></div></div></div>
  <script>
    const pane = document.getElementById("pane");
    const views = { Payload: '{"blocks":[]}', "Actions Preview": "{}" };
    let shown = "Payload";
    pane.CodeMirror = { getValue: () => views[shown] };
    window.log = [];
    for (const tab of document.querySelectorAll('[role="tab"]'))
      tab.addEventListener("click", () => {
        shown = tab.textContent;
        for (const t of document.querySelectorAll('[role="tab"]'))
          t.setAttribute("aria-selected", String(t === tab));
        window.log.push("tab " + shown);
      });
    const send = (id) => setTimeout(() => {
      views["Actions Preview"] = JSON.stringify({ type: "block_actions", actions: [{ action_id: id }] });
    }, 300);
    for (const b of document.querySelectorAll(".c-button")) b.addEventListener("click", () => send(b.id));
    document.getElementById("open").addEventListener("click", () => window.open("https://example.com/"));
    window.adapter = {
      load: async () => {}, theme: () => "light", setTheme: async () => {},
      previewSize: () => "desktop", setPreviewSize: async () => {},
    };
  </script>
</body></html>`;

describe("capture.js reading Actions Preview", () => {
  it("selects the Actions Preview tab and records the payload each step produced", async () => {
    const { page, output } = await capture(
      TABS,
      [
        {
          name: "catalog/actions/button@click-both",
          payload: {},
          probe: { steps: [{ click: "button-1" }, { click: "button-1" }] },
        },
      ],
      { real: false },
    );
    const actions = output.behaviour["catalog/actions/button@click-both"].observations.map(
      (o: { action: unknown }) => o.action,
    );
    expect(actions).toEqual([
      undefined,
      { type: "block_actions", actions: [{ action_id: "pick" }] },
      null,
    ]);
    expect(await page.evaluate(() => (window as unknown as { log: string[] }).log)).toEqual([
      "tab Actions Preview",
    ]);
    await page.close();
  });

  it("ignores the payload Actions Preview still shows from before the item", async () => {
    const page = await browser.newPage();
    await page.setContent(TABS);
    await page.addScriptTag({
      content: `window.capture = ${CAPTURE}; window.observe = ${OBSERVE};`,
    });
    const actions = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      // The previous item's payload lands well after this item started (300ms after the click).
      setTimeout(() => document.getElementById("pick")!.click(), 600);
      const output = await w.capture({
        items: [
          {
            name: "catalog/actions/button@stale",
            payload: {},
            // A first step that sends nothing, as a field focused before typing.
            probe: { steps: [{ wait: 0 }] },
          },
        ],
        snap: async () => "",
        observe: w.observe,
        adapter: w.adapter,
        settle: 0,
        real: false,
      });
      void output;
      return w.sbkCaptureOutput.behaviour["catalog/actions/button@stale"].observations.map(
        (o: { action: unknown }) => o.action,
      );
    });
    expect(actions).toEqual([undefined, null]);
    await page.close();
  });

  it("never lets a link or a url button open a tab, and restores window.open after", async () => {
    const popups: string[] = [];
    // Real clicks: a scripted one opens no tab anyway.
    const { page } = await capture(
      TABS,
      [
        {
          name: "catalog/actions/button@links",
          payload: {},
          probe: {
            steps: [{ click: "button-2" }, { click: { role: "link", name: "Open link" } }],
          },
        },
      ],
      {},
      async (p) => {
        p.context().on("page", (popup) => popups.push(popup.url()));
        await p.evaluate(() => {
          (window as unknown as Record<string, unknown>).nativeOpen = window.open;
        });
      },
    );
    await page.waitForTimeout(300);
    expect(popups).toEqual([]);
    expect(
      await page.evaluate(
        () => window.open === (window as unknown as Record<string, unknown>).nativeOpen,
      ),
    ).toBe(true);
    await page.close();
  });
});

/**
 * A chart's card in the Builder's mobile preview: at least 400px wide inside a horizontal scroll
 * container 320px wide.
 */
const WIDE = `<!doctype html><html><body style="margin:0">
  <div class="p-bkb_preview__message" style="width:320px">
    <p>Quarterly revenue</p>
    <div class="scrollContainer__x1" style="overflow-x:auto">
      <div class="card" style="min-width:400px;height:40px;background:linear-gradient(90deg, red, blue)">Card</div>
    </div>
  </div>
  <script>
    window.adapter = {
      load: async () => {}, theme: () => "light", setTheme: async () => {},
      previewSize: () => window.size || "desktop", setPreviewSize: async (s) => { window.size = s; },
    };
  </script>
</body></html>`;

describe("capture.js with content wider than the preview", () => {
  it("records each horizontal scroll container's widths and offset", async () => {
    const { page, output } = await capture(WIDE, [
      { name: "catalog/data-visualization/bar-single-series@mobile", payload: {} },
      { name: "catalog/data-visualization/bar-single-series@scrolled-end+mobile", payload: {} },
    ]);
    const rest = meta(output.references["catalog/data-visualization/bar-single-series@mobile"]);
    expect(rest.scrollers).toEqual([
      { ref: expect.any(String), scrollWidth: 400, clientWidth: 320, scrollLeft: 0 },
    ]);
    const end = meta(
      output.references["catalog/data-visualization/bar-single-series@scrolled-end+mobile"],
    );
    expect(end.scrollers[0].scrollLeft).toBe(80);
    await page.close();
  });

  it("captures +full with the preview widened and leaves the page as it was", async () => {
    const { page, output } = await capture(WIDE, [
      { name: "catalog/data-visualization/bar-single-series@mobile+full", payload: {} },
    ]);
    const html = output.references["catalog/data-visualization/bar-single-series@mobile+full"];
    const m = meta(html);
    expect(m.width).toBe(400);
    expect(m.full).toEqual({ widenedBy: 80, expanded: 0 });
    expect(m.scrollers[0]).toMatchObject({ scrollWidth: 400, clientWidth: 400 });
    expect(html).not.toContain("data-sbk-full");
    expect(
      await page.evaluate(() => ({
        width: document.querySelector(".p-bkb_preview__message")!.getBoundingClientRect().width,
        marked: document.querySelectorAll("[data-sbk-full]").length,
        sheets: document.styleSheets.length,
      })),
    ).toEqual({ width: 320, marked: 0, sheets: 0 });
    await page.close();
  });
});

describe("our side of wide content", () => {
  it("scrolls the reference's frozen container back to Slack's offset", async () => {
    const { restoreScroll } = await import("./scrollers");
    const page = await browser.newPage();
    await page.setContent(
      `<div id="sbk-reference"><div data-ref="7" style="width:320px;overflow-x:auto"><div style="width:400px;height:10px"></div></div></div>`,
    );
    await restoreScroll(page, [{ ref: "7", scrollWidth: 400, clientWidth: 320, scrollLeft: 80 }]);
    expect(await page.locator('[data-ref="7"]').evaluate((el) => el.scrollLeft)).toBe(80);
    await page.close();
  });

  it("measures, scrolls and expands our horizontal scroll containers", async () => {
    const { expandOurs, ourScrollers, scrollOursToEnd } = await import("./scrollers");
    const page = await harness.open({ blocks: [] });
    await page.evaluate(() => {
      document.getElementById("sbk-render")!.innerHTML =
        '<div style="width:320px;overflow-x:auto" id="s"><div style="min-width:400px;height:10px"></div></div>';
    });
    expect(await ourScrollers(page)).toEqual([
      { scrollWidth: 400, clientWidth: 320, scrollLeft: 0 },
    ]);
    await scrollOursToEnd(page);
    expect((await ourScrollers(page))[0]!.scrollLeft).toBe(80);
    expect(await expandOurs(page)).toBe(1);
    expect(await page.locator("#s").evaluate((el) => el.getBoundingClientRect().width)).toBe(400);
  });
});

describe("capture.js run one item at a time, its output copied through the clipboard", () => {
  it("keeps what every call recorded, as pure-ASCII JSON, until asked to start over", async () => {
    const page = await browser.newPage();
    await page.setContent(BUILDER);
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const { json, returned, afterReset, refused } = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      const once = (name: string, extra = {}) =>
        w.capture({
          items: [{ name, payload: {} }],
          snap: async () => "<p>café 😀</p>",
          adapter: w.adapter,
          settle: 0,
          ...extra,
        });
      await once("catalog/actions/button");
      const returned = await once("catalog/actions/button@dark");
      const json = w.sbkCaptureJson();
      // Starting over is a call of its own; the old option refuses instead of dropping the output.
      const refused = await once("catalog/section/plain-text", { reset: true }).then(
        () => "",
        (e: Error) => String(e),
      );
      w.sbkCaptureReset();
      await once("catalog/section/plain-text");
      return { json, returned, refused, afterReset: Object.keys(w.sbkCaptureOutput.references) };
    });
    expect(refused).toMatch(/sbkCaptureReset/);
    expect(Object.keys(returned)).toEqual(["catalog/actions/button@dark"]);
    expect([...json].every((c) => c.charCodeAt(0) < 128)).toBe(true);
    expect(Object.keys(JSON.parse(json).references)).toEqual([
      "catalog/actions/button",
      "catalog/actions/button@dark",
    ]);
    expect(JSON.parse(json).references["catalog/actions/button"]).toBe("<p>café 😀</p>");
    expect(afterReset).toEqual(["catalog/section/plain-text"]);
    await page.close();
  });

  it("refuses to click a button with a url unless allowed", async () => {
    const page = await browser.newPage();
    await page.setContent(TABS);
    await page.addScriptTag({
      content: `window.capture = ${CAPTURE}; window.observe = ${OBSERVE};`,
    });
    const error = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      try {
        await w.capture({
          items: [
            {
              name: "catalog/actions/button@open-link",
              payload: {
                blocks: [
                  {
                    type: "actions",
                    elements: [
                      { type: "button", text: { type: "plain_text", text: "A" } },
                      {
                        type: "button",
                        url: "https://example.com/",
                        text: { type: "plain_text", text: "B" },
                      },
                    ],
                  },
                ],
              },
              probe: { steps: [{ click: "button-2" }] },
            },
          ],
          snap: async () => "",
          observe: w.observe,
          adapter: w.adapter,
          settle: 0,
          real: false,
        });
        return undefined;
      } catch (e) {
        return String(e);
      }
    });
    expect(error).toMatch(/button-2, a button with a url/);
    await page.close();
  });
});

describe("our side of the wider control addresses", () => {
  const plain = (text: string) => ({ type: "plain_text", text });
  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: "See <https://example.com/|the docs> or ask <!here>" },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "b",
          text: plain("Delete"),
          confirm: {
            title: plain("Sure?"),
            text: plain("It goes away."),
            confirm: plain("Delete"),
            deny: plain("Keep"),
          },
        },
        {
          type: "static_select",
          action_id: "s",
          placeholder: plain("Pick"),
          options: ["Red", "Green"].map((t) => ({ text: plain(t), value: t })),
        },
      ],
    },
  ];

  it("hovers a link and focuses a mention by address", async () => {
    const page = await harness.open({ blocks });
    await stateFor("x/y@hover-link-1")!.ours(page);
    expect(
      await page
        .locator("a.sbk-link")
        .first()
        .evaluate((el) => el.matches(":hover")),
    ).toBe(true);
    const observed = await observeOurs(page);
    expect(observed).toHaveProperty("tooltip");
    expect(observed.busy).toBe(false);
  });

  it("reaches a list's options and a confirm dialog's buttons in the open layers", async () => {
    const page = await harness.open({ blocks });
    const observations = await replay(page, [
      { click: "field-1" },
      { click: "option-2" },
      { click: "button-1" },
      { click: "deny-1" },
    ]);
    expect(observations[2]!.controls["field-1"]).toMatchObject({ value: "Green" });
    expect(observations[3]!.layers).toMatchObject([{ kind: "dialog" }]);
    expect(observations[4]!.layers).toEqual([]);
  });
});

describe("probes that capture a state reached in more than one step, and scroll blocks", () => {
  it("snapshots mid-probe with the hover on an open list's option held", async () => {
    const { page, output, seen } = await capture(BUILDER, [
      {
        name: "catalog/actions/colours@pick-green+dark",
        payload: {},
        probe: {
          steps: [
            { click: "field-1" },
            { hover: "option-2" },
            { snapshot: "open-hover-green" },
            { click: "option-2" },
          ],
        },
      },
    ]);
    expect(seen.map((s) => s.do)).toEqual(["click", "hover", "click"]);
    const html = output.references["catalog/actions/colours@open-hover-green+dark"];
    expect(html).toBeDefined();
    expect(meta(html).input).toEqual({ input: "hover", target: "option-2" });
    // A dark run only takes the snapshots; the behaviour was recorded in light.
    expect(output.behaviour["catalog/actions/colours@pick-green"]).toBeUndefined();
    await page.close();
  });

  it("records which control had keyboard focus at a snapshot, and the behaviour in light", async () => {
    const { page, output } = await capture(BUILDER, [
      {
        name: "catalog/actions/colours@arrow-in",
        payload: {},
        probe: { steps: [{ click: "field-1" }, { key: "ArrowDown" }, { snapshot: "open-focus" }] },
      },
    ]);
    expect(meta(output.references["catalog/actions/colours@open-focus"]).focus).toEqual({
      target: "field-1",
      visible: true,
      active: "option-1",
    });
    expect(output.behaviour["catalog/actions/colours@arrow-in"].observations).toHaveLength(4);
    await page.close();
  });

  it("scrolls a block that scrolls itself and observes its offset", async () => {
    const { page, output } = await capture(
      WIDE,
      [
        {
          name: "catalog/data-visualization/bar-single-series@scroll-end",
          payload: {},
          probe: { steps: [{ scroll: "scroller-1", left: "end" }] },
        },
      ],
      { real: false },
    );
    const { observations } =
      output.behaviour["catalog/data-visualization/bar-single-series@scroll-end"];
    expect(observations[0].controls["scroller-1"]).toMatchObject({ scrollLeft: 0 });
    expect(observations[1].controls["scroller-1"]).toMatchObject({
      scrollLeft: 80,
      scrollWidth: 400,
      clientWidth: 320,
    });
    await page.close();
  });

  it("replays a mid-probe snapshot on ours with the pointer kept on the option", async () => {
    const page = await harness.open({
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "s",
              placeholder: { type: "plain_text", text: "Pick" },
              options: ["Red", "Green"].map((t) => ({
                text: { type: "plain_text", text: t },
                value: t,
              })),
            },
          ],
        },
      ],
    });
    const state = stateFor(
      "x/y@open-hover-green+dark",
      new Map([
        [
          "x/y@pick-green",
          {
            steps: [
              { click: "field-1" },
              { hover: "option-2" },
              { snapshot: "open-hover-green" },
              { click: "option-2" },
            ],
          },
        ],
      ]),
    )!;
    expect(state.keepPointer).toBe(true);
    await state.ours(page);
    expect(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('[role="option"]')].find((o) => o.matches(":hover"))
            ?.textContent,
      ),
    ).toBe("Green");
  });
});

describe("our video player and tooltips", () => {
  it("hovers an icon button, then finds its tooltip as tooltip-1 in the open layers", async () => {
    const mount = await Bun.file(
      join(import.meta.dir, "../../../fixtures/extra/fidelity/icon-button/mixed.json"),
    ).json();
    const page = await harness.open(Array.isArray(mount) ? { blocks: mount } : mount);
    const observations = await replay(page, [{ hover: "icon-1" }, { wait: 1000 }]);
    expect(observations.at(-1)!.tooltip).toBeTruthy();
    // A tooltip doesn't take the pointer (pointer-events: none), so it's addressed, not hovered.
    const tip = await ourTarget(page, { kind: "tooltip", index: 1 });
    expect(await tip.evaluate((el) => getComputedStyle(el as Element).pointerEvents)).toBe("none");
  });
});

describe("capture.js real-input fixes from the Builder run", () => {
  /** A time picker as the Builder draws it: its value in an overlay over the matched input. */
  const PICKER = `<!doctype html><html><body style="margin:0">
    <div class="p-bkb_preview__message" style="width:512px;padding:20px">
      <div class="c-select_input__wrapper" style="position:relative;width:190px;height:28px">
        <input class="c-select_input" role="combobox" style="width:190px;height:28px;box-sizing:border-box">
        <div class="c-select_input__content" style="position:absolute;inset:0;background:#fff">1:37 PM</div>
      </div>
      <button class="c-button" type="button">Go</button>
    </div>
    <script>
      window.adapter = {
        load: async () => {}, theme: () => "light", setTheme: async () => {},
        previewSize: () => "desktop", setPreviewSize: async () => {},
      };
    </script>
  </body></html>`;

  it("sees a hover on an overlay drawn over the control, and only after the pointer moves there", async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(PICKER);
    await page.addScriptTag({
      content: `window.capture = ${CAPTURE}; window.observe = ${OBSERVE};`,
    });
    // The pointer already rests on the picker, as if left there by an earlier item.
    await page.mouse.move(100, 34);
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      w.capture({
        items: [
          {
            name: "contexts/timepicker/accessory@poke-field-1",
            payload: {},
            probe: { steps: [{ hover: "field-1" }] },
          },
        ],
        snap: async () => "",
        observe: w.observe,
        adapter: w.adapter,
        settle: 0,
      }).then(() => (w.done = true));
    });
    const first = await page.evaluate(() =>
      (window as unknown as Record<string, any>).sbkAwaitInstruction(undefined, 5000, 0.5),
    );
    expect(first.instruction).toMatchObject({ do: "hover", target: "field-1" });
    expect(first.screen.x).toBe(Math.round(first.instruction.x * 0.5));
    await page.waitForTimeout(800);
    // Resting there doesn't count: the step still waits.
    expect(
      await page.evaluate(() => (window as unknown as Record<string, any>).done),
    ).toBeUndefined();
    await page.mouse.move(first.instruction.x, first.instruction.y);
    const next = await page.evaluate(
      (seq) => (window as unknown as Record<string, any>).sbkAwaitInstruction(seq, 5000),
      first.seq,
    );
    expect(next).toEqual({ done: true });
    await page.close();
  });

  it("leaves the time the tab was hidden out of a wait's timeout", async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(PICKER);
    await page.addScriptTag({
      content: `window.capture = ${CAPTURE}; window.observe = ${OBSERVE};`,
    });
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      w.capture({
        items: [{ name: "x/y@poke", payload: {}, probe: { steps: [{ hover: "button-1" }] } }],
        snap: async () => "",
        observe: w.observe,
        adapter: w.adapter,
        settle: 0,
        timeout: 1000,
      }).then(
        () => (w.done = "ok"),
        (e: Error) => (w.done = String(e)),
      );
    });
    const hide = (state: string) =>
      page.evaluate((s) => {
        Object.defineProperty(document, "visibilityState", { value: s, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await page.waitForTimeout(300);
    await hide("hidden");
    await page.waitForTimeout(2000);
    await hide("visible");
    await page.waitForTimeout(200);
    const box = (await page.locator(".c-button").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => (window as unknown as Record<string, any>).done);
    expect(await page.evaluate(() => (window as unknown as Record<string, any>).done)).toBe("ok");
    await page.close();
  });

  it("freezes a tall preview at its full width, without the pane's scrollbar", async () => {
    // Classic scrollbars take room, as on the maintainer's screen.
    const classic = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    const page = await classic.newPage({ viewport: { width: 900, height: 400 } });
    await page.setContent(`<!doctype html><html><head>
      <style>#pane::-webkit-scrollbar { width: 15px; background: #eee; }
      #pane::-webkit-scrollbar-thumb { background: #999; }</style></head><body style="margin:0">
      <div id="pane" style="width:532px;height:300px;overflow-y:auto">
        <div class="p-bkb_preview__message" style="padding:0 10px"><div style="height:900px">Tall</div></div>
      </div>
      <script>
        window.adapter = {
          load: async () => {}, theme: () => "light", setTheme: async () => {},
          previewSize: () => "desktop", setPreviewSize: async () => {},
        };
      </script>
    </body></html>`);
    await page.addScriptTag({ content: `window.capture = ${CAPTURE}; window.snap = ${SNAPSHOT};` });
    const { width, after } = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      const refs = await w.capture({
        items: [{ name: "x/tall", payload: {} }],
        snap: w.snap,
        adapter: w.adapter,
        settle: 0,
      });
      const html = refs["x/tall"] as string;
      return {
        width: JSON.parse(/id="sbk-reference-meta">(\{.*?\})</.exec(html)![1]!).width,
        after: document.querySelector(".p-bkb_preview__message")!.getBoundingClientRect().width,
      };
    });
    expect(width).toBe(532);
    // The scrollbar is back afterwards.
    expect(after).toBeLessThan(532);
    await classic.close();
  });
});

describe("capture.js fixes from the third Builder run", () => {
  const ADAPTER = `window.adapter = {
    load: async () => {}, theme: () => "light", setTheme: async () => {},
    previewSize: () => "desktop", setPreviewSize: async () => {},
  };`;
  const stand = (body: string, script = "") =>
    `<!doctype html><html><body style="margin:0">
      <div class="p-bkb_preview__message" style="width:512px;padding:20px">
        <span class="p-bkb_preview__app_name">Your App</span>
        ${body}
      </div>
      <script>${ADAPTER}${script}</script>
    </body></html>`;
  /** A time picker as the Builder draws it: the value in an overlay over the input, a chevron beside. */
  const TIME_PICKER = `<div class="c-select_input__wrapper" style="position:relative;display:flex;width:220px;height:28px">
      <div style="position:relative;width:190px">
        <input class="c-select_input" role="combobox" aria-expanded="false" style="width:190px;height:28px;box-sizing:border-box">
        <div class="c-select_input__content" style="position:absolute;inset:0;background:#fff">1:37 PM</div>
      </div>
      <div class="c-select_input__icon_container" style="width:30px;height:28px">v</div>
    </div>`;

  /** Starts a run and returns a driver that waits for each instruction. */
  async function start(html: string, items: unknown[], options: Record<string, unknown> = {}) {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(html);
    await page.addScriptTag({
      content: `window.capture = ${CAPTURE}; window.observe = ${OBSERVE};`,
    });
    await page.evaluate(
      ([list, opts]) => {
        const w = window as unknown as Record<string, any>;
        w.capture({
          items: list,
          snap: async () => "",
          observe: w.observe,
          adapter: w.adapter,
          settle: 0,
          timeout: 3000,
          ...opts,
        }).then(
          () => (w.done = "ok"),
          (e: Error) => (w.done = String(e)),
        );
      },
      [items, options] as const,
    );
    let seq: number | undefined;
    return {
      page,
      next: async () => {
        const got = await page.evaluate(
          (s) => (window as unknown as Record<string, any>).sbkAwaitInstruction(s, 5000),
          seq,
        );
        seq = got.seq ?? seq;
        return got;
      },
      result: async () => {
        await page.waitForFunction(() => (window as unknown as Record<string, any>).done);
        return {
          done: await page.evaluate(() => (window as unknown as Record<string, any>).done),
          output: await page.evaluate(
            () => (window as unknown as Record<string, any>).sbkCaptureOutput,
          ),
        };
      },
    };
  }

  it("counts a click on a time picker's overlay or chevron as a click on the field", async () => {
    for (const where of ["overlay", "chevron"]) {
      const run = await start(stand(TIME_PICKER), [
        { name: `x/time@${where}`, payload: {}, probe: { steps: [{ click: "field-1" }] } },
      ]);
      const { instruction } = await run.next();
      expect(instruction).toMatchObject({ do: "click", target: "field-1" });
      const chevron = (await run.page.locator(".c-select_input__icon_container").boundingBox())!;
      // The overlay covers the input's middle, so the instruction's own point lands on it.
      if (where === "overlay") await run.page.mouse.click(instruction.x, instruction.y);
      else await run.page.mouse.click(chevron.x + 10, chevron.y + 10);
      expect((await run.result()).done).toBe("ok");
      await run.page.close();
    }
  });

  it("counts a hover anywhere in a time picker's field, whose input is narrower than the field", async () => {
    // Slack's time picker input sits under the value overlay and doesn't draw the field's box, so
    // no wrapper the same size as the input holds the overlay.
    const run = await start(
      stand(`<div class="c-select_input__wrapper" style="position:relative;width:220px;height:28px">
        <input class="c-select_input" role="combobox" style="position:absolute;left:0;top:0;width:60px;height:28px;box-sizing:border-box">
        <div class="c-select_input__content" style="position:absolute;inset:0;background:#fff">1:37 PM</div>
      </div>`),
      [{ name: "x/time@hover", payload: {}, probe: { steps: [{ hover: "field-1" }] } }],
    );
    const { instruction } = await run.next();
    expect(instruction).toMatchObject({ do: "hover", target: "field-1" });
    await run.page.mouse.move(instruction.x, instruction.y);
    expect((await run.result()).done).toBe("ok");
    await run.page.close();
  });

  it("counts a press on a control that re-renders its icon as it's pressed", async () => {
    const run = await start(
      stand(
        `<button data-qa="bk_feedback_button_positive" role="radio" aria-checked="false" style="width:40px;height:40px"><svg width="20" height="20"><rect width="20" height="20"/></svg></button>`,
        `const b = document.querySelector("button");
         b.addEventListener("mousedown", () => { b.innerHTML = '<svg width="20" height="20"><circle cx="10" cy="10" r="10"/></svg>'; b.setAttribute("aria-checked", "true"); });`,
      ),
      [{ name: "x/feedback@poke", payload: {}, probe: { steps: [{ click: "feedback-1" }] } }],
    );
    const { instruction } = await run.next();
    await run.page.mouse.click(instruction.x, instruction.y);
    expect((await run.result()).done).toBe("ok");
    await run.page.close();
  });

  it("records the first click on a second select, which an open menu's overlay takes", async () => {
    // Slack's open menu lays an overlay over the page: a click elsewhere only closes it.
    const run = await start(
      stand(
        `<div role="combobox" class="c-select_input" aria-expanded="false" style="width:200px;height:30px">Alpha</div>
         <div role="combobox" class="c-select_input" aria-expanded="false" style="width:200px;height:30px;margin-top:20px">Choose</div>`,
        `const [a, b] = document.querySelectorAll('[role="combobox"]');
         const open = (field) => {
           field.setAttribute("aria-expanded", "true");
           const portal = document.createElement("div");
           portal.className = "ReactModalPortal";
           portal.innerHTML = '<div class="ReactModal__Overlay" style="position:fixed;inset:0"><div class="ReactModal__Content" role="listbox" style="position:absolute;left:600px;top:20px;width:100px;height:60px;background:#fff"><div role="option">One</div></div></div>';
           portal.firstChild.addEventListener("click", (e) => {
             if (e.target !== portal.firstChild) return;
             field.setAttribute("aria-expanded", "false");
             portal.remove();
           });
           document.body.append(portal);
         };
         a.addEventListener("click", () => open(a));
         b.addEventListener("click", () => open(b));`,
      ),
      [
        {
          name: "x/selects@outside-click",
          payload: {},
          probe: { steps: [{ click: "field-1" }, { click: "field-2" }] },
        },
      ],
    );
    for (let i = 0; i < 2; i++) {
      const { instruction } = await run.next();
      await run.page.mouse.click(instruction.x, instruction.y);
    }
    const { done, output } = await run.result();
    expect(done).toBe("ok");
    const { observations } = output.behaviour["x/selects@outside-click"];
    expect(observations[1].controls["field-1"].expanded).toBe("true");
    expect(observations[2].layers).toEqual([]);
    expect(observations[2].controls["field-2"].expanded).toBe("false");
    await run.page.close();
  });

  it("finishes a typing step that closes the list half way", async () => {
    // As in Slack's static select: a space picks the highlighted option and closes the list.
    const run = await start(
      stand(
        `<input class="c-select_input" role="combobox" aria-expanded="false" style="width:200px">`,
        `const f = document.querySelector("input");
         f.addEventListener("click", () => f.setAttribute("aria-expanded", "true"));
         f.addEventListener("keydown", (e) => {
           if (e.key !== " " || f.getAttribute("aria-expanded") !== "true") return;
           e.preventDefault();
           f.value = "Option 1";
           f.setAttribute("aria-expanded", "false");
         });`,
      ),
      [
        {
          name: "x/select@typeahead",
          payload: {},
          probe: { steps: [{ click: "field-1" }, { type: "Option 3" }] },
        },
      ],
    );
    const click = await run.next();
    await run.page.mouse.click(click.instruction.x, click.instruction.y);
    const type = await run.next();
    expect(type.instruction).toMatchObject({ do: "type", text: "Option 3" });
    await run.page.keyboard.type("Option 3");
    const { done, output } = await run.result();
    expect(done).toBe("ok");
    expect(
      output.behaviour["x/select@typeahead"].observations[2].controls["field-1"],
    ).toMatchObject({ expanded: "false" });
    await run.page.close();
  });

  it("says a control the Builder draws as plain text can't take focus, without asking for a Tab", async () => {
    const run = await start(stand(""), [{ name: "x/header@focus-sender-1", payload: {} }]);
    const { done } = await run.result();
    expect(done).toContain("sender-1 can't take focus in the Builder");
    await run.page.close();
  });

  it("says a container that takes no focus itself would hand it to its button", async () => {
    const run = await start(
      stand(
        `<div class="card__Sefd2"><p>Body</p><button class="c-button" type="button">Go</button></div>`,
      ),
      [{ name: "x/card@focus-card-1", payload: {} }],
    );
    const { done } = await run.result();
    expect(done).toContain(
      "card-1 can't take focus itself in the Builder; the focus would go to button-1",
    );
    await run.page.close();
  });

  it("keeps the operating system's file picker from opening during a run, and restores it after", async () => {
    const run = await start(
      stand(
        `<button class="c-button" type="button">Upload</button>
         <label id="pick">Choose<input type="file" style="display:none"></label>`,
        `document.querySelector(".c-button").addEventListener("click", () => {
           const input = document.querySelector('input[type="file"]');
           input.click();
           try { input.showPicker(); } catch {}
           document.getElementById("pick").click();
         });`,
      ),
      [{ name: "x/file@poke", payload: {}, probe: { steps: [{ click: "button-1" }] } }],
    );
    let opened = 0;
    run.page.on("filechooser", () => opened++);
    const { instruction } = await run.next();
    await run.page.mouse.click(instruction.x, instruction.y);
    expect((await run.result()).done).toBe("ok");
    await run.page.waitForTimeout(300);
    expect(opened).toBe(0);
    // The page's own input.click is back once the run is over.
    expect(
      await run.page.evaluate(() => HTMLInputElement.prototype.click.toString().includes("native")),
    ).toBe(true);
    await run.page.close();
  });

  it("reads an option's text without what's hidden from assistive technology", async () => {
    const page = await browser.newPage();
    await page.setContent(`<div id="sbk-render"></div>
      <div class="sbk-popover"><div role="listbox">
        <div role="option" data-active="true">Option 1<span aria-hidden="true">Enter</span></div>
      </div></div>`);
    await page.addScriptTag({ content: `window.observe = ${OBSERVE};` });
    const seen = await page.evaluate(() =>
      (window as unknown as Record<string, any>).observe(window, { side: "ours" }),
    );
    expect(seen.activeOption).toBe("Option 1");
    await page.close();
  });

  it("waits a moment for a control that renders after the preview settles", async () => {
    const run = await start(
      stand(
        "",
        `setTimeout(() => {
           const card = document.createElement("div");
           card.setAttribute("data-qa", "bk_contact_card_block");
           card.setAttribute("role", "button");
           card.tabIndex = 0;
           card.style.cssText = "width:200px;height:40px";
           document.querySelector(".p-bkb_preview__message").append(card);
         }, 800);`,
      ),
      [{ name: "x/contact@poke", payload: {}, probe: { steps: [{ click: "contact-1" }] } }],
    );
    const { instruction } = await run.next();
    expect(instruction).toMatchObject({ do: "click", target: "contact-1" });
    await run.page.mouse.click(instruction.x, instruction.y);
    expect((await run.result()).done).toBe("ok");
    await run.page.close();
  });
});

describe("Slack's controls by address, in the captured references", () => {
  const FIXTURES = join(import.meta.dir, "../../../fixtures");
  /** The `address` control in a reference, as capture.js finds it: its tag, input type and text. */
  async function control(reference: string, address: string) {
    const page = await browser.newPage();
    await page.setContent(await readFile(join(FIXTURES, `${reference}.reference.html`), "utf8"));
    const { kind, index } = parseTarget(address)!;
    const el = (
      await page.evaluateHandle(findTarget, [SLACK[kind], index, ".p-bkb_preview__message"] as [
        string,
        number,
        string,
      ])
    ).asElement();
    const out = el
      ? await el.evaluate((e) =>
          [
            e.tagName.toLowerCase(),
            e.getAttribute("type") === "button" ? "" : (e.getAttribute("type") ?? ""),
            e.textContent!.trim(),
          ]
            .filter(Boolean)
            .join(" "),
        )
      : null;
    await page.close();
    return out;
  }

  it("counts a section accessory's multi-select as a field, not a button", async () => {
    expect(await control("contexts/multi_static_select/accessory", "field-1")).toBe(
      "button Select items",
    );
    expect(await control("contexts/multi_static_select/accessory", "button-1")).toBeNull();
    expect(await control("extra/payloads/accessory-multi-selects", "field-3")).toBe(
      "button Select users",
    );
  });

  it("counts number, email and URL inputs as inputs", async () => {
    expect(await control("extra/payloads/dispatch-inputs", "input-1")).toBe("input number");
    expect(await control("extra/payloads/dispatch-inputs", "input-2")).toBe("input url");
    expect(await control("extra/payloads/dispatch-inputs", "input-3")).toBe("input text");
    expect(await control("extra/payloads/dispatch-email", "input-1")).toBe("input email");
    // A date picker's input is text, and a field.
    expect(await control("contexts/datetimepicker/actions", "input-1")).toBeNull();
  });

  it("finds an expanded plan's and task card's sources, which a collapsed one doesn't draw", async () => {
    expect(await control("catalog/agents/plan@expanded", "source-1")).toBe(
      "a Thinking Steps Documentation",
    );
    expect(await control("catalog/agents/task-card@expanded", "source-2")).toBe(
      "a Task card block",
    );
    expect(await control("catalog/agents/plan", "source-1")).toBeNull();
    expect(await control("catalog/agents/task-card", "link-1")).toBeNull();
    expect(await control("catalog/agents/task-card@expanded", "link-1")).toBe("a Thinking Steps");
  });
});

describe("capture.js keeping what it captured in IndexedDB", () => {
  const ORIGIN = "https://builder.test/";
  /** A stand-in Builder served from a real origin, which IndexedDB needs. */
  async function builderTab(
    context: Awaited<ReturnType<Browser["newContext"]>>,
    script = "",
  ): Promise<Page> {
    const page = await context.newPage();
    await page.route(`${ORIGIN}**`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div class="p-bkb_preview__message" style="width:512px">
            <button class="c-button" type="button">Go</button>
          </div>
          <script>window.adapter = {
            load: async () => {}, theme: () => "light", setTheme: async () => {},
            previewSize: () => "desktop", setPreviewSize: async () => {},
          };${script}</script></body></html>`,
      }),
    );
    await page.goto(ORIGIN);
    await page.addScriptTag({
      content: `window.capture = ${CAPTURE}; window.snap = ${SNAPSHOT}; window.observe = ${OBSERVE};`,
    });
    return page;
  }
  const run = (page: Page, items: unknown[]) =>
    page.evaluate(async (list) => {
      const w = window as unknown as Record<string, any>;
      await w.capture({
        items: list,
        snap: async () => "<p>frozen</p>",
        observe: w.observe,
        adapter: w.adapter,
        settle: 0,
        stateStyles: false,
      });
      return w.sbkCapturePersistError as string | undefined;
    }, items);

  it("restores every item a closed tab captured, in a fresh tab", async () => {
    const context = await browser.newContext();
    const first = await builderTab(context);
    expect(await run(first, [{ name: "x/one", payload: {} }])).toBeUndefined();
    // A probe's behaviour is persisted as its own record too.
    expect(
      await run(first, [
        { name: "x/two@poke", payload: {}, probe: { steps: [{ wait: 1 }] }, real: false },
      ]),
    ).toBeUndefined();
    await first.close();
    const fresh = await builderTab(context);
    const restored = await fresh.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      await w.capture({ items: [] });
      return JSON.parse(w.sbkCaptureJson());
    });
    expect(Object.keys(restored.references)).toEqual(["x/one"]);
    expect(restored.references["x/one"]).toContain("frozen");
    expect(Object.keys(restored.behaviour)).toEqual(["x/two@poke"]);
    await context.close();
  });

  it("keeps the items done before the tab is reloaded mid-run", async () => {
    const context = await browser.newContext();
    const page = await builderTab(context);
    // The second item waits for a real hover that never comes: the tab goes away meanwhile.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      w.capture({
        items: [
          { name: "x/one", payload: {} },
          { name: "x/one@hover-button-1", payload: {} },
        ],
        snap: async () => "<p>frozen</p>",
        adapter: w.adapter,
        settle: 0,
        stateStyles: false,
      }).catch(() => {});
    });
    await page.waitForFunction(
      () => (window as unknown as Record<string, any>).sbkCaptureWaiting?.do === "hover",
    );
    await page.reload();
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const restored = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      await w.capture({ items: [] });
      return Object.keys(JSON.parse(w.sbkCaptureJson()).references);
    });
    expect(restored).toEqual(["x/one"]);
    await context.close();
  });

  it("creates its store in a database an earlier run left at version 1 without one", async () => {
    const context = await browser.newContext();
    const page = await builderTab(context);
    // As the Builder run found it: sbk-capture v1 with no object store at all.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const r = indexedDB.open("sbk-capture", 1);
          r.onsuccess = () => {
            r.result.close();
            resolve();
          };
        }),
    );
    expect(await run(page, [{ name: "x/one", payload: {} }])).toBeUndefined();
    await page.reload();
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const restored = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      await w.capture({ items: [] });
      return Object.keys(w.sbkCaptureOutput.references);
    });
    expect(restored).toEqual(["x/one"]);
    await context.close();
  });

  it("moves the earlier single-record output into one record per entry", async () => {
    const context = await browser.newContext();
    const page = await builderTab(context);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const r = indexedDB.open("sbk-capture", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("output");
          r.onsuccess = () => {
            const tx = r.result.transaction("output", "readwrite");
            tx.objectStore("output").put(
              { references: { "x/old": "<p>old</p>" }, actions: {}, behaviour: {} },
              "output",
            );
            tx.oncomplete = () => {
              r.result.close();
              resolve();
            };
          };
        }),
    );
    const counts = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      await w.capture({ items: [] });
      return w.sbkCaptureRestore();
    });
    expect(counts).toEqual({ references: 1, actions: 0, behaviour: 0 });
    await context.close();
  });

  it("says when a write fails instead of dropping it silently", async () => {
    const context = await browser.newContext();
    // IndexedDB refuses every write, as a full or blocked store would.
    const page = await builderTab(
      context,
      `IDBObjectStore.prototype.put = function () { throw new DOMException("no room", "QuotaExceededError"); };`,
    );
    const error = await run(page, [{ name: "x/one", payload: {} }]);
    expect(error).toContain("references/x/one");
    expect(error).toContain("QuotaExceededError");
    // The window's copy still has it.
    expect(
      await page.evaluate(() =>
        Object.keys((window as unknown as Record<string, any>).sbkCaptureOutput.references),
      ),
    ).toEqual(["x/one"]);
    await context.close();
  });
});
