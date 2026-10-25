// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
// Loading a reference into the page the previous fixture's render ran in.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Browser, chromium, type Page } from "playwright";
import { loadReference } from "./loadReference";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
afterAll(() => browser.close());

// A render that keeps its open list in a portal, putting it back in whatever body the document
// has, as a live app's re-render does.
const LIVE_RENDER = `<body><script>
  setInterval(() => {
    if (document.body && !document.querySelector("#leftover")) {
      const list = document.createElement("div");
      list.id = "leftover";
      list.setAttribute("role", "option");
      document.body.append(list);
    }
  }, 10);
</script></body>`;

describe("loadReference", () => {
  it("leaves nothing of the previous page's render in the reference", async () => {
    await page.setContent(LIVE_RENDER);
    await page.waitForSelector("#leftover", { state: "attached" });

    await loadReference(page, `<body><div id="sbk-reference"></div></body>`);
    await page.waitForTimeout(100);

    expect(await page.locator('[role="option"]').count()).toBe(0);
  });

  it("loads the reference's document", async () => {
    await loadReference(page, `<body><div id="sbk-reference">Reference</div></body>`);
    expect(await page.textContent("#sbk-reference")).toBe("Reference");
  });
});
