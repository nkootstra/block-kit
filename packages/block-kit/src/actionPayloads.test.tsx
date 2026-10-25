/**
 * Checks the `block_actions` payloads block-kit builds against the ones Block Kit Builder's
 * Actions Preview showed for the same interaction, recorded as `fixtures/<fixture>@<interaction>.actions.json`
 * (maintainer-owned, like the reference snapshots; see tools/visual/README.md).
 *
 * Compared: `type`, `enterprise`, `is_enterprise_install`, `actions` and `state.values`. Not
 * compared: identity (redacted in the recordings), `action_ts`, Slack's generated block ids,
 * and `container`/`message`/`channel`, which the Builder only simulates.
 *
 * Every difference that remains is listed in KNOWN_DIFFERENCES, so the check fails both on a
 * new difference and on a listed one that no longer happens: a fix removes its entries. A
 * recording block-kit sends nothing for yet is listed in KNOWN_UNSENT, the same way.
 *
 * A recording made by a behaviour probe (`<fixture>@<probe>.probe.json` next to it, see
 * tools/visual/src/probes.ts) needs no INTERACTIONS entry: its steps are replayed here. Recordings
 * of a view's events (`view_submission`, `view_closed`) aren't compared until this test renders
 * views.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type Resolvers, type StateValues } from "./context";
import { CHARACTER_DISPATCH_DELAY } from "./elements/characterDispatch";
import { clickAsync, keyDownAsync } from "./elements/test-utils";
import { Message } from "./Message";
import type { BlockActionsPayload } from "./payloads";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The repository's fixtures/ folder: the nearest one above where the tests run. */
function fixturesDir(): string {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    try {
      readdirSync(join(dir, "fixtures"));
      return join(dir, "fixtures") + "/";
    } catch {
      if (dirname(dir) === dir) throw new Error("fixtures/ not found");
    }
  }
}

const FIXTURES = fixturesDir();
const GENERATED = "<block_id>";

/** What the user does in the recording, named after the part after `@`. */
const INTERACTIONS: Record<string, () => Promise<void>> = {
  "catalog/actions/button@click": () =>
    clickAsync(screen.getByRole("button", { name: "Click Me" })),
  "extra/actions/more-elements@confirm-delete": async () => {
    await clickAsync(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    await clickAsync(
      [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Delete")!,
    );
  },
  "catalog/actions/all-selects@pick-static": async () => {
    fireEvent.click(screen.getByPlaceholderText("Select an item"));
    await clickAsync(screen.getByText("*plain_text option 1*"));
  },
  "catalog/actions/radio-buttons@pick": () => clickAsync(screen.getAllByRole("radio")[1]!),
  "catalog/actions/checkboxes@check-first": () => clickAsync(screen.getAllByRole("checkbox")[0]!),
  // Re-recorded in the dark mobile sitting, picking the second item ("option 1").
  "catalog/section/overflow@pick": async () => {
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    await clickAsync(screen.getByText("*plain_text option 1*"));
  },
  // Slack opens a "Select options" dialog and dispatches on Confirm; block-kit's menu is inline.
  "catalog/section/multi-static-select@pick-confirm": async () => {
    // As a section accessory it opens Slack's "Select options" dialog and sends on Confirm.
    fireEvent.click(screen.getByRole("button", { name: "Select options" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("combobox"));
    await clickAsync(screen.getByRole("option", { name: "*plain_text option 1*" }));
    await clickAsync(screen.getByRole("button", { name: "Confirm" }));
  },
  "catalog/actions/datepickers@pick-15th": async () => {
    fireEvent.click(screen.getAllByPlaceholderText("Select a date")[0]!);
    await clickAsync(screen.getByText("15"));
  },
  "catalog/actions/timepicker@pick-3pm": async () => {
    fireEvent.click(screen.getByDisplayValue("1:37 PM"));
    await clickAsync(screen.getByRole("option", { name: "3:00 PM" }));
  },
  "catalog/input/dispatches-actions@enter": async () => {
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    await keyDownAsync(input, "Enter");
  },
  "extra/payloads/buttons@click-plain": () =>
    clickAsync(screen.getByRole("button", { name: "Plain" })),
  "extra/payloads/buttons@click-primary": () =>
    clickAsync(screen.getByRole("button", { name: "Approve" })),
  "extra/payloads/buttons@click-danger": () =>
    clickAsync(screen.getByRole("button", { name: "Deny" })),
  "extra/payloads/buttons@click-url": () => clickAsync(screen.getByText("Open link")),
  "extra/payloads/overflow-url@pick-link": async () => {
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    await clickAsync(screen.getByText("Open docs"));
  },
  "extra/payloads/selects@change-single": async () => {
    fireEvent.click(screen.getAllByRole("combobox")[0]!);
    await clickAsync(screen.getByRole("option", { name: "Bravo" }));
  },
  "extra/payloads/selects@keyboard-single": async () => {
    const field = screen.getAllByRole("combobox")[0]!;
    fireEvent.click(field);
    await keyDownAsync(field, "ArrowDown");
    await keyDownAsync(field, "ArrowDown");
    await keyDownAsync(field, "Enter");
  },
  "extra/payloads/selects@pick-accessory": async () => {
    fireEvent.click(screen.getAllByRole("combobox")[1]!);
    await clickAsync(screen.getByRole("option", { name: "Two" }));
  },
  "extra/payloads/selects@pick-multi": () => pickColours("Red"),
  "extra/payloads/selects@pick-two-multi": () => pickColours("Red", "Green"),
  "extra/payloads/selects@remove-chip-multi": async () => {
    await pickColours("Red", "Green");
    await clickAsync(screen.getByRole("button", { name: /Remove Green/ }));
  },
  "extra/payloads/pickers@pick-date-accessory": async () => {
    fireEvent.click(screen.getAllByRole("textbox", { name: "Date" })[0]!);
    await clickAsync(screen.getByRole("button", { name: /April 15th, 1990/ }));
  },
  "extra/payloads/pickers@type-time": async () => {
    const field = screen.getAllByRole("combobox")[0]!;
    fireEvent.click(field);
    fireEvent.change(field, { target: { value: "3:15 pm" } });
    await keyDownAsync(field, "Enter");
  },
  "extra/payloads/pickers@pick-datetime-date": async () => {
    fireEvent.click(screen.getByDisplayValue("January 1st, 2026"));
    await clickAsync(screen.getByRole("button", { name: /January 15th, 2026/ }));
  },
  "extra/payloads/pickers@pick-datetime-time": async () => {
    fireEvent.click(screen.getAllByRole("combobox").at(-1)!);
    await clickAsync(screen.getByRole("option", { name: "3:00 PM" }));
  },
  "extra/payloads/pickers@clear-datetime": async () => {
    fireEvent.click(screen.getAllByRole("combobox").at(-1)!);
    await clickAsync(screen.getByRole("option", { name: "Clear selection" }));
  },
  "extra/payloads/choices@uncheck-initial": () =>
    clickAsync(screen.getByRole("checkbox", { name: "Email" })),
  "extra/payloads/choices@check-with-description": () =>
    clickAsync(screen.getByRole("checkbox", { name: /SMS/ })),
  "extra/payloads/choices@pick-radio-mrkdwn": () =>
    clickAsync(screen.getByRole("radio", { name: "High" })),
  "extra/payloads/choices@check-accessory": () =>
    clickAsync(screen.getByRole("checkbox", { name: "Notify me" })),
  "extra/payloads/dispatch-inputs@enter-number": async () => {
    const input = screen.getByPlaceholderText("Enter a number");
    fireEvent.change(input, { target: { value: "42" } });
    await keyDownAsync(input, "Enter");
  },
  "extra/payloads/dispatch-inputs@type-characters": async () => {
    const input = screen.getAllByRole("textbox").at(-1)!;
    await act(async () => {
      fireEvent.change(input, { target: { value: "h" } });
      fireEvent.change(input, { target: { value: "hi" } });
      // Slack sends one action once typing pauses (CHARACTER_DISPATCH_DELAY).
      await new Promise((resolve) => setTimeout(resolve, CHARACTER_DISPATCH_DELAY + 50));
    });
  },
  "catalog/actions/all-selects@pick": async () => {
    // The static select (actionId-3), as in all-selects@pick-static.
    fireEvent.click(screen.getByPlaceholderText("Select an item"));
    await clickAsync(screen.getByText("*plain_text option 1*"));
  },
  // The first channel the Builder's workspace lists (redacted to C0000001; PROVIDER).
  "extra/actions/more-elements@pick": async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Pick a channel" }));
    await clickAsync(screen.getByRole("option", { name: /channel-one/ }));
  },
  // The channels select's second row, "channel-two" (redacted to C0000001; PROVIDER), under
  // its initial channel.
  "catalog/actions/selects-with-initial-options@pick": async () => {
    fireEvent.click(screen.getAllByRole("combobox")[2]!);
    await clickAsync(screen.getByRole("option", { name: /channel-two/ }));
  },
  "catalog/container/data-entry-form@pick": async () => {
    fireEvent.click(screen.getByPlaceholderText("Select priority"));
    await clickAsync(screen.getByRole("option", { name: "High" }));
  },
  "catalog/input/radio-buttons@pick": () =>
    clickAsync(screen.getByRole("radio", { name: "*plain_text option 1*" })),
  "extra/fidelity/channels-select/long-content@pick": async () => {
    fireEvent.click(screen.getByRole("combobox", { name: /^This sentence is here/ }));
    await clickAsync(screen.getByRole("option", { name: /channel-one/ }));
  },
  // ArrowDown from 1:37 PM, which isn't a list entry, then Enter.
  "catalog/actions/timepicker@pick": async () => {
    const field = screen.getByDisplayValue("1:37 PM");
    field.focus();
    fireEvent.click(field);
    await keyDownAsync(field, "ArrowDown");
    await keyDownAsync(field, "Enter");
  },
  "catalog/input/static-select@pick": async () => {
    fireEvent.click(screen.getByPlaceholderText("Select an item"));
    await clickAsync(screen.getByRole("option", { name: "*plain_text option 1*" }));
  },
  "catalog/section/radio-buttons@pick": () =>
    clickAsync(screen.getByRole("radio", { name: "*plain_text option 1*" })),
  // The long first checkbox; SMS is checked from the start.
  "extra/fidelity/checkboxes/long-content@pick": () =>
    clickAsync(screen.getAllByRole("checkbox")[0]!),
  "extra/fidelity/confirm/long-content@pick": async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Pick a channel" }));
    await clickAsync(screen.getByRole("option", { name: /channel-one/ }));
  },
  // Slackbot, redacted to U0000001 (PROVIDER), in the users select.
  "extra/fidelity/users-select/long-content@pick": async () => {
    fireEvent.click(screen.getByRole("combobox", { name: /^This sentence is here/ }));
    await clickAsync(screen.getByRole("option", { name: /Slackbot/ }));
  },
  "catalog/agents/message-feedback@pick": () => clickAsync(screen.getAllByRole("radio")[0]!),
  "catalog/input/multi-static-select@pick": async () => {
    fireEvent.click(document.querySelector<HTMLElement>(".sbk-input .sbk-select__control")!);
    await clickAsync(screen.getByRole("option", { name: "*plain_text option 1*" }));
  },
  // The first channel (redacted to C0000001; PROVIDER) in the "Select channels" dialog.
  "extra/payloads/accessory-multi-selects@pick": async () => {
    fireEvent.click(screen.getByRole("button", { name: "Select channels" }));
    const field = within(screen.getByRole("dialog")).getByRole("combobox");
    field.focus();
    fireEvent.click(field);
    await keyDownAsync(field, "ArrowDown");
    await keyDownAsync(field, "Enter");
    await clickAsync(screen.getByRole("button", { name: "Confirm" }));
  },
  // ArrowDown from 1:37 PM, which isn't a list entry, then Enter.
  "extra/payloads/pickers@pick": async () => {
    const field = screen.getByDisplayValue("1:37 PM");
    field.focus();
    fireEvent.click(field);
    await keyDownAsync(field, "ArrowDown");
    await keyDownAsync(field, "Enter");
  },
  "catalog/actions/datepickers@pick": async () => {
    fireEvent.click(screen.getAllByPlaceholderText("Select a date")[0]!);
    await clickAsync(screen.getByRole("button", { name: /April 15th, 1990/ }));
  },
  // "Tomorrow" in the calendar, the day after the recording (NOW); Slack fills the empty time
  // with the current one.
  "extra/fidelity/datetimepicker/empty@pick": async () => {
    fireEvent.click(screen.getByRole("textbox", { name: "Date" }));
    await clickAsync(screen.getByRole("button", { name: /October 15th, 2026/ }));
  },
  // The first private conversation (redacted to C0000001; PROVIDER).
  "catalog/actions/filtered-conversations-select@pick": async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Select private conversation" }));
    await clickAsync(screen.getByRole("option", { name: /private-one/ }));
  },
  // Slackbot, redacted to U0000001 (PROVIDER).
  "catalog/section/users-select@pick": async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Select a user" }));
    await clickAsync(screen.getByRole("option", { name: /Slackbot/ }));
  },
  "contexts/multi_users_select/accessory@pick": () => dialogPick("Select users", /Slackbot/),
  "catalog/section/multi-conversations-select@pick": () =>
    dialogPick("Select conversations", /Slackbot/),
  // The long first option of the overflow menu.
  "extra/fidelity/option/long-content@pick": async () => {
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    await clickAsync(screen.getByText(/^This sentence is here/));
  },
  "catalog/section/multi-static-select@pick": () =>
    dialogPick("Select options", /plain_text option 0/),
  // Slackbot, redacted to U0000001 (PROVIDER), in the conversations select.
  "extra/input/more-selects@pick": async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Select a conversation" }));
    await clickAsync(screen.getByRole("option", { name: /Slackbot/ }));
  },
  // Slackbot, redacted to U0000001 (PROVIDER).
  "catalog/input/multi-users-select@pick": async () => {
    fireEvent.click(document.querySelector<HTMLElement>(".sbk-input .sbk-select__control")!);
    await clickAsync(screen.getByRole("option", { name: /Slackbot/ }));
  },
  // January 14th, 2026 in the calendar, keeping the initial 11:00 AM.
  "contexts/datetimepicker/actions@pick": async () => {
    fireEvent.click(screen.getByDisplayValue("January 1st, 2026"));
    await clickAsync(screen.getByRole("button", { name: /January 14th, 2026/ }));
  },
  "contexts/multi_static_select/accessory@pick": () => dialogPick("Select items", /^Option 1$/),
  // The first channel (redacted to C0000001; PROVIDER).
  "extra/fidelity/multi-channels-select/empty@pick": async () => {
    fireEvent.click(document.querySelector<HTMLElement>(".sbk-input .sbk-select__control")!);
    await clickAsync(screen.getByRole("option", { name: /channel-one/ }));
  },
  // Slackbot (redacted to U0000001; PROVIDER) added next to the initial conversation.
  "extra/fidelity/multi-conversations-select/initial-value@pick": () =>
    dialogPick(/1 selected/, /Slackbot/),
  // Option 1 in the Required modal's first ("Static") multi-select.
  "extra/modal/required-multi-selects@pick": async () => {
    fireEvent.click(document.querySelector<HTMLElement>(".sbk-input .sbk-select__control")!);
    await clickAsync(screen.getByRole("option", { name: "Option 1" }));
  },
  "extra/context-actions/feedback-row@pick-positive": () =>
    clickAsync(screen.getByRole("radio", { name: "Good response" })),
  "extra/context-actions/feedback-row@click-icon": () =>
    clickAsync(screen.getByRole("button", { name: "Remove this response" })),
};

/**
 * Our controls by kind, as tools/visual/src/targets.ts OURS addresses them (`button-2` is the
 * second `.sbk-button`, outermost matches only); targets.test.ts keeps the two in step.
 */
const OURS: Record<string, string> = {
  button: ".sbk-button",
  overflow: ".sbk-overflow__button",
  field:
    ".sbk-select__control, .sbk-timepicker__control, .sbk-datepicker__input, .sbk-datetimepicker__control",
  checkbox: ".sbk-checkboxes__input",
  radio: ".sbk-radio-buttons__input",
  input: ".sbk-text-input",
  submit: ".sbk-modal__button--primary",
  cancel: ".sbk-modal__button--secondary",
  link: "a.sbk-link",
  mention:
    ".sbk-mention, .sbk-mention--broadcast, .sbk-mention--private, .sbk-mention--unresolved, .sbk-mention--missing",
  card: ".sbk-card",
  arrow:
    '.sbk-carousel button[aria-label="Scroll left"], .sbk-carousel button[aria-label="Scroll right"]',
  menu: ".sbk-hover-actions--image .sbk-hover-actions__menu-root > .sbk-hover-actions__button, .sbk-hover-actions--chart .sbk-hover-actions__menu-root > .sbk-hover-actions__button",
  column: ".sbk-data-table__col-header button",
  cell: ".sbk-data-table__cell",
  cellexpand: ".sbk-data-table__expand",
  page: ".sbk-data-table__pagination button",
  more: ".sbk-section__toggle",
  action: ".sbk-message-actions__button",
  option: '.sbk-popover [role="option"], .sbk-select-dialog [role="option"]',
  menuitem: '.sbk-popover [role="menuitem"], .sbk-popover [role="menuitemradio"]',
  confirm: ".sbk-confirm__button:not(.sbk-confirm__button--deny)",
  deny: ".sbk-confirm__button--deny",
  richtext: ".sbk-rich-text-input__editor",
  file: ".sbk-file-input__button",
  icon: '.sbk-icon-button:not([role="radio"])',
  feedback: ".sbk-feedback-buttons .sbk-icon-button",
  collapse: ".sbk-container__header--button",
  pill: ".sbk-plan__pill, button.sbk-task-card__pill",
  task: "button.sbk-plan__task-header",
  contact: ".sbk-contact-card",
  expand: ".sbk-image__toggle",
  source: ".sbk-plan__task-source-link, .sbk-task-card__source-link",
  sender: ".sbk-message__sender",
  time: ".sbk-message__time",
  scroller: "@scroller",
  video: "a.sbk-video__frame",
  tooltip: ".sbk-tooltip",
  chip: ".sbk-select__chip",
};

/** As tools/visual/src/probes.ts IMPLICIT_ROLES: the role an element has by its tag. */
const IMPLICIT_ROLES: Record<string, string> = {
  link: "a[href]",
  button: "button",
  checkbox: 'input[type="checkbox"]',
  radio: 'input[type="radio"]',
  textbox: 'textarea, input:not([type]), input[type="text"]',
};

type ProbeTarget = string | { role: string; name: string };
type ProbeStep =
  | { click: ProbeTarget }
  | { hover: ProbeTarget }
  | { key: string }
  | { type: string }
  | { wait: number };

function probeTarget(target: ProbeTarget): HTMLElement {
  if (typeof target === "string") {
    const [, kind = "", index = "1"] = /^([a-z]+)-(\d+)$/.exec(target) ?? [];
    // jsdom has no layout, so nothing scrolls (the scroller kind).
    const selector = OURS[kind] && OURS[kind] !== "@scroller" ? OURS[kind] : ":not(*)";
    const all = [...document.querySelectorAll<HTMLElement>(selector)];
    const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    const el = outer[Number(index) - 1];
    if (!el) throw new Error(`no ${target}`);
    return el;
  }
  const implicit = IMPLICIT_ROLES[target.role];
  const selector = `[role="${target.role}"]${implicit ? `, ${implicit}` : ""}`;
  const el = [...document.querySelectorAll<HTMLElement>(selector)].find(
    (e) =>
      (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim() ===
      target.name,
  );
  if (!el) throw new Error(`no ${target.role} "${target.name}"`);
  return el;
}

/** What a browser's Tab moves the focus through, in document order (tabindex -1 left out). */
const TABBABLE =
  'input:not([disabled]):not([type="hidden"]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]';

/**
 * A key press with the default action a browser adds and jsdom doesn't: Space clicks a focused
 * checkbox, radio or button, Tab (Shift+Tab) moves the focus to the next (previous) control in
 * tab order, and an arrow key moves a radio group's choice to the next (previous) radio. Without them a recording made with the keyboard (contexts/checkboxes/actions@space)
 * replays as a click and nothing else. A handler that prevents the key's default keeps it.
 */
async function pressKey(el: HTMLElement, combo: string) {
  const parts = combo.split("+");
  const key = parts.at(-1) === "Space" ? " " : parts.at(-1)!;
  const shiftKey = parts.includes("Shift");
  let allowed = true;
  await act(async () => {
    allowed = fireEvent.keyDown(el, { key, shiftKey });
  });
  if (!allowed) return;
  if (key === " " && el.matches('input[type="checkbox"], input[type="radio"], button'))
    await clickAsync(el);
  else if (/^Arrow(Up|Down|Left|Right)$/.test(key) && el.matches('input[type="radio"]')) {
    const group = [
      ...document.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${(el as HTMLInputElement).name}"]`,
      ),
    ];
    const step = key === "ArrowDown" || key === "ArrowRight" ? 1 : -1;
    const next =
      group[(group.indexOf(el as HTMLInputElement) + step + group.length) % group.length];
    if (next) {
      await act(async () => next.focus());
      await clickAsync(next);
    }
  } else if (key === "Tab") {
    const order = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter(
      (e) => e.tabIndex >= 0,
    );
    const next = order[order.indexOf(el) + (shiftKey ? -1 : 1)];
    await act(async () => next?.focus());
  }
}

/** Replays a probe's steps, as tools/visual/src/probes.ts does in a browser. */
function probeInteraction(name: string): (() => Promise<void>) | undefined {
  let steps: ProbeStep[];
  try {
    steps = JSON.parse(readFileSync(`${FIXTURES}${name}.probe.json`, "utf8")).steps;
  } catch {
    return undefined;
  }
  return async () => {
    for (const step of steps) {
      const at = () => (document.activeElement as HTMLElement | null) ?? document.body;
      if ("click" in step) {
        const el = probeTarget(step.click);
        // A click focuses what it lands on, or a label's control (ours wraps a time picker's
        // input in its label); jsdom does neither.
        const focusable = el.matches(TABBABLE)
          ? el
          : (el.querySelector<HTMLElement>(TABBABLE) ?? el);
        focusable.focus();
        await clickAsync(el);
      } else if ("hover" in step) fireEvent.mouseEnter(probeTarget(step.hover));
      else if ("key" in step) await pressKey(at(), step.key);
      else if ("type" in step) {
        const field = at() as HTMLInputElement;
        fireEvent.change(field, { target: { value: `${field.value ?? ""}${step.type}` } });
      } else
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, step.wait));
        });
    }
  };
}

const interactionFor = (name: string) => INTERACTIONS[name] ?? probeInteraction(name);

/**
 * Picks `option` in a section accessory multi-select's dialog, opened from its button (the
 * placeholder, or the "N selected" count once something is picked), then confirms.
 */
async function dialogPick(placeholder: string | RegExp, option: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: placeholder }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("combobox"));
  await clickAsync(screen.getByRole("option", { name: option }));
  await clickAsync(screen.getByRole("button", { name: "Confirm" }));
}

/** Picks options from the "Colours" multi-select in its input block. */
async function pickColours(...names: string[]) {
  for (const name of names) {
    // The list stays open after a pick, as Slack's does; open it only when it isn't.
    if (!screen.queryByRole("option", { name: new RegExp(name) })) {
      fireEvent.click(document.querySelector<HTMLElement>(".sbk-input button")!);
    }
    await clickAsync(screen.getByRole("option", { name: new RegExp(name) }));
  }
}

/**
 * Provider settings a recording depends on. The Builder that recorded the date and time pickers
 * ran in Europe/Amsterdam, which `selected_date_time` is computed in.
 */
/**
 * The Builder workspace's members and channels, as the recordings redact them (U0000001, the
 * first member; C0000001, the first channel), for the directory selects' probes.
 */
const workspace: Resolvers = {
  directory: (source) =>
    source === "channels"
      ? [{ type: "channel", id: "C0000001", name: "channel-one" }]
      : [{ type: "user", id: "U0000001", name: "User One" }],
};

/** The clock a recording depends on: the moment it was made (a relative date, an empty time). */
const NOW: Record<string, string> = {
  "extra/fidelity/datetimepicker/empty@pick": "2026-10-14T10:09:00Z",
};
/** Fakes Date (only Date: the tests' timers stay real) at the recording's moment. */
function freeze(name: string) {
  const now = NOW[name];
  if (!now) return;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
}

const slackbot: Resolvers = {
  directory: () => [{ type: "user", id: "U0000001", name: "Slackbot" }],
};

const PROVIDER: Record<string, { timeZone?: string; resolvers?: Resolvers }> = {
  "extra/fidelity/datetimepicker/empty@pick": { timeZone: "Europe/Amsterdam" },
  "catalog/actions/filtered-conversations-select@pick": {
    resolvers: {
      directory: () => [{ type: "channel", id: "C0000001", name: "private-one", private: true }],
    },
  },
  "catalog/section/users-select@pick": { resolvers: slackbot },
  "contexts/multi_users_select/accessory@pick": { resolvers: slackbot },
  "catalog/section/multi-conversations-select@pick": { resolvers: slackbot },
  "extra/fidelity/multi-conversations-select/initial-value@pick": { resolvers: slackbot },
  "extra/input/more-selects@pick": { resolvers: slackbot },
  "catalog/input/multi-users-select@pick": { resolvers: slackbot },
  "contexts/users_select/actions@pick": { resolvers: slackbot },
  "contexts/conversations_select/actions@pick": { resolvers: slackbot },
  "contexts/channels_select/actions@pick": { resolvers: workspace },
  "extra/actions/more-elements@pick": { resolvers: workspace },
  "extra/fidelity/channels-select/long-content@pick": { resolvers: workspace },
  "extra/fidelity/confirm/long-content@pick": { resolvers: workspace },
  "extra/payloads/accessory-multi-selects@pick": { resolvers: workspace },
  "extra/fidelity/users-select/long-content@pick": {
    resolvers: {
      directory: (source) =>
        source === "users" ? [{ type: "user", id: "U0000001", name: "Slackbot" }] : [],
    },
  },
  "catalog/actions/selects-with-initial-options@pick": {
    resolvers: {
      directory: (source) =>
        source === "channels"
          ? [
              { type: "channel", id: "C12345678", name: "general" },
              { type: "channel", id: "C0000001", name: "channel-two" },
            ]
          : [],
    },
  },
  "extra/payloads/accessory-multi-selects@pick-confirm-users": { resolvers: slackbot },
  "extra/payloads/accessory-multi-selects@pick-confirm-channels": { resolvers: workspace },
  "extra/payloads/accessory-multi-selects@pick-confirm-conversations": { resolvers: slackbot },
  "contexts/datetimepicker/actions@pick": { timeZone: "Europe/Amsterdam" },
  "extra/fidelity/multi-channels-select/empty@pick": { resolvers: workspace },
  "extra/payloads/pickers@pick-datetime-date": { timeZone: "Europe/Amsterdam" },
  "extra/payloads/pickers@pick-datetime-time": { timeZone: "Europe/Amsterdam" },
  "extra/payloads/pickers@clear-datetime": { timeZone: "Europe/Amsterdam" },
  "contexts/datetimepicker/actions@keyboard": { timeZone: "Europe/Amsterdam" },
};

/**
 * Differences between block-kit and the recordings, as `path: Slack <value>, ours <value>`.
 * Remove an entry when a change makes block-kit match Slack there.
 */
const KNOWN_DIFFERENCES: Record<string, string[]> = {
  // Block Kit Builder leaves a link button's url out of the action, but Bolt's ButtonAction
  // declares `url?: string`, so real Slack may send it. Kept until a real app's payload settles it.
  "extra/payloads/buttons@click-url": ['actions.0.url: Slack missing, ours "https://example.com"'],
};

/**
 * Recordings block-kit sends nothing for yet, with why. The test fails once it does send, so a fix
 * moves the recording back to a full comparison.
 */
const KNOWN_UNSENT: Record<string, string> = {
  // Block Kit Builder sends block_actions from an input block's element without
  // `dispatch_action`; ours follows Slack's docs and doesn't (fidelity finding
  // input-block-dispatch).
  "catalog/input/radio-buttons@pick": "an input block without dispatch_action sends nothing",
  "catalog/container/data-entry-form@pick": "an input block without dispatch_action sends nothing",
  "catalog/input/static-select@pick": "an input block without dispatch_action sends nothing",
  "catalog/input/multi-static-select@pick": "an input block without dispatch_action sends nothing",
  // The same in a modal's input blocks: the Builder dispatched block_actions there too.
  "extra/modal/required-multi-selects@pick": "an input block without dispatch_action sends nothing",
  "extra/input/more-selects@pick": "an input block without dispatch_action sends nothing",
  "catalog/input/multi-users-select@pick": "an input block without dispatch_action sends nothing",
  "extra/fidelity/multi-channels-select/empty@pick":
    "an input block without dispatch_action sends nothing",
  "contexts/multi_static_select/modal-input@add-remove":
    "an input block without dispatch_action sends nothing",
};

interface Recording {
  name: string;
  slack: Record<string, unknown>;
}

function recordings(): Recording[] {
  const out: Recording[] = [];
  for (const path of readdirSync(FIXTURES, { recursive: true, encoding: "utf8" })) {
    if (!path.endsWith(".actions.json")) continue;
    out.push({
      name: path.replace(/\.actions\.json$/, ""),
      slack: JSON.parse(readFileSync(FIXTURES + path, "utf8")),
    });
  }
  return out.toSorted((a, b) => a.name.localeCompare(b.name));
}

function fixtureBlocks(name: string) {
  const json = JSON.parse(readFileSync(`${FIXTURES}${name.split("@")[0]}.json`, "utf8"));
  return Array.isArray(json) ? json : json.blocks;
}

/** The compared part of a payload, with Slack's generated block ids and timestamps masked. */
function comparable(
  payload: Record<string, unknown>,
  generated: boolean,
  initial: StateValues,
  slackState: StateValues,
) {
  const actions = (payload.actions as Record<string, unknown>[]).map((action) => {
    const { action_ts: _ts, ...rest } = action;
    return generated ? { ...rest, block_id: GENERATED } : rest;
  });
  const values: StateValues = {};
  const state = (payload.state as { values?: StateValues } | undefined)?.values ?? {};
  for (const [blockId, elements] of Object.entries(state)) {
    for (const [actionId, value] of Object.entries(elements)) {
      const key = generated ? GENERATED : blockId;
      // Slack's state holds only what the user changed; block-kit also reports initial values
      // from mount. That difference is deliberate until it's verified against a real app, so an
      // entry Slack doesn't have is dropped when it's still the initial value.
      const unchangedInitial =
        JSON.stringify(initial[blockId]?.[actionId]) === JSON.stringify(value);
      if (!slackState[key]?.[actionId] && unchangedInitial) continue;
      (values[key] ??= {})[actionId] = value;
    }
  }
  return {
    type: payload.type,
    enterprise: payload.enterprise,
    is_enterprise_install: payload.is_enterprise_install,
    actions,
    state: { values },
  };
}

const isObject = (v: unknown) => typeof v === "object" && v !== null;
const show = (v: unknown) => (v === undefined ? "missing" : JSON.stringify(v));

/** Leaf-level differences between two JSON values, as `path: Slack <a>, ours <b>`. */
function differences(slack: unknown, ours: unknown, path = ""): string[] {
  if (JSON.stringify(slack) === JSON.stringify(ours)) return [];
  if (isObject(slack) && isObject(ours) && Array.isArray(slack) === Array.isArray(ours)) {
    const keys = new Set([...Object.keys(slack as object), ...Object.keys(ours as object)]);
    return [...keys].flatMap((key) =>
      differences(
        (slack as Record<string, unknown>)[key],
        (ours as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
      ),
    );
  }
  return [`${path}: Slack ${show(slack)}, ours ${show(ours)}`];
}

describe("block_actions payloads match Block Kit Builder's Actions Preview", () => {
  const everything = recordings();
  const all = everything.filter((r) => r.slack.type === "block_actions");

  it("has an interaction for every recording", () => {
    // Views aren't rendered here yet, so their events are recorded but not compared.
    expect(
      everything
        .filter((r) => !all.includes(r))
        .filter((r) => !["view_submission", "view_closed"].includes(r.slack.type as string)),
    ).toEqual([]);
    expect(all.map((r) => r.name).filter((name) => !interactionFor(name))).toEqual([]);
    expect(Object.keys(KNOWN_DIFFERENCES).filter((n) => !all.some((r) => r.name === n))).toEqual(
      [],
    );
    expect(Object.keys(KNOWN_UNSENT).filter((n) => !all.some((r) => r.name === n))).toEqual([]);
  });

  for (const name of Object.keys(KNOWN_UNSENT))
    it(`${name} still sends nothing: ${KNOWN_UNSENT[name]}`, async () => {
      let payload: BlockActionsPayload | undefined;
      freeze(name);
      render(
        <BlockKitProvider {...PROVIDER[name]} onPayload={(p) => (payload = p)}>
          <Message blocks={fixtureBlocks(name)} />
        </BlockKitProvider>,
      );
      await interactionFor(name)!();
      expect(payload).toBeUndefined();
    });

  for (const { name, slack } of all.filter((r) => !(r.name in KNOWN_UNSENT))) {
    it(`${name} sends what Slack sends`, async () => {
      let payload: BlockActionsPayload | undefined;
      let initial: StateValues = {};
      freeze(name);
      render(
        <BlockKitProvider
          {...PROVIDER[name]}
          onPayload={(p) => (payload = p)}
          onStateChange={(s) => {
            if (!payload) initial = s;
          }}
        >
          <Message blocks={fixtureBlocks(name)} />
        </BlockKitProvider>,
      );
      await interactionFor(name)!();
      expect(payload, "no block_actions payload was dispatched").toBeDefined();

      const slackActions = slack.actions as { block_id: string }[];
      const generated = slackActions[0]!.block_id === GENERATED;
      const slackState = (slack.state as { values: StateValues }).values;
      const theirs = comparable(slack, false, {}, slackState);
      const ours = comparable(
        payload as unknown as Record<string, unknown>,
        generated,
        initial,
        slackState,
      );
      expect(differences(theirs, ours).toSorted()).toEqual(
        (KNOWN_DIFFERENCES[name] ?? []).toSorted(),
      );
    });

    it(`${name} hands onAction the action the payload sends`, async () => {
      let payload: BlockActionsPayload | undefined;
      let action: unknown;
      freeze(name);
      render(
        <BlockKitProvider
          {...PROVIDER[name]}
          onAction={(a) => (action = a)}
          onPayload={(p) => (payload = p)}
        >
          <Message blocks={fixtureBlocks(name)} />
        </BlockKitProvider>,
      );
      await interactionFor(name)!();
      expect(action).toEqual(payload?.actions[0]);
    });
  }
});
