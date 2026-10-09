/**
 * The examples the picker offers, grouped by what they show and named for it rather than by
 * fixture path. Each one is a fixture, so it's a payload the visual harness already checks against
 * Slack. Only these are bundled into the production build; the full fixture list (`fixtures.ts`)
 * loads in dev only.
 */
const modules = import.meta.glob<{ default: unknown }>(
  [
    "../../../fixtures/message/approval.json",
    "../../../fixtures/interactive/update-message.json",
    "../../../fixtures/interactive/open-modal.json",
    "../../../fixtures/extra/modal/form.json",
    "../../../fixtures/extra/home/dashboard.json",
    "../../../fixtures/extra/context-actions/feedback-row.json",
    "../../../fixtures/catalog/rich-text/kitchen-sink.json",
    "../../../fixtures/catalog/rich-text/list.json",
    "../../../fixtures/extra/rich-text/mentions-and-styles.json",
    "../../../fixtures/catalog/markdown/headings-and-dividers.json",
    "../../../fixtures/catalog/markdown/code.json",
    "../../../fixtures/catalog/section/text-fields.json",
    "../../../fixtures/extra/context/mixed.json",
    "../../../fixtures/catalog/table/simple-table.json",
    "../../../fixtures/catalog/markdown/table.json",
    "../../../fixtures/catalog/table/paginated-data-table.json",
    "../../../fixtures/catalog/table/numeric-sort-data-table.json",
    "../../../fixtures/catalog/data-visualization/bar-multi-series.json",
    "../../../fixtures/catalog/data-visualization/bar-negative-values.json",
    "../../../fixtures/catalog/data-visualization/line-multi-series.json",
    "../../../fixtures/catalog/data-visualization/area-single-series.json",
    "../../../fixtures/catalog/data-visualization/pie-multi-segment.json",
    "../../../fixtures/catalog/actions/all-selects.json",
    "../../../fixtures/catalog/input/plain-text-input.json",
    "../../../fixtures/catalog/input/multiline-plain-text-input.json",
    "../../../fixtures/extra/input/text-inputs.json",
    "../../../fixtures/catalog/input/static-select.json",
    "../../../fixtures/catalog/input/multi-static-select.json",
    "../../../fixtures/catalog/input/multi-users-select.json",
    "../../../fixtures/extra/input/more-selects.json",
    "../../../fixtures/catalog/input/checkboxes.json",
    "../../../fixtures/catalog/input/radio-buttons.json",
    "../../../fixtures/catalog/input/datepicker.json",
    "../../../fixtures/catalog/input/timepicker.json",
    "../../../fixtures/extra/input/datetimepicker.json",
    "../../../fixtures/extra/modal/rich-and-file.json",
    "../../../fixtures/catalog/container/collapsible.json",
    "../../../fixtures/catalog/container/data-entry-form.json",
    "../../../fixtures/catalog/container/with-callout.json",
    "../../../fixtures/catalog/container/header-divider.json",
    "../../../fixtures/catalog/card-and-carousel/carousel.json",
    "../../../fixtures/catalog/card-and-carousel/card-with-three-actions.json",
    "../../../fixtures/catalog/container/media-preview.json",
    "../../../fixtures/catalog/callout/callout.json",
    "../../../fixtures/catalog/image/title.json",
    "../../../fixtures/extra/media/video.json",
    "../../../fixtures/catalog/agents/plan.json",
    "../../../fixtures/catalog/agents/plan-error.json",
    "../../../fixtures/catalog/agents/task-card.json",
    "../../../fixtures/catalog/agents/task-card-statuses.json",
    "../../../fixtures/catalog/agents/message-feedback.json",
    "../../../fixtures/catalog/section/overflow.json",
    "../../../fixtures/catalog/actions/datepickers.json",
    "../../../fixtures/extra/actions/more-elements.json",
    "../../../fixtures/extra/modal/alert.json",
  ],
  { eager: true },
);

const CURATED: { group: string; label: string; fixture: string }[] = [
  { group: "Use cases", label: "Approval request", fixture: "message/approval" },
  { group: "Use cases", label: "Access request", fixture: "interactive/update-message" },
  { group: "Use cases", label: "Open a request form", fixture: "interactive/open-modal" },
  { group: "Use cases", label: "Bug report form (modal)", fixture: "extra/modal/form" },
  { group: "Use cases", label: "Ticket dashboard (Home tab)", fixture: "extra/home/dashboard" },
  {
    group: "Use cases",
    label: "Reply with feedback buttons",
    fixture: "extra/context-actions/feedback-row",
  },
  { group: "Text", label: "Rich text", fixture: "catalog/rich-text/kitchen-sink" },
  { group: "Text", label: "Lists", fixture: "catalog/rich-text/list" },
  { group: "Text", label: "Mentions and styles", fixture: "extra/rich-text/mentions-and-styles" },
  { group: "Text", label: "Markdown", fixture: "catalog/markdown/headings-and-dividers" },
  { group: "Text", label: "Code in markdown", fixture: "catalog/markdown/code" },
  { group: "Text", label: "Section with fields", fixture: "catalog/section/text-fields" },
  { group: "Text", label: "Context row", fixture: "extra/context/mixed" },
  { group: "Tables and charts", label: "Table", fixture: "catalog/table/simple-table" },
  { group: "Tables and charts", label: "Table in markdown", fixture: "catalog/markdown/table" },
  {
    group: "Tables and charts",
    label: "Data table",
    fixture: "catalog/table/paginated-data-table",
  },
  {
    group: "Tables and charts",
    label: "Sortable data table",
    fixture: "catalog/table/numeric-sort-data-table",
  },
  {
    group: "Tables and charts",
    label: "Bar chart",
    fixture: "catalog/data-visualization/bar-multi-series",
  },
  {
    group: "Tables and charts",
    label: "Bar chart with negative values",
    fixture: "catalog/data-visualization/bar-negative-values",
  },
  {
    group: "Tables and charts",
    label: "Line chart",
    fixture: "catalog/data-visualization/line-multi-series",
  },
  {
    group: "Tables and charts",
    label: "Area chart",
    fixture: "catalog/data-visualization/area-single-series",
  },
  {
    group: "Tables and charts",
    label: "Pie chart",
    fixture: "catalog/data-visualization/pie-multi-segment",
  },
  { group: "Inputs and forms", label: "Every select menu", fixture: "catalog/actions/all-selects" },
  {
    group: "Inputs and forms",
    label: "Plain text input",
    fixture: "catalog/input/plain-text-input",
  },
  {
    group: "Inputs and forms",
    label: "Multi-line text input",
    fixture: "catalog/input/multiline-plain-text-input",
  },
  {
    group: "Inputs and forms",
    label: "Email, URL and number inputs",
    fixture: "extra/input/text-inputs",
  },
  { group: "Inputs and forms", label: "Select menu", fixture: "catalog/input/static-select" },
  {
    group: "Inputs and forms",
    label: "Multi-select",
    fixture: "catalog/input/multi-static-select",
  },
  {
    group: "Inputs and forms",
    label: "Pick several people",
    fixture: "catalog/input/multi-users-select",
  },
  { group: "Inputs and forms", label: "More select menus", fixture: "extra/input/more-selects" },
  { group: "Inputs and forms", label: "Checkboxes", fixture: "catalog/input/checkboxes" },
  { group: "Inputs and forms", label: "Radio buttons", fixture: "catalog/input/radio-buttons" },
  { group: "Inputs and forms", label: "Date picker", fixture: "catalog/input/datepicker" },
  { group: "Inputs and forms", label: "Time picker", fixture: "catalog/input/timepicker" },
  {
    group: "Inputs and forms",
    label: "Date and time picker",
    fixture: "extra/input/datetimepicker",
  },
  {
    group: "Inputs and forms",
    label: "Rich text and file inputs (modal)",
    fixture: "extra/modal/rich-and-file",
  },
  { group: "Layout", label: "Collapsible container", fixture: "catalog/container/collapsible" },
  { group: "Layout", label: "Form in a container", fixture: "catalog/container/data-entry-form" },
  { group: "Layout", label: "Container with a callout", fixture: "catalog/container/with-callout" },
  { group: "Layout", label: "Header and divider", fixture: "catalog/container/header-divider" },
  { group: "Layout", label: "Card carousel", fixture: "catalog/card-and-carousel/carousel" },
  {
    group: "Layout",
    label: "Card with three actions",
    fixture: "catalog/card-and-carousel/card-with-three-actions",
  },
  { group: "Layout", label: "Media preview", fixture: "catalog/container/media-preview" },
  { group: "Layout", label: "Callout", fixture: "catalog/callout/callout" },
  { group: "Layout", label: "Image with a title", fixture: "catalog/image/title" },
  { group: "Layout", label: "Video", fixture: "extra/media/video" },
  { group: "Agents", label: "Plan", fixture: "catalog/agents/plan" },
  { group: "Agents", label: "Plan with an error", fixture: "catalog/agents/plan-error" },
  { group: "Agents", label: "Task card", fixture: "catalog/agents/task-card" },
  { group: "Agents", label: "Task card statuses", fixture: "catalog/agents/task-card-statuses" },
  { group: "Agents", label: "Message feedback", fixture: "catalog/agents/message-feedback" },
  { group: "Buttons and menus", label: "Overflow menu", fixture: "catalog/section/overflow" },
  {
    group: "Buttons and menus",
    label: "Date pickers in actions",
    fixture: "catalog/actions/datepickers",
  },
  {
    group: "Buttons and menus",
    label: "Workflow and other buttons",
    fixture: "extra/actions/more-elements",
  },
  { group: "Buttons and menus", label: "Alerts (modal)", fixture: "extra/modal/alert" },
];

export interface Example {
  /** The fixture's path under fixtures/, without `.json`. */
  name: string;
  json: string;
  group: string;
  label: string;
}

export const examples: Example[] = CURATED.flatMap(({ group, label, fixture }) => {
  const mod = modules[`../../../fixtures/${fixture}.json`];
  return mod ? [{ name: fixture, json: JSON.stringify(mod.default, null, 2), group, label }] : [];
});

export const DEFAULT_EXAMPLE = examples[0];
