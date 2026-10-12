/**
 * Everything whose rendering and behaviour has to match Slack's: every block, block element and
 * composition object in Slack's Block Kit reference (docs.slack.dev/reference/block-kit), the
 * surface chrome around them, and the client UI the package draws the way Slack's client does.
 *
 * Each entry lists the states it has (axes.ts), the payloads it sends, how to find it in a fixture
 * payload, where the package implements it, and what Block Kit Builder can't show of it.
 */
import type { FactKind, PayloadEvent, StateId, Surface } from "./axes";

type Obj = Record<string, unknown>;

/**
 * Whether an object in a fixture payload is this component. `key` is what the object sits under
 * (an array's items share the array's key), `root` the whole payload.
 */
export type Matcher = (o: Obj, key: string | undefined, root: Obj) => boolean;

export type Kind = "block" | "element" | "rich-text" | "composition" | "chrome" | "package-ui";

/**
 * - `slack-docs`: in Slack's Block Kit reference.
 * - `builder`: not in the reference, but in Block Kit Builder's catalog (so Slack renders it).
 * - `client`: Slack client UI around Block Kit (the message header, a modal's frame).
 */
export type Source = "slack-docs" | "builder" | "client";

/** Where the package implements it: a type in a renderer registry, or a source file. */
export type Implementation =
  | { registry: "blocks" | "elements" | "rich-text"; type: string }
  | { file: string };

export interface Component {
  id: string;
  name: string;
  kind: Kind;
  source: Source;
  /** Path under https://docs.slack.dev/reference/block-kit/ */
  docs?: string;
  surfaces: Surface[];
  /** 1: in most messages and modals; 2: common; 3: niche. Orders capture work. */
  tier: 1 | 2 | 3;
  states: StateId[];
  events?: PayloadEvent[];
  /** Fact kinds that apply; all by default. */
  facts?: FactKind[];
  match: Matcher;
  impl?: Implementation;
  /** Why Block Kit Builder can't show a state, event or fact kind of it. */
  unobservable?: Partial<Record<StateId | PayloadEvent | FactKind, string>>;
  /** States that don't apply to it, and why. Left out of the totals. */
  na?: Partial<Record<StateId, string>>;
  /**
   * The surface whose wrapper gives it a stylesheet variant (`p-divider_block_wrapper--modal_view`):
   * a reference on that surface shows its `mixed` state.
   */
  variantSurface?: Surface;
  notes?: string;
}

// Profiles: the states a kind of control has.
const CLICK: StateId[] = ["default", "hover", "focus-visible", "pressed"];
const SELECT: StateId[] = [
  ...CLICK,
  "open",
  "selected",
  "empty",
  "initial-value",
  "long-content",
  "many-items",
  "mixed",
  "validation-error",
];
const PICKER: StateId[] = [
  ...CLICK,
  "open",
  "selected",
  "empty",
  "initial-value",
  "validation-error",
];
const CHOICE: StateId[] = [
  ...CLICK,
  "selected",
  "initial-value",
  "mixed",
  "long-content",
  "many-items",
  "validation-error",
];
const TEXT_INPUT: StateId[] = [
  "default",
  "hover",
  "focus-visible",
  "empty",
  "initial-value",
  "long-content",
  "validation-error",
];
const ALL: Surface[] = ["message", "modal", "home"];

const NO_BACKEND =
  "Block Kit Builder has no app behind it: nothing loads, so there's no loading state";
const SUGGESTION =
  "Block Kit Builder has no options load URL to send block_suggestion to (verify in Actions Preview)";
const APP_OPTIONS =
  "The options come from the app's options load URL, which Block Kit Builder doesn't have";
/** A users, conversations or channels select lists the workspace, not the payload's options. */
const DIRECTORY_GAPS: Partial<Component> = {
  unobservable: {
    "many-items":
      "The list holds the Builder workspace's members or conversations, not the payload's",
  },
  na: { mixed: "No payload field varies how its options look: they're the workspace's" },
};
const NOT_IN_BUILDER =
  "Block Kit Builder's preview doesn't draw it; it needs a capture from a real Slack client";

const BLOCK_KEYS = new Set([undefined, "blocks", "child_blocks"]);
const block =
  (type: string): Matcher =>
  (o, key) =>
    o.type === type && BLOCK_KEYS.has(key);
const element =
  (...types: string[]): Matcher =>
  (o, key) =>
    types.includes(o.type as string) && !BLOCK_KEYS.has(key);
const typed =
  (...types: string[]): Matcher =>
  (o) =>
    types.includes(o.type as string);
const under =
  (...keys: string[]): Matcher =>
  (o, key) =>
    key !== undefined && keys.includes(key);
const surface =
  (s: Surface): Matcher =>
  (o, key, root) =>
    o === root && surfaceOf(root) === s;
const none: Matcher = () => false;

/** The surface a fixture payload previews in. */
export function surfaceOf(payload: Obj): Surface {
  return payload.type === "modal" ? "modal" : payload.type === "home" ? "home" : "message";
}

/** A text object (or a rich text leaf) whose text matches. */
const text =
  (pattern: RegExp): Matcher =>
  (o) =>
    (o.type === "mrkdwn" || o.type === "plain_text" || o.type === "text") &&
    typeof o.text === "string" &&
    pattern.test(o.text);

const or =
  (...matchers: Matcher[]): Matcher =>
  (o, key, root) =>
    matchers.some((m) => m(o, key, root));

const blk = (
  type: string,
  docs: string,
  surfaces: Surface[],
  tier: Component["tier"],
  states: StateId[],
  extra: Partial<Component> = {},
): Component => ({
  id: type,
  name: `${type} block`,
  kind: "block",
  source: "slack-docs",
  docs: `blocks/${docs}`,
  surfaces,
  tier,
  states,
  match: block(type),
  impl: { registry: "blocks", type },
  ...extra,
});

const el = (
  type: string,
  docs: string,
  surfaces: Surface[],
  tier: Component["tier"],
  states: StateId[],
  extra: Partial<Component> = {},
): Component => ({
  id: type,
  name: `${type} element`,
  kind: "element",
  source: "slack-docs",
  docs: `block-elements/${docs}`,
  surfaces,
  tier,
  states,
  match: element(type),
  impl: { registry: "elements", type },
  ...extra,
});

const rich = (
  type: string,
  docs: string,
  tier: Component["tier"],
  states: StateId[],
  extra: Partial<Component> = {},
): Component => ({
  id: `rich_text.${type}`,
  name: `${type} (rich text)`,
  kind: "rich-text",
  source: "slack-docs",
  docs: `block-elements/${docs}`,
  surfaces: ALL,
  tier,
  states,
  facts: ["styles", "motion", "behaviour"],
  match: element(type),
  impl: { registry: "rich-text", type },
  ...extra,
});

const SELECT_EVENTS: PayloadEvent[] = ["block_actions", "view_submission"];
const INPUT_EVENTS: PayloadEvent[] = ["view_submission", "block_actions"];

export const COMPONENTS: Component[] = [
  // Blocks
  blk(
    "section",
    "section-block",
    ALL,
    1,
    ["default", "long-content", "toggled", "mixed", "many-items"],
    {
      notes:
        "Long text collapses behind Show more; Slack's truncation length is unknown (Section.tsx guesses 300 characters).",
    },
  ),
  blk("actions", "actions-block", ALL, 1, ["default", "many-items", "mixed"]),
  blk("context", "context-block", ALL, 1, ["default", "long-content", "many-items", "mixed"]),
  blk("header", "header-block", ALL, 1, ["default", "long-content"]),
  blk("divider", "divider-block", ALL, 1, ["default"], { variantSurface: "modal" }),
  blk(
    "image",
    "image-block",
    ALL,
    1,
    ["default", "hover", "focus-visible", "open", "toggled", "long-content", "mixed", "loading"],
    {
      unobservable: {
        loading: "References freeze a loaded image; a slow load can't be held in Block Kit Builder",
      },
    },
  ),
  blk("input", "input-block", ALL, 1, ["default", "mixed", "long-content", "validation-error"], {
    unobservable: {
      "validation-error":
        "Server-side errors (response_action: errors) need an app; Builder may show client-side required-field errors on Submit (verify)",
    },
  }),
  blk("rich_text", "rich-text-block", ALL, 1, ["default", "long-content", "mixed"]),
  blk("markdown", "markdown-block", ["message"], 2, [
    "default",
    "long-content",
    "mixed",
    "full-content",
    "scrolled-end",
  ]),
  blk("file", "file-block", ["message"], 3, ["default", "hover", "loading"], {
    unobservable: {
      default:
        "Needs a real remote file in the Builder's workspace (extra/file/remote-file is unverified)",
      loading: NO_BACKEND,
      empty:
        "A stylesheet-only state of Slack's file pill; a file block needs a real remote file in the Builder's workspace",
      mixed:
        "Its stylesheet variants are file kinds (image, document, slide, remote, external, not found, tombstone), which need real files in the Builder's workspace",
    },
  }),
  blk("video", "video-block", ALL, 3, ["default", "hover", "pressed", "long-content", "loading"], {
    unobservable: {
      pressed: "Playing embeds a third-party player",
      loading: NO_BACKEND,
      mixed:
        "Its stylesheet variants (size-x-small, gallery_v3, too_large, controls) belong to the player chrome around a playable embed, which no payload field selects",
    },
  }),
  blk("alert", "alert-block", ["modal"], 2, ["default", "mixed", "long-content"]),
  blk(
    "card",
    "card-block",
    ALL,
    2,
    ["default", "hover", "focus-visible", "mixed", "long-content"],
    {
      match: typed("card"),
    },
  ),
  blk(
    "carousel",
    "carousel-block",
    ["message", "home"],
    2,
    [
      "default",
      "hover",
      "focus-visible",
      "pressed",
      "toggled",
      "many-items",
      "full-content",
      "scrolled-end",
    ],
    {
      na: {
        mixed:
          "Its stylesheet variants (can_scroll, left, right, hidden, arrows-in-flow) are the arrows' scroll positions, which the hover, toggled and many-items cells cover",
      },
    },
  ),
  blk("container", "container-block", ["message", "home"], 2, [
    "default",
    "hover",
    "focus-visible",
    "toggled",
    "mixed",
    "many-items",
    "long-content",
  ]),
  blk("context_actions", "context-actions-block", ["message"], 2, ["default", "mixed"]),
  blk("data_table", "data-table-block", ["message", "home"], 2, [
    "default",
    "hover",
    "focus-visible",
    "open",
    "toggled",
    "empty",
    "many-items",
    "long-content",
    "mixed",
    "full-content",
    "scrolled-end",
  ]),
  blk(
    "data_visualization",
    "data-visualization-block",
    ["message", "home"],
    2,
    [
      "default",
      "hover",
      "focus-visible",
      "open",
      "disabled",
      "mixed",
      "many-items",
      "full-content",
      "scrolled-end",
    ],
    { notes: "disabled: the chart menu's Copy as image item." },
  ),
  blk(
    "plan",
    "plan-block",
    ["message"],
    2,
    ["default", "hover", "focus-visible", "toggled", "mixed", "loading", "long-content"],
    { notes: "loading: an in-progress task's spinner." },
  ),
  blk("task_card", "task-card-block", ["message"], 2, [
    "default",
    "hover",
    "focus-visible",
    "toggled",
    "mixed",
    "loading",
    "long-content",
  ]),
  blk("table", "table-block", ["message", "home"], 2, [
    "default",
    "long-content",
    "many-items",
    "mixed",
    "full-content",
    "scrolled-end",
  ]),
  // In Block Kit Builder's catalog, not in the reference.
  blk("callout", "callout-block", ["message"], 3, ["default", "mixed"], {
    source: "builder",
    docs: undefined,
  }),
  blk("condition", "condition-block", ["message"], 3, ["default", "mixed"], {
    source: "builder",
    docs: undefined,
    notes:
      "Shows a branch per client platform. Block Kit Builder evaluates it as the desktop client at both widths (finding builder-condition-desktop).",
  }),
  blk("fallback_canary", "fallback-canary-block", ["message"], 3, ["default"], {
    source: "builder",
    docs: undefined,
  }),
  blk("contact_card", "contact-card-block", ["message"], 3, ["default", "hover", "mixed"], {
    source: "builder",
    docs: undefined,
    notes: "Not in Slack's reference; check Block Kit Builder's catalog for a sample payload.",
  }),

  // Interactive and image elements
  el("button", "button-element", ALL, 1, [...CLICK, "mixed", "long-content"], {
    events: ["block_actions"],
    notes: "mixed: primary, danger and url buttons.",
  }),
  el("overflow", "overflow-menu-element", ALL, 1, [...CLICK, "open", "many-items", "mixed"], {
    events: ["block_actions"],
  }),
  el("static_select", "select-menu-element", ALL, 1, SELECT, { events: SELECT_EVENTS }),
  el("external_select", "select-menu-element", ALL, 2, [...SELECT, "loading"], {
    events: [...SELECT_EVENTS, "block_suggestion"],
    unobservable: {
      loading: NO_BACKEND,
      block_suggestion: SUGGESTION,
      "many-items": APP_OPTIONS,
      // Picking needs an option, and the options come from the app.
      block_actions: APP_OPTIONS,
      mixed: APP_OPTIONS,
    },
  }),
  el("users_select", "select-menu-element", ALL, 2, SELECT, {
    events: SELECT_EVENTS,
    ...DIRECTORY_GAPS,
    notes: "The open list shows the workspace's members: redact before committing.",
  }),
  el("conversations_select", "select-menu-element", ALL, 2, SELECT, {
    events: SELECT_EVENTS,
    ...DIRECTORY_GAPS,
    notes: "The open list shows the workspace's conversations: redact before committing.",
  }),
  el("channels_select", "select-menu-element", ALL, 2, SELECT, {
    events: SELECT_EVENTS,
    ...DIRECTORY_GAPS,
    notes: "The open list shows the workspace's channels: redact before committing.",
  }),
  el("multi_static_select", "multi-select-menu-element", ALL, 1, SELECT, { events: SELECT_EVENTS }),
  el("multi_external_select", "multi-select-menu-element", ALL, 3, [...SELECT, "loading"], {
    events: [...SELECT_EVENTS, "block_suggestion"],
    unobservable: {
      loading: NO_BACKEND,
      block_suggestion: SUGGESTION,
      "many-items": APP_OPTIONS,
      // Picking needs an option, and the options come from the app.
      block_actions: APP_OPTIONS,
      mixed: APP_OPTIONS,
    },
  }),
  el("multi_users_select", "multi-select-menu-element", ALL, 2, SELECT, {
    events: SELECT_EVENTS,
    ...DIRECTORY_GAPS,
  }),
  el("multi_conversations_select", "multi-select-menu-element", ALL, 3, SELECT, {
    events: SELECT_EVENTS,
    ...DIRECTORY_GAPS,
  }),
  el("multi_channels_select", "multi-select-menu-element", ALL, 3, SELECT, {
    events: SELECT_EVENTS,
    ...DIRECTORY_GAPS,
  }),
  el("checkboxes", "checkboxes-element", ALL, 1, CHOICE, { events: SELECT_EVENTS }),
  el("radio_buttons", "radio-button-group-element", ALL, 1, CHOICE, { events: SELECT_EVENTS }),
  el("datepicker", "date-picker-element", ALL, 1, PICKER, {
    events: SELECT_EVENTS,
    // Also --sidebar, Slack's split-view surface, which the Builder doesn't preview.
    variantSurface: "modal",
  }),
  el("timepicker", "time-picker-element", ALL, 2, PICKER, { events: SELECT_EVENTS }),
  el("datetimepicker", "datetime-picker-element", ["message", "modal"], 2, PICKER, {
    events: SELECT_EVENTS,
  }),
  el("plain_text_input", "plain-text-input-element", ALL, 1, [...TEXT_INPUT, "mixed"], {
    events: INPUT_EVENTS,
    notes: "mixed: multiline. long-content: the character count near max_length.",
  }),
  el("email_text_input", "email-input-element", ["modal"], 2, TEXT_INPUT, {
    events: INPUT_EVENTS,
    variantSurface: "modal",
  }),
  el("url_text_input", "url-input-element", ["modal"], 2, TEXT_INPUT, {
    events: INPUT_EVENTS,
    variantSurface: "modal",
  }),
  el("number_input", "number-input-element", ["modal"], 2, TEXT_INPUT, {
    events: INPUT_EVENTS,
    variantSurface: "modal",
  }),
  el("rich_text_input", "rich-text-input-element", ["modal", "home"], 2, [...TEXT_INPUT, "mixed"], {
    events: INPUT_EVENTS,
    notes: "mixed: the formatting toolbar and formatted text.",
  }),
  el(
    "file_input",
    "file-input-element",
    ["modal"],
    2,
    ["default", "hover", "focus-visible", "selected", "loading", "validation-error"],
    {
      events: ["view_submission"],
      unobservable: {
        loading: NO_BACKEND,
        selected: "Builder's preview may not accept a file (verify)",
      },
    },
  ),
  el("image_element", "image-element", ALL, 1, ["default", "mixed", "loading"], {
    id: "image_element",
    name: "image element",
    match: element("image"),
    impl: { registry: "elements", type: "image" },
    unobservable: { loading: NO_BACKEND },
  }),
  el("workflow_button", "workflow-button-element", ["message"], 3, [...CLICK, "mixed"], {
    unobservable: {
      behaviour: "A click starts a workflow, which Block Kit Builder can't run",
    },
    notes: "Sends no block_actions: the click starts the workflow.",
  }),
  el("feedback_buttons", "feedback-buttons-element", ["message"], 2, [...CLICK, "selected"], {
    events: ["block_actions"],
  }),
  el("icon_button", "icon-button-element", ["message"], 2, [...CLICK, "mixed"], {
    events: ["block_actions"],
  }),
  el("url_source", "url-source-element", ["message"], 3, ["default", "hover", "focus-visible"], {
    id: "url_source",
    name: "url source (task card)",
    match: (o, key) => o.type === "url" && key === "sources",
    impl: { file: "packages/block-kit/src/blocks/TaskCard.tsx" },
    facts: ["styles", "motion", "behaviour"],
  }),

  // Rich text
  rich("rich_text_section", "rich-text-section-element", 1, ["default"], {
    impl: { file: "packages/block-kit/src/blocks/RichText.tsx" },
  }),
  rich("rich_text_list", "rich-text-list-element", 1, ["default", "mixed", "many-items"], {
    impl: { file: "packages/block-kit/src/blocks/RichText.tsx" },
    notes: "mixed: bullet and ordered, indent levels, offset, border.",
  }),
  rich("rich_text_quote", "rich-text-quote-element", 2, ["default", "long-content"], {
    impl: { file: "packages/block-kit/src/blocks/RichText.tsx" },
    unobservable: {
      mixed:
        "Its stylesheet variant is p-view_contents--sidebar: Slack's split-view sidebar surface, which Block Kit Builder doesn't preview",
    },
  }),
  rich(
    "rich_text_preformatted",
    "rich-text-preformatted-element",
    1,
    ["default", "hover", "focus-visible", "long-content", "mixed", "full-content", "scrolled-end"],
    {
      impl: { file: "packages/block-kit/src/blocks/RichText.tsx" },
      notes: "hover: the copy control. mixed: a language turns it into a code block.",
    },
  ),
  rich("text", "text-element", 1, ["default", "mixed"], {
    match: (o, key) => o.type === "text" && key === "elements",
    notes: "mixed: bold, italic, strike, code, underline and their combinations.",
  }),
  rich("link", "link-element", 1, ["default", "hover", "focus-visible", "pressed", "mixed"], {
    match: or(element("link"), text(/<https?:[^>]+>/)),
    notes: "Also mrkdwn <url|text> links.",
  }),
  rich("emoji", "emoji-element", 1, ["default", "hover", "mixed"], {
    match: or(element("emoji"), text(/:[a-z0-9_+-]+:/)),
    notes: "Also :shortcodes: in text objects. hover: the name tooltip.",
  }),
  rich("user", "user-element", 1, ["default", "hover", "mixed"], {
    match: or(element("user"), text(/<@[UW][A-Z0-9]+>/)),
    notes: "The mention chip; mixed: the viewer's own mention, an unresolved user.",
  }),
  rich("usergroup", "usergroup-element", 2, ["default", "hover", "mixed"], {
    match: or(element("usergroup"), text(/<!subteam\^/)),
  }),
  rich("channel", "channel-element", 1, ["default", "hover", "mixed"], {
    match: or(element("channel"), text(/<#[CG][A-Z0-9]+/)),
  }),
  rich("broadcast", "broadcast-element", 2, ["default", "mixed"], {
    match: or(element("broadcast"), text(/<!(here|channel|everyone)>/)),
  }),
  rich("date", "date-element", 2, ["default", "hover", "mixed"], {
    match: or(element("date"), text(/<!date\^/)),
    notes: "mixed: the format tokens and a link.",
  }),
  rich("color", "color-element", 3, ["default"]),
  rich("team", "team-element", 3, ["default"]),
  // In the reference, not implemented by the package.
  rich("file", "file-element", 3, ["default", "hover"], {
    match: (o, key) => o.type === "file" && key === "elements",
  }),
  rich("attachment_mention", "attachment-mention-element", 3, ["default", "hover"]),
  rich("canvas", "canvas-element", 3, ["default", "hover"]),
  rich("canvas_user_mention", "canvas-user-mention-element", 3, ["default", "hover"]),
  rich("canvas_message_unfurl", "canvas-message-unfurl-element", 3, ["default"]),
  rich("citation", "citation-element", 3, ["default", "hover"]),
  rich("list_record", "list-record-element", 3, ["default", "hover"]),
  rich("message_mention", "message-mention-element", 3, ["default", "hover"]),
  rich("salesforce_data_field", "salesforce-data-field-element", 3, ["default"]),
  rich("tag", "tag-element", 3, ["default"]),
  rich("work_object_mention", "work-object-mention-element", 3, ["default", "hover"]),
  rich("workflow_mention", "workflow-mention-element", 3, ["default", "hover"]),

  // Composition objects: drawn by the elements that hold them, so their facts are those elements'.
  {
    id: "text_object",
    name: "text object (plain_text, mrkdwn)",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/text-object",
    surfaces: ALL,
    tier: 1,
    states: ["default", "long-content", "mixed"],
    facts: ["styles"],
    match: element("plain_text", "mrkdwn"),
    impl: { file: "packages/block-kit/src/Text.tsx" },
    notes: "mixed: emoji: false, verbatim, escaping.",
  },
  {
    id: "confirm",
    name: "confirmation dialog",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/confirmation-dialog-object",
    surfaces: ALL,
    tier: 1,
    states: ["open", "hover", "focus-visible", "pressed", "mixed", "long-content"],
    match: under("confirm"),
    impl: { file: "packages/block-kit/src/confirm/ConfirmDialog.tsx" },
    notes: "mixed: style danger and primary, mrkdwn text.",
  },
  {
    id: "option",
    name: "option object",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/option-object",
    surfaces: ALL,
    tier: 1,
    states: ["default", "hover", "selected", "mixed", "long-content"],
    facts: ["styles", "behaviour"],
    match: under("options", "initial_options", "initial_option"),
    impl: { file: "packages/block-kit/src/elements/Select.tsx" },
    notes: "Seen in an open list and in choice groups. mixed: description, url.",
  },
  {
    id: "option_group",
    name: "option group object",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/option-group-object",
    surfaces: ALL,
    tier: 2,
    states: ["open", "many-items"],
    facts: ["styles", "behaviour"],
    match: under("option_groups"),
    impl: { file: "packages/block-kit/src/elements/Select.tsx" },
  },
  {
    id: "conversation_filter",
    name: "conversation filter object",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/conversation-filter-object",
    surfaces: ALL,
    tier: 3,
    states: ["open"],
    facts: ["behaviour"],
    match: under("filter"),
    impl: { file: "packages/block-kit/src/elements/Select.tsx" },
    notes:
      "Which conversations an open list keeps: needs a workspace with DMs, private and shared channels.",
  },
  {
    id: "dispatch_action_config",
    name: "dispatch action configuration",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/dispatch-action-configuration-object",
    surfaces: ALL,
    tier: 2,
    states: ["default", "pressed"],
    events: ["block_actions"],
    facts: ["styles", "behaviour", "payload"],
    match: (o, key) => key === "dispatch_action_config" || o.dispatch_action === true,
    impl: { file: "packages/block-kit/src/elements/characterDispatch.ts" },
    notes:
      "styles: the 'Press enter to submit' hint. pressed: Enter, or the configured characters.",
  },
  {
    id: "workflow",
    name: "workflow and trigger objects",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/workflow-object",
    surfaces: ["message"],
    tier: 3,
    states: ["pressed"],
    facts: ["behaviour"],
    match: under("workflow", "trigger"),
    impl: { file: "packages/block-kit/src/elements/WorkflowButton.tsx" },
    unobservable: { behaviour: "Starting a workflow needs a real trigger" },
  },
  {
    id: "slack_file",
    name: "Slack file object",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/slack-file-object",
    surfaces: ALL,
    tier: 2,
    states: ["default", "loading"],
    facts: ["styles"],
    match: under("slack_file"),
    impl: { file: "packages/block-kit/src/blocks/Image.tsx" },
    unobservable: { loading: NO_BACKEND },
    notes: "Needs a real workspace file (capture.local.json substitution).",
  },
  {
    id: "slack_icon",
    name: "Slack icon object",
    kind: "composition",
    source: "slack-docs",
    docs: "composition-objects/slack-icon-object",
    surfaces: ALL,
    tier: 2,
    states: ["default", "mixed"],
    facts: ["styles"],
    match: typed("icon"),
    impl: { file: "packages/block-kit/src/blocks/Card.tsx" },
    notes: "mixed: each of the ~55 documented icon names is its own glyph.",
  },

  // Surface chrome
  {
    id: "message-header",
    name: "message header (avatar, name, APP badge, time, edited)",
    kind: "chrome",
    source: "client",
    surfaces: ["message"],
    tier: 1,
    states: ["default", "hover", "focus-visible", "mixed", "long-content"],
    match: surface("message"),
    impl: { file: "packages/block-kit/src/Message.tsx" },
    unobservable: {
      mixed: "Builder's preview has no edited marker or custom bot name and icon (verify)",
    },
    notes: "hover: the time's full-date tooltip and the message's hover background.",
  },
  {
    id: "message-actions",
    name: "message hover toolbar (reactions, reply, more actions)",
    kind: "chrome",
    source: "client",
    surfaces: ["message"],
    tier: 2,
    states: ["hover", "focus-visible", "pressed", "open"],
    match: surface("message"),
    notes:
      "Optional chrome on <Message> (maintainer decision). Hidden at rest; hover: shown while the message is hovered, and each button's hover with its tooltip; open: the more-actions menu.",
  },
  {
    id: "message-attachments",
    name: "legacy attachments (colour bar, fields)",
    kind: "chrome",
    source: "client",
    surfaces: ["message"],
    tier: 3,
    states: ["default", "mixed", "long-content"],
    facts: ["styles"],
    match: (o, key, root) => o === root && Array.isArray(root.attachments),
    unobservable: {
      empty:
        "c-message_attachment's empty modifier: no documented attachment field produces it (verify in the Builder)",
    },
    impl: { file: "packages/block-kit/src/Message.tsx" },
  },
  {
    id: "message-reactions",
    name: "reactions",
    kind: "chrome",
    source: "client",
    surfaces: ["message"],
    tier: 3,
    states: ["default", "hover", "selected"],
    match: none,
    impl: { file: "packages/block-kit/src/Message.tsx" },
    unobservable: { styles: NOT_IN_BUILDER, motion: NOT_IN_BUILDER, behaviour: NOT_IN_BUILDER },
  },
  {
    id: "thread-summary",
    name: "thread summary",
    kind: "chrome",
    source: "client",
    surfaces: ["message"],
    tier: 3,
    states: ["default", "hover"],
    match: none,
    impl: { file: "packages/block-kit/src/Message.tsx" },
    unobservable: { styles: NOT_IN_BUILDER, motion: NOT_IN_BUILDER, behaviour: NOT_IN_BUILDER },
  },
  {
    id: "ephemeral-notice",
    name: "ephemeral 'Only visible to you'",
    kind: "chrome",
    source: "client",
    surfaces: ["message"],
    tier: 3,
    states: ["default"],
    match: none,
    impl: { file: "packages/block-kit/src/Message.tsx" },
    unobservable: { styles: NOT_IN_BUILDER, motion: NOT_IN_BUILDER, behaviour: NOT_IN_BUILDER },
  },
  {
    id: "modal-frame",
    name: "modal frame (title, icon, close, submit, cancel)",
    kind: "chrome",
    source: "client",
    surfaces: ["modal"],
    tier: 1,
    states: [
      "default",
      "hover",
      "focus-visible",
      "pressed",
      "disabled",
      "loading",
      "long-content",
      "mixed",
    ],
    events: ["view_submission", "view_closed"],
    match: surface("modal"),
    impl: { file: "packages/block-kit/src/surfaces/Modal.tsx" },
    unobservable: {
      loading: "Submitting waits on the app's response, which the Builder doesn't have",
      disabled: "submit_disabled only applies to legacy workflow step views (verify in Builder)",
    },
    notes: "long-content: a long title, and a body taller than the window (scrolling).",
  },
  {
    id: "modal-stack",
    name: "stacked modals (push, back, clear)",
    kind: "chrome",
    source: "client",
    surfaces: ["modal"],
    tier: 3,
    states: ["default", "toggled"],
    facts: ["styles", "motion", "behaviour"],
    match: none,
    impl: { file: "packages/block-kit/src/surfaces/ModalLayer.tsx" },
    unobservable: {
      styles: "Block Kit Builder previews one view; pushing needs views.push from an app",
      motion: "Block Kit Builder previews one view; pushing needs views.push from an app",
      behaviour: "Block Kit Builder previews one view; pushing needs views.push from an app",
    },
  },
  {
    id: "home-tab",
    name: "App Home tab",
    kind: "chrome",
    source: "client",
    surfaces: ["home"],
    tier: 2,
    states: ["default", "long-content", "mixed"],
    facts: ["styles", "behaviour"],
    match: surface("home"),
    impl: { file: "packages/block-kit/src/surfaces/HomeTab.tsx" },
  },

  // The package's client UI, drawn the way Slack's client draws it
  {
    id: "select-dialog",
    name: "multi-select accessory dialog",
    kind: "package-ui",
    source: "client",
    surfaces: ["message", "home"],
    tier: 2,
    states: ["open", "hover", "focus-visible", "pressed", "selected"],
    match: (o, key) => key === "accessory" && /^multi_.*select$/.test(o.type as string),
    impl: { file: "packages/block-kit/src/elements/SelectDialog.tsx" },
  },
  {
    id: "tooltip",
    name: "tooltips",
    kind: "package-ui",
    source: "client",
    surfaces: ALL,
    tier: 2,
    states: ["default", "hover", "focus-visible"],
    match: typed("card", "data_visualization", "feedback_buttons", "icon_button", "emoji"),
    impl: { file: "packages/block-kit/src/Tooltip.tsx" },
    notes: "behaviour: show and hide delays; motion: the fade; styles: the dark bubble and arrow.",
  },
  {
    id: "show-more",
    name: "section Show more",
    kind: "package-ui",
    source: "client",
    surfaces: ALL,
    tier: 1,
    states: ["default", "hover", "focus-visible", "toggled"],
    match: (o, key) =>
      o.type === "section" &&
      BLOCK_KEYS.has(key) &&
      typeof (o.text as Obj | undefined)?.text === "string" &&
      ((o.text as Obj).text as string).length > 300,
    impl: { file: "packages/block-kit/src/blocks/Section.tsx" },
  },
  {
    id: "chart-table-modal",
    name: "chart data table modal",
    kind: "package-ui",
    source: "client",
    surfaces: ["message", "home"],
    tier: 3,
    states: ["open", "hover", "focus-visible", "many-items"],
    match: block("data_visualization"),
    impl: { file: "packages/block-kit/src/blocks/DataVisualization.tsx" },
  },
  {
    id: "unsupported",
    name: "unsupported block or element",
    kind: "package-ui",
    source: "client",
    surfaces: ALL,
    tier: 3,
    states: ["default"],
    facts: ["styles"],
    match: none,
    impl: { file: "packages/block-kit/src/elements/Unsupported.tsx" },
    unobservable: {
      styles: "Block Kit Builder refuses a type it doesn't know and keeps the previous payload",
    },
  },
];
