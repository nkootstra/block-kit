/**
 * The examples the picker offers, named for what they're for rather than by fixture path. Each one
 * is a fixture, so it's a payload the visual harness already checks against Slack. Only these are
 * bundled into the production build; the full fixture list (`fixtures.ts`) loads in dev only.
 */
const modules = import.meta.glob<{ default: unknown }>(
  [
    "../../../fixtures/message/approval.json",
    "../../../fixtures/interactive/update-message.json",
    "../../../fixtures/interactive/open-modal.json",
    "../../../fixtures/catalog/actions/all-selects.json",
    "../../../fixtures/extra/rich-text/mentions-and-styles.json",
    "../../../fixtures/catalog/rich-text/kitchen-sink.json",
    "../../../fixtures/catalog/markdown/headings-and-dividers.json",
    "../../../fixtures/catalog/table/simple-table.json",
    "../../../fixtures/catalog/table/paginated-data-table.json",
    "../../../fixtures/catalog/data-visualization/bar-multi-series.json",
    "../../../fixtures/catalog/card-and-carousel/carousel.json",
    "../../../fixtures/catalog/callout/callout.json",
    "../../../fixtures/extra/media/video.json",
    "../../../fixtures/catalog/agents/plan.json",
    "../../../fixtures/catalog/agents/task-card.json",
    "../../../fixtures/extra/context-actions/feedback-row.json",
    "../../../fixtures/extra/modal/form.json",
    "../../../fixtures/extra/modal/alert.json",
    "../../../fixtures/extra/home/dashboard.json",
  ],
  { eager: true },
);

const CURATED: { group: string; label: string; fixture: string }[] = [
  { group: "Messages", label: "Approval request", fixture: "message/approval" },
  { group: "Messages", label: "Access request", fixture: "interactive/update-message" },
  { group: "Messages", label: "Open a request form", fixture: "interactive/open-modal" },
  { group: "Messages", label: "Every select menu", fixture: "catalog/actions/all-selects" },
  {
    group: "Messages",
    label: "Mentions and styles",
    fixture: "extra/rich-text/mentions-and-styles",
  },
  { group: "Messages", label: "Rich text", fixture: "catalog/rich-text/kitchen-sink" },
  { group: "Messages", label: "Markdown", fixture: "catalog/markdown/headings-and-dividers" },
  { group: "Messages", label: "Table", fixture: "catalog/table/simple-table" },
  { group: "Messages", label: "Data table", fixture: "catalog/table/paginated-data-table" },
  { group: "Messages", label: "Bar chart", fixture: "catalog/data-visualization/bar-multi-series" },
  { group: "Messages", label: "Card carousel", fixture: "catalog/card-and-carousel/carousel" },
  { group: "Messages", label: "Callout", fixture: "catalog/callout/callout" },
  { group: "Messages", label: "Video", fixture: "extra/media/video" },
  { group: "Agents", label: "Plan", fixture: "catalog/agents/plan" },
  { group: "Agents", label: "Task card", fixture: "catalog/agents/task-card" },
  {
    group: "Agents",
    label: "Reply with feedback buttons",
    fixture: "extra/context-actions/feedback-row",
  },
  { group: "Modals", label: "Bug report form", fixture: "extra/modal/form" },
  { group: "Modals", label: "Alerts", fixture: "extra/modal/alert" },
  { group: "Home tab", label: "Ticket dashboard", fixture: "extra/home/dashboard" },
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
