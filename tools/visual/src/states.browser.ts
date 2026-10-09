// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Browser, chromium, type Page } from "playwright";
import { OPEN_STATES } from "./states";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(() => browser.close());

/** A stand-in for our time picker: a label around its input, whose list opens on click. */
const OURS = `<!doctype html><body>
  <label class="sbk-timepicker__control"><input value="1:37 PM"></label>
  <script>
    document.querySelector("label").addEventListener("click", () => {
      document.body.dataset.open = "true";
    });
  </script>
</body>`;

/** A reference with the field Slack captured, its focus ring on its input or not. */
const reference = (ring: boolean) => `<!doctype html><body><div id="sbk-reference">
  <input value="1:37 PM" style="box-shadow:${ring ? "rgb(18, 100, 163) 0px 0px 0px 1px" : "none"}">
  <div data-sbk-layer="popover"><input style="box-shadow:rgb(0, 0, 0) 0px 0px 0px 1px"></div>
</div></body>`;

async function openWith(ring: boolean): Promise<[string | undefined, string | undefined]> {
  const ours: Page = await browser.newPage();
  const ref: Page = await browser.newPage();
  await ours.setContent(OURS);
  await ref.setContent(reference(ring));
  await OPEN_STATES.open.ours(ours, ref);
  const state = await ours.evaluate(
    () => [document.body.dataset.open, document.activeElement?.localName] as [string, string],
  );
  await ours.close();
  await ref.close();
  return state;
}

describe("the open state on a time picker", () => {
  // capture.js opens Slack's field with scripted events, which leave it unfocused, while a click
  // on our label focuses its input and draws a ring the reference doesn't have.
  it("opens the list with the field unfocused when the reference's field is", async () => {
    expect(await openWith(false)).toEqual(["true", "body"]);
  });

  it("keeps the field focused when the reference's field has Slack's focus ring", async () => {
    expect(await openWith(true)).toEqual(["true", "input"]);
  });
});
