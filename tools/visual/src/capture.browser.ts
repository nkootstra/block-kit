// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// capture.js drives Block Kit Builder through a capture list. Here a stand-in page plays the
// Builder (its adapter records what the runner asked for), so the loop itself is what's tested.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";

const CAPTURE = await Bun.file(join(import.meta.dir, "capture.js")).text();

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
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
