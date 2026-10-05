// Needs Chromium, Firefox and WebKit (`bunx playwright install chromium firefox webkit`); run with
// `bun run test:browser`.
//
// How controls look while they're hovered, pressed, focused or animating, checked in all three
// engines. jsdom doesn't load the stylesheet, so this is where interaction styles get tested.
// Expected values are Slack's, from its Block Kit stylesheet; where an engine legitimately paints
// something differently, the case says so.
import { afterAll, afterEach, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { join, resolve } from "node:path";
import type { Page } from "playwright";
import {
  createHarness,
  ENGINES,
  type Engine,
  type Harness,
  type Mount,
  paintedAt,
  settle,
  tabTo,
} from "./harness";

// Opening a page, hovering and waiting for transitions takes a few seconds in Firefox and WebKit.
setDefaultTimeout(30_000);

const ROOT = resolve(import.meta.dir, "../../../..");
const fixture = async (name: string): Promise<Mount> =>
  JSON.parse(await Bun.file(join(ROOT, `fixtures/${name}.json`)).text());

const BLUE = "rgb(18, 100, 163)"; // #1264a3, Slack's focus ring and checked blue
const RED = "rgb(224, 30, 90)"; // #e01e5a, Slack's invalid focus ring
const TEXT = "rgb(29, 28, 29)"; // #1d1c1d
const SURFACE_SEC = "rgb(248, 248, 248)"; // #f8f8f8
const CONTENT_TER = "rgb(94, 93, 96)"; // #5e5d60, Slack's `content-ter`
const SLACK_CURVE = "cubic-bezier(0.36, 0.19, 0.29, 1)";

const plain = (text: string) => ({ type: "plain_text", text });
const option = (value: string) => ({ text: plain(value), value });

const PROPERTIES = [
  "backgroundColor",
  "borderTopColor",
  "borderTopWidth",
  "boxShadow",
  "color",
  "opacity",
  "outlineColor",
  "outlineOffset",
  "outlineStyle",
  "outlineWidth",
  "textDecorationLine",
  "transitionDuration",
  "transitionProperty",
  "transitionTimingFunction",
] as const;
type Style = Record<(typeof PROPERTIES)[number], string>;

/** The computed values this suite reads, copied out of the page. */
async function style(page: Page, selector: string): Promise<Style> {
  return page
    .locator(selector)
    .first()
    .evaluate(
      (el, properties) => {
        const s = getComputedStyle(el) as unknown as Record<string, string>;
        return Object.fromEntries(properties.map((p) => [p, s[p]!]));
      },
      [...PROPERTIES],
    ) as Promise<Style>;
}

/** The timing functions of a `transition-timing-function` list, split where commas separate them. */
const timings = (value: string) => value.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)|[a-z-]+/g);
const list = (value: string) => value.split(/,\s*/);

/** Each channel within `tolerance` of the expected colour: blending rounds differently per engine. */
function expectColor(actual: [number, number, number], expected: [number, number, number]) {
  const tolerance = 2;
  const close = actual.every((c, i) => Math.abs(c - expected[i]!) <= tolerance);
  // Within tolerance, compare the expected colour with itself; otherwise show both.
  expect(close ? expected : actual).toEqual(expected);
}

/** Leaves pointer modality on: after a click, a scripted focus is pointer focus, not keyboard. */
async function pointerFocus(page: Page, selector: string) {
  await page.mouse.click(790, 690);
  await page
    .locator(selector)
    .first()
    .evaluate((el) => (el as HTMLElement).focus());
}

/** Slack's `c-button`: color, background and border change over 80ms on one curve. */
async function expectSlackButtonTransition(page: Page, selector: string) {
  const s = await style(page, selector);
  expect({
    property: list(s.transitionProperty),
    duration: [...new Set(list(s.transitionDuration))],
    timing: [...new Set(timings(s.transitionTimingFunction))],
  }).toEqual({
    property: ["color", "background-color", "border-color"],
    duration: ["0.08s"],
    timing: [SLACK_CURVE],
  });
}

/** An input with a hint, and one whose hint the library writes for `dispatch_action`. */
const hints = (theme: "light" | "dark"): Mount => ({
  theme,
  blocks: [
    {
      type: "input",
      label: plain("Email"),
      hint: plain("We'll only use this for receipts."),
      element: { type: "plain_text_input", action_id: "e" },
    },
    {
      type: "input",
      label: plain("Search"),
      dispatch_action: true,
      element: {
        type: "plain_text_input",
        action_id: "q",
        dispatch_action_config: { trigger_actions_on: ["on_enter_pressed"] },
      },
    },
  ],
});

describe.each(Object.keys(ENGINES) as Engine[])("%s", (engine) => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await createHarness(engine);
  }, 120_000);
  afterEach(() => harness.closePages());
  afterAll(() => harness.close());

  describe("plan and task_card toggle pill", () => {
    // Slack's `toggleBarButtonSlim` cancels the toggle bar's hover tint.
    for (const [name, selector] of [
      ["agents/plan", ".sbk-plan__pill"],
      ["agents/task-card", "button.sbk-task-card__pill"],
    ] as const) {
      it(`${name}: stays transparent under the pointer`, async () => {
        const page = await harness.open(await fixture(`catalog/${name}`));
        await page.hover(selector);
        await settle(page);
        expect((await style(page, selector)).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      });

      it(`${name}: shows an inset blue ring for keyboard focus`, async () => {
        const page = await harness.open(await fixture(`catalog/${name}`));
        await tabTo(page, selector);
        const s = await style(page, selector);
        expect([s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset]).toEqual([
          "solid",
          "2px",
          BLUE,
          "-2px",
        ]);
      });
    }
  });

  describe("checkboxes", () => {
    const checkboxes: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "checkboxes",
              action_id: "c",
              options: [option("Alpha"), option("Bravo")],
            },
          ],
        },
      ],
    };
    const BOX = ".sbk-checkboxes__input";
    // An unchecked box under Slack's 6% `interaction-hover` overlay (#4544470f over white).
    const TINTED: [number, number, number] = [244, 244, 244];
    // The checked blue under Slack's `#122a5921` multiply overlay.
    const DARKENED: [number, number, number] = [16, 89, 149];

    it("declares Slack's 1.5px border", async () => {
      const page = await harness.open(checkboxes);
      // The border widths written in the stylesheet, before an engine snaps them for painting.
      const declared = await page.evaluate(() => {
        const widths: string[] = [];
        const queue = [...document.styleSheets].flatMap((s) => [...s.cssRules]);
        while (queue.length) {
          const rule = queue.shift()!;
          if (rule instanceof CSSStyleRule && rule.selectorText === ".sbk-checkboxes__input") {
            // A `border` shorthand with a var() leaves its longhands empty in the CSSOM, so read
            // the shorthand's first value.
            const border = rule.style.getPropertyValue("border");
            if (border) widths.push(border.split(" ")[0]!);
          } else if ("cssRules" in rule) {
            queue.push(...(rule as CSSGroupingRule).cssRules);
          }
        }
        return widths;
      });
      expect(declared).toEqual(["1.5px"]);
    });

    // Chromium and Firefox snap a border narrower than 2px to whole CSS pixels at any scale, so
    // only WebKit on a 2x screen (Safari on a Retina display) paints the half pixel.
    it.if(engine === "webkit")("paints the 1.5px border on a 2x screen", async () => {
      const page = await harness.open(checkboxes, { scale: 2 });
      expect((await style(page, BOX)).borderTopWidth).toBe("1.5px");
    });

    it("tints an unchecked box and darkens its border under the pointer", async () => {
      const page = await harness.open(checkboxes);
      await page.hover(BOX);
      await settle(page);
      expect((await style(page, BOX)).borderTopColor).toBe("rgb(124, 122, 127)");
      expectColor(await paintedAt(page, BOX, 7, 7), TINTED);
    });

    it("tints an unchecked box with pointer focus", async () => {
      const page = await harness.open(checkboxes);
      await pointerFocus(page, BOX);
      await settle(page);
      expectColor(await paintedAt(page, BOX, 7, 7), TINTED);
    });

    async function checked(page: Page) {
      await page.locator(BOX).first().click();
      await page
        .locator(BOX)
        .first()
        .evaluate((el) => (el as HTMLElement).blur());
      await page.mouse.move(790, 690);
      await settle(page);
    }

    // A point of solid fill below the checkmark, clear of the rounded corners' anti-aliasing.
    const FILL: [number, number] = [6, 11];

    it("paints a checked box Slack's blue at rest", async () => {
      const page = await harness.open(checkboxes);
      await checked(page);
      expectColor(await paintedAt(page, BOX, ...FILL), [18, 100, 163]);
    });

    it("darkens a checked box under the pointer", async () => {
      const page = await harness.open(checkboxes);
      await checked(page);
      await page.hover(BOX);
      await settle(page);
      expectColor(await paintedAt(page, BOX, ...FILL), DARKENED);
    });

    it("darkens a checked box with pointer focus", async () => {
      const page = await harness.open(checkboxes);
      await checked(page);
      await pointerFocus(page, BOX);
      await settle(page);
      expectColor(await paintedAt(page, BOX, ...FILL), DARKENED);
    });

    it("keeps the checkmark where it painted with a 1px border", async () => {
      const page = await harness.open(checkboxes, { scale: 2 });
      await checked(page);
      expect(await checkmarkBounds(page, BOX)).toEqual(CHECKMARK_2X);
    });
  });

  describe("links", () => {
    it("shows the shared focus ring and no underline for keyboard focus", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "Read <https://example.com|the docs>" },
          },
        ],
      });
      await tabTo(page, ".sbk-link");
      const s = await style(page, ".sbk-link");
      expect(s.outlineStyle).toBe("none");
      expect(s.boxShadow.startsWith(`${BLUE} 0px 0px 0px 1px`)).toBe(true);
      expect(s.textDecorationLine).toBe("none");
    });
  });

  describe("select and time picker triggers", () => {
    const triggers: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "s",
              placeholder: plain("Pick one"),
              options: [option("Alpha"), option("Bravo")],
            },
            { type: "timepicker", action_id: "t", placeholder: plain("Pick a time") },
          ],
        },
      ],
    };

    for (const [name, control, chevron, menu] of [
      ["select", ".sbk-select__control", ".sbk-select__chevron", ".sbk-select__menu"],
      [
        "time picker",
        ".sbk-timepicker__control",
        ".sbk-timepicker__chevron",
        ".sbk-timepicker__menu",
      ],
    ] as const) {
      it(`${name}: fills grey while pressed`, async () => {
        const page = await harness.open(triggers);
        await page.hover(control);
        await page.mouse.down();
        await settle(page);
        const fill = (await style(page, control)).backgroundColor;
        await page.mouse.up();
        expect(fill).toBe(SURFACE_SEC);
      });

      it(`${name}: darkens the chevron under the pointer`, async () => {
        const page = await harness.open(triggers);
        await page.hover(control);
        await settle(page);
        expect((await style(page, `${control} ${chevron}`)).color).toBe(TEXT);
      });

      it(`${name}: opens a grey menu`, async () => {
        const page = await harness.open(triggers);
        await page.click(control);
        await settle(page);
        expect((await style(page, menu)).backgroundColor).toBe(SURFACE_SEC);
      });

      it(`${name}: opens a dark grey menu in the dark theme`, async () => {
        const page = await harness.open({ ...triggers, theme: "dark" });
        await page.click(control);
        await settle(page);
        expect((await style(page, menu)).backgroundColor).toBe("rgb(33, 36, 40)");
      });
    }
  });

  describe("multi-select chips", () => {
    const chips: Mount = {
      blocks: [
        {
          type: "input",
          block_id: "b",
          label: plain("Pick some"),
          element: {
            type: "multi_static_select",
            action_id: "m",
            options: [option("Alpha"), option("Bravo"), option("Charlie")],
            initial_options: [option("Alpha"), option("Bravo")],
          },
        },
      ],
    };
    const REMOVE = ".sbk-select__chip-remove";

    it("darkens the remove button on a faint tint under the pointer", async () => {
      const page = await harness.open(chips);
      await page.hover(REMOVE);
      await settle(page);
      const s = await style(page, REMOVE);
      expect([s.color, s.backgroundColor]).toEqual([TEXT, "rgba(29, 28, 29, 0.06)"]);
    });

    it("removes a chip with Enter on its remove button", async () => {
      const page = await harness.open(chips);
      await tabTo(page, REMOVE);
      await page.keyboard.press("Enter");
      await settle(page);
      expect(await page.locator(".sbk-select__chip").allTextContents()).toEqual(["Bravo"]);
    });
  });

  describe("transitions", () => {
    it("eases every button colour change on Slack's curve", async () => {
      const page = await harness.open({
        blocks: [
          { type: "actions", elements: [{ type: "button", text: plain("Go"), action_id: "b" }] },
        ],
      });
      await expectSlackButtonTransition(page, ".sbk-button");
    });

    it("eases the modal footer buttons on the same curve", async () => {
      const page = await harness.open({
        view: {
          type: "modal",
          title: plain("Title"),
          submit: plain("Submit"),
          close: plain("Cancel"),
          blocks: [{ type: "section", text: plain("Body") }],
        },
      });
      await expectSlackButtonTransition(page, ".sbk-modal__button");
    });

    it("moves the carousel arrows over 80ms, easing out", async () => {
      const page = await harness.open(await fixture("catalog/card-and-carousel/carousel"));
      const s = await style(page, ".sbk-carousel__arrow");
      expect([s.transitionProperty, s.transitionDuration, s.transitionTimingFunction]).toEqual([
        "all",
        "0.08s",
        "ease-out",
      ]);
    });

    it("switches the carousel arrows without motion when motion is reduced", async () => {
      const page = await harness.open(await fixture("catalog/card-and-carousel/carousel"), {
        reducedMotion: true,
      });
      const s = await style(page, ".sbk-carousel__arrow");
      expect(list(s.transitionDuration).every((d) => d === "0s")).toBe(true);
    });

    describe("code block copy control", () => {
      const code: Mount = {
        blocks: [
          {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_preformatted",
                elements: [
                  { type: "text", text: "curl " },
                  { type: "link", url: "https://example.com" },
                ],
              },
            ],
          },
        ],
      };
      const PRE = ".sbk-rich-text__pre";
      const COPY = ".sbk-rich-text__pre-copy";

      it("fades in over 80ms from fully transparent", async () => {
        const page = await harness.open(code);
        const s = await style(page, COPY);
        expect([s.opacity, s.transitionProperty, s.transitionDuration]).toEqual([
          "0",
          "opacity",
          "0.08s",
        ]);
        expect(s.transitionTimingFunction).toBe("ease-in-out");
      });

      it("shows while the code block is hovered", async () => {
        const page = await harness.open(code);
        await page.hover(PRE);
        await settle(page);
        expect((await style(page, COPY)).opacity).toBe("1");
      });

      it("shows while the code block holds keyboard focus", async () => {
        const page = await harness.open(code);
        await tabTo(page, `${PRE} a`);
        await settle(page);
        expect((await style(page, COPY)).opacity).toBe("1");
      });
    });
  });

  describe("input hints", () => {
    it("colours hints, the dispatch hint and its return icon with Slack's tertiary grey", async () => {
      const page = await harness.open(hints("light"));
      const colors = await page.$$eval(".sbk-input__hint-text, .sbk-input__hint-icon", (els) =>
        els.map((el) => getComputedStyle(el).color),
      );
      expect(colors.length).toBeGreaterThanOrEqual(3);
      expect(new Set(colors)).toEqual(new Set([CONTENT_TER]));
    });

    it("keeps the dark theme's hint grey", async () => {
      const page = await harness.open(hints("dark"));
      expect((await style(page, ".sbk-input__hint-text")).color).toBe("rgb(154, 155, 158)");
    });
  });

  describe("invalid inputs", () => {
    const invalid: Mount = {
      errors: { text: "Required", select: "Required", date: "Required", time: "Required" },
      blocks: [
        {
          type: "input",
          block_id: "text",
          label: plain("Name"),
          element: { type: "plain_text_input", action_id: "a" },
        },
        {
          type: "input",
          block_id: "select",
          label: plain("Team"),
          element: {
            type: "static_select",
            action_id: "a",
            options: [option("Alpha"), option("Bravo")],
          },
        },
        {
          type: "input",
          block_id: "date",
          label: plain("Due"),
          element: { type: "datepicker", action_id: "a" },
        },
        {
          type: "input",
          block_id: "time",
          label: plain("At"),
          element: { type: "timepicker", action_id: "a" },
        },
      ],
    };

    // Text fields show the ring on any focus; buttons only for keyboard focus, as Slack does.
    for (const [name, selector] of [
      ["text input", ".sbk-text-input"],
      ["select", ".sbk-select__control"],
      ["date picker", ".sbk-datepicker__input"],
      ["time picker", ".sbk-timepicker__control"],
    ] as const) {
      it(`${name}: shows a red focus ring`, async () => {
        const page = await harness.open(invalid);
        await tabTo(page, selector);
        await settle(page);
        expect((await style(page, selector)).boxShadow.startsWith(`${RED} 0px 0px 0px 1px`)).toBe(
          true,
        );
      });
    }
  });
});

/**
 * Where the checkmark paints in a checked box at rest at 2x: [left, top, right, bottom] in device
 * pixels, inclusive. Measured with the 1px border (Slack's checkmark sits 5px from the box's left
 * edge and 2px from its top), the same in Chromium, Firefox and WebKit.
 */
const CHECKMARK_2X = [6, 7, 21, 19];

async function checkmarkBounds(page: Page, selector: string): Promise<number[]> {
  const { PNG } = await import("pngjs");
  const png = PNG.sync.read(
    await page.locator(selector).first().screenshot({ animations: "disabled" }),
  );
  // The page shows white through the box's rounded corners; they lie within 5 device pixels of
  // the edge, which the check never reaches.
  const inset = 5;
  let [left, top, right, bottom] = [png.width, png.height, -1, -1];
  for (let y = inset; y < png.height - inset; y++) {
    for (let x = inset; x < png.width - inset; x++) {
      const i = (y * png.width + x) * 4;
      // The check is white on blue: count only near-white pixels as the mark.
      if (png.data[i]! > 200 && png.data[i + 1]! > 200 && png.data[i + 2]! > 200) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return [left, top, right, bottom];
}
