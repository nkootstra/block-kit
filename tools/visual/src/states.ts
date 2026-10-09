/**
 * How compare.ts reaches a captured state on our rendering (see names.ts for reference names).
 * `ours` clicks through our rendering the way the reference was clicked through in Block Kit
 * Builder; `reference` restores what a DOM snapshot can't record, such as a scroll offset.
 */
import type { Page } from "playwright";
import { parseReferenceName } from "./names";

export interface State {
  /** `reference` is the reference's page, open on its own when the state has a popover. */
  ours: (page: Page, reference?: Page) => Promise<void>;
  reference?: (page: Page) => Promise<void>;
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
};

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
  /** The first button: put the `confirm` on it. */
  confirm: ".sbk-button",
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
  confirm: { ours: (p) => p.locator(OPENERS.confirm).first().click() },
  dialog: { ours: (p) => p.locator(OPENERS.dialog).first().click() },
};

/** The replay for a reference, whatever theme and width it was captured at, or undefined. */
export function stateFor(name: string): State | undefined {
  const { fixture, interaction } = parseReferenceName(name);
  if (!interaction) return undefined;
  return (
    STATES[`${fixture}@${interaction}`] ??
    (interaction in OPEN_STATES ? OPEN_STATES[interaction as keyof typeof OPENERS] : undefined)
  );
}
