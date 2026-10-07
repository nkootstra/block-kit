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

async function run(items: { name: string; payload: unknown }[]) {
  page = await browser.newPage();
  await page.setContent(BUILDER);
  await page.addScriptTag({ content: `window.capture = ${CAPTURE};` });
  return page.evaluate(async (list) => {
    const w = window as unknown as {
      capture: (o: unknown) => Promise<Record<string, string>>;
      adapter: unknown;
      snap: unknown;
      log: string[];
    };
    const results = await w.capture({ items: list, snap: w.snap, adapter: w.adapter, settle: 0 });
    return { results, log: w.log };
  }, items);
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
        const surface = payload.type === "modal" ? "Modal Preview" : "Message Preview";
        if (document.querySelector('[data-qa="bkb-surface-select-button"]').textContent !== surface) return;
        setTimeout(() => {
          const cls = payload.type === "modal" ? "p-bkb_preview_modal" : "p-bkb_preview__message";
          document.getElementById("stage").innerHTML =
            '<div class="' + cls + '" style="width:' + (window.mobile ? 400 : 512) + 'px">' + v + "</div>";
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
        if (e.key !== "ArrowDown") return;
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
    });
    menu("bkb-surface-select-button", ["Message Preview", "Modal Preview"], (label, box) => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "alertdialog");
      dialog.innerHTML = "Are you sure? <button>Cancel</button> <button>I'm Sure</button>";
      dialog.querySelectorAll("button")[1].addEventListener("click", () => {
        dialog.remove();
        box.textContent = label;
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
    const results = await w.capture({ items: list, snap: w.snap, settle: 100, viewport: false });
    return { results, log: w.log.filter((l) => !l.startsWith("ignored")) };
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
      "size Desktop",
      "surface Modal Preview",
      "snap p-bkb_preview_modal 512px",
    ]);
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
      "size mobile",
      'load {"blocks":[1]}',
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

  it("refuses a name it can't reproduce instead of capturing the wrong state", async () => {
    await expect(run([{ name: "catalog/actions/button@dark+open", payload: {} }])).rejects.toThrow(
      /not a canonical reference name/,
    );
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

  it("refuses to snapshot once a later stylesheet repeats a rule the page already has", async () => {
    const { error, log } = await runDrift(["", ".picker { margin: 0 -8px; }"]);
    expect(error).toMatch(/plain-text-1: .*\.picker \{ margin/);
    expect(error).toMatch(/reload the Builder/);
    expect(log).toEqual(["snap"]);
  });
});
