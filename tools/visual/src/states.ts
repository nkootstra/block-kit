/**
 * How compare.ts reaches a captured state on our rendering (see names.ts for reference names).
 * `ours` clicks through our rendering the way the reference was clicked through in Block Kit
 * Builder; `reference` restores what a DOM snapshot can't record, such as a scroll offset.
 */
import type { ElementHandle, Page } from "playwright";
import { type InputState, parseInputState, parseReferenceName } from "./names";
import { type Probe, probeSnapshots, runSteps } from "./probes";
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
    return { keepPointer: true, ours: async (p) => (await ourTarget(p, target)).hover() };
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
      // A hover just before the snapshot is part of the state.
      keepPointer: !!steps.at(-1) && "hover" in steps.at(-1)!,
    };
  return (
    STATES[`${fixture}@${interaction}`] ??
    (interaction in OPEN_STATES ? OPEN_STATES[interaction as keyof typeof OPENERS] : undefined)
  );
}
