/**
 * A second discovery source for the inventory: the rules of Block Kit Builder's stylesheets, as a
 * list of selectors with the state pseudo-classes and the property *names* they set (never their
 * values). Slack's own classes show states the docs don't mention (a button's loading spinner, a
 * menu item's highlighted row, an empty field's value), so every state a rule reveals becomes a
 * cell of the component its class belongs to.
 *
 * The list is captured outside the repository and passed to generate.ts with --stylesheet:
 *
 *   [{ "selector": ".c-button:hover", "pseudo": [":hover"], "properties": ["background"],
 *      "direct": true, "media": "...", "keyframes": ["..."] }]
 *
 * `direct` says the selector names a class a captured reference uses; otherwise it names another
 * class of the same component family (a hover- or open-only modifier). Classes map to components
 * by their BEM block (`c-select_input__content--focused` → `c-select_input`), or by block and
 * element where one block draws several components (`c-mrkdwn__broadcast`). A family that maps to
 * nothing is reported, as out of scope with a reason (Slack client UI that isn't Block Kit) or as
 * unmapped for review, never dropped.
 */
import { type FactKind, STATES, type StateId, type Width } from "./axes";

export interface DiscoveryRule {
  selector: string;
  pseudo: string[];
  /** Property names only. */
  properties: string[];
  direct?: boolean;
  media?: string;
  keyframes?: string[];
}

const PROPERTY = /^(-{0,2}[a-zA-Z][a-zA-Z0-9-]*|--[\w-]+)$/;

/**
 * Validates a discovery list. Anything that could carry Slack's CSS values (a property that isn't
 * a bare name, a `value` or `declarations` field) is refused, so they can't reach the inventory.
 */
export function parseDiscovery(value: unknown): DiscoveryRule[] {
  if (!Array.isArray(value)) throw new Error("A stylesheet discovery is a JSON array of rules");
  return value.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    const where = `rule ${i}`;
    if (!r || typeof r !== "object") throw new Error(`${where} isn't an object`);
    for (const k of Object.keys(r))
      if (!["selector", "pseudo", "properties", "direct", "media", "keyframes"].includes(k))
        throw new Error(`${where} has "${k}": a discovery keeps selectors and property names only`);
    if (typeof r.selector !== "string" || r.selector === "")
      throw new Error(`${where} has no selector`);
    const strings = (v: unknown, name: string) => {
      if (v === undefined) return [];
      if (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
        throw new Error(`${where}: ${name} must be a list of strings`);
      return v as string[];
    };
    const properties = strings(r.properties, "properties");
    const bad = properties.find((p) => !PROPERTY.test(p));
    if (bad !== undefined) throw new Error(`${where}: "${bad}" isn't a property name`);
    if (r.media !== undefined && typeof r.media !== "string")
      throw new Error(`${where}: media must be a string`);
    return {
      selector: r.selector,
      pseudo: strings(r.pseudo, "pseudo"),
      properties,
      direct: r.direct === true,
      media: r.media as string | undefined,
      keyframes: strings(r.keyframes, "keyframes"),
    };
  });
}

// Classes and families

/** A CSS module class (`multiSelectInput__uy4YB`): its local name and a 5-character hash. */
const MODULE = /^([a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*)__[A-Za-z0-9_-]{5}$/;

export function classesOf(selector: string): string[] {
  return [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
}

/**
 * The family a class belongs to: its BEM block for Slack's `c-`, `p-` and `sk-` classes,
 * `module:<name>` for a CSS module class, undefined for anything else (Quill's `ql-`, utilities).
 */
export function familyOf(cls: string): string | undefined {
  if (/^(c|p|sk)-/.test(cls)) return cls.split(/__|--/)[0];
  const m = MODULE.exec(cls);
  return m ? `module:${m[1]}` : undefined;
}

/** The block and first element of a BEM class (`c-mrkdwn__broadcast--mention` → `c-mrkdwn__broadcast`). */
const blockElement = (cls: string) => cls.split("--")[0]!.split("__").slice(0, 2).join("__");

/** Splits a selector list at its top-level commas. */
export function selectorParts(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

// Families → components

const SELECTS = [
  "static_select",
  "external_select",
  "users_select",
  "conversations_select",
  "channels_select",
  "multi_static_select",
  "multi_external_select",
  "multi_users_select",
  "multi_conversations_select",
  "multi_channels_select",
];
const MULTI = SELECTS.filter((s) => s.startsWith("multi_"));
const DIRECTORY = SELECTS.filter((s) => /users|conversations|channels/.test(s));
const TEXT_INPUTS = ["plain_text_input", "email_text_input", "url_text_input", "number_input"];

/** Families (or `block__element`s, which win) and the components they draw. */
export const FAMILIES: Record<string, string[]> = {
  "c-button": ["button"],
  "c-button-unstyled": ["button"],
  "c-button-loading": ["button"],
  "p-block_kit_button_element": ["button"],
  "c-icon_button": ["icon_button"],
  "p-actions_block": ["actions"],
  "p-actions_block_wrapper": ["actions"],
  "p-actions_block_elements": ["actions"],
  "p-action_block": ["actions"],
  "p-section_block": ["section"],
  "p-section_block_wrapper": ["section"],
  "p-section_block_text_content": ["section"],
  "p-field_section": ["section"],
  "c-rich_text_expand_button": ["show-more"],
  "c-rich_text_collapse_button": ["show-more"],
  "c-expandable_trigger": ["show-more"],
  "p-context_block": ["context"],
  "p-context_block_wrapper": ["context"],
  "p-context_block_group": ["context"],
  "p-context_block_spacing": ["context"],
  "p-mrkdwn_element": ["context"],
  "p-plain_text_element": ["context"],
  "p-header_block": ["header"],
  "p-rich_text_header": ["header"],
  "p-divider_block": ["divider"],
  "p-divider_block_wrapper": ["divider"],
  "p-image_block": ["image"],
  "p-image_block_container": ["image"],
  "p-image_block_wrapper": ["image"],
  "p-video_block": ["video"],
  "c-video_block": ["video"],
  "p-video_overlay": ["video"],
  "p-video_controls_overlay": ["video"],
  "c-video_player_controls_overlay": ["video"],
  "p-video_embed": ["video"],
  "p-gallery_scroller": ["carousel"],
  "p-contact_card": ["contact_card"],
  "p-block_kit_unknown_block_error": ["unsupported"],
  "c-alert": ["alert"],
  "p-block_kit_input_block": ["input"],
  "p-input_block_wrapper": ["input"],
  "p-block_kit_error_message": ["input"],
  "p-block_kit_max_selected_items": MULTI,
  "c-label": ["input"],
  "c-hint": ["input"],
  "c-fieldset": ["input"],
  "c-legend": ["input"],
  "c-form": ["input"],
  "c-select_input": SELECTS,
  "c-select_button": ["static_select"],
  "c-basic-select": SELECTS,
  "c-input_select": SELECTS,
  "c-search-select": SELECTS,
  "c-select_options_list": [...SELECTS, "option"],
  "c-select_options_list__group_header": ["option_group"],
  "c-select_options_list__group_option": ["option_group"],
  "c-input_select_options_list": SELECTS,
  "c-virtual_list": SELECTS,
  "p-block_kit_select_element": SELECTS,
  "p-block-kit-select_options": [...SELECTS, "option"],
  "module:multiSelectInput": MULTI,
  "module:removeToken": MULTI,
  "module:token": MULTI,
  "c-token": MULTI,
  "c-token_content": MULTI,
  "c-token_channel": ["multi_channels_select", "multi_conversations_select"],
  "c-base_list_entity": DIRECTORY,
  "c-base_entity": DIRECTORY,
  "c-menu": ["overflow"],
  "c-menu_item": ["overflow"],
  "c-submenu": ["overflow"],
  "p-block_kit_overflow_element": ["overflow"],
  "c-input_checkbox": ["checkboxes"],
  "c-checkboxgroup": ["checkboxes"],
  "p-checkboxes_element": ["checkboxes"],
  "c-input_radio": ["radio_buttons"],
  "c-radiogroup": ["radio_buttons"],
  "p-radio_buttons_element": ["radio_buttons"],
  "c-radio_button_card": ["radio_buttons"],
  "c-date_picker": ["datepicker"],
  "c-date_picker_input": ["datepicker"],
  "c-date_picker_calendar": ["datepicker"],
  "c-mini_calendar": ["datepicker"],
  "c-calendar_month": ["datepicker"],
  "c-calendar_view_header": ["datepicker"],
  "c-calendar_view_header_btn": ["datepicker"],
  "p-block_kit_date_picker": ["datepicker"],
  "p-block_kit_date_picker_button": ["datepicker"],
  "c-date_time_picker": ["datetimepicker"],
  "p-block_kit_datetime_picker": ["datetimepicker"],
  "c-time_picker": ["timepicker"],
  "c-time_picker_options_list": ["timepicker"],
  "c-input_text": TEXT_INPUTS,
  "c-input_textarea": ["plain_text_input"],
  "c-input_text_icon": ["datepicker", "timepicker"],
  "c-texty_input": ["rich_text_input"],
  "c-texty_input_unstyled": ["rich_text_input"],
  "c-texty_input_unstyled_container": ["rich_text_input"],
  "c-wysiwyg_container": ["rich_text_input"],
  "c-texty_buttons": ["rich_text_input"],
  "p-texty_floating_formatting_bar": ["rich_text_input"],
  "p-texty_sticky_formatting_bar": ["rich_text_input"],
  "c-basic_container": ["rich_text_input"],
  "c-mrkdwn": ["text_object"],
  "c-mrkdwn__pre": ["rich_text.rich_text_preformatted"],
  "c-mrkdwn__code": ["rich_text.text"],
  "c-mrkdwn__quote": ["rich_text.rich_text_quote"],
  "c-mrkdwn__quote_group": ["rich_text.rich_text_quote"],
  "c-mrkdwn__mention": ["rich_text.user"],
  "c-mrkdwn__user_group": ["rich_text.usergroup"],
  "c-mrkdwn__broadcast": ["rich_text.broadcast"],
  "c-mrkdwn__highlight": ["rich_text.user"],
  "c-mrkdwn__subteam": ["rich_text.usergroup"],
  "c-mrkdwn__color": ["rich_text.color"],
  "c-mrkdwn__date": ["rich_text.date"],
  "module:container": ["rich_text.rich_text_preformatted"],
  "module:code": ["rich_text.rich_text_preformatted"],
  "module:language": ["rich_text.rich_text_preformatted"],
  "p-rich_text_block": ["rich_text"],
  "p-rich_text_section": ["rich_text.rich_text_section"],
  "p-rich_text_list": ["rich_text.rich_text_list"],
  "p-rich_text_canvas_message_unfurl": ["rich_text.canvas_message_unfurl"],
  "p-rich_text_salesforce_data_field": ["rich_text.salesforce_data_field"],
  "p-rich_text_slug": ["rich_text.user", "rich_text.channel", "rich_text.usergroup"],
  "c-link": ["rich_text.link"],
  "c-emoji": ["rich_text.emoji"],
  "c-member_slug": ["rich_text.user"],
  "c-member_name": ["rich_text.user"],
  "c-inline_member_entity": ["rich_text.user"],
  "c-base_inline_entity": ["rich_text.user", "rich_text.channel"],
  "c-missing_text": ["rich_text.user", "rich_text.channel"],
  "c-channel_entity": ["rich_text.channel"],
  "c-inline_channel_entity": ["rich_text.channel"],
  "c-small_channel_entity": ["rich_text.channel"],
  "c-missing_channel": ["rich_text.channel"],
  "c-channel_icon": ["rich_text.channel"],
  "c-inline_channel_icon": ["rich_text.channel"],
  "c-small_user_group": ["rich_text.usergroup"],
  "c-tooltip": ["tooltip"],
  "c-dialog": ["confirm", "select-dialog"],
  "c-fullscreen_modal": ["modal-frame"],
  "c-sk-modal_content_section": ["modal-frame"],
  "p-block_kit_modal": ["modal-frame"],
  "p-bkb_preview_modal": ["modal-frame"],
  "p-view_contents": ["modal-frame", "home-tab"],
  "p-view_header": ["modal-frame"],
  "p-app_dialog": ["modal-frame"],
  "p-app_dialog_elements": ["input"],
  "p-bkb_app_home": ["home-tab"],
  "c-message": ["message-header"],
  "c-message_group": ["message-header"],
  "c-message_kit": ["message-header"],
  "c-app_badge": ["message-header"],
  "c-app_label": ["message-header"],
  "c-avatar": ["message-header"],
  "c-timestamp": ["message-header"],
  "c-message_attachment": ["message-attachments"],
  "c-message_attachment_v2": ["message-attachments"],
  "c-message_attachment_v3": ["message-attachments"],
  "c-message_attachment_hover": ["message-attachments"],
  "p-message_attachment": ["message-attachments"],
  "p-attachment_image_actions": ["message-attachments"],
  "c-reaction": ["message-reactions"],
  "c-message_actions": ["message-actions"],
  "c-message-actions": ["message-actions"],
  "module:bw_icon": ["message-actions"],
  "module:color_icon": ["message-actions"],
  "c-file": ["file"],
  "c-file_entity": ["file"],
  "c-file_container": ["file"],
  "c-pillow_file": ["file"],
  "c-pillow_file_container": ["file"],
  "p-message_file": ["file"],
  "module:dataTableBlockCell": ["data_table"],
  "module:dataTableBlockContainer": ["data_table"],
  "module:dataTableBlockRowBody": ["data_table"],
  "module:dataTableBlockRowsContainer": ["data_table"],
  "module:calloutBlock": ["callout"],
  "module:citationLink": ["rich_text.citation"],
  "module:taskContent": ["task_card"],
  "module:taskContentSlim": ["task_card"],
  "module:taskContentSection": ["task_card"],
  "c-table_cell": ["table", "data_table"],
  "c-table_cell_container": ["table", "data_table"],
  "c-table_column_header": ["data_table"],
  "c-table_select_cell": ["data_table"],
  "c-table_select_column": ["data_table"],
  "c-table_view_header_item": ["data_table"],
  "c-table_view_header_item_value": ["data_table"],
  "c-data_table": ["data_table"],
  "p-data_table_header": ["data_table"],
  "p-data_table_header_count_selected": ["data_table"],
};

/**
 * Families of Slack's client that aren't Block Kit, with why. A rule that names any class of one
 * of them styles something in that context (a date field inside a List's row), so the whole rule
 * is out of scope, not just its out-of-scope classes. Checked in order.
 */
const UNMAPPED = "No component maps it yet: review whether it draws Block Kit";

const SHARED =
  "A shared primitive (icon font, layout helper, theme tokens, spinner): its facts belong to the component that uses it";

export const OUT_OF_SCOPE: [RegExp, string][] = [
  [
    /huddle|zoom|call_menu|media_controls|media_volume|audio|clips|video_recorder|video_composer|video_message/,
    "Huddles, calls, clips and media recording",
  ],
  [/quip|canvas|ql-|p-sui-canvas|embedded_canvas|p-file_quip/, "Canvases and the canvas editor"],
  [
    /p-list_|p-lists_|p-list-|p-grid|p-board_card|p-bulk_grid|p-column_editor|p-entity_field|p-select_field_option|p-field|p-embedded_.*list|p-add_to_list|p-list_picker|p-opportunities|p-add_column|p-variable/,
    "Slack Lists",
  ],
  [
    /composer|message_input|p-schedule_message|p-draft|p-placeholder_input|c-texty_autocomplete|c-texty_workflow_token|c-texty_canvas_variable|c-texty_opaque_block|c-texty_divider|p-workflowtoken|p-embedded_link_editor/,
    "The message composer",
  ],
  [/search|explorer|refine|p-peek_card|p-more_filters|p-group_by|p-recap/, "Search"],
  [
    /activity|saved|later|p-sent_page|p-recent_page|p-drafts_page|threads|p-dms_page|p-unreads|p-pinned|p-message_activity|p-new_threads_banner/,
    "Activity, saved items, threads and other client pages",
  ],
  [
    /browse|sidebar|p-ia|ia4|ia2022|p-classic_nav|p-workspace|team_picker|c-team|p-team|p-window_layout|p-client_desktop|p-control_strip|p-home_header|c-tabs|c-channel_tabs|p-channel_tab|p-view_switcher|p-edit_view|p-view_header_channel|p-escape_hatch/,
    "Client navigation and layout",
  ],
  [
    /emoji_picker|gif_picker|customize_emoji|skintone|p-add_alias|p-rename_emoji|p-add_custom_emoji|p-delete_custom_emoji|p-huddle_quick_emoji/,
    "The emoji picker and custom emoji",
  ],
  [
    /setup|onboarding|invite|slack_connect|external|trial|upgrades|pro_badge|freemium|coachmark|nux|p-promote|speedbump|educational|p-sponsored|p-connect|identity_transfer|verify_email|p-step_|p-shared_invite|p-comprehensible|p-start_trial|c-joiner/,
    "Onboarding, invites, Slack Connect and upgrades",
  ],
  [
    /prefs|p-custom_status|c-custom_status|p-member_profile|p-r_member_profile|p-ia_member_profile|p-app_profile|p-rimeto|p-about_modal|p-integrations|app_directory|app_launcher|app_management|app_permission|oauth|p-app_actions_dialog|shortcuts|slash_commands|workflow_picker|p-workflow_trigger|p-search_workflows/,
    "Preferences, profiles, apps and workflows management",
  ],
  [
    /channel_(details|managers|email|notification|invite|purpose|topic|name_input)|create_channel|p-deprecated_channel|p-channel_create|p-view_channel_permissions|p-manage_permissions|p-share_dialog|p-canvas-share|p-download|c-downloads|p-file_upload|p-multi_file_upload|p-pending_file|c-pending_files|p-create_gdoc|p-snippet_dialog|p-ignore_forked|p-ai_|p-create_event|c-date_range|c-wizard_modal|c-advanced_search|p-identity|p-edit_user|p-user_relevant|p-add_workspaces|p-channel_|p-media_viewer/,
    "Client dialogs (channels, files, sharing, admin)",
  ],
  [
    /p-bkb_remove_blocks_warning|p-block_kit_builder|p-sui-bkb_previews|p-bkb_preview(?!_modal)|module:(dragWrapper|isDraggable|blockSidebar|blockSlim)$/,
    "Block Kit Builder's own editor UI",
  ],
  [
    /c-toast|c-banner|p-upgrades_alert|c-empty_state|c-hidden_user|c-slack_app_icon|c-legend--|c-filter-pill|p-facepile|p-avatar_stack|c-file_metadata_avatar_stack|c-message_stats|c-message_list|c-sidebar_menu|p-sidebar_link|p-message_column|p-message_field_card|p-message_container_error|c-search_query/,
    "Client chrome outside Block Kit messages",
  ],
  [
    /^(c-icon|c-base_icon|c-deprecated-icon|c-missing_icon|c-base_icon_image_stacked|c-aspect_box|c-truncate|c-presence|sk-client-theme|c-slackslug|c-infinite_spinner|c-popover|c-badge|c-team_icon)$/,
    SHARED,
  ],
];

// States

/**
 * Classes that only exist in one state: an open list's rows, a calendar, a dialog, a button's
 * loading spinner. A rule naming one is about that state even when its selector names no other.
 */
export const IMPLIED: Record<string, StateId> = {
  "c-button-loading": "loading",
  "c-rich_text_expand_button": "toggled",
  "c-rich_text_collapse_button": "toggled",
  "c-select_options_list": "open",
  "c-select_options_list__loading_state": "loading",
  "c-input_select_options_list": "open",
  "c-time_picker_options_list": "open",
  "c-menu": "open",
  "c-menu_item": "open",
  "c-submenu": "open",
  "c-date_picker_calendar": "open",
  "c-mini_calendar": "open",
  "c-calendar_month": "open",
  "c-calendar_view_header": "open",
  "c-calendar_view_header_btn": "open",
  "c-dialog": "open",
  "c-tooltip": "hover",
};

const PSEUDO_STATES: Record<string, StateId> = {
  ":hover": "hover",
  ":focus-visible": "focus-visible",
  ":focus": "focus-visible",
  ":focus-within": "focus-visible",
  ":active": "pressed",
  ":disabled": "disabled",
  ":checked": "selected",
  ":placeholder": "empty",
  ":placeholder-shown": "empty",
  ":empty": "empty",
  ":invalid": "validation-error",
};

/** BEM modifiers (and bare state classes) that name a state rather than a variant. */
const MODIFIER_STATES: Record<string, StateId> = {
  hover: "hover",
  hovered: "hover",
  highlighted: "hover",
  highlight: "hover",
  focus: "focus-visible",
  focused: "focus-visible",
  "focus-visible": "focus-visible",
  focus_visible: "focus-visible",
  is_focused: "focus-visible",
  input_focused: "focus-visible",
  focus_input: "focus-visible",
  active: "pressed",
  pressed: "pressed",
  disabled: "disabled",
  selected: "selected",
  is_selected: "selected",
  checked: "selected",
  invalid: "validation-error",
  error: "validation-error",
  with_error: "validation-error",
  loading: "loading",
  expanded: "toggled",
  collapsed: "toggled",
  open: "open",
  empty_value: "empty",
  empty: "empty",
  placeholder: "empty",
};

const ATTRIBUTE_STATES: [RegExp, StateId][] = [
  [/\[disabled\]|\[aria-disabled=["']?true/, "disabled"],
  [/\[aria-(checked|selected|pressed)=["']?true|\[data-checked=["']?true/, "selected"],
  [/\[aria-expanded=["']?true/, "open"],
  [/\[aria-invalid=["']?true/, "validation-error"],
  [/\[data-(focus|focused)\]/, "focus-visible"],
  [/\[data-(hover|hovered)\]/, "hover"],
];

/** Modifiers that are sizes or layout, not variants worth a `mixed` fact. */
const NOT_VARIANTS =
  /^(small|medium|large|tiny|size_\w+|inline|block|first|last|nested|compact|full_width|with_\w+|has[-_]\w+|no[-_]\w+|a11y|ia4|resetIA|slack_scrollbar\w*|sticky|floating|adjoin)$/;

/** The states one part of a selector list puts its subject in, and the variants it names. */
export function statesOf(part: string): { states: StateId[]; variants: string[] } {
  const states = new Set<StateId>();
  const variants = new Set<string>();
  for (const m of part.matchAll(/:{1,2}([a-z-]+)/g)) {
    const s = PSEUDO_STATES[`:${m[1]}`];
    if (s) states.add(s);
  }
  for (const cls of classesOf(part)) {
    // The client theme (`sk-client-theme--dark`) isn't a variant of the component.
    if (cls.startsWith("sk-client-theme")) continue;
    const bare = MODIFIER_STATES[cls];
    if (bare) states.add(bare);
    const mod = /--([\w-]+)$/.exec(cls)?.[1];
    if (!mod) continue;
    const s = MODIFIER_STATES[mod];
    if (s) states.add(s);
    else if (!NOT_VARIANTS.test(mod)) variants.add(mod);
  }
  for (const [re, s] of ATTRIBUTE_STATES) if (re.test(part)) states.add(s);
  // `:not(:hover)` and friends name the state's absence.
  for (const m of part.matchAll(/:not\(([^)]*)\)/g))
    for (const [p, s] of Object.entries(PSEUDO_STATES)) if (m[1]!.includes(p)) states.delete(s);
  return { states: [...states], variants: [...variants] };
}

const MOTION = /^(transition|animation)/;

// Discovery

export interface Discovered {
  rules: number;
  direct: number;
  facts: Set<FactKind>;
  widths: Set<Width>;
  families: Set<string>;
  variants: Set<string>;
  keyframes: Set<string>;
}

export interface FamilyReport {
  family: string;
  rules: number;
  direct: number;
  status: "mapped" | "out-of-scope" | "unmapped";
  components?: string[];
  reason?: string;
  /** States its rules reveal. */
  states: StateId[];
  examples: string[];
}

export interface Discovery {
  /** By component id, then state. */
  byComponent: Map<string, Map<StateId, Discovered>>;
  families: FamilyReport[];
  rules: { total: number; mapped: number; outOfScope: number; unmapped: number };
}

const outOfScope = (family: string) => OUT_OF_SCOPE.find(([re]) => re.test(family))?.[1];

/** The components a class draws, through its `block__element` or its family. */
function componentsOf(cls: string): string[] | undefined {
  const family = familyOf(cls);
  if (!family) return undefined;
  return FAMILIES[blockElement(cls)] ?? FAMILIES[family];
}

/**
 * Maps each rule to the components it styles and the states it reveals. A selector list counts
 * part by part. Its subject is the rightmost class with a known component (walking left past
 * shared primitives like `c-icon`), and the states are those named anywhere in the part: a
 * `.c-select_input:hover .c-icon` rule is the select's hover.
 */
export function discover(rules: DiscoveryRule[], known: Set<string>): Discovery {
  const byComponent = new Map<string, Map<StateId, Discovered>>();
  const families = new Map<string, FamilyReport>();
  const totals = { total: rules.length, mapped: 0, outOfScope: 0, unmapped: 0 };
  const family = (name: string): FamilyReport => {
    if (!families.has(name)) {
      const reason = FAMILIES[name] ? undefined : outOfScope(name);
      families.set(name, {
        family: name,
        rules: 0,
        direct: 0,
        status: FAMILIES[name] ? "mapped" : reason ? "out-of-scope" : "unmapped",
        components: FAMILIES[name],
        reason: FAMILIES[name] ? undefined : (reason ?? UNMAPPED),
        states: [],
        examples: [],
      });
    }
    return families.get(name)!;
  };

  for (const rule of rules) {
    let outcome: "mapped" | "out-of-scope" | "unmapped" = "unmapped";
    for (const part of selectorParts(rule.selector)) {
      const classes = classesOf(part);
      const names = [...new Set(classes.map(familyOf).filter((f): f is string => !!f))];
      const { states, variants } = statesOf(part);
      for (const name of names) {
        const f = family(name);
        f.rules++;
        if (rule.direct) f.direct++;
        for (const s of states) if (!f.states.includes(s)) f.states.push(s);
        if (f.examples.length < 3 && !f.examples.includes(part)) f.examples.push(part);
      }
      // A rule inside another part of the client is out of scope, whatever else it names.
      const context = names.find((n) => !FAMILIES[n] && outOfScope(n) && outOfScope(n) !== SHARED);
      if (context) {
        if (outcome === "unmapped") outcome = "out-of-scope";
        continue;
      }
      const subject = classes
        .toReversed()
        .map(componentsOf)
        .find((c) => c && c.length > 0);
      if (!subject) {
        if (outcome === "unmapped" && names.length > 0 && names.every((n) => outOfScope(n)))
          outcome = "out-of-scope";
        continue;
      }
      outcome = "mapped";
      const motion =
        rule.properties.some((p) => MOTION.test(p)) || (rule.keyframes?.length ?? 0) > 0;
      const style = rule.properties.some((p) => !MOTION.test(p));
      const mobile = /width\s*<=|max-width|not all and \(width\s*>=/.test(rule.media ?? "");
      const implied = [
        ...new Set(
          classes
            .map((c) => IMPLIED[blockElement(c)] ?? IMPLIED[familyOf(c) ?? ""])
            .filter((st): st is StateId => !!st),
        ),
      ];
      const revealed: StateId[] =
        states.length > 0
          ? states
          : implied.length > 0
            ? implied
            : variants.length > 0
              ? ["mixed"]
              : ["default"];
      for (const id of subject.filter((c) => known.has(c))) {
        if (!byComponent.has(id)) byComponent.set(id, new Map());
        for (const state of revealed) {
          const m = byComponent.get(id)!;
          if (!m.has(state))
            m.set(state, {
              rules: 0,
              direct: 0,
              facts: new Set(),
              widths: new Set(),
              families: new Set(),
              variants: new Set(),
              keyframes: new Set(),
            });
          const d = m.get(state)!;
          d.rules++;
          if (rule.direct) d.direct++;
          if (style) d.facts.add("styles");
          if (motion) d.facts.add("motion");
          d.widths.add(mobile ? "mobile" : "desktop");
          for (const n of names) d.families.add(n);
          for (const v of variants) d.variants.add(v);
          for (const k of rule.keyframes ?? []) d.keyframes.add(k);
        }
      }
    }
    totals[outcome === "out-of-scope" ? "outOfScope" : outcome]++;
  }
  return {
    byComponent,
    families: [...families.values()].toSorted(
      (a, b) => b.rules - a.rules || a.family.localeCompare(b.family),
    ),
    rules: totals,
  };
}

/** Whether a string is one of the inventory's states. */
export const isState = (s: string): s is StateId => (STATES as readonly string[]).includes(s);
