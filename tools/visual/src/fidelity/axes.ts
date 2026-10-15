/**
 * The axes of the fidelity inventory (inventory.ts): every fact about Slack's rendering is a cell
 * `<component> × <state> × <theme> × <width> × <fact kind>`. A cell only exists where the axis
 * applies: a state the component has, a width its surfaces are previewed at, and a fact kind that
 * says something about that state.
 */

/**
 * States a component can be seen or used in. Each component lists the ones it has (components.ts).
 *
 * - `toggled`: a disclosure in its other position (a collapsed container, an expanded plan, a
 *   hidden image, a sorted or paged table, a scrolled carousel, a section's "Show more").
 * - `empty`: nothing chosen or typed, so the placeholder shows.
 * - `long-content`: text long enough to wrap, truncate or grow the control.
 * - `many-items`: as many options or items as Slack allows, so lists scroll or paginate.
 * - `mixed`: the variants a payload can mix in (option groups, descriptions, button styles, icons).
 * - `full-content`: content wider than its block (a chart card's 400px minimum, a wide table),
 *   captured unclipped, as if the block were wide enough.
 * - `scrolled-end`: the same content scrolled sideways to its end.
 */
export const STATES = [
  "default",
  "hover",
  "focus-visible",
  "pressed",
  "open",
  "toggled",
  "selected",
  "disabled",
  "validation-error",
  "loading",
  "empty",
  "initial-value",
  "long-content",
  "many-items",
  "mixed",
  "full-content",
  "scrolled-end",
] as const;
export type StateId = (typeof STATES)[number];

/** The payloads Slack sends. A payload fact's cell names the payload type where others name a state. */
export const PAYLOAD_EVENTS = [
  "block_actions",
  "view_submission",
  "block_suggestion",
  "view_closed",
] as const;
export type PayloadEvent = (typeof PAYLOAD_EVENTS)[number];

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The Builder's Desktop and Mobile message previews; App Home and modals preview at desktop only. */
export const WIDTHS = ["desktop", "mobile"] as const;
export type Width = (typeof WIDTHS)[number];

/**
 * - `styles`: box model, colour, type, border, radius, shadow, cursor.
 * - `motion`: transition and animation durations, easings and delays.
 * - `behaviour`: keyboard, pointer, focus movement, scrolling, tooltip timing.
 * - `payload`: what Slack sends and the state values it carries.
 */
export const FACT_KINDS = ["styles", "motion", "behaviour", "payload"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export type Surface = "message" | "modal" | "home";

/**
 * Which states a fact kind is about. Styles differ in every state. Motion is declared at rest (the
 * transitions a hover or focus runs) and when something opens, toggles or loads. Behaviour is what
 * happens on input, plus the at-rest facts (tab stop, cursor, role). Payload facts are per event.
 */
export const FACT_STATES: Record<Exclude<FactKind, "payload">, readonly StateId[]> = {
  styles: STATES,
  motion: ["default", "open", "toggled", "loading"],
  behaviour: [
    "default",
    "hover",
    "focus-visible",
    "pressed",
    "open",
    "toggled",
    "selected",
    "validation-error",
    "loading",
    "many-items",
    "scrolled-end",
  ],
};

/**
 * States about horizontal overflow: they differ by width for behaviour too (whether the block
 * scrolls sideways, and from what minimum width), so their behaviour cells get a width.
 */
export const OVERFLOW_STATES: readonly StateId[] = ["full-content", "scrolled-end"];

/**
 * Whether a fact kind varies by theme and width. Only styles do: a transition's curve, a key's
 * effect and a payload are the same in dark mode and on a narrow preview. Cells that don't vary
 * use `any`.
 */
export const VARIES: Record<FactKind, { theme: boolean; width: boolean }> = {
  styles: { theme: true, width: true },
  motion: { theme: false, width: false },
  behaviour: { theme: false, width: false },
  payload: { theme: false, width: false },
};

/**
 * How much a state matters to someone looking at a rendering: what everyone sees first, then
 * what every pointer and keyboard user sees, then the rarer variants. Used to order capture work.
 */
export const STATE_WEIGHT: Record<StateId | PayloadEvent, number> = {
  default: 5,
  hover: 4,
  open: 4,
  "focus-visible": 3,
  selected: 3,
  empty: 3,
  "initial-value": 3,
  "validation-error": 3,
  pressed: 2,
  toggled: 2,
  mixed: 2,
  "full-content": 3,
  "scrolled-end": 3,
  "long-content": 2,
  "many-items": 2,
  disabled: 1,
  // In scope at high priority (maintainer decision): a button's spinner, options loading.
  loading: 4,
  block_actions: 4,
  view_submission: 4,
  block_suggestion: 2,
  view_closed: 1,
};
