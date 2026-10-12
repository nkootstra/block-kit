// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// capture.js drives Block Kit Builder through a capture list. Here a stand-in page plays the
// Builder (its adapter records what the runner asked for), so the loop itself is what's tested.
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";

const CAPTURE = await Bun.file(join(import.meta.dir, "capture.js")).text();

// The runner waits for the preview to settle; a hang should fail one case, not the whole file.
setDefaultTimeout(30_000);

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(() => browser.close());

/** A stand-in Builder: a preview with a select that opens a portalled list when clicked. */
const BUILDER = `<!doctype html><html class="sk-client-theme--light"><body>
  <div class="p-bkb_preview__message" style="width:512px"><div class="c-select_input" tabindex="0">Pick one</div><button class="c-button">Delete</button></div>
  <script>
    window.log = [];
    document.querySelector(".c-select_input").addEventListener("click", () => {
      const portal = document.createElement("div");
      portal.className = "ReactModalPortal";
      portal.innerHTML = '<div class="ReactModal__Overlay c-popover"><div class="ReactModal__Content"><div class="c-select_options_list__wrapper" style="height:108px;background:#fff">Option</div></div></div>';
      document.body.append(portal);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelectorAll(".ReactModalPortal").forEach((p) => p.remove());
    });
    window.adapter = {
      load: async (payload) => { window.log.push("load " + JSON.stringify(payload)); },
      theme: () => document.documentElement.classList.contains("sk-client-theme--dark") ? "dark" : "light",
      setTheme: async (t) => { window.log.push("theme " + t); document.documentElement.className = "sk-client-theme--" + t; },
      previewSize: () => window.size || "desktop",
      setPreviewSize: async (s) => { window.log.push("size " + s); window.size = s; },
    };
    window.snap = async () => {
      const open = document.querySelector(".ReactModalPortal") ? "open" : "closed";
      window.log.push("snap " + open + " " + window.adapter.theme() + " " + window.adapter.previewSize());
      return "<html>" + open + "</html>";
    };
  </script>
</body></html>`;

async function run(
  items: { name: string; payload: unknown }[],
  substitute?: Record<string, string>,
) {
  page = await browser.newPage();
  await page.setContent(BUILDER);
  await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
  return page.evaluate(
    async ([list, map]) => {
      const w = window as unknown as {
        capture: (o: unknown) => Promise<Record<string, string>>;
        adapter: unknown;
        snap: unknown;
        log: string[];
      };
      const results = await w.capture({
        items: list,
        snap: w.snap,
        adapter: w.adapter,
        settle: 0,
        substitute: map,
      });
      return { results, log: w.log };
    },
    [items, substitute] as const,
  );
}

/**
 * A stand-in for the real Builder's controls, as measured in it (October 2026), so the runner's own
 * adapter is exercised: the surface and preview-size menus are comboboxes that open on ArrowDown
 * (a scripted click doesn't open them) with `[role=option]` items; changing the surface can raise
 * an "Are you sure?" alertdialog; the theme toggle's label names the theme it switches to; the
 * editor is a CodeMirror whose value the preview renders.
 */
const REAL_BUILDER = `<!doctype html><html><body>
  <button aria-label="Switch to dark mode" id="theme"></button>
  <div role="combobox" tabindex="0" data-qa="bkb-surface-select-button">Message Preview</div>
  <div role="combobox" tabindex="0" data-qa="bkb-preview-select-button">Desktop</div>
  <div class="CodeMirror"></div>
  <div id="stage"><div class="p-bkb_preview__message" style="width:512px"></div></div>
  <script>
    window.log = [];
    const cm = document.querySelector(".CodeMirror");
    cm.CodeMirror = {
      value: "",
      setValue(v) {
        this.value = v;
        const payload = JSON.parse(v);
        const surface = { modal: "Modal Preview", home: "App Home Preview" }[payload.type] ?? "Message Preview";
        if (document.querySelector('[data-qa="bkb-surface-select-button"]').textContent !== surface) return;
        setTimeout(() => {
          const cls = { modal: "p-bkb_preview_modal", home: "p-bkb_app_home" }[payload.type] ?? "p-bkb_preview__message";
          const mobile = window.mobile && cls === "p-bkb_preview__message";
          document.getElementById("stage").innerHTML =
            '<div class="' + cls + '" style="width:' + (mobile ? 400 : 512) + 'px">' + v + "</div>";
          // The Builder keeps the payload it shows in its URL.
          location.hash = encodeURIComponent(JSON.stringify(payload));
        }, 50);
      },
    };
    const theme = document.getElementById("theme");
    theme.addEventListener("click", () => {
      const toDark = theme.getAttribute("aria-label") === "Switch to dark mode";
      theme.setAttribute("aria-label", toDark ? "Switch to light mode" : "Switch to dark mode");
      window.log.push("theme " + (toDark ? "dark" : "light"));
    });
    function menu(qa, labels, onPick) {
      const box = document.querySelector('[data-qa="' + qa + '"]');
      box.addEventListener("click", () => window.log.push("ignored click " + qa));
      box.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown" || box.getAttribute("aria-disabled") === "true") return;
        const list = document.createElement("div");
        list.setAttribute("role", "listbox");
        labels.forEach((label) => {
          const o = document.createElement("div");
          o.setAttribute("role", "option");
          o.textContent = label;
          o.addEventListener("click", () => { list.remove(); onPick(label, box); });
          list.append(o);
        });
        document.body.append(list);
      });
    }
    menu("bkb-preview-select-button", ["Desktop", "Mobile"], (label, box) => {
      box.textContent = label;
      window.mobile = label === "Mobile";
      window.log.push("size " + label);
      // The preview re-renders at the new width.
      if (cm.CodeMirror.value) cm.CodeMirror.setValue(cm.CodeMirror.value);
    });
    menu("bkb-surface-select-button", ["Message Preview", "Modal Preview", "App Home Preview"], (label, box) => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "alertdialog");
      dialog.innerHTML = "Are you sure? <button>Cancel</button> <button>I'm Sure</button>";
      dialog.querySelectorAll("button")[1].addEventListener("click", () => {
        dialog.remove();
        box.textContent = label;
        // Like the Builder, App Home and modals preview at desktop width only: the size menu shows
        // "Desktop" and is disabled.
        const size = document.querySelector('[data-qa="bkb-preview-select-button"]');
        const desktopOnly = label !== "Message Preview";
        size.setAttribute("aria-disabled", String(desktopOnly));
        size.textContent = desktopOnly ? "Desktop" : window.mobile ? "Mobile" : "Desktop";
        window.log.push("surface " + label);
      });
      document.body.append(dialog);
    });
    window.snap = async () => {
      const p = document.querySelector(".p-bkb_preview__message, .p-bkb_preview_modal");
      window.log.push("snap " + p.className + " " + p.style.width);
      return "<html></html>";
    };
  </script>
</body></html>`;

async function runReal(items: { name: string; payload: unknown }[]) {
  page = await browser.newPage();
  await page.setContent(REAL_BUILDER);
  await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
  return page.evaluate(async (list) => {
    const w = window as unknown as {
      capture: (o: unknown) => Promise<Record<string, string>>;
      snap: unknown;
      log: string[];
    };
    try {
      const results = await w.capture({ items: list, snap: w.snap, settle: 100, viewport: false });
      return { results, error: undefined, log: w.log.filter((l) => !l.startsWith("ignored")) };
    } catch (e) {
      return {
        results: {} as Record<string, string>,
        error: String(e),
        log: w.log.filter((l) => !l.startsWith("ignored")),
      };
    }
  }, items);
}

/** A stand-in whose confirm dialog, like Slack's, ignores Escape and closes from its buttons. */
const CONFIRM_BUILDER = `<!doctype html><html class="sk-client-theme--light"><body>
  <div class="p-bkb_preview__message" style="width:512px"><button class="c-button">Delete</button></div>
  <script>
    window.log = [];
    document.querySelector(".c-button").addEventListener("click", () => {
      const portal = document.createElement("div");
      portal.className = "ReactModalPortal";
      portal.innerHTML = '<div class="ReactModal__Overlay c-dialog"><div role="dialog" class="ReactModal__Content c-dialog__content">Are you sure? <button>Cancel</button><button>Delete</button></div></div>';
      portal.querySelector("button").addEventListener("click", () => portal.remove());
      document.body.append(portal);
    });
    window.adapter = {
      load: async () => {},
      theme: () => "light",
      setTheme: async () => {},
      previewSize: () => "desktop",
      setPreviewSize: async () => {},
    };
    window.snap = async () => {
      window.log.push("snap " + (document.querySelector(".ReactModalPortal") ? "dialog" : "closed"));
      return "<html></html>";
    };
  </script>
</body></html>`;

describe("capture.js with Slack's confirm dialog", () => {
  it("closes a confirm dialog that ignores Escape before the next capture", async () => {
    page = await browser.newPage();
    await page.setContent(CONFIRM_BUILDER);
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const log = await page.evaluate(async () => {
      const w = window as unknown as {
        capture: (o: unknown) => Promise<unknown>;
        adapter: unknown;
        snap: unknown;
        log: string[];
      };
      await w.capture({
        items: [
          { name: "extra/actions/more-elements@confirm", payload: {} },
          { name: "extra/actions/more-elements", payload: {} },
        ],
        snap: w.snap,
        adapter: w.adapter,
        settle: 0,
      });
      return w.log;
    });
    expect(log).toEqual(["snap dialog", "snap closed"]);
  });
});

describe("capture.js against the real Builder's controls", () => {
  it("switches theme, preview size and surface through the Builder's own menus", async () => {
    const { log } = await runReal([
      {
        name: "catalog/section/plain-text@mobile+dark",
        payload: { blocks: [{ type: "divider" }] },
      },
      {
        name: "extra/modal/alert",
        payload: { type: "modal", title: { type: "plain_text", text: "Hi" }, blocks: [] },
      },
    ]);
    expect(log).toEqual([
      "theme dark",
      "size Mobile",
      "snap p-bkb_preview__message 400px",
      "theme light",
      "surface Modal Preview",
      "snap p-bkb_preview_modal 512px",
    ]);
  });

  it("captures a mobile message right after a modal, whose surface disables the size menu", async () => {
    const { error, log } = await runReal([
      {
        name: "extra/modal/alert",
        payload: { type: "modal", title: { type: "plain_text", text: "Hi" }, blocks: [] },
      },
      {
        name: "catalog/section/plain-text@mobile",
        payload: { blocks: [{ type: "divider" }] },
      },
    ]);
    expect(error).toBeUndefined();
    expect(log.filter((l) => l.startsWith("snap"))).toEqual([
      "snap p-bkb_preview_modal 512px",
      "snap p-bkb_preview__message 400px",
    ]);
  });

  it("refuses a mobile capture of a surface the Builder previews only at desktop width", async () => {
    const { error, log } = await runReal([
      {
        name: "contexts/button/home@mobile",
        payload: { type: "home", blocks: [{ type: "divider" }] },
      },
    ]);
    expect(error).toMatch(/home@mobile: the Builder previews App Home only at desktop width/);
    expect(log.some((l) => l.startsWith("snap"))).toBe(false);
  });

  it("captures the same payload twice in a row without waiting for the preview to change", async () => {
    const payload = { blocks: [{ type: "divider" }] };
    const started = Date.now();
    const { results } = await runReal([
      { name: "catalog/section/plain-text", payload },
      { name: "catalog/section/plain-text@dark", payload },
    ]);
    expect(Object.keys(results)).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

/**
 * A select whose field is an input, as in the Builder: a click opens its list, and the snapshot
 * records which element has focus. `cancel` makes the field cancel mousedown, as a control that
 * keeps focus elsewhere does.
 */
const focusBuilder = (
  cancel: boolean,
) => `<!doctype html><html class="sk-client-theme--light"><body>
  <div class="p-bkb_preview__message" style="width:512px"><input class="c-select_input" aria-label="Pick"></div>
  <script>
    const field = document.querySelector(".c-select_input");
    if (${cancel}) field.addEventListener("mousedown", (e) => e.preventDefault());
    field.addEventListener("click", () => {
      const portal = document.createElement("div");
      portal.className = "ReactModalPortal";
      portal.innerHTML = '<div class="ReactModal__Overlay c-popover"><div class="ReactModal__Content" style="height:40px">Option</div></div>';
      document.body.append(portal);
    });
    window.adapter = {
      load: async () => {}, theme: () => "light", setTheme: async () => {},
      previewSize: () => "desktop", setPreviewSize: async () => {},
    };
    window.snap = async () => document.activeElement?.className || "none";
  </script>
</body></html>`;

async function focusedAtSnap(cancel: boolean) {
  page = await browser.newPage();
  await page.setContent(focusBuilder(cancel));
  await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
  return page.evaluate(async () => {
    const w = window as unknown as {
      capture: (o: unknown) => Promise<Record<string, string>>;
      adapter: unknown;
      snap: unknown;
    };
    const results = await w.capture({
      items: [{ name: "catalog/section/static-select@open", payload: {} }],
      snap: w.snap,
      adapter: w.adapter,
      settle: 0,
    });
    return results["catalog/section/static-select@open"];
  });
}

// A real click focuses the field it opens, so Slack draws its focus ring around an open select. A
// dispatched mousedown doesn't move focus, which left half the @open references without the ring.
describe("capture.js opening a control", () => {
  it("focuses the control it opens, as a real click does", async () => {
    expect(await focusedAtSnap(false)).toBe("c-select_input");
  });

  it("leaves focus alone when the control cancels mousedown, as a browser does", async () => {
    expect(await focusedAtSnap(true)).toBe("none");
  });
});

describe("capture.js", () => {
  it("loads each fixture, sets the theme and width its name asks for, opens it and snapshots", async () => {
    const { results, log } = await run([
      { name: "catalog/section/static-select", payload: { blocks: [1] } },
      { name: "catalog/section/static-select@open+mobile+dark", payload: { blocks: [1] } },
    ]);
    expect(Object.keys(results)).toEqual([
      "catalog/section/static-select",
      "catalog/section/static-select@open+mobile+dark",
    ]);
    expect(log).toEqual([
      'load {"blocks":[1]}',
      "snap closed light desktop",
      "theme dark",
      'load {"blocks":[1]}',
      "size mobile",
      "snap open dark mobile",
    ]);
  });

  it("closes an opened popover after its snapshot, so the next capture starts closed", async () => {
    const { log } = await run([
      { name: "catalog/section/static-select@open", payload: {} },
      { name: "catalog/section/static-select", payload: {} },
    ]);
    expect(log.filter((l) => l.startsWith("snap"))).toEqual([
      "snap open light desktop",
      "snap closed light desktop",
    ]);
  });

  // A fixture names a Slack file by a placeholder URL; the capture swaps in the real file's link,
  // kept in a git-ignored local file, so only the Builder ever sees it.
  it("loads a payload with the placeholders swapped for the given values", async () => {
    const { log } = await run(
      [{ name: "catalog/image/slack-image", payload: { blocks: [{ url: "PLACEHOLDER" }] } }],
      { PLACEHOLDER: "https://example.test/real.png" },
    );
    expect(log[0]).toBe('load {"blocks":[{"url":"https://example.test/real.png"}]}');
  });

  it("refuses a name it can't reproduce instead of capturing the wrong state", async () => {
    // Not `expect(...).rejects`: on a Playwright error Bun's matcher spins the CPU, for seconds
    // on Linux and sometimes for good, which held CI's render job until its time limit.
    const error = await run([{ name: "catalog/actions/button@dark+open", payload: {} }]).then(
      () => undefined,
      (e: Error) => e.message,
    );
    expect(error).toMatch(/not a canonical reference name/);
  });
});

/**
 * A stand-in whose page, like the Builder late in a long session, can append a stylesheet that
 * repeats an earlier rule. Repeating `.picker { margin: 0 -8px }` moves it after
 * `.slack-picker { margin: 0 }` in the cascade, so it wins where it lost on a fresh page.
 */
const DRIFT_BUILDER = `<!doctype html><html class="sk-client-theme--light"><head>
  <style>.picker { margin: 0 -8px; } .slack-picker { margin: 0; }</style>
</head><body>
  <div class="p-bkb_preview__message" style="width:512px"><div class="picker slack-picker">Pick</div></div>
  <script>
    window.log = [];
    window.adapter = {
      load: async (payload) => {
        if (payload.append) {
          const style = document.createElement("style");
          style.textContent = payload.append;
          document.head.append(style);
        }
      },
      theme: () => "light",
      setTheme: async () => {},
      previewSize: () => "desktop",
      setPreviewSize: async () => {},
    };
    window.snap = async () => { window.log.push("snap"); return "<html></html>"; };
  </script>
</body></html>`;

async function runDrift(appends: string[]) {
  page = await browser.newPage();
  await page.setContent(DRIFT_BUILDER);
  await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
  return page.evaluate(async (list) => {
    const w = window as unknown as {
      capture: (o: unknown) => Promise<unknown>;
      adapter: unknown;
      snap: unknown;
      log: string[];
    };
    // One capture call per item, the way a page-side runner drives it, so the stylesheet
    // inventory has to outlive a single call.
    for (const [i, append] of list.entries()) {
      try {
        await w.capture({
          items: [{ name: `catalog/section/plain-text-${i}`, payload: { append } }],
          snap: w.snap,
          adapter: w.adapter,
          settle: 0,
        });
      } catch (e) {
        return { error: String(e), log: w.log };
      }
    }
    return { error: undefined, log: w.log };
  }, appends);
}

describe("capture.js against stylesheets the Builder loads during a session", () => {
  it("captures when a later stylesheet only adds rules of its own", async () => {
    const { error, log } = await runDrift(["", ".helper { color: red; }", ""]);
    expect(error).toBeUndefined();
    expect(log).toEqual(["snap", "snap", "snap"]);
  });

  // Rendering a chart on a fresh Builder load brings a sheet that repeats hundreds of the message
  // chrome's rules. Where nothing in the preview matches them, or the repeat leaves every value as
  // it was, the cascade is the fresh page's and the capture goes ahead.
  it("captures when a repeated rule styles nothing in the preview", async () => {
    const { error, log } = await runDrift(["", ".message-actions { margin: 0 -8px; }"]);
    expect(error).toBeUndefined();
    expect(log).toEqual(["snap", "snap"]);
  });

  it("captures when a repeated rule matches but every value stays the same", async () => {
    const { error } = await runDrift(["", ".slack-picker { margin: 0; }"]);
    expect(error).toBeUndefined();
  });

  it("keeps refusing on the next item, and catches a sheet that arrives during the snapshot", async () => {
    page = await browser.newPage();
    await page.setContent(DRIFT_BUILDER);
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const errors = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      const once = async (append: string, snap = w.snap) => {
        try {
          await w.capture({
            items: [{ name: "catalog/section/plain-text", payload: { append } }],
            snap,
            adapter: w.adapter,
            settle: 0,
          });
          return "ok";
        } catch (e) {
          return String(e);
        }
      };
      const fresh = await once("");
      const repeated = await once(".picker { margin: 0 -8px; }");
      const next = await once("");
      return { fresh, repeated, next };
    });
    expect(errors.fresh).toBe("ok");
    expect(errors.repeated).toMatch(/before the snapshot/);
    expect(errors.next).toMatch(/before the snapshot/);

    page = await browser.newPage();
    await page.setContent(DRIFT_BUILDER);
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const during = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      try {
        await w.capture({
          items: [{ name: "catalog/section/plain-text", payload: {} }],
          // The chart's sheet arrives while the preview is being frozen.
          snap: async () => {
            const style = document.createElement("style");
            style.textContent = ".picker { margin: 0 -8px; }";
            document.head.append(style);
            return "<html></html>";
          },
          adapter: w.adapter,
          settle: 0,
        });
        return "ok";
      } catch (e) {
        return String(e);
      }
    });
    expect(during).toMatch(/while it snapshotted/);
  });

  it("refuses to snapshot once a later stylesheet repeats a rule the page already has", async () => {
    const { error, log } = await runDrift(["", ".picker { margin: 0 -8px; }"]);
    expect(error).toMatch(/plain-text-1: .*\.picker \{ margin/);
    expect(error).toMatch(/reload the Builder/);
    expect(log).toEqual(["snap"]);
  });
});

/**
 * A stand-in for the Builder's state keeping: each multi-select remembers its chips by block and
 * action id across payloads. `forget` says whether unmounting an element (a payload without it)
 * drops what it remembered, as a neutral payload is meant to make it.
 */
const stateBuilder = (forget: boolean) => `<!doctype html><html><body>
  <div class="p-bkb_preview__message" style="width:512px"></div>
  <script>
    window.log = [];
    const kept = new Map();
    window.adapter = {
      load: async (payload) => {
        const els = (payload.blocks ?? []).flatMap((b) => b.elements ?? []);
        window.log.push("load " + (els.length ? els.map((e) => e.action_id).join(",") : "neutral"));
        if (${forget}) for (const k of [...kept.keys()]) if (!els.some((e) => e.action_id === k)) kept.delete(k);
        const preview = document.querySelector(".p-bkb_preview__message");
        preview.innerHTML = els.map((e) => {
          const chips = kept.get(e.action_id) ?? (e.initial_options ?? []).map((o) => o.value);
          kept.set(e.action_id, chips);
          return '<div role="combobox">' + chips.map((c) => '<span class="c-token">' + c + "</span>").join("") + "</div>";
        }).join("");
      },
      theme: () => "light", setTheme: async () => {},
      previewSize: () => "desktop", setPreviewSize: async () => {},
    };
    window.snap = async () => document.querySelector(".p-bkb_preview__message").innerHTML;
  </script>
</body></html>`;

const multi = (initial: string[]) => ({
  blocks: [
    {
      type: "actions",
      block_id: "colours",
      elements: [
        {
          type: "multi_static_select",
          action_id: "multi",
          options: ["Red", "Blue"].map((v) => ({
            text: { type: "plain_text", text: v },
            value: v,
          })),
          initial_options: initial.map((v) => ({
            text: { type: "plain_text", text: v },
            value: v,
          })),
        },
      ],
    },
  ],
});

async function runState(forget: boolean, items: { name: string; payload: unknown }[]) {
  page = await browser.newPage();
  await page.setContent(stateBuilder(forget));
  await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
  return page.evaluate(async (list) => {
    const w = window as unknown as Record<string, any>;
    const errors: string[] = [];
    // One call per item, as a runner does.
    for (const item of list)
      await w
        .capture({ items: [item], snap: w.snap, adapter: w.adapter, settle: 0 })
        .catch((e: Error) => errors.push(String(e)));
    return { errors, log: w.log, refs: w.sbkCaptureOutput.references };
  }, items);
}

describe("capture.js against the Builder keeping element state across payloads", () => {
  const items = [
    { name: "extra/payloads/selects", payload: multi(["Red"]) },
    { name: "extra/input/more-selects", payload: multi([]) },
  ];

  it("loads a neutral payload first, so a later payload starts without the earlier chips", async () => {
    const { errors, log, refs } = await runState(true, items);
    expect(errors).toEqual([]);
    expect(log).toEqual(["load neutral", "load multi", "load neutral", "load multi"]);
    expect(refs["extra/input/more-selects"]).not.toContain("c-token");
  });

  it("stops when the preview still shows state its payload doesn't set", async () => {
    const { errors } = await runState(false, items);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /more-selects: the Builder kept state from an earlier item \(chips: 1, expected 0\)/,
    );
  });

  it("keeps what was captured across a reload of the Builder", async () => {
    page = await browser.newPage();
    await page.goto("about:blank");
    // IndexedDB needs an origin; a data URL page has none, so serve the stand-in from a route.
    await page.route("https://builder.test/", (route) =>
      route.fulfill({ contentType: "text/html", body: stateBuilder(true) }),
    );
    await page.goto("https://builder.test/");
    const once = async (name: string) => {
      // Pasted again after the reload, as the maintainer does.
      if (!(await page.evaluate(() => "capture" in window)))
        await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
      return page.evaluate(async (n) => {
        const w = window as unknown as Record<string, any>;
        await w.capture({
          items: [{ name: n, payload: { blocks: [] } }],
          snap: w.snap,
          adapter: w.adapter,
          settle: 0,
        });
        return Object.keys(w.sbkCaptureOutput.references);
      }, name);
    };
    await once("catalog/actions/button");
    await page.reload();
    expect(await once("catalog/actions/button@dark")).toEqual([
      "catalog/actions/button",
      "catalog/actions/button@dark",
    ]);
    await page.evaluate(() => (window as unknown as Record<string, any>).sbkCaptureReset());
    await page.close();
  });
});

describe("capture.js opening a multi-select that shows chips", () => {
  it("asks for a click past the chips, then gives up with a clear message", async () => {
    page = await browser.newPage();
    await page.setContent(stateBuilder(true));
    await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
    const error = await page.evaluate(
      async (payload) => {
        const w = window as unknown as Record<string, any>;
        return w
          .capture({
            items: [{ name: "extra/payloads/selects@open", payload }],
            snap: w.snap,
            adapter: w.adapter,
            settle: 0,
            chipTimeout: 500,
          })
          .then(
            () => "",
            (e: Error) => String(e),
          );
      },
      multi(["Red"]),
    );
    expect(error).toMatch(/shows chips and the Builder doesn't open its list/);
  });
});
