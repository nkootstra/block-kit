/**
 * Slack's documented payload limits (docs.slack.dev/reference/block-kit), as checks. Block Kit
 * Builder refuses a payload that breaks one and keeps showing the previous payload, so a capture
 * of it records the wrong rendering (stale.ts catches that afterwards). Checking fixtures against
 * these first keeps refused payloads out of capture sessions.
 *
 * Each limit is the documented maximum; where a capture showed the Builder refusing a payload,
 * `refused` names the fixture as the evidence.
 */
import { objects } from "../coverage";

type Obj = Record<string, unknown>;

export interface Violation {
  limit: string;
  where: string;
  actual: string;
}

export interface Limit {
  id: string;
  /** What the docs say, with the page under docs.slack.dev/reference/block-kit/. */
  rule: string;
  docs: string;
  /** Fixtures the Builder refused for this limit, as captured. */
  refused?: string[];
  /** Fixtures past the limit that the Builder still accepted and rendered, as captured. */
  accepted?: string[];
  check: (o: Obj, key: string | undefined, root: Obj) => string | undefined;
}

const textOf = (v: unknown): string | undefined =>
  v && typeof v === "object" && typeof (v as Obj).text === "string"
    ? ((v as Obj).text as string)
    : undefined;
const longer = (v: unknown, max: number) => {
  const t = typeof v === "string" ? v : textOf(v);
  return t !== undefined && t.length > max ? `${t.length} characters` : undefined;
};
const more = (v: unknown, max: number) =>
  Array.isArray(v) && v.length > max ? `${v.length} items` : undefined;
const fewer = (v: unknown, min: number) =>
  Array.isArray(v) && v.length < min ? `${v.length} items` : undefined;
const BLOCK_KEYS = new Set([undefined, "blocks", "child_blocks"]);
const isBlock = (o: Obj, key: string | undefined, type: string) =>
  o.type === type && BLOCK_KEYS.has(key);
const SELECTS = /^(multi_)?static_select$/;

export const LIMITS: Limit[] = [
  {
    id: "option-text",
    rule: "An option's text is at most 75 characters",
    docs: "composition-objects/option-object",
    refused: ["extra/fidelity/checkboxes/long-content"],
    check: (o, key) =>
      key === "options" || key === "initial_options" || key === "initial_option"
        ? longer(o.text, 75)
        : undefined,
  },
  {
    id: "initial-option",
    rule: "A select's or choice group's initial options are among its options (or option groups' options)",
    docs: "block-elements/select-menu-element",
    refused: ["extra/fidelity/static-select/many-items"],
    check: (o) => {
      if (!("initial_option" in o || "initial_options" in o)) return undefined;
      const groups = (o.option_groups ?? []) as Obj[];
      const options = [
        ...((o.options ?? []) as Obj[]),
        ...groups.flatMap((g) => (g.options ?? []) as Obj[]),
      ];
      // An external select's options come from the app: its initial options can't be checked.
      if (options.length === 0) return undefined;
      const values = new Set(options.map((x) => x.value));
      const initial = [
        ...(o.initial_option ? [o.initial_option as Obj] : []),
        ...((o.initial_options ?? []) as Obj[]),
      ];
      const missing = initial.find((x) => !values.has(x.value));
      return missing ? `initial value "${String(missing.value)}" isn't an option` : undefined;
    },
  },
  {
    id: "option-description",
    rule: "An option's description is at most 75 characters",
    docs: "composition-objects/option-object",
    check: (o, key) => (key === "options" ? longer(o.description, 75) : undefined),
  },
  {
    id: "option-value",
    rule: "An option's value is at most 150 characters",
    docs: "composition-objects/option-object",
    check: (o, key) => (key === "options" ? longer(o.value, 150) : undefined),
  },
  {
    id: "option-group-label",
    rule: "An option group's label is at most 75 characters",
    docs: "composition-objects/option-group-object",
    check: (o, key) => (key === "option_groups" ? longer(o.label, 75) : undefined),
  },
  {
    id: "placeholder",
    rule: "A select's or input's placeholder is at most 150 characters",
    docs: "block-elements/select-menu-element",
    refused: [
      "extra/fidelity/users-select/long-content",
      "extra/fidelity/multi-users-select/long-content",
    ],
    check: (o) => longer(o.placeholder, 150),
  },
  {
    id: "select-options",
    rule: "A static select has at most 100 options and 100 option groups",
    docs: "block-elements/select-menu-element",
    check: (o) =>
      SELECTS.test(String(o.type))
        ? (more(o.options, 100) ?? more(o.option_groups, 100))
        : undefined,
  },
  {
    id: "choice-options",
    rule: "Checkboxes and radio buttons have at most 10 options",
    docs: "block-elements/checkboxes-element",
    check: (o) =>
      o.type === "checkboxes" || o.type === "radio_buttons" ? more(o.options, 10) : undefined,
  },
  {
    id: "overflow-options",
    rule: "An overflow menu has at most five options",
    docs: "block-elements/overflow-menu-element",
    check: (o) => (o.type === "overflow" ? more(o.options, 5) : undefined),
  },
  {
    id: "button-text",
    rule: "A button's text is at most 75 characters",
    docs: "block-elements/button-element",
    check: (o) =>
      o.type === "button" || o.type === "workflow_button" || o.type === "icon_button"
        ? longer(o.text, 75)
        : undefined,
  },
  {
    id: "confirm",
    rule: "A confirm dialog's title is at most 100 characters, its text 300, its buttons 30",
    docs: "composition-objects/confirmation-dialog-object",
    // 319 characters of text: the Builder kept the previous payload (a rich text list), and
    // stale.ts missed it, since that payload's leftover text is all shorter than four words.
    refused: ["extra/fidelity/confirm/long-content"],
    check: (o, key) =>
      key === "confirm" && typeof o.title === "object"
        ? (longer(o.title, 100) ??
          longer(o.text, 300) ??
          longer(o.confirm, 30) ??
          longer(o.deny, 30))
        : undefined,
  },
  {
    id: "header-text",
    rule: "A header's text is at most 150 characters",
    docs: "blocks/header-block",
    check: (o, key) => (isBlock(o, key, "header") ? longer(o.text, 150) : undefined),
  },
  {
    id: "section",
    rule: "A section's text is at most 3000 characters, with at most 10 fields of 2000",
    docs: "blocks/section-block",
    check: (o, key) =>
      isBlock(o, key, "section")
        ? (longer(o.text, 3000) ??
          more(o.fields, 10) ??
          (Array.isArray(o.fields)
            ? o.fields.map((f) => longer(f, 2000)).find(Boolean)
            : undefined))
        : undefined,
  },
  {
    id: "actions-elements",
    rule: "An actions block holds at most 25 elements",
    docs: "blocks/actions-block",
    check: (o, key) => (isBlock(o, key, "actions") ? more(o.elements, 25) : undefined),
  },
  {
    id: "context-elements",
    rule: "A context block holds at most 10 elements",
    docs: "blocks/context-block",
    check: (o, key) => (isBlock(o, key, "context") ? more(o.elements, 10) : undefined),
  },
  {
    id: "input-text",
    rule: "An input's label and hint are at most 2000 characters",
    docs: "blocks/input-block",
    check: (o, key) =>
      isBlock(o, key, "input") ? (longer(o.label, 2000) ?? longer(o.hint, 2000)) : undefined,
  },
  {
    id: "image-text",
    rule: "An image block's title and alt text are at most 2000 characters",
    docs: "blocks/image-block",
    check: (o, key) =>
      isBlock(o, key, "image") ? (longer(o.title, 2000) ?? longer(o.alt_text, 2000)) : undefined,
  },
  {
    id: "carousel-cards",
    rule: "A carousel holds 1 to 10 cards",
    docs: "blocks/carousel-block",
    check: (o) =>
      o.type === "carousel" ? (more(o.elements, 10) ?? fewer(o.elements, 1)) : undefined,
  },
  {
    id: "card-text",
    rule: "A card's title and subtitle are at most 150 characters, its body 200, with at most 3 actions",
    docs: "blocks/card-block",
    check: (o) =>
      o.type === "card"
        ? (longer(o.title, 150) ??
          longer(o.subtitle, 150) ??
          longer(o.body, 200) ??
          more(o.actions, 3))
        : undefined,
  },
  {
    id: "container",
    rule: "A container's title and subtitle are at most 150 characters, with at most 10 child blocks",
    docs: "blocks/container-block",
    check: (o) =>
      o.type === "container"
        ? (longer(o.title, 150) ?? longer(o.subtitle, 150) ?? more(o.child_blocks, 10))
        : undefined,
  },
  {
    id: "alert-text",
    rule: "An alert's text is at most 200 characters",
    docs: "blocks/alert-block",
    check: (o, key) => (isBlock(o, key, "alert") ? longer(o.text, 200) : undefined),
  },
  {
    id: "video-text",
    rule: "A video's title is under 200 characters, its author name under 50",
    docs: "blocks/video-block",
    check: (o, key) =>
      isBlock(o, key, "video") ? (longer(o.title, 199) ?? longer(o.author_name, 49)) : undefined,
  },
  {
    id: "chart",
    rule: "A chart's title is at most 50 characters; 1 to 12 series or segments, at most 20 points, labels and names at most 20 characters",
    docs: "blocks/data-visualization-block",
    check: (o, key) => {
      if (!isBlock(o, key, "data_visualization")) return undefined;
      const chart = (o.chart ?? {}) as Obj;
      const series = (chart.series ?? []) as Obj[];
      const segments = (chart.segments ?? []) as Obj[];
      const axis = (chart.axis_config ?? {}) as Obj;
      return (
        longer(o.title, 50) ??
        more(chart.series, 12) ??
        more(chart.segments, 12) ??
        series.map((s) => more(s.data, 20) ?? longer(s.name, 20)).find(Boolean) ??
        segments.map((s) => longer(s.label, 20)).find(Boolean) ??
        ((axis.categories ?? []) as string[]).map((c) => longer(c, 20)).find(Boolean) ??
        longer(axis.x_label, 50) ??
        longer(axis.y_label, 50)
      );
    },
  },
  {
    id: "data-table-rows",
    rule: "A data table has 2 to 201 rows (a header and at least one row) and 1 to 20 columns, with no rich text in the header",
    docs: "blocks/data-table-block",
    // The Builder rendered a header-only table (one row) without complaint.
    accepted: ["extra/fidelity/data-table/empty"],
    check: (o, key) => {
      if (!isBlock(o, key, "data_table")) return undefined;
      const rows = (o.rows ?? []) as Obj[][];
      return (
        fewer(rows, 2) ??
        more(rows, 201) ??
        rows.map((r) => more(r, 20)).find(Boolean) ??
        (rows[0]?.some((c) => c.type === "rich_text") ? "rich text in the header" : undefined)
      );
    },
  },
  {
    id: "table-rows",
    rule: "A table has at most 100 rows and 20 column settings",
    docs: "blocks/table-block",
    check: (o, key) =>
      isBlock(o, key, "table") ? (more(o.rows, 100) ?? more(o.column_settings, 20)) : undefined,
  },
  {
    id: "plan-tasks",
    rule: "A plan holds at most 50 tasks",
    docs: "blocks/plan-block",
    check: (o, key) => (isBlock(o, key, "plan") ? more(o.tasks, 50) : undefined),
  },
  {
    id: "modal",
    rule: "A modal's title, submit and close are at most 24 characters, with at most 100 blocks",
    docs: "../../surfaces/modals",
    check: (o, key, root) =>
      o === root && o.type === "modal"
        ? (longer(o.title, 24) ??
          longer(o.submit, 24) ??
          longer(o.close, 24) ??
          more(o.blocks, 100))
        : undefined,
  },
  {
    id: "message-blocks",
    rule: "A message holds at most 50 blocks, an App Home 100",
    docs: "blocks",
    check: (o, key, root) =>
      o === root && o.type !== "modal" ? more(o.blocks, o.type === "home" ? 100 : 50) : undefined,
  },
  {
    id: "unique-block-ids",
    rule: "Block IDs are unique within a payload",
    docs: "blocks",
    refused: ["extra/fidelity/carousel/many-items"],
    check: (o, key, root) => {
      if (o !== root) return undefined;
      const seen = new Set<string>();
      for (const [x] of objects(root)) {
        const id = x.block_id;
        if (typeof id !== "string") continue;
        if (seen.has(id)) return `block_id "${id}" repeats`;
        seen.add(id);
      }
      return undefined;
    },
  },
];

/**
 * Every documented limit a payload breaks. With `fixture`, a limit the Builder was seen to accept
 * for that fixture isn't reported.
 */
export function violations(payload: unknown, fixture?: string): Violation[] {
  const root = payload as Obj;
  const out: Violation[] = [];
  for (const [o, key] of objects(payload))
    for (const limit of LIMITS) {
      if (fixture && limit.accepted?.includes(fixture)) continue;
      const actual = limit.check(o, key, root);
      if (actual)
        out.push({
          limit: limit.id,
          where: typeof o.type === "string" ? o.type : (key ?? "payload"),
          actual,
        });
    }
  return out;
}
