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
const CONTENT_SEC = "rgb(69, 68, 71)"; // #454447, Slack's `content-sec`
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

/** The text of the focused element: a calendar day's number. */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent);

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
  // Optional chaining: when the browser fails to launch, the launch error is the one to report.
  afterEach(() => harness?.closePages());
  afterAll(() => harness?.close());

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

  describe("plan tasks", () => {
    // Slack's expanded tasks are focusable list items with the standard ring, rounded 8px.
    it("shows the focus ring on a task reached with the keyboard", async () => {
      const page = await harness.open(await fixture("catalog/agents/plan"));
      await page.click(".sbk-plan__pill");
      await tabTo(page, ".sbk-plan__task");
      await settle(page);
      const s = await style(page, ".sbk-plan__task");
      const radius = await page
        .locator(".sbk-plan__task")
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
      expect([s.boxShadow.startsWith(`${BLUE} 0px 0px 0px 1px`), radius]).toEqual([true, "8px"]);
    });
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

  // Slack gives every checkbox and radio option 8px of space below it, so a group grows by one
  // option's height plus 8px for each option, however many it has.
  describe("option spacing", () => {
    const LABELS = ["Alpha", "Bravo", "Charlie", "Delta"];
    const group = (type: "checkboxes" | "radio_buttons", count: number): Mount => ({
      blocks: [
        {
          type: "actions",
          elements: [{ type, action_id: "o", options: LABELS.slice(0, count).map(option) }],
        },
        { type: "section", text: plain("After") },
      ],
    });
    /** Each option's top, and where the next block starts, relative to the first option. */
    const layout = (page: Page, row: string) =>
      page.evaluate((selector) => {
        const rows = [...document.querySelectorAll(selector)].map((r) => r.getBoundingClientRect());
        const after = [...document.querySelectorAll("*")].find(
          (el) => el.children.length === 0 && el.textContent === "After",
        )!;
        const top = rows[0]!.top;
        return {
          tops: rows.map((r) => Math.round(r.top - top)),
          after: Math.round(after.getBoundingClientRect().top - top),
        };
      }, row);

    for (const [type, row] of [
      ["checkboxes", ".sbk-checkboxes__option"],
      ["radio_buttons", ".sbk-radio-buttons__option"],
    ] as const) {
      it(`places ${type} options 30px apart`, async () => {
        const page = await harness.open(group(type, 4));
        expect((await layout(page, row)).tops).toEqual([0, 30, 60, 90]);
      });

      it(`grows a ${type} group by 30px per option`, async () => {
        const three = await layout(await harness.open(group(type, 3)), row);
        const four = await layout(await harness.open(group(type, 4)), row);
        expect(four.after - three.after).toBe(30);
      });
    }
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

      // Slack's dark `base-sec` equals its `base-pry`, #1a1d21 (measured in Block Kit Builder).
      it(`${name}: opens a menu on the page colour in the dark theme`, async () => {
        const page = await harness.open({ ...triggers, theme: "dark" });
        await page.click(control);
        await settle(page);
        expect((await style(page, menu)).backgroundColor).toBe("rgb(26, 29, 33)");
      });
    }
  });

  describe("multi-select section accessory", () => {
    // Captured in Block Kit Builder (`catalog/section/multi-static-select@dialog`): a 520 x 208
    // dialog with a 68px header, the field 14px below it (468 x 36, 8px corners), and a 76px
    // footer of 36px modal buttons.
    it("lays the selection dialog out at Slack's 520 x 208", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "section",
            text: plain("Pick some"),
            accessory: {
              type: "multi_static_select",
              action_id: "m",
              placeholder: plain("Select options"),
              options: [option("Alpha"), option("Bravo")],
            },
          },
        ],
      });
      await page.click(".sbk-section__accessory .sbk-select__control");
      await settle(page);
      const geometry = await page.evaluate(() => {
        const dialog = document.querySelector(".sbk-select-dialog")!.getBoundingClientRect();
        const rel = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return [r.x - dialog.x, r.y - dialog.y, r.width, r.height].map(Math.round);
        };
        const buttons = [...document.querySelectorAll(".sbk-select-dialog__footer button")].map(
          (b) => {
            const r = b.getBoundingClientRect();
            const c = getComputedStyle(b);
            // The label's width depends on the font, so check Slack's 80px minimum instead.
            return [c.minWidth, Math.round(r.height), c.fontSize, c.borderTopLeftRadius];
          },
        );
        return {
          dialog: [Math.round(dialog.width), Math.round(dialog.height)],
          header: rel(".sbk-select-dialog__header"),
          close: rel(".sbk-select-dialog__close"),
          field: rel(".sbk-select-dialog__field"),
          fieldRadius: getComputedStyle(document.querySelector(".sbk-select-dialog__field")!)
            .borderTopLeftRadius,
          buttons,
        };
      });
      expect(geometry).toEqual({
        dialog: [520, 208],
        header: [0, 0, 520, 68],
        close: [468, 16, 36, 36],
        field: [24, 82, 468, 36],
        fieldRadius: "8px",
        buttons: [
          ["80px", 36, "15px", "8px"],
          ["80px", 36, "15px", "8px"],
        ],
      });
    });

    // Captured in Block Kit Builder (`@dialog` references): users and conversations multi-selects
    // open the same selection dialog, titled with their placeholder.
    for (const [type, title] of [
      ["multi_users_select", "Select users"],
      ["multi_conversations_select", "Select conversations"],
    ] as const) {
      it(`opens ${type} as a section accessory in the selection dialog`, async () => {
        const page = await harness.open({
          blocks: [
            {
              type: "section",
              text: plain("Pick some"),
              accessory: { type, action_id: "m", placeholder: plain(title) },
            },
          ],
        });
        await page.click(".sbk-section__accessory .sbk-select__control");
        await settle(page);
        expect(await page.getByRole("dialog", { name: title }).count()).toBe(1);
        expect(await page.locator(".sbk-select__menu").count()).toBe(0);
      });
    }

    it("opens a 520px Select options dialog, focused, and shows the count after Confirm", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "Pick some" },
            accessory: {
              type: "multi_static_select",
              action_id: "m",
              placeholder: plain("Select options"),
              options: [option("Alpha"), option("Bravo")],
            },
          },
        ],
      });
      await page.click(".sbk-section__accessory .sbk-select__control");
      await settle(page);
      expect((await page.locator(".sbk-select-dialog").boundingBox())?.width).toBe(520);
      expect(
        await page.evaluate(() =>
          document.activeElement?.classList.contains("sbk-select-dialog__input"),
        ),
      ).toBe(true);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      // The list stays open over the footer while picking, as Slack's does; a press elsewhere in
      // the dialog closes it.
      await page.click(".sbk-select-dialog__title");
      await page.getByRole("button", { name: "Confirm" }).click();
      await settle(page);
      expect(await page.locator(".sbk-select-dialog").count()).toBe(0);
      expect(await page.locator(".sbk-section__accessory .sbk-select__control").textContent()).toBe(
        "1 selected",
      );
    });
  });

  describe("static select list", () => {
    const select: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "s",
              placeholder: plain("Pick one"),
              options: [option("Alpha"), option("Bravo"), option("Charlie")],
            },
          ],
        },
      ],
    };

    it("opens a 322px list that starts 12px left of the field", async () => {
      const page = await harness.open(select);
      await page.click(".sbk-select__control");
      await settle(page);
      const [field, menu] = await Promise.all(
        [".sbk-select__control", ".sbk-select__menu"].map((s) => page.locator(s).boundingBox()),
      );
      expect(menu?.width).toBe(322);
      expect(Math.round((menu?.x ?? 0) - (field?.x ?? 0))).toBe(-12);
    });

    // Measured in Block Kit Builder: Slack's menus cover the field's bottom 4px.
    it("opens over the field's bottom 4px", async () => {
      const page = await harness.open(select);
      await page.click(".sbk-select__control");
      await settle(page);
      const [field, menu] = await Promise.all(
        [".sbk-select__control", ".sbk-select__menu"].map((s) => page.locator(s).boundingBox()),
      );
      expect(Math.round((menu?.y ?? 0) - ((field?.y ?? 0) + (field?.height ?? 0)))).toBe(-4);
    });

    it("highlights the first option on open and narrows the list to what's typed", async () => {
      const page = await harness.open(select);
      await page.click(".sbk-select__control");
      await settle(page);
      const active = () =>
        page.locator(".sbk-select__option[data-active] .sbk-select__option-text").allTextContents();
      expect(await active()).toEqual(["Alpha"]);
      // Slack matches the start of a word: "ch" finds Charlie, "ar" would find nothing.
      await page.keyboard.type("ch");
      await settle(page);
      expect(await page.locator(".sbk-select__option-text").allTextContents()).toEqual(["Charlie"]);
      expect(await active()).toEqual(["Charlie"]);
    });
  });

  // Measured in Block Kit Builder (light theme): the states Slack's option lists show as you type.
  describe("select list states", () => {
    const select: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "s",
              placeholder: plain("Pick one"),
              options: [option("Alpha"), option("Bravo"), option("Charlie")],
            },
          ],
        },
      ],
    };
    const grouped: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "g",
              placeholder: plain("Grouped"),
              option_groups: [
                { label: plain("Group one"), options: [option("Alpha"), option("Bravo")] },
                { label: plain("Group two"), options: [option("Charlie")] },
              ],
            },
          ],
        },
      ],
    };
    const multi: Mount = {
      blocks: [
        {
          type: "input",
          label: plain("Multi"),
          element: {
            type: "multi_static_select",
            action_id: "m",
            placeholder: plain("Pick some"),
            initial_options: [option("Alpha")],
            options: [option("Alpha"), option("Bravo"), option("Charlie")],
          },
        },
      ],
    };
    type Box = { x: number; y: number; width: number; height: number };
    const box = (page: Page, selector: string): Promise<Box> =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
    const css = (page: Page, selector: string, props: string[]) =>
      page
        .locator(selector)
        .first()
        .evaluate(
          (el, ps) =>
            Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])),
          props,
        );
    const TYPED = ".sbk-select__option[data-active][data-typed]";

    // Captured in Block Kit Builder (`catalog/section/static-select@open`): as a section's
    // accessory the list opens over the field's bottom 4px even when the section's text wraps.
    it("opens a section accessory's list under the field, not under a wrapping section", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "section",
            text: plain(
              "A section whose text wraps over several lines, so the section is much taller than its select.",
            ),
            accessory: {
              type: "static_select",
              action_id: "s",
              placeholder: plain("Pick one"),
              options: [option("Alpha"), option("Bravo")],
            },
          },
        ],
      });
      await page.click(".sbk-select__control");
      await settle(page);
      const [field, menu] = (await Promise.all(
        [".sbk-select__control", ".sbk-select__menu"].map((s) => box(page, s)),
      )) as [Box, Box];
      expect(Math.round(menu.y - (field.y + field.height))).toBe(-4);
    });

    // Captured in Block Kit Builder (`catalog/input/static-select@open`): in an input block the
    // single select's list is 22px wider than the field and starts 12px to its left, as the
    // multi-select's does.
    it("opens an input block's single select list 22px wider than the field, 12px to its left", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "input",
            label: plain("Label"),
            element: {
              type: "static_select",
              action_id: "s",
              placeholder: plain("Select an item"),
              options: [option("Alpha"), option("Bravo")],
            },
          },
        ],
      });
      await page.click(".sbk-select__control");
      await settle(page);
      const [field, menu] = (await Promise.all(
        [".sbk-select__control", ".sbk-select__menu"].map((s) => box(page, s)),
      )) as [Box, Box];
      expect([Math.round(menu.x - field.x), Math.round(menu.width - field.width)]).toEqual([
        -12, 22,
      ]);
    });

    // Captured in Block Kit Builder (`extra/actions/more-elements@open`): the external select is
    // typed into; its list opens at 322 x 52, 12px left of the field and over its bottom 4px, with
    // the minimum-length hint in the faint no-results text.
    it("opens a typed-into external select on its faint minimum-length hint", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "actions",
            elements: [
              {
                type: "external_select",
                action_id: "e",
                placeholder: plain("Search tickets"),
                min_query_length: 2,
              },
            ],
          },
        ],
      });
      await page.click(".sbk-select__control");
      await settle(page);
      const [field, menu] = (await Promise.all(
        [".sbk-select__control", ".sbk-select__menu"].map((s) => box(page, s)),
      )) as [Box, Box];
      expect([
        Math.round(menu.x - field.x),
        Math.round(menu.y - (field.y + field.height)),
        Math.round(menu.width),
        Math.round(menu.height),
      ]).toEqual([-12, -4, 322, 52]);
      const hint = page.getByText("Type a minimum of 2 characters to see options.");
      expect(await hint.evaluate((el) => getComputedStyle(el).color)).toBe("rgba(29, 28, 29, 0.7)");
    });

    /** Opens the list from the keyboard: focus the field, then ArrowDown. */
    async function openWithKeyboard(page: Page) {
      await page.focus(".sbk-select__control input");
      await page.keyboard.press("ArrowDown");
      await settle(page);
    }

    // Captured in Block Kit Builder (`@open` references): a click opens the list on the blue
    // highlight, first row, white text, with no Enter key.
    it("opens on the blue highlight, without the key, when clicked", async () => {
      const page = await harness.open(select);
      await page.click(".sbk-select__control");
      await settle(page);
      expect(await page.locator(".sbk-select__keycap").count()).toBe(0);
      expect(
        await css(page, ".sbk-select__option[data-active]", ["background-color", "color"]),
      ).toEqual({ "background-color": BLUE, color: "rgb(255, 255, 255)" });
      expect(await page.locator(".sbk-select__option[data-active]").textContent()).toBe("Alpha");
    });

    it("opens on a grey typed highlight with Slack's Enter key 24px from the right, from the keyboard", async () => {
      const page = await harness.open(select);
      await openWithKeyboard(page);
      expect(await css(page, TYPED, ["background-color", "color"])).toEqual({
        "background-color": "rgba(29, 28, 29, 0.06)",
        color: TEXT,
      });
      const [menu, row, key] = (await Promise.all(
        [".sbk-select__menu", TYPED, `${TYPED} .sbk-select__keycap`].map((s) => box(page, s)),
      )) as [Box, Box, Box];
      expect(Math.round(menu.x + menu.width - (key.x + key.width))).toBe(24);
      expect([Math.round(key.height), Math.round(key.y - row.y)]).toEqual([20, 6]);
      expect(Math.abs(key.width - 38.7)).toBeLessThan(1.5);
      expect(
        await css(page, `${TYPED} .sbk-select__keycap`, [
          "background-color",
          "border-bottom",
          "border-radius",
          "font-size",
        ]),
      ).toEqual({
        "background-color": "rgb(234, 234, 234)",
        "border-bottom": "1px solid rgba(94, 93, 96, 0.13)",
        "border-radius": "4px",
        "font-size": "13px",
      });
    });

    it("turns the typed highlight into the blue keyboard one, without the key, on an arrow key", async () => {
      const page = await harness.open(select);
      await openWithKeyboard(page);
      await page.keyboard.press("ArrowDown");
      await settle(page);
      expect(await page.locator(".sbk-select__keycap").count()).toBe(0);
      expect(
        await css(page, ".sbk-select__option[data-active]", ["background-color", "color"]),
      ).toEqual({ "background-color": BLUE, color: "rgb(255, 255, 255)" });
      expect(await page.locator(".sbk-select__option[data-active]").textContent()).toBe("Alpha");
    });

    it("says nothing could be found in a 52px list when nothing matches", async () => {
      const page = await harness.open(select);
      await page.click(".sbk-select__control");
      await page.keyboard.type("zz");
      await settle(page);
      const menu = await box(page, ".sbk-select__menu");
      expect([menu.width, menu.height]).toEqual([322, 52]);
      expect(await page.locator(".sbk-select__option").textContent()).toBe(
        "😕 Nothing could be found.",
      );
      expect((await css(page, ".sbk-select__no-results", ["color"])).color).toBe(
        "rgba(29, 28, 29, 0.7)",
      );
    });

    it("heads option groups with 28px labels and splits them with a 16px rule", async () => {
      const page = await harness.open(grouped);
      await page.click(".sbk-select__control");
      await settle(page);
      expect((await box(page, ".sbk-select__menu")).height).toBe(180);
      expect(
        await css(page, ".sbk-select__group-label", [
          "height",
          "font-size",
          "color",
          "padding-left",
        ]),
      ).toEqual({
        height: "28px",
        "font-size": "15px",
        color: "rgb(69, 68, 71)",
        "padding-left": "24px",
      });
      expect(
        (await css(page, ".sbk-select__group .sbk-select__option", ["padding-left"]))[
          "padding-left"
        ],
      ).toBe("32px");
      expect((await box(page, ".sbk-select__divider")).height).toBe(16);
      const rule = await page
        .locator(".sbk-select__divider")
        .evaluate((el) => getComputedStyle(el, "::before").borderTopColor);
      expect(rule).toBe("rgb(221, 221, 221)");
    });

    it("opens an input block's multi-select list 22px wider than the field, 12px to its left", async () => {
      const page = await harness.open(multi);
      await page.click(".sbk-select__control");
      await settle(page);
      const [field, menu] = (await Promise.all(
        [".sbk-select__control", ".sbk-select__menu"].map((s) => box(page, s)),
      )) as [Box, Box];
      expect(Math.round(menu.width - field.width)).toBe(22);
      expect(Math.round(menu.x - field.x)).toBe(-12);
    });

    it("ticks a multi-select's chosen option in Slack's blue, in the 16px before its label", async () => {
      const page = await harness.open(multi);
      await page.click(".sbk-select__control");
      await settle(page);
      const chosen = ".sbk-select__option--selected";
      const [row, check, label] = (await Promise.all(
        [chosen, `${chosen} .sbk-select__check`, `${chosen} .sbk-select__option-text`].map((s) =>
          box(page, s),
        ),
      )) as [Box, Box, Box];
      expect([Math.round(check.x - row.x), Math.round(check.width)]).toEqual([6, 16]);
      expect(Math.round(label.x - row.x)).toBe(24);
      expect((await css(page, `${chosen} .sbk-select__check`, ["color"])).color).toBe(BLUE);
      expect(await page.locator(".sbk-select__check").count()).toBe(1);
    });
  });

  describe("time picker list", () => {
    const picker: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [{ type: "timepicker", action_id: "t", initial_time: "13:37" }],
        },
      ],
    };

    // From catalog/input/timepicker@open: in an input block the list is the field's width plus 22px
    // (454 for a 432px field), starts 12px left of it, and opens with a 28px "Clear selection" row
    // above 12:00 AM.
    it("opens an input block's list 22px wider than the field, Clear selection first", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "input",
            label: plain("When"),
            element: { type: "timepicker", action_id: "t", initial_time: "13:37" },
          },
        ],
      });
      await page.click(".sbk-timepicker__control");
      await settle(page);
      const geometry = await page.evaluate(() => {
        const field = document.querySelector(".sbk-timepicker__control")!.getBoundingClientRect();
        const menu = document.querySelector(".sbk-timepicker__menu")!.getBoundingClientRect();
        const rows = [...document.querySelectorAll(".sbk-timepicker__menu [role=option]")];
        return {
          widthOverField: Math.round(menu.width - field.width),
          left: Math.round(menu.x - field.x),
          first: rows[0]?.textContent,
          rowGap: Math.round(
            rows[1]!.getBoundingClientRect().y - rows[0]!.getBoundingClientRect().y,
          ),
        };
      });
      expect(geometry).toEqual({
        widthOverField: 22,
        left: -12,
        first: "Clear selection",
        rowGap: 28,
      });
    });

    it("opens a 212px list that starts 12px left of the field and is at most 264px tall", async () => {
      const page = await harness.open(picker);
      await page.click(".sbk-timepicker__control");
      await settle(page);
      const [field, menu] = await Promise.all(
        [".sbk-timepicker__control", ".sbk-timepicker__menu"].map((s) =>
          page.locator(s).boundingBox(),
        ),
      );
      expect(menu?.width).toBe(212);
      expect(Math.round((menu?.x ?? 0) - (field?.x ?? 0))).toBe(-12);
      expect(menu?.height).toBe(264);
      expect(Math.round((menu?.y ?? 0) - ((field?.y ?? 0) + (field?.height ?? 0)))).toBe(-4);
    });

    // Measured in Block Kit Builder: typing neither filters nor highlights Slack's time list.
    it("keeps all 24 hours, with nothing highlighted, while typing", async () => {
      const page = await harness.open(picker);
      await page.click(".sbk-timepicker__control");
      await page.keyboard.type("3");
      await settle(page);
      expect([
        await page.locator(".sbk-timepicker__option").count(),
        await page.locator(".sbk-timepicker__option[data-active]").count(),
      ]).toEqual([24, 0]);
    });

    // Measured in Block Kit Builder: reopened, the field holds the chosen time as selected text,
    // so what's typed replaces it.
    it("replaces the chosen time with what's typed after reopening", async () => {
      const page = await harness.open(picker);
      await page.click(".sbk-timepicker__control");
      await settle(page);
      expect(
        await page.locator(".sbk-timepicker__input").evaluate((el) => {
          const input = el as HTMLInputElement;
          return [input.value, input.selectionStart, input.selectionEnd];
        }),
      ).toEqual(["1:37 PM", 0, 7]);
      await page.keyboard.type("3:15 pm");
      await page.keyboard.press("Enter");
      await settle(page);
      expect(await page.locator(".sbk-timepicker__content-text").textContent()).toBe("3:15 PM");
    });

    it("names the time zone as Slack does", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "actions",
            elements: [{ type: "timepicker", action_id: "t", timezone: "Europe/Madrid" }],
          },
        ],
      });
      expect(await page.locator(".sbk-timepicker__hint").textContent()).toBe(
        "Time zone: Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
      );
    });
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

    // Text fields show the ring on any focus; buttons only for keyboard focus, as Slack does. The
    // time picker's field is an input inside its box, so the box draws the ring.
    for (const [name, focused, ringed] of [
      ["text input", ".sbk-text-input", ".sbk-text-input"],
      ["select", ".sbk-select__input", ".sbk-select__control"],
      ["date picker", ".sbk-datepicker__input", ".sbk-datepicker__input"],
      ["time picker", ".sbk-timepicker__input", ".sbk-timepicker__control"],
    ] as const) {
      it(`${name}: shows a red focus ring`, async () => {
        const page = await harness.open(invalid);
        await tabTo(page, focused);
        await settle(page);
        expect((await style(page, ringed)).boxShadow.startsWith(`${RED} 0px 0px 0px 1px`)).toBe(
          true,
        );
      });
    }

    // Measured in Block Kit Builder's dark theme: the error ring stays #e01e5a, while the focus ring
    // turns #2ba5ce.
    it("keeps Slack's #e01e5a error ring in dark mode", async () => {
      const page = await harness.open({ ...invalid, theme: "dark" });
      await tabTo(page, ".sbk-text-input");
      await settle(page);
      expect(
        (await style(page, ".sbk-text-input")).boxShadow.startsWith(`${RED} 0px 0px 0px 1px`),
      ).toBe(true);
    });
  });

  // Slack counts the characters left inside the field while typing, below zero and red past
  // max_length, with the red ring; and puts a hint and the dispatch hint on one line.
  describe("text input limits", () => {
    const limited = (multiline = false): Mount => ({
      blocks: [
        {
          type: "input",
          label: plain("Title"),
          element: { type: "plain_text_input", action_id: "t", max_length: 5, multiline },
        },
      ],
    });
    const FIELD = ".sbk-text-input";
    const COUNT = ".sbk-text-input__count";

    /** The count's box relative to the field's, its colour and padding, and the field's room for it. */
    const count = (page: Page) =>
      page.evaluate(
        ([fieldSel, countSel]) => {
          const fieldEl = document.querySelector(fieldSel)!;
          const field = fieldEl.getBoundingClientRect();
          const el = document.querySelector(countSel)!;
          const box = el.getBoundingClientRect();
          const c = getComputedStyle(el);
          return {
            text: el.textContent,
            color: c.color,
            font: `${c.fontSize}/${c.lineHeight}`,
            padding: c.padding,
            right: Math.round(field.right - box.right) || 0,
            top: Math.round(box.top - field.top) || 0,
            room: Math.abs(parseFloat(getComputedStyle(fieldEl).paddingRight) - box.width) < 1,
          };
        },
        [FIELD, COUNT] as const,
      );

    // Measured in Block Kit Builder: `c-input_character_count__characters-remaining` sits at the
    // field's top-right corner with 8px 12px padding, 13px/18px in content-sec, and the field's
    // right padding grows to the count's width.
    it("counts the characters left at the field's top right, in Slack's grey", async () => {
      const page = await harness.open(limited());
      await page.click(FIELD);
      await page.keyboard.type("abc");
      expect(await count(page)).toEqual({
        text: "2",
        color: CONTENT_SEC,
        font: "13px/18px",
        padding: "8px 12px",
        right: 0,
        top: 0,
        room: true,
      });
    });

    it("counts below zero in red past the limit, with the red ring", async () => {
      const page = await harness.open(limited());
      await page.click(FIELD);
      await page.keyboard.type("abcdefg");
      await settle(page);
      const c = await count(page);
      expect([c.text, c.color, c.room]).toEqual(["-2", RED, true]);
      expect((await style(page, FIELD)).boxShadow.startsWith(`${RED} 0px 0px 0px 1px`)).toBe(true);
      // Typing isn't cut off at the limit.
      expect(await page.locator(FIELD).inputValue()).toBe("abcdefg");
    });

    // In Slack's dark theme the count is #b9babd, and past the limit it keeps the light theme's
    // #e01e5a rather than the dark danger red.
    it("keeps Slack's count colours in dark mode", async () => {
      const page = await harness.open({ ...limited(), theme: "dark" });
      await page.click(FIELD);
      await page.keyboard.type("abc");
      const under = (await count(page)).color;
      await page.keyboard.type("defg");
      expect([under, (await count(page)).color]).toEqual(["rgb(185, 186, 189)", RED]);
    });

    // Slack describes the field with a hidden "N characters remaining", not a bare number.
    it("describes the field with the characters remaining", async () => {
      const page = await harness.open(limited());
      await page.click(FIELD);
      await page.keyboard.type("abcdefg");
      const described = await page.locator(FIELD).evaluate((el) =>
        (el.getAttribute("aria-describedby") ?? "")
          .split(" ")
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" | "),
      );
      expect(described).toContain("-2 characters remaining");
    });

    it("keeps focus in the field when the count first appears", async () => {
      const page = await harness.open(limited());
      await page.click(FIELD);
      await page.keyboard.type("ab");
      expect(await page.evaluate(() => document.activeElement?.className)).toContain(
        "sbk-text-input",
      );
    });

    it("counts at the top right of a multiline field too, as in Slack", async () => {
      const page = await harness.open(limited(true));
      await page.click(FIELD);
      await page.keyboard.type("abc");
      const c = await count(page);
      expect([c.right, c.top, c.room]).toEqual([0, 0, true]);
    });

    it("puts the hint and \"Press 'enter' to submit\" on one line", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "input",
            label: plain("Search"),
            dispatch_action: true,
            hint: plain("A hint"),
            element: { type: "plain_text_input", action_id: "q" },
          },
        ],
      });
      const tops = await page.$$eval(".sbk-input__hint-text", (els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().top)),
      );
      expect(tops.length).toBe(2);
      expect(tops[0]).toBe(tops[1]);
    });
  });

  describe("card icon", () => {
    // Slack's sample icons are square, so no reference shows this: a 2:1 icon must letterbox
    // (36 x 18 in the 36px slot), not be cropped to fill it.
    it("shows a wide icon whole instead of cropping it", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "card",
            icon: { type: "image", image_url: WIDE_GREEN_ICON, alt_text: "Icon" },
            title: { type: "mrkdwn", text: "Title" },
          },
        ],
      });
      expect(await greenExtent(page, ".sbk-card__icon")).toEqual({ width: 36, height: 18 });
    });
  });

  describe("overflow menu", () => {
    const overflow: Mount = {
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "A section with an overflow menu." },
          accessory: {
            type: "overflow",
            action_id: "o",
            options: [option("Edit"), option("Delete")],
          },
        },
      ],
    };

    // Measured in Block Kit Builder: 250px wide, its left edge under the trigger's, 4px below it.
    // An accessory sits too near the window's right edge for that (the menu would shift inside
    // it), so this trigger sits on the left, in an actions block.
    // Captured in Block Kit Builder (`extra/home/dashboard@open`): as the accessory of a section
    // with two lines of text, the menu still opens 4px below the button.
    it("opens 4px below the button beside a two-line section", async () => {
      type Rect = { x: number; y: number; width: number; height: number };
      const page = await harness.open({
        view: {
          type: "home",
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: "*Login page times out*\nOpened 2 days ago · High" },
              accessory: {
                type: "overflow",
                action_id: "o",
                options: [option("Close"), option("Reassign")],
              },
            },
          ],
        },
      });
      await page.click(".sbk-overflow button");
      await settle(page);
      const [button, menu] = (await Promise.all(
        [".sbk-overflow button", ".sbk-overflow__menu"].map((s) =>
          page.locator(s).first().boundingBox(),
        ),
      )) as [Rect, Rect];
      expect(Math.round(menu.y - (button.y + button.height))).toBe(4);
    });

    // Captured in Block Kit Builder (`catalog/section/overflow@open`): each option's label
    // (`c-menu_item__label`) sits 1px above its 28px row.
    it("raises each option's label 1px in its row", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "section",
            text: plain("Menu"),
            accessory: { type: "overflow", action_id: "o", options: [option("Edit")] },
          },
        ],
      });
      await page.click(".sbk-overflow button");
      await settle(page);
      const offset = await page.evaluate(() => {
        const row = document.querySelector('.sbk-overflow__menu [role="menuitem"]')!;
        const label = row.firstElementChild;
        return label ? label.getBoundingClientRect().y - row.getBoundingClientRect().y : null;
      });
      expect(offset).toBe(-1);
    });

    it("opens a 250px menu left-aligned 4px below the trigger", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "actions",
            elements: [{ type: "overflow", action_id: "o", options: [option("Edit")] }],
          },
        ],
      });
      await page.click(".sbk-overflow__button");
      const trigger = (await page.locator(".sbk-overflow__button").boundingBox())!;
      const menu = (await page.locator(".sbk-overflow__menu").boundingBox())!;
      expect({
        width: menu.width,
        left: Math.round(menu.x - trigger.x),
        gap: Math.round(menu.y - (trigger.y + trigger.height)),
      }).toEqual({ width: 250, left: 0, gap: 4 });
    });

    it("moves focus into the menu, and the first ArrowDown highlights the first item", async () => {
      const page = await harness.open(overflow);
      await page.click(".sbk-overflow__button");
      expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menu");
      await page.keyboard.press("ArrowDown");
      expect(await page.locator(".sbk-overflow__option[data-active]").textContent()).toBe("Edit");
    });

    it("returns focus to the trigger when Escape closes it", async () => {
      const page = await harness.open(overflow);
      await page.click(".sbk-overflow__button");
      await page.keyboard.press("Escape");
      expect(await page.locator(".sbk-overflow__menu").count()).toBe(0);
      expect(
        await page.evaluate(() =>
          document.activeElement?.classList.contains("sbk-overflow__button"),
        ),
      ).toBe(true);
    });
  });

  // A phone-width window: a popover that keeps Slack's alignment would run past an edge (the
  // right-aligned calendar off the left, the left-aligned menus off the right), so it shifts
  // just enough to stay inside the window instead.
  describe("popovers in a narrow window", () => {
    const NARROW = { width: 390, height: 844 };
    const cases = [
      {
        name: "datepicker calendar",
        mount: {
          blocks: [
            {
              type: "actions",
              elements: [{ type: "datepicker", action_id: "d", initial_date: "1990-04-28" }],
            },
          ],
        },
        trigger: ".sbk-datepicker__input",
        popover: ".sbk-datepicker__popup",
      },
      {
        name: "overflow menu",
        mount: {
          blocks: [
            {
              type: "section",
              text: plain("A section with an overflow menu."),
              accessory: { type: "overflow", action_id: "o", options: [option("Edit")] },
            },
          ],
        },
        trigger: ".sbk-overflow__button",
        popover: ".sbk-overflow__menu",
      },
      {
        name: "select menu",
        mount: {
          blocks: [
            {
              type: "section",
              text: plain("Pick one"),
              accessory: {
                type: "static_select",
                action_id: "s",
                placeholder: plain("Pick one"),
                options: [option("Alpha"), option("Bravo")],
              },
            },
          ],
        },
        trigger: ".sbk-select__control",
        popover: ".sbk-select__menu",
      },
      {
        name: "time picker list",
        mount: {
          blocks: [
            {
              type: "section",
              text: plain("Pick a time"),
              accessory: { type: "timepicker", action_id: "t", initial_time: "13:37" },
            },
          ],
        },
        trigger: ".sbk-timepicker__control",
        popover: ".sbk-timepicker__menu",
      },
    ] satisfies { name: string; mount: Mount; trigger: string; popover: string }[];

    for (const { name, mount, trigger, popover } of cases) {
      it(`keeps the ${name} inside the window`, async () => {
        const page = await harness.open(mount, { viewport: NARROW });
        await page.click(trigger);
        const box = (await page.locator(popover).boundingBox())!;
        expect({
          left: box.x >= 0,
          right: box.x + box.width <= NARROW.width,
        }).toEqual({ left: true, right: true });
      });
    }
  });

  // Measured in Block Kit Builder: a datetimepicker is a date field and a time field, each with its
  // own popover.
  describe("datetime picker", () => {
    const picker = (initial?: number): Mount => ({
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "datetimepicker",
              action_id: "dt",
              ...(initial === undefined ? {} : { initial_date_time: initial }),
            },
          ],
        },
      ],
    });
    const DATE = ".sbk-datetimepicker__control--date";
    const TIME = ".sbk-datetimepicker__control--time";
    const box = async (page: Page, selector: string) =>
      (await page.locator(selector).first().boundingBox())!;

    it("shows Slack's placeholders, Select a date and Time", async () => {
      const page = await harness.open(picker());
      const texts = await page.evaluate(() => [
        document.querySelector(".sbk-datetimepicker__control--date")?.textContent,
        (document.querySelector(".sbk-datetimepicker__control--time input") as HTMLInputElement)
          ?.placeholder,
      ]);
      expect(texts).toEqual(["Select a date", "Time"]);
    });

    it("opens the datepicker's 349 x 372 calendar from the date field, with no Apply", async () => {
      // A datetimepicker can't be a section accessory, so give the field room on its left for a
      // calendar aligned to its right edge; otherwise it would shift inside the window.
      const page = await harness.open(picker(), { viewport: { width: 1000, height: 700 } });
      await page.addStyleTag({ content: "#sbk-render { margin-left: 300px; }" });
      await page.click(DATE);
      await settle(page);
      const field = await box(page, DATE);
      const popup = await box(page, ".sbk-datepicker__popup");
      expect({
        size: [popup.width, popup.height],
        right: Math.round(popup.x + popup.width - (field.x + field.width)),
        gap: Math.round(popup.y - (field.y + field.height)),
        apply: await page.getByText("Apply").count(),
      }).toEqual({ size: [349, 372], right: -4, gap: -4, apply: 0 });
    });

    it("opens a 230px hourly list from the time field, 12px to its left", async () => {
      const page = await harness.open(picker());
      await page.click(TIME);
      await settle(page);
      const field = await box(page, TIME);
      const menu = await box(page, ".sbk-timepicker__menu");
      expect({
        size: [menu.width, menu.height],
        left: Math.round(menu.x - field.x),
        gap: Math.round(menu.y - (field.y + field.height)),
        first: await page.locator(".sbk-timepicker__option").first().textContent(),
      }).toEqual({ size: [230, 264], left: -12, gap: -4, first: "12:00 AM" });
    });

    it("leads the time list with a grey Clear selection once a value is chosen", async () => {
      // 2026-01-01 10:00 UTC
      const page = await harness.open(picker(1_767_261_600));
      await page.click(TIME);
      await settle(page);
      const first = page.locator(".sbk-timepicker__option").first();
      expect([
        await first.textContent(),
        await first.evaluate((el) => getComputedStyle(el).color),
      ]).toEqual(["Clear selection", "rgb(69, 68, 71)"]);
    });

    it("fills the time and sends the action as soon as a day is picked", async () => {
      const page = await harness.open(picker());
      await page.click(DATE);
      await page.locator(".sbk-calendar__cell:not(.sbk-calendar__cell--empty)").nth(14).click();
      await settle(page);
      const time = await page.locator(".sbk-datetimepicker__content-text").textContent();
      expect(time).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
      expect(await page.locator(".sbk-datepicker__popup").count()).toBe(0);
    });
  });

  describe("datepicker calendar", () => {
    const datepicker: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [{ type: "datepicker", action_id: "d", initial_date: "1990-04-28" }],
        },
      ],
    };

    const optionalInput: Mount = {
      blocks: [
        {
          type: "input",
          optional: true,
          label: plain("Due"),
          element: { type: "datepicker", action_id: "d", initial_date: "1990-04-28" },
        },
      ],
    };
    const POPUP = ".sbk-datepicker__popup";
    const DAY = (n: number) =>
      `.sbk-calendar__cell[data-date="1990-04-${String(n).padStart(2, "0")}"]`;
    const NAV = ".sbk-calendar__nav";

    // From the open-calendar references: Slack's weekday cells start at 24.5px into the popup, in a
    // 29.5625px row whose 13px labels sit on a 19.0668px line, and the first week's day buttons
    // start at 101.0625px (they overlap the row's bottom half-pixel border).
    it("places the weekday row and the first week as Slack does", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      const geometry = await page.evaluate(() => {
        const popup = document.querySelector(".sbk-datepicker__popup")!.getBoundingClientRect();
        const weekday = document.querySelector(".sbk-calendar__weekdays > *")!;
        const cell = weekday.getBoundingClientRect();
        const day = document
          .querySelector(".sbk-calendar__cell:not(.sbk-calendar__cell--empty)")!
          .getBoundingClientRect();
        return {
          weekdayLeft: cell.x - popup.x,
          weekdayLineHeight: parseFloat(getComputedStyle(weekday).lineHeight),
          firstDayTop: day.y - popup.y,
        };
      });
      // Engines round sub-pixel layout differently (Firefox works in 1/60px), so compare to a few
      // hundredths of a pixel.
      expect(geometry.weekdayLeft).toBe(24.5);
      expect(geometry.weekdayLineHeight).toBeCloseTo(19.0668, 2);
      expect(geometry.firstDayTop).toBeCloseTo(101.0625, 1);
    });

    it("opens over the field's bottom edge with its right edge on the field's", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "section",
            text: plain("Pick a date"),
            accessory: { type: "datepicker", action_id: "d", initial_date: "1990-04-28" },
          },
        ],
      });
      await page.click(".sbk-datepicker__input");
      const field = (await page.locator(".sbk-datepicker").boundingBox())!;
      const popup = (await page.locator(POPUP).boundingBox())!;
      expect({
        right: Math.round(popup.x + popup.width - (field.x + field.width)),
        gap: Math.round(popup.y - (field.y + field.height)),
      }).toEqual({ right: 0, gap: -4 });
    });

    // Slack's calendar keeps room for six weeks (`min-height: 340px`), so a five-week month like
    // April 1990 opens at the same 349 x 372 as any other.
    it("opens at Slack's 349 x 372, with room for six weeks", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      const popup = (await page.locator(POPUP).boundingBox())!;
      expect([popup.width, popup.height]).toEqual([349, 372]);
    });

    it("adds Slack's 45px Clear selection footer in an optional input", async () => {
      const page = await harness.open(optionalInput);
      await page.click(".sbk-datepicker__input");
      const popup = (await page.locator(POPUP).boundingBox())!;
      expect([popup.width, popup.height]).toEqual([349, 417]);
    });

    it("lays out the header like Slack: year and month buttons around a centred month", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      const boxes = await page.evaluate(() => {
        const popup = document.querySelector(".sbk-datepicker__popup")!.getBoundingClientRect();
        const header = [...document.querySelector(".sbk-calendar__header")!.children];
        return header.map((el) => {
          const r = el.getBoundingClientRect();
          return [r.x - popup.x, r.y - popup.y, r.width, r.height].map(Math.round);
        });
      });
      expect(boxes).toEqual([
        [24, 24, 32, 32],
        [56, 24, 32, 32],
        [88, 29, 173, 22],
        [261, 24, 32, 32],
        [293, 24, 32, 32],
      ]);
    });

    it("heads the week with Slack's bold 13px day names", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      const s = await page
        .locator(".sbk-calendar__weekdays > *")
        .first()
        .evaluate((el) => {
          const c = getComputedStyle(el);
          return [c.fontSize, c.fontWeight, c.color];
        });
      expect(s).toEqual(["13px", "700", "rgb(69, 68, 71)"]);
    });

    /** The cell's border and fill, as Slack's stylesheet resolves them. */
    const cell = (page: Page, selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => {
          const c = getComputedStyle(el);
          return { border: c.borderTopColor, fill: c.backgroundColor, text: c.color };
        });
    const GRID = "rgb(221, 221, 221)";
    const WASH = "rgba(29, 155, 209, 0.2)";
    const WASH_BORDER = "rgba(29, 155, 209, 0.3)";

    it("draws a day at rest with Slack's grey grid line", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.mouse.move(790, 690);
      await settle(page);
      expect((await cell(page, DAY(10))).border).toBe(GRID);
    });

    it("washes a hovered day light blue", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.hover(DAY(10));
      await settle(page);
      expect(await cell(page, DAY(10))).toEqual({ border: WASH_BORDER, fill: WASH, text: TEXT });
    });

    it("keeps the grid line on the selected day and fills it Slack's blue", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.mouse.move(790, 690);
      await settle(page);
      const s = await page.locator(DAY(28)).evaluate((el) => {
        const c = getComputedStyle(el);
        return [c.borderTopColor, c.backgroundColor, c.color, c.borderTopLeftRadius];
      });
      expect(s).toEqual([GRID, BLUE, "rgb(255, 255, 255)", "4px"]);
    });

    it("tints the selected day's border, not its fill, under the pointer", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.hover(DAY(28));
      await settle(page);
      expect(await cell(page, DAY(28))).toEqual({
        border: WASH_BORDER,
        fill: BLUE,
        text: "rgb(255, 255, 255)",
      });
    });

    // Measured in Block Kit Builder: Slack's keyboard-focused day also carries the focus ring.
    it("rings a keyboard-focused day with Slack's focus ring", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.mouse.move(790, 690);
      await page.keyboard.press("ArrowLeft");
      await settle(page);
      expect((await style(page, DAY(27))).boxShadow.startsWith(`${BLUE} 0px 0px 0px 1px`)).toBe(
        true,
      );
    });

    // Slack's `c-date_picker__select_btn`: a 28px "Open calendar" button over the field's right
    // end, next in the tab order, that opens the calendar on the selected day.
    it("opens from its own 28px Open calendar button, reached with Tab", async () => {
      const page = await harness.open(datepicker);
      const toggle = page.getByRole("button", { name: "Open calendar" });
      const [field, button] = await Promise.all([
        page.locator(".sbk-datepicker__input").boundingBox(),
        toggle.boundingBox(),
      ]);
      expect([
        button?.width,
        button?.height,
        Math.round(field!.x + field!.width - (button!.x + button!.width)),
      ]).toEqual([28, 28, 0]);
      await page.click(".sbk-datepicker__input");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(
        "Open calendar",
      );
      await page.keyboard.press("Enter");
      expect(await focused(page)).toBe("28");
    });

    // Measured in Block Kit Builder: typed dates are taken on Enter (the calendar stays open) or as
    // focus leaves the field, and shown in the field's format afterwards.
    it("takes a typed date, then shows it in the field's format", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.locator(".sbk-datepicker__input").fill("May 3, 1990");
      await page.keyboard.press("Enter");
      expect(await page.locator(".sbk-datepicker__popup").count()).toBe(1);
      await page.keyboard.press("Escape");
      expect(await page.locator(".sbk-datepicker__input").inputValue()).toBe("05/03/1990");
    });

    it("shows a keyboard-focused day like a hovered one", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.mouse.move(790, 690);
      await page.keyboard.press("ArrowLeft");
      await settle(page);
      expect(await cell(page, DAY(27))).toEqual({ border: WASH_BORDER, fill: WASH, text: TEXT });
    });

    it("rounds the grid's outer corners", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      const radii = await page.evaluate(() =>
        ["1990-04-01", "1990-04-07", "1990-04-29", "1990-04-28"].map((d) => {
          const c = getComputedStyle(document.querySelector(`[data-date="${d}"]`)!);
          return [
            c.borderTopLeftRadius,
            c.borderTopRightRadius,
            c.borderBottomLeftRadius,
            c.borderBottomRightRadius,
          ].join(" ");
        }),
      );
      // April 1990 starts on a Sunday and ends on Monday the 30th: the 1st is the grid's top-left,
      // the 7th its top-right, the 29th its bottom-left and the 30th the month's end.
      expect(radii[0]).toBe("4px 0px 0px 0px");
      expect(radii[1]).toBe("0px 4px 0px 0px");
      expect(radii[2]).toBe("0px 0px 4px 0px");
    });

    it("gives the header buttons Slack's hover wash and blue press, with no transition", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      const nav = page.locator(NAV).first();
      expect(await nav.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
      await nav.hover();
      await settle(page);
      expect(await nav.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        "rgba(29, 155, 209, 0.1)",
      );
      await page.mouse.down();
      const pressed = await nav.evaluate((el) => {
        const c = getComputedStyle(el);
        return [c.backgroundColor, c.color];
      });
      await page.mouse.up();
      expect(pressed).toEqual([BLUE, "rgb(255, 255, 255)"]);
    });

    it("turns Clear selection blue under the pointer", async () => {
      const page = await harness.open(optionalInput);
      await page.click(".sbk-datepicker__input");
      await page.hover(".sbk-calendar__clear");
      await settle(page);
      expect(
        await page.locator(".sbk-calendar__clear").evaluate((el) => getComputedStyle(el).color),
      ).toBe(BLUE);
    });

    it("focuses the selected day and moves it with the arrow keys", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      expect(await focused(page)).toBe("28");
      await page.keyboard.press("ArrowDown");
      expect(await focused(page)).toBe("5");
      expect(await page.locator(".sbk-calendar__label").textContent()).toBe("May 1990");
      await page.keyboard.press("ArrowLeft");
      expect(await focused(page)).toBe("4");
    });

    it("picks with Enter and Escape closes, both returning focus to the field", async () => {
      const page = await harness.open(datepicker);
      await page.click(".sbk-datepicker__input");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      expect(await page.locator(".sbk-datepicker__input").inputValue()).toBe("04/29/1990");
      expect(await page.locator(".sbk-datepicker__popup").count()).toBe(0);
      expect(await page.evaluate(() => document.activeElement?.className)).toContain(
        "sbk-datepicker__input",
      );

      await page.click(".sbk-datepicker__input");
      await page.keyboard.press("Escape");
      expect(await page.locator(".sbk-datepicker__popup").count()).toBe(0);
      expect(await page.evaluate(() => document.activeElement?.className)).toContain(
        "sbk-datepicker__input",
      );
    });
  });

  describe("rich text input", () => {
    const composer: Mount = {
      view: {
        type: "modal",
        title: plain("New entry"),
        blocks: [
          {
            type: "input",
            block_id: "summary",
            label: plain("Summary"),
            element: {
              type: "rich_text_input",
              action_id: "a",
              placeholder: plain("Write something"),
            },
          },
        ],
      },
    };
    const TOOL = ".sbk-rich-text-input__tool";
    const AA = ".sbk-rich-text-input__action--formatting";

    // The style isolation in base.css reverts every property, and WebKit makes `contenteditable`
    // editable through `-webkit-user-modify`, which `revert` would undo.
    it("takes focus and the text typed into it", async () => {
      const page = await harness.open(composer);
      const editor = page.locator(".sbk-rich-text-input__editor");
      await editor.click();
      await page.keyboard.type("Hello");
      expect(await editor.textContent()).toBe("Hello");
    });

    it("dims the formatting buttons until the editor has focus", async () => {
      const page = await harness.open(composer);
      await settle(page);
      expect((await style(page, TOOL)).opacity).toBe("0.3");
      await page.click(".sbk-rich-text-input__editor");
      await settle(page);
      expect((await style(page, TOOL)).opacity).toBe("1");
    });

    it("hides and shows the formatting bar with Aa, underlining Aa while it shows", async () => {
      const page = await harness.open(composer);
      const underline = () =>
        page.locator(AA).evaluate((el) => {
          const after = getComputedStyle(el, "::after");
          return after.content === "none" ? "none" : `${after.width} x ${after.height}`;
        });
      expect(await page.locator(".sbk-rich-text-input__toolbar").count()).toBe(1);
      expect(await underline()).toBe("21px x 1.5px");

      await page.click(AA);
      expect(await page.locator(".sbk-rich-text-input__toolbar").count()).toBe(0);
      expect(await underline()).toBe("none");

      await page.click(AA);
      expect(await page.locator(".sbk-rich-text-input__toolbar").count()).toBe(1);
      expect(await underline()).toBe("21px x 1.5px");
    });
  });

  describe("modal overlay", () => {
    // A button whose action opens a modal through `views.open`, as an app would.
    const opener = (): Mount => ({
      blocks: [
        {
          type: "actions",
          elements: [{ type: "button", action_id: "open", text: plain("Open") }],
        },
      ],
      opens: { type: "modal", title: plain("New entry"), blocks: [] },
    });
    const open = async (options?: { reducedMotion?: boolean }) => {
      const page = await harness.open(opener(), options);
      await page.click(".sbk-button");
      await page.waitForSelector(".sbk-modal-layer .sbk-modal");
      return page;
    };
    const dim = (page: Page) =>
      page.locator(".sbk-modal-layer").evaluate((el) => {
        const before = getComputedStyle(el, "::before");
        return {
          layer: getComputedStyle(el).backgroundColor,
          dim: before.backgroundColor,
          animation: `${before.animationName} ${before.animationDuration} ${before.animationTimingFunction}`,
        };
      });

    // Slack's `.c-sk-overlay::before`: the dim fades from transparent at 80ms, linearly.
    it("fades the dim in over 80ms", async () => {
      const page = await open();
      expect(await dim(page)).toEqual({
        layer: "rgba(0, 0, 0, 0)",
        dim: "rgba(0, 0, 0, 0.6)",
        animation: "sbk-overlay-fade-in 0.08s linear",
      });
    });

    it("shows the dim at once with reduced motion", async () => {
      const page = await open({ reducedMotion: true });
      expect((await dim(page)).animation.split(" ")[0]).toBe("none");
    });

    // Slack's `.c-sk-modal` shadow.
    it("gives the modal Slack's shadow", async () => {
      const page = await open();
      expect((await style(page, ".sbk-modal-layer .sbk-modal")).boxShadow).toBe(
        "rgba(29, 28, 29, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.35) 0px 18px 48px 0px",
      );
    });
  });

  describe("confirm dialog", () => {
    const withConfirm: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              action_id: "delete",
              text: plain("Delete"),
              style: "danger",
              confirm: {
                title: plain("Are you sure?"),
                text: plain("This can't be undone."),
                confirm: plain("Delete"),
                deny: plain("Cancel"),
                style: "danger",
              },
            },
          ],
        },
      ],
    };
    const open = async (options?: { reducedMotion?: boolean }) => {
      const page = await harness.open(withConfirm, options);
      await page.click(".sbk-button");
      await page.waitForSelector(".sbk-confirm");
      return page;
    };
    // Captured in Block Kit Builder (`extra/actions/more-elements@confirm`): a 520 x 166 dialog with
    // a 68px header whose 36px close button reaches 8px into the padding.
    it("lays the confirm dialog out at Slack's 520 x 166, with a 36px close button", async () => {
      const page = await open();
      await settle(page);
      const geometry = await page.evaluate(() => {
        const dialog = document.querySelector(".sbk-confirm")!.getBoundingClientRect();
        const rel = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return [r.x - dialog.x, r.y - dialog.y, r.width, r.height].map(Math.round);
        };
        return {
          dialog: [Math.round(dialog.width), Math.round(dialog.height)],
          header: rel(".sbk-confirm__header"),
          close: rel(".sbk-confirm__close"),
        };
      });
      expect(geometry).toEqual({
        dialog: [520, 166],
        header: [0, 0, 520, 68],
        close: [468, 16, 36, 36],
      });
    });

    const css = (page: Page, selector: string, pseudo?: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el, p) => {
          const s = getComputedStyle(el, p);
          const r = el.getBoundingClientRect();
          return {
            size: `${r.width} x ${r.height}`,
            radius: s.borderTopLeftRadius,
            shadow: s.boxShadow,
            padding: s.padding,
            font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight}`,
            background: s.backgroundColor,
            animation: `${s.animationName} ${s.animationDuration} ${s.animationTimingFunction}`,
          };
        }, pseudo);

    // Slack's `c-dialog`, measured in Block Kit Builder.
    it("draws Slack's 520px dialog with its header, body and footer spacing", async () => {
      const page = await open();
      await settle(page);
      const box = await css(page, ".sbk-confirm");
      expect({ width: box.size.split(" x ")[0], radius: box.radius, shadow: box.shadow }).toEqual({
        width: "520",
        radius: "8px",
        shadow: "rgba(29, 28, 29, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.35) 0px 18px 48px 0px",
      });
      expect((await css(page, ".sbk-confirm__header")).padding).toBe("16px 24px");
      expect((await css(page, ".sbk-confirm__title")).font).toBe("900 22px/30px");
      // Measured in Block Kit Builder (`extra/actions/more-elements@confirm`).
      expect((await css(page, ".sbk-confirm__close")).size).toBe("36 x 36");
      const body = await css(page, ".sbk-confirm__text");
      expect({ padding: body.padding, font: body.font }).toEqual({
        padding: "0px 24px",
        font: "400 15px/22px",
      });
      expect((await css(page, ".sbk-confirm__actions")).padding).toBe("20px 24px");
    });

    it("draws Slack's 36px dialog buttons", async () => {
      const page = await open();
      await settle(page);
      for (const selector of [".sbk-confirm__button--deny", ".sbk-confirm__button--danger"]) {
        const b = await css(page, selector);
        const [width, height] = b.size.split(" x ").map(Number);
        expect({
          wide: width! >= 80,
          height,
          radius: b.radius,
          padding: b.padding,
          weight: b.font.split(" ")[0],
          size: b.font.split(" ")[1]!.split("/")[0],
        }).toEqual({
          wide: true,
          height: 36,
          radius: "8px",
          padding: "0px 12px 1px",
          weight: "700",
          size: "15px",
        });
      }
    });

    // The dim fades in like a modal's; the box fades in while growing from 95%.
    it("fades the dim in and the dialog in from 95%, over 80ms", async () => {
      const page = await open();
      const dim = await css(page, ".sbk-confirm__overlay", "::before");
      expect({ background: dim.background, animation: dim.animation }).toEqual({
        background: "rgba(0, 0, 0, 0.6)",
        animation: "sbk-confirm-dim-in 0.08s linear",
      });
      expect((await css(page, ".sbk-confirm")).animation).toBe(
        `sbk-confirm-enter 0.08s ${SLACK_CURVE}`,
      );
    });

    it("shows the dialog at once with reduced motion", async () => {
      const page = await open({ reducedMotion: true });
      expect((await css(page, ".sbk-confirm__overlay", "::before")).animation.split(" ")[0]).toBe(
        "none",
      );
      expect((await css(page, ".sbk-confirm")).animation.split(" ")[0]).toBe("none");
    });

    // From the keyboard: Safari (and WebKit) don't focus a clicked button, so there would be
    // nothing to give focus back to after a click.
    it("moves focus in on open, denies on Escape and gives focus back", async () => {
      const page = await harness.open(withConfirm);
      await tabTo(page, ".sbk-button");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".sbk-confirm");
      expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Cancel");
      await page.keyboard.press("Escape");
      expect(await page.locator(".sbk-confirm").count()).toBe(0);
      expect(await page.evaluate(() => document.activeElement?.className)).toContain("sbk-button");
    });
  });

  // iOS Safari zooms the page on a quick second tap unless the control opts out with
  // `touch-action: manipulation`, which keeps pinch zoom. Every control a second tap can mean
  // something on (a stepper, an option, a toggle) opts out, in the blocks and in the layers
  // portalled to <body>; text fields keep double-tap to select a word.
  describe("double-tap zoom", () => {
    const controls: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            { type: "button", action_id: "b", text: plain("Go") },
            { type: "overflow", action_id: "o", options: [option("Edit"), option("Share")] },
            { type: "datepicker", action_id: "d", initial_date: "1990-04-28" },
            { type: "checkboxes", action_id: "c", options: [option("Alpha")] },
            { type: "radio_buttons", action_id: "r", options: [option("Bravo")] },
          ],
        },
        {
          type: "input",
          label: plain("Note"),
          element: { type: "plain_text_input", action_id: "t" },
        },
      ],
    };
    const touchAction = (page: Page, selectors: string[]) =>
      page.evaluate(
        (list) =>
          Object.fromEntries(
            list.map((s) => [s, getComputedStyle(document.querySelector(s)!).touchAction]),
          ),
        selectors,
      );
    const manipulation = (selectors: string[]) =>
      Object.fromEntries(selectors.map((s) => [s, "manipulation"]));

    it("opts buttons, toggles and their labels out", async () => {
      const page = await harness.open(controls);
      const selectors = [
        ".sbk-button",
        ".sbk-overflow__button",
        ".sbk-checkboxes__option",
        ".sbk-checkboxes__input",
        ".sbk-radio-buttons__option",
        ".sbk-radio-buttons__input",
      ];
      expect(await touchAction(page, selectors)).toEqual(manipulation(selectors));
    });

    it("opts a popover's options and the calendar's steppers and days out", async () => {
      const page = await harness.open(controls);
      await page.click(".sbk-overflow__button");
      expect(await touchAction(page, [".sbk-overflow__option"])).toEqual(
        manipulation([".sbk-overflow__option"]),
      );
      await page.keyboard.press("Escape");
      await page.click(".sbk-datepicker__input");
      const calendar = [
        ".sbk-calendar__nav",
        ".sbk-calendar__cell:not(.sbk-calendar__cell--empty)",
      ];
      expect(await touchAction(page, calendar)).toEqual(manipulation(calendar));
    });

    it("opts a modal's and a confirm dialog's buttons out", async () => {
      const page = await harness.open({
        blocks: [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                action_id: "open",
                text: plain("Open"),
                confirm: {
                  title: plain("Sure?"),
                  text: plain("Really."),
                  confirm: plain("Yes"),
                  deny: plain("No"),
                },
              },
            ],
          },
        ],
        opens: { type: "modal", title: plain("New entry"), submit: plain("Save"), blocks: [] },
      });
      await page.click(".sbk-button");
      await page.waitForSelector(".sbk-confirm");
      expect(await touchAction(page, [".sbk-confirm__button"])).toEqual(
        manipulation([".sbk-confirm__button"]),
      );
      await page.click(".sbk-confirm__button--primary, .sbk-confirm__button:last-child");
      await page.waitForSelector(".sbk-modal-layer .sbk-modal");
      const modal = [".sbk-modal__close", ".sbk-modal__button"];
      expect(await touchAction(page, modal)).toEqual(manipulation(modal));
    });

    it("leaves text fields alone, where a double tap selects a word", async () => {
      const page = await harness.open(controls);
      expect(await touchAction(page, [".sbk-text-input"])).toEqual({ ".sbk-text-input": "auto" });
    });
  });

  // iOS Safari zooms the page in when a field whose text is smaller than 16px takes focus. Slack's
  // fields are 13px (15px for multiline and rich text), so on a touch-only screen every text field
  // takes 16px text in the same box; a desktop keeps Slack's sizes.
  describe("field text on touch screens", () => {
    const field = (element: object) => ({ type: "input", label: plain("Field"), element });
    const fields: Mount = {
      blocks: [
        field({ type: "plain_text_input", action_id: "text" }),
        field({ type: "plain_text_input", action_id: "long", multiline: true }),
        field({ type: "number_input", action_id: "number", is_decimal_allowed: false }),
        field({ type: "email_text_input", action_id: "email" }),
        field({ type: "url_text_input", action_id: "url" }),
        field({ type: "rich_text_input", action_id: "rich" }),
        field({ type: "datepicker", action_id: "date" }),
        field({ type: "timepicker", action_id: "time" }),
        field({ type: "static_select", action_id: "one", options: [option("Alpha")] }),
        field({ type: "multi_static_select", action_id: "many", options: [option("Alpha")] }),
        field({ type: "datetimepicker", action_id: "when" }),
        field({ type: "plain_text_input", action_id: "short", max_length: 20 }),
      ],
    };
    const FIELDS =
      "input:not([type=checkbox], [type=radio], [type=file]), textarea, [contenteditable=true]";

    /** Each text field's font size and the height of the box it shows in (a select's or time
     * picker's frame, or the field itself), in document order. */
    const measure = (page: Page) =>
      page.evaluate(
        (selector) =>
          [...document.querySelectorAll<HTMLElement>(selector)].map((el) => ({
            field: `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`,
            size: getComputedStyle(el).fontSize,
            height: Math.round(
              (
                el.closest(".sbk-select__control, .sbk-timepicker__control") ?? el
              ).getBoundingClientRect().height,
            ),
          })),
        FIELDS,
      );

    it("gives every text field 16px text on a touch screen, in the same box", async () => {
      const desktop = await measure(await harness.open(fields));
      const touch = await measure(await harness.open(fields, { touch: true }));
      expect(touch.map((f) => f.size)).toEqual(desktop.map(() => "16px"));
      expect(touch.map((f) => [f.field, f.height])).toEqual(
        desktop.map((f) => [f.field, f.height]),
      );
    });

    it("keeps Slack's 13px field text, and 15px for multiline and rich text, on a desktop", async () => {
      const desktop = await measure(await harness.open(fields));
      expect(new Set(desktop.map((f) => f.size))).toEqual(new Set(["13px", "15px"]));
      expect(desktop.length).toBeGreaterThanOrEqual(11);
    });

    it("gives a field in an open popover 16px text too", async () => {
      const page = await harness.open(
        {
          blocks: [
            {
              type: "section",
              text: plain("Pick"),
              accessory: {
                type: "multi_static_select",
                action_id: "m",
                options: [option("Alpha")],
              },
            },
          ],
        },
        { touch: true },
      );
      await page.tap(".sbk-section__accessory .sbk-select__control");
      await settle(page);
      const sizes = await measure(page);
      expect(sizes.length).toBeGreaterThan(0);
      expect(new Set(sizes.map((f) => f.size))).toEqual(new Set(["16px"]));
    });
  });

  // A touch screen has no pointer resting anywhere, but after a tap the engine keeps the tapped
  // element in :hover until the next tap lands elsewhere, so a hover wash would stay painted on it.
  // Colours measured in Block Kit Builder in both themes (the dark pass of the state audit). Each
  // theme gets the same probes, so a dark fix can't move a light colour.
  // Measured in Block Kit Builder's dark theme: the Enter key on the typed match, the rule between
  // option groups and the "Nothing could be found" text.
  describe("select list extras in dark mode", () => {
    const groups: Mount = {
      theme: "dark",
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "g",
              placeholder: plain("Groups"),
              option_groups: [
                { label: plain("One"), options: [option("Alpha"), option("Bravo")] },
                { label: plain("Two"), options: [option("Charlie")] },
              ],
            },
          ],
        },
      ],
    };
    const colours = (page: Page, selector: string, props: string[]) =>
      page
        .locator(selector)
        .first()
        .evaluate((el, names) => {
          const c = getComputedStyle(el);
          return Object.fromEntries(names.map((n) => [n, c.getPropertyValue(n)]));
        }, props);

    it("draws the Enter key on Slack's dark keycap", async () => {
      const page = await harness.open(groups);
      await page.click(".sbk-select__control");
      await page.keyboard.type("a");
      await settle(page);
      expect(
        await colours(page, ".sbk-select__keycap", ["background-color", "border-bottom-color"]),
      ).toEqual({
        "background-color": "rgb(33, 36, 40)",
        "border-bottom-color": "rgba(121, 124, 129, 0.3)",
      });
    });

    it("rules the option groups apart in Slack's dark grey", async () => {
      const page = await harness.open(groups);
      await page.click(".sbk-select__control");
      await settle(page);
      const rule = await page.evaluate(() =>
        [...document.querySelectorAll(".sbk-select__menu .sbk-select__divider")].map(
          (el) => getComputedStyle(el, "::before").borderTopColor,
        ),
      );
      expect(rule).toEqual(["rgb(53, 55, 59)"]);
    });

    it("writes Nothing could be found in Slack's dark faint text", async () => {
      const page = await harness.open(groups);
      await page.click(".sbk-select__control");
      await page.keyboard.type("zzz");
      await settle(page);
      const color = await page
        .getByText("Nothing could be found.", { exact: false })
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe("rgba(232, 232, 232, 0.7)");
    });
  });

  // Measured in Block Kit Builder in both themes (October 2026): field borders, code, the c-menu
  // surfaces, the calendar's selected day and the feedback icons.
  describe("Builder-measured states in both themes", () => {
    const page_ = (theme: "light" | "dark"): Mount => ({
      theme,
      blocks: [
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "text", text: "Run " },
                { type: "text", text: "npm test", style: { code: true } },
              ],
            },
            { type: "rich_text_preformatted", elements: [{ type: "text", text: "const a = 1;" }] },
          ],
        },
        { type: "markdown", text: "```js\nconst b = 2;\n```" },
        {
          type: "actions",
          elements: [
            { type: "datepicker", action_id: "d", initial_date: "1990-04-28" },
            { type: "timepicker", action_id: "t", initial_time: "13:37" },
            { type: "overflow", action_id: "o", options: [option("One"), option("Two")] },
          ],
        },
        {
          type: "input",
          label: plain("Text"),
          element: { type: "plain_text_input", action_id: "p" },
        },
      ],
    });
    const props = (page: Page, selector: string, names: string[]) =>
      page
        .locator(selector)
        .first()
        .evaluate((el, ps) => {
          const c = getComputedStyle(el);
          return Object.fromEntries(ps.map((p) => [p, c.getPropertyValue(p)]));
        }, names);

    const WANT = {
      light: {
        field: {
          "background-color": "rgb(255, 255, 255)",
          "border-top-color": "rgb(124, 122, 127)",
        },
        inlineCode: {
          color: "rgb(192, 19, 67)",
          "background-color": "rgba(29, 28, 29, 0.04)",
          "border-top-color": "rgba(29, 28, 29, 0.13)",
        },
        pre: {
          color: "rgb(29, 28, 29)",
          "background-color": "rgba(29, 28, 29, 0.04)",
          "border-top-color": "rgba(29, 28, 29, 0.13)",
        },
        codeBox: {
          "background-color": "rgb(248, 248, 248)",
          "border-top-color": "rgba(29, 28, 29, 0.06)",
        },
        menu: {
          "background-color": "rgb(255, 255, 255)",
          "box-shadow":
            "rgba(29, 28, 29, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.12) 0px 4px 12px 0px",
        },
        selectedDay: {
          "background-color": "rgb(18, 100, 163)",
          color: "rgb(255, 255, 255)",
          "border-top-color": "rgb(221, 221, 221)",
        },
        icon: "rgb(69, 68, 71)",
      },
      dark: {
        field: { "background-color": "rgb(26, 29, 33)", "border-top-color": "rgb(121, 124, 129)" },
        inlineCode: {
          color: "rgb(232, 145, 45)",
          "background-color": "rgba(232, 232, 232, 0.04)",
          "border-top-color": "rgba(232, 232, 232, 0.13)",
        },
        pre: {
          color: "rgb(209, 210, 211)",
          "background-color": "rgba(232, 232, 232, 0.04)",
          "border-top-color": "rgba(232, 232, 232, 0.13)",
        },
        codeBox: {
          "background-color": "rgb(33, 36, 40)",
          "border-top-color": "rgba(248, 248, 248, 0.06)",
        },
        menu: {
          "background-color": "rgb(33, 36, 40)",
          "box-shadow":
            "rgba(232, 232, 232, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.12) 0px 4px 12px 0px",
        },
        selectedDay: {
          "background-color": "rgb(18, 100, 163)",
          color: "rgb(255, 255, 255)",
          "border-top-color": "rgb(53, 55, 59)",
        },
        icon: "rgb(185, 186, 189)",
      },
    } as const;

    for (const theme of ["light", "dark"] as const) {
      const want = WANT[theme];
      describe(theme, () => {
        it("draws text, date and time fields on Slack's surface and border", async () => {
          const page = await harness.open(page_(theme));
          const names = ["background-color", "border-top-color"];
          expect([
            await props(page, ".sbk-text-input", names),
            await props(page, ".sbk-datepicker__input", names),
            await props(page, ".sbk-timepicker__control", names),
          ]).toEqual([want.field, want.field, want.field]);
        });

        it("colours inline code, a preformatted block and a Markdown code box as Slack does", async () => {
          const page = await harness.open(page_(theme));
          const code = await page.evaluate(() => {
            const el = [...document.querySelectorAll("code")].find(
              (c) => c.textContent === "npm test",
            );
            el?.setAttribute("data-probe", "inline");
            return Boolean(el);
          });
          expect(code).toBe(true);
          expect(
            await props(page, '[data-probe="inline"]', [
              "color",
              "background-color",
              "border-top-color",
            ]),
          ).toEqual(want.inlineCode);
          expect(
            await props(page, ".sbk-rich-text__pre", [
              "color",
              "background-color",
              "border-top-color",
            ]),
          ).toEqual(want.pre);
          expect(
            await props(page, ".sbk-code-block__box", ["background-color", "border-top-color"]),
          ).toEqual(want.codeBox);
        });

        it("opens the overflow menu on Slack's c-menu surface", async () => {
          const page = await harness.open(page_(theme));
          await page.click(".sbk-overflow__button");
          await settle(page);
          expect(
            await props(page, ".sbk-overflow__menu", ["background-color", "box-shadow"]),
          ).toEqual(want.menu);
        });

        it("opens the data table's sort menu on the same surface", async () => {
          const page = await harness.open({
            ...(await fixture("catalog/table/numeric-sort-data-table")),
            theme,
          });
          await page.getByRole("button", { name: "Amount" }).click();
          await settle(page);
          expect(
            await props(page, ".sbk-data-table__sort-menu", ["background-color", "box-shadow"]),
          ).toEqual(want.menu);
        });

        it("fills the selected day Slack's blue and keeps its grid line", async () => {
          const page = await harness.open(page_(theme));
          await page.click(".sbk-datepicker__input");
          await page.mouse.move(5, 5);
          await settle(page);
          expect(
            await props(page, ".sbk-calendar__cell--selected", [
              "background-color",
              "color",
              "border-top-color",
            ]),
          ).toEqual(want.selectedDay);
        });

        it("draws the feedback icons in Slack's secondary grey", async () => {
          const page = await harness.open({
            ...(await fixture("extra/context-actions/feedback-row")),
            theme,
          });
          expect(
            (await props(page, ".sbk-feedback-buttons .sbk-icon-button", ["color"])).color,
          ).toBe(want.icon);
        });
      });
    }
  });

  // Measured in Block Kit Builder: a picked feedback button shows the filled thumb and keeps the
  // icon button's transparent background and grey, in both themes. (The dark grey itself is the
  // icon button's colour token.)
  describe("feedback buttons picked state", () => {
    for (const theme of ["light", "dark"] as const) {
      it(`shows the filled thumb with no fill or colour change (${theme})`, async () => {
        const page = await harness.open({
          ...(await fixture("extra/context-actions/feedback-row")),
          theme,
        });
        const good = page.getByRole("radio", { name: "Good Response" });
        const bad = page.getByRole("radio", { name: "Bad Response" });
        await good.click();
        await page.mouse.move(5, 5);
        await settle(page);
        const read = (el: typeof good) =>
          el.evaluate((node) => {
            const c = getComputedStyle(node);
            return {
              checked: node.getAttribute("aria-checked"),
              background: c.backgroundColor,
              color: c.color,
              path: node.querySelector("path")?.getAttribute("d")?.slice(0, 12),
            };
          });
        const [picked, other] = [await read(good), await read(bad)];
        expect(picked).toEqual({
          checked: "true",
          background: "rgba(0, 0, 0, 0)",
          color: other.color,
          path: "M12.997 1.77",
        });
        expect(other.checked).toBe("false");
      });
    }
  });

  // Measured in Block Kit Builder (extra/modal/rich-and-file and its @dark reference): the rich
  // text composer's box, formatting bar, its buttons and separators, in both themes.
  describe("rich text input surfaces", () => {
    const SURFACES = {
      light: {
        box: ["rgb(255, 255, 255)", "rgba(29, 28, 29, 0.13)"],
        toolbar: "rgb(248, 248, 248)",
        tool: "rgba(29, 28, 29, 0.7)",
        separator: "rgb(234, 234, 234)",
      },
      dark: {
        box: ["rgb(34, 37, 41)", "rgb(86, 88, 86)"],
        toolbar: "rgb(34, 37, 41)",
        tool: "rgba(232, 232, 232, 0.7)",
        separator: "rgb(33, 36, 40)",
      },
    } as const;

    for (const theme of ["light", "dark"] as const) {
      it(`paints the composer in Slack's ${theme} colours`, async () => {
        const page = await harness.open({
          theme,
          view: {
            type: "modal",
            title: plain("New entry"),
            blocks: [
              {
                type: "input",
                label: plain("Summary"),
                element: { type: "rich_text_input", action_id: "summary" },
              },
            ],
          },
        });
        const got = await page.evaluate(() => {
          const c = (sel: string) => getComputedStyle(document.querySelector(sel)!);
          return {
            box: [
              c(".sbk-rich-text-input").backgroundColor,
              c(".sbk-rich-text-input").borderTopColor,
            ],
            toolbar: c(".sbk-rich-text-input__toolbar").backgroundColor,
            tool: c(".sbk-rich-text-input__tool").color,
            separator: c(".sbk-rich-text-input__separator").backgroundColor,
          };
        });
        expect(got).toEqual({ ...SURFACES[theme], box: [...SURFACES[theme].box] });
      });
    }
  });

  // Measured from Block Kit Builder's dark references (the @dark captures): Slack draws message
  // text a little softer (#d1d2d3) than cards, charts, data tables, container titles and alerts
  // (#f8f8f8), and secondary text (timestamp, context, image titles, video bylines) in #ababad.
  // Light values are the ones the light references already match.
  describe("text colours in both themes", () => {
    /** The computed `color` (or another property) of the first match, after transitions. */
    const prop = (page: Page, selector: string, name = "color") =>
      page
        .locator(selector)
        .first()
        .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n), name);
    const open = async (name: string, theme: "light" | "dark") =>
      harness.open({ ...(await fixture(name)), theme });

    const CASES: {
      what: string;
      fixture: string;
      selector: string;
      property?: string;
      light: string;
      dark: string;
    }[] = [
      {
        what: "message body text",
        fixture: "catalog/section/plain-text",
        selector: ".sbk-section__text",
        light: "rgb(29, 28, 29)",
        dark: "rgb(209, 210, 211)",
      },
      {
        what: "the sender name",
        fixture: "catalog/section/plain-text",
        selector: ".sbk-message__sender",
        light: "rgb(29, 28, 29)",
        dark: "rgb(209, 210, 211)",
      },
      {
        what: "the timestamp",
        fixture: "catalog/section/plain-text",
        selector: ".sbk-message__time",
        light: "rgb(97, 96, 97)",
        dark: "rgb(171, 171, 173)",
      },
      {
        what: "context text",
        fixture: "catalog/structure/plain-text",
        selector: ".sbk-context",
        light: "rgb(97, 96, 97)",
        dark: "rgb(171, 171, 173)",
      },
      {
        what: "an input label",
        fixture: "catalog/input/plain-text-input",
        selector: ".sbk-input__label",
        light: "rgb(29, 28, 29)",
        dark: "rgb(209, 210, 211)",
      },
      {
        what: "a card title",
        fixture: "catalog/card-and-carousel/card",
        selector: ".sbk-card__title",
        light: "rgb(29, 28, 29)",
        dark: "rgb(248, 248, 248)",
      },
      {
        what: "a card body",
        fixture: "catalog/card-and-carousel/card",
        selector: ".sbk-card__body .sbk-mrkdwn",
        light: "rgb(29, 28, 29)",
        dark: "rgb(248, 248, 248)",
      },
      {
        what: "a card subtitle",
        fixture: "catalog/card-and-carousel/card",
        selector: ".sbk-card__subtitle",
        light: "rgb(94, 93, 96)",
        dark: "rgb(154, 155, 158)",
      },
      {
        what: "a container title",
        fixture: "catalog/container/full-width",
        selector: ".sbk-container__title",
        light: "rgb(29, 28, 29)",
        dark: "rgb(248, 248, 248)",
      },
      {
        what: "a chart title",
        fixture: "catalog/data-visualization/bar-single-series",
        selector: ".sbk-dataviz__title",
        light: "rgb(29, 28, 29)",
        dark: "rgb(248, 248, 248)",
      },
      {
        what: "a data table cell",
        fixture: "catalog/table/paginated-data-table",
        selector: ".sbk-data-table__cell",
        light: "rgb(29, 28, 29)",
        dark: "rgb(248, 248, 248)",
      },
      {
        what: "the active page button",
        fixture: "catalog/table/paginated-data-table",
        selector: ".sbk-data-table__page-btn--active",
        property: "background-color",
        light: "rgb(0, 122, 90)",
        dark: "rgb(23, 126, 86)",
      },
      {
        what: "a video's provider separator",
        fixture: "extra/media/video",
        selector: ".sbk-video__separator",
        light: "rgb(221, 221, 221)",
        dark: "rgb(53, 55, 59)",
      },
      {
        what: "a multi-select's placeholder in an input block",
        fixture: "catalog/input/multi-static-select",
        selector: ".sbk-input__element .sbk-select__placeholder",
        light: "rgb(94, 93, 96)",
        dark: "rgb(154, 155, 158)",
      },
      {
        what: "the unrenderable-block message",
        fixture: "catalog/container/with-callout",
        selector: ".sbk-block-error__message",
        light: "rgb(29, 28, 29)",
        dark: "rgb(232, 232, 232)",
      },
    ];

    for (const theme of ["light", "dark"] as const) {
      for (const c of CASES) {
        it(`colours ${c.what} in ${theme}`, async () => {
          const page = await open(c.fixture, theme);
          await settle(page);
          expect(await prop(page, c.selector, c.property)).toBe(c[theme]);
        });
      }
    }

    it("draws a private channel mention in Slack's dark grey on its dark tint", async () => {
      const page = await harness.open({
        theme: "dark",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: "See <#C0PRIVATE>" } }],
      });
      await settle(page);
      expect([
        await prop(page, ".sbk-mention--private"),
        await prop(page, ".sbk-mention--private", "background-color"),
      ]).toEqual(["rgba(232, 232, 232, 0.7)", "rgba(232, 232, 232, 0.13)"]);
    });

    // An input block's radio group ends with the last option's own 8px margin, as in Slack:
    // catalog/input/radio-buttons is 158px tall in both themes, like the checkboxes beside it.
    it("adds no extra space below a radio group in an input block", async () => {
      const page = await open("catalog/input/radio-buttons", "light");
      const gap = await page.evaluate(() => {
        const group = document.querySelector(".sbk-radio-buttons")!.getBoundingClientRect();
        const block = document.querySelector(".sbk-block")!.getBoundingClientRect();
        return Math.round(block.bottom - group.bottom);
      });
      expect(gap).toBe(0);
    });
  });

  // Measured in Block Kit Builder (contexts/{datepicker,timepicker}/{actions,home,modal-input}):
  // Slack draws date and time fields in its small size (28px, 13px text) in messages, and in its
  // medium size (36px, 15px text) in modals and on App Home.
  describe("date and time fields by surface", () => {
    const date = { type: "datepicker", action_id: "d", initial_date: "1990-04-28" };
    const time = { type: "timepicker", action_id: "t", initial_time: "13:37" };
    const onHome = (element: object): Mount => ({
      view: { type: "home", blocks: [{ type: "actions", elements: [element] }] },
    });
    const inModal = (element: object): Mount => ({
      view: {
        type: "modal",
        title: plain("Picker"),
        submit: plain("Submit"),
        blocks: [{ type: "input", label: plain("Label"), element }],
      },
    });
    const inMessage = (element: object): Mount => ({
      blocks: [{ type: "actions", elements: [element] }],
    });

    /** The field's box, its text size, and where its text and right-hand control sit in it. */
    const dateField = (page: Page) =>
      page.evaluate(() => {
        const field = document.querySelector(".sbk-datepicker__input")!;
        const f = field.getBoundingClientRect();
        const toggle = document.querySelector(".sbk-datepicker__toggle")!.getBoundingClientRect();
        const c = getComputedStyle(field);
        return {
          height: f.height,
          width: f.width,
          font: c.fontSize,
          textLeft: parseFloat(c.paddingLeft),
          toggle: [toggle.width, toggle.height],
        };
      });
    const timeField = (page: Page) =>
      page.evaluate(() => {
        const field = document.querySelector(".sbk-timepicker__control")!;
        const f = field.getBoundingClientRect();
        const text = document
          .querySelector(".sbk-timepicker__content-text")!
          .getBoundingClientRect();
        const chevron = document.querySelector(".sbk-timepicker__chevron")!.getBoundingClientRect();
        return {
          height: f.height,
          width: f.width,
          font: getComputedStyle(field).fontSize,
          textX: Math.round(text.left - f.left),
          chevronRight: Math.round(f.right - chevron.right),
        };
      });

    it("keeps the small date field in a message", async () => {
      const page = await harness.open(inMessage(date));
      const f = await dateField(page);
      expect([f.height, f.font, f.toggle]).toEqual([28, "13px", [28, 28]]);
    });

    it("draws the medium date field on App Home", async () => {
      const page = await harness.open(onHome(date));
      expect(await dateField(page)).toEqual({
        height: 36,
        width: 227.5,
        font: "15px",
        textLeft: 32,
        toggle: [36, 36],
      });
    });

    it("draws the medium date field in a modal's input", async () => {
      const page = await harness.open(inModal(date));
      const f = await dateField(page);
      expect([f.height, f.font, f.toggle]).toEqual([36, "15px", [36, 36]]);
    });

    it("keeps the small time field in a message", async () => {
      const page = await harness.open(inMessage(time));
      const f = await timeField(page);
      expect([f.height, f.font]).toEqual([28, "13px"]);
    });

    it("draws the medium time field on App Home", async () => {
      const page = await harness.open(onHome(time));
      expect(await timeField(page)).toEqual({
        height: 36,
        width: 190,
        font: "15px",
        textX: 33,
        chevronRight: 12,
      });
    });

    it("draws the medium time field in a modal's input", async () => {
      const page = await harness.open(inModal(time));
      const f = await timeField(page);
      expect([f.height, f.font]).toEqual([36, "15px"]);
    });
  });

  describe("theme colours", () => {
    const controls = (theme: "light" | "dark"): Mount => ({
      theme,
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
            { type: "timepicker", action_id: "t", initial_time: "13:00" },
            { type: "datepicker", action_id: "d" },
            { type: "button", action_id: "b", text: plain("Go") },
          ],
        },
      ],
    });

    /** The computed properties of the first match, as `name: value` for a readable diff. */
    const read = (page: Page, selector: string, props: string[], pseudo?: string) =>
      page
        .locator(selector)
        .first()
        .evaluate(
          (el, [names, pseudoEl]) => {
            const c = getComputedStyle(el, (pseudoEl as string | undefined) ?? null);
            return Object.fromEntries((names as string[]).map((n) => [n, c.getPropertyValue(n)]));
          },
          [props, pseudo] as const,
        );

    const EXPECTED = {
      light: {
        selectBorder: "rgb(124, 122, 127)",
        listBg: "rgb(248, 248, 248)",
        listShadow: "rgba(29, 28, 29, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.12) 0px 5px 10px 0px",
        highlight: { "background-color": "rgb(18, 100, 163)", color: "rgb(255, 255, 255)" },
        buttonHover: "rgb(248, 248, 248)",
        iconButtonHover: "rgb(234, 234, 234)",
        calendarBg: "rgb(255, 255, 255)",
        calendarShadow:
          "rgba(29, 28, 29, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 4px 12px 0px",
        day: "rgb(29, 28, 29)",
        grid: "rgb(221, 221, 221)",
        today: "rgb(18, 100, 163)",
      },
      dark: {
        selectBorder: "rgb(121, 124, 129)",
        listBg: "rgb(26, 29, 33)",
        listShadow:
          "rgba(232, 232, 232, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.12) 0px 5px 10px 0px",
        highlight: { "background-color": "rgb(18, 100, 163)", color: "rgb(255, 255, 255)" },
        buttonHover: "rgb(26, 29, 33)",
        iconButtonHover: "rgb(33, 36, 40)",
        calendarBg: "rgb(26, 29, 33)",
        calendarShadow:
          "rgba(232, 232, 232, 0.13) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 4px 12px 0px",
        day: "rgb(209, 210, 211)",
        grid: "rgb(53, 55, 59)",
        today: "rgb(29, 155, 209)",
      },
    } as const;

    for (const theme of ["light", "dark"] as const) {
      const want = EXPECTED[theme];

      describe(theme, () => {
        it("draws the select field's border", async () => {
          const page = await harness.open(controls(theme));
          expect(await read(page, ".sbk-select__control", ["border-top-color"])).toEqual({
            "border-top-color": want.selectBorder,
          });
        });

        it("opens the select list on Slack's surface, ring and highlight", async () => {
          const page = await harness.open(controls(theme));
          await page.click(".sbk-select__control");
          await settle(page);
          expect(await read(page, ".sbk-select__menu", ["background-color", "box-shadow"])).toEqual(
            { "background-color": want.listBg, "box-shadow": want.listShadow },
          );
          // The blue highlight is the keyboard's; the list opens on Slack's grey typed highlight.
          await page.keyboard.press("ArrowDown");
          await settle(page);
          expect(
            await read(page, ".sbk-select__option[data-active]", ["background-color", "color"]),
          ).toEqual(want.highlight);
        });

        it("opens the time list on the same surface and ring", async () => {
          const page = await harness.open(controls(theme));
          await page.click(".sbk-timepicker__control");
          await settle(page);
          expect(
            await read(page, ".sbk-timepicker__menu", ["background-color", "box-shadow"]),
          ).toEqual({ "background-color": want.listBg, "box-shadow": want.listShadow });
        });

        it("fills a hovered default button", async () => {
          const page = await harness.open(controls(theme));
          await page.hover(".sbk-button");
          await settle(page);
          expect(await read(page, ".sbk-button", ["background-color"])).toEqual({
            "background-color": want.buttonHover,
          });
        });

        it("fills a hovered icon button", async () => {
          const page = await harness.open({
            ...(await fixture("catalog/agents/message-feedback")),
            theme,
          });
          await page.hover(".sbk-icon-button");
          await settle(page);
          expect(await read(page, ".sbk-icon-button", ["background-color"])).toEqual({
            "background-color": want.iconButtonHover,
          });
        });

        it("draws the calendar's surface, days, grid and today", async () => {
          const page = await harness.open(controls(theme));
          await page.click(".sbk-datepicker__input");
          await page.mouse.move(790, 690);
          await settle(page);
          expect(
            await read(page, ".sbk-datepicker__popup", ["background-color", "box-shadow"]),
          ).toEqual({ "background-color": want.calendarBg, "box-shadow": want.calendarShadow });
          // With no initial date the calendar opens on this month, so today is in view.
          const day =
            ".sbk-calendar__cell:not(.sbk-calendar__cell--empty, .sbk-calendar__cell--today)";
          expect(await read(page, day, ["color", "border-top-color"])).toEqual({
            color: want.day,
            "border-top-color": want.grid,
          });
          expect({
            text: (await read(page, ".sbk-calendar__cell--today", ["color"])).color,
            ring: (await read(page, ".sbk-calendar__cell--today", ["border-top-color"], "::after"))[
              "border-top-color"
            ],
          }).toEqual({ text: want.today, ring: want.today });
        });
      });
    }
  });

  describe("hover on touch screens", () => {
    const controls: Mount = {
      blocks: [
        {
          type: "actions",
          elements: [
            { type: "button", action_id: "b", text: plain("Go") },
            { type: "overflow", action_id: "o", options: [option("Edit"), option("Share")] },
            { type: "datepicker", action_id: "d", initial_date: "1990-04-28" },
          ],
        },
      ],
    };
    const fill = (page: Page, selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    const NEXT_MONTH = '.sbk-calendar__nav[aria-label="Next month"]';

    it("leaves no hover wash on the calendar's month button after a tap", async () => {
      const page = await harness.open(controls, { touch: true });
      await page.tap(".sbk-datepicker__input");
      await page.tap(NEXT_MONTH);
      await settle(page);
      expect(await fill(page, NEXT_MONTH)).toBe("rgba(0, 0, 0, 0)");
    });

    it("leaves the overflow button as it was before the tap", async () => {
      const page = await harness.open(controls, { touch: true });
      const before = await fill(page, ".sbk-overflow__button");
      await page.tap(".sbk-overflow__button");
      await page.keyboard.press("Escape");
      await settle(page);
      expect(await fill(page, ".sbk-overflow__button")).toBe(before);
    });

    // Chromium's emulated tap leaves the button in :active as well as :hover afterwards, which
    // paints Slack's pressed grey (rightly, for a pressed button); a real touch ends :active when
    // the finger lifts. Firefox and WebKit end it, so they show whether the hover fill stays.
    it.if(engine !== "chromium")("leaves a button as it was before the tap", async () => {
      const page = await harness.open(controls, { touch: true });
      const before = await fill(page, ".sbk-button");
      await page.tap(".sbk-button");
      await settle(page);
      expect(await fill(page, ".sbk-button")).toBe(before);
    });

    it("still washes the month button under a mouse pointer", async () => {
      const page = await harness.open(controls);
      await page.click(".sbk-datepicker__input");
      await page.hover(NEXT_MONTH);
      await settle(page);
      expect(await fill(page, NEXT_MONTH)).toBe("rgba(29, 155, 209, 0.1)");
    });
  });

  // Measured in Block Kit Builder (catalog/data-visualization/area-multi-series and its @dark
  // reference): each area's fill, at 0.7 opacity, in both themes.
  describe("chart fills", () => {
    const AREA_FILLS = {
      light: ["rgb(255, 237, 229)", "rgb(227, 255, 243)"],
      dark: ["rgb(56, 16, 0)", "rgb(5, 36, 27)"],
    } as const;

    for (const theme of ["light", "dark"] as const) {
      it(`fills each area with Slack's ${theme} tint`, async () => {
        const page = await harness.open({
          ...(await fixture("catalog/data-visualization/area-multi-series")),
          theme,
        });
        const fills = await page.evaluate(() =>
          [...document.querySelectorAll("path[fill-opacity]")].map((p) => {
            const c = getComputedStyle(p);
            return [c.fill, c.fillOpacity];
          }),
        );
        expect(fills).toEqual(AREA_FILLS[theme].map((fill) => [fill, "0.7"]));
      });

      // Slack separates pie slices with a 2px line in the page colour: #fff, or #1a1d21 in dark.
      it(`separates pie slices with the ${theme} page colour`, async () => {
        const page = await harness.open({
          ...(await fixture("catalog/data-visualization/pie-multi-segment")),
          theme,
        });
        const strokes = await page.evaluate(() => [
          ...new Set(
            [...document.querySelectorAll('svg[aria-label="Pie chart"] path')].map((p) => {
              const c = getComputedStyle(p);
              return `${c.stroke} ${c.strokeWidth}`;
            }),
          ),
        ]);
        expect(strokes).toEqual([
          `${theme === "dark" ? "rgb(26, 29, 33)" : "rgb(255, 255, 255)"} 2px`,
        ]);
      });
    }
  });

  // Measured from Block Kit Builder's slack_file references: Slack draws a workspace file from its
  // 800px thumbnail at 2x, so a 1254px square logo shows at 400 x 400 in a 432px-wide message and
  // fills the width (320 x 320) on mobile, while an image_url of the same size fills the message.
  describe("image block sizes", () => {
    const FILE = "https://files.slack.com/files-pri/T0000001-F0000001/file";
    const image = (source: object) => [{ type: "image", ...source, alt_text: "logo" }];
    for (const theme of ["light", "dark"] as const) {
      it(`${theme}: caps a resolved slack_file at 400 x 400`, async () => {
        const page = await harness.open({
          blocks: image({ slack_file: { url: FILE } }),
          slackFiles: { [FILE]: { url: GREEN_SQUARE, size: 400_401 } },
          theme,
        });
        expect(await greenExtent(page, ".sbk-image__frame")).toEqual({ width: 400, height: 400 });
      });

      it(`${theme}: keeps a slack_file square within a narrow message`, async () => {
        const page = await harness.open(
          {
            blocks: image({ slack_file: { url: FILE } }),
            slackFiles: { [FILE]: { url: GREEN_SQUARE } },
            theme,
          },
          { viewport: { width: 300, height: 700 } },
        );
        const { width, height } = await greenExtent(page, ".sbk-image__frame");
        expect(width).toBeLessThan(300);
        expect(Math.abs(width - height)).toBeLessThanOrEqual(1);
      });

      it(`${theme}: lets an image_url fill the message`, async () => {
        const page = await harness.open({ blocks: image({ image_url: GREEN_SQUARE }), theme });
        expect((await greenExtent(page, ".sbk-image__frame")).width).toBeGreaterThan(400);
      });
    }
  });

  // Measured in Block Kit Builder's Mobile preview (400px; blocks 320px wide) against its Desktop
  // one (512px; blocks 432px): what changes when a message is narrow.
  describe("narrow messages", () => {
    const DESKTOP = { width: 800, height: 900 };
    const PHONE = { width: 390, height: 844 };

    // The video box is min(360px, block - 24px) wide at Slack's 360:283 shape: 360 x 283 on
    // desktop, 296 x 233 in a 320px block.
    for (const [label, viewport] of [
      ["desktop", DESKTOP],
      ["a phone", PHONE],
    ] as const) {
      it(`sizes a video's box like Slack on ${label}`, async () => {
        const page = await harness.open(await fixture("extra/media/video"), { viewport });
        const [block, frame] = await Promise.all(
          [".sbk-block", ".sbk-video__frame"].map((s) => page.locator(s).first().boundingBox()),
        );
        const width = Math.min(360, block!.width - 24);
        expect([Math.round(frame!.width * 10) / 10, Math.round(frame!.height * 10) / 10]).toEqual([
          Math.round(width * 10) / 10,
          Math.round(((width * 283) / 360) * 10) / 10,
        ]);
      });
    }
  });
});

/** A solid green 72 x 36 image, served inline: the harness answers every network request 404. */
const WIDE_GREEN_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="36"><rect width="72" height="36" fill="#00c800"/></svg>',
)}`;

/** A solid green 1254 x 1254 image, the size of the logo the slack_file references use. */
const GREEN_SQUARE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#00c800"/></svg>',
)}`;

/** How far the green image paints along the element's middle row and middle column, at 1x. */
async function greenExtent(page: Page, selector: string) {
  const { PNG } = await import("pngjs");
  const png = PNG.sync.read(
    await page.locator(selector).first().screenshot({ animations: "disabled" }),
  );
  const green = (x: number, y: number) => {
    const i = (y * png.width + x) * 4;
    return png.data[i]! < 60 && png.data[i + 1]! > 160 && png.data[i + 2]! < 60;
  };
  const midX = Math.floor(png.width / 2);
  const midY = Math.floor(png.height / 2);
  let width = 0;
  let height = 0;
  for (let x = 0; x < png.width; x++) if (green(x, midY)) width++;
  for (let y = 0; y < png.height; y++) if (green(midX, y)) height++;
  return { width, height };
}

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
