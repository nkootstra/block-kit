/**
 * How compare.ts reaches a captured state on our rendering (see names.ts for reference names).
 * `ours` clicks through our rendering the way the reference was clicked through in Block Kit
 * Builder; `reference` restores what a DOM snapshot can't record, such as a scroll offset.
 */
import type { ElementHandle, Locator, Page } from "playwright";
import { type InputState, parseInputState, parseReferenceName } from "./names";
import { type Probe, probeSnapshots, runSteps, type Step } from "./probes";
import { scrollOursToEnd } from "./scrollers";
import { findTarget, OURS, ourRoot, type Target } from "./targets";

export interface State {
  /** `reference` is the reference's page, open on its own when the state has a popover. */
  ours: (page: Page, reference?: Page) => Promise<void>;
  reference?: (page: Page) => Promise<void>;
  /** The state is the pointer resting on a control: don't move it away before the screenshot. */
  keepPointer?: boolean;
}

/** States captured for one fixture, keyed `<fixture>@<interaction>`. */
export const STATES: Record<string, State> = {
  "catalog/agents/plan@expanded": { ours: (p) => p.click(".sbk-plan__pill") },
  "catalog/agents/plan-error@expanded": { ours: (p) => p.click(".sbk-plan__pill") },
  "catalog/agents/plan@tasks-collapsed": {
    ours: async (p) => {
      await p.click(".sbk-plan__pill");
      for (const header of await p.locator("button.sbk-plan__task-header").all()) {
        await header.click();
      }
    },
  },
  "catalog/agents/task-card@expanded": { ours: (p) => p.click(".sbk-task-card__pill") },
  "catalog/container/collapsible@collapsed": {
    ours: (p) => p.click(".sbk-container__header--button"),
  },
  "catalog/image/title@hidden": { ours: (p) => p.click(".sbk-image__toggle") },
  "catalog/image/no-title@hidden": { ours: (p) => p.click(".sbk-image__toggle") },
  "catalog/table/numeric-sort-data-table@sort-asc": {
    ours: async (p) => {
      await p.getByRole("button", { name: "Amount" }).click();
      await p.getByRole("menuitemradio", { name: "Ascending" }).click();
    },
  },
  "catalog/table/paginated-data-table@page-2": {
    ours: (p) => p.getByRole("button", { name: "Next page" }).click(),
  },
  // One press of Slack's right arrow scrolls the gallery by a card and its gap: 356px.
  "catalog/card-and-carousel/carousel@scrolled": {
    ours: (p) => p.getByRole("button", { name: "Scroll right" }).click(),
    reference: (p) =>
      p.evaluate(() => {
        const wrapper = document.querySelector(".p-gallery_scroller__wrapper");
        if (wrapper) wrapper.scrollLeft = 356;
      }),
  },
  "catalog/agents/task-card-statuses@expanded": {
    // The pills have no details to show (aria-disabled), so the click changes nothing, in Slack too.
    ours: (p) => p.locator(".sbk-task-card__pill").first().click({ force: true }),
  },
  "catalog/callout/callout@hidden": { ours: (p) => p.click(".sbk-image__toggle") },
  "catalog/callout/callout@menu": {
    ours: async (p) => {
      const menu = await ourTarget(p, { kind: "menu", index: 1 });
      await menu.hover({ force: true });
      await menu.click();
    },
  },
  "catalog/table/basic-data-table@menu": {
    ours: (p) => p.getByRole("button", { name: "More actions", exact: true }).click(),
  },
  "catalog/table/basic-data-table@sort-asc": {
    ours: async (p) => {
      await p.getByRole("button", { name: "Name", exact: true }).click();
      await p.getByRole("menuitemradio", { name: "Ascending" }).click();
    },
  },
  // The interactions recorded with Actions Preview, the same clicks and keys as the package's
  // payload test (actionPayloads.test.tsx INTERACTIONS); the reference was frozen after them. The
  // test's workspace has Slackbot and private-one where the redacted references, and the
  // playground, list User One and channel-one.
  "catalog/actions/all-selects@pick": pick((p) => p.getByPlaceholder("Select an item"), {
    text: "*plain_text option 1*",
  }),
  "catalog/actions/all-selects@pick-static": pick((p) => p.getByPlaceholder("Select an item"), {
    text: "*plain_text option 1*",
  }),
  "catalog/actions/datepickers@pick": pick((p) => p.getByPlaceholder("Select a date").first(), {
    button: /April 15th, 1990/,
  }),
  "catalog/actions/filtered-conversations-select@pick": pick(
    (p) => p.getByRole("combobox", { name: "Select private conversation", exact: true }),
    { option: /channel-one/ },
  ),
  "catalog/actions/radio-buttons@pick": { ours: (p) => p.getByRole("radio").nth(1).click() },
  // The redaction names channels in the order a reference shows them, so the one channel left
  // after the pick is always channel-one there.
  "catalog/actions/selects-with-initial-options@pick": pick((p) => p.getByRole("combobox").nth(2), {
    option: /channel-one/,
  }),
  "catalog/actions/timepicker@pick": arrowPick((p) => byValue(p, "1:37 PM")),
  "catalog/agents/message-feedback@pick": { ours: (p) => p.getByRole("radio").first().click() },
  "catalog/container/data-entry-form@pick": pick((p) => p.getByPlaceholder("Select priority"), {
    option: "High",
  }),
  "catalog/input/multi-static-select@pick": pick(
    (p) => p.locator(".sbk-input .sbk-select__control").first(),
    { option: "*plain_text option 1*" },
  ),
  "catalog/input/multi-users-select@pick": pick(
    (p) => p.locator(".sbk-input .sbk-select__control").first(),
    { option: /User One/ },
  ),
  "catalog/input/radio-buttons@pick": {
    ours: (p) => p.getByRole("radio", { name: "*plain_text option 1*", exact: true }).click(),
  },
  "catalog/input/static-select@pick": pick((p) => p.getByPlaceholder("Select an item"), {
    option: "*plain_text option 1*",
  }),
  "catalog/section/multi-conversations-select@pick": dialogPick("Select conversations", /User One/),
  "catalog/section/multi-static-select@pick": dialogPick("Select options", /plain_text option 0/),
  "catalog/section/overflow@pick": pick(
    (p) => p.getByRole("button", { name: "More options", exact: true }),
    { text: "*plain_text option 1*" },
  ),
  "catalog/section/radio-buttons@pick": {
    ours: (p) => p.getByRole("radio", { name: "*plain_text option 1*", exact: true }).click(),
  },
  "catalog/section/users-select@pick": pick(
    (p) => p.getByRole("combobox", { name: "Select a user", exact: true }),
    { option: /User One/ },
  ),
  "contexts/datetimepicker/actions@pick": pick(
    (p) => p.getByRole("button", { name: /January 1st, 2026/ }),
    { button: /January 14th, 2026/ },
  ),
  "contexts/multi_static_select/accessory@pick": dialogPick("Select items", /^Option 1$/),
  "contexts/multi_users_select/accessory@pick": dialogPick("Select users", /User One/),
  "extra/actions/more-elements@pick": pick(
    (p) => p.getByRole("combobox", { name: "Pick a channel", exact: true }),
    { option: /channel-one/ },
  ),
  "extra/fidelity/channels-select/long-content@pick": pick(
    (p) => p.getByRole("combobox", { name: /^This sentence is here/ }),
    { option: /channel-one/ },
  ),
  "extra/fidelity/checkboxes/long-content@pick": {
    ours: (p) => p.getByRole("checkbox").first().click(),
  },
  "extra/fidelity/confirm/long-content@pick": pick(
    (p) => p.getByRole("combobox", { name: "Pick a channel", exact: true }),
    { option: /channel-one/ },
  ),
  "extra/fidelity/datetimepicker/empty@pick": pick(
    (p) => p.getByRole("button", { name: /Select a date/ }),
    { button: /October 15th, 2026/ },
  ),
  "extra/fidelity/multi-channels-select/empty@pick": pick(
    (p) => p.locator(".sbk-input .sbk-select__control").first(),
    { option: /channel-one/ },
  ),
  "extra/fidelity/multi-conversations-select/initial-value@pick": dialogPick(
    /1 selected/,
    /User One/,
  ),
  "extra/fidelity/option/long-content@pick": pick(
    (p) => p.getByRole("button", { name: "More options", exact: true }),
    { text: /^This sentence is here/ },
  ),
  "extra/fidelity/users-select/long-content@pick": pick(
    (p) => p.getByRole("combobox", { name: /^This sentence is here/ }),
    { option: /User One/ },
  ),
  "extra/input/more-selects@pick": pick(
    (p) => p.getByRole("combobox", { name: "Select a conversation", exact: true }),
    { option: /User One/ },
  ),
  "extra/modal/required-multi-selects@pick": pick(
    (p) => p.locator(".sbk-input .sbk-select__control").first(),
    { option: "Option 1" },
  ),
  "extra/payloads/accessory-multi-selects@pick": {
    ours: async (p) => {
      await p.getByRole("button", { name: "Select channels", exact: true }).click();
      const field = p.getByRole("dialog").getByRole("combobox");
      await field.click();
      await p.keyboard.press("ArrowDown");
      await p.keyboard.press("Enter");
      await confirm(p);
    },
  },
  "extra/payloads/pickers@pick": arrowPick((p) => byValue(p, "1:37 PM")),
  "extra/payloads/selects@change-single": pick((p) => p.getByRole("combobox").first(), {
    option: "Bravo",
  }),
  "extra/payloads/selects@keyboard-single": {
    ours: async (p) => {
      await p.getByRole("combobox").first().click();
      await p.keyboard.press("ArrowDown");
      await p.keyboard.press("ArrowDown");
      await p.keyboard.press("Enter");
    },
  },
  "extra/payloads/selects@pick-accessory": pick((p) => p.getByRole("combobox").nth(1), {
    option: "Two",
  }),
};

type Find = (p: Page) => Locator;
/** What a pick clicks once its control is open: an option, a calendar day or menu text. */
type Choice = { option: string | RegExp } | { button: string | RegExp } | { text: string | RegExp };

/** A string names a control exactly, as Testing Library matches it; a RegExp matches as written. */
const exact = (name: string | RegExp) => typeof name === "string";

/** Opens a control and clicks one of the choices it shows. */
function pick(opener: Find, choice: Choice): State {
  return {
    ours: async (p) => {
      await opener(p).click();
      if ("option" in choice)
        await p
          .getByRole("option", { name: choice.option, exact: exact(choice.option) })
          .first()
          .click();
      else if ("button" in choice)
        await p
          .getByRole("button", { name: choice.button, exact: exact(choice.button) })
          .first()
          .click();
      else
        await p
          .getByText(choice.text, { exact: exact(choice.text) })
          .first()
          .click();
    },
  };
}

/** Opens a field's list and takes the entry after its value with ArrowDown and Enter. */
function arrowPick(field: Find): State {
  return {
    ours: async (p) => {
      await field(p).click();
      await p.keyboard.press("ArrowDown");
      await p.keyboard.press("Enter");
    },
  };
}

/** Picks one option in a section accessory multi-select's dialog and confirms it. */
function dialogPick(button: string | RegExp, option: RegExp): State {
  return {
    ours: async (p) => {
      await p.getByRole("button", { name: button, exact: typeof button === "string" }).click();
      await p.getByRole("dialog").getByRole("combobox").click();
      await p.getByRole("option", { name: option }).first().click();
      await confirm(p);
    },
  };
}

/**
 * Presses the dialog's Confirm. A multi-select's list stays open after a pick and can cover the
 * button at the mobile width; the package's payload test presses it with an event, and so does this.
 */
const confirm = (p: Page) =>
  p.getByRole("button", { name: "Confirm", exact: true }).dispatchEvent("click");

/** The input showing a value, as Testing Library's getByDisplayValue finds it. */
const byValue = (p: Page, value: string) =>
  p
    .locator("input")
    .filter({ visible: true })
    .and(p.locator(`[value="${value}"]`));

/**
 * The open states, replayed on any fixture: each opens the fixture's FIRST control of its kind,
 * in document order, so a capture must open that same control in the Builder (capture.js does).
 */
export const OPENERS = {
  /** A select, multi-select, time list, datepicker calendar, datetime picker or overflow menu. */
  open: [
    ".sbk-select__control",
    ".sbk-timepicker__control",
    ".sbk-datepicker__input",
    ".sbk-datetimepicker button",
    ".sbk-overflow button",
  ].join(", "),
  /**
   * The first button or icon button with a `confirm`. Slack's capture clicks its first `c-button`,
   * which an icon button without one isn't; ours tries each in order until a dialog opens.
   */
  confirm: ".sbk-button, .sbk-icon-button",
  /** A section accessory's multi-select, which opens Slack's selection dialog. */
  dialog: ".sbk-section__accessory .sbk-select__control",
} as const;

/** Whether the reference's first field (outside its popovers) was captured with a focus ring. */
export function referenceFieldFocused(reference: Page): Promise<boolean> {
  return reference.evaluate(() => {
    const field = [...document.querySelectorAll<HTMLInputElement>("#sbk-reference input")].find(
      (input) => !input.closest("[data-sbk-layer]"),
    );
    return !!field && getComputedStyle(field).boxShadow !== "none";
  });
}

export const OPEN_STATES: Record<keyof typeof OPENERS, State> = {
  open: {
    ours: async (p, reference) => {
      const opener = p.locator(OPENERS.open).first();
      await opener.click();
      // Ours is a label, which focuses its input on any click. Slack's time picker field isn't,
      // and capture.js opens it with scripted events, so most references show it unfocused (no
      // ring, the time not selected); one opened with a real click shows Slack's ring on its
      // input. Follow the reference: take the focus off ours (the list stays open) unless the
      // reference's field has the ring.
      if (reference && (await opener.evaluate((el) => el.matches(".sbk-timepicker__control"))))
        if (!(await referenceFieldFocused(reference)))
          await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  },
  confirm: {
    ours: async (p) => {
      const dialog = p.locator('[role="alertdialog"]');
      for (const button of await p.locator(OPENERS.confirm).all()) {
        await button.click();
        if (await dialog.isVisible()) return;
        await dialog.waitFor({ timeout: 500 }).catch(() => {});
        if (await dialog.isVisible()) return;
      }
      throw new Error("no button of ours opens a confirm dialog");
    },
  },
  dialog: { ours: (p) => p.locator(OPENERS.dialog).first().click() },
};

/** Our control at a target address (targets.ts), in the message or view, or in an open layer. */
export async function ourTarget(page: Page, { kind, index }: Target): Promise<ElementHandle> {
  const handle = await page.evaluateHandle(findTarget, [OURS[kind], index, ourRoot(kind)] as [
    string,
    number,
    string | null,
  ]);
  const el = handle.asElement();
  if (!el) throw new Error(`our rendering has no ${kind}-${index}`);
  return el as ElementHandle;
}

/** Whether keyboard focus, as `:focus-visible` matches it, is on the element or inside it. */
const keyboardFocused = (el: ElementHandle) =>
  el.evaluate((node) => {
    const active = document.activeElement;
    return !!active && node.contains(active) && active.matches(":focus-visible");
  });

/**
 * Holds real input on our control, as capture.js holds it on Slack's: the pointer resting on it,
 * or keyboard focus. Focus goes where a scripted focus puts it (the control, or its first focusable
 * descendant); after a Tab press, as in the Builder, a scripted focus matches `:focus-visible`.
 */
export function inputState({ input, target }: InputState): State {
  if (input === "hover")
    return {
      keepPointer: true,
      ours: async (p) => {
        const el = await ourTarget(p, target);
        // An image's or chart's menu button takes the pointer only once its host is hovered, so the
        // first move, past the actionability checks, hovers the host and the second the button.
        await el.hover({ force: true });
        await el.hover();
      },
    };
  return {
    ours: async (p) => {
      const el = await ourTarget(p, target);
      const focus = () =>
        el.evaluate((node) => {
          const FOCUSABLE =
            'input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]';
          const el = node as Element;
          const into = el.matches(FOCUSABLE) ? el : (el.querySelector(FOCUSABLE) ?? el);
          (into as HTMLElement).focus({ preventScroll: true });
        });
      await focus();
      if (await keyboardFocused(el)) return;
      await p.keyboard.press("Tab");
      await focus();
      if (!(await keyboardFocused(el)))
        throw new Error(`our ${target.kind}-${target.index} took focus without :focus-visible`);
    },
  };
}

/** Presses a modal's submit with its fields as the payload leaves them. */
export const SUBMIT_ERRORS: State = {
  ours: async (p) => (await ourTarget(p, { kind: "submit", index: 1 })).click(),
};

/** Scrolls the first horizontal scroll container that overflows fully to the right. */
export const SCROLLED_END: State = { ours: scrollOursToEnd };

/** Whether the last step that moves the pointer is a hover. */
function hoversLast(steps: Step[]): boolean {
  const moved = steps.findLast((s) => "hover" in s || "click" in s || "scroll" in s);
  return !!moved && "hover" in moved;
}

/**
 * The replay for a reference, whatever theme and width it was captured at, or undefined. `probes`
 * are the behaviour probes (probes.ts); one with `snapshot` replays its steps.
 */
export function stateFor(name: string, probes?: Map<string, Probe>): State | undefined {
  const { fixture, interaction } = parseReferenceName(name);
  if (!interaction) return undefined;
  const input = parseInputState(interaction);
  if (input) return inputState(input);
  if (interaction === "submit-errors") return SUBMIT_ERRORS;
  if (interaction === "scrolled-end") return SCROLLED_END;
  const steps = probes && probeSnapshots(probes).get(`${fixture}@${interaction}`);
  if (steps)
    return {
      ours: (p) => runSteps(p, steps),
      // A hover is part of the state until a click or scroll moves the pointer; a wait or a key
      // after it (hover → wait for the tooltip → snapshot) leaves it where it is.
      keepPointer: hoversLast(steps),
    };
  return (
    STATES[`${fixture}@${interaction}`] ??
    (interaction in OPEN_STATES ? OPEN_STATES[interaction as keyof typeof OPENERS] : undefined)
  );
}
