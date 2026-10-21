/**
 * Control addresses: how a reference name, a state style or a behaviour probe points at one control
 * of a fixture on both sides, Slack's preview and our rendering.
 *
 *   <kind>-<n>        the nth control of the kind, counted from 1 in document order
 *
 * `button-2` is the second button, `field-1` the first select or picker field. An address counts
 * controls, not text or roles: the payload fixes how many controls of a kind there are and in which
 * order, on both sides, while accessible names differ (Slack's static select is a combobox named
 * after its placeholder, ours a button) and texts change with the fixture. It extends the open
 * states' "first control of the kind" (states.ts OPENERS) to any control.
 *
 * Each kind has a selector per side. Where one control matches several times (a picker's wrapper
 * and its input), only the outermost match counts, so a picker is one control on both sides.
 *
 * Most kinds are counted in the message (Slack's preview, our `#sbk-render`). The LAYER_KINDS are
 * counted in the open layers instead (a list's options, a menu's items, a confirm dialog's
 * buttons): Slack portals them out of the preview and so do we, so the message can't hold them,
 * and only the layer that's open has any. Their index runs over all open layers in page order.
 *
 * Kinds whose Slack selector no reference shows yet are listed in UNVERIFIED: a capture that
 * addresses one stops with "the preview has no <address>" when the guess is wrong, and the
 * selector is corrected from that capture.
 * capture.js and observe.js run in the Builder without imports and carry the Slack selectors
 * verbatim; targets.test.ts fails when they drift from SLACK here.
 */

/**
 * The `scroller` kind's "selector": a block that scrolls itself (a carousel, a data table, a wide
 * chart or table), found by its computed overflow rather than a class: an element with
 * `overflow-x` or `overflow-y` `auto` or `scroll` whose content is larger than its box that way.
 */
export const SCROLLER = "@scroller";

export const KINDS = [
  "button",
  "overflow",
  "field",
  "checkbox",
  "radio",
  "input",
  "submit",
  "cancel",
  "link",
  "mention",
  "card",
  "arrow",
  "menu",
  "column",
  "page",
  "more",
  "action",
  "option",
  "menuitem",
  "confirm",
  "deny",
  "richtext",
  "file",
  "icon",
  "feedback",
  "collapse",
  "pill",
  "task",
  "contact",
  "expand",
  "source",
  "sender",
  "time",
  "scroller",
  "video",
  "tooltip",
  "chip",
] as const;
export type Kind = (typeof KINDS)[number];

/** Slack's preview, as Block Kit Builder renders it (class names measured in the references). */
export const SLACK: Record<Kind, string> = {
  // A modal's footer buttons are c-buttons too; they're `submit` and `cancel`. So is a file input's
  // button, which sits right in its input block's fieldset; it's `file`. So is a section
  // accessory's multi-select, which opens a selection dialog; it's a `field`, as ours is.
  button:
    'button.c-button:not([aria-label="More options"]):not(.p-bkb_preview_modal__submit):not(.p-bkb_preview_modal__cancel):not(.c-fieldset > button):not(:has([data-qa="bk-multi_select_input"]))',
  overflow: 'button[aria-label="More options"]',
  // Selects (a combobox button or a typeable input), time lists, date pickers and both halves of a
  // datetime picker. A section accessory's multi-select is a c-button holding the placeholder
  // (`bk-multi_select_input`), which opens the selection dialog.
  field:
    '.c-select_input, [role="combobox"], .c-date_picker_input, button.c-button:has([data-qa="bk-multi_select_input"])',
  checkbox: "input.c-input_checkbox",
  radio: "input.c-input_radio",
  // Plain text, number, email and URL inputs, single or multiline. Only the plain text input carries
  // a p-block_kit_ class; the number input has its own data-qa, and the email and URL inputs are bare
  // c-input_text inputs of their type (a date picker's input is type text).
  input:
    'input[class*="p-block_kit_"][class*="_input_element"], textarea[class*="p-block_kit_"], input[data-qa="block-kit-number-input-element"], input.c-input_text[type="email"], input.c-input_text[type="url"]',
  submit: ".p-bkb_preview_modal__submit",
  cancel: ".p-bkb_preview_modal__cancel",
  // A mrkdwn, rich text or markdown link; not an image's link or an icon button drawn as a link.
  // Rich text sometimes draws one without the underline class (a task card's output).
  link: "a.c-link.c-link--underline, .p-rich_text_section a.c-link",
  // A user, channel, user group or broadcast mention, resolved or not.
  mention: '.c-member_slug, .c-mrkdwn__broadcast, .c-missing_text, [class*="c-missing_channel"]',
  card: '[class^="card__"], [class*=" card__"]',
  // A carousel's scroll buttons, left before right.
  arrow: 'button[aria-label="Scroll left"], button[aria-label="Scroll right"]',
  // The More actions menu of an image block and of a chart.
  menu: '[data-qa="more_attachment_actions"], [class*="chartActionsGroup"] .c-message_actions__button',
  // A data table's sortable column header.
  column: '[role="columnheader"] button',
  // A data table's pagination: back, each page, forward.
  page: '[data-qa^="c-pagination_"]',
  more: '.p-section_block [data-qa="show_more_button"], .p-section_block__show_more',
  // The message hover toolbar's buttons (not a chart's own actions).
  action: '.c-message_actions__group:not([class*="chartActionsGroup"]) .c-message_actions__button',
  option: '.ReactModalPortal [role="option"]',
  menuitem: '.ReactModalPortal [role="menuitem"], .ReactModalPortal [role="menuitemradio"]',
  confirm: ".ReactModalPortal .c-dialog__go",
  deny: ".ReactModalPortal .c-dialog__cancel",
  richtext: '.ql-editor[role="textbox"]',
  file: ".p-block_kit_input_block .c-fieldset > button.c-button",
  icon: '[data-qa="bk_icon_button"]',
  // Each of a feedback pair: positive, then negative.
  feedback: '[data-qa^="bk_feedback_button_"]',
  // A collapsible container's header.
  collapse: '[data-qa="bk_container_block_header"]',
  // A plan's or task card's status pill, which expands it.
  pill: '[class*="toggleBarButton"]',
  // A plan's task header, which expands the task.
  task: '[class*="taskHeaderCollapsible"]',
  contact: '[data-qa="bk_contact_card_block"]',
  // An image block's title toggle, which hides and shows the image (a video's title has one too,
  // which ours doesn't draw).
  expand: '.c-expandable_trigger[aria-label="image"]',
  // A plan's or task card's source link. Both draw each source as `[data-qa="source"]`, and only
  // while expanded: the plan and the task card start collapsed (a click on the pill opens them).
  source: '[data-qa="source"] a.c-link',
  // The message header: the app's name and the time.
  sender: ".p-bkb_preview__app_name",
  time: ".c-timestamp",
  // Not a selector: any element that overflows the way it scrolls (scrollers.ts).
  scroller: SCROLLER,
  // A video block's player: the play overlay over its thumbnail.
  video: ".p-video_overlay__button",
  // A tooltip showing (after a hover), counted in the open layers.
  tooltip: '[role="tooltip"], .c-tooltip',
  // A multi-select's chosen option, as a token in the field.
  chip: ".c-token",
};

/** Our rendering. */
export const OURS: Record<Kind, string> = {
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
    ".sbk-mention, .sbk-mention--broadcast, .sbk-mention--private, .sbk-mention--unresolved, .sbk-mention--missing, .sbk-mention--loading",
  card: ".sbk-card",
  arrow:
    '.sbk-carousel button[aria-label="Scroll left"], .sbk-carousel button[aria-label="Scroll right"]',
  menu: ".sbk-hover-actions--image .sbk-hover-actions__menu-root > .sbk-hover-actions__button, .sbk-hover-actions--chart .sbk-hover-actions__menu-root > .sbk-hover-actions__button",
  column: ".sbk-data-table__col-header button",
  page: ".sbk-data-table__pagination button",
  more: ".sbk-section__toggle",
  // Not drawn yet: <Message>'s optional hover toolbar.
  action: ".sbk-message-actions__button",
  option: '.sbk-popover [role="option"], .sbk-select-dialog [role="option"]',
  menuitem: '.sbk-popover [role="menuitem"], .sbk-popover [role="menuitemradio"]',
  confirm: ".sbk-confirm__button:not(.sbk-confirm__button--deny)",
  deny: ".sbk-confirm__button--deny",
  richtext: ".sbk-rich-text-input__editor",
  file: ".sbk-file-input__button",
  // Our feedback buttons are icon buttons too, with the radio role.
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
  scroller: SCROLLER,
  video: "a.sbk-video__frame",
  tooltip: ".sbk-tooltip",
  chip: ".sbk-select__chip",
};

/** Kinds counted in the open layers rather than the message. */
export const LAYER_KINDS: readonly Kind[] = ["option", "menuitem", "confirm", "deny", "tooltip"];

/** Kinds whose Slack selector no reference has confirmed yet. */
export const UNVERIFIED: readonly Kind[] = ["more", "action", "tooltip"];

/**
 * Kinds that take no keyboard focus themselves in Block Kit Builder's preview: the message header's
 * app name and time are plain spans there (the Slack client makes them a button and a link), and a
 * card is a container whose first focusable part is one of its buttons (ours is the same). A
 * `focus-<kind>-<n>` capture of one can't hold, so the capture plan doesn't ask for it.
 */
export const UNFOCUSABLE: readonly Kind[] = ["sender", "time", "card"];

/** Where a kind's controls are counted on our side: the message, or the whole page. */
export const ourRoot = (kind: Kind): string | null =>
  LAYER_KINDS.includes(kind) ? null : "#sbk-render";

export interface Target {
  kind: Kind;
  /** 1-based. */
  index: number;
}

const ADDRESS = /^([a-z]+)-([1-9]\d*)$/;

/** The target an address names, or undefined when it isn't one. */
export function parseTarget(address: string): Target | undefined {
  const match = ADDRESS.exec(address);
  if (!match || !(KINDS as readonly string[]).includes(match[1]!)) return undefined;
  return { kind: match[1] as Kind, index: Number(match[2]) };
}

export const formatTarget = ({ kind, index }: Target) => `${kind}-${index}`;

/**
 * The page function that finds a target: the outermost matches of `selector` under `root`, the
 * `index`th of them (1-based). Passed to page.evaluate, so it can't use anything outside itself.
 */
export function findTarget([selector, index, root]: [
  string,
  number,
  string | null,
]): Element | null {
  const scope = root ? document.querySelector(root) : document;
  if (!scope) return null;
  // The scroller kind (SCROLLER), written out here because a page function can't see the module.
  const all =
    selector === "@scroller"
      ? [...scope.querySelectorAll("*")].filter((el) => {
          const cs = getComputedStyle(el);
          return (
            (/^(auto|scroll)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
            (/^(auto|scroll)$/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)
          );
        })
      : [...scope.querySelectorAll(selector)];
  const outer = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
  return outer[index - 1] ?? null;
}

/** The element types of a payload that make each kind of control, for coverage. */
export const KIND_OF_ELEMENT: Record<string, Kind> = {
  button: "button",
  workflow_button: "button",
  overflow: "overflow",
  static_select: "field",
  external_select: "field",
  users_select: "field",
  conversations_select: "field",
  channels_select: "field",
  multi_static_select: "field",
  multi_external_select: "field",
  multi_users_select: "field",
  multi_conversations_select: "field",
  multi_channels_select: "field",
  datepicker: "field",
  timepicker: "field",
  datetimepicker: "field",
  checkboxes: "checkbox",
  radio_buttons: "radio",
  plain_text_input: "input",
  number_input: "input",
  email_text_input: "input",
  url_text_input: "input",
  rich_text_input: "richtext",
  file_input: "file",
  icon_button: "icon",
  feedback_buttons: "feedback",
};
