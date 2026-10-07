/**
 * How compare.ts reaches a captured state on our rendering (see names.ts for reference names).
 * `ours` clicks through our rendering the way the reference was clicked through in Block Kit
 * Builder; `reference` restores what a DOM snapshot can't record, such as a scroll offset.
 */
import type { Page } from "playwright";
import { parseReferenceName } from "./names";

export interface State {
  ours: (page: Page) => Promise<void>;
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

export const OPEN_STATES: Record<keyof typeof OPENERS, State> = {
  open: { ours: (p) => p.locator(OPENERS.open).first().click() },
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
