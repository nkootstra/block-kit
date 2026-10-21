/**
 * Which facts each group of interaction tests (../interaction/interaction.browser.ts) asserts
 * against Slack's values, by its top-level `describe` title. The generator fails when a title here
 * isn't in the test file, or the test file has a group this doesn't list, so the mapping can't
 * silently drift.
 */
import type { FactKind, StateId, Theme, Width } from "./axes";

export interface TestFacts {
  components: string[];
  states: StateId[];
  facts: FactKind[];
  /** Light only unless listed; facts that don't vary by theme ignore it. */
  themes?: Theme[];
  widths?: Width[];
}

const BOTH: Theme[] = ["light", "dark"];
const SELECTS = ["static_select", "external_select", "multi_static_select"];
const DIRECTORY = ["users_select", "conversations_select", "channels_select", "multi_users_select"];
const TEXT_INPUTS = [
  "plain_text_input",
  "email_text_input",
  "url_text_input",
  "number_input",
  "rich_text_input",
];

/**
 * Groups whose facts lie outside the inventory's axes (touch screens, forced colours): they hold
 * the package to platform conventions, not to a Builder state.
 */
export const OUTSIDE_AXES = [
  "focus in forced-colours mode",
  "hover on touch screens",
  "double-tap zoom",
  "field text on touch screens",
];

export const INTERACTION_TESTS: Record<string, TestFacts[]> = {
  "plan and task_card toggle pill": [
    { components: ["plan", "task_card"], states: ["hover", "focus-visible"], facts: ["styles"] },
  ],
  "plan tasks": [{ components: ["plan"], states: ["focus-visible"], facts: ["styles"] }],
  checkboxes: [
    {
      components: ["checkboxes"],
      states: ["default", "hover", "pressed", "selected"],
      facts: ["styles"],
    },
  ],
  "option spacing": [
    {
      components: ["checkboxes", "radio_buttons"],
      states: ["default", "many-items"],
      facts: ["styles"],
    },
  ],
  "option descriptions": [
    {
      components: ["checkboxes", "radio_buttons"],
      states: ["mixed"],
      facts: ["styles"],
      themes: BOTH,
    },
  ],
  "directory select rows": [
    { components: DIRECTORY, states: ["open"], facts: ["styles"], themes: BOTH },
    { components: DIRECTORY, states: ["many-items"], facts: ["behaviour"] },
  ],
  links: [{ components: ["rich_text.link"], states: ["focus-visible"], facts: ["styles"] }],
  "select and time picker triggers": [
    {
      components: ["static_select", "timepicker"],
      states: ["hover", "pressed", "open"],
      facts: ["styles"],
      themes: BOTH,
    },
  ],
  "multi-select section accessory": [
    {
      components: ["select-dialog"],
      states: ["open", "selected"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["select-dialog"], states: ["open", "selected"], facts: ["behaviour"] },
  ],
  "static select list": [{ components: ["static_select"], states: ["open"], facts: ["styles"] }],
  "select list states": [
    { components: SELECTS, states: ["open"], facts: ["styles", "behaviour"] },
    { components: ["option_group"], states: ["open"], facts: ["styles"] },
    { components: ["multi_static_select"], states: ["selected"], facts: ["styles"] },
  ],
  "time picker list": [
    { components: ["timepicker"], states: ["open", "selected"], facts: ["styles", "behaviour"] },
  ],
  "multi-select chips": [
    { components: ["multi_static_select"], states: ["selected"], facts: ["styles", "behaviour"] },
  ],
  // Holds the nested "code block copy control" group.
  transitions: [
    { components: ["button", "modal-frame", "carousel"], states: ["default"], facts: ["motion"] },
    { components: ["rich_text.rich_text_preformatted"], states: ["default"], facts: ["motion"] },
    {
      components: ["rich_text.rich_text_preformatted"],
      states: ["hover", "focus-visible"],
      facts: ["behaviour"],
    },
  ],
  "input hints": [{ components: ["input"], states: ["default"], facts: ["styles"], themes: BOTH }],
  "invalid inputs": [
    { components: TEXT_INPUTS, states: ["validation-error"], facts: ["styles"], themes: BOTH },
  ],
  "text input limits": [
    {
      components: ["plain_text_input"],
      states: ["long-content", "validation-error"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["plain_text_input"], states: ["long-content"], facts: ["behaviour"] },
  ],
  "card icon": [{ components: ["card"], states: ["mixed"], facts: ["styles"] }],
  "overflow menu": [{ components: ["overflow"], states: ["open"], facts: ["styles", "behaviour"] }],
  "popovers in a narrow window": [
    {
      components: ["static_select", "timepicker", "datepicker", "overflow"],
      states: ["open"],
      facts: ["behaviour"],
    },
  ],
  "chart actions menu": [
    {
      components: ["data_visualization", "image"],
      states: ["open"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["data_visualization", "image"], states: ["open"], facts: ["behaviour"] },
  ],
  "chart and image menu items": [
    {
      components: ["data_visualization"],
      states: ["open", "disabled"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["chart-table-modal"], states: ["open"], facts: ["styles"], themes: BOTH },
    { components: ["chart-table-modal"], states: ["open"], facts: ["behaviour"] },
  ],
  "chart hover": [
    {
      components: ["data_visualization"],
      states: ["default", "hover"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["data_visualization"], states: ["hover"], facts: ["behaviour"] },
  ],
  "chart tooltip motion": [{ components: ["tooltip"], states: ["default"], facts: ["motion"] }],
  "datetime picker": [
    { components: ["datetimepicker"], states: ["empty", "open"], facts: ["styles"] },
    { components: ["datetimepicker"], states: ["selected"], facts: ["behaviour"] },
  ],
  "datepicker calendar": [
    {
      components: ["datepicker"],
      states: ["open", "hover", "focus-visible", "selected"],
      facts: ["styles"],
    },
    {
      components: ["datepicker"],
      states: ["open", "focus-visible", "selected"],
      facts: ["behaviour"],
    },
  ],
  "rich text input": [
    {
      components: ["rich_text_input"],
      states: ["focus-visible", "mixed"],
      facts: ["styles", "behaviour"],
    },
  ],
  "modal overlay": [
    { components: ["modal-frame"], states: ["default"], facts: ["styles", "motion"] },
  ],
  "confirm dialog": [
    { components: ["confirm"], states: ["open"], facts: ["styles", "motion", "behaviour"] },
  ],
  "select list extras in dark mode": [
    { components: SELECTS, states: ["open"], facts: ["styles"], themes: ["dark"] },
    { components: ["option_group"], states: ["open"], facts: ["styles"], themes: ["dark"] },
  ],
  "Builder-measured states in both themes": [
    {
      components: [...TEXT_INPUTS, "datepicker", "timepicker", "feedback_buttons"],
      states: ["default"],
      facts: ["styles"],
      themes: BOTH,
    },
    {
      components: ["overflow", "data_table", "data_visualization"],
      states: ["open"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["datepicker"], states: ["selected"], facts: ["styles"], themes: BOTH },
    {
      components: ["rich_text.rich_text_preformatted", "markdown"],
      states: ["default"],
      facts: ["styles"],
      themes: BOTH,
    },
  ],
  "feedback buttons picked state": [
    { components: ["feedback_buttons"], states: ["selected"], facts: ["styles"], themes: BOTH },
  ],
  "rich text input surfaces": [
    { components: ["rich_text_input"], states: ["default"], facts: ["styles"], themes: BOTH },
  ],
  "text colours in both themes": [
    {
      components: ["rich_text.channel", "channels_select", "multi_static_select"],
      states: ["default", "selected"],
      facts: ["styles"],
      themes: BOTH,
    },
  ],
  "leftover text colours in both themes": [
    {
      components: ["datepicker", "select-dialog", "static_select"],
      states: ["open"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["rich_text.broadcast"], states: ["default"], facts: ["styles"], themes: BOTH },
  ],
  "date and time fields by surface": [
    { components: ["datepicker", "timepicker"], states: ["default"], facts: ["styles"] },
  ],
  "theme colours": [
    {
      components: ["static_select", "timepicker", "datepicker"],
      states: ["default", "open"],
      facts: ["styles"],
      themes: BOTH,
    },
    { components: ["button", "icon_button"], states: ["hover"], facts: ["styles"], themes: BOTH },
  ],
  "chart fills": [
    { components: ["data_visualization"], states: ["mixed"], facts: ["styles"], themes: BOTH },
  ],
  "image block sizes": [
    { components: ["image", "slack_file"], states: ["default"], facts: ["styles"], themes: BOTH },
  ],
  "narrow messages": [
    {
      components: ["video", "data_visualization", "context"],
      states: ["default"],
      facts: ["styles"],
      widths: ["mobile"],
    },
  ],
  "narrow datetime picker": [
    { components: ["datetimepicker"], states: ["default"], facts: ["styles"], widths: ["mobile"] },
  ],
};

/** The top-level `describe` titles in an interaction test file. */
export function describeTitles(source: string): string[] {
  return [...source.matchAll(/^ {2}describe\("([^"]+)"/gm)].map((m) => m[1]!);
}
